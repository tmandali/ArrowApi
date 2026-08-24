import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Tuple

from pydantic_ai import Agent, DeferredToolRequests, Tool
from pydantic_ai.capabilities import WebFetch
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    ToolReturnPart,
    UserPromptPart,
    FunctionToolCallEvent,
)
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings


class AiProviderFactory:
    """
    Pydantic AI tabanlı Model-Agnostik Çoklu Sağlayıcı Fabrikası.
    Tüm sağlayıcılar tek Agent API'si üzerinden çalışır; akış (streaming), düşünme zinciri
    (thinking) ve araç çağrıları (tool calling) sağlayıcıdan bağımsız standartlaşmıştır.

    Desteklenen Sağlayıcılar:
    1. Ollama (Yerel Gemma 4, Llama 3, Qwen 2.5) — OpenAI uyumlu /v1 ucu üzerinden
    2. Microsoft AI Foundry / Azure OpenAI (GPT-4o, GPT-4o-mini, Phi-4)
    3. Google AI (Gemini 2.5 Flash, Gemini 2.5 Pro)
    4. OpenAI / OpenAI-Compatible (vLLM, LMStudio, Groq)

    Araç Yürütme Modeli: Frontend'deki toolRegistry dinamik olarak JSON Schema ile kayıt olur.
    Python tarafı araçları SADECE protokol olarak taşır (requires_approval => deferred);
    gerçek yürütme frontend'e aktarılır ve sonuç ayrı bir turda LLM'e beslenir.
    """

    DEFAULT_CONFIG = {
        "provider": "ollama",
        "model": "gemma4:12b-mlx",
        "endpoint": "http://127.0.0.1:11434",
        "apiKey": "",
        # Web fetch yeteneği (sidecar içinde yerel markdownify ile çalışır;
        # SSRF koruması kütüphanede gömülüdür — özel IP/metadata uçları engelli).
        "webFetch": True,
        # Opsiyonel domain filtreleri: ["docs.example.com", ...] (None = tüm herkes alanı)
        "webFetchAllowedDomains": None,
        "webFetchBlockedDomains": None,
    }

    WEB_FETCH_TOOL_NAME = "web_fetch"

    BASE_MODEL_SETTINGS = {
        "temperature": 0.1,
        "top_p": 0.9,
        # Düşünme üreten modellerde zincir + nihai cevap aynı bütçeyi paylaşır;
        # düşük limit düşünceye takılıp content'i boş bırakır.
        "max_tokens": 1024,
    }

    @classmethod
    def _build_model_settings(cls, cfg: Dict[str, Any]) -> ModelSettings:
        """
        Birleşik pydantic-ai 'thinking' ayarını (Thinking capability karşılığı) uygular.
        Kütüphane seviyeyi sağlayıcıya göre kendisi çevirir (OpenAI reasoning_effort,
        Google thinking_config vb.).

        Yerel Ollama (/v1) seviye parametresini desteklemez; gönderildiğinde üretim
        takılabildiği için Ollama'da bu ayar tamamen pass geçilir.
        """
        settings = dict(cls.BASE_MODEL_SETTINGS)
        provider = (cfg.get("provider") or "ollama").lower()
        if provider in ("openai", "azure", "microsoft_foundry", "google", "gemini"):
            level = str(cfg.get("thinkingLevel") or "").strip().lower()
            if level in ("off", "none", "false", "disabled"):
                settings["thinking"] = False
            elif level in ("minimal", "low", "medium", "high", "xhigh"):
                settings["thinking"] = level
        return ModelSettings(**settings)

    @staticmethod
    def _placeholder_tool(**kwargs):
        # Gerçek yürütme frontend toolRegistry'de yapılır; bu fonksiyon asla çalışmamalı
        # (araçlar external işaretlidir, araç çağrısında run durur).
        return {"status": "forwarded_to_client"}

    @staticmethod
    def _externalize(_ctx, tool_def):
        # Araç yürütmesi agent process'inin DIŞINDA (frontend) yapılır:
        # kind='external' => pydantic-ai aracı çalıştırmaz, run DeferredToolRequests ile durur.
        tool_def.kind = "external"
        return tool_def

    @classmethod
    def _build_tools(cls, tool_schemas) -> List[Tool]:
        tools: List[Tool] = []
        for t in tool_schemas or []:
            func = t.get("function") if isinstance(t, dict) and isinstance(t.get("function"), dict) else t
            if not isinstance(func, dict) or not func.get("name"):
                continue
            try:
                tool = Tool.from_schema(
                    cls._placeholder_tool,
                    name=func["name"],
                    description=func.get("description") or "",
                    json_schema=func.get("parameters") or {"type": "object", "properties": {}},
                )
                # Araç çağrısı geldiğinde run'i durdur ve çağrıyı frontend'e devret
                tool.prepare = cls._externalize
                tools.append(tool)
            except Exception:
                continue
        return tools

    @staticmethod
    def _build_model(cfg: Dict[str, Any]):
        provider = (cfg.get("provider") or "ollama").lower()
        model_name = cfg.get("model") or ""

        if provider in ("google", "gemini"):
            return GoogleModel(
                model_name or "gemini-2.5-flash",
                provider=GoogleProvider(api_key=cfg.get("apiKey") or ""),
            )

        if provider in ("azure", "microsoft_foundry"):
            # Azure anahtarları 'api-key' header'ı ile gider (eski davranış korunur)
            key = cfg.get("apiKey") or ""
            endpoint = (cfg.get("endpoint") or "").rstrip("/") or None
            try:
                import httpx
                async_client = httpx.AsyncClient(headers={"api-key": key}, timeout=45)
                provider_obj = OpenAIProvider(base_url=endpoint, api_key=key or "api-key-not-set", http_client=async_client)
            except Exception:
                provider_obj = OpenAIProvider(base_url=endpoint, api_key=key or "api-key-not-set")
            return OpenAIChatModel(model_name or "gpt-4o-mini", provider=provider_obj)

        if provider == "openai":
            provider_obj = OpenAIProvider(
                base_url=(cfg.get("endpoint") or "").rstrip("/") or None,
                api_key=cfg.get("apiKey") or "",
            )
            return OpenAIChatModel(model_name or "gpt-4o-mini", provider=provider_obj)

        # Varsayılan: Yerel Ollama (OpenAI uyumlu /v1 ucu)
        endpoint = (cfg.get("endpoint") or "http://127.0.0.1:11434").rstrip("/")
        return OllamaModel(
            model_name or "gemma4:12b-mlx",
            provider=OllamaProvider(base_url=f"{endpoint}/v1"),
        )

    @staticmethod
    def _convert_history(history: List[Dict[str, Any]]) -> List[Any]:
        """
        Eski [role/content] konuşma geçmişini pydantic-ai ModelMessage formatına çevirir.
        "TOOL_RESULT (...):" ile başlayan kullanıcı mesajları, önceki asistan araç çağrısının
        sonucu olarak ToolReturnPart'a dönüştürülür (pydantic-ai yanıtlanmamış çağrı kabul etmez).
        """
        msgs: List[Any] = []
        i = 0
        while i < len(history or []):
            m = history[i]
            role = m.get("role")
            content = m.get("content") or ""

            if role == "user":
                msgs.append(ModelRequest(parts=[UserPromptPart(content=content)]))
            elif role == "assistant":
                parts: List[Any] = []
                call_ids: List[Tuple[str, str]] = []
                thinking = (m.get("thinking") or "").strip()
                if thinking:
                    parts.append(ThinkingPart(content=thinking))
                if content:
                    parts.append(TextPart(content=content))
                for tc in m.get("tool_calls") or []:
                    func = tc.get("function", {}) if isinstance(tc, dict) else {}
                    if not func.get("name"):
                        continue
                    args = func.get("arguments")
                    if not isinstance(args, (dict, str)):
                        args = {}
                    call_part = ToolCallPart(tool_name=func["name"], args=args)
                    call_ids.append((call_part.tool_call_id, func["name"]))
                    parts.append(call_part)
                msgs.append(ModelResponse(parts=parts or [TextPart(content="")]))

                # Ardından gelen TOOL_RESULT kullanıcı mesajını araç sonucuna çevir
                nxt = history[i + 1] if i + 1 < len(history) else None
                if (
                    call_ids
                    and isinstance(nxt, dict)
                    and nxt.get("role") == "user"
                    and str(nxt.get("content") or "").startswith("TOOL_RESULT")
                ):
                    txt = str(nxt.get("content") or "")
                    first_line, _, remainder = txt.partition("\n")
                    ret_parts: List[Any] = [
                        ToolReturnPart(tool_name=name, content=first_line, tool_call_id=cid)
                        for cid, name in call_ids
                    ]
                    if remainder.strip():
                        ret_parts.append(UserPromptPart(content=remainder.strip()))
                    msgs.append(ModelRequest(parts=ret_parts))
                    i += 2
                    continue

            i += 1
        return msgs

    @staticmethod
    async def _run_agent(agent: Agent, prompt: str, history, on_delta, external_tool_names=None, on_internal_tool=None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        external_tool_names = external_tool_names or set()
        think_chunks: List[str] = []
        text_chunks: List[str] = []
        pending_calls: Dict[int, Dict[str, Any]] = {}
        saw_external_call = False

        async with agent.iter(prompt, message_history=history or None) as run:
            async for node in run:
                # Sidecar-içi yetenek yürütmesi (örn. web_fetch) → frontend'e bildir
                if Agent.is_call_tools_node(node):
                    if callable(on_internal_tool):
                        async with node.stream(run.ctx) as tool_stream:
                            async for ev in tool_stream:
                                if isinstance(ev, FunctionToolCallEvent) and ev.part.tool_name not in external_tool_names:
                                    try:
                                        args = ev.part.args_as_dict()
                                    except Exception:
                                        args = {}
                                    on_internal_tool(ev.part.tool_name, args)
                    continue
                if not Agent.is_model_request_node(node):
                    continue
                async with node.stream(run.ctx) as stream:
                    async for ev in stream:
                        if isinstance(ev, PartStartEvent):
                            part = ev.part
                            if isinstance(part, ToolCallPart):
                                # Yalnızca FRONTEND araçları kısa devreye sokulur;
                                # sidecar-içi yetenekler (web_fetch vb.) pydantic-ai
                                # tarafından grafik içinde çalıştırılıp tur devam eder.
                                if part.tool_name in external_tool_names:
                                    saw_external_call = True
                                raw_args = part.args if isinstance(part.args, str) else json.dumps(part.args or {}, ensure_ascii=False)
                                pending_calls[ev.index] = {"function": {"name": part.tool_name, "arguments_raw": raw_args or ""}}
                            elif isinstance(part, ThinkingPart) and part.content:
                                think_chunks.append(part.content)
                            elif isinstance(part, TextPart) and part.content:
                                text_chunks.append(part.content)
                        elif isinstance(ev, PartDeltaEvent):
                            delta = ev.delta
                            if isinstance(delta, ThinkingPartDelta) and delta.content_delta:
                                think_chunks.append(delta.content_delta)
                                if callable(on_delta):
                                    on_delta("thinking", delta.content_delta)
                            elif isinstance(delta, TextPartDelta) and delta.content_delta:
                                text_chunks.append(delta.content_delta)
                                if callable(on_delta):
                                    on_delta("content", delta.content_delta)
                            elif isinstance(delta, ToolCallPartDelta) and delta.args_delta:
                                entry = pending_calls.get(ev.index)
                                if entry is not None:
                                    entry["function"]["arguments_raw"] += delta.args_delta

                if saw_external_call:
                    # Kısa devre: pydantic-ai 2.33'te streamed istek + deferred araç çağrısı
                    # CallToolsNode'da çözülemiyor. Araç çağrısını akıştan kendimiz yakaladık;
                    # grafiği ilerletmeden durup çağrıları frontend'e aktarıyoruz.
                    break

            result = None if saw_external_call else run.result

        tool_calls: List[Dict[str, Any]] = []
        for entry in pending_calls.values():
            # Karışık turda (internal + external paralel çağrı) yalnızca frontend
            # araçları devredilir; sidecar-içi araçlar buraya düşmemeli.
            if entry["function"]["name"] not in external_tool_names:
                continue
            raw = entry["function"].pop("arguments_raw") or "{}"
            try:
                args = json.loads(raw)
            except Exception:
                args = {}
            entry["function"]["arguments"] = args if isinstance(args, dict) else {}
            tool_calls.append(entry)

        if result is not None:
            usage = result.usage
            messages_after = result.all_messages()
            response_msg = next((m for m in reversed(messages_after) if isinstance(m, ModelResponse)), None)
            resp_parts = list(response_msg.parts) if response_msg is not None else []
            content = "".join(p.content for p in resp_parts if isinstance(p, TextPart)).strip()
            thinking_final = "".join(p.content for p in resp_parts if isinstance(p, ThinkingPart)).strip()
            for p in resp_parts:
                if isinstance(p, ToolCallPart):
                    if p.tool_name not in external_tool_names:
                        continue
                    try:
                        p_args = p.args_as_dict()
                    except Exception:
                        p_args = {}
                    tool_calls.append({"function": {"name": p.tool_name, "arguments": p_args}})
        else:
            usage = None
            content = "".join(text_chunks).strip()
            thinking_final = ""

        message_data: Dict[str, Any] = {"role": "assistant", "content": content}
        thinking = thinking_final or "".join(think_chunks).strip()
        if thinking:
            message_data["thinking"] = thinking
        if tool_calls:
            message_data["tool_calls"] = tool_calls

        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        total_tokens = getattr(usage, "total_tokens", 0) or (input_tokens + output_tokens)
        telemetry = {
            "promptTokens": input_tokens,
            "completionTokens": output_tokens,
            "totalTokens": total_tokens,
        }
        return message_data, telemetry

    @classmethod
    def _translate_error(cls, err: Exception, cfg: Dict[str, Any]) -> str:
        provider = (cfg.get("provider") or "ollama").lower()
        model = cfg.get("model") or ""
        err_text = str(err)
        status = getattr(err, "status_code", None)

        if status == 403 or "403" in err_text or "policy" in err_text.lower():
            return (
                f"⚠️ **AI Sağlayıcı Bağlantı Hatası ({provider.upper()} - {model}):**\n"
                f"Sunucuya erişim reddedildi (`HTTP 403 Forbidden`). Lütfen bulut portalınızdan ağ ve IP erişim izinlerinizi kontrol edin."
            )
        if provider == "ollama":
            endpoint = cfg.get("endpoint") or "http://127.0.0.1:11434"
            return f"Ollama servisine bağlanılamadı ({endpoint}): {err_text}"
        return f"Sağlayıcı çağrısı başarısız ({provider} - {model}): {err_text}"

    @classmethod
    def engine_label(cls, cfg: Dict[str, Any]) -> Tuple[str, str]:
        """(engine, model) telemetri etiketi — eski davranışla aynı biçimde."""
        provider = (cfg.get("provider") or "ollama").lower()
        model = cfg.get("model") or ""
        if provider in ("google", "gemini"):
            return f"Pydantic AI / Google Gemini ({model or 'gemini-2.5-flash'})", model
        if provider == "azure" or provider == "microsoft_foundry":
            return f"Pydantic AI / Microsoft AI Foundry ({model or 'gpt-4o-mini'})", model
        if provider == "openai":
            return f"Pydantic AI / OpenAI ({model or 'gpt-4o-mini'})", model
        return f"Pydantic AI / Ollama ({model or 'gemma4:12b-mlx'})", model

    @classmethod
    def _build_capabilities(cls, cfg: Dict[str, Any]):
        """
        Sidecar-içinde yürütülen (frontend'e devredilmeyen) yetenekler.
        WebFetch: native=False → tüm sağlayıcılarda deterministik yerel markdownify fetch.
        Domain filtreleri config'ten gelir; SSRF koruması kütüphanede gömülüdür.
        """
        if cfg.get("webFetch") is False:
            return None
        allowed = cfg.get("webFetchAllowedDomains") or None
        blocked = cfg.get("webFetchBlockedDomains") or None
        return [
            WebFetch(
                native=False,
                local=True,
                allowed_domains=allowed,
                blocked_domains=blocked,
            )
        ]

    @staticmethod
    def _external_tool_names(tool_schemas) -> set:
        """Frontend toolRegistry'den gelen (deferred/devredilen) araç adları."""
        names = set()
        for t in tool_schemas or []:
            func = t.get("function") if isinstance(t, dict) and isinstance(t.get("function"), dict) else t
            if isinstance(func, dict) and func.get("name"):
                names.add(func["name"])
        return names

    @classmethod
    def execute_chat(
        cls,
        conversation_history: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
        on_delta: Optional[Any] = None,
        on_internal_tool: Optional[Any] = None
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Aktif yapılandırmaya göre ilgili sağlayıcıyı çalıştırır.
        on_delta(kind, text) verildiyse düşünce/metin parçaları üretim sırasında canlı iletilir.
        on_internal_tool(name, args) verildiyse sidecar-içinde yürütülen yetenekler
        (örn. web_fetch) çağrı anında bildirilir.

        Dönüş: ({"role":"assistant","content":..., "thinking":..., "tool_calls":[...]}, telemetry)
        """
        cfg = config or cls.DEFAULT_CONFIG
        started = time.perf_counter()

        rest = list(conversation_history or [])
        system_prompt = ""
        if rest and rest[0].get("role") == "system":
            system_prompt = rest[0].get("content") or ""
            rest = rest[1:]

        prompt: Optional[str] = None
        if rest and rest[-1].get("role") == "user":
            last_content = str(rest[-1].get("content") or "")
            # TOOL_RESULT mesajı yeni prompt değil; önceki araç çağrısının sonucudur
            # (geçmişte kalmalı ki ToolReturnPart'a dönüştürülsün).
            if not last_content.startswith("TOOL_RESULT"):
                prompt = rest[-1].get("content")
                rest = rest[:-1]

        agent = Agent(
            cls._build_model(cfg),
            instructions=system_prompt or None,
            tools=cls._build_tools(tools),
            capabilities=cls._build_capabilities(cfg),
            model_settings=cls._build_model_settings(cfg),
            # External (frontend'te yürütülen) araçlar için deferred output tipi zorunlu
            output_type=[str, DeferredToolRequests],
            # retries: sidecar-içi araçların (web_fetch) ağ hatalarını model'e
            # RetryPromptPart olarak beslemesi için; external araçlar yerelde hiç
            # çalıştırılmadığından (deferred) bu artış onları etkilemez.
            retries=2,
            end_strategy="early",
        )

        try:
            message_data, telemetry = asyncio.run(
                cls._run_agent(
                    agent,
                    prompt,
                    cls._convert_history(rest),
                    on_delta,
                    external_tool_names=cls._external_tool_names(tools),
                    on_internal_tool=on_internal_tool,
                )
            )
        except Exception as err:
            raise RuntimeError(cls._translate_error(err, cfg)) from err

        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        engine, _ = cls.engine_label(cfg)
        telemetry.update({
            "engine": engine,
            "model": cfg.get("model") or "",
            "durationMs": elapsed_ms,
            "toolsCount": len(tools or []),
        })
        return message_data, telemetry

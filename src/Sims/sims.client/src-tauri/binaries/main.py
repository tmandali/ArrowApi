#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sims AI Agent Sidecar — Ollama (gemma4:12b-mlx) Tool Calling & MCP Bridge
"""

import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

OLLAMA_API_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "gemma4:12b-mlx"

conversation_history = []
registered_tools = []

def send_json(data):
    """stdout kanalına tek satır JSON basar ve tamponu hemen boşaltır (flush)."""
    json_line = json.dumps(data, ensure_ascii=False)
    sys.stdout.write(json_line + "\n")
    sys.stdout.flush()

def get_system_prompt():
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    last_week = today - timedelta(days=7)
    today_str = today.strftime("%Y-%m-%d (%A)")
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    last_week_str = last_week.strftime("%Y-%m-%d")
    today_iso = today.strftime("%Y-%m-%d")
    return (
        f"You are Yula, the intelligent AI assistant of the ERP system.\n"
        f"Today's date: {today_str}.\n"
        f"Yesterday: {yesterday_str}.\n"
        f"7 days ago: {last_week_str}.\n\n"
        f"YOUR TASKS:\n"
        f"1. Analyze user requests in natural language and invoke registered functions (e.g., 'filter_stock_balance', 'filter_stock_analytics').\n"
        f"2. DATE RANGE RULES:\n"
        f"   - When user asks for 'last week', 'past 7 days', or 'hafta', put a DATE RANGE 'YYYY-MM-DD..YYYY-MM-DD' into 'kayitTarihi' (Example: '{last_week_str}..{today_iso}'). Never put a single day!\n"
        f"   - When user asks for 'this month', put 'YYYY-MM-01..YYYY-MM-DD'.\n"
        f"   - When user asks for a single day ('yesterday', 'today', 'dün'), put a single date (e.g. '{yesterday_str}').\n"
        f"3. STATUS RULES:\n"
        f"   - When user mentions 'cancelled' or 'iptal', add ['IPTAL'] to 'durum'.\n"
        f"   - When user mentions 'active' or 'aktif', add ['AKTIF'] to 'durum'.\n"
        f"4. Direct the user to 'Please review the criteria on the card below and click **Run** to generate your report, or click **Open on page** to view full screen.'\n"
        f"5. Always respond politely, professionally, and in English or the user's language."
    )

def convert_to_ollama_tools(tools_list):
    ollama_tools = []
    for tool in tools_list:
        if isinstance(tool, dict):
            ollama_tools.append({
                "type": "function",
                "function": {
                    "name": tool.get("name"),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("parameters", {"type": "object", "properties": {}})
                }
            })
    
    if not ollama_tools:
        ollama_tools.append({
            "type": "function",
            "function": {
                "name": "filter_stock_balance",
                "description": "Fills criteria for Stock Balance report and renders conversation card. Required field: kayitTarihi.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "kayitTarihi": {
                            "type": "string",
                            "description": "Required date (e.g. '2026-08-18' or '2026-08-01..2026-08-19')"
                        },
                        "durum": {
                            "type": "array",
                            "description": "Document Status (AKTIF, PASIF, BEKLEMEDE, IPTAL)"
                        },
                        "tutarMiktar": {
                            "type": "number",
                            "description": "Amount threshold"
                        }
                    },
                    "required": ["kayitTarihi"]
                }
            }
        })
    return ollama_tools

def fallback_rule_parser(prompt, tools_list=None):
    prompt_lower = prompt.lower()
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    last_week = today - timedelta(days=7)
    
    if "geçen hafta" in prompt_lower or "last week" in prompt_lower or "son 7 gün" in prompt_lower or "hafta" in prompt_lower:
        target_date = f"{last_week.strftime('%Y-%m-%d')}..{today.strftime('%Y-%m-%d')}"
    elif "dün" in prompt_lower or "yesterday" in prompt_lower:
        target_date = yesterday.strftime("%Y-%m-%d")
    elif "bugün" in prompt_lower or "today" in prompt_lower:
        target_date = today.strftime("%Y-%m-%d")
    else:
        target_date = yesterday.strftime("%Y-%m-%d")

    matched_tool = None
    if tools_list:
        for tool in tools_list:
            if not isinstance(tool, dict):
                continue
            name = tool.get("name", "").lower()
            desc = tool.get("description", "").lower()
            words = [w for w in prompt_lower.split() if len(w) > 3]
            if any(w in name or w in desc for w in words) or ("balance" in name and any(w in prompt_lower for w in ["bakiye", "stok", "stock", "iptal", "cancel", "aktif", "tutar", "göster", "hazırla"])):
                matched_tool = tool
                break

    tool_name = matched_tool.get("name") if matched_tool else "filter_stock_balance"
    args = {}

    if matched_tool and "parameters" in matched_tool:
        props = matched_tool.get("parameters", {}).get("properties", {})
        for prop_name, prop_def in props.items():
            if prop_name in ["kayitTarihi", "date", "date_range"]:
                args[prop_name] = target_date
            elif prop_name == "durum":
                enums = prop_def.get("enum", [])
                if "iptal" in prompt_lower or "cancel" in prompt_lower:
                    args["durum"] = ["IPTAL"]
                elif "aktif" in prompt_lower or "active" in prompt_lower:
                    args["durum"] = ["AKTIF"]
            elif prop_name in ["fromDate", "toDate"]:
                if prop_name == "fromDate":
                    args["fromDate"] = (today - timedelta(days=30)).strftime("%Y-%m-%d")
                elif prop_name == "toDate":
                    args["toDate"] = today.strftime("%Y-%m-%d")
    
    if not args:
        args = {"kayitTarihi": target_date}
        if "iptal" in prompt_lower or "cancel" in prompt_lower:
            args["durum"] = ["IPTAL"]
        elif "aktif" in prompt_lower or "active" in prompt_lower:
            args["durum"] = ["AKTIF"]

    msg = "Criteria derived from schema. Please review the criteria on the card below and click **Run** or **Open on page**."
    return {
        "tool": tool_name,
        "args": args,
        "message": msg
    }

def call_ollama(messages, tools, model=DEFAULT_MODEL):
    payload = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }
    
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_API_URL,
        data=data_bytes,
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status == 200:
            return json.loads(resp.read().decode("utf-8"))
        else:
            raise RuntimeError(f"Ollama HTTP {resp.status}")

def handle_user_task(prompt_text):
    global conversation_history, registered_tools
    
    if not conversation_history:
        conversation_history.append({
            "role": "system",
            "content": get_system_prompt()
        })
        
    conversation_history.append({
        "role": "user",
        "content": prompt_text
    })
    
    tools = convert_to_ollama_tools(registered_tools)
    
    try:
        response = call_ollama(conversation_history, tools, DEFAULT_MODEL)
        message_data = response.get("message", {})
        
        conversation_history.append(message_data)
        
        tool_calls = message_data.get("tool_calls", [])
        if tool_calls:
            for tc in tool_calls:
                func_obj = tc.get("function", {})
                tool_name = func_obj.get("name")
                args = func_obj.get("arguments", {})
                
                send_json({
                    "type": "tool_call",
                    "tool": tool_name,
                    "arguments": args
                })
        
        text_content = message_data.get("content", "").strip()
        if text_content:
            send_json({
                "type": "message",
                "content": text_content
            })
        elif not tool_calls:
            send_json({
                "type": "message",
                "content": "Your command has been processed."
            })
            
    except Exception as e:
        send_json({
            "type": "message",
            "content": f"⚡ **Rule Engine Mode:** Processed based on registered report criteria."
        })
        fallback = fallback_rule_parser(prompt_text, registered_tools)
        send_json({
            "type": "tool_call",
            "tool": fallback["tool"],
            "arguments": fallback["args"],
            "is_fallback": True
        })
        send_json({
            "type": "message",
            "content": fallback["message"]
        })

def handle_tool_result(tool_name, result_data):
    pass

def main():
    global registered_tools
    send_json({
        "type": "status",
        "status": "ready",
        "message": f"Yula AI Sidecar (Ollama: {DEFAULT_MODEL}) aktif ve dinliyor."
    })
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            payload = json.loads(line)
            action = payload.get("action")
            prompt = payload.get("prompt", "")
            
            if action == "register_tools":
                registered_tools = payload.get("tools", [])
                tool_names = [t.get("name") for t in registered_tools]
                send_json({
                    "type": "status",
                    "status": "tools_registered",
                    "message": f"{len(registered_tools)} adet araç başarıyla bağlandı: {", ".join(tool_names)}"
                })
                
            elif action == "tool_result":
                tool_name = payload.get("tool")
                result_data = payload.get("result")
                handle_tool_result(tool_name, result_data)
                
            elif action == "task" or prompt:
                handle_user_task(prompt)
                
            elif action == "reset":
                conversation_history = [{
                    "role": "system",
                    "content": get_system_prompt()
                }]
                send_json({
                    "type": "status",
                    "status": "conversation_reset",
                    "message": "Konuşma geçmişi sıfırlandı."
                })
                
            elif action == "ping":
                send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
                
            else:
                send_json({
                    "type": "error",
                    "message": f"Bilinmeyen eylem: {action}"
                })
                
        except json.JSONDecodeError as e:
            send_json({
                "type": "error",
                "message": f"Geçersiz JSON formatı: {str(e)}"
            })
        except Exception as e:
            send_json({
                "type": "error",
                "message": f"İşlem hatası: {str(e)}"
            })

if __name__ == "__main__":
    main()

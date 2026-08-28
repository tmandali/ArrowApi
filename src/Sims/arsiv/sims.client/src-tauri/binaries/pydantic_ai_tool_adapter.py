from typing import Dict, Any, List, Tuple
from schema_guard import SchemaGuard

class PydanticAiToolAdapter:
    """
    JSON Schema araç tanımlarını (tool definitions) Pydantic AI ve LLM sağlayıcılarının
    function calling formatına dönüştürür ve dönen argümanları SchemaGuard ile doğrular.
    """

    @staticmethod
    def to_function_tools(registered_tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Kayıtlı dinamik şemaları Ollama & OpenAI uyumlu tool formatına dönüştürür."""
        tools_list = []
        for tool in registered_tools:
            if isinstance(tool, dict):
                tools_list.append({
                    "type": "function",
                    "function": {
                        "name": tool.get("name"),
                        "description": tool.get("description", ""),
                        "parameters": tool.get("parameters", {"type": "object", "properties": {}})
                    }
                })
        return tools_list

    @staticmethod
    def validate_tool_call(
        tool_name: str,
        raw_args: Dict[str, Any],
        registered_tools: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, Any], List[str], List[str]]:
        """
        LLM tarafından üretilen tool çağrısını şemaya göre valide ve sanitize eder.
        Dönüş: (sanitized_args, rejected_reasons, guard_notes)
        """
        matched_tool_def = next((t for t in registered_tools if t.get("name") == tool_name), {})
        return SchemaGuard.validate_and_sanitize(matched_tool_def, raw_args)

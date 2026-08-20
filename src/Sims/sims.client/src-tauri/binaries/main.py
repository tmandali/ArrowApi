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
    last_30_days = today - timedelta(days=30)
    first_of_month = today.replace(day=1)
    first_of_year = today.replace(month=1, day=1)
    
    today_str = today.strftime("%Y-%m-%d (%A)")
    today_iso = today.strftime("%Y-%m-%d")
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    last_week_str = last_week.strftime("%Y-%m-%d")
    last_30_str = last_30_days.strftime("%Y-%m-%d")
    month_start_str = first_of_month.strftime("%Y-%m-%d")
    year_start_str = first_of_year.strftime("%Y-%m-%d")

    return (
        f"You are Yula, the intelligent AI assistant of the ERP system.\n"
        f"Today's date: {today_str}.\n"
        f"Reference Dates:\n"
        f"- Today: {today_iso}\n"
        f"- Yesterday: {yesterday_str}\n"
        f"- 7 days ago: {last_week_str}\n"
        f"- 30 days ago: {last_30_str}\n"
        f"- Month start: {month_start_str}\n"
        f"- Year start: {year_start_str}\n\n"
        f"YOUR TASKS & TOOL SELECTION RULES:\n"
        f"1. When user asks for 'Stock Analytics' or 'analitik' or 'trend' or 'maliyet' or 'kar/zarar':\n"
        f"   - MUST invoke 'filter_stock_analytics'.\n"
        f"   - Set 'fromDate' and 'toDate' as individual 'YYYY-MM-DD' strings.\n"
        f"     * 'Son 30 gün' / 'Last 30 days': fromDate='{last_30_str}', toDate='{today_iso}'\n"
        f"     * 'Son 7 gün' / 'Last week': fromDate='{last_week_str}', toDate='{today_iso}'\n"
        f"     * 'Bu ay' / 'This month': fromDate='{month_start_str}', toDate='{today_iso}'\n"
        f"     * 'Bu yıl' / 'This year': fromDate='{year_start_str}', toDate='{today_iso}'\n"
        f"   - Set 'currency' (e.g. 'try', 'usd', 'inr') if mentioned by user (default is 'try').\n"
        f"2. When user asks for 'Stock Balance' or 'stok bakiye' or 'kalan stok' or 'mevcut stok':\n"
        f"   - MUST invoke 'filter_stock_balance'.\n"
        f"   - Set 'kayitTarihi' as 'YYYY-MM-DD..YYYY-MM-DD' for date ranges (e.g. '{last_30_str}..{today_iso}' for 30 days, '{last_week_str}..{today_iso}' for 7 days).\n"
        f"   - Set 'kayitTarihi' as single 'YYYY-MM-DD' (e.g. '{yesterday_str}') for single day queries ('dün', 'bugün').\n"
        f"   - When user mentions 'iptal' or 'cancelled', set durum=['IPTAL']. When 'aktif' or 'active', set durum=['AKTIF'].\n"
        f"3. Direct the user with: 'Please review the criteria on the card below and click **Run** to generate your report, or click **Open on page** to view full screen.'\n"
        f"4. Always respond politely, professionally, and in Turkish or the user's language."
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
                "name": "filter_stock_analytics",
                "description": "Fills criteria for Stock Analytics report. Fields: fromDate, toDate, currency, fiscalYear.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "fromDate": {"type": "string", "description": "Start date (YYYY-MM-DD)"},
                        "toDate": {"type": "string", "description": "End date (YYYY-MM-DD)"},
                        "currency": {"type": "string", "enum": ["try", "usd", "inr"]}
                    }
                }
            }
        })
        ollama_tools.append({
            "type": "function",
            "function": {
                "name": "filter_stock_balance",
                "description": "Fills criteria for Stock Balance report. Fields: kayitTarihi, durum, tutarMiktar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "kayitTarihi": {"type": "string", "description": "Date or date range (YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD)"},
                        "durum": {"type": "array", "description": "Document Status (AKTIF, PASIF, BEKLEMEDE, IPTAL)"},
                        "tutarMiktar": {"type": "number"}
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
    last_30_days = today - timedelta(days=30)
    first_of_month = today.replace(day=1)
    first_of_year = today.replace(month=1, day=1)

    today_iso = today.strftime("%Y-%m-%d")
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    last_week_str = last_week.strftime("%Y-%m-%d")
    last_30_str = last_30_days.strftime("%Y-%m-%d")
    month_start_str = first_of_month.strftime("%Y-%m-%d")
    year_start_str = first_of_year.strftime("%Y-%m-%d")

    # 1. Date Range Resolution
    if any(k in prompt_lower for k in ["30 gün", "30 gun", "last 30", "1 ay", "bir ay", "aylık", "aylik"]):
        start_date = last_30_str
        end_date = today_iso
        range_date = f"{last_30_str}..{today_iso}"
    elif any(k in prompt_lower for k in ["7 gün", "7 gun", "hafta", "last week", "son 7"]):
        start_date = last_week_str
        end_date = today_iso
        range_date = f"{last_week_str}..{today_iso}"
    elif any(k in prompt_lower for k in ["bu ay", "this month"]):
        start_date = month_start_str
        end_date = today_iso
        range_date = f"{month_start_str}..{today_iso}"
    elif any(k in prompt_lower for k in ["bu yıl", "bu yil", "this year"]):
        start_date = year_start_str
        end_date = today_iso
        range_date = f"{year_start_str}..{today_iso}"
    elif any(k in prompt_lower for k in ["dün", "dun", "yesterday"]):
        start_date = yesterday_str
        end_date = yesterday_str
        range_date = yesterday_str
    elif any(k in prompt_lower for k in ["bugün", "bugun", "today"]):
        start_date = today_iso
        end_date = today_iso
        range_date = today_iso
    else:
        # Default for analytics is 30 days, for balance is yesterday
        start_date = last_30_str
        end_date = today_iso
        range_date = f"{last_week_str}..{today_iso}"

    # 2. Tool Resolution (Analytics vs Balance)
    is_analytics = any(k in prompt_lower for k in ["analytic", "analitik", "trend", "maliyet", "gelir", "gider"])
    is_balance = any(k in prompt_lower for k in ["balance", "bakiye", "kalan", "mevcut"])

    matched_tool = None
    if tools_list:
        for tool in tools_list:
            if not isinstance(tool, dict):
                continue
            name = tool.get("name", "").lower()
            if is_analytics and "analytics" in name:
                matched_tool = tool
                break
            elif is_balance and "balance" in name:
                matched_tool = tool
                break

    if not matched_tool:
        if is_analytics:
            tool_name = "filter_stock_analytics"
        else:
            tool_name = "filter_stock_balance"
    else:
        tool_name = matched_tool.get("name")

    args = {}
    if "analytics" in tool_name:
        args["fromDate"] = start_date
        args["toDate"] = end_date
        if "usd" in prompt_lower or "dolar" in prompt_lower:
            args["currency"] = "usd"
        elif "inr" in prompt_lower or "rupi" in prompt_lower:
            args["currency"] = "inr"
        elif "try" in prompt_lower or "tl" in prompt_lower or "lira" in prompt_lower:
            args["currency"] = "try"
    else:
        args["kayitTarihi"] = range_date
        if "iptal" in prompt_lower or "cancel" in prompt_lower:
            args["durum"] = ["IPTAL"]
        elif "aktif" in prompt_lower or "active" in prompt_lower:
            args["durum"] = ["AKTIF"]

    msg = "Please review the criteria on the card below and click **Run** to generate your report, or click **Open on page** to view full screen."
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

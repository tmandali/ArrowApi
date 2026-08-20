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
        f"You are Yula, the intelligent ERP AI assistant.\n"
        f"Current Date: {today_str}.\n"
        f"Reference Dates:\n"
        f"- Today: {today_iso}\n"
        f"- Yesterday: {yesterday_str}\n"
        f"- 7 days ago: {last_week_str}\n"
        f"- 30 days ago: {last_30_str}\n"
        f"- Month start: {month_start_str}\n"
        f"- Year start: {year_start_str}\n\n"
        f"GENERIC SCHEMA-DRIVEN TOOL CALLING RULES:\n"
        f"1. You have a set of registered tools dynamically created from ERP JSON schemas.\n"
        f"2. Read the tool descriptions and parameter schemas carefully:\n"
        f"   - If a tool has separate start/end date parameters (e.g. fromDate/toDate, startDate/endDate, baslangicTarihi/bitisTarihi), pass separate YYYY-MM-DD strings for start and end.\n"
        f"   - If a tool has a single date parameter (e.g. kayitTarihi, date, tarih) and user specifies a range (e.g. last 7 days, 30 days), pass 'YYYY-MM-DD..YYYY-MM-DD'. For a single day, pass 'YYYY-MM-DD'.\n"
        f"   - For enum parameters (e.g. status, currency, document type), map user terms to the closest allowed enum value (e.g. 'iptal' -> 'IPTAL', 'aktif' -> 'AKTIF', 'dolar' -> 'usd', 'lira' -> 'try').\n"
        f"3. UNSUPPORTED CRITERIA & USER GUIDANCE:\n"
        f"   - If the user asks for a filter or dimension that does NOT exist in the selected tool's schema (e.g. 'renk', 'depo', 'şube', 'müşteri', 'kategori' when not in schema):\n"
        f"     * In your text response, politely inform the user that this report does not contain that specific filter.\n"
        f"     * Guide the user by listing the available valid criteria for this report.\n"
        f"     * Still invoke the tool with the valid parameters (or defaults) so the user gets their report card.\n"
        f"4. Direct the user with: 'Please review the criteria on the card below and click **Run** to generate your report, or click **Open on page** to view full screen.'\n"
        f"5. Always respond politely, professionally, and in Turkish if the user speaks Turkish or in the user's language."
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

    # 1. Universal Date Resolution
    is_range = True
    if any(k in prompt_lower for k in ["30 gün", "30 gun", "last 30", "1 ay", "bir ay", "aylık", "aylik"]):
        start_date, end_date = last_30_str, today_iso
    elif any(k in prompt_lower for k in ["7 gün", "7 gun", "hafta", "last week", "son 7"]):
        start_date, end_date = last_week_str, today_iso
    elif any(k in prompt_lower for k in ["bu ay", "this month"]):
        start_date, end_date = month_start_str, today_iso
    elif any(k in prompt_lower for k in ["bu yıl", "bu yil", "this year"]):
        start_date, end_date = year_start_str, today_iso
    elif any(k in prompt_lower for k in ["dün", "dun", "yesterday"]):
        start_date, end_date, is_range = yesterday_str, yesterday_str, False
    elif any(k in prompt_lower for k in ["bugün", "bugun", "today"]):
        start_date, end_date, is_range = today_iso, today_iso, False
    else:
        start_date, end_date = last_30_str, today_iso

    # 2. Dynamic Tool Matching by relevance scoring
    best_tool = None
    max_score = -1

    if tools_list:
        for tool in tools_list:
            if not isinstance(tool, dict):
                continue
            name = tool.get("name", "").lower().replace("filter_", "")
            desc = tool.get("description", "").lower()
            score = 0
            for word in name.replace("_", " ").split():
                if len(word) > 2 and word in prompt_lower:
                    score += 5
            for word in desc.split():
                if len(word) > 3 and word in prompt_lower:
                    score += 2
            if score > max_score:
                max_score = score
                best_tool = tool

    if not best_tool and tools_list:
        best_tool = tools_list[0]

    tool_name = best_tool.get("name", "filter_stock_balance") if best_tool else "filter_stock_balance"
    args = {}

    # 3. Dynamic schema-driven property extraction
    props = best_tool.get("parameters", {}).get("properties", {}) if best_tool else {}
    
    # Date fields detection
    from_key = next((k for k in props if any(p in k.lower() for p in ["from", "start", "baslangic"])), None)
    to_key = next((k for k in props if any(p in k.lower() for p in ["to", "end", "bitis"])), None)
    single_date_key = next((k for k in props if any(p in k.lower() for p in ["kayit", "date", "tarih"])), None)

    if from_key and to_key:
        args[from_key] = start_date
        args[to_key] = end_date
    elif single_date_key:
        args[single_date_key] = f"{start_date}..{end_date}" if is_range else start_date

    # Enums & Selection detection
    for prop_name, prop_def in props.items():
        if prop_name in [from_key, to_key, single_date_key]:
            continue
        enums = prop_def.get("enum", [])
        if enums:
            for opt in enums:
                opt_str = str(opt).lower()
                if opt_str in prompt_lower:
                    args[prop_name] = [opt] if prop_def.get("type") == "array" else opt
                    break
                elif opt_str == "iptal" and ("cancel" in prompt_lower or "iptal" in prompt_lower):
                    args[prop_name] = [opt] if prop_def.get("type") == "array" else opt
                elif opt_str == "aktif" and ("active" in prompt_lower or "aktif" in prompt_lower):
                    args[prop_name] = [opt] if prop_def.get("type") == "array" else opt
                elif opt_str == "try" and any(w in prompt_lower for w in ["tl", "lira", "türk lirası"]):
                    args[prop_name] = opt
                elif opt_str == "usd" and any(w in prompt_lower for w in ["dolar", "dollar"]):
                    args[prop_name] = opt

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

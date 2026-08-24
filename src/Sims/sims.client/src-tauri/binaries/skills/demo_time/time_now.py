"""Internal skill örneği: session verisi gerektirmez, agent içinde çalışır."""

import datetime

TOOL = {
    "name": "get_current_time",
    "description": "Sistemden bugünün tarih ve saatini YYYY-MM-DD HH:MM biçiminde döndürür.",
    "parameters": {"type": "object", "properties": {}, "required": []},
    "needs_session_data": False,
}


def run(**_):
    now = datetime.datetime.now()
    return {
        "datetime": now.strftime("%Y-%m-%d %H:%M"),
        "weekday": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][now.weekday()],
    }

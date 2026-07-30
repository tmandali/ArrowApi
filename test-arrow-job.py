#!/usr/bin/env python3
"""Arrow job testleri — create / SSE / request / list / cancel / retry / delete / Arrow."""

from __future__ import annotations

import json
import os
import sys
import time

try:
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import requests
except ImportError:
    print("Gerekli paketler: pip install pyarrow requests")
    sys.exit(1)

BASE_URL = os.environ.get("ARROW_API_URL", "http://localhost:5236")
ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"
JOBS_URL = f"{BASE_URL}/api/arrow/jobs/demo"

# Kurumsal proxy localhost'u 400 ile kesebiliyor
SESSION = requests.Session()
SESSION.trust_env = False
SESSION.proxies = {"http": None, "https": None}

EXPECTED_ROWS = [
    {"Id": 1, "Name": "Ali"},
    {"Id": 2, "Name": "Ayşe"},
    {"Id": 3, "Name": "Veli"},
]

QUERY_BODY = {
    "cnnName": "inmemory",
    "query": "SELECT * FROM People LIMIT @limit",
    "parameters": {"limit": 3},
    "batchSize": 1,
}


def read_arrow_table(content: bytes) -> pa.Table:
    with ipc.open_stream(content) as reader:
        return reader.read_all()


def assert_people_table(table: pa.Table, *, label: str) -> None:
    assert table.num_rows == 3, f"{label}: satır sayısı 3 olmalı, gelen {table.num_rows}"
    assert table.column_names == ["Id", "Name"], f"{label}: sütunlar uyuşmuyor"
    actual = [
        {"Id": table.column("Id")[i].as_py(), "Name": table.column("Name")[i].as_py()}
        for i in range(table.num_rows)
    ]
    assert actual == EXPECTED_ROWS, f"{label}: veri uyuşmuyor\n  beklenen: {EXPECTED_ROWS}\n  gelen: {actual}"


def parse_sse_events(response: requests.Response):
    event_name = "message"
    data_lines: list[str] = []

    for raw in response.iter_lines(decode_unicode=True):
        if raw is None:
            continue
        line = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")

        if line.startswith(":"):
            continue

        if line == "":
            if data_lines:
                yield event_name, "\n".join(data_lines)
            event_name = "message"
            data_lines = []
            continue

        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())


def absolute_url(path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    if not path_or_url.startswith("/"):
        path_or_url = "/" + path_or_url
    return f"{BASE_URL}{path_or_url}"


def job_url(status: dict) -> str:
    job_id = status["id"]
    return absolute_url(status.get("jobUrl") or status.get("JobUrl") or f"{JOBS_URL}/{job_id}")


def events_url(status: dict) -> str:
    return absolute_url(
        status.get("eventsUrl") or status.get("EventsUrl") or f"{job_url(status)}/events"
    )


def field(obj: dict, *names: str):
    for name in names:
        if name in obj and obj[name] is not None:
            return obj[name]
    return None


def create_job(body: dict | None = None) -> dict:
    payload = body if body is not None else QUERY_BODY
    print(f"POST {JOBS_URL}")
    resp = SESSION.post(JOBS_URL, json=payload, timeout=30)
    assert resp.status_code == 202, f"job create 202 bekleniyor, gelen {resp.status_code}: {resp.text}"
    status = resp.json()
    print(f"  Status: {resp.status_code}, Body: {status}")
    assert "id" in status
    assert field(status, "jobUrl", "JobUrl")
    return status


def wait_sse(status: dict, *, terminal: tuple[str, ...] = ("completed", "failed", "cancelled")) -> str:
    url = events_url(status)
    print(f"GET {url} (SSE)")
    with SESSION.get(url, stream=True, timeout=60) as sse:
        sse.raise_for_status()
        deadline = time.time() + 30
        for event_name, data in parse_sse_events(sse):
            payload = json.loads(data)
            print(
                f"  event={event_name} status={payload.get('status')} "
                f"batches={payload.get('batchCount')} rows={payload.get('totalRows')} "
                f"message={payload.get('message')!r}"
            )
            if event_name in terminal:
                return event_name
            if event_name == "progress":
                assert payload.get("batchCount", 0) > 0
            if time.time() > deadline:
                raise TimeoutError("SSE terminal event zaman asimi")
    raise AssertionError(f"SSE terminal event gelmedi: {terminal}")


def test_happy_path() -> dict:
    status = create_job()
    event = wait_sse(status, terminal=("completed", "failed"))
    assert event == "completed", f"job failed/cancelled: {event}"

    url = job_url(status)
    print(f"GET {url} (JSON)")
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    print(f"  Status: {resp.status_code}, Body: {body}")
    assert field(body, "status", "Status") == "Completed"

    print(f"GET {url} (Accept: Arrow)")
    arrow = SESSION.get(url, headers={"Accept": ARROW_MEDIA_TYPE}, timeout=30)
    arrow.raise_for_status()
    assert arrow.status_code == 200
    table = read_arrow_table(arrow.content)
    assert_people_table(table, label="GET job Arrow")
    print(f"  Rows: {table.num_rows}, Columns: {table.column_names}")
    return status


def test_get_request(status: dict) -> None:
    url = f"{job_url(status)}/request"
    print(f"GET {url}")
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    print(f"  Status: {resp.status_code}, Body: {body}")
    assert field(body, "cnnName", "CnnName") == "inmemory"
    assert "People" in (field(body, "query", "Query") or "")
    params = field(body, "parameters", "Parameters") or {}
    assert params.get("limit") == 3 or params.get("Limit") == 3


def test_list_jobs(status: dict) -> None:
    print(f"GET {JOBS_URL}?take=100")
    resp = SESSION.get(JOBS_URL, params={"take": 100}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    items = field(body, "items", "Items") or []
    total = field(body, "total", "Total")
    print(f"  Status: {resp.status_code}, total={total}, count={len(items)}")
    assert total is not None and total >= 1
    job_id = status["id"]
    assert any(field(item, "id", "Id") == job_id for item in items), "liste job id içermiyor"

    print(f"GET {JOBS_URL}?state=Completed&take=50")
    filtered = SESSION.get(JOBS_URL, params={"state": "Completed", "take": 50}, timeout=30)
    filtered.raise_for_status()
    completed_items = field(filtered.json(), "items", "Items") or []
    assert all(field(item, "status", "Status") == "Completed" for item in completed_items)


def test_cancel_and_retry() -> None:
    status = create_job(
        {
            "cnnName": "inmemory",
            "query": "SELECT * FROM People",
            "parameters": {},
            "batchSize": 1,
        }
    )
    cancel_url = f"{job_url(status)}/cancel"
    print(f"POST {cancel_url}")
    cancel = SESSION.post(cancel_url, timeout=30)

    if cancel.status_code == 200:
        cancelled = cancel.json()
        print(f"  Status: {cancel.status_code}, Body: {cancelled}")
        assert field(cancelled, "status", "Status") == "Cancelled"

        retry_url = f"{job_url(status)}/retry"
        print(f"POST {retry_url}")
        retry = SESSION.post(retry_url, timeout=30)
        assert retry.status_code == 202, f"retry 202 bekleniyor, gelen {retry.status_code}: {retry.text}"
        retry_status = retry.json()
        print(f"  Status: {retry.status_code}, Body: {retry_status}")
        assert retry_status["id"] != status["id"]
        assert field(retry_status, "retriedFrom", "RetriedFrom") == status["id"]

        event = wait_sse(retry_status, terminal=("completed", "failed"))
        assert event == "completed"

        # Orijinal cancelled job silinebilir
        print(f"DELETE {job_url(status)}")
        deleted = SESSION.delete(job_url(status), timeout=30)
        assert deleted.status_code == 204, f"delete 204 bekleniyor, gelen {deleted.status_code}"
        missing = SESSION.get(job_url(status), timeout=30)
        assert missing.status_code == 404
        return

    # Worker cancel'dan önce bitirdiyse Conflict; completed job için retry Conflict olmalı
    assert cancel.status_code == 409, f"cancel 200 veya 409 bekleniyor, gelen {cancel.status_code}"
    print(f"  Cancel Conflict (job zaten bitti): {cancel.status_code}")

    retry_url = f"{job_url(status)}/retry"
    print(f"POST {retry_url} (Completed -> Conflict)")
    retry = SESSION.post(retry_url, timeout=30)
    assert retry.status_code == 409, f"completed retry 409 bekleniyor, gelen {retry.status_code}"


def test_delete_completed(status: dict) -> None:
    url = job_url(status)
    print(f"DELETE {url}")
    resp = SESSION.delete(url, timeout=30)
    assert resp.status_code == 204, f"delete 204 bekleniyor, gelen {resp.status_code}: {resp.text}"

    missing = SESSION.get(url, timeout=30)
    assert missing.status_code == 404, f"silinen job 404 olmalı, gelen {missing.status_code}"

    request_missing = SESSION.get(f"{url}/request", timeout=30)
    assert request_missing.status_code == 404


def main() -> int:
    try:
        completed = test_happy_path()
        test_get_request(completed)
        test_list_jobs(completed)
        test_cancel_and_retry()
        test_delete_completed(completed)
    except requests.RequestException as exc:
        print(f"\nHTTP hatası: {exc}", file=sys.stderr)
        print("API çalışıyor mu? dotnet run --project src/Arrow.Http.SampleHost", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"\nTest başarısız: {exc}", file=sys.stderr)
        return 1

    print(
        "\nOK Job testleri gecti "
        "(create -> SSE -> JSON/Arrow -> request -> list -> cancel/retry -> delete)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

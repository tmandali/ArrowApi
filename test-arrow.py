#!/usr/bin/env python3
"""Arrow.Http.SampleHost endpoint testleri — Arrow.Http.SampleHost.http ile uyumlu."""

from __future__ import annotations

import os
import sys

try:
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import requests
except ImportError:
    print("Gerekli paketler: pip install pyarrow requests")
    sys.exit(1)

BASE_URL = os.environ.get("ARROW_API_URL", "http://localhost:5236")
ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"

# Kurumsal proxy localhost'u 400 ile kesebiliyor
SESSION = requests.Session()
SESSION.trust_env = False
SESSION.proxies = {"http": None, "https": None}

VARIANT_COLUMN = "event_data"

EXPECTED_ROWS = [
    {"Id": 1, "Name": "Ali"},
    {"Id": 2, "Name": "Ayşe"},
    {"Id": 3, "Name": "Veli"},
]

QUERY_LIMIT_2_ROWS = [
    {"Id": 1, "Name": "Ali"},
    {"Id": 2, "Name": "Ayşe"},
]


def read_arrow_table(content: bytes) -> pa.Table:
    with ipc.open_stream(content) as reader:
        return reader.read_all()


def assert_people_table(table: pa.Table, *, label: str, expected: list[dict] | None = None) -> None:
    rows = expected if expected is not None else EXPECTED_ROWS
    assert table.num_rows == len(rows), f"{label}: satır sayısı {len(rows)} olmalı, gelen {table.num_rows}"
    assert table.column_names == ["Id", "Name"], f"{label}: sütunlar uyuşmuyor"

    actual = [
        {"Id": table.column("Id")[i].as_py(), "Name": table.column("Name")[i].as_py()}
        for i in range(table.num_rows)
    ]
    assert actual == rows, f"{label}: veri uyuşmuyor\n  beklenen: {rows}\n  gelen: {actual}"


def get_arrow(path: str, *, accept_arrow: bool = True) -> requests.Response:
    headers = {"Accept": ARROW_MEDIA_TYPE} if accept_arrow else {}
    return SESSION.get(f"{BASE_URL}{path}", headers=headers, timeout=30)


def test_get_arrow() -> pa.Table:
    print(f"GET {BASE_URL}/arrow")
    resp = get_arrow("/arrow")
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type')}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow")
    print(f"  Rows: {table.num_rows}, Columns: {table.column_names}")
    return table


def test_get_arrow_batches_json() -> None:
    print(f"\nGET {BASE_URL}/arrow/batches (JSON)")
    resp = get_arrow("/arrow/batches", accept_arrow=False)
    resp.raise_for_status()

    data = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Body: {data}")

    assert data["batchCount"] == 1
    assert data["totalRows"] == 3
    assert [c["name"] for c in data["columns"]] == ["Id", "Name"]


def test_get_arrow_batches_arrow() -> None:
    print(f"\nGET {BASE_URL}/arrow/batches (Accept: Arrow)")
    resp = get_arrow("/arrow/batches")
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/batches Arrow")
    print(f"  Rows: {table.num_rows}")


def test_get_arrow_manual() -> None:
    print(f"\nGET {BASE_URL}/arrow/manual")
    resp = get_arrow("/arrow/manual")
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/manual")
    print(f"  Rows: {table.num_rows}, Columns: {table.column_names}")


def test_get_arrow_from_reader() -> None:
    print(f"\nGET {BASE_URL}/arrow/from-reader")
    resp = get_arrow("/arrow/from-reader")
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/from-reader")
    print(f"  Rows: {table.num_rows}")


def test_get_arrow_from_db() -> None:
    print(f"\nGET {BASE_URL}/arrow/from-db")
    resp = get_arrow("/arrow/from-db")
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/from-db")
    print(f"  Rows: {table.num_rows}")


def test_get_arrow_from_db_await() -> None:
    print(f"\nGET {BASE_URL}/arrow/from-db-await")
    resp = get_arrow("/arrow/from-db-await")
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/from-db-await")
    print(f"  Rows: {table.num_rows}")


def test_get_arrow_variant_manual() -> bytes:
    print(f"\nGET {BASE_URL}/arrow/variant/manual")
    resp = get_arrow("/arrow/variant/manual")
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    table = read_arrow_table(resp.content)
    assert table.num_rows == 2, f"variant/manual: 2 satır bekleniyor, gelen {table.num_rows}"
    assert table.column_names == [VARIANT_COLUMN], f"variant/manual: sütun adı {VARIANT_COLUMN} olmalı"

    field = table.schema.field(VARIANT_COLUMN)
    extension = field.metadata.get(b"ARROW:extension:name", b"").decode()
    assert extension == "arrow.parquet.variant", f"extension beklenmiyor: {extension!r}"

    print(f"  Rows: {table.num_rows}, Extension: {extension}")
    return resp.content


def test_get_arrow_variant_batches() -> None:
    print(f"\nGET {BASE_URL}/arrow/variant/batches")
    resp = get_arrow("/arrow/variant/batches", accept_arrow=False)
    resp.raise_for_status()

    data = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Body: {data}")

    assert data["extension"] == "arrow.parquet.variant"
    assert data["batchCount"] == 1
    assert data["totalRows"] == 2
    assert data["rows"] == [
        {"user_id": 42, "action": "login"},
        ["a", "b"],
    ]
    assert data["columns"][0]["name"] == VARIANT_COLUMN


def test_get_arrow_variant_staging() -> None:
    print(f"\nGET {BASE_URL}/arrow/variant/staging")
    resp = get_arrow("/arrow/variant/staging", accept_arrow=False)
    resp.raise_for_status()

    data = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Body: {data}")

    assert data["column"] == VARIANT_COLUMN
    assert data["stagingFormat"] == "ARPV varbinary"
    assert data["rowCount"] == 2
    assert data["rows"] == [
        {"user_id": 42, "action": "login"},
        ["a", "b"],
    ]


def test_post_arrow_variant(arrow_bytes: bytes) -> None:
    print(f"\nPOST {BASE_URL}/arrow/variant")
    resp = SESSION.post(
        f"{BASE_URL}/arrow/variant",
        data=arrow_bytes,
        headers={"Content-Type": ARROW_MEDIA_TYPE, "Accept": ARROW_MEDIA_TYPE},
        timeout=30,
    )
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert table.num_rows == 2
    assert table.column_names == [VARIANT_COLUMN]
    print(f"  Status: {resp.status_code}, Rows: {table.num_rows}")


def test_post_arrow(arrow_bytes: bytes, expected_table: pa.Table) -> None:
    print(f"\nPOST {BASE_URL}/arrow")
    resp = SESSION.post(
        f"{BASE_URL}/arrow",
        data=arrow_bytes,
        headers={"Content-Type": ARROW_MEDIA_TYPE, "Accept": ARROW_MEDIA_TYPE},
        timeout=30,
    )
    resp.raise_for_status()

    actual_table = read_arrow_table(resp.content)
    assert actual_table.equals(expected_table), (
        f"Round-trip tablo uyuşmuyor:\n"
        f"  beklenen:\n{expected_table}\n"
        f"  gelen:\n{actual_table}"
    )
    print(f"  Status: {resp.status_code}, Rows: {actual_table.num_rows}")


def test_post_arrow_query() -> None:
    print(f"\nPOST {BASE_URL}/arrow/query")
    body = {
        "cnnName": "inmemory",
        "query": "SELECT * FROM People LIMIT @limit",
        "parameters": {"limit": 2},
        "batchSize": 1,
    }
    resp = SESSION.post(
        f"{BASE_URL}/arrow/query",
        json=body,
        headers={"Accept": ARROW_MEDIA_TYPE},
        timeout=30,
    )
    resp.raise_for_status()

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="POST /arrow/query", expected=QUERY_LIMIT_2_ROWS)
    print(f"  Status: {resp.status_code}, Rows: {table.num_rows}")


def main() -> int:
    try:
        table = test_get_arrow()
        test_get_arrow_batches_json()
        test_get_arrow_batches_arrow()
        test_get_arrow_manual()
        test_get_arrow_from_reader()
        test_get_arrow_from_db()
        test_get_arrow_from_db_await()
        variant_bytes = test_get_arrow_variant_manual()
        test_get_arrow_variant_batches()
        test_get_arrow_variant_staging()

        with pa.BufferOutputStream() as sink:
            with ipc.new_stream(sink, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = sink.getvalue().to_pybytes()

        test_post_arrow(arrow_bytes, table)
        test_post_arrow_variant(variant_bytes)
        test_post_arrow_query()
    except requests.RequestException as exc:
        print(f"\nHTTP hatası: {exc}", file=sys.stderr)
        print("API çalışıyor mu? dotnet run --project src/Arrow.Http.SampleHost", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"\nTest başarısız: {exc}", file=sys.stderr)
        return 1

    print(
        "\nOK SampleHost testleri gecti "
        "(GET /arrow, /batches, /manual, /from-reader, /from-db, /from-db-await, "
        "variant/*, POST /arrow, /variant, /query)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

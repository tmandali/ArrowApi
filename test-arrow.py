#!/usr/bin/env python3
"""Arrow API endpoint testleri."""

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

VARIANT_COLUMN = "event_data"

EXPECTED_ROWS = [
    {"Id": 1, "Name": "Ali"},
    {"Id": 2, "Name": "Ayşe"},
    {"Id": 3, "Name": "Veli"},
]


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


def test_get_arrow() -> pa.Table:
    print(f"GET {BASE_URL}/arrow")
    resp = requests.get(f"{BASE_URL}/arrow", timeout=10)
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type')}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow")
    print(f"  Rows: {table.num_rows}, Columns: {table.column_names}")
    return table


def test_get_arrow_batches() -> None:
    print(f"\nGET {BASE_URL}/arrow/batches")
    resp = requests.get(f"{BASE_URL}/arrow/batches", timeout=10)
    resp.raise_for_status()

    data = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Body: {data}")

    assert data["batchCount"] == 1
    assert data["totalRows"] == 3
    assert [c["name"] for c in data["columns"]] == ["Id", "Name"]


def test_get_arrow_manual() -> None:
    print(f"\nGET {BASE_URL}/arrow/manual")
    resp = requests.get(f"{BASE_URL}/arrow/manual", timeout=10)
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type')}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    table = read_arrow_table(resp.content)
    assert_people_table(table, label="GET /arrow/manual")
    print(f"  Rows: {table.num_rows}, Columns: {table.column_names}")


def test_get_arrow_variant_manual() -> bytes:
    print(f"\nGET {BASE_URL}/arrow/variant/manual")
    resp = requests.get(f"{BASE_URL}/arrow/variant/manual", timeout=10)
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type')}")
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
    resp = requests.get(f"{BASE_URL}/arrow/variant/batches", timeout=10)
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
    resp = requests.get(f"{BASE_URL}/arrow/variant/staging", timeout=10)
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
    resp = requests.post(
        f"{BASE_URL}/arrow/variant",
        data=arrow_bytes,
        headers={"Content-Type": ARROW_MEDIA_TYPE},
        timeout=10,
    )
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    table = read_arrow_table(resp.content)
    assert table.num_rows == 2
    assert table.column_names == [VARIANT_COLUMN]


def test_post_arrow(arrow_bytes: bytes, expected_table: pa.Table) -> None:
    print(f"\nPOST {BASE_URL}/arrow")
    resp = requests.post(
        f"{BASE_URL}/arrow",
        data=arrow_bytes,
        headers={"Content-Type": ARROW_MEDIA_TYPE},
        timeout=10,
    )
    resp.raise_for_status()

    print(f"  Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type')}")
    print(f"  Content-Length: {len(resp.content)} bytes")

    actual_table = read_arrow_table(resp.content)
    assert actual_table.equals(expected_table), (
        f"Round-trip tablo uyuşmuyor:\n"
        f"  beklenen:\n{expected_table}\n"
        f"  gelen:\n{actual_table}"
    )


def main() -> int:
    try:
        table = test_get_arrow()
        test_get_arrow_batches()
        test_get_arrow_manual()
        variant_bytes = test_get_arrow_variant_manual()
        test_get_arrow_variant_batches()
        test_get_arrow_variant_staging()

        with pa.BufferOutputStream() as sink:
            with ipc.new_stream(sink, table.schema) as writer:
                writer.write_table(table)
            arrow_bytes = sink.getvalue().to_pybytes()

        test_post_arrow(arrow_bytes, table)
        test_post_arrow_variant(variant_bytes)
    except requests.RequestException as exc:
        print(f"\nHTTP hatası: {exc}", file=sys.stderr)
        print("API çalışıyor mu? dotnet run --project src/Arrow.Http.SampleHost", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"\nTest başarısız: {exc}", file=sys.stderr)
        return 1

    print(
        "\n✓ Tüm endpoint testleri geçti "
        "(GET /arrow, /arrow/batches, /arrow/manual, "
        "GET /arrow/variant/manual, /arrow/variant/batches, /arrow/variant/staging, "
        "POST /arrow, POST /arrow/variant)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Expense module — record parsed expenses and produce summaries.
Local JSON is the source of truth; Google Sheets is a mirror when configured.
"""
import csv
import io
from collections import defaultdict
from datetime import datetime

from ..storage import json_store
from ..storage.sheets import sheets


def record(expense: dict) -> dict:
    """Save an expense to JSON and mirror it to Google Sheets if enabled.

    Returns the saved record with a `synced` flag describing the Sheets state.
    """
    expense.setdefault("date", datetime.now().strftime("%Y-%m-%d"))
    expense["recorded_at"] = datetime.now().isoformat(timespec="minutes")

    saved = json_store.expenses.append(expense)

    saved["synced"] = "disabled"
    if sheets.enabled:
        try:
            sheets.append_expense(saved)
            saved["synced"] = "ok"
        except Exception as e:  # keep the local record even if Sheets fails
            saved["synced"] = f"failed: {e}"
    return saved


def monthly_summary(year: int | None = None, month: int | None = None) -> dict:
    """Total + per-category breakdown for one month (default: current)."""
    now = datetime.now()
    year, month = year or now.year, month or now.month
    prefix = f"{year:04d}-{month:02d}"

    by_category: dict[str, float] = defaultdict(float)
    items = []
    for e in json_store.expenses.load():
        if str(e.get("date", "")).startswith(prefix):
            by_category[e.get("category", "อื่นๆ")] += float(e.get("amount") or 0)
            items.append(e)

    return {
        "month": prefix,
        "total": sum(by_category.values()),
        "by_category": dict(
            sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
        ),
        "count": len(items),
        "items": sorted(items, key=lambda e: (e.get("date", ""), e.get("id", 0)),
                        reverse=True),
    }


def delete(expense_id: int) -> bool:
    return json_store.expenses.remove(expense_id)


def update_category(expense_id: int, category: str) -> dict | None:
    return json_store.expenses.update(expense_id, category=category)


def to_csv() -> str:
    """All expenses as CSV (utf-8-sig is added at the HTTP layer for Excel)."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "วันที่", "รายการ", "หมวด", "จำนวนเงิน (บาท)", "บันทึกเมื่อ"])
    for e in json_store.expenses.load():
        writer.writerow([
            e.get("id"), e.get("date", ""), e.get("description", ""),
            e.get("category", ""), e.get("amount", 0), e.get("recorded_at", ""),
        ])
    return buf.getvalue()

"""Budget module — monthly + per-category limits, usage and alerts."""
import calendar

from .. import config
from ..storage import json_store
from . import expense


def get_budgets() -> dict:
    return json_store.budgets.get()


def set_budgets(monthly=None, categories: dict | None = None) -> dict:
    b = json_store.budgets.get()
    if monthly is not None:
        b["monthly"] = max(0.0, float(monthly))
    if categories is not None:
        b["categories"] = {
            k: float(v) for k, v in categories.items() if v and float(v) > 0
        }
    return json_store.budgets.set(b)


def status(year: int | None = None, month: int | None = None) -> dict:
    """งบ vs ยอดใช้จริงของเดือนนั้น + เตือนใกล้/เกินงบ + จังหวะการใช้"""
    b = get_budgets()
    summary = expense.monthly_summary(year, month)
    spent = summary["total"]
    monthly = float(b.get("monthly", 0) or 0)

    # pacing: ควรใช้ไปเท่าไรแล้ว ณ วันนี้ (เฉลี่ยทั้งเดือน)
    now = config.now()
    y, m = year or now.year, month or now.month
    days_in_month = calendar.monthrange(y, m)[1]
    is_current = (y == now.year and m == now.month)
    day = now.day if is_current else days_in_month
    expected = monthly * (day / days_in_month) if monthly else 0

    cats = []
    for cat, limit in b.get("categories", {}).items():
        used = summary["by_category"].get(cat, 0)
        limit = float(limit)
        cats.append({
            "category": cat, "limit": limit, "used": used,
            "pct": round(used / limit * 100) if limit else 0,
            "over": used > limit,
        })
    cats.sort(key=lambda c: c["pct"], reverse=True)

    alerts = []
    if monthly:
        pct = spent / monthly * 100
        if spent > monthly:
            alerts.append({"level": "over",
                           "text": f"เกินงบเดือนนี้แล้ว {spent - monthly:,.0f} บาท 😱"})
        elif pct >= 80:
            alerts.append({"level": "warn",
                           "text": f"ใช้ไปแล้ว {pct:.0f}% ของงบ เหลือ {monthly - spent:,.0f} บาท"})
        elif is_current and expected and spent > expected * 1.15:
            alerts.append({"level": "pace",
                           "text": f"ใช้เร็วกว่าจังหวะปกติ — ปกติวันนี้ควรอยู่ราว {expected:,.0f} บาท"})
    for c in cats:
        if c["over"]:
            alerts.append({"level": "over",
                           "text": f"หมวด{c['category']}เกินงบแล้ว ({c['used']:,.0f}/{c['limit']:,.0f})"})

    return {
        "monthly_limit": monthly,
        "spent": spent,
        "remaining": monthly - spent,
        "pct": round(spent / monthly * 100) if monthly else 0,
        "expected_so_far": round(expected),
        "on_track": (spent <= expected * 1.05) if (monthly and is_current) else None,
        "categories": cats,
        "alerts": alerts,
        "month": summary["month"],
    }

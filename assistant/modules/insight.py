"""AI Insight — Gemini turns the user's data into a short, personal weekly read.

Cached by a data signature so we only spend a Gemini call when something
material changed. Falls back to rule-based insights if the AI is unavailable
(e.g. free-tier quota exhausted), so the feature never shows an error.
"""
import json
import re

from .. import config
from ..storage import json_store
from . import budget, expense, schedule, streak

SYSTEM = """\
You are a warm, encouraging financial + study coach for a Thai university
student. Given their data, reply ONLY with JSON (no markdown fences):
{
  "headline": "<one upbeat Thai sentence summarising this week>",
  "insights": [
    {"icon": "<single emoji>", "text": "<one specific Thai observation, max ~90 chars>"}
  ],
  "tip": "<one concrete, actionable Thai suggestion for the days ahead>"
}
Give 2-4 insights. Be specific to the numbers (mention real categories/amounts/
deadlines). Sound human and kind, never preachy. Thai language only.
"""


def _signature(summary, budgets, tasks, st) -> str:
    return "|".join(str(x) for x in (
        summary["month"], round(summary["total"]), summary["count"],
        len(tasks), budgets.get("monthly", 0), st.get("current", 0),
    ))


def _local_insights(summary, bstatus, tasks, st) -> dict:
    """ใช้เมื่อเรียก AI ไม่ได้ — สร้าง insight จากตัวเลขตรงๆ"""
    insights = []
    if summary["by_category"]:
        top_cat, top_amt = next(iter(summary["by_category"].items()))
        insights.append({"icon": "💸",
                         "text": f"เดือนนี้ใช้กับ{top_cat}มากสุด {top_amt:,.0f} บาท"})
    for a in bstatus.get("alerts", [])[:1]:
        insights.append({"icon": "⚠️", "text": a["text"]})
    urgent = [t for t in tasks if t.get("due")]
    if urgent:
        insights.append({"icon": "📚",
                         "text": f"มีงานค้าง {len(urgent)} ชิ้น งานใกล้สุดคือ \"{urgent[0]['title']}\""})
    if st.get("current"):
        insights.append({"icon": "🔥", "text": f"ขยันต่อเนื่อง {st['current']} วันแล้ว สู้ๆ!"})
    return {
        "headline": "สรุปภาพรวมของสัปดาห์นี้",
        "insights": insights or [{"icon": "👋", "text": "เริ่มบันทึกรายจ่ายหรือ deadline แล้วเดี๋ยวผมช่วยวิเคราะห์ให้"}],
        "tip": "ลองตั้งงบรายเดือนไว้ เดี๋ยวผมเตือนเวลาใกล้เกิน",
        "source": "local",
    }


def _call_gemini(payload: dict) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=config.MODEL,
        contents=json.dumps(payload, ensure_ascii=False),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
        ),
    )
    text = (resp.text or "").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}
    data["source"] = "ai"
    return data


def generate(force: bool = False) -> dict:
    summary = expense.monthly_summary()
    bstatus = budget.status()
    tasks = schedule.list_tasks()
    st = streak.status()

    sig = _signature(summary, json_store.budgets.get(), tasks, st)
    today = config.now().strftime("%Y-%m-%d")
    cache = json_store.insight_cache.get()
    if not force and cache.get("date") == today and cache.get("sig") == sig:
        return cache["data"]

    payload = {
        "month": summary["month"],
        "spent_total": round(summary["total"]),
        "by_category": {k: round(v) for k, v in summary["by_category"].items()},
        "expense_count": summary["count"],
        "budget": {"monthly": bstatus["monthly_limit"], "remaining": round(bstatus["remaining"]),
                   "alerts": [a["text"] for a in bstatus["alerts"]]},
        "tasks": [{"title": t["title"], "type": t.get("type"), "due": t.get("due")}
                  for t in tasks[:8]],
        "study_streak_days": st["current"],
    }
    try:
        data = _call_gemini(payload)
        if not data.get("insights"):
            raise ValueError("empty insights")
    except Exception:
        data = _local_insights(summary, bstatus, tasks, st)

    json_store.insight_cache.set({"date": today, "sig": sig, "data": data})
    return data

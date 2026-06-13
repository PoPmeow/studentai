"""Streak module — daily activity streak + study badges to keep students going."""
from datetime import date, timedelta

from .. import config
from ..storage import json_store

# (icon, label, ชนิด, เกณฑ์)  ชนิด: "streak" เทียบ best streak, "days" เทียบจำนวนวันสะสม
BADGE_DEFS = [
    ("🌱", "เริ่มต้น", "streak", 1),
    ("🔥", "3 วันติด", "streak", 3),
    ("⚡", "7 วันติด", "streak", 7),
    ("💎", "14 วันติด", "streak", 14),
    ("👑", "30 วันติด", "streak", 30),
    ("📚", "ขยัน 10 วัน", "days", 10),
    ("🏆", "ขยัน 30 วัน", "days", 30),
]


def record_activity() -> dict:
    """เรียกเมื่อผู้ใช้ทำอะไรสักอย่าง (ปิดงาน/บันทึก) — นับเป็นวันที่ active"""
    today = config.now().date().isoformat()
    s = json_store.streak.get()
    if s.get("last_active") == today:
        return s

    yesterday = (config.now().date() - timedelta(days=1)).isoformat()
    s["current"] = s.get("current", 0) + 1 if s.get("last_active") == yesterday else 1
    s["best"] = max(s.get("best", 0), s["current"])
    s["last_active"] = today

    hist = set(s.get("history", []))
    hist.add(today)
    s["history"] = sorted(hist)[-90:]  # เก็บ 90 วันล่าสุดไว้วาดปฏิทิน
    return json_store.streak.set(s)


def status() -> dict:
    s = json_store.streak.get()
    history = s.get("history", [])
    best = s.get("best", 0)

    # ถ้าไม่ได้ active เกินเมื่อวาน ถือว่า streak ขาด (current = 0)
    current = s.get("current", 0)
    last = s.get("last_active")
    today = config.now().date()
    if last:
        gap = (today - date.fromisoformat(last)).days
        if gap > 1:
            current = 0

    badges = []
    for icon, label, kind, need in BADGE_DEFS:
        have = best if kind == "streak" else len(history)
        badges.append({"icon": icon, "label": label,
                       "earned": have >= need, "need": need})

    return {
        "current": current,
        "best": best,
        "today_done": last == today.isoformat(),
        "history": history,
        "badges": badges,
    }

"""Schedule module — store tasks + study plans, fire due reminders."""
from datetime import datetime, timedelta

from .. import config
from ..notify import senders
from ..storage import json_store

# แจ้งเตือนล่วงหน้าก่อนถึงกำหนด (มาก่อนเสมอ ไม่เตือนหลังหมดเวลา)
REMINDER_OFFSETS = [
    (timedelta(days=1), "⏰ พรุ่งนี้ครบกำหนด"),
    (timedelta(hours=1), "⏰ อีก 1 ชั่วโมงครบกำหนด"),
]


def _build_reminders(title: str, due: str | None) -> list[dict]:
    """สร้าง reminder 1 วันก่อน + 1 ชม.ก่อน due — เฉพาะเวลาที่ยังมาไม่ถึง"""
    try:
        due_dt = datetime.fromisoformat(due)
    except (ValueError, TypeError):
        return []
    due_label = due_dt.strftime("%d/%m %H:%M")
    now = config.now()
    out = []
    for offset, prefix in REMINDER_OFFSETS:
        at = due_dt - offset
        if at > now:  # ข้ามอันที่เวลาผ่านไปแล้ว (เช่นงานที่เหลือไม่ถึง 1 ชม.)
            out.append({
                "at": at.isoformat(timespec="minutes"),
                "message": f"{prefix}: {title} (ส่ง {due_label})",
            })
    return out


def add_task(parsed: dict) -> dict:
    """Save a task (with its study plan) and register its reminders."""
    task = {
        "title": parsed.get("title", "งานไม่ระบุชื่อ"),
        "type": parsed.get("type", "other"),
        "due": parsed.get("due"),
        "plan": parsed.get("plan", []),
        "done": False,
        "created_at": config.now().isoformat(timespec="minutes"),
    }
    saved = json_store.tasks.append(task)

    new_reminders = _build_reminders(task["title"], task["due"])
    if new_reminders:
        reminders = json_store.reminders.load()
        for r in new_reminders:
            reminders.append({"task_id": saved["id"], **r, "sent": False})
        json_store.reminders.save(reminders)
    saved["reminder_count"] = len(new_reminders)
    return saved


def list_tasks(include_done: bool = False) -> list:
    tasks = json_store.tasks.load()
    if not include_done:
        tasks = [t for t in tasks if not t.get("done")]
    return sorted(tasks, key=lambda t: t.get("due") or "9999")


def mark_done(task_id: int) -> bool:
    tasks = json_store.tasks.load()
    for t in tasks:
        if t.get("id") == task_id:
            t["done"] = True
            json_store.tasks.save(tasks)
            return True
    return False


def delete_task(task_id: int) -> bool:
    """Remove a task together with all of its reminders."""
    if not json_store.tasks.remove(task_id):
        return False
    reminders = [r for r in json_store.reminders.load()
                 if r.get("task_id") != task_id]
    json_store.reminders.save(reminders)
    return True


def fire_due_reminders() -> list[dict]:
    """Send every unsent reminder whose time has passed. Returns those sent."""
    now = config.now().isoformat(timespec="minutes")
    reminders = json_store.reminders.load()
    fired = []
    for r in reminders:
        if not r.get("sent") and (r.get("at") or "9999") <= now:
            channels = senders.broadcast(f"🔔 {r['message']}")
            if channels:
                r["sent"] = True
                r["sent_via"] = channels
                fired.append(r)
    if fired:
        json_store.reminders.save(reminders)
    return fired


def pending_reminders() -> list:
    now = config.now().isoformat(timespec="minutes")
    return sorted(
        (r for r in json_store.reminders.load()
         if not r.get("sent") and (r.get("at") or "") > now),
        key=lambda r: r["at"],
    )

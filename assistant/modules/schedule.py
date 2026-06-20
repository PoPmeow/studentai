"""Schedule module — store tasks + study plans, fire due reminders."""
from datetime import date, datetime, timedelta

from .. import config
from ..notify import user_notify
from ..storage import json_store

_DAY_WD = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

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
    due = [r for r in reminders if not r.get("sent") and (r.get("at") or "9999") <= now]
    if not due:
        return []

    has_channels = any(user_notify.status().values())
    fired = []
    for r in due:
        channels = user_notify.send(r["message"], title="🔔 เตือนความจำ")
        # มีช่อง + ส่งได้ → done; ไม่มีช่องเลย → mark done กันยิงซ้ำไม่จบ;
        # มีช่องแต่ส่งพลาด (ชั่วคราว) → ปล่อยไว้ให้ cron รอบหน้าลองใหม่
        if channels or not has_channels:
            r["sent"] = True
            r["sent_via"] = channels
            fired.append(r)
    json_store.reminders.save(reminders)
    return fired


def pending_reminders() -> list:
    now = config.now().isoformat(timespec="minutes")
    return sorted(
        (r for r in json_store.reminders.load()
         if not r.get("sent") and (r.get("at") or "") > now),
        key=lambda r: r["at"],
    )


# ──────── Class schedule ────────

def _next_weekday(target_wd: int, from_date: date) -> date:
    days_ahead = (target_wd - from_date.weekday()) % 7
    return from_date + timedelta(days=days_ahead)


def _generate_class_tasks(slots: list[dict], days_ahead: int = 14) -> int:
    """Create one-time tasks for every class occurrence in the next `days_ahead` days."""
    now = config.now()
    today = now.date()
    end_date = today + timedelta(days=days_ahead)

    existing_keys = {
        (t.get("title", ""), t.get("due", ""))
        for t in json_store.tasks.load()
    }

    created = 0
    for slot in slots:
        wd = _DAY_WD.get(slot.get("day", "").lower())
        if wd is None:
            continue
        start_time = slot.get("start_time", "08:00")
        subject = slot.get("subject", "วิชาไม่ระบุ").strip()
        room = slot.get("room", "").strip()
        title = f"เรียน {subject}" + (f" ({room})" if room else "")

        d = _next_weekday(wd, today)
        while d <= end_date:
            due = f"{d.isoformat()}T{start_time}"
            key = (title, due)
            if key not in existing_keys:
                saved = json_store.tasks.append({
                    "title": title,
                    "type": "class",
                    "due": due,
                    "plan": [],
                    "done": False,
                    "created_at": now.isoformat(timespec="minutes"),
                })
                new_reminders = _build_reminders(title, due)
                if new_reminders:
                    reminders = json_store.reminders.load()
                    for r in new_reminders:
                        reminders.append({"task_id": saved["id"], **r, "sent": False})
                    json_store.reminders.save(reminders)
                existing_keys.add(key)
                created += 1
            d += timedelta(weeks=1)
    return created


def import_class_schedule(slots: list[dict]) -> dict:
    """Save recurring slots and generate tasks for the next 14 days."""
    json_store.class_schedule.set({"slots": slots})
    created = _generate_class_tasks(slots)
    return {"slots_count": len(slots), "tasks_created": created}


def get_class_schedule() -> list[dict]:
    return json_store.class_schedule.get().get("slots", [])


def clear_class_schedule() -> None:
    json_store.class_schedule.set({"slots": []})

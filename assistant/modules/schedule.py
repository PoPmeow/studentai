"""Schedule module — store tasks + study plans, fire due reminders."""
from datetime import datetime

from ..notify import senders
from ..storage import json_store


def add_task(parsed: dict) -> dict:
    """Save a task (with its study plan) and register its reminders."""
    task = {
        "title": parsed.get("title", "งานไม่ระบุชื่อ"),
        "type": parsed.get("type", "other"),
        "due": parsed.get("due"),
        "plan": parsed.get("plan", []),
        "done": False,
        "created_at": datetime.now().isoformat(timespec="minutes"),
    }
    saved = json_store.tasks.append(task)

    reminders = json_store.reminders.load()
    for r in parsed.get("reminders", []):
        reminders.append({
            "task_id": saved["id"],
            "at": r.get("at"),
            "message": r.get("message", f"อย่าลืม: {task['title']}"),
            "sent": False,
        })
    json_store.reminders.save(reminders)
    saved["reminder_count"] = len(parsed.get("reminders", []))
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
    now = datetime.now().isoformat(timespec="minutes")
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
    now = datetime.now().isoformat(timespec="minutes")
    return sorted(
        (r for r in json_store.reminders.load()
         if not r.get("sent") and (r.get("at") or "") > now),
        key=lambda r: r["at"],
    )

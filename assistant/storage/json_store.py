"""Collections + key-value docs, backed by the pluggable storage backend
(local JSON on disk, or Upstash Redis on Vercel). Source of truth for state,
history and preferences.
"""
from .backend import backend


class JsonStore:
    """An id-keyed list collection (expenses, tasks, reminders)."""

    def __init__(self, name: str):
        self.name = name

    def load(self) -> list:
        return backend.read(self.name, [])

    def save(self, items: list) -> None:
        backend.write(self.name, items)

    def append(self, item: dict) -> dict:
        items = self.load()
        item["id"] = (max((i.get("id", 0) for i in items), default=0)) + 1
        items.append(item)
        self.save(items)
        return item

    def remove(self, item_id: int) -> bool:
        items = self.load()
        kept = [i for i in items if i.get("id") != item_id]
        if len(kept) == len(items):
            return False
        self.save(kept)
        return True

    def update(self, item_id: int, **fields) -> dict | None:
        items = self.load()
        for i in items:
            if i.get("id") == item_id:
                i.update(fields)
                self.save(items)
                return i
        return None


class KvStore:
    """A single JSON document (dict), for settings/budgets/streak state."""

    def __init__(self, name: str, default: dict | None = None):
        self.name = name
        self.default = default or {}

    def get(self) -> dict:
        data = backend.read(self.name, None)
        return data if isinstance(data, dict) else dict(self.default)

    def set(self, data: dict) -> dict:
        backend.write(self.name, data)
        return data

    def update(self, **fields) -> dict:
        data = self.get()
        data.update(fields)
        return self.set(data)


# collections
expenses = JsonStore("expenses")
tasks = JsonStore("tasks")
reminders = JsonStore("reminders")

# key-value docs
budgets = KvStore("budgets", {"monthly": 0, "categories": {}})
streak = KvStore("streak", {"current": 0, "best": 0, "last_active": "", "history": []})
insight_cache = KvStore("insight_cache", {})
notify_settings = KvStore("notify", {"discord_webhook": "", "push_subscriptions": []})
class_schedule = KvStore("class_schedule", {"slots": []})
grades = JsonStore("grades")

# ชื่อ collection ทั้งหมดของผู้ใช้หนึ่งคน (ใช้ตอนลบบัญชี = ล้างข้อมูลทุกอย่าง)
USER_COLLECTIONS = [
    "expenses", "tasks", "reminders", "budgets", "streak", "insight_cache", "notify",
    "class_schedule", "grades",
]

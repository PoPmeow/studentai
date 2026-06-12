"""Local JSON store — source of truth for state, history and preferences."""
import json
from pathlib import Path

from .. import config


class JsonStore:
    def __init__(self, name: str):
        self.path: Path = config.DATA_DIR / f"{name}.json"

    def load(self) -> list:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, items: list) -> None:
        self.path.write_text(
            json.dumps(items, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

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


expenses = JsonStore("expenses")
tasks = JsonStore("tasks")
reminders = JsonStore("reminders")

"""Pluggable storage backend.

- Local dev  → JSON files in data/  (default)
- Vercel/prod → Upstash Redis REST  (when UPSTASH_* env vars are set)

Per-user isolation: when `current_user` is set (logged-in request), every key is
namespaced as `u:<user>:<name>`, so each account's data is fully separate.
The `*_raw` variants ignore the user and are used for the global users registry.
"""
import json
from contextvars import ContextVar

from .. import config

# ผู้ใช้ของ request ปัจจุบัน (ตั้งโดย middleware จาก cookie). None = ยังไม่ล็อกอิน
current_user: ContextVar[str | None] = ContextVar("current_user", default=None)


def _ns(name: str) -> str:
    """ใส่ namespace ของ user ปัจจุบัน (ถ้ามี) นำหน้าชื่อ key"""
    u = current_user.get()
    return f"u:{u}:{name}" if u else name


class _JsonBackend:
    """Stores each collection as data/<ns>.json on local disk."""

    def __init__(self):
        self.dir = config.DATA_DIR

    def _path(self, name):
        return self.dir / f"{name.replace(':', '__')}.json"

    def _read(self, name, default):
        path = self._path(name)
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default

    def _write(self, name, data):
        # บน read-only FS (serverless ที่ไม่มี Upstash) การเขียนอาจล้มเหลว —
        # กลืน error ไว้เพื่อไม่ให้ทั้ง request พัง (ข้อมูลจะอยู่แค่ในหน่วยความจำ)
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            self._path(name).write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError:
            pass

    def read(self, name, default):
        return self._read(_ns(name), default)

    def write(self, name, data):
        self._write(_ns(name), data)

    def read_raw(self, name, default):
        return self._read(name, default)

    def write_raw(self, name, data):
        self._write(name, data)

    def _delete(self, name):
        try:
            self._path(name).unlink(missing_ok=True)
        except OSError:
            pass

    def delete(self, name):
        self._delete(_ns(name))


class _UpstashBackend:
    """Stores each collection as one JSON string under key studentai:<ns>."""

    def __init__(self):
        self.url = config.UPSTASH_REDIS_REST_URL.rstrip("/")
        self.token = config.UPSTASH_REDIS_REST_TOKEN
        self.prefix = "studentai:"

    def _cmd(self, *args):
        import requests

        resp = requests.post(
            self.url,
            headers={"Authorization": f"Bearer {self.token}"},
            json=list(args),
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json().get("result")

    def _read(self, name, default):
        raw = self._cmd("GET", self.prefix + name)
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default

    def _write(self, name, data):
        self._cmd("SET", self.prefix + name, json.dumps(data, ensure_ascii=False))

    def read(self, name, default):
        return self._read(_ns(name), default)

    def write(self, name, data):
        self._write(_ns(name), data)

    def read_raw(self, name, default):
        return self._read(name, default)

    def write_raw(self, name, data):
        self._write(name, data)

    def delete(self, name):
        self._cmd("DEL", self.prefix + _ns(name))


backend = _UpstashBackend() if config.USE_UPSTASH else _JsonBackend()


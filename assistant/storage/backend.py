"""Pluggable storage backend.

- Local dev  → JSON files in data/  (default)
- Vercel/prod → Upstash Redis REST  (when UPSTASH_* env vars are set)

Both expose the same tiny interface: read(name, default) / write(name, data),
where `data` is any JSON-serialisable value (list or dict). Higher layers
(JsonStore, KvStore) build on top of this.
"""
import json

from .. import config


class _JsonBackend:
    """Stores each collection as data/<name>.json on local disk."""

    def __init__(self):
        self.dir = config.DATA_DIR

    def read(self, name, default):
        path = self.dir / f"{name}.json"
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default

    def write(self, name, data):
        # บน read-only FS (serverless ที่ไม่มี Upstash) การเขียนอาจล้มเหลว —
        # กลืน error ไว้เพื่อไม่ให้ทั้ง request พัง (ข้อมูลจะอยู่แค่ในหน่วยความจำ)
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / f"{name}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError:
            pass


class _UpstashBackend:
    """Stores each collection as one JSON string under key studentai:<name>.

    Uses the Upstash Redis REST API (a single POST with a command array),
    so the only dependency is `requests` — works fine in serverless.
    """

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
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("result")

    def read(self, name, default):
        raw = self._cmd("GET", self.prefix + name)
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default

    def write(self, name, data):
        self._cmd("SET", self.prefix + name, json.dumps(data, ensure_ascii=False))


backend = _UpstashBackend() if config.USE_UPSTASH else _JsonBackend()

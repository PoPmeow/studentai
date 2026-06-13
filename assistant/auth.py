"""Lightweight username + PIN auth with HMAC-signed session tokens.

- Users registry lives at a GLOBAL key (read_raw/write_raw), not per-user.
- PINs are stored as PBKDF2-SHA256 hashes with a per-user salt (never plaintext).
- The session "token" is `base64(username|issued).base64(hmac)` — stateless, so
  serverless can verify it on every request without a session store.
"""
import base64
import hashlib
import hmac
import re
import secrets
import time

from . import config
from .storage.backend import backend, current_user  # noqa: F401  (re-exported)

_SECRET = config.SESSION_SECRET.encode()
_TOKEN_TTL = 90 * 86400  # 90 วัน
_USERNAME_RE = re.compile(r"^[a-z0-9_.\-]{3,20}$")


# ───────── validation ─────────

def normalize_username(username: str) -> str:
    return (username or "").strip().lower()


def valid_username(username: str) -> bool:
    return bool(_USERNAME_RE.match(username))


def valid_pin(pin: str) -> bool:
    return bool(pin) and pin.isdigit() and 4 <= len(pin) <= 6


# ───────── PIN hashing ─────────

def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 100_000).hex()


# ───────── registry (global) ─────────

def _users() -> dict:
    return backend.read_raw("users", {})


def list_users() -> list[str]:
    return list(_users().keys())


def register_or_login(username: str, pin: str) -> tuple[str | None, str]:
    """ครั้งแรก = สมัคร (ตั้ง PIN), ครั้งถัดไป = ต้องตรง PIN.
    คืน (token, error). token=None เมื่อ error.
    """
    username = normalize_username(username)
    if not valid_username(username):
        return None, "ชื่อผู้ใช้ต้องเป็น a-z, 0-9, _ . - ยาว 3-20 ตัว"
    if not valid_pin(pin):
        return None, "PIN ต้องเป็นตัวเลข 4-6 หลัก"

    users = _users()
    rec = users.get(username)
    if rec is None:
        salt = secrets.token_hex(16)
        users[username] = {"pin": _hash_pin(pin, salt), "salt": salt,
                           "created": time.strftime("%Y-%m-%d")}
        backend.write_raw("users", users)
        return make_token(username), ""

    if not hmac.compare_digest(rec["pin"], _hash_pin(pin, rec["salt"])):
        return None, "PIN ไม่ถูกต้อง"
    return make_token(username), ""


# ───────── token sign / verify ─────────

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(username: str) -> str:
    payload = f"{username}|{int(time.time())}".encode()
    mac = hmac.new(_SECRET, payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(mac)}"


def verify_token(token: str) -> str | None:
    if not token or "." not in token:
        return None
    try:
        p_b64, sig_b64 = token.split(".", 1)
        payload = _b64d(p_b64)
        expected = hmac.new(_SECRET, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(sig_b64)):
            return None
        username, issued = payload.decode().split("|", 1)
        if time.time() - int(issued) > _TOKEN_TTL:
            return None
        return username
    except (ValueError, TypeError):
        return None

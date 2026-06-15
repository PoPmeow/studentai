"""Central configuration loaded from .env"""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ===== Core brain =====
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("MODEL", "gemini-2.5-flash").strip()

# Groq = ตัวสำรองสำหรับแชท/แยก intent เมื่อ Gemini ติด limit (ฟรี โควต้าเยอะ เร็ว)
# 70b ฉลาดกว่า (~1,000/วัน), 8b-instant โควต้าเยอะกว่ามาก (~14,400/วัน) แต่ฉลาดน้อยกว่า
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

# ===== Notifications =====
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_USER_ID = os.getenv("LINE_USER_ID", "")

# ===== Google Sheets (optional mirror) =====
GOOGLE_SHEETS_CREDENTIALS_FILE = os.getenv("GOOGLE_SHEETS_CREDENTIALS_FILE", "")
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "StudentAssistant")

# ===== Storage backend =====
# ถ้ามีค่าเหล่านี้ (เช่นบน Vercel) จะเก็บข้อมูลบน Upstash Redis แทนไฟล์ JSON
# รองรับทั้งชื่อของ Upstash (UPSTASH_*) และของ Vercel KV integration (KV_REST_API_*)
UPSTASH_REDIS_REST_URL = (
    os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL") or ""
).strip()
UPSTASH_REDIS_REST_TOKEN = (
    os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN") or ""
).strip()
USE_UPSTASH = bool(UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)

# ===== Cron / runtime =====
# ใช้กับ /api/cron/remind — GitHub Actions จะแนบ token นี้มาเพื่อยืนยันตัวตน
CRON_SECRET = os.getenv("CRON_SECRET", "").strip()

# ใช้เซ็น session token ของระบบล็อกอิน (ต้องคงที่ ไม่งั้นทุกคนหลุดล็อกอินเมื่อรีสตาร์ท)
# บน Vercel ให้ตั้ง SESSION_SECRET เอง; ถ้าไม่ตั้งจะ fallback ไป CRON_SECRET
SESSION_SECRET = (
    os.getenv("SESSION_SECRET") or CRON_SECRET or "dev-insecure-secret-change-me"
).strip()

# ===== Web Push (VAPID) =====
# public key ไม่ลับ (ส่งให้ browser) ตั้ง default ได้; private key เป็นความลับ (env เท่านั้น)
VAPID_PUBLIC_KEY = os.getenv(
    "VAPID_PUBLIC_KEY",
    "BMOPHbewUof-rPSql1T5aHzjwpTt0jOVI3k6U3dsCjHGMeT8p9Bki6U27Z-0rJT9IRhXpDq5HFgx3ZWEx99puTg",
).strip()
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:studentai@example.com").strip()
WEBPUSH_ENABLED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)

# Vercel ตั้ง env VERCEL=1 ให้อัตโนมัติ — ใช้รู้ว่ารันบน serverless (ห้ามตั้ง background loop)
IS_SERVERLESS = bool(os.getenv("VERCEL"))

# ที่เก็บ JSON (ใช้เมื่อไม่ได้ตั้ง Upstash). บน serverless ดิสก์เป็น read-only —
# จึงเขียนลง /tmp แทน (กัน crash; แต่ข้อมูลไม่ถาวร ต้องตั้ง Upstash เพื่อเก็บจริง)
if IS_SERVERLESS and not USE_UPSTASH:
    import tempfile
    DATA_DIR = Path(tempfile.gettempdir()) / "studentai-data"
else:
    DATA_DIR = BASE_DIR / os.getenv("DATA_DIR", "data")
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass

# ===== Time =====
# บน Vercel นาฬิกาเครื่องเป็น UTC — บังคับเป็นเวลาไทยเพื่อให้ "วันนี้"/reminder ตรง
# ใช้ IANA tz ถ้ามี (ต้องมี tzdata), ไม่งั้น fallback เป็น offset คงที่ +7 (ไทยไม่มี DST)
def _load_tz():
    name = os.getenv("TZ", "Asia/Bangkok")
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name)
    except Exception:
        return timezone(timedelta(hours=7))


TZ = _load_tz()


def now() -> datetime:
    """เวลาปัจจุบันโซนไทย (naive — ตัด tzinfo ออกให้เทียบ ISO string ได้เหมือนเดิม)"""
    return datetime.now(TZ).replace(tzinfo=None)


EXPENSE_CATEGORIES = [
    "อาหาร", "เดินทาง", "ของใช้", "บันเทิง", "การศึกษา", "สุขภาพ", "อื่นๆ",
]

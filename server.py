"""Student AI web app — FastAPI backend wrapping the assistant core.

Run:  python server.py   →  http://127.0.0.1:8765
"""
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from assistant import auth, config
from assistant.brain import Brain
from assistant.modules import budget, expense, insight, schedule, streak
from assistant.notify import user_notify

# brain ต้องมี API key — บน Vercel ตอน build อาจยังไม่มี ทำให้ import ล้ม จึงสร้างแบบ lazy
_brain = None


def get_brain() -> Brain:
    global _brain
    if _brain is None:
        _brain = Brain()
    return _brain


STATIC_DIR = Path(__file__).parent / "static"


def _reminder_loop():
    """Fire due reminders every 60s while the server is running (local only)."""
    while True:
        try:
            schedule.fire_due_reminders()
        except Exception:
            pass
        time.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # บน serverless (Vercel) ใช้ cron แทน — อย่าตั้ง thread ที่จะถูก kill ทันที
    if not config.IS_SERVERLESS:
        threading.Thread(target=_reminder_loop, daemon=True).start()
    yield


app = FastAPI(title="Student AI", lifespan=lifespan)


def friendly_ai_error(e: Exception) -> str:
    """แปลง error ดิบจาก Gemini เป็นข้อความไทยสั้นๆ ที่ผู้ใช้เข้าใจได้"""
    s = str(e)
    if "429" in s or "RESOURCE_EXHAUSTED" in s:
        if "PerDay" in s:
            return (f"โควต้าฟรีรายวันของ {config.MODEL} หมดแล้ว — จะรีเซ็ตประมาณ "
                    "14:00-15:00 น. ตามเวลาไทย หรือเปลี่ยน MODEL ใน .env เป็น "
                    "gemini-2.5-flash-lite (โควต้าฟรีต่อวันเยอะกว่ามาก) แล้วรีสตาร์ทเซิร์ฟเวอร์")
        return ("ยิงถี่เกินโควต้าฟรีต่อนาทีของ Gemini — รอสัก 1 นาทีแล้วกดลองอีกครั้ง")
    if "503" in s or "UNAVAILABLE" in s or "overloaded" in s.lower():
        return "ตอนนี้ Gemini มีคนใช้เยอะ — รอสักครู่แล้วกดลองอีกครั้ง (ลอง retry ให้ 3 รอบแล้ว)"
    if "API key" in s or "401" in s or "403" in s or "PERMISSION_DENIED" in s:
        return "API key ไม่ถูกต้องหรือหมดสิทธิ์ — เช็ค GEMINI_API_KEY ใน .env"
    if "404" in s and "model" in s.lower():
        return f"ไม่รู้จักโมเดล '{config.MODEL}' — เช็คค่า MODEL ใน .env"
    return f"เรียก Gemini ไม่สำเร็จ: {s[:200]}"


class MessageIn(BaseModel):
    text: str


class CategoryIn(BaseModel):
    category: str


class BudgetIn(BaseModel):
    monthly: float | None = None
    categories: dict[str, float] | None = None


class LoginIn(BaseModel):
    username: str
    pin: str


class DiscordIn(BaseModel):
    webhook: str = ""


class PushSubIn(BaseModel):
    endpoint: str
    keys: dict = {}
    expirationTime: float | None = None


class EndpointIn(BaseModel):
    endpoint: str


class ChangePinIn(BaseModel):
    old_pin: str
    new_pin: str


class DeleteAccountIn(BaseModel):
    pin: str


async def require_user(sid: str = Cookie(default="")) -> str:
    """ตรวจ session cookie แล้วตั้ง current_user ของ request (async เพื่อให้
    contextvar ส่งต่อไปยัง sync endpoint ที่รันใน threadpool ได้)"""
    username = auth.verify_token(sid)
    if not username:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    auth.current_user.set(username)
    return username


def _issue_session(response: Response, token: str):
    response.set_cookie(
        "sid", token, max_age=90 * 86400, httponly=True,
        samesite="lax", secure=config.IS_SERVERLESS, path="/",
    )


@app.get("/api/check")
def check_username(username: str = ""):
    """ใช้ให้หน้า login รู้ว่าชื่อนี้มีแล้วหรือยัง (สลับโหมดเข้าระบบ/สมัคร)"""
    u = auth.normalize_username(username)
    return {"valid": auth.valid_username(u), "exists": auth.user_exists(u)}


@app.post("/api/register")
def register(body: LoginIn, response: Response):
    token, err = auth.register(body.username, body.pin)
    if not token:
        raise HTTPException(400, err)
    _issue_session(response, token)
    return {"ok": True, "username": auth.normalize_username(body.username)}


@app.post("/api/login")
def login(body: LoginIn, response: Response):
    token, err = auth.login(body.username, body.pin)
    if not token:
        raise HTTPException(401, err)
    _issue_session(response, token)
    return {"ok": True, "username": auth.normalize_username(body.username)}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: str = Depends(require_user)):
    return {"username": user}


@app.post("/api/account/pin")
def account_change_pin(body: ChangePinIn, user: str = Depends(require_user)):
    ok, err = auth.change_pin(user, body.old_pin, body.new_pin)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True}


@app.delete("/api/account")
def account_delete(body: DeleteAccountIn, response: Response, user: str = Depends(require_user)):
    token, _ = auth.login(user, body.pin)  # ยืนยันด้วย PIN ก่อนลบ
    if not token:
        raise HTTPException(400, "PIN ไม่ถูกต้อง — ยกเลิกการลบบัญชี")
    auth.delete_user(user)
    response.delete_cookie("sid", path="/")
    return {"ok": True}


def dashboard_data() -> dict:
    summary = expense.monthly_summary()
    summary.pop("items", None)
    return {
        "summary": summary,
        "tasks": schedule.list_tasks(),
        "pending_reminders": schedule.pending_reminders()[:5],
        "budget": budget.status(),
        "streak": streak.status(),
        "notify": user_notify.status(),
        "channels": {
            "sheets": bool(config.GOOGLE_SHEETS_CREDENTIALS_FILE),
            "api_key": bool(config.GEMINI_API_KEY),
            "groq": bool(config.GROQ_API_KEY),
            "model": config.MODEL,
        },
    }


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/dashboard")
def get_dashboard(user: str = Depends(require_user)):
    return dashboard_data()


@app.post("/api/message")
def post_message(msg: MessageIn, user: str = Depends(require_user)):
    if not config.GEMINI_API_KEY:
        raise HTTPException(500, "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env")
    try:
        result = get_brain().process(msg.text)
    except Exception as e:
        raise HTTPException(502, friendly_ai_error(e))

    intent = result.get("intent", "chat")
    payload = {"intent": intent, "reply": result.get("reply", "")}
    if intent == "expense" and result.get("expense"):
        payload["expense"] = expense.record(result["expense"])
        streak.record_activity()
    elif intent == "schedule" and result.get("schedule"):
        payload["task"] = schedule.add_task(result["schedule"])
        streak.record_activity()
    payload["dashboard"] = dashboard_data()
    return payload


@app.post("/api/slip")
def post_slip(file: UploadFile = File(...), user: str = Depends(require_user)):
    if not config.GEMINI_API_KEY:
        raise HTTPException(500, "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env")
    suffix = Path(file.filename or "slip.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name
    try:
        parsed = get_brain().parse_slip(tmp_path)
    except Exception as e:
        raise HTTPException(502, friendly_ai_error(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if parsed.get("amount") is None:
        raise HTTPException(422, "อ่านยอดเงินจากสลิปไม่ได้ ลองรูปที่ชัดกว่านี้")
    saved = expense.record(parsed)
    streak.record_activity()
    return {
        "intent": "expense",
        "reply": f"บันทึกจากสลิปแล้ว: {saved.get('description', '')} {saved.get('amount', 0):,.0f} บาท",
        "expense": saved,
        "dashboard": dashboard_data(),
    }


@app.post("/api/tasks/{task_id}/done")
def post_task_done(task_id: int, user: str = Depends(require_user)):
    if not schedule.mark_done(task_id):
        raise HTTPException(404, "ไม่พบงานนี้")
    streak.record_activity()
    return {"ok": True, "dashboard": dashboard_data()}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, user: str = Depends(require_user)):
    if not schedule.delete_task(task_id):
        raise HTTPException(404, "ไม่พบงานนี้")
    return {"ok": True, "dashboard": dashboard_data()}


@app.get("/api/summary")
def get_summary(month: str = "", user: str = Depends(require_user)):
    """Month summary incl. individual items. month format: YYYY-MM"""
    try:
        if month:
            y, m = month.split("-")
            return expense.monthly_summary(int(y), int(m))
        return expense.monthly_summary()
    except ValueError:
        raise HTTPException(400, "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)")


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int, user: str = Depends(require_user)):
    if not expense.delete(expense_id):
        raise HTTPException(404, "ไม่พบรายการนี้")
    return {"ok": True, "dashboard": dashboard_data()}


@app.patch("/api/expenses/{expense_id}")
def patch_expense(expense_id: int, body: CategoryIn, user: str = Depends(require_user)):
    updated = expense.update_category(expense_id, body.category)
    if not updated:
        raise HTTPException(404, "ไม่พบรายการนี้")
    return {"ok": True, "expense": updated, "dashboard": dashboard_data()}


@app.get("/api/export/expenses.csv")
def export_expenses(user: str = Depends(require_user)):
    # utf-8-sig BOM so Thai text opens correctly in Excel
    return Response(
        content=expense.to_csv().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="expenses.csv"'},
    )


@app.get("/api/notify/settings")
def notify_settings_get(user: str = Depends(require_user)):
    s = user_notify.get_settings()
    return {
        "discord_set": bool(s.get("discord_webhook")),
        "push": len(s.get("push_subscriptions", [])),
        "webpush_enabled": config.WEBPUSH_ENABLED,
    }


@app.post("/api/notify/settings")
def notify_settings_set(body: DiscordIn, user: str = Depends(require_user)):
    url = body.webhook.strip()
    if url and "discord.com/api/webhooks/" not in url and "discordapp.com/api/webhooks/" not in url:
        raise HTTPException(400, "ลิงก์ไม่ถูกต้อง — ต้องเป็น Discord webhook (https://discord.com/api/webhooks/...)")
    user_notify.set_discord(url)
    return {"ok": True, "dashboard": dashboard_data()}


@app.post("/api/notify/test")
def notify_test(user: str = Depends(require_user)):
    sent = user_notify.send("ทดสอบแจ้งเตือนจาก Student AI — ใช้งานได้แล้ว ✅", title="🔔 ทดสอบ")
    if not sent:
        raise HTTPException(
            400, "ยังไม่ได้ตั้งช่องแจ้งเตือน — ใส่ Discord webhook หรือกดเปิดแจ้งเตือนบนเครื่องก่อน")
    return {"ok": True, "sent_via": sent}


# ───────── web push ─────────

@app.get("/api/push/vapid")
def push_vapid():
    return {"enabled": config.WEBPUSH_ENABLED,
            "publicKey": config.VAPID_PUBLIC_KEY if config.WEBPUSH_ENABLED else ""}


@app.post("/api/push/subscribe")
def push_subscribe(body: PushSubIn, user: str = Depends(require_user)):
    user_notify.add_subscription(body.model_dump(exclude_none=True))
    return {"ok": True, "dashboard": dashboard_data()}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: EndpointIn, user: str = Depends(require_user)):
    user_notify.remove_subscription(body.endpoint)
    return {"ok": True, "dashboard": dashboard_data()}


# ───────── budget ─────────

@app.get("/api/budgets")
def get_budgets(user: str = Depends(require_user)):
    return budget.status()


@app.post("/api/budgets")
def post_budgets(body: BudgetIn, user: str = Depends(require_user)):
    budget.set_budgets(monthly=body.monthly, categories=body.categories)
    return {"ok": True, "budget": budget.status(), "dashboard": dashboard_data()}


# ───────── AI insight ─────────

@app.get("/api/insight")
def get_insight(force: bool = False, user: str = Depends(require_user)):
    if not config.GEMINI_API_KEY:
        # ยังตอบได้ด้วย rule-based fallback ภายใน insight.generate()
        pass
    return insight.generate(force=force)


# ───────── streak ─────────

@app.get("/api/streak")
def get_streak(user: str = Depends(require_user)):
    return streak.status()


# ───────── cron (GitHub Actions / Vercel Cron) ─────────

@app.api_route("/api/cron/remind", methods=["GET", "POST"])
def cron_remind(request: Request, key: str = ""):
    """ยิง reminder ที่ถึงกำหนดของทุก user. ป้องกันด้วย CRON_SECRET (?key= หรือ Bearer)."""
    if config.CRON_SECRET:
        authz = request.headers.get("authorization", "")
        bearer = authz[7:] if authz.lower().startswith("bearer ") else ""
        if key != config.CRON_SECRET and bearer != config.CRON_SECRET:
            raise HTTPException(401, "unauthorized")
    total, messages = 0, []
    for username in auth.list_users():
        tok = auth.current_user.set(username)
        try:
            fired = schedule.fire_due_reminders()
        finally:
            auth.current_user.reset(tok)
        total += len(fired)
        messages += [f["message"] for f in fired]
    return {"ok": True, "fired": total, "messages": messages}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)

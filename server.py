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
from assistant.notify import senders

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


async def require_user(sid: str = Cookie(default="")) -> str:
    """ตรวจ session cookie แล้วตั้ง current_user ของ request (async เพื่อให้
    contextvar ส่งต่อไปยัง sync endpoint ที่รันใน threadpool ได้)"""
    username = auth.verify_token(sid)
    if not username:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    auth.current_user.set(username)
    return username


@app.post("/api/login")
def login(body: LoginIn, response: Response):
    token, err = auth.register_or_login(body.username, body.pin)
    if not token:
        raise HTTPException(401, err)
    response.set_cookie(
        "sid", token, max_age=90 * 86400, httponly=True,
        samesite="lax", secure=config.IS_SERVERLESS, path="/",
    )
    return {"ok": True, "username": auth.normalize_username(body.username)}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: str = Depends(require_user)):
    return {"username": user}


def dashboard_data() -> dict:
    summary = expense.monthly_summary()
    summary.pop("items", None)
    return {
        "summary": summary,
        "tasks": schedule.list_tasks(),
        "pending_reminders": schedule.pending_reminders()[:5],
        "budget": budget.status(),
        "streak": streak.status(),
        "channels": {
            "sheets": bool(config.GOOGLE_SHEETS_CREDENTIALS_FILE),
            "discord": bool(config.DISCORD_WEBHOOK_URL),
            "line": bool(config.LINE_CHANNEL_ACCESS_TOKEN and config.LINE_USER_ID),
            "api_key": bool(config.GEMINI_API_KEY),
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


@app.post("/api/notify/test")
def notify_test(user: str = Depends(require_user)):
    sent = senders.broadcast("🔔 ทดสอบแจ้งเตือนจาก Student AI — ใช้งานได้แล้ว!")
    if not sent:
        raise HTTPException(
            500, "ส่งไม่สำเร็จ — ยังไม่ได้ตั้งค่า Discord/LINE ใน .env หรือค่าไม่ถูกต้อง")
    return {"ok": True, "sent_via": sent}


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

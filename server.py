"""Student AI web app — FastAPI backend wrapping the assistant core.

Run:  python server.py   →  http://127.0.0.1:8765
"""
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from assistant import config
from assistant.brain import Brain
from assistant.modules import expense, schedule
from assistant.notify import senders

brain = Brain()
STATIC_DIR = Path(__file__).parent / "static"


def _reminder_loop():
    """Fire due reminders every 60s while the server is running."""
    while True:
        try:
            schedule.fire_due_reminders()
        except Exception:
            pass
        time.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
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


def dashboard_data() -> dict:
    summary = expense.monthly_summary()
    summary.pop("items", None)
    return {
        "summary": summary,
        "tasks": schedule.list_tasks(),
        "pending_reminders": schedule.pending_reminders()[:5],
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
def get_dashboard():
    return dashboard_data()


@app.post("/api/message")
def post_message(msg: MessageIn):
    if not config.GEMINI_API_KEY:
        raise HTTPException(500, "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env")
    try:
        result = brain.process(msg.text)
    except Exception as e:
        raise HTTPException(502, friendly_ai_error(e))

    intent = result.get("intent", "chat")
    payload = {"intent": intent, "reply": result.get("reply", "")}
    if intent == "expense" and result.get("expense"):
        payload["expense"] = expense.record(result["expense"])
    elif intent == "schedule" and result.get("schedule"):
        payload["task"] = schedule.add_task(result["schedule"])
    payload["dashboard"] = dashboard_data()
    return payload


@app.post("/api/slip")
def post_slip(file: UploadFile = File(...)):
    if not config.GEMINI_API_KEY:
        raise HTTPException(500, "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env")
    suffix = Path(file.filename or "slip.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name
    try:
        parsed = brain.parse_slip(tmp_path)
    except Exception as e:
        raise HTTPException(502, friendly_ai_error(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if parsed.get("amount") is None:
        raise HTTPException(422, "อ่านยอดเงินจากสลิปไม่ได้ ลองรูปที่ชัดกว่านี้")
    saved = expense.record(parsed)
    return {
        "intent": "expense",
        "reply": f"บันทึกจากสลิปแล้ว: {saved.get('description', '')} {saved.get('amount', 0):,.0f} บาท",
        "expense": saved,
        "dashboard": dashboard_data(),
    }


@app.post("/api/tasks/{task_id}/done")
def post_task_done(task_id: int):
    if not schedule.mark_done(task_id):
        raise HTTPException(404, "ไม่พบงานนี้")
    return {"ok": True, "dashboard": dashboard_data()}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    if not schedule.delete_task(task_id):
        raise HTTPException(404, "ไม่พบงานนี้")
    return {"ok": True, "dashboard": dashboard_data()}


@app.get("/api/summary")
def get_summary(month: str = ""):
    """Month summary incl. individual items. month format: YYYY-MM"""
    try:
        if month:
            y, m = month.split("-")
            return expense.monthly_summary(int(y), int(m))
        return expense.monthly_summary()
    except ValueError:
        raise HTTPException(400, "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)")


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int):
    if not expense.delete(expense_id):
        raise HTTPException(404, "ไม่พบรายการนี้")
    return {"ok": True, "dashboard": dashboard_data()}


@app.patch("/api/expenses/{expense_id}")
def patch_expense(expense_id: int, body: CategoryIn):
    updated = expense.update_category(expense_id, body.category)
    if not updated:
        raise HTTPException(404, "ไม่พบรายการนี้")
    return {"ok": True, "expense": updated, "dashboard": dashboard_data()}


@app.get("/api/export/expenses.csv")
def export_expenses():
    # utf-8-sig BOM so Thai text opens correctly in Excel
    return Response(
        content=expense.to_csv().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="expenses.csv"'},
    )


@app.post("/api/notify/test")
def notify_test():
    sent = senders.broadcast("🔔 ทดสอบแจ้งเตือนจาก Student AI — ใช้งานได้แล้ว!")
    if not sent:
        raise HTTPException(
            500, "ส่งไม่สำเร็จ — ยังไม่ได้ตั้งค่า Discord/LINE ใน .env หรือค่าไม่ถูกต้อง")
    return {"ok": True, "sent_via": sent}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)

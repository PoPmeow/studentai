# Student AI 🎓 — ผู้ช่วยส่วนตัวสำหรับนักศึกษา

ผู้ช่วย AI ภาษาไทย ขับเคลื่อนด้วย **Gemini** — พิมพ์/พูดภาษาคนได้เลย ระบบจะ detect intent เองว่าเป็นเรื่อง **ตารางเรียน/deadline** หรือ **รายจ่าย** แล้ว route ไปยัง module ที่ถูกต้องอัตโนมัติ ใช้ได้ทั้งบนคอมและมือถือ (ติดตั้งเป็นแอปแบบ PWA ได้)

## ฟีเจอร์

- 💬 **แชทอัจฉริยะ** — แยก intent (รายจ่าย / ตารางงาน / event ส่วนตัว / คุยเล่น) ในข้อความเดียว + auto-retry เวลา API ล่ม
- 🎤 **พูดแทนพิมพ์** — กดไมค์พูดภาษาไทยบันทึกได้เลย (Web Speech API)
- 🧾 **อ่านสลิป** — แนบรูป/ลาก/วาง แล้ว AI ดึงยอด+หมวดให้
- 📊 **Dashboard + AI Insight** — สรุปสัปดาห์โดย AI + กราฟแนวโน้มรายจ่าย/donut หมวด
- 🎯 **งบ + เป้าหมาย** — ตั้งงบรายเดือน/รายหมวด progress ring เตือนใกล้/เกินงบ
- 📅 **ปฏิทิน + 🔥 Streak** — ปฏิทินรวม deadline/แผน/event + ระบบ streak และ badge
- 🔔 **เตือนอัตโนมัติ** — ยิง Discord/LINE ตามเวลา
- 👥 **หลายบัญชี** — ล็อกอินด้วยชื่อผู้ใช้ + PIN, ข้อมูลแต่ละคนแยกกัน (ให้เพื่อนใช้ได้)

## Architecture

```
 Input (text / voice / slip image)
        │
        ▼
 ┌──────────────────┐
 │     Gemini       │  intent detection · parsing · planning (1 API call)
 └────────┬─────────┘
    ┌─────┴──────┐
    ▼            ▼
 Schedule     Expense ── Budget · AI Insight · Streak
 module       module
    │            │
 Discord/     storage backend
 LINE push    (JSON local  /  Upstash Redis บน Vercel)
```

## รันในเครื่อง

```powershell
pip install -r requirements.txt
copy .env.example .env
# แก้ .env ใส่ GEMINI_API_KEY (สร้างฟรีที่ aistudio.google.com/apikey)

python server.py     # 🌐 Web app (แนะนำ) → เปิด http://127.0.0.1:8765
python main.py       # 💻 หรือใช้แบบ CLI ใน terminal ก็ได้
```

ในเครื่องจะเก็บข้อมูลลงไฟล์ `data/*.json` และมี reminder loop ในตัว (เช็คทุก 60 วิ)

## 🚀 Deploy ขึ้น Vercel + GitHub

> Vercel เป็น serverless — ไฟล์ในเครื่องไม่ถูกเก็บถาวร และรัน background loop ไม่ได้
> โปรเจกต์นี้จึงเก็บข้อมูลบน **Upstash Redis** และยิง reminder ด้วย **GitHub Actions cron**
> (โค้ดชุดเดียวกัน — ถ้าไม่ตั้ง `UPSTASH_*` จะ fallback เป็นไฟล์ JSON อัตโนมัติ)

**1. Push ขึ้น GitHub**
```powershell
git add -A
git commit -m "Student AI: web app + features + Vercel deploy"
git push
```
> `.env` และไฟล์ service account ถูก `.gitignore` ไว้แล้ว — ความลับไม่หลุด

**2. สร้าง Upstash Redis**
- บน Vercel → โปรเจกต์ → **Storage → Create → Upstash Redis** (มีฟรีทีเออร์)
- มันจะใส่ `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ให้อัตโนมัติ

**3. ตั้ง Environment Variables บน Vercel** (Settings → Environment Variables)
```
GEMINI_API_KEY   = AIza...
MODEL            = gemini-2.5-flash
CRON_SECRET      = <สุ่มรหัสอะไรก็ได้>
SESSION_SECRET   = <สุ่มรหัสอีกตัว — ใช้เซ็น login; ถ้าไม่ตั้งจะใช้ CRON_SECRET แทน>
TZ               = Asia/Bangkok
# (optional) DISCORD_WEBHOOK_URL, LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID
```
แล้ว Import repo จาก GitHub → Deploy (ใช้ `vercel.json` ที่เตรียมไว้แล้ว ไม่ต้องตั้งค่าเพิ่ม)

**4. เปิด reminder อัตโนมัติ (GitHub Actions)** — ที่ repo บน GitHub → Settings → Secrets and variables → Actions → เพิ่ม:
```
APP_URL      = https://<ชื่อโปรเจกต์>.vercel.app
CRON_SECRET  = <รหัสเดียวกับบน Vercel>
```
workflow `.github/workflows/remind.yml` จะยิง `/api/cron/remind` ทุก ~10 นาทีให้เอง

## วิธีใช้ (web app)

| ทำ | ผล |
|---|---|
| พิมพ์/พูด `จ่ายข้าว 65 บาท` | บันทึกหมวด "อาหาร" ทันที |
| พิมพ์/พูด `วันพุธมีส่ง OS lab` | สร้างแผนอ่าน + ตั้ง reminder |
| แนบ/ลาก/วางรูปสลิป | อ่านสลิปด้วย vision → บันทึกรายจ่าย |

**คีย์ลัด:** `Ctrl+1..5` สลับหน้า · `/` หรือ `Ctrl+K` ช่องพิมพ์ · `Ctrl+U` แนบสลิป · `Ctrl+V` วางรูป · `↑/↓` ข้อความเก่า · `[` `]` เลื่อนเดือน · `?` ดูทั้งหมด
**คลิกขวา:** การ์ดงาน → เสร็จ/คัดลอกแผน/ลบ · รายการรายจ่าย → คัดลอก/เปลี่ยนหมวด/ลบ

## ตั้งค่า Notification (optional)

- **Discord** — สร้าง webhook: Server Settings → Integrations → Webhooks → ใส่ใน `DISCORD_WEBHOOK_URL`
- **LINE** — ⚠️ LINE Notify ปิดแล้ว (มี.ค. 2025) ใช้ **LINE Messaging API** แทน: สร้าง channel ที่ [developers.line.biz](https://developers.line.biz) → เอา Channel access token + User ID ใส่ `.env`

## โครงสร้างโปรเจกต์

```
app/
├── server.py                  # FastAPI web app (รันในเครื่อง + เป็น core ของ Vercel)
├── main.py                    # CLI entry — chat / remind / watch
├── api/index.py               # Vercel serverless entrypoint (re-export server.app)
├── vercel.json                # Vercel build + routes + daily cron
├── .github/workflows/remind.yml  # GitHub Actions cron ยิง reminder ทุก 10 นาที
├── assistant/
│   ├── brain.py               # Core brain: Gemini (intent + parse + plan + retry)
│   ├── config.py              # .env + timezone + serverless detection
│   ├── modules/               # schedule · expense · budget · insight · streak
│   ├── storage/               # backend (JSON/Upstash) · json_store · sheets
│   └── notify/senders.py      # Discord webhook + LINE Messaging API
├── static/                    # index.html · style.css · app.js · PWA (manifest, sw, icon)
└── data/                      # (local เท่านั้น) expenses · tasks · reminders · budgets · streak
```

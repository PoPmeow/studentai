# Student AI 🎓 — ผู้ช่วยส่วนตัวสำหรับนักศึกษา

ผู้ช่วย AI ภาษาไทย ขับเคลื่อนด้วย **Gemini 2.5 Flash** — พิมพ์ภาษาคนได้เลย ระบบจะ detect intent เองว่าเป็นเรื่อง **ตารางเรียน/deadline** หรือ **รายจ่าย** แล้ว route ไปยัง module ที่ถูกต้องอัตโนมัติ

## Architecture

```
 Input (text / slip image)
        │
        ▼
 ┌──────────────────┐
 │ Gemini 2.5 Flash │  intent detection · parsing · planning (1 API call)
 └────────┬─────────┘
    ┌─────┴──────┐
    ▼            ▼
 Schedule     Expense
 module       module
    │            │
 Discord/     Google
 LINE push    Sheets
    └─────┬──────┘
          ▼
   Local JSON (data/) — source of truth
```

## ติดตั้ง

```powershell
pip install -r requirements.txt
copy .env.example .env
# แก้ .env ใส่ GEMINI_API_KEY (สร้างฟรีที่ aistudio.google.com/apikey)

python server.py     # 🌐 Web app (แนะนำ) → เปิด http://127.0.0.1:8765
python main.py       # 💻 หรือใช้แบบ CLI ใน terminal ก็ได้
```

> Web app มี reminder loop ในตัว (เช็คทุก 60 วิ) — แค่เปิดเซิร์ฟเวอร์ทิ้งไว้ reminder จะยิงเอง

## วิธีใช้

| พิมพ์ | สิ่งที่เกิดขึ้น |
|---|---|
| `จ่ายข้าว 65 บาท` | บันทึกหมวด "อาหาร" ลง JSON + Sheets ทันที |
| `วันพุธมีส่ง OS lab` | สร้างแผนอ่านหนังสือ + ตั้ง reminder อัตโนมัติ |
| `/slip slip.jpg` | อ่านสลิปด้วย vision → บันทึกรายจ่าย |
| `/tasks` | ดูงานที่ค้าง |
| `/done 3` | ปิดงาน #3 |
| `/summary` | สรุปรายจ่ายเดือนนี้แยกหมวด |
| `/remind` | ยิง reminder ที่ถึงกำหนดออก Discord/LINE |
| `/quit` | ออก |

## คีย์ลัด & คลิกขวา (web app)

- `Ctrl+1/2/3` สลับหน้า แชท/งาน/รายจ่าย · `/` หรือ `Ctrl+K` โฟกัสช่องพิมพ์ · `?` ดูคีย์ลัดทั้งหมด
- `Ctrl+U` แนบรูปสลิป · `Ctrl+V` วางรูปจากคลิปบอร์ด · ลากรูปมาวางก็ได้
- `↑/↓` ในช่องพิมพ์ เรียกข้อความเก่า · `[` `]` เลื่อนดูเดือนในหน้ารายจ่าย
- **คลิกขวา**ที่การ์ดงาน → เสร็จ/คัดลอกแผน/ลบ · คลิกขวารายการรายจ่าย → คัดลอก/เปลี่ยนหมวด/ลบ
- ปุ่ม **Export CSV** ในหน้ารายจ่าย ดาวน์โหลดทั้งหมดเปิดใน Excel ได้ · ปุ่ม **ทดสอบแจ้งเตือน** ใน sidebar ลองยิง Discord/LINE

## Reminder อัตโนมัติ

Reminder ถูกเก็บไว้ใน `data/reminders.json` — ให้ระบบยิงเองตามเวลา มี 2 ทาง:

```powershell
python main.py watch    # รันค้างไว้ เช็คทุก 60 วิ
python main.py remind   # เช็คครั้งเดียว (เหมาะกับ Task Scheduler)
```

ตั้ง Windows Task Scheduler ให้รัน `python F:\app\main.py remind` ทุก 5–15 นาทีก็ได้

## ตั้งค่า Notification (optional)

- **Discord** — สร้าง webhook: Server Settings → Integrations → Webhooks แล้วเอา URL ใส่ `DISCORD_WEBHOOK_URL`
- **LINE** — ⚠️ LINE Notify ปิดบริการแล้ว (มี.ค. 2025) โปรเจกต์นี้จึงใช้ **LINE Messaging API** แทน: สร้าง channel ที่ [developers.line.biz](https://developers.line.biz) → เอา Channel access token + User ID ใส่ใน `.env`

## ตั้งค่า Google Sheets (optional)

1. สร้าง project ใน Google Cloud Console → เปิดใช้ Sheets API + Drive API
2. สร้าง Service Account → download key เป็น JSON → วางไฟล์ไว้ในโฟลเดอร์นี้
3. ใส่ path ไฟล์ใน `GOOGLE_SHEETS_CREDENTIALS_FILE`
4. สร้าง Google Sheet ชื่อตาม `GOOGLE_SHEET_NAME` แล้ว **แชร์ให้อีเมลของ service account** (สิทธิ์ Editor)

ถ้าไม่ตั้งค่า ระบบจะเก็บลง JSON อย่างเดียว — ใช้งานได้ปกติทุกฟีเจอร์

## หมายเหตุเรื่อง Voice input

Diagram ระบุ text/voice — ตัวโปรแกรมรับเป็น text ดังนั้น voice ให้ใช้ dictation ของ OS/มือถือ (พูดแล้วแปลงเป็นข้อความ) พิมพ์เข้ามาได้เลย หรือต่อ STT (เช่น whisper) ไว้หน้าโปรแกรมเองได้ภายหลัง

## โครงสร้างโปรเจกต์

```
app/
├── main.py                    # CLI entry — chat / remind / watch
├── assistant/
│   ├── brain.py               # Core brain: Gemini (intent + parse + plan)
│   ├── config.py              # .env settings
│   ├── ui.py                  # rich terminal UI
│   ├── modules/
│   │   ├── schedule.py        # study planner + reminders
│   │   └── expense.py         # expense record + monthly summary
│   ├── storage/
│   │   ├── json_store.py      # local JSON (source of truth)
│   │   └── sheets.py          # Google Sheets mirror (optional)
│   └── notify/
│       └── senders.py         # Discord webhook + LINE Messaging API
└── data/                      # expenses.json · tasks.json · reminders.json
```

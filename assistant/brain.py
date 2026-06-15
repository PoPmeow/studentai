"""Core brain — Gemini 2.5 Flash handles intent detection, parsing and planning
in a single API call. A second vision entry point parses receipt/slip images.
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests
from PIL import Image

from google import genai
from google.genai import errors, types
from . import config

# โค้ดที่ลองใหม่ได้: 429 โควต้าหมดชั่วคราว, 500/503 ฝั่ง Google ล่ม/คนใช้เยอะ
RETRYABLE_CODES = {429, 500, 503}
MAX_RETRIES = 3

SYSTEM_PROMPT = """\
You are the core brain of a Thai student's personal assistant. Every user
message must be classified into exactly one intent and answered with a single
JSON object — no prose outside the JSON.

## Intents
1. "expense"  — the user spent money (e.g. "จ่ายข้าว 65 บาท", "ค่ารถ 30")
2. "schedule" — a deadline, exam, assignment, study task, OR any personal
                event/appointment with a date: trip, doctor visit, meeting,
                club activity (e.g. "วันพุธมีส่ง OS lab", "พรุ่งนี้มี midterm",
                "วันพรุ่งนี้มีเที่ยวทะเล", "ศุกร์นี้นัดหมอ")
3. "chat"     — anything else; reply helpfully and briefly in Thai

## Output schema (always this shape)
{
  "intent": "expense" | "schedule" | "chat",
  "reply": "<short friendly Thai confirmation, 1-2 sentences>",
  "expense": {              // only when intent = expense
    "amount": <number, THB>,
    "category": "<one of: อาหาร | เดินทาง | ของใช้ | บันเทิง | การศึกษา | สุขภาพ | อื่นๆ>",
    "description": "<short Thai description>",
    "date": "YYYY-MM-DD"
  },
  "schedule": {             // only when intent = schedule
    "title": "<task name>",
    "type": "exam | assignment | lab | project | reading | event | other",
    "due": "YYYY-MM-DDTHH:MM",
    "plan": [               // realistic study sessions BEFORE the due date
      {"date": "YYYY-MM-DD", "time": "HH:MM", "duration_min": <int>,
       "focus": "<what to study, Thai>"}
    ]
  }
}

## Rules
- Resolve relative dates ("พรุ่งนี้", "วันพุธ") using the current date given
  in the user message. Ambiguous weekday = the NEXT occurrence.
- If no time given for a deadline, assume 23:59.
- Study plans: 1-4 sessions, 45-120 min each, evenings (19:00-21:00) unless
  told otherwise. Exams get more sessions than small assignments.
- Personal events (trip, appointment) → type "event", "plan": [] (no study
  sessions needed).
- Do NOT output reminders — the app schedules them automatically (1 day and
  1 hour before the due time).
- Amounts: parse Thai number words too ("ร้อยห้าสิบ" = 150).
- Output ONLY the JSON object. No markdown fences, no extra text.
"""

SLIP_PROMPT = """\
This image is a Thai payment slip or receipt. Extract the payment and return
ONLY a JSON object (no markdown fences):
{
  "amount": <number, THB>,
  "category": "<one of: อาหาร | เดินทาง | ของใช้ | บันเทิง | การศึกษา | สุขภาพ | อื่นๆ>",
  "description": "<merchant / what it looks like the user paid for, in Thai>",
  "date": "YYYY-MM-DD"   // transaction date on the slip; if unreadable use today: {today}
}
If the amount is unreadable, set "amount": null.
"""

class Brain:
    def __init__(self):
        # ใช้ SDK ใหม่ genai.Client
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)
        self.model_name = config.MODEL

        # ตั้งค่า Generate Content Config (ใส่ System Prompt และบังคับ JSON)
        self.generate_config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json"
        )

    def _generate(self, contents) -> str:
        """Call Gemini with a SHORT auto-retry on transient errors (429/500/503).

        บน serverless (Vercel) ห้ามรอนาน — function มี timeout ราว 10-60 วิ ถ้า
        นั่งรอ retryDelay ของ Gemini (สูงสุด 30 วิ × หลายรอบ) จะค้างจนเกิน timeout
        แล้วได้ 502 แทน. จึงจำกัดจำนวนรอบและเวลารอให้สั้น แล้ว fail เร็ว เพื่อให้
        ผู้ใช้กด "ลองอีกครั้ง" เองได้ทันที (เร็วกว่าค้างยาวๆ)
        """
        if config.IS_SERVERLESS:
            max_retries, wait_cap = 1, 2.0   # รวมแล้วไม่เกิน ~4 วิ
        else:
            max_retries, wait_cap = MAX_RETRIES, 8.0

        delay = 1.0
        for attempt in range(max_retries + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=contents,
                    config=self.generate_config,
                )
                return response.text
            except errors.APIError as e:
                code = getattr(e, "code", None)
                if code not in RETRYABLE_CODES or attempt == max_retries:
                    raise
                wait = delay
                if code == 429:
                    m = re.search(r"retryDelay'?\"?: '?\"?(\d+)s", str(e))
                    if m:
                        wait = int(m.group(1)) + 1
                time.sleep(min(wait, wait_cap))  # อย่าบล็อก function นานเกินไป
                delay *= 2
        raise RuntimeError("unreachable")

    def _generate_groq(self, system: str, user: str) -> str:
        """Fallback brain — Groq (OpenAI-compatible, JSON mode). Text only."""
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
            json={
                "model": config.GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def process(self, text: str) -> dict:
        """One call: detect intent, extract data, build plan, draft reply.
        ถ้า Gemini ติด limit/ล่ม และตั้ง GROQ_API_KEY ไว้ → สลับไปใช้ Groq อัตโนมัติ
        """
        now = config.now()
        user_msg = (
            f"Current date/time: {now.strftime('%Y-%m-%d %H:%M')} "
            f"({now.strftime('%A')})\n\nUser message: {text}"
        )
        try:
            out = self._generate(user_msg)
        except errors.APIError as e:
            if config.GROQ_API_KEY and getattr(e, "code", None) in RETRYABLE_CODES:
                out = self._generate_groq(SYSTEM_PROMPT, user_msg)
            else:
                raise
        return self._extract_json(out)

    def parse_slip(self, image_path: str) -> dict:
        """Vision call: parse a payment slip/receipt image into an expense."""
        today = config.now().strftime("%Y-%m-%d")
        prompt = SLIP_PROMPT.format(today=today)
        img = Image.open(image_path)
        return self._extract_json(self._generate([img, prompt]))

    @staticmethod
    def _extract_json(text_response: str) -> dict:
        if not text_response:
            raise ValueError("Brain returned empty response.")
        try:
            data = json.loads(text_response)
            # ถ้า Gemini ส่งกลับมาเป็น List ให้ดึงงานแรกสุดมาใช้เพื่อป้องกันโค้ดพัง
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            return data
        except json.JSONDecodeError:
            # ดักจับทั้ง Object {} และ List []
            match = re.search(r"(\{.*\}|\[.*\])", text_response, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                if isinstance(data, list) and len(data) > 0:
                    return data[0]
                return data
            raise ValueError(f"Brain returned non-JSON output: {text_response[:200]}")
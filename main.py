"""Student AI — Thai student personal assistant powered by Gemini.

Usage:
  python main.py            interactive chat (default)
  python main.py remind     fire due reminders once, then exit
                            (hook this to Windows Task Scheduler / cron)
  python main.py watch      check reminders every 60s forever
"""
import sys
import time
from pathlib import Path

from assistant import config, ui
from assistant.brain import Brain
from assistant.modules import expense, schedule


def handle_message(brain: Brain, text: str) -> None:
    with ui.thinking():
        result = brain.process(text)

    intent = result.get("intent", "chat")
    if intent == "expense" and result.get("expense"):
        saved = expense.record(result["expense"])
        ui.expense_saved(saved)
    elif intent == "schedule" and result.get("schedule"):
        saved = schedule.add_task(result["schedule"])
        ui.task_saved(saved)
    if result.get("reply"):
        ui.chat_reply(result["reply"])


def handle_slip(brain: Brain, path_str: str) -> None:
    path = Path(path_str.strip().strip('"'))
    if not path.exists():
        ui.error(f"ไม่พบไฟล์: {path}")
        return
    with ui.thinking():
        parsed = brain.parse_slip(str(path))
    if parsed.get("amount") is None:
        ui.error("อ่านยอดเงินจากสลิปไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น")
        return
    saved = expense.record(parsed)
    ui.expense_saved(saved)


def handle_command(brain: Brain, line: str) -> bool:
    """Handle slash commands. Returns False when the user wants to quit."""
    cmd, _, arg = line.partition(" ")
    cmd = cmd.lower()

    if cmd in ("/quit", "/exit", "/q"):
        return False
    elif cmd == "/slip":
        if not arg:
            ui.error("ใช้แบบนี้: /slip <path รูปสลิป>  เช่น  /slip slip.jpg")
        else:
            handle_slip(brain, arg)
    elif cmd == "/tasks":
        ui.task_list(schedule.list_tasks())
    elif cmd == "/done":
        if arg.strip().isdigit() and schedule.mark_done(int(arg)):
            ui.chat_reply(f"เยี่ยม! ปิดงาน #{arg} แล้ว ✅")
        else:
            ui.error("ใช้แบบนี้: /done <เลขงานจาก /tasks>")
    elif cmd == "/summary":
        ui.summary(expense.monthly_summary())
    elif cmd == "/remind":
        ui.reminders_fired(schedule.fire_due_reminders(), schedule.pending_reminders())
    elif cmd == "/help":
        ui.banner()
    else:
        ui.error(f"ไม่รู้จักคำสั่ง {cmd} — ลอง /help")
    return True


def interactive() -> None:
    if not config.GEMINI_API_KEY:
        ui.error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY — copy .env.example เป็น .env แล้วใส่ key ก่อน")
        sys.exit(1)

    brain = Brain()
    ui.banner()

    # fire anything that came due while the app was closed
    fired = schedule.fire_due_reminders()
    if fired:
        ui.reminders_fired(fired, [])

    while True:
        try:
            line = ui.console.input("[bold medium_purple3]คุณ ▸ [/bold medium_purple3]").strip()
        except (KeyboardInterrupt, EOFError):
            break
        if not line:
            continue
        try:
            if line.startswith("/"):
                if not handle_command(brain, line):
                    break
            else:
                handle_message(brain, line)
        except Exception as e:
            ui.error(str(e))

    ui.console.print("\n[grey58]บ๊ายบาย ขยันอ่านหนังสือด้วยนะ 👋[/grey58]")


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "chat"
    if mode == "remind":
        fired = schedule.fire_due_reminders()
        ui.reminders_fired(fired, schedule.pending_reminders())
    elif mode == "watch":
        ui.console.print("[grey58]เฝ้าดู reminder ทุก 60 วินาที (Ctrl+C เพื่อหยุด)[/grey58]")
        try:
            while True:
                fired = schedule.fire_due_reminders()
                if fired:
                    ui.reminders_fired(fired, [])
                time.sleep(60)
        except KeyboardInterrupt:
            pass
    else:
        interactive()


if __name__ == "__main__":
    main()

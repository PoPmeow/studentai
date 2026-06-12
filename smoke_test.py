"""Offline smoke test — exercises storage, modules and UI without API calls."""
from assistant import ui
from assistant.brain import Brain  # noqa: F401 — import check only
from assistant.modules import expense, schedule

saved = expense.record({
    "amount": 65, "category": "อาหาร",
    "description": "ข้าวมันไก่", "date": "2026-06-11",
})
ui.expense_saved(saved)

task = schedule.add_task({
    "title": "OS lab", "type": "lab", "due": "2026-06-17T23:59",
    "plan": [
        {"date": "2026-06-13", "time": "19:00", "duration_min": 90,
         "focus": "ทบทวน scheduler + ทำ lab ข้อ 1-2"},
        {"date": "2026-06-16", "time": "19:00", "duration_min": 120,
         "focus": "ทำ lab ให้เสร็จ + เทสต์"},
    ],
    "reminders": [
        {"at": "2026-06-13T19:00", "message": "ได้เวลาเริ่มทำ OS lab แล้ว!"},
        {"at": "2026-06-16T19:00", "message": "พรุ่งนี้ส่ง OS lab อย่าลืมเทสต์"},
    ],
})
ui.task_saved(task)
ui.task_list(schedule.list_tasks())
ui.summary(expense.monthly_summary())
ui.reminders_fired(schedule.fire_due_reminders(), schedule.pending_reminders())
ui.banner()
print("SMOKE TEST PASSED")

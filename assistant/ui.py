"""Terminal UI — rich-based, color-coded to match the architecture diagram:
purple = core brain, green = schedule module, orange = expense module.
"""
from rich.align import Align
from rich.console import Console, Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

BRAIN = "medium_purple3"
SCHEDULE = "spring_green3"
EXPENSE = "dark_orange"
MUTED = "grey58"

BANNER = r"""
   _____ __            __           __  ___  ____
  / ___// /___  ______/ /__  ____  / /_/   |/  _/
  \__ \/ __/ / / / __  / _ \/ __ \/ __/ /| |/ /
 ___/ / /_/ /_/ / /_/ /  __/ / / / /_/ ___ / /
/____/\__/\__,_/\__,_/\___/_/ /_/\__/_/  /_/___/
"""


def banner():
    console.print(Text(BANNER, style=f"bold {BRAIN}"))
    console.print(
        Align.center(Text("Student AI — ผู้ช่วยส่วนตัว ⚡ GEMINI", style="bold")),
    )
    console.print(
        Align.center(Text("พิมพ์ได้เลย เช่น  \"จ่ายข้าว 65 บาท\"  หรือ  \"วันพุธมีส่ง OS lab\"", style=MUTED)),
    )
    console.print(
        Align.center(Text("คำสั่ง:  /slip <ไฟล์รูป>   /tasks   /summary   /remind   /help   /quit", style=MUTED)),
        "",
    )


def thinking():
    return console.status(f"[{BRAIN}]🧠 AI กำลังคิด...", spinner="dots")


def chat_reply(reply: str):
    console.print(Panel(reply, border_style=BRAIN, title="💬 ตอบกลับ", title_align="left"))


def expense_saved(expense: dict):
    synced = expense.get("synced", "disabled")
    sync_text = {
        "ok": "[green]✓ Google Sheets[/green]",
        "disabled": f"[{MUTED}]JSON เท่านั้น (ยังไม่ตั้งค่า Sheets)[/{MUTED}]",
    }.get(synced, f"[red]✗ Sheets ล้มเหลว — เก็บใน JSON แล้ว[/red]")

    body = (
        f"[bold]{expense.get('description', '-')}[/bold]\n"
        f"จำนวนเงิน : [bold {EXPENSE}]{expense.get('amount', 0):,.2f} บาท[/bold {EXPENSE}]\n"
        f"หมวด      : {expense.get('category', '-')}\n"
        f"วันที่     : {expense.get('date', '-')}\n"
        f"บันทึก    : {sync_text}"
    )
    console.print(Panel(body, border_style=EXPENSE, title="💸 บันทึกรายจ่ายแล้ว", title_align="left"))


def task_saved(task: dict):
    lines = [
        f"[bold]{task['title']}[/bold]  [{MUTED}]({task.get('type', 'other')})[/{MUTED}]",
        f"กำหนดส่ง : [bold {SCHEDULE}]{task.get('due', '-')}[/bold {SCHEDULE}]",
    ]
    plan = task.get("plan", [])
    if plan:
        table = Table(show_header=True, header_style=f"bold {SCHEDULE}", box=None, pad_edge=False)
        table.add_column("วันที่")
        table.add_column("เวลา")
        table.add_column("นาที", justify="right")
        table.add_column("อ่าน/ทำอะไร")
        for s in plan:
            table.add_row(s.get("date", ""), s.get("time", ""),
                          str(s.get("duration_min", "")), s.get("focus", ""))
        content = Group(Text.from_markup("\n".join(lines)), Text(""), table)
    else:
        content = Text.from_markup("\n".join(lines))

    subtitle = f"ตั้ง reminder ไว้ {task.get('reminder_count', 0)} รายการ"
    console.print(Panel(content, border_style=SCHEDULE,
                        title="📚 สร้างแผนอ่านหนังสือแล้ว", title_align="left",
                        subtitle=subtitle, subtitle_align="right"))


def task_list(tasks: list):
    if not tasks:
        console.print(Panel("ไม่มีงานค้าง 🎉", border_style=SCHEDULE))
        return
    table = Table(header_style=f"bold {SCHEDULE}", border_style=MUTED,
                  title="📋 งานที่ค้างอยู่", title_style=f"bold {SCHEDULE}")
    table.add_column("#", justify="right")
    table.add_column("งาน")
    table.add_column("ประเภท")
    table.add_column("กำหนดส่ง")
    table.add_column("แผน", justify="right")
    for t in tasks:
        table.add_row(str(t.get("id")), t.get("title", ""), t.get("type", ""),
                      t.get("due", "-"), f"{len(t.get('plan', []))} ครั้ง")
    console.print(table)


def summary(data: dict):
    table = Table(header_style=f"bold {EXPENSE}", border_style=MUTED,
                  title=f"📊 สรุปรายจ่ายเดือน {data['month']}",
                  title_style=f"bold {EXPENSE}")
    table.add_column("หมวด")
    table.add_column("ยอด (บาท)", justify="right")
    table.add_column("สัดส่วน", justify="right")
    total = data["total"] or 1
    for cat, amt in data["by_category"].items():
        table.add_row(cat, f"{amt:,.2f}", f"{amt / total * 100:.0f}%")
    table.add_section()
    table.add_row("[bold]รวม[/bold]", f"[bold]{data['total']:,.2f}[/bold]",
                  f"{data['count']} รายการ")
    console.print(table)


def reminders_fired(fired: list, pending: list):
    if fired:
        for r in fired:
            console.print(f"  [green]✓[/green] ส่งแล้ว ({', '.join(r['sent_via'])}): {r['message']}")
    else:
        console.print(f"[{MUTED}]ยังไม่มี reminder ถึงกำหนดตอนนี้[/{MUTED}]")
    if pending:
        console.print(f"[{MUTED}]รออยู่ {len(pending)} รายการ — ตัวถัดไป {pending[0]['at']}[/{MUTED}]")


def error(message: str):
    console.print(Panel(message, border_style="red", title="⚠ ผิดพลาด", title_align="left"))

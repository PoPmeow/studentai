"""Google Sheets storage (optional). Falls back silently to JSON-only mode
when credentials are not configured.
"""
from datetime import datetime

from .. import config

HEADERS = ["วันที่", "รายการ", "หมวด", "จำนวนเงิน (บาท)", "บันทึกเมื่อ"]


class SheetsStore:
    def __init__(self):
        self._sheet = None

    @property
    def enabled(self) -> bool:
        return bool(config.GOOGLE_SHEETS_CREDENTIALS_FILE)

    def _worksheet(self):
        if self._sheet is None:
            import gspread

            client = gspread.service_account(
                filename=config.GOOGLE_SHEETS_CREDENTIALS_FILE
            )
            try:
                book = client.open(config.GOOGLE_SHEET_NAME)
            except gspread.SpreadsheetNotFound:
                book = client.create(config.GOOGLE_SHEET_NAME)
            try:
                ws = book.worksheet("Expenses")
            except gspread.WorksheetNotFound:
                ws = book.add_worksheet("Expenses", rows=1000, cols=10)
                ws.append_row(HEADERS)
            self._sheet = ws
        return self._sheet

    def append_expense(self, expense: dict) -> None:
        """Append one expense row. Raises on network/auth errors."""
        self._worksheet().append_row([
            expense.get("date", ""),
            expense.get("description", ""),
            expense.get("category", ""),
            expense.get("amount", 0),
            datetime.now().strftime("%Y-%m-%d %H:%M"),
        ])


sheets = SheetsStore()

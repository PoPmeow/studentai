/* Student AI — frontend logic */

const $ = (sel) => document.querySelector(sel);
const chatScroll = $("#chat-scroll");
const input = $("#message-input");
const sendBtn = $("#send-btn");

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                     "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CATEGORIES = ["อาหาร", "เดินทาง", "ของใช้", "บันเทิง", "การศึกษา", "สุขภาพ", "อื่นๆ"];

const fmtMoney = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const date = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`;
  return iso.includes("T")
    ? `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : date;
}

function daysLeft(iso) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso) - new Date()) / 86400000);
  if (isNaN(diff)) return null;
  if (diff < 0) return { text: "เลยกำหนดแล้ว!", urgent: true };
  if (diff === 0) return { text: "วันนี้!", urgent: true };
  if (diff === 1) return { text: "พรุ่งนี้", urgent: true };
  return { text: `อีก ${diff} วัน`, urgent: diff <= 2 };
}

function toast(msg, ok = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("ok", ok);
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3800);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ───────── chat rendering ───────── */

function hideHero() {
  const hero = $("#chat-hero");
  if (hero) hero.remove();
}

const scrollBottomBtn = $("#scroll-bottom");

const isNearBottom = () =>
  chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 120;

function scrollToBottom(smooth = true) {
  chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

chatScroll.addEventListener("scroll", () => {
  if (isNearBottom()) scrollBottomBtn.classList.remove("show");
});
scrollBottomBtn.addEventListener("click", () => {
  scrollToBottom();
  scrollBottomBtn.classList.remove("show");
});

function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function addMsg(side, html, withTime = true) {
  hideHero();
  const stick = side === "user" || isNearBottom();
  const div = document.createElement("div");
  div.className = `msg ${side}`;
  const avatar = side === "bot" ? `<div class="avatar">⚡</div>` : "";
  const time = withTime ? `<div class="msg-time">${timeNow()}</div>` : "";
  div.innerHTML = `${avatar}<div class="msg-body"><div class="bubble">${html}</div>${time}</div>`;
  chatScroll.appendChild(div);
  // เลื่อนตามเฉพาะตอนผู้ใช้อยู่ล่างสุด — ถ้าเลื่อนขึ้นไปอ่านของเก่า จะขึ้นปุ่มแทน
  if (stick) scrollToBottom();
  else scrollBottomBtn.classList.add("show");
  return div;
}

function addTyping() {
  return addMsg("bot", `<span class="typing"><i></i><i></i><i></i></span>`, false);
}

function addError(message, retry = null) {
  const div = addMsg("bot",
    `<span class="err-text">⚠ ${esc(message)}</span>` +
    (retry ? `<button class="retry-btn">🔄 ลองอีกครั้ง</button>` : ""));
  if (retry) {
    div.querySelector(".retry-btn").addEventListener("click", (e) => {
      e.target.disabled = true;
      retry();
    }, { once: true });
  }
}

function expenseCardHTML(e) {
  const sync = e.synced === "ok"
    ? `<div class="sync-note ok">✓ บันทึกลง Google Sheets แล้ว</div>`
    : e.synced === "disabled"
      ? `<div class="sync-note">เก็บใน JSON (ยังไม่ตั้งค่า Sheets)</div>`
      : `<div class="sync-note fail">⚠ Sheets ล้มเหลว — เก็บใน JSON แล้ว</div>`;
  return `<div class="card card-expense">
    <span class="card-tag">💸 รายจ่าย</span>
    <div class="card-amount">${fmtMoney(e.amount)}<small>บาท</small></div>
    <div class="card-desc">${esc(e.description)}</div>
    <div class="card-meta"><span>หมวด <b>${esc(e.category)}</b></span><span>วันที่ <b>${fmtDate(e.date)}</b></span></div>
    ${sync}
  </div>`;
}

function taskCardHTML(t) {
  const left = daysLeft(t.due);
  const planRows = (t.plan || []).map((s) => `
    <div class="plan-row">
      <span class="plan-when">${fmtDate(s.date)} ${esc(s.time || "")}</span>
      <span class="plan-focus">${esc(s.focus)}</span>
      <span class="plan-min">${s.duration_min || ""} นาที</span>
    </div>`).join("");
  return `<div class="card card-schedule">
    <span class="card-tag">📚 แผนอ่านหนังสือ</span>
    <div class="card-title">${esc(t.title)}</div>
    <div class="card-due">ส่ง ${fmtDate(t.due)}${left ? ` · ${left.text}` : ""}</div>
    ${planRows ? `<div class="plan">${planRows}</div>` : ""}
    <div class="sync-note">🔔 ตั้ง reminder ไว้ ${t.reminder_count ?? 0} รายการ</div>
  </div>`;
}

/* ───────── API ───────── */

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

let busy = false;
const inputHistory = [];
let historyIdx = -1;

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  inputHistory.push(text);
  historyIdx = -1;
  addMsg("user", esc(text));
  input.value = "";
  const typing = addTyping();
  try {
    const data = await api("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    typing.remove();
    renderResult(data);
  } catch (err) {
    typing.remove();
    addError(err.message, () => sendMessage(text));
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

async function sendSlip(file) {
  if (busy || !file) return;
  busy = true;
  sendBtn.disabled = true;
  const url = URL.createObjectURL(file);
  addMsg("user", `<img class="slip-thumb" src="${url}" alt="slip">`);
  const typing = addTyping();
  try {
    const fd = new FormData();
    fd.append("file", file);
    const data = await api("/api/slip", { method: "POST", body: fd });
    typing.remove();
    renderResult(data);
  } catch (err) {
    typing.remove();
    addError(err.message, () => sendSlip(file));
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

function renderResult(data) {
  if (data.reply) addMsg("bot", esc(data.reply));
  if (data.expense) addMsg("bot", expenseCardHTML(data.expense));
  if (data.task) addMsg("bot", taskCardHTML(data.task));
  if (data.dashboard) renderDashboard(data.dashboard);
}

/* ───────── dashboard / views ───────── */

function renderDashboard(d) {
  $("#task-count").textContent = d.tasks.length || "";
  $("#model-name").textContent = d.channels.model;
  const conns = { api: d.channels.api_key, sheets: d.channels.sheets, discord: d.channels.discord, line: d.channels.line };
  for (const [k, on] of Object.entries(conns)) {
    $(`#conn-${k}`).classList.toggle("on", !!on);
  }

  // right rail — money
  $("#rail-total").textContent = fmtMoney(d.summary.total);
  const cats = Object.entries(d.summary.by_category || {});
  const maxAmt = Math.max(...cats.map(([, v]) => v), 1);
  $("#rail-minibars").innerHTML = cats.slice(0, 7).map(([c, v]) =>
    `<div class="rail-minibar" title="${esc(c)} ${fmtMoney(v)}฿" style="height:${Math.max(8, v / maxAmt * 100)}%"></div>`
  ).join("") || `<div class="rail-empty">ยังไม่มีรายจ่ายเดือนนี้</div>`;

  // right rail — tasks
  $("#rail-task-list").innerHTML = d.tasks.slice(0, 5).map((t) => {
    const left = daysLeft(t.due);
    return `<div class="rail-task ${left?.urgent ? "urgent" : ""}">
      <span class="rail-task-dot"></span>
      <span>${esc(t.title)}</span>
      <span class="rail-task-due">${left ? left.text : ""}</span>
    </div>`;
  }).join("") || `<div class="rail-empty">ไม่มีงานค้าง 🎉</div>`;

  // right rail — next reminder
  const next = d.pending_reminders[0];
  $("#rail-reminder").innerHTML = next
    ? `<span class="when">${fmtDate(next.at)}</span>${esc(next.message)}`
    : `<span class="rail-empty">ไม่มี reminder รออยู่</span>`;

  renderTasksView(d.tasks);
  loadExpensesView();
}

function renderTasksView(tasks) {
  $("#task-grid").innerHTML = tasks.map((t) => {
    const left = daysLeft(t.due);
    return `<div class="task-card ${left?.urgent ? "urgent" : ""}" data-id="${t.id}" data-title="${esc(t.title)}">
      <div class="task-type">${esc(t.type)}</div>
      <div class="task-name">${esc(t.title)}</div>
      <div class="task-due">ส่ง ${fmtDate(t.due)} · <b>${left ? left.text : "-"}</b></div>
      ${(t.plan || []).length ? `<div class="plan">${t.plan.map((s) => `
        <div class="plan-row">
          <span class="plan-when">${fmtDate(s.date)} ${esc(s.time || "")}</span>
          <span class="plan-focus">${esc(s.focus)}</span>
        </div>`).join("")}</div>` : ""}
      <button class="task-done-btn" data-id="${t.id}">✓ เสร็จแล้ว</button>
    </div>`;
  }).join("") || `<div class="empty-state">ยังไม่มีงาน — ไปบอกในแชทได้เลย เช่น "ศุกร์นี้ส่งรายงานฟิสิกส์"</div>`;
}

/* expenses view has its own month state */
let viewMonth = new Date();

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function shiftMonth(delta) {
  viewMonth.setMonth(viewMonth.getMonth() + delta);
  loadExpensesView();
}

async function loadExpensesView() {
  let s;
  try {
    s = await api(`/api/summary?month=${monthKey(viewMonth)}`);
  } catch (err) { toast(err.message); return; }

  const now = new Date();
  const isCurrent = monthKey(now) === s.month;
  $("#month-label").textContent = s.month;
  $("#month-next").style.visibility = isCurrent ? "hidden" : "visible";
  $("#expense-month-label").textContent =
    `${isCurrent ? "เดือนนี้" : "เดือน " + s.month} · ${s.count} รายการ`;
  $("#total-amount").textContent = fmtMoney(s.total);
  $("#total-count").textContent = `${s.count} รายการ`;

  const cats = Object.entries(s.by_category || {});
  $("#cat-bars").innerHTML = cats.map(([c, v], i) => `
    <div class="cat-bar-row" style="animation-delay:${i * 60}ms">
      <div class="cat-bar-label"><span>${esc(c)}</span><b>${fmtMoney(v)} ฿</b></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(v / (s.total || 1)) * 100}%"></div></div>
    </div>`).join("") || `<div class="rail-empty">ไม่มีรายจ่ายเดือนนี้</div>`;

  $("#expense-table").innerHTML = (s.items || []).map((e, i) => `
    <div class="exp-row" data-id="${e.id}" data-desc="${esc(e.description)}"
         data-amount="${e.amount}" style="animation-delay:${Math.min(i * 30, 300)}ms">
      <span class="exp-date">${fmtDate(e.date)}</span>
      <span>${esc(e.description)}</span>
      <span class="exp-cat">${esc(e.category)}</span>
      <span class="exp-amt">${fmtMoney(e.amount)} ฿</span>
    </div>`).join("") || `<div class="exp-empty">ไม่มีรายการในเดือนนี้</div>`;
}

/* ───────── view switching ───────── */

function switchView(name) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "chat") input.focus();
}

const activeView = () =>
  document.querySelector(".view.active")?.id.replace("view-", "") || "chat";

/* ───────── context menu ───────── */

const ctxMenu = $("#ctx-menu");

function showCtxMenu(x, y, items) {
  ctxMenu.innerHTML = items.map((it, i) => {
    if (it === "---") return `<div class="ctx-sep"></div>`;
    if (it.label && !it.action) return `<div class="ctx-label">${it.label}</div>`;
    return `<button class="ctx-item ${it.danger ? "danger" : ""}" data-i="${i}">${it.icon || ""} ${it.label}</button>`;
  }).join("");
  ctxMenu._items = items;
  ctxMenu.classList.add("show");
  const rect = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = Math.min(x, innerWidth - rect.width - 10) + "px";
  ctxMenu.style.top = Math.min(y, innerHeight - rect.height - 10) + "px";
}

function hideCtxMenu() { ctxMenu.classList.remove("show"); }

ctxMenu.addEventListener("click", (e) => {
  const btn = e.target.closest(".ctx-item");
  if (!btn) return;
  const item = ctxMenu._items[+btn.dataset.i];
  hideCtxMenu();
  item?.action?.();
});

document.addEventListener("click", (e) => {
  if (!ctxMenu.contains(e.target)) hideCtxMenu();
});
window.addEventListener("blur", hideCtxMenu);

// right-click on a task card
$("#task-grid").addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".task-card");
  if (!card) return;
  e.preventDefault();
  const id = +card.dataset.id;
  const title = card.dataset.title;
  showCtxMenu(e.clientX, e.clientY, [
    { label: title },
    { label: "เสร็จแล้ว", icon: "✓", action: () => taskDone(id) },
    { label: "คัดลอกแผนอ่าน", icon: "📋", action: () => copyTaskPlan(card) },
    "---",
    { label: "ลบงานนี้ (รวม reminder)", icon: "🗑", danger: true, action: () => deleteTask(id) },
  ]);
});

// right-click on an expense row
$("#expense-table").addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".exp-row");
  if (!row) return;
  e.preventDefault();
  const id = +row.dataset.id;
  showCtxMenu(e.clientX, e.clientY, [
    { label: `${row.dataset.desc} · ${fmtMoney(row.dataset.amount)}฿` },
    { label: "คัดลอกรายการ", icon: "📋", action: () => {
        navigator.clipboard.writeText(`${row.dataset.desc} ${row.dataset.amount} บาท`);
        toast("คัดลอกแล้ว", true);
      } },
    {
      label: "เปลี่ยนหมวด…", icon: "🏷", action: () => {
        showCtxMenu(e.clientX, e.clientY, [
          { label: "เลือกหมวดใหม่" },
          ...CATEGORIES.map((c) => ({ label: c, action: () => changeCategory(id, c) })),
        ]);
      },
    },
    "---",
    { label: "ลบรายการนี้", icon: "🗑", danger: true, action: () => deleteExpense(id) },
  ]);
});

/* ───────── actions ───────── */

async function taskDone(id) {
  try {
    const data = await api(`/api/tasks/${id}/done`, { method: "POST" });
    renderDashboard(data.dashboard);
    toast("ปิดงานแล้ว ✓", true);
  } catch (err) { toast(err.message); }
}

async function deleteTask(id) {
  try {
    const data = await api(`/api/tasks/${id}`, { method: "DELETE" });
    renderDashboard(data.dashboard);
    toast("ลบงานและ reminder แล้ว", true);
  } catch (err) { toast(err.message); }
}

async function deleteExpense(id) {
  try {
    const data = await api(`/api/expenses/${id}`, { method: "DELETE" });
    renderDashboard(data.dashboard);
    toast("ลบรายการแล้ว", true);
  } catch (err) { toast(err.message); }
}

async function changeCategory(id, category) {
  try {
    const data = await api(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    renderDashboard(data.dashboard);
    toast(`ย้ายไปหมวด ${category} แล้ว`, true);
  } catch (err) { toast(err.message); }
}

function copyTaskPlan(card) {
  const rows = [...card.querySelectorAll(".plan-row")].map((r) => {
    const when = r.querySelector(".plan-when")?.textContent.trim() || "";
    const focus = r.querySelector(".plan-focus")?.textContent.trim() || "";
    return `• ${when} — ${focus}`;
  });
  const text = `${card.dataset.title}\n${rows.join("\n")}`;
  navigator.clipboard.writeText(text);
  toast("คัดลอกแผนแล้ว", true);
}

/* ───────── keyboard shortcuts ───────── */

const helpModal = $("#help-modal");
const toggleHelp = (show) => helpModal.classList.toggle("show", show ?? !helpModal.classList.contains("show"));

document.addEventListener("keydown", (e) => {
  const typing = document.activeElement === input;

  if (e.key === "Escape") {
    hideCtxMenu();
    toggleHelp(false);
    if (typing) input.blur();
    return;
  }

  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    const views = { "1": "chat", "2": "tasks", "3": "expenses" };
    if (views[e.key]) { e.preventDefault(); switchView(views[e.key]); return; }
    if (e.key.toLowerCase() === "k") { e.preventDefault(); switchView("chat"); input.focus(); return; }
    if (e.key.toLowerCase() === "u") { e.preventDefault(); $("#slip-input").click(); return; }
  }

  if (typing) {
    // recall previous inputs like a terminal
    if (e.key === "ArrowUp" && inputHistory.length) {
      e.preventDefault();
      historyIdx = historyIdx === -1 ? inputHistory.length - 1 : Math.max(0, historyIdx - 1);
      input.value = inputHistory[historyIdx];
    } else if (e.key === "ArrowDown" && historyIdx !== -1) {
      e.preventDefault();
      historyIdx++;
      if (historyIdx >= inputHistory.length) { historyIdx = -1; input.value = ""; }
      else input.value = inputHistory[historyIdx];
    }
    return;
  }

  if (e.key === "/") { e.preventDefault(); switchView("chat"); input.focus(); }
  else if (e.key === "?") { e.preventDefault(); toggleHelp(); }
  else if (e.key === "[" && activeView() === "expenses") shiftMonth(-1);
  else if (e.key === "]" && activeView() === "expenses") {
    if ($("#month-next").style.visibility !== "hidden") shiftMonth(1);
  }
});

/* ───────── events ───────── */

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(input.value);
});

document.querySelectorAll(".chip").forEach((chip) =>
  chip.addEventListener("click", () => sendMessage(chip.dataset.text)));

document.querySelectorAll(".nav-item").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view)));

$("#task-grid").addEventListener("click", async (e) => {
  const btn = e.target.closest(".task-done-btn");
  if (btn) taskDone(+btn.dataset.id);
});

$("#month-prev").addEventListener("click", () => shiftMonth(-1));
$("#month-next").addEventListener("click", () => shiftMonth(1));

$("#help-btn").addEventListener("click", () => toggleHelp(true));
$("#help-close").addEventListener("click", () => toggleHelp(false));
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) toggleHelp(false);
});

/* theme toggle — จำค่าไว้ใน localStorage */
const themeBtn = $("#theme-btn");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  themeBtn.textContent = theme === "dark" ? "☀️ โหมดสว่าง" : "🌙 โหมดมืด";
}
applyTheme(localStorage.getItem("theme") || "light");
themeBtn.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

$("#test-notify-btn").addEventListener("click", async () => {
  try {
    const data = await api("/api/notify/test", { method: "POST" });
    toast(`ส่งทดสอบสำเร็จผ่าน ${data.sent_via.join(", ")} 🎉`, true);
  } catch (err) { toast(err.message); }
});

// slip upload via button
$("#slip-btn").addEventListener("click", () => $("#slip-input").click());
$("#slip-input").addEventListener("change", (e) => {
  if (e.target.files[0]) sendSlip(e.target.files[0]);
  e.target.value = "";
});

// slip via drag & drop
const dropzone = $("#dropzone");
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (e.dataTransfer?.types.includes("Files")) {
    dragDepth++;
    dropzone.classList.add("show");
  }
});
document.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove("show"); }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove("show");
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith("image/")) sendSlip(file);
});

// paste an image straight into the chat (e.g. screenshot of a slip)
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) sendSlip(item.getAsFile());
});

/* ───────── init ───────── */

api("/api/dashboard").then(renderDashboard).catch((e) => toast(e.message));
input.focus();

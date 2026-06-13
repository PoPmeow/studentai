/* Student AI — frontend logic (dashboard · chat · calendar · tasks · expenses) */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                     "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const CATEGORIES = ["อาหาร", "เดินทาง", "ของใช้", "บันเทิง", "การศึกษา", "สุขภาพ", "อื่นๆ"];
const CAT_COLORS = ["#e0823c", "#6a8fe0", "#5bb98c", "#c77dd0", "#e0c14b", "#e06a6a", "#9aa0ad"];

const fmtMoney = (n) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  if (diff < 0) return { text: "เลยกำหนดแล้ว", urgent: true };
  if (diff === 0) return { text: "วันนี้", urgent: true };
  if (diff === 1) return { text: "พรุ่งนี้", urgent: true };
  return { text: `อีก ${diff} วัน`, urgent: diff <= 2 };
}
function toast(msg, ok = false) {
  const el = $("#toast");
  el.textContent = msg; el.classList.toggle("ok", ok); el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 3800);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

const state = { dashboard: null, tasks: [] };

/* ════════ SVG charts ════════ */
function ringSVG(pct, over) {
  const size = 92, stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  const col = over ? "var(--danger)" : "var(--expense)";
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg-soft)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.25,1)"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
      font-family="var(--font-mono)" font-size="17" font-weight="600" fill="${col}">${Math.round(pct)}%</text>
  </svg>`;
}
function donutSVG(segs) {
  const size = 108, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0, parts = "";
  for (const s of segs) {
    const len = c * (s.value / total);
    parts += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
      stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}"
      transform="rotate(-90 ${cx} ${cx})"/>`;
    acc += len;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts}</svg>`;
}
function sparkSVG(values) {
  const max = Math.max(...values, 1);
  return `<div class="spark">${values.map((v) =>
    `<div class="b" style="height:${Math.max(2, v / max * 100)}%" title="${fmtMoney(v)} ฿"></div>`).join("")}</div>`;
}

/* ════════ View switching ════════ */
function switchView(name) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "chat") $("#message-input").focus();
  if (name === "calendar") renderCalendar();
  if (name === "expenses") loadExpensesView();
}
const activeView = () => document.querySelector(".view.active")?.id.replace("view-", "") || "home";

/* ════════ Dashboard ════════ */
function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "สวัสดีตอนเช้า ☀️";
  if (h < 17) return "สวัสดีตอนบ่าย 👋";
  if (h < 20) return "สวัสดีตอนเย็น 🌆";
  return "สวัสดีตอนดึก 🌙";
}

function renderDashboard(d) {
  state.dashboard = d;
  state.tasks = d.tasks || [];

  // sidebar/topbar
  $("#task-count").textContent = d.tasks.length || "";
  $("#model-name").textContent = d.channels.model;
  const conns = { api: d.channels.api_key, sheets: d.channels.sheets, discord: d.channels.discord, line: d.channels.line };
  for (const [k, on] of Object.entries(conns)) $(`#conn-${k}`)?.classList.toggle("on", !!on);

  // hero
  $("#hero-greet").textContent = greeting();
  const now = new Date();
  $("#hero-date").textContent = `${THAI_DOW[now.getDay()]}. ${now.getDate()} ${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;
  const st = d.streak || {};
  $("#hero-streak-chip").innerHTML = st.current ? `🔥 ${st.current} วันติด` : "";

  renderBudget(d.budget);
  renderStreak(st);
  renderDonut(d.summary);
  renderAgenda(d.tasks);
  renderTasksView(d.tasks);
}

function renderBudget(b) {
  const el = $("#budget-body");
  if (!b || !b.monthly_limit) {
    el.innerHTML = `<div class="budget-empty">ยังไม่ได้ตั้งงบ<br><br>
      <button class="mini-btn" onclick="window._openBudget()">⚙ ตั้งงบเดือนนี้</button></div>`;
    return;
  }
  const over = b.spent > b.monthly_limit;
  const alert = b.alerts && b.alerts[0];
  el.innerHTML = `<div class="ring-wrap">
      <div class="ring">${ringSVG(b.pct, over)}</div>
      <div class="ring-info">
        <div class="big">${fmtMoney(b.spent)}<span style="font-size:13px;color:var(--muted)"> / ${fmtMoney(b.monthly_limit)}</span></div>
        <div class="sub">${over ? "เกินงบ " + fmtMoney(-b.remaining) + " บาท" : "เหลือ " + fmtMoney(b.remaining) + " บาท"}</div>
      </div>
    </div>
    ${alert ? `<div class="budget-alert ${alert.level === "over" ? "over" : "warn"}">${esc(alert.text)}</div>` : ""}`;
}

function renderStreak(st) {
  const el = $("#streak-body");
  const hist = new Set(st.history || []);
  const dots = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const key = dd.toISOString().slice(0, 10);
    dots.push(`<div class="sd ${hist.has(key) ? "on" : ""}" title="${key}"></div>`);
  }
  const badges = (st.badges || []).map((b) =>
    `<span class="badge ${b.earned ? "earned" : ""}" title="${esc(b.label)}">${b.icon}</span>`).join("");
  el.innerHTML = `<div class="streak-num">${st.current || 0}<small> วันติด</small></div>
    <div class="streak-sub">สถิติสูงสุด ${st.best || 0} วัน${st.today_done ? " · วันนี้ทำแล้ว ✓" : ""}</div>
    <div class="streak-dots">${dots.join("")}</div>
    <div class="badges">${badges}</div>`;
}

function renderDonut(summary) {
  const el = $("#donut-body");
  const cats = Object.entries(summary.by_category || {});
  if (!cats.length) { el.innerHTML = `<div class="empty-mini">ยังไม่มีรายจ่ายเดือนนี้</div>`; return; }
  const segs = cats.map(([c, v]) => ({ label: c, value: v, color: CAT_COLORS[CATEGORIES.indexOf(c)] || "#9aa0ad" }));
  const legend = segs.map((s) =>
    `<div class="dl"><span class="sw" style="background:${s.color}"></span>
       <span class="nm">${esc(s.label)}</span><span class="vl">${fmtMoney(s.value)}</span></div>`).join("");
  el.innerHTML = `${donutSVG(segs)}<div class="donut-legend">${legend}</div>`;
}

function renderAgenda(tasks) {
  const el = $("#agenda-body");
  const items = (tasks || []).filter((t) => t.due).slice(0, 5);
  if (!items.length) { el.innerHTML = `<div class="empty-mini">ไม่มีงานค้าง 🎉</div>`; return; }
  el.innerHTML = items.map((t) => {
    const left = daysLeft(t.due);
    return `<div class="agenda-item ${left?.urgent ? "urgent" : ""}">
      <span class="agenda-dot"></span><span>${esc(t.title)}</span>
      <span class="agenda-when">${left ? left.text : ""}</span></div>`;
  }).join("");
}

async function loadInsight(force = false) {
  const el = $("#insight-body");
  if (!force) el.innerHTML = `<div class="skeleton-line"></div><div class="skeleton-line short"></div>`;
  try {
    const d = await api(`/api/insight${force ? "?force=true" : ""}`);
    const items = (d.insights || []).map((i) =>
      `<div class="insight-item"><span class="ic">${i.icon || "•"}</span><span>${esc(i.text)}</span></div>`).join("");
    el.innerHTML = `<div class="insight-head">${esc(d.headline || "")}</div>
      <div class="insight-list">${items}</div>
      ${d.tip ? `<div class="insight-tip"><b>เคล็ดลับ:</b> ${esc(d.tip)}</div>` : ""}
      <div class="insight-src">${d.source === "ai" ? "✨ วิเคราะห์โดย AI" : "📊 จากข้อมูลของคุณ"}</div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-mini">โหลด insight ไม่ได้: ${esc(err.message)}</div>`;
  }
}

/* ════════ Chat ════════ */
const chatScroll = $("#chat-scroll");
const input = $("#message-input");
const sendBtn = $("#send-btn");
const scrollBottomBtn = $("#scroll-bottom");
const inputHistory = []; let historyIdx = -1; let busy = false;

const isNearBottom = () => chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 120;
const scrollToBottom = (smooth = true) => chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: smooth ? "smooth" : "auto" });
chatScroll.addEventListener("scroll", () => { if (isNearBottom()) scrollBottomBtn.classList.remove("show"); });
scrollBottomBtn.addEventListener("click", () => { scrollToBottom(); scrollBottomBtn.classList.remove("show"); });

function hideHero() { $("#chat-hero")?.remove(); }
const timeNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function addMsg(side, html, withTime = true) {
  hideHero();
  const stick = side === "user" || isNearBottom();
  const div = document.createElement("div");
  div.className = `msg ${side}`;
  const avatar = side === "bot" ? `<div class="avatar">⚡</div>` : "";
  const time = withTime ? `<div class="msg-time">${timeNow()}</div>` : "";
  div.innerHTML = `${avatar}<div class="msg-body"><div class="bubble">${html}</div>${time}</div>`;
  chatScroll.appendChild(div);
  if (stick) scrollToBottom(); else scrollBottomBtn.classList.add("show");
  return div;
}
const addTyping = () => addMsg("bot", `<span class="typing"><i></i><i></i><i></i></span>`, false);
function addError(message, retry) {
  const div = addMsg("bot", `<span class="err-text">⚠ ${esc(message)}</span>` +
    (retry ? `<button class="retry-btn">🔄 ลองอีกครั้ง</button>` : ""));
  if (retry) div.querySelector(".retry-btn").addEventListener("click", (e) => { e.target.disabled = true; retry(); }, { once: true });
}

function expenseCardHTML(e) {
  const sync = e.synced === "ok" ? `<div class="sync-note ok">✓ บันทึกลง Google Sheets แล้ว</div>`
    : e.synced === "disabled" ? `<div class="sync-note">บันทึกแล้ว</div>`
    : `<div class="sync-note fail">⚠ Sheets ล้มเหลว — เก็บข้อมูลหลักแล้ว</div>`;
  return `<div class="card card-expense"><span class="card-tag">💸 รายจ่าย</span>
    <div class="card-amount">${fmtMoney(e.amount)}<small>บาท</small></div>
    <div class="card-desc">${esc(e.description)}</div>
    <div class="card-meta"><span>หมวด <b>${esc(e.category)}</b></span><span>วันที่ <b>${fmtDate(e.date)}</b></span></div>${sync}</div>`;
}
function taskCardHTML(t) {
  const left = daysLeft(t.due);
  const rows = (t.plan || []).map((s) =>
    `<div class="plan-row"><span class="plan-when">${fmtDate(s.date)} ${esc(s.time || "")}</span>
      <span class="plan-focus">${esc(s.focus)}</span><span class="plan-min">${s.duration_min || ""} น.</span></div>`).join("");
  return `<div class="card card-schedule"><span class="card-tag">📚 ${esc(t.type || "งาน")}</span>
    <div class="card-title">${esc(t.title)}</div>
    <div class="card-due">ส่ง ${fmtDate(t.due)}${left ? ` · ${left.text}` : ""}</div>
    ${rows ? `<div class="plan">${rows}</div>` : ""}
    <div class="sync-note">🔔 ตั้ง reminder ไว้ ${t.reminder_count ?? 0} รายการ</div></div>`;
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  busy = true; sendBtn.disabled = true;
  inputHistory.push(text); historyIdx = -1;
  switchView("chat");
  addMsg("user", esc(text)); input.value = "";
  const typing = addTyping();
  try {
    const data = await api("/api/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    typing.remove(); renderResult(data);
  } catch (err) { typing.remove(); addError(err.message, () => sendMessage(text)); }
  finally { busy = false; sendBtn.disabled = false; input.focus(); }
}
async function sendSlip(file) {
  if (busy || !file) return;
  busy = true; sendBtn.disabled = true;
  switchView("chat");
  const url = URL.createObjectURL(file);
  addMsg("user", `<img class="slip-thumb" src="${url}" alt="slip">`);
  const typing = addTyping();
  try {
    const fd = new FormData(); fd.append("file", file);
    const data = await api("/api/slip", { method: "POST", body: fd });
    typing.remove(); renderResult(data);
  } catch (err) { typing.remove(); addError(err.message, () => sendSlip(file)); }
  finally { busy = false; sendBtn.disabled = false; }
}
function renderResult(data) {
  if (data.reply) addMsg("bot", esc(data.reply));
  if (data.expense) addMsg("bot", expenseCardHTML(data.expense));
  if (data.task) addMsg("bot", taskCardHTML(data.task));
  if (data.dashboard) { renderDashboard(data.dashboard); loadInsight(); }
}

/* ════════ Calendar ════════ */
let calMonth = new Date();
function renderCalendar() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $("#cal-label").textContent = `${THAI_MONTHS[m]} ${y + 543}`;
  $("#cal-next").style.visibility = "visible";

  // collect items per yyyy-mm-dd
  const byDay = {};
  const add = (date, type, label) => {
    const k = (date || "").slice(0, 10);
    if (!k) return; (byDay[k] ||= []).push({ type, label });
  };
  for (const t of state.tasks) {
    if (t.due) add(t.due, t.type || "other", t.title);
    for (const s of (t.plan || [])) add(s.date, "plan", `อ่าน: ${t.title}`);
  }

  let html = THAI_DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const todayKey = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < first; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= days; day++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const items = byDay[key] || [];
    const dots = [...new Set(items.map((i) => i.type))].slice(0, 4)
      .map((t) => `<span class="d ${t}"></span>`).join("");
    html += `<div class="cal-cell ${key === todayKey ? "today" : ""}" data-day="${key}">
      <span class="cal-num">${day}</span><div class="cal-dots">${dots}</div></div>`;
  }
  $("#cal-grid").innerHTML = html;
  $("#cal-grid")._byDay = byDay;
  showCalDay(todayKey.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`) ? todayKey : null);
}
function showCalDay(key) {
  const el = $("#cal-day");
  $$(".cal-cell").forEach((c) => c.classList.toggle("sel", c.dataset.day === key));
  if (!key) { el.innerHTML = ""; return; }
  const items = ($("#cal-grid")._byDay || {})[key] || [];
  el.innerHTML = `<h4>${fmtDate(key)}</h4>` + (items.length
    ? items.map((i) => `<div class="cal-day-item"><span class="tag">${esc(i.type)}</span><span>${esc(i.label)}</span></div>`).join("")
    : `<div class="cal-day-empty">ไม่มีงานหรือนัดหมายวันนี้</div>`);
}

/* ════════ Tasks view ════════ */
function renderTasksView(tasks) {
  $("#task-grid").innerHTML = tasks.map((t) => {
    const left = daysLeft(t.due);
    return `<div class="task-card ${left?.urgent ? "urgent" : ""}" data-id="${t.id}" data-title="${esc(t.title)}">
      <div class="task-type">${esc(t.type)}</div>
      <div class="task-name">${esc(t.title)}</div>
      <div class="task-due">ส่ง ${fmtDate(t.due)} · <b>${left ? left.text : "-"}</b></div>
      ${(t.plan || []).length ? `<div class="plan">${t.plan.map((s) =>
        `<div class="plan-row"><span class="plan-when">${fmtDate(s.date)} ${esc(s.time || "")}</span>
          <span class="plan-focus">${esc(s.focus)}</span></div>`).join("")}</div>` : ""}
      <button class="task-done-btn" data-id="${t.id}">✓ เสร็จแล้ว</button></div>`;
  }).join("") || `<div class="empty-state">ยังไม่มีงาน — ลองพิมพ์ในแชท เช่น "ศุกร์นี้ส่งรายงานฟิสิกส์"</div>`;
}

/* ════════ Expenses view ════════ */
let viewMonth = new Date();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function shiftMonth(delta) { viewMonth.setMonth(viewMonth.getMonth() + delta); loadExpensesView(); }

async function loadExpensesView() {
  let s;
  try { s = await api(`/api/summary?month=${monthKey(viewMonth)}`); } catch (err) { toast(err.message); return; }
  const now = new Date(); const isCurrent = monthKey(now) === s.month;
  $("#month-label").textContent = s.month;
  $("#month-next").style.visibility = isCurrent ? "hidden" : "visible";
  $("#expense-month-label").textContent = `${isCurrent ? "เดือนนี้" : "เดือน " + s.month} · ${s.count} รายการ`;
  $("#total-amount").textContent = fmtMoney(s.total);
  $("#total-count").textContent = `${s.count} รายการ`;

  const cats = Object.entries(s.by_category || {});
  $("#cat-bars").innerHTML = cats.map(([c, v], i) =>
    `<div class="cat-bar-row" style="animation-delay:${i * 60}ms">
      <div class="cat-bar-label"><span>${esc(c)}</span><b>${fmtMoney(v)} ฿</b></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${v / (s.total || 1) * 100}%"></div></div></div>`).join("")
    || `<div class="empty-mini">ไม่มีรายจ่ายเดือนนี้</div>`;

  // daily trend sparkline
  const [yy, mm] = s.month.split("-").map(Number);
  const dim = new Date(yy, mm, 0).getDate();
  const daily = new Array(dim).fill(0);
  for (const e of (s.items || [])) {
    const dnum = parseInt(String(e.date).slice(8, 10), 10);
    if (dnum >= 1 && dnum <= dim) daily[dnum - 1] += Number(e.amount) || 0;
  }
  $("#exp-trend").innerHTML = s.items && s.items.length ? sparkSVG(daily) : "";

  $("#expense-table").innerHTML = (s.items || []).map((e, i) =>
    `<div class="exp-row" data-id="${e.id}" data-desc="${esc(e.description)}" data-amount="${e.amount}"
        style="animation-delay:${Math.min(i * 30, 300)}ms">
      <span class="exp-date">${fmtDate(e.date)}</span><span>${esc(e.description)}</span>
      <span class="exp-cat">${esc(e.category)}</span><span class="exp-amt">${fmtMoney(e.amount)} ฿</span></div>`).join("")
    || `<div class="exp-empty">ไม่มีรายการในเดือนนี้</div>`;
}

/* ════════ Context menu ════════ */
const ctxMenu = $("#ctx-menu");
function showCtxMenu(x, y, items) {
  ctxMenu.innerHTML = items.map((it, i) => it === "---" ? `<div class="ctx-sep"></div>`
    : (it.label && !it.action) ? `<div class="ctx-label">${esc(it.label)}</div>`
    : `<button class="ctx-item ${it.danger ? "danger" : ""}" data-i="${i}">${it.icon || ""} ${esc(it.label)}</button>`).join("");
  ctxMenu._items = items; ctxMenu.classList.add("show");
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = Math.min(x, innerWidth - r.width - 10) + "px";
  ctxMenu.style.top = Math.min(y, innerHeight - r.height - 10) + "px";
}
const hideCtxMenu = () => ctxMenu.classList.remove("show");
ctxMenu.addEventListener("click", (e) => { const b = e.target.closest(".ctx-item"); if (!b) return; const it = ctxMenu._items[+b.dataset.i]; hideCtxMenu(); it?.action?.(); });
document.addEventListener("click", (e) => { if (!ctxMenu.contains(e.target)) hideCtxMenu(); });
window.addEventListener("blur", hideCtxMenu);

$("#task-grid").addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".task-card"); if (!card) return; e.preventDefault();
  const id = +card.dataset.id;
  showCtxMenu(e.clientX, e.clientY, [
    { label: card.dataset.title },
    { label: "เสร็จแล้ว", icon: "✓", action: () => taskDone(id) },
    { label: "คัดลอกแผนอ่าน", icon: "📋", action: () => copyTaskPlan(card) },
    "---",
    { label: "ลบงานนี้ (รวม reminder)", icon: "🗑", danger: true, action: () => deleteTask(id) },
  ]);
});
$("#expense-table").addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".exp-row"); if (!row) return; e.preventDefault();
  const id = +row.dataset.id;
  showCtxMenu(e.clientX, e.clientY, [
    { label: `${row.dataset.desc} · ${fmtMoney(row.dataset.amount)}฿` },
    { label: "คัดลอกรายการ", icon: "📋", action: () => { navigator.clipboard.writeText(`${row.dataset.desc} ${row.dataset.amount} บาท`); toast("คัดลอกแล้ว", true); } },
    { label: "เปลี่ยนหมวด…", icon: "🏷", action: () => showCtxMenu(e.clientX, e.clientY, [{ label: "เลือกหมวดใหม่" }, ...CATEGORIES.map((c) => ({ label: c, action: () => changeCategory(id, c) }))]) },
    "---",
    { label: "ลบรายการนี้", icon: "🗑", danger: true, action: () => deleteExpense(id) },
  ]);
});

/* ════════ Actions ════════ */
async function refreshFrom(data) { if (data.dashboard) { renderDashboard(data.dashboard); loadInsight(); } if (activeView() === "expenses") loadExpensesView(); }
async function taskDone(id) { try { await refreshFrom(await api(`/api/tasks/${id}/done`, { method: "POST" })); toast("ปิดงานแล้ว ✓", true); } catch (e) { toast(e.message); } }
async function deleteTask(id) { try { await refreshFrom(await api(`/api/tasks/${id}`, { method: "DELETE" })); toast("ลบงานแล้ว", true); } catch (e) { toast(e.message); } }
async function deleteExpense(id) { try { await refreshFrom(await api(`/api/expenses/${id}`, { method: "DELETE" })); toast("ลบรายการแล้ว", true); } catch (e) { toast(e.message); } }
async function changeCategory(id, category) { try { await refreshFrom(await api(`/api/expenses/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }) })); toast(`ย้ายไปหมวด ${category}`, true); } catch (e) { toast(e.message); } }
function copyTaskPlan(card) {
  const rows = [...card.querySelectorAll(".plan-row")].map((r) =>
    `• ${r.querySelector(".plan-when")?.textContent.trim()} — ${r.querySelector(".plan-focus")?.textContent.trim()}`);
  navigator.clipboard.writeText(`${card.dataset.title}\n${rows.join("\n")}`); toast("คัดลอกแผนแล้ว", true);
}

/* ════════ Budget modal ════════ */
const budgetModal = $("#budget-modal");
function openBudget() {
  const b = state.dashboard?.budget || {};
  $("#bud-monthly").value = b.monthly_limit || "";
  const set = {}; (b.categories || []).forEach((c) => set[c.category] = c.limit);
  $("#bud-cats").innerHTML = CATEGORIES.map((c) =>
    `<label class="field"><span>${c}</span><input type="number" min="0" data-cat="${c}" value="${set[c] || ""}" placeholder="—"></label>`).join("");
  budgetModal.classList.add("show");
}
window._openBudget = openBudget;
$("#budget-edit").addEventListener("click", openBudget);
$("#bud-save").addEventListener("click", async () => {
  const monthly = parseFloat($("#bud-monthly").value) || 0;
  const categories = {};
  $$("#bud-cats input").forEach((i) => { const v = parseFloat(i.value); if (v > 0) categories[i.dataset.cat] = v; });
  try {
    const data = await api("/api/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly, categories }) });
    budgetModal.classList.remove("show"); renderDashboard(data.dashboard); loadInsight(); toast("บันทึกงบแล้ว", true);
  } catch (e) { toast(e.message); }
});

/* ════════ Voice (Web Speech API) ════════ */
const micBtn = $("#mic-btn");
let recog = null, recording = false;
(function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { micBtn.style.display = "none"; return; }
  recog = new SR(); recog.lang = "th-TH"; recog.interimResults = true; recog.continuous = false;
  recog.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; input.value = t; };
  recog.onend = () => { recording = false; micBtn.classList.remove("recording"); input.focus(); };
  recog.onerror = (e) => { recording = false; micBtn.classList.remove("recording"); if (e.error !== "no-speech") toast("ใช้ไมค์ไม่ได้ ลองพิมพ์แทน"); };
})();
function toggleMic() {
  if (!recog) return toast("เบราว์เซอร์นี้ไม่รองรับเสียง");
  switchView("chat");
  if (recording) { recog.stop(); return; }
  try { recog.start(); recording = true; micBtn.classList.add("recording"); } catch {}
}
micBtn.addEventListener("click", toggleMic);

/* ════════ Theme ════════ */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("theme", t);
  const label = t === "dark" ? "☀️ โหมดสว่าง" : "🌙 โหมดมืด";
  $("#theme-btn").textContent = label;
  $("#theme-btn-m").textContent = t === "dark" ? "☀️" : "🌙";
}
applyTheme(localStorage.getItem("theme") || "light");
const flipTheme = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("#theme-btn").addEventListener("click", flipTheme);
$("#theme-btn-m").addEventListener("click", flipTheme);

/* ════════ Events ════════ */
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); sendMessage(input.value); });
$("#quick-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#quick-input").value; $("#quick-input").value = ""; sendMessage(v); });
$$(".chip").forEach((c) => c.addEventListener("click", () => sendMessage(c.dataset.text)));
$$(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
$("#task-grid").addEventListener("click", (e) => { const b = e.target.closest(".task-done-btn"); if (b) taskDone(+b.dataset.id); });
$("#cal-grid").addEventListener("click", (e) => { const c = e.target.closest(".cal-cell:not(.empty)"); if (c) showCalDay(c.dataset.day); });
$("#cal-prev").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
$("#cal-next").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
$("#month-prev").addEventListener("click", () => shiftMonth(-1));
$("#month-next").addEventListener("click", () => shiftMonth(1));
$("#help-btn").addEventListener("click", () => $("#help-modal").classList.add("show"));
$("#insight-refresh").addEventListener("click", () => { $("#insight-body").innerHTML = `<div class="skeleton-line"></div><div class="skeleton-line short"></div>`; loadInsight(true); });
$$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal-backdrop").classList.remove("show")));
$$(".modal-backdrop").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("show"); }));
$("#test-notify-btn").addEventListener("click", async () => {
  try { const d = await api("/api/notify/test", { method: "POST" }); toast(`ส่งทดสอบผ่าน ${d.sent_via.join(", ")} 🎉`, true); } catch (e) { toast(e.message); }
});

// slip upload + drag/drop + paste
$("#slip-btn").addEventListener("click", () => $("#slip-input").click());
$("#slip-input").addEventListener("change", (e) => { if (e.target.files[0]) sendSlip(e.target.files[0]); e.target.value = ""; });
const dropzone = $("#dropzone"); let dragDepth = 0;
document.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; switchView("chat"); dropzone.classList.add("show"); } });
document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove("show"); } });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; dropzone.classList.remove("show"); const f = e.dataTransfer?.files[0]; if (f && f.type.startsWith("image/")) sendSlip(f); });
document.addEventListener("paste", (e) => { const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/")); if (it) sendSlip(it.getAsFile()); });

/* keyboard shortcuts */
document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (e.key === "Escape") { hideCtxMenu(); $$(".modal-backdrop.show").forEach((m) => m.classList.remove("show")); if (typing) document.activeElement.blur(); return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    const v = { "1": "home", "2": "chat", "3": "calendar", "4": "tasks", "5": "expenses" }[e.key];
    if (v) { e.preventDefault(); switchView(v); return; }
    if (e.key.toLowerCase() === "k") { e.preventDefault(); switchView("chat"); input.focus(); return; }
    if (e.key.toLowerCase() === "u") { e.preventDefault(); $("#slip-input").click(); return; }
    if (e.key.toLowerCase() === "m") { e.preventDefault(); toggleMic(); return; }
  }
  if (typing) {
    if (document.activeElement === input && e.key === "ArrowUp" && inputHistory.length) {
      e.preventDefault(); historyIdx = historyIdx === -1 ? inputHistory.length - 1 : Math.max(0, historyIdx - 1); input.value = inputHistory[historyIdx];
    } else if (document.activeElement === input && e.key === "ArrowDown" && historyIdx !== -1) {
      e.preventDefault(); historyIdx++; if (historyIdx >= inputHistory.length) { historyIdx = -1; input.value = ""; } else input.value = inputHistory[historyIdx];
    }
    return;
  }
  if (e.key === "/") { e.preventDefault(); switchView("chat"); input.focus(); }
  else if (e.key === "?") { e.preventDefault(); $("#help-modal").classList.toggle("show"); }
  else if (e.key === "[" ) { if (activeView() === "expenses") shiftMonth(-1); else if (activeView() === "calendar") { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); } }
  else if (e.key === "]") { if (activeView() === "expenses") { if ($("#month-next").style.visibility !== "hidden") shiftMonth(1); } else if (activeView() === "calendar") { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); } }
});

/* PWA */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/static/sw.js").catch(() => {});
let deferredPrompt = null;
const installBtn = $("#install-btn");
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
installBtn.addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.hidden = true; });

/* init */
api("/api/dashboard").then((d) => { renderDashboard(d); loadInsight(); }).catch((e) => toast(e.message));

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

/* ════════ Inline SVG icons (Lucide-style, currentColor) ════════ */
const ICONS = {
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4h4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  sparkles: '<path d="M9.9 15.5 8.5 14 2.4 12.5a.5.5 0 0 1 0-1L8.5 10l1.4-6.1a.5.5 0 0 1 1 0L12.3 10l6.1 1.5a.5.5 0 0 1 0 1L12.3 14l-1.4 6.1a.5.5 0 0 1-1 0z"/><path d="M20 3v4M22 5h-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pie: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6M22 6l-3-3"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M6 8h12v3a6 6 0 0 1-12 0z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  paperclip: '<path d="M21.4 11 12.2 20.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.9-2.9l8.5-8.5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  "arrow-down": '<path d="M12 5v14M5 12l7 7 7-7"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  tag: '<path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
};
const iconSVG = (name) => ICONS[name]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  : "";
const paintIcons = (root = document) =>
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.dataset.painted) { el.innerHTML = iconSVG(el.dataset.icon); el.dataset.painted = "1"; }
  });

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
  const due = new Date(iso);
  if (isNaN(due)) return null;
  // เทียบเป็น "วันปฏิทิน" (ตัดเวลาออก) — พรุ่งนี้ = 1 วัน ไม่นับวันนี้รวมเข้าไป
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(due); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b - a) / 86400000);
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
    if (res.status === 401 && !path.startsWith("/api/login")) showAuth();
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
  $("#task-count").textContent = d.tasks.filter((t) => t.type !== "class").length || "";
  $("#model-name").textContent = d.channels.model + (d.channels.groq ? " + Groq" : "");
  const conns = { api: d.channels.api_key, sheets: d.channels.sheets,
                  discord: d.notify && d.notify.discord, push: d.notify && d.notify.push > 0 };
  for (const [k, on] of Object.entries(conns)) $(`#conn-${k}`)?.classList.toggle("on", !!on);
  const dw = $("#discord-webhook");
  if (dw) dw.placeholder = (d.notify && d.notify.discord)
    ? "ตั้ง Discord ไว้แล้ว — วางลิงก์ใหม่เพื่อเปลี่ยน" : "วาง Discord webhook URL ของตัวเอง";

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
  const items = (tasks || []).filter((t) => t.due && t.type !== "class").slice(0, 5);
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
  const add = (date, type, label, time = null) => {
    const k = (date || "").slice(0, 10);
    if (!k) return; (byDay[k] ||= []).push({ type, label, time });
  };
  for (const t of state.tasks) {
    if (t.due) {
      const time = t.due.length > 10 ? t.due.slice(11, 16) : null;
      add(t.due, t.type || "other", t.title, time);
    }
    for (const s of (t.plan || [])) add(s.date, "plan", `อ่าน: ${t.title}`, s.time || null);
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
  renderCalAgenda(byDay);
}
function renderCalAgenda(byDay) {
  const el = $("#cal-agenda");
  if (!el) return;
  const bd = byDay || $("#cal-grid")._byDay || {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = `<div class="ag-header">7 วันข้างหน้า</div>`;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const items = (bd[key] || []).slice().sort((a, b) =>
      (a.time || "99:99") <= (b.time || "99:99") ? -1 : 1);
    const dayName = i === 0 ? "วันนี้" : i === 1 ? "พรุ่งนี้" : THAI_DOW[d.getDay()];
    const dayDate = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`;
    const itemsHtml = items.map((it) => {
      if (it.type === "class") {
        const t = it.time ? `<span class="ag-time">${esc(it.time)}</span>` : "";
        return `<div class="ag-item ag-class">${t}<span>${esc(it.label)}</span></div>`;
      }
      if (it.type === "plan") {
        return `<div class="ag-item ag-plan"><span>${esc(it.label)}</span></div>`;
      }
      const ul = daysLeft(key + "T23:59");
      return `<div class="ag-item ag-task${ul?.urgent ? " urgent" : ""}"><span class="ag-tag">${esc(it.type)}</span><span>${esc(it.label)}</span></div>`;
    }).join("") || `<span class="ag-vacant">ว่าง</span>`;
    html += `<div class="ag-day${i === 0 ? " ag-today" : ""}">
      <div class="ag-day-head"><b class="ag-day-name">${dayName}</b><span class="ag-day-date">${dayDate}</span></div>
      <div class="ag-items">${itemsHtml}</div>
    </div>`;
  }
  el.innerHTML = html;
}

/* ════════ Tasks view ════════ */
function renderTasksView(tasks) {
  const workTasks = tasks.filter((t) => t.type !== "class");
  $("#task-grid").innerHTML = workTasks.map((t) => {
    const left = daysLeft(t.due);
    return `<div class="task-card ${left?.urgent ? "urgent" : ""}" data-id="${t.id}" data-title="${esc(t.title)}">
      <div class="task-type">${esc(t.type)}</div>
      <div class="task-name">${esc(t.title)}</div>
      <div class="task-due">ส่ง ${fmtDate(t.due)} · <b>${left ? left.text : "-"}</b></div>
      ${(t.plan || []).length ? `<div class="plan">${t.plan.map((s) =>
        `<div class="plan-row"><span class="plan-when">${fmtDate(s.date)} ${esc(s.time || "")}</span>
          <span class="plan-focus">${esc(s.focus)}</span></div>`).join("")}</div>` : ""}
      <button class="task-done-btn" data-id="${t.id}">✓ เสร็จแล้ว</button></div>`;
  }).join("") || `<div class="empty-state">ยังไม่มีงานค้าง 🎉<br><small>คาบเรียนดูได้ในหน้าปฏิทิน</small></div>`;
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
    : `<button class="ctx-item ${it.danger ? "danger" : ""}" data-i="${i}"><span class="ic">${ICONS[it.icon] ? iconSVG(it.icon) : (it.icon || "")}</span> ${esc(it.label)}</button>`).join("");
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
    { label: "เสร็จแล้ว", icon: "check", action: () => taskDone(id) },
    { label: "คัดลอกแผนอ่าน", icon: "copy", action: () => copyTaskPlan(card) },
    "---",
    { label: "ลบงานนี้ (รวม reminder)", icon: "trash", danger: true, action: () => deleteTask(id) },
  ]);
});
$("#expense-table").addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".exp-row"); if (!row) return; e.preventDefault();
  const id = +row.dataset.id;
  showCtxMenu(e.clientX, e.clientY, [
    { label: `${row.dataset.desc} · ${fmtMoney(row.dataset.amount)}฿` },
    { label: "คัดลอกรายการ", icon: "copy", action: () => { navigator.clipboard.writeText(`${row.dataset.desc} ${row.dataset.amount} บาท`); toast("คัดลอกแล้ว", true); } },
    { label: "เปลี่ยนหมวด…", icon: "tag", action: () => showCtxMenu(e.clientX, e.clientY, [{ label: "เลือกหมวดใหม่" }, ...CATEGORIES.map((c) => ({ label: c, action: () => changeCategory(id, c) }))]) },
    "---",
    { label: "ลบรายการนี้", icon: "trash", danger: true, action: () => deleteExpense(id) },
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
  const next = t === "dark" ? "sun" : "moon";
  const label = t === "dark" ? "โหมดสว่าง" : "โหมดมืด";
  $("#theme-btn").innerHTML = `<span class="ic">${iconSVG(next)}</span> ${label}`;
  $("#theme-btn-m").innerHTML = `<span class="ic">${iconSVG(next)}</span>`;
}
paintIcons();
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
$("#cal-grid").addEventListener("click", (e) => {
  const c = e.target.closest(".cal-cell:not(.empty)");
  if (c) { $$(".cal-cell").forEach((x) => x.classList.remove("sel")); c.classList.add("sel"); }
});
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

$("#discord-save").addEventListener("click", async () => {
  const webhook = $("#discord-webhook").value.trim();
  try {
    const d = await api("/api/notify/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhook }) });
    $("#discord-webhook").value = "";
    renderDashboard(d.dashboard);
    toast(webhook ? "บันทึก Discord แล้ว ✓" : "ลบ Discord webhook แล้ว", true);
  } catch (e) { toast(e.message); }
});

const urlB64ToUint8 = (s) => {
  const b64 = (s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(b64)].map((c) => c.charCodeAt(0)));
};
$("#push-enable").addEventListener("click", async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return toast("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
  try {
    const { enabled, publicKey } = await api("/api/push/vapid");
    if (!enabled) return toast("เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Web Push (VAPID)");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return toast("ยังไม่ได้อนุญาตการแจ้งเตือนในเบราว์เซอร์");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
    const d = await api("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    renderDashboard(d.dashboard);
    toast("เปิดแจ้งเตือนบนเครื่องนี้แล้ว 🔔", true);
  } catch (e) { toast("เปิดแจ้งเตือนไม่สำเร็จ: " + e.message); }
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

/* ════════ Auth ════════ */
const authOverlay = $("#auth-overlay");
function showAuth() { authOverlay.classList.add("show"); setTimeout(() => $("#auth-username")?.focus(), 50); }
function hideAuth() { authOverlay.classList.remove("show"); }

function onAuthed(username) {
  hideAuth();
  $("#current-user").textContent = username;
  api("/api/dashboard").then((d) => { renderDashboard(d); loadInsight(); }).catch((e) => toast(e.message));
}

const authForm = $("#auth-form");
function setAuthMode(mode) {
  authForm.dataset.mode = mode;
  $$(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  $("#auth-sub").textContent = mode === "register"
    ? "ตั้งชื่อผู้ใช้กับ PIN ของคุณเอง (จำไว้ใช้เข้าครั้งหน้า)"
    : "ยินดีต้อนรับกลับ — ใส่ชื่อผู้ใช้กับ PIN";
  $("#auth-submit").textContent = mode === "register" ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  $("#auth-pin2").required = mode === "register";
  $("#auth-error").textContent = "";
}
$$(".auth-tab").forEach((t) => t.addEventListener("click", () => setAuthMode(t.dataset.mode)));

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = authForm.dataset.mode;
  const username = $("#auth-username").value.trim();
  const pin = $("#auth-pin").value.trim();
  const pin2 = $("#auth-pin2").value.trim();
  $("#auth-error").textContent = "";
  if (mode === "register" && pin !== pin2) {
    $("#auth-error").textContent = "PIN ยืนยันไม่ตรงกัน"; return;
  }
  const btn = $("#auth-submit"); btn.disabled = true;
  try {
    const r = await api(mode === "register" ? "/api/register" : "/api/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pin }) });
    $("#auth-pin").value = ""; $("#auth-pin2").value = "";
    onAuthed(r.username);
  } catch (err) {
    $("#auth-error").textContent = err.message;
    // ล็อกอินแล้วไม่พบบัญชี → สลับไปโหมดสมัครให้เลย (คงชื่อไว้)
    if (mode === "login" && /ยังไม่มีบัญชี/.test(err.message)) setAuthMode("register");
  } finally { btn.disabled = false; }
});

$("#logout-btn").addEventListener("click", async () => {
  try { await fetch("/api/logout", { method: "POST" }); } catch {}
  location.reload();
});

$("#account-btn").addEventListener("click", () => {
  ["#pin-old", "#pin-new", "#pin-new2", "#del-pin"].forEach((s) => { $(s).value = ""; });
  $("#pin-error").textContent = ""; $("#del-error").textContent = "";
  $("#account-modal").classList.add("show");
});
$("#pin-save").addEventListener("click", async () => {
  const oldp = $("#pin-old").value.trim(), np = $("#pin-new").value.trim(), np2 = $("#pin-new2").value.trim();
  $("#pin-error").textContent = "";
  if (np !== np2) { $("#pin-error").textContent = "PIN ใหม่ยืนยันไม่ตรงกัน"; return; }
  try {
    await api("/api/account/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old_pin: oldp, new_pin: np }) });
    $("#account-modal").classList.remove("show");
    toast("เปลี่ยน PIN แล้ว ✓", true);
  } catch (e) { $("#pin-error").textContent = e.message; }
});
$("#account-delete").addEventListener("click", async () => {
  $("#del-error").textContent = "";
  if (!confirm("ยืนยันลบบัญชีและข้อมูลทั้งหมดถาวร? กู้คืนไม่ได้")) return;
  try {
    await api("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: $("#del-pin").value.trim() }) });
    toast("ลบบัญชีแล้ว", true);
    setTimeout(() => location.reload(), 700);
  } catch (e) { $("#del-error").textContent = e.message; }
});

/* ════════ Schedule upload modal ════════ */
const THAI_DAYS_FULL = {
  Monday: "จันทร์", Tuesday: "อังคาร", Wednesday: "พุธ",
  Thursday: "พฤหัสบดี", Friday: "ศุกร์", Saturday: "เสาร์", Sunday: "อาทิตย์",
};
const DAY_COLOR = {
  Monday: "#6a8fe0", Tuesday: "#5bb98c", Wednesday: "#e0823c",
  Thursday: "#c77dd0", Friday: "#e0c14b", Saturday: "#e06a6a", Sunday: "#9aa0ad",
};

let schedSlots = [];

function schedState(id) {
  ["#sched-initial","#sched-loading","#sched-preview","#sched-saved","#sched-error"].forEach((s) =>
    $(s).classList.toggle("hidden", s !== id));
}

function renderSchedSlots() {
  $("#sched-slots-list").innerHTML = schedSlots.map((s, i) => {
    const day = THAI_DAYS_FULL[s.day] || s.day;
    const col = DAY_COLOR[s.day] || "var(--primary)";
    const room = s.room ? ` <span class="sched-room">${esc(s.room)}</span>` : "";
    return `<div class="sched-slot" data-idx="${i}">
      <button class="sched-del-btn" data-idx="${i}" aria-label="ลบ ${esc(s.subject)}" title="ลบ">✕</button>
      <span class="sched-day-chip" style="background:${col}20;color:${col}">${esc(day)}</span>
      <span class="sched-time">${esc(s.start_time)}–${esc(s.end_time)}</span>
      <span class="sched-subj">${esc(s.subject)}</span>${room}
    </div>`;
  }).join("");
  // wire delete buttons
  $("#sched-slots-list").querySelectorAll(".sched-del-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      schedSlots.splice(Number(btn.dataset.idx), 1);
      renderSchedSlots();
    });
  });
}

async function submitScheduleFile(file) {
  schedState("#sched-loading");
  try {
    const fd = new FormData();
    fd.append("file", file);
    const data = await api("/api/schedule/upload", { method: "POST", body: fd });
    schedSlots = data.slots;
    renderSchedSlots();
    schedState("#sched-preview");
  } catch (e) {
    $("#sched-err-text").textContent = e.message;
    schedState("#sched-error");
  }
}

$("#schedule-upload-btn").addEventListener("click", () => {
  schedState("#sched-initial");
  $("#schedule-modal").classList.add("show");
  paintIcons($("#schedule-modal"));
});
$("#sched-close-btn").addEventListener("click", () => $("#schedule-modal").classList.remove("show"));
$("#sched-retry-btn").addEventListener("click", () => schedState("#sched-initial"));
$("#sched-reupload-btn").addEventListener("click", () => schedState("#sched-initial"));

$("#sched-confirm-btn").addEventListener("click", async () => {
  if (!schedSlots.length) { toast("ไม่มีวิชาที่จะบันทึก"); return; }
  schedState("#sched-loading");
  try {
    const data = await api("/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots: schedSlots }),
    });
    renderDashboard(data.dashboard);
    $("#sched-ok-msg").textContent = `บันทึกลงปฏิทินแล้ว ${schedSlots.length} วิชา · ${data.tasks_created} คาบใน 2 สัปดาห์`;
    schedState("#sched-saved");
    paintIcons($("#schedule-modal"));
  } catch (e) {
    $("#sched-err-text").textContent = e.message;
    schedState("#sched-error");
  }
});

$("#sched-clear-btn").addEventListener("click", async () => {
  try {
    await api("/api/schedule/slots", { method: "DELETE" });
    toast("ล้างตารางเรียนแล้ว", true);
    $("#schedule-modal").classList.remove("show");
  } catch (e) { toast(e.message); }
});

// click drop zone label → trigger file input
$("#sched-dropzone").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#sched-file-input").click(); }
});
$("#sched-file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) submitScheduleFile(e.target.files[0]);
  e.target.value = "";
});

// drag-and-drop on the drop zone
const dz = $("#sched-dropzone");
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("drag");
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) submitScheduleFile(f);
});

/* init — check session first, then load app or show login */
fetch("/api/me").then(async (r) => {
  if (r.ok) { const { username } = await r.json(); onAuthed(username); }
  else showAuth();
}).catch(() => showAuth());

/* ===== 뭐든 알리미 - 상근직용 =====
   - 자정(00:00)에 매일 전체 초기화 (기본 시간대는 09~18시로 고정)
   - 반복 알람은 자정 초기화와 무관하게 계속 유지됨
*/
const DEFAULT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

let tasks = []; // {id, time:'HH:MM', memo, done, fired, alarmOn}
let currentDayKey = null;
let lastScrolledHour = null;
let pinned = false;
let saveTimer = null;
let recurringAlarms = []; // {id, time:'HH:MM', memo, days:[0-6] (0=일,1=월...6=토), lastFiredDate}
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }

function dayKeyOf(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function buildDefaultTasks(now) {
  return DEFAULT_HOURS.map(h => ({
    id: Date.now() + h,
    time: pad(h) + ':00',
    memo: '',
    done: false,
    fired: false,
    alarmOn: false,
  }));
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.electronAPI.saveTasks({ tasks, dayKey: currentDayKey, recurringAlarms });
  }, 150);
}

async function init() {
  setupTimeInput();
  const now = new Date();
  currentDayKey = dayKeyOf(now);

  const saved = await window.electronAPI.loadTasks();
  // 저장된 데이터가 오늘 날짜 것이면 그대로 이어서 사용 (재시작 대비, 하루 중엔 초기화 안 함)
  if (saved && saved.dayKey === currentDayKey && Array.isArray(saved.tasks)) {
    tasks = saved.tasks;
  } else {
    tasks = buildDefaultTasks(now);
    persist();
  }
  // 반복 알람은 자정 초기화와 무관하게 항상 그대로 이어서 사용
  if (saved && Array.isArray(saved.recurringAlarms)) {
    recurringAlarms = saved.recurringAlarms;
  }
  render();
  tick();
  setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  document.getElementById('dateStr').textContent =
    now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  document.getElementById('hm').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  document.getElementById('ss').textContent = pad(now.getSeconds());

  const todayKey = dayKeyOf(now);
  if (todayKey !== currentDayKey) {
    // 자정이 지나 날짜가 바뀜 -> 하루 한 번만 전체 초기화 (반복 알람은 그대로 유지)
    currentDayKey = todayKey;
    tasks = buildDefaultTasks(now);
    persist();
    render();
    toast('Midnight passed — schedule reset for the new day');
  }

  const curHM = pad(now.getHours()) + ':' + pad(now.getMinutes());
  tasks.forEach(t => {
    if (t.time === curHM && t.alarmOn && t.memo.trim() && !t.fired && !t.done) {
      t.fired = true;
      window.electronAPI.triggerAlarm({ time: t.time, memo: t.memo });
    }
  });

  const nowDow = now.getDay(); // 0=일 ... 6=토
  recurringAlarms.forEach(r => {
    if (r.days.includes(nowDow) && r.time === curHM && r.lastFiredDate !== todayKey) {
      r.lastFiredDate = todayKey;
      persist();
      window.electronAPI.triggerAlarm({ time: r.time, memo: '🔁 ' + r.memo });
    }
  });

  updateHighlightsOnly();

  // 정시가 바뀔 때만 '지금' 시간 줄을 화면 맨 위로 스크롤 (같은 시간 안에서는 스크롤을 건드리지 않음)
  const nowHour = now.getHours();
  if (nowHour !== lastScrolledHour) {
    lastScrolledHour = nowHour;
    scrollNowRowToTop();
  }
}

function scrollNowRowToTop() {
  const nowRow = document.querySelector('.task.now');
  if (nowRow) {
    nowRow.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
function openBlog() {
  window.electronAPI.openExternal('https://bedsidelab.blogspot.com/');
}

async function openAbout() {
  try {
    appVersion = await window.electronAPI.getAppVersion();
  } catch (e) {}
  document.getElementById('aboutVersion').textContent = appVersion;
  document.getElementById('aboutOverlay').classList.add('show');
}
function closeAbout() {
  document.getElementById('aboutOverlay').classList.remove('show');
}

function togglePin() {
  pinned = !pinned;
  const btn = document.getElementById('pinBtn');
  btn.textContent = pinned ? '📌 Pin: On' : '📌 Pin: Off';
  btn.classList.toggle('on', pinned);
  window.electronAPI.setAlwaysOnTop(pinned);
}

function toast(msg) {
  let t = document.getElementById('toastEl');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastEl';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

let confirmYesAction = null;
function askConfirm(msg, onYes) {
  document.getElementById('confirmMsg').textContent = msg;
  confirmYesAction = onYes;
  document.getElementById('confirmOverlay').classList.add('show');
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('show');
  confirmYesAction = null;
}
document.getElementById('confirmYesBtn').onclick = function () {
  const action = confirmYesAction;
  closeConfirm();
  if (action) action();
};

function clearAll() {
  if (tasks.length === 0) { toast('Already empty'); return; }
  askConfirm('This will clear all content and alarm settings\nand reset to the default 09:00–18:00 schedule. Continue?', function () {
    tasks = buildDefaultTasks(new Date());
    persist();
    render();
    toast('Content has been reset');
  });
}

function openTimePicker() {
  const hidden = document.getElementById('inTimeHidden');
  if (hidden.showPicker) {
    try { hidden.showPicker(); return; } catch (e) {}
  }
  hidden.focus();
  hidden.click();
}

function autoFormatTimeInput(textEl) {
  textEl.addEventListener('input', () => {
    let digits = textEl.value.replace(/\D/g, '').slice(0, 4);
    let formatted = digits;
    if (digits.length >= 3) formatted = digits.slice(0, 2) + ':' + digits.slice(2);
    textEl.value = formatted;
  });
  textEl.addEventListener('blur', () => {
    const v = textEl.value;
    const m = v.match(/^(\d{1,2}):?(\d{2})$/);
    if (m) {
      let h = Math.min(23, parseInt(m[1], 10));
      let mi = Math.min(59, parseInt(m[2], 10));
      textEl.value = pad(h) + ':' + pad(mi);
    }
  });
}

function setupTimeInput() {
  const textEl = document.getElementById('inTimeText');
  const hiddenEl = document.getElementById('inTimeHidden');

  autoFormatTimeInput(textEl);

  // 시계 아이콘으로 고른 값(항상 24시간 HH:MM 형식)을 텍스트 입력에 반영
  hiddenEl.addEventListener('change', () => {
    if (hiddenEl.value) textEl.value = hiddenEl.value;
  });

  autoFormatTimeInput(document.getElementById('recurTimeText'));
}

function addTimeSlot() {
  const time = document.getElementById('inTimeText').value;
  if (!/^\d{2}:\d{2}$/.test(time)) { toast('Please enter a valid time (HH:MM), e.g. 22:30'); return; }
  if (tasks.some(t => t.time === time)) { toast('That time is already added'); return; }
  tasks.push({ id: Date.now(), time, memo: '', done: false, fired: false, alarmOn: false });
  document.getElementById('inTimeText').value = '';
  persist();
  render();
}

function updateMemo(id, value) {
  const t = tasks.find(x => x.id === id);
  if (t) t.memo = value;
  persist();
}

function toggleAlarm(id) {
  const t = tasks.find(x => x.id === id);
  if (t) t.alarmOn = !t.alarmOn;
  persist();
  render();
}

function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  persist();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  persist();
  render();
}

function todaysRecurringRows(now) {
  const dow = now.getDay();
  return recurringAlarms.filter(r => r.days.includes(dow));
}

function render() {
  const now = new Date();
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  const el = document.getElementById('timeline');

  const recurToday = todaysRecurringRows(now);

  if (tasks.length === 0 && recurToday.length === 0) {
    el.innerHTML = '<div class="empty">No items yet.</div>';
    return;
  }

  const activeInput = document.activeElement && document.activeElement.classList.contains('memo-input')
    ? document.activeElement : null;
  const focusedId = activeInput ? Number(activeInput.dataset.id) : null;
  const caret = activeInput ? activeInput.selectionStart : null;

  // 일반 시간대 + 오늘 해당하는 반복알람을 하나의 타임라인으로 합쳐서 시간순 정렬
  const combined = [
    ...tasks.map(t => ({ kind: 'task', time: t.time, data: t })),
    ...recurToday.map(r => ({ kind: 'recur', time: r.time, data: r })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  el.innerHTML = combined.map(item => {
    const [h, m] = item.time.split(':').map(Number);
    const itemMinutes = h * 60 + m;

    if (item.kind === 'recur') {
      const r = item.data;
      let cls = 'recur';
      if (itemMinutes === curMinutes) cls += ' now';
      return `
        <div class="task ${cls}" data-row-id="rec-${r.id}">
          <div class="time">${r.time}</div>
          <div class="dot"></div>
          <div class="body">
            <span class="rtag">🔁 Recurring</span>
            <span class="rmemoDisplay">${escapeHtml(r.memo)}</span>
            <button class="del" onclick="deleteRecurring(${r.id})" title="Delete recurring alarm">✕</button>
          </div>
        </div>`;
    }

    const t = item.data;
    let cls = '';
    if (t.done) cls = 'done';
    else if (itemMinutes === curMinutes) cls = 'now';
    else if (itemMinutes > curMinutes && itemMinutes - curMinutes <= 15) cls = 'upcoming';

    return `
      <div class="task ${cls}" data-row-id="${t.id}">
        <div class="time">${t.time}</div>
        <div class="dot"></div>
        <div class="body">
          <button class="checkbtn" onclick="toggleDone(${t.id})" title="Mark done">✓</button>
          <input class="memo-input" type="text" data-id="${t.id}"
                 value="${escapeHtml(t.memo)}" placeholder="Enter a task..."
                 oninput="updateMemo(${t.id}, this.value)">
          <button class="bellbtn ${t.alarmOn ? 'on' : ''}" onclick="toggleAlarm(${t.id})" title="Toggle alarm">🔔</button>
          <button class="del" onclick="deleteTask(${t.id})" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');

  if (focusedId !== null) {
    const inputEl = el.querySelector(`.memo-input[data-id="${focusedId}"]`);
    if (inputEl) { inputEl.focus(); inputEl.setSelectionRange(caret, caret); }
  }
}

// 매초 실행: 입력창(DOM)을 다시 그리지 않고 now/upcoming 표시 색상만 갱신
// (전체 다시 그리기는 커서 위치를 씹히게 할 수 있어서, 시간 표시 갱신은 이 가벼운 함수로만 처리)
function updateHighlightsOnly() {
  const now = new Date();
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  document.querySelectorAll('.task[data-row-id]').forEach(rowEl => {
    const rowId = rowEl.dataset.rowId;

    if (rowId.startsWith('rec-')) {
      const recurId = Number(rowId.slice(4));
      const r = recurringAlarms.find(x => x.id === recurId);
      if (!r) return;
      const [h, m] = r.time.split(':').map(Number);
      const itemMinutes = h * 60 + m;
      let cls = 'recur';
      if (itemMinutes === curMinutes) cls += ' now';
      rowEl.className = 'task ' + cls;
      return;
    }

    const id = Number(rowId);
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const [h, m] = t.time.split(':').map(Number);
    const taskMinutes = h * 60 + m;
    let cls = '';
    if (t.done) cls = 'done';
    else if (taskMinutes === curMinutes) cls = 'now';
    else if (taskMinutes > curMinutes && taskMinutes - curMinutes <= 15) cls = 'upcoming';
    rowEl.className = 'task' + (cls ? ' ' + cls : '');
  });
}

// ===== 반복 알람 =====
let selectedDows = new Set();

function openRecurring() {
  document.getElementById('recurringOverlay').classList.add('show');
  renderDowPicker();
  renderRecurringList();
}
function closeRecurring() {
  document.getElementById('recurringOverlay').classList.remove('show');
}

function renderDowPicker() {
  const el = document.getElementById('dowPicker');
  const allOn = selectedDows.size === 7;
  el.innerHTML =
    `<button type="button" class="dowchip everyday ${allOn ? 'on' : ''}" onclick="toggleEveryday()">Daily</button>` +
    DOW_LABELS.map((label, i) =>
      `<button type="button" class="dowchip ${selectedDows.has(i) ? 'on' : ''}" onclick="toggleDow(${i})">${label}</button>`
    ).join('');
}
function toggleEveryday() {
  if (selectedDows.size === 7) {
    selectedDows = new Set();
  } else {
    selectedDows = new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  renderDowPicker();
}
function toggleDow(i) {
  if (selectedDows.has(i)) selectedDows.delete(i); else selectedDows.add(i);
  renderDowPicker();
}

function renderRecurringList() {
  const el = document.getElementById('recurringList');
  if (recurringAlarms.length === 0) {
    el.innerHTML = '<div class="recur-empty">No recurring alarms yet.</div>';
    return;
  }
  const sorted = [...recurringAlarms].sort((a, b) => a.time.localeCompare(b.time));
  el.innerHTML = sorted.map(r => {
    const daysLabel = r.days.length === 7 ? 'Daily' : r.days.slice().sort().map(d => DOW_LABELS[d]).join(', ');
    return `
      <div class="recuritem">
        <span class="rtime">${r.time}</span>
        <span class="rdays">[${daysLabel}]</span>
        <span class="rmemo">${escapeHtml(r.memo)}</span>
        <button class="rdel" onclick="deleteRecurring(${r.id})" title="Delete">✕</button>
      </div>`;
  }).join('');
}

function addRecurring() {
  const time = document.getElementById('recurTimeText').value;
  const memo = document.getElementById('recurMemoText').value.trim();
  if (!/^\d{2}:\d{2}$/.test(time)) { toast('Please enter a valid time (HH:MM)'); return; }
  if (selectedDows.size === 0) { toast('Please select at least one day'); return; }
  if (!memo) { toast('Please enter what to be reminded of'); return; }

  recurringAlarms.push({
    id: Date.now(),
    time,
    memo,
    days: Array.from(selectedDows),
    lastFiredDate: null,
  });
  persist();
  document.getElementById('recurTimeText').value = '';
  document.getElementById('recurMemoText').value = '';
  selectedDows = new Set();
  renderDowPicker();
  renderRecurringList();
  render();
  toast("Recurring alarm added (shown in purple on today's timeline if it applies today)");
}

function deleteRecurring(id) {
  recurringAlarms = recurringAlarms.filter(r => r.id !== id);
  persist();
  renderRecurringList();
  render();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

init();

// Цех № 7 — онлайн на двоих, у каждого свой телефон.
// Хозяин комнаты (кто её создал) ведёт общий цех: ленту, детали на полу, события, таймер и раунды.
// Мастерскую — станки, верстак и заказ — каждый телефон считает у себя, сопернику уходят только очки.
import {
  T, COLS, ROWS, W, H, PI, C, FONT_D, FONT_B, PARTS, ORDER_KEYS, RAW, RAW_OF, MACHINES, PRODUCTS, UPGRADES, EVENTS,
  zeroCounts, rr, dot, drawItem, iconImg, hazard, mulberry32, plural, fmt,
} from './art.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const hashArgs = new URLSearchParams(location.hash.slice(1));
const DEBUG = hashArgs.has('debug');
const LAG = Math.max(0, +hashArgs.get('lag') || 0);   // искусственная задержка отправки, мс — для проверки

const FLOOR = 0, WALL = 1, BELT = 2, ISLAND = 3, BENCH = 4, MACH = 5, DOOR = 6;
const R = 15, SPEED = 160, RUSH_AT = 20, GUARD = 1.2, SEND_EVERY = 1 / 15;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// ---------- общий цех 9×12: лента в центре, дверь хозяина внизу, дверь гостя вверху ----------
const hallGrid = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let v = FLOOR;
    if (c >= 2 && c <= 6 && r >= 4 && r <= 7) v = (r === 4 || r === 7 || c === 2 || c === 6) ? BELT : ISLAND;
    if (r === 0 || r === ROWS - 1) v = c >= 3 && c <= 5 ? DOOR : WALL;
    row.push(v);
  }
  hallGrid.push(row);
}
const doorRow = who => who === 'host' ? ROWS - 1 : 0;

// кольцо ленты по часовой стрелке
const PATH = [[2.5*T,4.5*T],[6.5*T,4.5*T],[6.5*T,7.5*T],[2.5*T,7.5*T]];
const SEG = PATH.map((a, i) => { const b = PATH[(i+1)%4]; return { ax:a[0], ay:a[1], bx:b[0], by:b[1], len:Math.hypot(b[0]-a[0], b[1]-a[1]) }; });
let acc = 0; SEG.forEach(s => { s.start = acc; acc += s.len; });
const L = acc;
const SPAWN_POINTS = [SEG[0].len / 2, SEG[2].start + SEG[2].len / 2];
const wrapS = s => ((s % L) + L) % L;
function pathPos(s) {
  s = wrapS(s);
  for (const sg of SEG) {
    if (s <= sg.start + sg.len) {
      const t = (s - sg.start) / sg.len;
      return { x: sg.ax + (sg.bx - sg.ax) * t, y: sg.ay + (sg.by - sg.ay) * t };
    }
  }
  return { x: SEG[0].ax, y: SEG[0].ay };
}
function pathClosest(x, y) {
  let best = { d: Infinity, s: 0, x: 0, y: 0 };
  for (const sg of SEG) {
    const dx = sg.bx - sg.ax, dy = sg.by - sg.ay;
    let t = ((x - sg.ax) * dx + (y - sg.ay) * dy) / (sg.len * sg.len);
    t = Math.max(0, Math.min(1, t));
    const px = sg.ax + dx * t, py = sg.ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, s: sg.start + t * sg.len, x: px, y: py };
  }
  return best;
}
function pathGap(a, b) { const d = Math.abs(a - b) % L; return Math.min(d, L - d); }
function rectDist(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// ---------- мастерская 9×12: у каждого своя, дверь в цех вверху ----------
const workGrid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) =>
  r === 0 ? (c >= 3 && c <= 5 ? DOOR : WALL) : r === ROWS - 1 ? WALL : FLOOR));
const machines = [
  { type:'furnace',   rect:{ x:0,   y:2*T, w:T, h:T   }, rot:-PI/2 },
  { type:'press',     rect:{ x:0,   y:4*T, w:T, h:2*T }, rot:-PI/2 },
  { type:'assembler', rect:{ x:0,   y:7*T, w:T, h:T   }, rot:-PI/2 },
  { type:'winder',    rect:{ x:8*T, y:2*T, w:T, h:2*T }, rot: PI/2 },
  { type:'solder',    rect:{ x:8*T, y:5*T, w:T, h:2*T }, rot: PI/2 },
].map(m => ({ ...m, state:'idle', t:0, dur:1, inputs:[], broken:0 }));
for (const m of machines) {
  for (let r = m.rect.y / T; r < (m.rect.y + m.rect.h) / T; r++)
    for (let c = m.rect.x / T; c < (m.rect.x + m.rect.w) / T; c++) workGrid[r][c] = MACH;
}
const bench = { rect:{ x:3*T, y:5*T, w:3*T, h:T }, doneT:0 };
for (let c = 3; c <= 5; c++) workGrid[5][c] = BENCH;

function solidAt(scene, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  const v = (scene === 'hall' ? hallGrid : workGrid)[r][c];
  if (v === FLOOR) return false;
  if (v === DOOR) return scene === 'hall' && r !== doorRow(role);
  return true;
}
const machFront = (m, d) => ({ x: m.rect.x + m.rect.w / 2 - Math.sin(m.rot) * d, y: m.rect.y + m.rect.h / 2 + Math.cos(m.rot) * d });

// ---------- состояние ----------
let role = '';                   // 'host' — создал комнату и ведёт цех, 'guest' — вошёл по коду
let flip = false;                // гость смотрит на цех с другой стороны, поэтому цех у него развёрнут
let state = 'menu';              // menu, lobby, count, play, pause, roundover, shop, over
let resumeTo = 'play';
let rounds = 3, duration = 90, round = 0, roundSeed = 0;
let timeLeft = 90, rush = false, elapsed = 0, countT = 0, goT = 0, clock = 0, fade = 0;
let belt = [], hallFloor = [], puddles = [], workFloor = [];
let evt = null, phase = 0, banner = null, pendingBanner = null;
let sparks = [], texts = [];
let order = null, orderSeq = [], orderRng = Math.random, score = 0, done = 0;
let wallet = newWallet(), tally = newTally(), lastRes = null, lastResultMsg = null, lastResultRound = 0;
let myReady = false, oppReady = false, oppRound = { s: 0, d: 0 }, oppPressure = {};
// ведёт только хозяин
let spawnT = 0, spawnSide = 0, nextEvtAt = 18, lastEvtId = '', clockT = 0, finalWait = 0;
const pending = new Map();       // гость: детали, взятые до ответа хозяина
let idSeq = 0, sendT = 0, pressT = 0, lastSent = '', lastSentAt = -9;

function newWallet() { return { coins: 0, up: Object.fromEntries(UPGRADES.map(u => [u.id, 0])) }; }
function newTally() { return { total: [0, 0], wins: [0, 0], done: [0, 0] }; }
const myIdx = () => role === 'guest' ? 1 : 0;
const up = () => wallet.up;
const capOf = () => 1 + wallet.up.cap;
const myColor = () => role === 'guest' ? C.p2 : C.p1;
const myDark = () => role === 'guest' ? C.p2d : C.p1d;
const oppColor = () => role === 'guest' ? C.p1 : C.p2;
const oppDark = () => role === 'guest' ? C.p1d : C.p2d;
const newId = () => (role === 'guest' ? 'g' : 'h') + (++idSeq).toString(36);
const newCode = () => String(1000 + Math.floor(Math.random() * 9000));

// ---------- игроки ----------
function makePlayer() {
  return {
    x: 4.5 * T, y: 9.5 * T, fx: 0, fy: -1, vx: 0, vy: 0, kx: 0, ky: 0, hands: [], stun: 0, guard: 0,
    shoveCd: 0, msgCd: 0, walk: 0, moving: 0, scene: 'hall', target: null, tx: 0, ty: 0, here: false,
  };
}
let me = makePlayer(), opp = makePlayer();
function toHallDoor(p, who) {
  const host = who === 'host';
  Object.assign(p, { scene: 'hall', x: 4.5 * T, y: host ? 10.3 * T : 1.7 * T, fx: 0, fy: host ? -1 : 1, vx: 0, vy: 0, kx: 0, ky: 0 });
  p.tx = p.x; p.ty = p.y;
}
function toWorkDoor(p) {
  Object.assign(p, { scene: 'work', x: 4.5 * T, y: 1.5 * T, fx: 0, fy: 1, vx: 0, vy: 0, kx: 0, ky: 0 });
}

// ---------- заказы: у обоих одна и та же очередь, её задаёт число раунда от хозяина ----------
function tiersFor(r, n) {
  if (r >= n) return n <= 3 ? [2, 3, 4] : [3, 4];
  return [[1, 2], [1, 2, 3], [2, 3], [2, 3, 4]][Math.min(r - 1, 3)];
}
function getOrder(n) {
  const allowed = tiersFor(round, rounds);
  while (orderSeq.length <= n) {
    const k = orderSeq.length;
    let tiers = allowed;
    if (k < 2 && allowed.length > 1) tiers = allowed.slice(0, -1);
    const prev = orderSeq[k - 1];
    const pool = PRODUCTS.filter(p => tiers.includes(p.tier) && p !== prev);
    orderSeq.push(pool[Math.floor(orderRng() * pool.length)]);
  }
  return orderSeq[n];
}
function newOrder() { order = { prod: getOrder(done), have: zeroCounts() }; renderHud(); sendScore(); }
const needs = type => !!order && (order.prod.need[type] || 0) > order.have[type];

// ---------- статичные слои ----------
function floorBase(s, seed, base) {
  const rnd = mulberry32(seed);
  s.fillStyle = base; s.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = rnd() * H, r = 18 + rnd() * 50, dark = rnd() < 0.5;
    const gr = s.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(60,64,58,.09)' : 'rgba(255,255,250,.07)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = gr; s.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1500; i++) {
    s.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)';
    s.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  s.strokeStyle = 'rgba(55,60,55,.35)'; s.lineWidth = 1;
  for (let x = 96; x < W; x += 96) { s.beginPath(); s.moveTo(x + .5, 0); s.lineTo(x + .5, H); s.stroke(); }
  for (let y = 96; y < H; y += 96) { s.beginPath(); s.moveTo(0, y + .5); s.lineTo(W, y + .5); s.stroke(); }
}
// стена во всю ширину; door — цвет двери посередине, dir — куда ведёт дверь (−1 вверх, 1 вниз)
function wallBand(s, y, door, dir) {
  s.fillStyle = '#353d38'; s.fillRect(0, y, W, T);
  s.strokeStyle = 'rgba(0,0,0,.3)'; s.lineWidth = 2;
  for (let x = 24; x < W; x += 24) { s.beginPath(); s.moveTo(x, y + 6); s.lineTo(x, y + T - 6); s.stroke(); }
  s.fillStyle = 'rgba(255,255,255,.07)'; s.fillRect(0, dir < 0 ? y + T - 5 : y + 2, W, 3);
  if (!door) return;
  s.fillStyle = '#161a18'; s.fillRect(3 * T, y, 3 * T, T);
  s.fillStyle = door; s.fillRect(3 * T - 6, y, 6, T); s.fillRect(6 * T, y, 6, T);
  s.save();
  s.strokeStyle = door; s.globalAlpha = .75; s.lineWidth = 3; s.lineCap = 'round'; s.lineJoin = 'round';
  for (const cx of [3.5 * T, 4.5 * T, 5.5 * T]) {
    const cy = y + T / 2;
    s.beginPath(); s.moveTo(cx - 8, cy - dir * 4); s.lineTo(cx, cy + dir * 4); s.lineTo(cx + 8, cy - dir * 4); s.stroke();
  }
  s.restore();
}
function layerCanvas() {
  const c = document.createElement('canvas');
  c.width = W * 3; c.height = H * 3;
  const s = c.getContext('2d'); s.scale(3, 3);
  return [c, s];
}
function buildHallStatic() {
  const [c, s] = layerCanvas();
  floorBase(s, 1977, '#8f948c');
  s.globalAlpha = .16;
  s.fillStyle = C.p2; s.fillRect(3 * T, T, 3 * T, T);
  s.fillStyle = C.p1; s.fillRect(3 * T, (ROWS - 2) * T, 3 * T, T);
  s.globalAlpha = 1;
  wallBand(s, 0, C.p2, -1);
  wallBand(s, (ROWS - 1) * T, C.p1, 1);
  s.fillStyle = '#5f665f'; s.fillRect(144, 240, 144, 96);
  s.strokeStyle = 'rgba(255,255,255,.08)'; s.lineWidth = 2;
  for (let y = 246; y < 332; y += 10) {
    for (let x = 150 + ((y / 10 | 0) % 2) * 6; x < 282; x += 12) { s.beginPath(); s.moveTo(x, y); s.lineTo(x + 4, y + 2); s.stroke(); }
  }
  s.strokeStyle = '#454b45'; s.lineWidth = 2; s.strokeRect(145, 241, 142, 94);
  const chute = (y, dir) => {
    s.fillStyle = '#1d211f'; s.fillRect(200, y, 32, 11);
    s.strokeStyle = C.hazard; s.lineWidth = 2; s.beginPath();
    for (const cx of [210, 222]) { s.moveTo(cx - 4, y + 5.5 + dir * 2); s.lineTo(cx, y + 5.5 - dir * 2); s.lineTo(cx + 4, y + 5.5 + dir * 2); }
    s.stroke();
  };
  chute(240, 1);
  chute(325, -1);
  s.strokeStyle = '#1d2621'; s.lineWidth = 4; s.strokeRect(2, 2, W - 4, H - 4);
  return c;
}
function buildWorkStatic() {
  const [c, s] = layerCanvas();
  floorBase(s, 2024, '#958f84');
  s.globalAlpha = .16; s.fillStyle = myColor(); s.fillRect(3 * T, T, 3 * T, T); s.globalAlpha = 1;
  // склад у дальней стены: здесь детали лежат сколько угодно
  s.fillStyle = 'rgba(40,36,30,.07)'; s.fillRect(T, 8 * T, 7 * T, 3 * T);
  s.setLineDash([8, 6]); s.strokeStyle = 'rgba(40,36,30,.4)'; s.lineWidth = 2;
  s.strokeRect(T + 4, 8 * T + 4, 7 * T - 8, 3 * T - 8); s.setLineDash([]);
  s.fillStyle = 'rgba(40,36,30,.5)'; s.font = `600 13px ${FONT_B}`; s.textAlign = 'center'; s.textBaseline = 'middle';
  s.fillText('СКЛАД · здесь детали не пропадают', W / 2, 10.5 * T);
  wallBand(s, 0, myColor(), -1);
  wallBand(s, (ROWS - 1) * T, null, 1);
  const boxes = ['#8a7a60', '#7d8a86', '#9a6a4e', '#6e7a5c'];
  for (let i = 0; i < 4; i++) {
    const x = 10 + i * 105, y = (ROWS - 1) * T + 9;
    s.fillStyle = '#4e463c'; s.fillRect(x, y, 96, 30);
    s.fillStyle = '#6b6052'; s.fillRect(x, y + 13, 96, 3);
    for (let k = 0; k < 4; k++) { s.fillStyle = boxes[(i + k) % 4]; s.fillRect(x + 6 + k * 22, y + 2, 16, 10); }
  }
  for (const m of machines) {
    const r = m.rect;
    if (m.rot < 0) hazard(s, r.x + r.w, r.y + 4, 6, r.h - 8);
    else hazard(s, r.x - 6, r.y + 4, 6, r.h - 8);
  }
  s.strokeStyle = '#1d2621'; s.lineWidth = 4; s.strokeRect(2, 2, W - 4, H - 4);
  return c;
}
let hallLayer = null, workLayer = null;
function rebuildLayers() { hallLayer = buildHallStatic(); workLayer = buildWorkStatic(); }

// ---------- эффекты ----------
const viewFlipped = () => flip && me.scene === 'hall';
const over = (p, d = 30) => p.y + (viewFlipped() ? d : -d);
function burst(x, y, n, colors, spd = 120, life = .6, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * PI * 2, v = spd * (0.4 + Math.random() * 0.8);
    const l = life * (0.6 + Math.random() * 0.6);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c: colors[i % colors.length], s: size * (0.6 + Math.random() * 0.8) });
  }
}
function addText(x, y, text, color, life = 1.1, big = false) { texts.push({ x, y, text, color, life, t: 0, big }); }
function say(msg) {
  if (me.msgCd > 0) return;
  addText(me.x, over(me), msg, C.ink, 1.4);
  me.msgCd = 0.9;
  sfx.nope();
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
function showBanner(title, desc, color = C.hazard) { banner = { title, desc, color, t: 0, life: 2.8 }; }

// ---------- звук ----------
let actx = null, muted = false;
try { muted = localStorage.getItem('ceh7-muted') === '1'; } catch (e) {}
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}
function tone(f, d, type = 'square', v = .05, slide = 0, delay = 0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), gn = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + d);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(gn); gn.connect(actx.destination);
  o.start(t0); o.stop(t0 + d + 0.03);
}
const sfx = {
  pick:   () => tone(620, .07, 'square', .035, 140),
  place:  () => tone(360, .09, 'triangle', .07, -90),
  drop:   () => tone(220, .09, 'triangle', .06, -70),
  nope:   () => tone(150, .14, 'sawtooth', .03, -30),
  done:   () => { tone(523, .1, 'square', .045); tone(659, .1, 'square', .045, 0, .09); tone(784, .2, 'square', .045, 0, .18); },
  shove:  () => tone(110, .18, 'sawtooth', .06, -50),
  ding:   () => tone(1046, .2, 'sine', .06),
  tick:   () => tone(440, .12, 'square', .045),
  go:     () => tone(880, .28, 'square', .055),
  siren:  () => { for (let i = 0; i < 3; i++) tone(560, .36, 'sawtooth', .035, 360, i * .42); },
  alert:  () => { tone(660, .12, 'square', .05); tone(880, .2, 'square', .05, 0, .14); },
  clank:  () => { tone(180, .08, 'square', .05, -60); tone(300, .05, 'square', .03, 0, .05); },
  fixed:  () => { tone(523, .1, 'triangle', .06); tone(784, .18, 'triangle', .06, 0, .1); },
  coin:   () => { tone(988, .06, 'square', .04); tone(1319, .14, 'square', .04, 0, .06); },
  end:    () => { tone(392, .3, 'triangle', .07); tone(523, .3, 'triangle', .07, 0, .15); tone(659, .55, 'triangle', .07, 0, .3); },
  door:   () => { tone(260, .07, 'triangle', .05, 160); tone(520, .08, 'triangle', .035, 0, .06); },
  join:   () => { tone(659, .1, 'square', .04); tone(988, .16, 'square', .04, 0, .1); },
};

// ---------- ввод ----------
const keys = new Set();
let touchVec = { x: 0, y: 0 };
const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  act: ['KeyE', 'Space', 'Enter', 'NumpadEnter'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const actionQueue = [];
const playing = () => state === 'play' || state === 'count';
function queueAction() { if (state === 'play') actionQueue.push(1); }
function readInput() {
  const on = a => a.some(k => keys.has(k));
  let x = (on(KEYS.right) ? 1 : 0) - (on(KEYS.left) ? 1 : 0);
  let y = (on(KEYS.down) ? 1 : 0) - (on(KEYS.up) ? 1 : 0);
  if (!x && !y && Math.hypot(touchVec.x, touchVec.y) >= 0.18) { x = touchVec.x; y = touchVec.y; }
  // гость видит цех развёрнутым: «вверх» на его экране — это вниз по цеху
  return viewFlipped() ? { x: -x, y: -y } : { x, y };
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (playing() && GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'pause') resumeGame(true); else pauseGame(true); return; }
  if (e.repeat) return;
  keys.add(e.code);
  if (KEYS.act.includes(e.code)) queueAction();
});
addEventListener('keyup', e => { keys.delete(e.code); });
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(true); });
document.addEventListener('gesturestart', e => e.preventDefault());

function setupStick(zone) {
  const base = zone.querySelector('.base'), knob = zone.querySelector('.knob');
  const MAX = 38;
  let active = null, ox = 0, oy = 0;
  const move = e => {
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > MAX) { dx *= MAX / d; dy *= MAX / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    touchVec = { x: dx / MAX, y: dy / MAX };
  };
  const end = e => {
    if (e.pointerId !== active) return;
    active = null; touchVec = { x: 0, y: 0 };
    knob.style.transform = ''; base.style.left = ''; base.style.top = '';
    zone.classList.remove('on');
  };
  zone.addEventListener('pointerdown', e => {
    if (active !== null) return;
    e.preventDefault(); ensureAudio();
    active = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch (err) {}
    const r = zone.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
    zone.classList.add('on');
    move(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === active) move(e); });
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
  zone.addEventListener('contextmenu', e => e.preventDefault());
}
function setupAct(btn) {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); btn.classList.add('down'); queueAction(); });
  const lift = () => btn.classList.remove('down');
  btn.addEventListener('pointerup', lift);
  btn.addEventListener('pointercancel', lift);
  btn.addEventListener('pointerleave', lift);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
setupStick($('zone'));
setupAct($('act'));

// ---------- движение ----------
function collideTiles(p) {
  for (let it = 0; it < 3; it++) {
    const c0 = Math.floor((p.x - R) / T), c1 = Math.floor((p.x + R) / T);
    const r0 = Math.floor((p.y - R) / T), r1 = Math.floor((p.y + R) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!solidAt(p.scene, c, r)) continue;
      const rx = c * T, ry = r * T;
      const nx = Math.max(rx, Math.min(p.x, rx + T)), ny = Math.max(ry, Math.min(p.y, ry + T));
      const dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x += dx / d * (R - d); p.y += dy / d * (R - d); }
      else {
        const l = p.x - rx, rt = rx + T - p.x, tp = p.y - ry, bt = ry + T - p.y, m = Math.min(l, rt, tp, bt);
        if (m === l) p.x = rx - R; else if (m === rt) p.x = rx + T + R; else if (m === tp) p.y = ry - R; else p.y = ry + T + R;
      }
    }
  }
  p.x = Math.max(R, Math.min(W - R, p.x));
  p.y = Math.max(R, Math.min(H - R, p.y));
}
const onOil = p => p.scene === 'hall' && !up().grip && puddles.some(o => o.a > 0.5 && Math.hypot(p.x - o.x, p.y - o.y) < o.r);
function updatePlayer(p, dt, canMove) {
  let ix = 0, iy = 0;
  if (canMove && p.stun <= 0) { const v = readInput(); ix = v.x; iy = v.y; }
  let m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; m = 1; }
  if (m > 0.2) { p.fx = ix / m; p.fy = iy / m; }
  p.moving = m;
  p.walk += dt * 13 * m;
  const slip = onOil(p);
  const sp = SPEED * (1 + 0.1 * up().speed) * (slip ? 1.15 : 1);
  const k = slip ? Math.min(1, dt * 2.2) : 1;
  p.vx += (ix * sp - p.vx) * k;
  p.vy += (iy * sp - p.vy) * k;
  p.x += (p.vx + p.kx) * dt;
  p.y += (p.vy + p.ky) * dt;
  const kk = Math.exp(-9 * dt); p.kx *= kk; p.ky *= kk;
  const px = p.x, py = p.y;
  collideTiles(p);
  if (slip) { if (Math.abs(p.x - px) > 0.5) p.vx *= 0.3; if (Math.abs(p.y - py) > 0.5) p.vy *= 0.3; }
  p.stun = Math.max(0, p.stun - dt);
  p.guard = Math.max(0, p.guard - dt);
  p.shoveCd = Math.max(0, p.shoveCd - dt);
  p.msgCd = Math.max(0, p.msgCd - dt);
}
function checkDoors() {
  if (me.scene === 'work') { if (me.y < 0.45 * T) enterScene('hall'); return; }
  if (role === 'host' ? me.y > (ROWS - 0.45) * T : me.y < 0.45 * T) enterScene('work');
}
function enterScene(scene) {
  if (scene === 'work') toWorkDoor(me); else toHallDoor(me, role);
  me.target = null; sparks = []; texts = []; fade = 1;
  sfx.door();
  sendState(true);
}
// соперника двигаем плавно к последней присланной точке
function updateOpp(dt) {
  if (!opp.here) return;
  const dx = opp.tx - opp.x, dy = opp.ty - opp.y;
  if (Math.hypot(dx, dy) > 2 * T) { opp.x = opp.tx; opp.y = opp.ty; }
  else { const k = 1 - Math.exp(-dt * 14); opp.x += dx * k; opp.y += dy * k; }
  opp.walk += dt * 13 * opp.moving;
  opp.stun = Math.max(0, opp.stun - dt);
  opp.guard = Math.max(0, opp.guard - dt);
}

// ---------- действия ----------
function loadableFor(p, m) {
  const def = MACHINES[m.type], res = [];
  for (const h of p.hands) if (def.in.includes(h) && !m.inputs.includes(h) && !res.includes(h)) res.push(h);
  return res;
}
function findTarget(p) {
  const reach = 1 + 0.25 * up().reach;
  const ix = p.x + p.fx * 26 * reach, iy = p.y + p.fy * 26 * reach;
  const room = p.hands.length < capOf(), holding = p.hands.length > 0;
  let best = null, bs = Infinity;
  const take = (d, max, t, pen = 0) => { if (d <= max * reach && d + pen < bs) { bs = d + pen; best = t; } };
  if (p.scene === 'hall') {
    if (room) {
      for (const it of belt) { const q = pathPos(beltS(it)); take(Math.hypot(q.x - ix, q.y - iy), 36, { kind:'belt', it, x:q.x, y:q.y }, 6); }
      for (const it of hallFloor) take(Math.hypot(it.x - ix, it.y - iy), 30, { kind:'floor', it, x:it.x, y:it.y }, 6);
    }
    if (holding) {
      const cs = pathClosest(ix, iy);
      take(cs.d, 30, { kind:'beltPut', s:cs.s, x:cs.x, y:cs.y }, 14);
    }
    if (p.shoveCd <= 0 && opp.here && opp.scene === 'hall' && opp.guard <= 0 && opp.stun <= 0)
      take(Math.hypot(opp.x - ix, opp.y - iy) - 10, 24, { kind:'shove' }, 4);
  } else {
    for (const m of machines) {
      const d = rectDist(ix, iy, m.rect);
      if (d > 24 * reach) continue;
      if (m.broken > 0) { take(d, 24, { kind:'repair', m }); continue; }
      if (m.state === 'ready') { if (room) take(d, 24, { kind:'mTake', m }); else take(d, 24, { kind:'mBusy', m }, 10); continue; }
      if (m.state === 'work') { if (holding) take(d, 24, { kind:'mBusy', m }, 10); continue; }
      if (loadableFor(p, m).length) take(d, 24, { kind:'mLoad', m });
      else if (m.inputs.length && room) take(d, 24, { kind:'mUnload', m }, 4);
      else if (holding) take(d, 24, { kind:'mNo', m }, 10);
    }
    if (room) for (const it of workFloor) take(Math.hypot(it.x - ix, it.y - iy), 30, { kind:'wfloor', it, x:it.x, y:it.y }, 6);
    if (holding) {
      const d = rectDist(ix, iy, bench.rect);
      if (d <= 24 * reach) {
        if (bench.doneT > 0) take(d, 24, { kind:'benchBusy', b: bench }, 10);
        else if (p.hands.some(needs)) take(d, 24, { kind:'bench', b: bench });
        else take(d, 24, { kind:'benchNo', b: bench }, 10);
      }
    }
  }
  if (!best && holding) best = { kind:'drop' };
  return best;
}
// деталь из общего цеха: хозяин берёт сразу, гость — сразу у себя, но хозяин может ответить «не успели»
function takeShared(it, list) {
  list.splice(list.indexOf(it), 1);
  me.hands.push(it.type);
  sfx.pick();
  if (role === 'host') net.send({ t: 'gone', id: it.id, by: 'h' });
  else { pending.set(it.id, it.type); net.send({ t: 'take', id: it.id }); }
}
function dropItem(type, x, y) {
  if (me.scene === 'hall') {
    const it = { id: newId(), type, x: r1(x), y: r1(y), age: 0 };
    hallFloor.push(it);
    net.send({ t: 'floor', id: it.id, type, x: it.x, y: it.y });
  } else workFloor.push({ type, x, y });
}
function doShove() {
  const force = 300 * (1 + 0.3 * up().elbow);
  me.shoveCd = 1.6 * (1 - 0.3 * up().elbow);
  opp.guard = 0.9 + GUARD;   // не толкать второй раз, пока соперник не встал
  burst(opp.x, opp.y, 10, ['#d8d2c0', '#a9a291'], 130, .4, 3);
  sfx.shove(); buzz(30);
  if (role === 'host') {
    let dx = opp.x - me.x, dy = opp.y - me.y; const d = Math.hypot(dx, dy) || 1;
    net.send({ t: 'shoved', dx: r2(dx / d), dy: r2(dy / d), force });
  } else net.send({ t: 'shove', x: r1(me.x), y: r1(me.y), force });
}
// меня толкнули: устойчивость и защита после оглушения считаются у меня
function getShoved(dx, dy, force) {
  if (me.scene !== 'hall' || me.guard > 0) return;
  const arm = up().armor;
  force *= arm ? 0.7 : 1;
  me.kx = dx * force; me.ky = dy * force;
  me.stun = 0.9 * (arm ? 0.5 : 1);
  me.guard = me.stun + GUARD;
  if (arm < 2) while (me.hands.length) dropItem(me.hands.pop(), me.x + (Math.random() - .5) * 16, me.y + (Math.random() - .5) * 16);
  addText(me.x, over(me), 'Ой!', C.ink, 0.9);
  burst(me.x, me.y, 10, ['#d8d2c0', '#a9a291'], 130, .4, 3);
  sfx.shove(); buzz(50);
  sendState(true);
}
function doAction() {
  const p = me;
  if (p.stun > 0) return;
  const t = findTarget(p);
  if (!t) return;
  const col = myColor();
  switch (t.kind) {
    case 'belt': takeShared(t.it, belt); break;
    case 'floor': takeShared(t.it, hallFloor); break;
    case 'wfloor':
      workFloor.splice(workFloor.indexOf(t.it), 1); p.hands.push(t.it.type); sfx.pick(); break;
    case 'mTake': {
      const m = t.m;
      p.hands.push(MACHINES[m.type].out); m.state = 'idle'; m.t = 0; sfx.pick(); break;
    }
    case 'mUnload':
      p.hands.push(t.m.inputs.pop()); sfx.pick(); break;
    case 'mLoad': {
      const m = t.m, def = MACHINES[m.type];
      for (const h of loadableFor(p, m)) {
        if (m.inputs.length >= def.in.length) break;
        m.inputs.push(h); p.hands.splice(p.hands.lastIndexOf(h), 1);
      }
      sfx.place();
      if (m.inputs.length >= def.in.length) {
        m.state = 'work'; m.t = 0; m.inputs = [];
        m.dur = def.time * (1 - 0.25 * up().tune);
      }
      break;
    }
    case 'mNo': {
      const def = MACHINES[t.m.type];
      if (p.hands.some(h => def.in.includes(h))) say('Это уже загружено');
      else say(`${def.name}: нужно ${def.in.map(k => PARTS[k].name.toLowerCase()).join(' + ')}`);
      break;
    }
    case 'mBusy': say(t.m.state === 'ready' ? 'Руки заняты' : 'Станок работает'); break;
    case 'repair': {
      const m = t.m, fp = machFront(m, 18);
      m.broken = Math.max(0, m.broken - (up().kit ? 2 : 1)); sfx.clank();
      burst(fp.x, fp.y, 6, ['#ffd27a', '#ffffff'], 120, .35, 2.5);
      if (m.broken === 0) { sfx.fixed(); addText(fp.x, over(p, 36), 'Починено!', '#7be39a', 1.2); }
      break;
    }
    case 'benchNo': say('В заказе этого нет'); break;
    case 'benchBusy': break;
    case 'bench': {
      const b = t.b, o = order;
      for (let i = p.hands.length - 1; i >= 0; i--) {
        const h = p.hands[i];
        if (needs(h)) { o.have[h]++; p.hands.splice(i, 1); }
      }
      sfx.place();
      const placed = ORDER_KEYS.reduce((s, k) => s + o.have[k], 0);
      const cx = b.rect.x + b.rect.w / 2, cy = b.rect.y + b.rect.h / 2;
      if (placed >= o.prod.slots.length) {
        const mult = evt && evt.id === 'bonus' ? 2 : 1;
        const val = Math.round(o.prod.value * mult * (1 + 0.15 * up().bonus));
        score += val; done++;
        b.doneT = 1.0;
        addText(cx, b.rect.y - 24, mult > 1 ? `+${val} ×2` : `+${val}`, col, 1.4, true);
        addText(cx, b.rect.y - 52, o.prod.name, C.ink, 1.4);
        burst(cx, cy, 26, [col, C.hazard, '#ffffff'], 200, .9, 3.5);
        sfx.done(); buzz(35);
      } else {
        burst(cx, cy, 8, [col], 90, .4, 2.5);
      }
      renderHud(); sendScore();
      break;
    }
    case 'beltPut':
      if (belt.some(it => pathGap(beltS(it), t.s) < 34)) say('Здесь занято');
      else {
        const it = { id: newId(), type: p.hands.pop(), off: r1(wrapS(t.s - phase)) };
        belt.push(it);
        net.send({ t: 'put', id: it.id, type: it.type, off: it.off });
        sfx.place();
      }
      break;
    case 'drop': {
      let x = p.x + p.fx * 22, y = p.y + p.fy * 22;
      if (solidAt(p.scene, Math.floor(x / T), Math.floor(y / T))) { x = p.x; y = p.y; }
      dropItem(p.hands.pop(), x, y); sfx.drop();
      break;
    }
    case 'shove': doShove(); break;
  }
  sendState(true);
}

// ---------- лента и события (решает хозяин) ----------
const beltS = it => wrapS(it.off + phase);
function beltSpeedNow() {
  let s = rush ? 76 : 50;
  if (evt && evt.id === 'reverse') s = -s * 0.9;
  if (evt && evt.id === 'stop') s = 0;
  return s;
}
// чего мне не хватает из сырья (плюс) и что уже лежит у меня (минус) — по этому хозяин выбирает, что выпустить на ленту
function pressure() {
  const w = Object.fromEntries(RAW.map(t => [t, 0]));
  const sub = t => { for (const s of (RAW_OF[t] || [t])) if (s in w) w[s] -= 1.2; };
  me.hands.forEach(sub);
  workFloor.forEach(i => sub(i.type));
  machines.forEach(m => { m.inputs.forEach(sub); if (m.state !== 'idle') sub(MACHINES[m.type].out); });
  if (order) for (const k of ORDER_KEYS) {
    const rem = (order.prod.need[k] || 0) - order.have[k];
    if (rem > 0) for (const s of (RAW_OF[k] || [k])) w[s] += rem * 2.5;
  }
  return w;
}
function pickSpawnType() {
  const mine = pressure(), hall = Object.fromEntries(RAW.map(t => [t, 0]));
  const add = t => { for (const s of (RAW_OF[t] || [t])) if (s in hall) hall[s]++; };
  belt.forEach(i => add(i.type));
  hallFloor.forEach(i => add(i.type));
  const w = {};
  let sum = 0;
  for (const t of RAW) { w[t] = Math.max(0.45, 1 + mine[t] + (+oppPressure[t] || 0) - hall[t] * 1.2); sum += w[t]; }
  let r = Math.random() * sum;
  for (const t of RAW) { r -= w[t]; if (r <= 0) return t; }
  return 'gear';
}
function trySpawn() {
  const supply = evt && evt.id === 'supply';
  if (belt.length >= (supply ? 16 : 12) || belt.length + hallFloor.length >= (supply ? 28 : 22)) return;
  for (let k = 0; k < 2; k++) {
    const idx = (spawnSide + k) % 2, s = SPAWN_POINTS[idx];
    if (belt.every(it => pathGap(beltS(it), s) >= 36)) {
      const it = { id: newId(), type: pickSpawnType(), off: r1(wrapS(s - phase)) };
      belt.push(it);
      net.send({ t: 'spawn', id: it.id, type: it.type, off: it.off });
      spawnSide = (idx + 1) % 2;
      return;
    }
  }
}
function makePuddles() {
  const spots = [];
  for (let r = 7; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
    if (hallGrid[r][c] !== FLOOR) continue;
    if (r >= 9 && c >= 3 && c <= 5) continue;   // проход к двери оставляем сухим
    spots.push([c, r]);
  }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  puddles = [];
  for (const [c, r] of spots.slice(0, 2)) {
    const jx = (Math.random() - .5) * 14, jy = (Math.random() - .5) * 14, rad = 30 + Math.random() * 6;
    const x = (c + .5) * T + jx, y = (r + .5) * T + jy;
    puddles.push({ x, y, r: rad, a: 0, seed: Math.random() * 10 });
    puddles.push({ x: W - x, y: H - y, r: rad, a: 0, seed: Math.random() * 10 });
  }
}
function applyEvent(id, t = 0) {
  const e = EVENTS.find(x => x.id === id);
  if (!e || e.id === 'breakdown') return;
  evt = { ...e, t };
  if (t === 0) { sfx.alert(); buzz(60); showBanner(e.title, e.desc); }
}
function applyBreakdown(type) {
  if (!MACHINES[type]) return;
  machines.forEach(m => { if (m.type === type) m.broken = 4; });
  sfx.alert(); buzz(60);
  showBanner('Поломка!', `${MACHINES[type].broke}. Чините в мастерской`, C.alarm);
}
function onRush() {
  sfx.siren(); buzz(120);
  showBanner('АВРАЛ!', `Последние ${RUSH_AT} секунд, лента быстрее`, C.alarm);
}
function startEvent(forceId) {
  const anyBroken = machines.some(m => m.broken > 0);
  const pool = EVENTS.filter(e => e.id !== lastEvtId && !(e.id === 'breakdown' && anyBroken));
  const e = EVENTS.find(x => x.id === forceId) || pool[Math.floor(Math.random() * pool.length)];
  lastEvtId = e.id;
  if (e.id === 'breakdown') {
    const types = Object.keys(MACHINES);
    const type = types[Math.floor(Math.random() * types.length)];
    net.send({ t: 'brk', type });
    applyBreakdown(type);
    nextEvtAt = elapsed + 16 + Math.random() * 8;
    return;
  }
  if (e.id === 'oil') { makePuddles(); net.send({ t: 'oil', list: puddles.map(packPuddle) }); }
  net.send({ t: 'evt', id: e.id });
  applyEvent(e.id);
}
function hostEvents() {
  if (evt) {
    if (evt.t >= evt.dur) { evt = null; net.send({ t: 'evtEnd' }); nextEvtAt = elapsed + 16 + Math.random() * 8; }
  } else if (elapsed >= nextEvtAt && timeLeft > RUSH_AT + 16) {
    startEvent();
  }
}
const packItem = it => ({ id: it.id, type: it.type, off: r1(it.off) });
const packFloor = it => ({ id: it.id, type: it.type, x: r1(it.x), y: r1(it.y), age: r1(it.age) });
const packPuddle = o => ({ x: r1(o.x), y: r1(o.y), r: r1(o.r), seed: r2(o.seed) });
const partOr = t => t in PARTS ? t : 'gear';
const unpackItem = o => ({ id: String(o.id), type: partOr(o.type), off: +o.off || 0 });
const unpackFloor = o => ({ id: String(o.id), type: partOr(o.type), x: +o.x || 0, y: +o.y || 0, age: +o.age || 0 });
const unpackPuddle = (o, a = 0) => ({ x: +o.x || 0, y: +o.y || 0, r: +o.r || 30, seed: +o.seed || 0, a });

// ---------- матч и раунды ----------
function startMatchLocal() {
  tally = newTally(); wallet = newWallet();
  lastRes = null; lastResultMsg = null; lastResultRound = 0;
  round = 0; myReady = oppReady = false;
}
function hostStartRound(n) {
  const seed = (Math.random() * 2147483647) | 0;
  startRoundLocal(n, seed);
  for (let i = 0; i < 9; i++) belt.push({ id: newId(), type: pickSpawnType(), off: r1(i * L / 9 + 20) });
  net.send({ t: 'round', n, seed, rounds, duration, belt: belt.map(packItem) });
}
function startRoundLocal(n, seed) {
  round = n; roundSeed = seed;
  orderRng = mulberry32(seed); orderSeq = []; done = 0; score = 0;
  oppRound = { s: 0, d: 0 }; oppPressure = {};
  machines.forEach(m => { m.state = 'idle'; m.t = 0; m.dur = 1; m.inputs = []; m.broken = 0; });
  bench.doneT = 0; workFloor = []; hallFloor = []; puddles = []; belt = []; phase = 0; pending.clear();
  me = makePlayer(); toHallDoor(me, role);
  opp = makePlayer(); toHallDoor(opp, role === 'host' ? 'guest' : 'host'); opp.here = true;
  sparks = []; texts = []; evt = null; banner = null; lastEvtId = ''; nextEvtAt = 16 + Math.random() * 6;
  rush = false; timeLeft = duration; elapsed = 0; spawnT = 0.6; goT = 0; clockT = 0; finalWait = 0; fade = 0;
  myReady = oppReady = false; actionQueue.length = 0; keys.clear();
  state = 'count'; countT = 3;
  newOrder();
  const tiers = tiersFor(round, rounds), prev = round > 1 ? tiersFor(round - 1, rounds) : null;
  let desc = 'Заказы простые, разгоняйтесь';
  if (prev) desc = Math.max(...tiers) > Math.max(...prev) ? 'Появились новые изделия, сложнее и дороже' : 'Простых заказов больше не будет';
  if (round === rounds && rounds > 1) desc = 'Последний раунд — самые дорогие заказы';
  pendingBanner = [`Раунд ${round} из ${rounds}`, desc];
  hideOverlays(); ensureAudio(); keepAwake(); sfx.tick();
  renderHud();
}
function hostEndRound() {
  state = 'roundover'; timeLeft = 0; rush = false; evt = null; banner = null; actionQueue.length = 0;
  net.send({ t: 'end' });
  finalWait = net.peer ? 2.5 : 0.01;   // ждём итог гостя, но недолго
  sfx.end(); buzz(80);
}
function guestEndRound() {
  if (state === 'roundover' || state === 'shop' || state === 'over') return;
  state = 'roundover'; timeLeft = 0; rush = false; evt = null; banner = null; actionQueue.length = 0;
  hideOverlays();
  net.send({ t: 'final', s: score, d: done });
  sfx.end(); buzz(80);
}
function hostFinishRound() {
  if (state !== 'roundover' || lastResultRound === round) return;
  finalWait = 0;
  const s = [score, oppRound.s], d = [done, oppRound.d], earn = [0, 0], res = [0, 0];
  for (const i of [0, 1]) {
    const diff = s[i] - s[1 - i];
    tally.total[i] += s[i]; tally.done[i] += d[i];
    if (diff > 0) tally.wins[i]++;
    res[i] = Math.sign(diff);
    earn[i] = 15 + Math.floor(s[i] / 4) + (diff < 0 ? 15 : 0);
  }
  const m = { t: 'result', round, last: round >= rounds, s, earn, res, tally };
  net.send(m);
  applyResult(m, true);
}
// итог раунда: рубли начисляются один раз, даже если сообщение пришло повторно
function applyResult(m, schedule) {
  if (m.round === lastResultRound) return;
  lastResultRound = m.round;
  lastResultMsg = m;
  if (role === 'guest') tally = m.tally;
  const i = myIdx();
  lastRes = { s: m.s[i], earn: m.earn[i], res: m.res[i] };
  wallet.coins += m.earn[i];
  myReady = oppReady = false;
  if (state === 'count' || state === 'play' || state === 'pause') { state = 'roundover'; hideOverlays(); }
  renderHud();
  if (m.last) releaseAwake();
  if (schedule) setTimeout(() => { if (state !== 'roundover') return; if (m.last) showFinal(); else showShop(); }, 1100);
}
function hostMaybeNext() {
  if (role === 'host' && state === 'shop' && myReady && oppReady && net.peer) hostStartRound(round + 1);
}

// ---------- цикл ----------
function ageFloor(dt) {
  for (let i = hallFloor.length - 1; i >= 0; i--) {
    const it = hallFloor[i];
    it.age += dt;
    if (role === 'host' && it.age > 25) { hallFloor.splice(i, 1); net.send({ t: 'gone', id: it.id, by: '' }); }
    else if (role === 'guest' && it.age > 30) hallFloor.splice(i, 1);
  }
}
function updateMachines(dt) {
  const here = me.scene === 'work';
  for (const m of machines) {
    if (m.broken > 0) {
      if (here && Math.random() < dt * 5) { const fp = machFront(m, 0); burst(fp.x + (Math.random() - .5) * 20, fp.y + (Math.random() - .5) * 20, 1, ['#4e544f', '#6d736f'], 25, 1.1, 7); }
      continue;
    }
    if (m.state !== 'work') continue;
    m.t += dt;
    if (here && Math.random() < dt * 16) {
      const fp = machFront(m, m.rect.w === m.rect.h ? 22 : 24);
      const cols = m.type === 'press' ? ['#ffb347', '#ffe08a'] : m.type === 'winder' ? ['#e09a5e', '#f3c08f'] : m.type === 'furnace' ? ['#ff7a2f', '#ffd36b'] : ['#ffe08a', '#c8cdd0'];
      burst(fp.x + (Math.random() - .5) * 20, fp.y + (Math.random() - .5) * 20, 1, cols, 130, .35, 2);
    }
    if (here && (m.type === 'solder' || m.type === 'furnace') && Math.random() < dt * 4) { const fp = machFront(m, 0); burst(fp.x, fp.y, 1, ['rgba(220,225,222,.55)'], 18, 1, 6); }
    if (m.t >= m.dur) { m.state = 'ready'; sfx.ding(); }
  }
}
function updatePuddles(dt) {
  const oilOn = evt && evt.id === 'oil';
  for (let i = puddles.length - 1; i >= 0; i--) {
    const o = puddles[i];
    o.a = oilOn ? Math.min(1, o.a + dt * 2) : o.a - dt * 0.7;
    if (o.a <= 0 && !oilOn) puddles.splice(i, 1);
  }
}
function hostTick(dt) {
  if (state === 'play') {
    if (!(evt && evt.id === 'stop')) {
      spawnT -= dt;
      if (spawnT <= 0) { trySpawn(); spawnT = evt && evt.id === 'supply' ? 0.32 : rush ? 0.8 : 1.1; }
    }
    hostEvents();
    if (!rush && timeLeft <= RUSH_AT) { rush = true; net.send({ t: 'rush' }); onRush(); }
  } else if (state === 'roundover' && finalWait > 0) {
    finalWait -= dt;
    if (finalWait <= 0) hostFinishRound();
  }
  if (state === 'play' || state === 'count') {
    clockT -= dt;
    if (clockT <= 0) { clockT = 0.25; net.send({ t: 'clock', tl: r1(timeLeft), ph: r1(phase) }); }
  }
  if (state === 'play' && timeLeft <= 0) hostEndRound();
}
function update(dt) {
  clock += dt;
  net.tick(dt);
  if (fade > 0) fade = Math.max(0, fade - dt * 4);
  if (state === 'count' || state === 'play' || state === 'roundover') {
    phase += beltSpeedNow() * dt;
    updateMachines(dt);
    updatePuddles(dt);
    if (bench.doneT > 0) { bench.doneT -= dt; if (bench.doneT <= 0) { bench.doneT = 0; newOrder(); } }
    if (state === 'count') {
      const prev = Math.ceil(countT);
      countT -= dt;
      const now = Math.ceil(countT);
      if (now !== prev && now > 0) sfx.tick();
      if (countT <= 0) {
        state = 'play'; goT = 0.8; sfx.go();
        if (pendingBanner) { showBanner(pendingBanner[0], pendingBanner[1]); pendingBanner = null; }
      }
    } else if (state === 'play') {
      timeLeft = Math.max(0, timeLeft - dt); elapsed += dt;
      if (evt) evt.t += dt;
      if (role === 'guest' && evt && evt.t > evt.dur + 3) evt = null;   // если «конец события» потерялся
    }
    if (role === 'host') hostTick(dt);
    const canMove = state === 'play';
    updatePlayer(me, dt, canMove);
    if (canMove) checkDoors();
    if (state === 'play') { while (actionQueue.length) { actionQueue.shift(); doAction(); } }
    else actionQueue.length = 0;
    updateOpp(dt);
    ageFloor(dt);
    sendT -= dt;
    if (sendT <= 0) { sendT = SEND_EVERY; sendState(false); }
  }
  if (goT > 0) goT -= dt;
  if (banner) { banner.t += dt; if (banner.t >= banner.life) banner = null; }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    const f = Math.exp(-3.5 * dt); s.vx *= f; s.vy *= f;
    s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t >= texts[i].life) texts.splice(i, 1); }
}

// ---------- сеть ----------
let token = '';
try { token = sessionStorage.getItem('ceh7-token') || ''; } catch (e) {}
if (!token) { token = Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('ceh7-token', token); } catch (e) {} }

const net = {
  ws: null, room: '', role: '', want: false, ok: false, peer: false, tries: 0, timer: 0, pingT: 0, lastRx: 0,
  open(room, r) {
    this.close();
    this.room = room; this.role = r; this.want = true; this.tries = 0;
    this.connect();
  },
  connect() {
    clearTimeout(this.timer);
    if (!this.want) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try { ws = new WebSocket(`${proto}://${location.host}/ws?room=${this.room}&role=${this.role}&token=${token}`); }
    catch (e) { this.retry(); return; }
    this.ws = ws;
    // на мобильной сети подключение может «повиснуть» без ошибки — не ждём дольше 8 секунд
    const stuck = setTimeout(() => {
      if (ws !== this.ws || this.ok) return;
      this.ws = null;
      try { ws.close(); } catch (e) {}
      this.retry();
    }, 8000);
    ws.onopen = () => {
      clearTimeout(stuck);
      if (ws !== this.ws) return;
      this.ok = true; this.tries = 0; this.lastRx = performance.now(); this.pingT = 4;
      refreshStatus();
    };
    ws.onmessage = e => {
      if (ws !== this.ws) return;
      this.lastRx = performance.now();
      if (e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && typeof m.t === 'string') { try { onNet(m); } catch (err) { console.error(err); } }
    };
    ws.onclose = e => {
      clearTimeout(stuck);
      if (ws !== this.ws) return;
      this.ws = null; this.ok = false; this.peer = false;
      if (e.code === 4001) { onNetBusy(); return; }
      if (e.code === 4000) return;   // нас вытеснило наше же новое подключение
      onNetDown();
      this.retry();
    };
  },
  retry() {
    if (!this.want) return;
    const d = Math.min(4000, 300 * 2 ** this.tries++);
    this.timer = setTimeout(() => this.connect(), d);
    refreshStatus();
  },
  send(m) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    const s = JSON.stringify(m);
    if (LAG) setTimeout(() => { if (ws.readyState === 1) ws.send(s); }, LAG);
    else ws.send(s);
  },
  close() {
    this.want = false;
    clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null; this.ok = false; this.peer = false;
    if (ws) { try { ws.close(1000, 'bye'); } catch (e) {} }
  },
  tick(dt) {
    if (!this.ws || !this.ok) return;
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 4; try { this.ws.send('ping'); } catch (e) {} }
    if (performance.now() - this.lastRx > 10000) {   // сервер отвечает на ping всегда; тишина — значит, связь «зависла»
      const ws = this.ws;
      this.ws = null; this.ok = false; this.peer = false;
      try { ws.close(); } catch (e) {}
      onNetDown();
      this.connect();
    }
  },
};
function onNetDown() { if (playing()) pauseGame(false); refreshStatus(); }
function onNetBusy() {
  if (role === 'host') { net.open(newCode(), 'host'); saveSeat(); showLobby(); }   // код совпал с чужой комнатой
  else leaveRoom(`В комнате ${net.room} уже двое игроков`);
}
function sendState(force) {
  if (!(state === 'count' || state === 'play' || state === 'roundover' || state === 'pause')) return;
  const m = {
    t: 'me', x: r1(me.x), y: r1(me.y), fx: r2(me.fx), fy: r2(me.fy), mv: r2(me.moving),
    sc: me.scene === 'hall' ? 'h' : 'w', hd: me.hands, st: me.stun > 0 ? 1 : 0, gd: me.guard > 0 ? 1 : 0,
  };
  if (role === 'guest') {
    pressT -= SEND_EVERY;
    if (pressT <= 0 || force) { pressT = 0.5; const w = pressure(); for (const k in w) w[k] = r1(w[k]); m.w = w; }
  }
  const key = JSON.stringify(m);
  if (!force && key === lastSent && clock - lastSentAt < 1) return;
  lastSent = key; lastSentAt = clock;
  net.send(m);
}
function sendScore() { net.send({ t: 'score', s: score, d: done }); }
function onOppState(m) {
  const scene = m.sc === 'w' ? 'work' : 'hall';
  const x = +m.x || 0, y = +m.y || 0;
  if (!opp.here || opp.scene !== scene) { opp.x = x; opp.y = y; }
  opp.here = true; opp.scene = scene; opp.tx = x; opp.ty = y;
  opp.fx = +m.fx || 0; opp.fy = +m.fy || 0; opp.moving = +m.mv || 0;
  opp.hands = Array.isArray(m.hd) ? m.hd.filter(t => t in PARTS).slice(0, 4) : [];
  opp.stun = m.st ? Math.max(opp.stun, 0.25) : 0;
  if (m.gd) opp.guard = Math.max(opp.guard, 0.25);
  if (m.w && role === 'host') oppPressure = m.w;
}
function onGone(m) {
  const i = belt.findIndex(x => x.id === m.id);
  if (i >= 0) belt.splice(i, 1);
  const j = hallFloor.findIndex(x => x.id === m.id);
  if (j >= 0) hallFloor.splice(j, 1);
  if (m.by === 'g') pending.delete(m.id);
}
function onDeny(id) {
  const type = pending.get(id);
  pending.delete(id);
  const k = me.hands.lastIndexOf(type);
  if (k >= 0) { me.hands.splice(k, 1); say('Не успели!'); sendState(true); }
}
function hostTake(id) {
  const i = belt.findIndex(x => x.id === id), j = hallFloor.findIndex(x => x.id === id);
  if (i >= 0) belt.splice(i, 1);
  else if (j >= 0) hallFloor.splice(j, 1);
  net.send(i >= 0 || j >= 0 ? { t: 'gone', id, by: 'g' } : { t: 'deny', id });
}
function hostOnShove(m) {
  if (state !== 'play' || me.scene !== 'hall' || opp.scene !== 'hall') return;
  const sx = +m.x || 0, sy = +m.y || 0;
  if (Math.hypot(sx - me.x, sy - me.y) > 80) return;   // пока летело сообщение, уже разошлись
  let dx = me.x - sx, dy = me.y - sy; const d = Math.hypot(dx, dy) || 1;
  getShoved(dx / d, dy / d, Math.min(600, +m.force || 300));
}
function syncMsg() {
  return {
    t: 'sync', state: state === 'menu' ? 'lobby' : state, resumeTo, rounds, duration, round, seed: roundSeed,
    tl: r1(timeLeft), ph: r1(phase), el: r1(elapsed), count: r1(countT), rush,
    evt: evt && { id: evt.id, t: r1(evt.t) }, tally, result: lastResultMsg, ready: myReady,
    belt: belt.map(packItem), floor: hallFloor.map(packFloor), puddles: puddles.map(packPuddle),
  };
}
// гость подключился заново: догоняем хозяина
function applySync(m) {
  rounds = m.rounds || rounds; duration = m.duration || duration;
  if (m.state === 'lobby') { if (state !== 'lobby') { startMatchLocal(); showLobby(); } else refreshStatus(); return; }
  if (m.round && round !== m.round) startRoundLocal(m.round, m.seed);
  const settled = m.result && m.result.round === m.round;
  if (m.state === 'shop' || m.state === 'over' || (m.state === 'roundover' && settled)) {
    if (m.result) applyResult(m.result, false);
    if (m.tally) tally = m.tally;
    if (m.state === 'over') showFinal();
    else { oppReady = !!m.ready; showShop(); }
    return;
  }
  if (m.state === 'roundover') { guestEndRound(); return; }
  belt = (m.belt || []).map(unpackItem);
  hallFloor = (m.floor || []).map(unpackFloor);
  const oil = m.evt && m.evt.id === 'oil';
  puddles = (m.puddles || []).map(o => unpackPuddle(o, oil ? 1 : 0));
  phase = +m.ph || 0; timeLeft = +m.tl || 0; elapsed = +m.el || 0; rush = !!m.rush; countT = +m.count || 0;
  evt = null;
  if (m.evt) applyEvent(m.evt.id, +m.evt.t || 0.01);
  if (m.tally) tally = m.tally;
  pending.clear();
  if (m.state === 'pause') {
    resumeTo = m.resumeTo === 'count' ? 'count' : 'play';
    if (state !== 'pause') { state = 'pause'; refreshStatus(); showSheet('pause'); }
  } else {
    state = m.state === 'count' ? 'count' : 'play';
    if (state === 'play') pendingBanner = null;
    hideOverlays();
  }
  refreshStatus(); renderHud();
}
function onNet(m) {
  switch (m.t) {
    case 'peer': {
      const was = net.peer;
      net.peer = !!m.on;
      if (net.peer && !was) { sfx.join(); if (role === 'guest') net.send({ t: 'hello' }); }
      if (!net.peer && playing()) pauseGame(false);
      refreshStatus();
      break;
    }
    case 'hello': if (role === 'host') { net.send(syncMsg()); sendState(true); sendScore(); } break;
    case 'sync': if (role === 'guest') applySync(m); break;
    case 'lobby':
      if (role !== 'guest') break;
      rounds = m.rounds; duration = m.duration;
      if (state !== 'lobby') { startMatchLocal(); showLobby(); } else refreshStatus();
      break;
    case 'match': if (role === 'guest') { rounds = m.rounds; duration = m.duration; startMatchLocal(); } break;
    case 'round':
      if (role !== 'guest') break;
      rounds = m.rounds; duration = m.duration;
      startRoundLocal(m.n, m.seed);
      belt = (m.belt || []).map(unpackItem);
      break;
    case 'me': onOppState(m); break;
    case 'score': oppRound = { s: +m.s || 0, d: +m.d || 0 }; renderHud(); break;
    case 'clock':
      if (role !== 'guest') break;
      if (state === 'play') timeLeft = +m.tl || 0;
      { const d = (+m.ph || 0) - phase; phase += Math.abs(d) > 40 ? d : d * 0.5; }
      break;
    case 'spawn': case 'put':
      if (!belt.some(i => i.id === m.id)) belt.push(unpackItem(m));
      break;
    case 'floor':
      if (!hallFloor.some(i => i.id === m.id)) hallFloor.push(unpackFloor(m));
      break;
    case 'take': if (role === 'host') hostTake(m.id); break;
    case 'gone': if (role === 'guest') onGone(m); break;
    case 'deny': if (role === 'guest') onDeny(m.id); break;
    case 'evt': if (role === 'guest') applyEvent(m.id); break;
    case 'evtEnd': if (role === 'guest') evt = null; break;
    case 'oil': if (role === 'guest' && Array.isArray(m.list)) puddles = m.list.map(o => unpackPuddle(o)); break;
    case 'brk': if (role === 'guest') applyBreakdown(m.type); break;
    case 'rush': if (role === 'guest' && !rush) { rush = true; onRush(); } break;
    case 'shove': if (role === 'host') hostOnShove(m); break;
    case 'shoved': if (role === 'guest' && state === 'play') getShoved(+m.dx || 0, +m.dy || 0, Math.min(600, +m.force || 300)); break;
    case 'end': if (role === 'guest') guestEndRound(); break;
    case 'final':
      if (role !== 'host') break;
      oppRound = { s: +m.s || 0, d: +m.d || 0 };
      if (state === 'roundover' && finalWait > 0) hostFinishRound();
      break;
    case 'result': if (role === 'guest') applyResult(m, true); break;
    case 'ready':
      oppReady = !!m.on;
      if (state === 'shop') renderShop();
      hostMaybeNext();
      break;
    case 'pause': pauseGame(false); break;
    case 'resume': resumeGame(false); break;
    case 'bye': onBye(); break;
  }
}

// ---------- отрисовка ----------
function drawBelt() {
  for (let r = 4; r <= 7; r++) for (let c = 2; c <= 6; c++) {
    if (hallGrid[r][c] !== BELT) continue;
    const x = c * T, y = r * T;
    g.fillStyle = '#262b28'; g.fillRect(x, y, T, T);
    const corner = (r === 4 || r === 7) && (c === 2 || c === 6);
    g.save();
    g.beginPath(); g.rect(x + 2, y + 2, T - 4, T - 4); g.clip();
    if (corner) {
      g.translate(x + T / 2, y + T / 2);
      dot(g, 0, 0, 19, '#303632');
      g.rotate(phase / 19);
      g.strokeStyle = '#4a514c'; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { g.rotate(PI / 2); g.beginPath(); g.moveTo(5, 0); g.lineTo(16, 0); g.stroke(); }
      dot(g, 0, 0, 4, '#5c645e');
    } else {
      let dx = 0, dy = 0;
      if (r === 4) dx = 1; else if (r === 7) dx = -1; else if (c === 6) dy = 1; else dy = -1;
      const rev = evt && evt.id === 'reverse' ? -1 : 1;
      dx *= rev; dy *= rev;
      const o = ((phase * rev % 14) + 14) % 14;
      g.strokeStyle = '#3f4642'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let k = -14; k <= T + 14; k += 14) {
        g.beginPath();
        if (dx) { const lx = x + k + dx * o; g.moveTo(lx - dx * 4, y + 10); g.lineTo(lx + dx * 3, y + T / 2); g.lineTo(lx - dx * 4, y + T - 10); }
        else { const ly = y + k + dy * o; g.moveTo(x + 10, ly - dy * 4); g.lineTo(x + T / 2, ly + dy * 3); g.lineTo(x + T - 10, ly - dy * 4); }
        g.stroke();
      }
    }
    g.restore();
  }
  g.lineWidth = 3; g.strokeStyle = evt && evt.id === 'stop' ? C.alarm : '#a9b1aa';
  g.strokeRect(2 * T + 1.5, 4 * T + 1.5, 5 * T - 3, 4 * T - 3);
  g.strokeRect(3 * T - 1.5, 5 * T - 1.5, 3 * T + 3, 2 * T + 3);
}
// циферблат в центре цеха — рисуется всегда «правильной стороной» к зрителю
function drawDial() {
  const cx = 4.5 * T, cy = 6 * T, r = 27;
  dot(g, cx, cy, r + 6, '#151917');
  g.strokeStyle = evt ? C.hazard : '#2f3631'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r + 6, 0, PI * 2); g.stroke();
  g.strokeStyle = 'rgba(238,242,234,.4)'; g.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * PI * 2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1)); g.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); g.stroke();
  }
  const live = state === 'play' || state === 'pause' || state === 'roundover';
  const frac = live ? Math.max(0, Math.min(1, timeLeft / duration)) : 1;
  const blink = rush && state === 'play' && Math.floor(clock * 2) % 2 === 0;
  if (frac > 0) {
    g.beginPath(); g.moveTo(cx, cy);
    g.arc(cx, cy, r - 2, -PI / 2, -PI / 2 + frac * PI * 2);
    g.closePath();
    g.fillStyle = rush ? (blink ? '#ff8170' : C.alarm) : C.hazard;
    g.fill();
  }
  dot(g, cx, cy, 5, '#2a302c');
  for (let i = 0; i < rounds; i++) {
    const y = cy + (i - (rounds - 1) / 2) * 12;
    for (const x of [cx - 52, cx + 52]) dot(g, x, y, 3.6, i < round - 1 ? C.hazard : i === round - 1 ? '#eef2ea' : 'rgba(238,242,234,.25)');
  }
}
function drawPuddles() {
  for (const o of puddles) {
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, o.a));
    g.translate(o.x, o.y);
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = i / 16 * PI * 2, rr2 = o.r * (0.85 + 0.15 * Math.sin(a * 3 + o.seed));
      if (i === 0) g.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2 * 0.8); else g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2 * 0.8);
    }
    g.closePath();
    g.fillStyle = 'rgba(24,22,28,.62)'; g.fill();
    g.lineWidth = 2;
    const sheen = ['rgba(120,200,255,.35)', 'rgba(230,120,255,.3)', 'rgba(255,220,120,.3)'];
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = sheen[i];
      g.beginPath(); g.arc(-o.r * 0.2 + i * 4, -o.r * 0.15 + i * 3, o.r * (0.45 - i * 0.1), PI * 1.1, PI * 1.7); g.stroke();
    }
    g.restore();
  }
}
function drawMachine(m) {
  const r = m.rect, def = MACHINES[m.type], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const lw = Math.max(r.w, r.h) - 4, lh = Math.min(r.w, r.h) - 4, hw = lw / 2, hh = lh / 2;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(r.x + 3, r.y + 4, r.w - 2, r.h - 2);
  g.save();
  g.translate(cx, cy); g.rotate(m.rot);
  rr(g, -hw, -hh, lw, lh, 6); g.fillStyle = def.body; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(-hw + 4, -hh + 3, lw - 8, 4);
  const work = m.state === 'work', ready = m.state === 'ready';
  const k = Math.min(1, m.t / m.dur);
  if (m.type === 'press') {
    for (const px of [-35, 35]) { dot(g, px, 0, 7, '#a7b0a9'); g.strokeStyle = '#4d5650'; g.lineWidth = 1.5; g.stroke(); }
    rr(g, -24, -16, 48, 32, 4); g.fillStyle = '#1f2522'; g.fill();
    if (work) {
      const pulse = m.broken ? 0 : Math.abs(Math.sin(m.t * 7)), sz = 22 + pulse * 7;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-sz / 2 + 3, -sz / 2 + 3, sz, sz);
      rr(g, -sz / 2, -sz / 2, sz, sz, 3); g.fillStyle = '#c3cbc5'; g.fill();
      g.strokeStyle = '#6a736d'; g.lineWidth = 1.5; g.stroke();
    } else if (ready) drawItem(g, 'shell', 0, 0, 1);
    else drawItem(g, 'blank', 0, 0, 0.85, 0.3);
  } else if (m.type === 'winder') {
    dot(g, -14, 0, 17, '#1f2522');
    if (work) {
      dot(g, -14, 0, 5 + 10 * k, '#c9773c');
      g.save(); g.translate(-14, 0); g.rotate(m.broken ? 0 : clock * 14);
      g.strokeStyle = 'rgba(255,215,170,.7)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { g.rotate(PI * 2 / 3); g.beginPath(); g.moveTo(3, 0); g.lineTo(5 + 10 * k, 0); g.stroke(); }
      g.restore();
      dot(g, -14, 0, 3, '#8a9399');
    } else if (ready) drawItem(g, 'coil', -14, 0, 1);
    else drawItem(g, 'wire', -14, 0, 0.85, 0.3);
    rr(g, 10, -15, 28, 30, 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(15, -8 + i * 8); g.lineTo(33, -8 + i * 8); g.stroke(); }
  } else if (m.type === 'solder') {
    const pads = [-27, 1];
    for (let i = 0; i < 2; i++) { rr(g, pads[i] - 13, -13, 26, 26, 4); g.fillStyle = '#1f2522'; g.fill(); }
    if (ready) drawItem(g, 'chip', -13, 0, 1.05);
    else def.in.forEach((type, i) => drawItem(g, type, pads[i], 0, 0.8, work || m.inputs.includes(type) ? 1 : 0.3));
    const tipX = work ? 4 + Math.sin(clock * 9) * 6 : 24, tipY = work ? -2 : -4;
    g.strokeStyle = '#9aa3a8'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(38, -16); g.lineTo(tipX, tipY); g.stroke();
    if (work && !m.broken) dot(g, tipX, tipY, 3, '#ff8a3d');
  } else if (m.type === 'furnace') {
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < 3; i++) g.fillRect(-14 + i * 11, -hh + 4, 6, 4);
    rr(g, -15, -11, 30, 24, 6); g.fillStyle = '#1c1512'; g.fill();
    if (work) {
      const gl = g.createRadialGradient(0, 2, 2, 0, 2, 16);
      const fl = 0.75 + 0.25 * Math.sin(clock * 20);
      gl.addColorStop(0, `rgba(255,210,110,${fl})`); gl.addColorStop(1, 'rgba(230,80,30,.15)');
      rr(g, -15, -11, 30, 24, 6); g.fillStyle = gl; g.fill();
      drawItem(g, 'sand', 0, 1, 0.55, 1 - k);
      drawItem(g, 'glass', 0, 1, 0.55, k);
    } else if (ready) drawItem(g, 'glass', 0, 1, 0.75);
    else drawItem(g, 'sand', 0, 1, 0.6, 0.3);
  } else if (m.type === 'assembler') {
    const pads = [-10, 10];
    for (let i = 0; i < 2; i++) { rr(g, pads[i] - 9, -10, 18, 18, 3); g.fillStyle = '#18201f'; g.fill(); }
    if (ready) drawItem(g, 'drive', 0, -1, 0.8);
    else if (work) {
      drawItem(g, 'coil', pads[0], -1, 0.55);
      drawItem(g, 'gear', pads[1], -1, 0.55);
      const ax = Math.sin(clock * 6) * 9;
      g.strokeStyle = '#c9ced1'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, hh - 3); g.lineTo(ax, 2); g.stroke();
      dot(g, ax, 2, 3, C.hazard);
    } else def.in.forEach((type, i) => drawItem(g, type, pads[i], -1, 0.55, m.inputs.includes(type) ? 1 : 0.3));
  }
  let lamp = 'rgba(255,255,255,.35)';
  if (m.broken) lamp = Math.floor(clock * 8) % 2 ? C.alarm : '#7a2a22';
  else if (work) lamp = Math.floor(clock * 6) % 2 ? '#ff9a3d' : '#8a4a1d';
  else if (ready) lamp = '#4cd07a';
  else if (m.inputs.length) lamp = C.hazard;
  dot(g, hw - 6, -hh + 7, 3.4, lamp);
  if (work) {
    g.fillStyle = '#151917'; g.fillRect(-hw + 8, hh - 6, lw - 16, 3.5);
    g.fillStyle = C.hazard; g.fillRect(-hw + 8, hh - 6, (lw - 16) * k, 3.5);
  }
  if (m.broken) {
    rr(g, -hw, -hh, lw, lh, 6); g.fillStyle = 'rgba(20,20,20,.45)'; g.fill();
    dot(g, 0, 2, 10, C.alarm);
    g.fillStyle = '#fff'; g.font = '15px ' + FONT_D; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', 0, 3);
    for (let i = 0; i < 4; i++) dot(g, -9 + i * 6, -hh + 6, 2.2, i < m.broken ? C.alarm : 'rgba(255,255,255,.35)');
  }
  g.restore();
}
function drawBench() {
  const { x, y, w, h } = bench.rect, col = myColor();
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 3, y + 4, w - 2, h - 2);
  rr(g, x + 2, y + 2, w - 4, h - 4, 5); g.fillStyle = '#5c6a61'; g.fill();
  rr(g, x + 4, y + 4, w - 8, h - 8, 4); g.fillStyle = '#71807a'; g.fill();
  if (evt && evt.id === 'bonus') {
    g.save(); g.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 8);
    rr(g, x + 1, y + 1, w - 2, h - 2, 6); g.strokeStyle = C.hazard; g.lineWidth = 3; g.stroke();
    g.restore();
  }
  g.fillStyle = col; g.fillRect(x + 10, y + h - 8, w - 20, 4);
  if (!order) return;
  const slots = order.prod.slots, n = slots.length, sw = 30, sh = 30, gap = 4;
  let sx = x + (w - (n * sw + (n - 1) * gap)) / 2;
  const sy = y + 5;
  const used = zeroCounts();
  for (const k of slots) {
    const f = used[k] < order.have[k]; used[k]++;
    rr(g, sx, sy, sw, sh, 4); g.fillStyle = f ? '#3a443e' : '#4c5852'; g.fill();
    if (!f) { g.setLineDash([3, 3]); g.strokeStyle = 'rgba(230,235,227,.4)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
    drawItem(g, k, sx + sw / 2, sy + sh / 2, f ? 0.95 : 0.85, f ? 1 : 0.32);
    sx += sw + gap;
  }
  if (bench.doneT > 0) {
    const pop = 1 + 0.45 * Math.max(0, (bench.doneT - 0.8) / 0.2);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(-0.06);
    g.scale(pop, pop);
    rr(g, -52, -14, 104, 28, 4); g.fillStyle = C.hazard; g.fill();
    g.strokeStyle = '#1b1d18'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#1b1d18'; g.font = '16px ' + FONT_D; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ГОТОВО', 0, 1);
    g.restore();
  }
}
const BAD_KINDS = ['benchNo', 'benchBusy', 'mNo', 'mBusy'];
function drawTarget() {
  const t = me.target;
  if (!t || t.kind === 'drop') return;
  g.save();
  g.lineWidth = 2.5; g.setLineDash([6, 4]); g.lineDashOffset = -clock * 22;
  g.strokeStyle = BAD_KINDS.includes(t.kind) ? 'rgba(238,242,234,.6)' : t.kind === 'repair' ? C.hazard : myColor();
  if (t.kind === 'belt' || t.kind === 'floor' || t.kind === 'wfloor') { g.beginPath(); g.arc(t.x, t.y, 16, 0, PI * 2); g.stroke(); }
  else if (t.kind === 'beltPut') {
    drawItem(g, me.hands[me.hands.length - 1], t.x, t.y, 1, 0.45);
    g.beginPath(); g.arc(t.x, t.y, 16, 0, PI * 2); g.stroke();
  } else if (t.m) { const r = t.m.rect; rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 7); g.stroke(); }
  else if (t.b) { const r = t.b.rect; rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 7); g.stroke(); }
  else if (t.kind === 'shove') { g.strokeStyle = C.alarm; g.beginPath(); g.arc(opp.x, opp.y, 22, 0, PI * 2); g.stroke(); }
  g.restore();
}
function drawPlayer(p, main, dark, box) {
  g.save();
  g.translate(p.x, p.y);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(2, 5, 16, 12, 0, 0, PI * 2); g.fill();
  g.save();
  g.rotate(Math.atan2(p.fy, p.fx));
  const bob = Math.sin(p.walk) * 3 * p.moving, hx = p.hands.length ? 12 : 6;
  g.fillStyle = '#d9cfae'; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
  for (const [ax, ay] of [[hx + bob, -11], [hx - bob, 11]]) { g.beginPath(); g.arc(ax, ay, 4.6, 0, PI * 2); g.fill(); g.stroke(); }
  g.fillStyle = dark; g.beginPath(); g.ellipse(-1, 0, 10.5, 14.5, 0, 0, PI * 2); g.fill();
  if (box) { rr(g, -14, -8, 7, 16, 2); g.fillStyle = '#7a6a4a'; g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-7, -9); g.lineTo(3, -6); g.moveTo(-7, 9); g.lineTo(3, 6); g.stroke();
  g.fillStyle = main;
  g.beginPath(); g.arc(1, 0, 12, -0.75, 0.75); g.lineTo(1, 0); g.closePath(); g.fill();
  g.beginPath(); g.arc(1, 0, 9.5, 0, PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.2; g.stroke();
  dot(g, 9.5, 0, 2, '#fff3b0');
  g.restore();
  g.beginPath(); g.ellipse(-3, -4, 3.5, 2.2, -0.6, 0, PI * 2); g.fillStyle = 'rgba(255,255,255,.4)'; g.fill();
  g.restore();
  const n = p.hands.length;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 11;
    drawItem(g, p.hands[i], p.x + p.fx * 18 - p.fy * off, p.y + p.fy * 18 + p.fx * off, n > 1 ? 0.8 : 0.95);
  }
  if (p.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = clock * 6 + i * 2.09, sx = p.x + Math.cos(a) * 13, sy = p.y + Math.sin(a) * 13;
      g.fillStyle = C.hazard; g.beginPath();
      for (let k = 0; k < 8; k++) { const r2 = k % 2 ? 1.4 : 4, aa = k / 8 * PI * 2; g.lineTo(sx + Math.cos(aa) * r2, sy + Math.sin(aa) * r2); }
      g.closePath(); g.fill();
    }
  }
}
function drawSparks() {
  for (const s of sparks) {
    g.globalAlpha = Math.max(0, s.life / s.max);
    g.fillStyle = s.c; g.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
  }
  g.globalAlpha = 1;
}
function drawTexts() {
  const rot = viewFlipped() ? PI : 0;
  for (const t of texts) {
    const k = t.t / t.life;
    const a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.font = t.big ? '22px ' + FONT_D : '700 13px ' + FONT_B;
    const half = g.measureText(t.text).width / 2 + 6;
    const x = Math.max(half, Math.min(W - half, t.x));
    const y = Math.max(16, Math.min(H - 16, t.y));
    g.translate(x, y); g.rotate(rot);
    const dy = -t.t * (t.big ? 20 : 24);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = t.big ? 5 : 4; g.strokeStyle = 'rgba(20,24,22,.9)';
    g.strokeText(t.text, 0, dy);
    g.fillStyle = t.color; g.fillText(t.text, 0, dy);
    g.restore();
  }
}
function drawBig(text, sc, color) {
  g.save();
  g.translate(W / 2, H * 0.56); g.scale(sc, sc);
  g.font = '72px ' + FONT_D; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = 'rgba(20,24,22,.9)';
  g.strokeText(text, 0, 0);
  g.fillStyle = color; g.fillText(text, 0, 0);
  g.restore();
}
function drawBanner() {
  if (!banner) return;
  const k = banner.t / banner.life;
  const a = k < 0.08 ? k / 0.08 : k > 0.82 ? (1 - k) / 0.18 : 1;
  const slide = k < 0.08 ? (1 - k / 0.08) * -20 : 0;
  g.save();
  g.globalAlpha = Math.max(0, a) * 0.95;
  g.translate(W / 2, H * 0.27 + slide);
  rr(g, -176, -31, 352, 62, 8); g.fillStyle = banner.color; g.fill();
  g.strokeStyle = '#1b1d18'; g.lineWidth = 2.5; g.stroke();
  const ink = banner.color === C.alarm ? '#ffffff' : '#1b1d18';
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '21px ' + FONT_D; g.fillText(banner.title, 0, -9);
  g.font = '600 12px ' + FONT_B;
  let desc = banner.desc;
  while (g.measureText(desc).width > 330 && desc.length > 4) desc = desc.slice(0, -2);
  if (desc !== banner.desc) desc = desc.trimEnd() + '…';
  g.fillText(desc, 0, 14);
  g.restore();
}
function drawHall() {
  g.drawImage(hallLayer, 0, 0, W, H);
  drawPuddles();
  drawBelt();
  g.save(); g.setTransform(scale, 0, 0, scale, 0, 0); drawDial(); g.restore();
  for (const it of hallFloor) {
    const a = it.age > 21 && Math.floor(it.age * 6) % 2 === 0 ? 0.35 : 1;
    drawItem(g, it.type, it.x, it.y, 1, a, true);
  }
  for (const it of belt) { const q = pathPos(beltS(it)); drawItem(g, it.type, q.x, q.y, 1, 1, true); }
  me.target = state === 'play' && me.stun <= 0 ? findTarget(me) : null;
  drawTarget();
  const list = opp.here && opp.scene === 'hall' ? [me, opp] : [me];
  list.sort((a, b) => flip ? b.y - a.y : a.y - b.y);
  for (const p of list) {
    if (p === me) drawPlayer(me, myColor(), myDark(), up().cap > 0);
    else drawPlayer(opp, oppColor(), oppDark(), opp.hands.length > 1);
  }
  drawSparks();
  drawTexts();
}
function drawWork() {
  g.drawImage(workLayer, 0, 0, W, H);
  machines.forEach(drawMachine);
  drawBench();
  for (const it of workFloor) drawItem(g, it.type, it.x, it.y, 1, 1, true);
  me.target = state === 'play' && me.stun <= 0 ? findTarget(me) : null;
  drawTarget();
  drawPlayer(me, myColor(), myDark(), up().cap > 0);
  drawSparks();
  drawTexts();
}

const field = $('field');
let scale = 1;
function fitCanvas() {
  const fw = field.clientWidth, fh = field.clientHeight;
  if (!fw || !fh) return;
  const cw = Math.max(120, Math.floor(Math.min(fw - 6, (fh - 6) * W / H)));
  const ch = Math.floor(cw * H / W);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  const s = Math.max(1, Math.min(3, cw * (window.devicePixelRatio || 1) / W));
  if (Math.abs(s - scale) > 0.01 || canvas.width !== Math.round(W * s)) {
    scale = s; canvas.width = Math.round(W * s); canvas.height = Math.round(H * s);
  }
}
if ('ResizeObserver' in window) new ResizeObserver(fitCanvas).observe(field);
addEventListener('resize', fitCanvas);

const ACT_LABEL = {
  belt:'Взять', floor:'Взять', wfloor:'Взять', mTake:'Взять', mUnload:'Забрать', mLoad:'Загрузить', repair:'Чинить',
  bench:'Положить', beltPut:'На ленту', drop:'Бросить', shove:'Толкнуть',
};
let shownAct = '', shownTime = '', shownRush = null, shownEvt = null, shownRnd = '', shownOpp = '';
function draw() {
  if (viewFlipped()) g.setTransform(-scale, 0, 0, -scale, W * scale, H * scale);   // цех развёрнут на 180°
  else g.setTransform(scale, 0, 0, scale, 0, 0);
  if (me.scene === 'hall') drawHall(); else drawWork();
  g.setTransform(scale, 0, 0, scale, 0, 0);
  if (rush && state === 'play') {
    const a = 0.10 + 0.08 * Math.sin(clock * 6);
    const gr = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.62);
    gr.addColorStop(0, 'rgba(224,73,59,0)'); gr.addColorStop(1, `rgba(224,73,59,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  drawBanner();
  if (state === 'count') {
    const n = Math.max(1, Math.ceil(countT)), frac = countT - Math.floor(countT);
    drawBig(String(n), 0.85 + 0.35 * frac, C.hazard);
  } else if (goT > 0 && state === 'play') {
    g.globalAlpha = Math.min(1, goT / 0.3);
    drawBig('Пуск!', 0.9 + (0.8 - goT) * 0.25, C.hazard);
    g.globalAlpha = 1;
  } else if (state === 'roundover') {
    drawBig('Стоп', 0.8, C.ink);
  }
  if (fade > 0) { g.fillStyle = `rgba(17,22,19,${fade})`; g.fillRect(0, 0, W, H); }
  hudFrame();
}

// ---------- табло ----------
function hudFrame() {
  let lbl = 'Действие', dim = true;
  if (state === 'play') {
    if (me.stun > 0) lbl = 'Ой!';
    else if (me.target) { if (ACT_LABEL[me.target.kind]) { lbl = ACT_LABEL[me.target.kind]; dim = false; } else lbl = 'Нельзя'; }
  }
  const key = lbl + (dim ? '0' : '1');
  if (key !== shownAct) { $('actl').textContent = lbl; $('act').classList.toggle('dim', dim); shownAct = key; }
  let ev = '', bad = false;
  if (state === 'play' || state === 'pause' || state === 'count') {
    const parts = [];
    if (rush) { parts.push('Аврал'); bad = true; }
    if (evt) parts.push(`${evt.short} · ${Math.max(1, Math.ceil(evt.dur - evt.t))} с`);
    const broken = machines.filter(m => m.broken > 0).map(m => MACHINES[m.type].tag);
    if (broken.length) { parts.push('Чинить: ' + broken.join(', ')); if (!evt) bad = true; }
    ev = parts.join(' · ');
  }
  const evKey = ev + bad;
  if (evKey !== shownEvt) { const e = $('evt'); e.hidden = !ev; e.textContent = ev; e.classList.toggle('bad', bad); shownEvt = evKey; }
  const live = state === 'count' || state === 'play' || state === 'pause' || state === 'roundover';
  const tt = fmt(live ? timeLeft : duration);
  if (tt !== shownTime) { $('time').textContent = tt; shownTime = tt; }
  const rz = rush && state === 'play';
  if (rz !== shownRush) { $('time').classList.toggle('rush', rz); shownRush = rz; }
  const rt = `Р${Math.max(1, round)}/${rounds}`;
  if (rt !== shownRnd) { $('rnd').textContent = rt; shownRnd = rt; }
  const ow = !net.peer ? 'Нет связи' : opp.scene === 'work' ? 'В мастерской' : 'В цехе';
  if (ow !== shownOpp) { $('oppWho').textContent = ow; shownOpp = ow; }
}
function renderHud() {
  const i = myIdx(), j = 1 - i, settled = lastResultRound === round;
  $('meScore').textContent = tally.total[i] + (settled ? 0 : score);
  $('oppScore').textContent = tally.total[j] + (settled ? 0 : oppRound.s);
  const box = $('chips');
  box.textContent = '';
  $('oname').textContent = order ? `${order.prod.name} · ${order.prod.value}` : '';
  if (!order) return;
  const used = zeroCounts();
  for (const k of order.prod.slots) {
    const filled = used[k] < order.have[k]; used[k]++;
    const ch = document.createElement('span');
    ch.className = 'chip' + (filled ? ' on' : '');
    ch.appendChild(iconImg(k, 20));
    box.appendChild(ch);
  }
}

// ---------- экраны ----------
const overlay = $('overlay');
const sheets = { menu: $('menuSheet'), lobby: $('lobbySheet'), pause: $('pauseSheet'), shop: $('shopSheet'), over: $('overSheet') };
function showSheet(name) {
  overlay.hidden = false;
  for (const k in sheets) sheets[k].hidden = k !== name;
  overlay.scrollTop = 0;
}
function hideOverlays() {
  overlay.hidden = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
const radioVal = (name, def) => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? +el.value : def; };
function setStatus(el, text, kind) { el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); el.hidden = !text; }
function refreshStatus() {
  const host = role === 'host';
  let t, k;
  if (!net.ok) { t = net.tries > 1 ? 'Нет связи с сервером, пробуем снова…' : 'Подключаемся к серверу…'; k = net.tries > 1 ? 'bad' : 'wait'; }
  else if (!net.peer) { t = host ? 'Ждём соперника. Отправьте код или ссылку.' : 'Создателя комнаты нет в сети. Проверьте код или подождите.'; k = 'wait'; }
  else { t = host ? 'Соперник на месте, можно начинать' : 'Вы в комнате. Матч начнёт её создатель'; k = 'ok'; }
  setStatus($('lobbyStatus'), t, k);
  $('btnStart').disabled = !(host && net.ok && net.peer);
  $('guestOpts').textContent = `Матч: ${rounds} ${plural(rounds, ['раунд', 'раунда', 'раундов'])} по ${duration >= 120 ? '2 минуты' : duration + ' секунд'}.`;
  if (!net.ok) setStatus($('pauseStatus'), 'Нет связи с сервером, переподключаемся…', 'bad');
  else if (!net.peer) setStatus($('pauseStatus'), 'Соперник пропал из сети, ждём…', 'wait');
  else setStatus($('pauseStatus'), 'Соперник на связи', 'ok');
  $('btnResume').disabled = !(net.ok && net.peer);
  if (!net.peer) setStatus($('overStatus'), 'Соперника нет в сети', 'bad');
  else setStatus($('overStatus'), host ? '' : 'Новый матч начинает создатель комнаты', 'ok');
  $('btnAgain').hidden = !host;
  if (state === 'shop') renderShop();
}
function inviteUrl() { return `${location.origin}${location.pathname}?room=${net.room}`; }
function showLobby() {
  state = 'lobby';
  const host = role === 'host';
  $('lobbyEyebrow').textContent = host ? 'Ваша комната · отправьте код сопернику' : 'Вы вошли в комнату';
  $('lobbyCode').textContent = net.room;
  $('lobbyLink').textContent = host ? inviteUrl() : '';
  $('lobbyLink').hidden = !host;
  $('btnShare').hidden = !host;
  $('hostOpts').hidden = !host;
  $('btnStart').hidden = !host;
  $('guestOpts').hidden = host;
  refreshStatus();
  renderHud();
  showSheet('lobby');
  releaseAwake();
}
function pauseGame(local) {
  if (!playing()) return;
  resumeTo = state; state = 'pause';
  keys.clear(); touchVec = { x: 0, y: 0 }; actionQueue.length = 0;
  refreshStatus();
  showSheet('pause');
  if (local) net.send({ t: 'pause' });
}
function resumeGame(local) {
  if (state !== 'pause') return;
  if (local && !(net.ok && net.peer)) return;
  state = resumeTo; keys.clear();
  hideOverlays(); keepAwake();
  if (local) net.send({ t: 'resume' });
}
function showShop() {
  state = 'shop';
  renderShop();
  showSheet('shop');
}
function renderShop(flashId) {
  const el = $('shopBody'), r = lastRes || { s: 0, earn: 0, res: 0 };
  const res = r.res > 0 ? 'Раунд ваш!' : r.res < 0 ? 'Раунд за соперником' : 'Ничья в раунде';
  let sub = `+${r.s} ${plural(r.s, ['очко', 'очка', 'очков'])} за раунд · всего ${tally.total[myIdx()]} · заработано ${r.earn} ₽`;
  if (r.res < 0) sub += ', с доплатой отстающему';
  const st = !net.peer ? ['bad', 'Соперника нет в сети'] : oppReady ? ['ok', 'Соперник готов'] : ['wait', 'Соперник выбирает улучшения'];
  el.innerHTML = `
    <div class="shop-head">
      <div><p class="eyebrow">Раунд ${round} из ${rounds} · магазин</p><p class="shop-res">${res}</p></div>
      <div class="wallet" aria-label="Рубли">${wallet.coins} ₽</div>
    </div>
    <p class="shop-sub">${sub}</p>
    <div class="ugrid"></div>
    <p class="status ${st[0]}">${st[1]}</p>
    <button class="btn wide ready${myReady ? ' on' : ''}" type="button">${myReady ? 'Готов · ждём соперника' : `Готов к раунду ${round + 1}`}</button>`;
  const gridEl = el.querySelector('.ugrid');
  for (const u of UPGRADES) {
    const lvl = wallet.up[u.id], max = lvl >= u.prices.length, price = max ? 0 : u.prices[lvl];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'up' + (max ? ' max' : wallet.coins < price ? ' poor' : '') + (flashId === u.id ? ' bought' : '');
    b.dataset.id = u.id;
    const pips = u.prices.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    b.innerHTML = `<b>${u.name}</b><small>${u.desc}</small><span class="foot"><span class="pips">${pips}</span><span class="price">${max ? 'макс.' : price + ' ₽'}</span></span>`;
    gridEl.appendChild(b);
  }
}
function buy(uid) {
  const u = UPGRADES.find(x => x.id === uid);
  if (!u || myReady) return;
  const lvl = wallet.up[uid];
  if (lvl >= u.prices.length) return;
  const price = u.prices[lvl];
  if (wallet.coins < price) { sfx.nope(); return; }
  wallet.coins -= price; wallet.up[uid]++;
  sfx.coin();
  renderShop(uid);
}
$('shopBody').addEventListener('click', e => {
  ensureAudio();
  const u = e.target.closest('.up');
  if (u) { buy(u.dataset.id); return; }
  if (e.target.closest('.ready')) {
    myReady = !myReady;
    sfx.tick();
    net.send({ t: 'ready', on: myReady });
    renderShop();
    hostMaybeNext();
  }
});
function showFinal() {
  state = 'over';
  const i = myIdx(), j = 1 - i, diff = tally.total[i] - tally.total[j];
  $('vTitle').textContent = diff > 0 ? 'Победа!' : diff < 0 ? 'Поражение' : 'Ничья';
  $('vTitle').classList.toggle('win', diff > 0);
  $('vScore').innerHTML = `<span class="m">${tally.total[i]}</span> : <span class="o">${tally.total[j]}</span>`;
  $('vSub').textContent = `Вы выиграли раундов: ${tally.wins[i]} из ${rounds} · собрали ${tally.done[i]} ${plural(tally.done[i], ['изделие', 'изделия', 'изделий'])}`;
  refreshStatus();
  showSheet('over');
  releaseAwake();
}

// ---------- комната ----------
function saveSeat() { try { sessionStorage.setItem('ceh7-seat', JSON.stringify({ room: net.room, role })); } catch (e) {} }
function clearSeat() { try { sessionStorage.removeItem('ceh7-seat'); } catch (e) {} }
function enterRoom(code, r) {
  role = r; flip = r === 'guest';
  document.body.classList.toggle('guest', flip);
  $('meWho').textContent = flip ? 'Вы · синий' : 'Вы · оранжевый';
  rebuildLayers();
  startMatchLocal();
  me = makePlayer(); opp = makePlayer(); order = null; score = 0;
  net.open(code, r);
  saveSeat();
  showLobby();
}
function leaveRoom(msg) {
  net.send({ t: 'bye' });
  net.close();
  clearSeat();
  role = ''; flip = false; state = 'menu';
  document.body.classList.remove('guest');
  releaseAwake();
  $('menuMsg').textContent = msg || '';
  $('menuMsg').hidden = !msg;
  showSheet('menu');
}
function onBye() {
  if (role === 'host') { if (state !== 'lobby') { startMatchLocal(); showLobby(); } }   // ждём другого соперника в той же комнате
  else leaveRoom('Создатель комнаты вышел из игры');
}
function restoreSeat() {
  const q = new URLSearchParams(location.search).get('room');
  let seat = null;
  try { seat = JSON.parse(sessionStorage.getItem('ceh7-seat') || 'null'); } catch (e) {}
  if (q !== null) {
    history.replaceState(null, '', location.pathname + location.hash);
    if (/^\d{4}$/.test(q) && !(seat && seat.room === q)) seat = { room: q, role: 'guest' };
  }
  if (seat && /^\d{4}$/.test(seat.room) && (seat.role === 'host' || seat.role === 'guest')) enterRoom(seat.room, seat.role);
  else showSheet('menu');
}
async function share() {
  const url = inviteUrl();
  try {
    if (navigator.share) { await navigator.share({ title: 'Цех № 7', text: `Заходи в цех! Код комнаты ${net.room}`, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); flashShare('Ссылка скопирована'); }
  catch (e) { flashShare('Скопируйте ссылку ниже'); }
}
function flashShare(text) {
  const b = $('btnShare');
  b.textContent = text;
  clearTimeout(flashShare.t);
  flashShare.t = setTimeout(() => { b.textContent = 'Отправить приглашение'; }, 1800);
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { wakeLock = null; }
}
function releaseAwake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

$('btnCreate').addEventListener('click', () => { ensureAudio(); $('menuMsg').hidden = true; enterRoom(newCode(), 'host'); });
$('joinCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
$('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = $('joinCode').value.replace(/\D/g, '');
  if (code.length !== 4) { $('menuMsg').textContent = 'Код комнаты — четыре цифры'; $('menuMsg').hidden = false; return; }
  ensureAudio();
  $('menuMsg').hidden = true;
  enterRoom(code, 'guest');
});
$('btnShare').addEventListener('click', share);
$('btnStart').addEventListener('click', () => {
  if (role !== 'host' || !net.peer) return;
  rounds = radioVal('rounds', 3); duration = radioVal('dur', 90);
  ensureAudio();
  net.send({ t: 'match', rounds, duration });
  startMatchLocal();
  hostStartRound(1);
});
document.querySelectorAll('input[name="rounds"],input[name="dur"]').forEach(r => r.addEventListener('change', () => {
  if (role !== 'host' || state !== 'lobby') return;
  rounds = radioVal('rounds', 3); duration = radioVal('dur', 90);
  net.send({ t: 'lobby', rounds, duration });
}));
$('btnAgain').addEventListener('click', () => {
  if (role !== 'host') return;
  startMatchLocal();
  showLobby();
  net.send({ t: 'lobby', rounds, duration });
});
$('btnResume').addEventListener('click', () => resumeGame(true));
$('btnPause').addEventListener('click', e => { e.currentTarget.blur(); pauseGame(true); });
for (const id of ['btnLeaveLobby', 'btnLeavePause', 'btnLeaveOver']) $(id).addEventListener('click', () => leaveRoom());

const soundBtns = document.querySelectorAll('.sound-btn');
function syncSound() { soundBtns.forEach(b => { b.textContent = muted ? 'Звук: выкл' : 'Звук: вкл'; b.setAttribute('aria-pressed', muted ? 'false' : 'true'); }); }
soundBtns.forEach(b => b.addEventListener('click', () => {
  muted = !muted; ensureAudio(); syncSound();
  try { localStorage.setItem('ceh7-muted', muted ? '1' : '0'); } catch (err) {}
}));
const landscape = matchMedia('(pointer: coarse) and (orientation: landscape) and (max-height: 560px)');
const onOrient = () => { if (landscape.matches) pauseGame(true); };
if (landscape.addEventListener) landscape.addEventListener('change', onOrient);
else if (landscape.addListener) landscape.addListener(onOrient);

// легенда деталей и станков
(() => {
  const box = $('partsLegend');
  for (const k of RAW) {
    const el = document.createElement('div'); el.className = 'part';
    const ico = document.createElement('span'); ico.className = 'ico'; ico.appendChild(iconImg(k, 26));
    el.append(ico, document.createTextNode(PARTS[k].name));
    box.appendChild(el);
  }
  const flows = $('flowLegend');
  const icon = type => { const s = document.createElement('span'); s.className = 'ico'; s.appendChild(iconImg(type, 24)); return s; };
  for (const def of Object.values(MACHINES)) {
    const flow = document.createElement('div'); flow.className = 'flow';
    def.in.forEach((type, i) => { if (i) flow.append(document.createTextNode('+')); flow.append(icon(type)); });
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = def.tag;
    const out = document.createElement('b'); out.textContent = PARTS[def.out].name;
    flow.append(document.createTextNode('→'), tag, document.createTextNode('→'), icon(def.out), out);
    flows.appendChild(flow);
  }
})();

// для автотестов: открыть страницу с #debug
if (DEBUG) {
  window.__t = {
    get state() { return state; }, get role() { return role; }, get round() { return round; }, get rounds() { return rounds; },
    get me() { return me; }, get opp() { return opp; }, get belt() { return belt; }, get hallFloor() { return hallFloor; },
    get workFloor() { return workFloor; }, get machines() { return machines; }, get order() { return order; },
    get score() { return score; }, get done() { return done; }, get tally() { return tally; }, get wallet() { return wallet; },
    get timeLeft() { return timeLeft; }, set timeLeft(v) { timeLeft = v; }, get phase() { return phase; }, get evt() { return evt; },
    get net() { return net; }, get pending() { return pending; }, get oppRound() { return oppRound; }, get code() { return net.room; },
    act: queueAction, enter: enterScene, beltPos: it => pathPos(beltS(it)), event: id => { if (role === 'host') { evt = null; startEvent(id); } },
    get puddles() { return puddles; }, speed: beltSpeedNow,
    place(x, y, fx = 0, fy = -1) { Object.assign(me, { x, y, fx, fy, vx: 0, vy: 0, kx: 0, ky: 0 }); },
  };
}

// ---------- запуск ----------
syncSound();
rebuildLayers();
fitCanvas();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuildLayers);
restoreSeat();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

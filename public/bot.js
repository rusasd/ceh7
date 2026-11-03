// Бот «Цеха № 7». Живёт в невидимом фрейме со своей копией игры и играет за неё как человек:
// ведёт «джойстик» и жмёт «действие», когда подсвечено нужное. Видит то же, что игрок на экране:
// ленту, пол цеха, свои станки и копии чужих мастерских. Сложность — скорость, реакция, хитрость и наглость.
import { T, COLS, ROWS, MACHINES, UPGRADES } from './art.js';

// какая деталь на каком станке делается
const MAKER = Object.fromEntries(Object.entries(MACHINES).map(([k, d]) => [d.out, k]));
// spd — доля скорости игрока, think — как часто передумывает, react — сколько медлит перед нажатием,
// press — темп нажатий при починке, nap — как часто отвлекается, mix — сколько секунд не понимает, что провода перепутаны,
// dark — скорость в темноте, shop — сколько думает в магазине. Остальное — охота: steal — лезть за деталями к соперникам,
// shove — толкаться, defend — гнать вора из своей мастерской, urgent — браться за срочный заказ, cat — гонять кота,
// dodge — уходить от погрузчика, flee — убегать от котла
const LEVELS = {
  easy:   { spd: .74, think: .6,  react: [.35, .65], press: .34, nap: .08, mix: 4,  dark: .75, shop: [2.5, 5],   steal: 0,   shove: 0,  defend: .3, urgent: .15, cat: .25, dodge: 0,  flee: .3 },
  normal: { spd: .88, think: .36, react: [.14, .3],  press: .2,  nap: .02, mix: 2,  dark: .9,  shop: [1.5, 3.5], steal: .3,  shove: .3, defend: .8, urgent: .55, cat: .6,  dodge: .5, flee: .7 },
  hard:   { spd: 1,   think: .2,  react: [.04, .12], press: .12, nap: 0,   mix: .7, dark: 1,   shop: [1, 2.5],   steal: .75, shove: .7, defend: 1,  urgent: 1,   cat: 1,   dodge: 1,  flee: 1 },
};
// что покупают между раундами — по порядку; в толкотне сложный бот раньше берёт локти и устойчивость
const WISH = {
  easy: ['speed', 'grip', 'bonus', 'armor', 'kit', 'reach', 'elbow'],
  normal: ['speed', 'cap', 'bonus', 'tune', 'reach', 'armor', 'speed', 'bonus'],
  hard: ['cap', 'speed', 'tune', 'bonus', 'speed', 'reach', 'cap', 'bonus', 'speed', 'tune', 'armor', 'elbow', 'grip', 'kit', 'bonus', 'reach', 'armor', 'elbow'],
  rough: ['cap', 'speed', 'armor', 'elbow', 'bonus', 'speed', 'tune', 'armor', 'cap', 'elbow', 'speed', 'bonus', 'reach', 'grip', 'tune', 'kit', 'bonus', 'reach'],
};
const STEP8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // наружу от ленты: с верхней стороны кольца, правой, нижней, левой
const BELT_OFF = 40;   // где стоять у ленты: от её середины до центра игрока
const rnd = (a, b) => a + Math.random() * (b - a);
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const countOf = list => { const m = new Map(); for (const k of list) inc(m, k); return m; };

export function makeBot(G, level) {
  const cfg = LEVELS[level] || LEVELS.normal;
  let task = null, thinkT = 0, react = rnd(...cfg.react), napUntil = 0, chatT = 0;
  let job = null, jobId = -1, raid = null, shopT = -1;
  let nav = null, aim = null, cmd = 0, anchor = { x: 0, y: 0 }, stuckT = 0, jiggle = null;
  let prev = { stun: 0, steal: 0, pass: 0, boiler: false, thief: -1 }, last = null;
  const rolls = new Map();   // «рискнуть или нет» решается один раз на случай — чтобы бот не дёргался туда-сюда
  const cool = new Map();    // что не вышло — к тому пока не возвращаемся
  const now = () => G.clock;
  const own = () => 'w' + G.seat;
  const roll = (key, p) => {
    if (!rolls.has(key)) { if (rolls.size > 300) rolls.clear(); rolls.set(key, Math.random() < p); }
    return rolls.get(key);
  };
  const speed = () => G.SPEED * (1 + 0.1 * G.wallet.up.speed) * cfg.spd * (G.hasBoiler(G.seat) ? 1.2 : 1);
  const cooled = key => (cool.get(key) || 0) > now();

  // ---------- ход: направление по цеху, как джойстик ----------
  function go(x, y) {
    let m = cfg.spd;
    const e = G.evt;
    if (e && e.id === 'dark') m *= cfg.dark;
    if (e && e.id === 'mixup' && e.t > cfg.mix) { x = -x; y = -y; }   // разобрался, что провода перепутаны, — жмёт наоборот
    cmd = Math.hypot(x, y);
    G.move(x * m, y * m);
  }
  function stop() { cmd = 0; G.move(0, 0); }

  // ---------- карта: клетки, путь в обход ленты и станков ----------
  const solid = (sc, c, r) => G.solidAt(sc, c, r);
  function hits(sc, x, y, rad) {
    const c0 = Math.floor((x - rad) / T), c1 = Math.floor((x + rad) / T), r0 = Math.floor((y - rad) / T), r1 = Math.floor((y + rad) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!solid(sc, c, r)) continue;
      const nx = Math.max(c * T, Math.min(x, c * T + T)), ny = Math.max(r * T, Math.min(y, r * T + T));
      if ((x - nx) ** 2 + (y - ny) ** 2 < rad * rad) return true;
    }
    return false;
  }
  // пройдёт ли напрямую
  function clear(sc, ax, ay, bx, by) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
    for (let i = 1; i <= n; i++) if (hits(sc, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, G.R - 1)) return false;
    return true;
  }
  const cellOf = (x, y) => [Math.max(0, Math.min(COLS - 1, Math.floor(x / T))), Math.max(0, Math.min(ROWS - 1, Math.floor(y / T)))];
  // расстояния по клеткам от клетки бота — Дейкстра на 108 клетках; по диагонали — только если не задеваем углы
  function flood() {
    const p = G.me, sc = p.scene, [c0, r0] = cellOf(p.x, p.y);
    if (nav && nav.sc === sc && nav.c0 === c0 && nav.r0 === r0 && now() - nav.at < 0.5) return nav;
    const N = COLS * ROWS, dist = new Float64Array(N).fill(Infinity), back = new Int16Array(N).fill(-1), done = new Uint8Array(N);
    const free = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !solid(sc, c, r);
    dist[r0 * COLS + c0] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const uc = u % COLS, ur = (u - uc) / COLS;
      for (const [dc, dr] of STEP8) {
        const c = uc + dc, r = ur + dr;
        if (!free(c, r) || (dc && dr && (!free(uc + dc, ur) || !free(uc, ur + dr)))) continue;
        const v = r * COLS + c, nd = dist[u] + (dc && dr ? 1.414 : 1) * T;
        if (nd < dist[v]) { dist[v] = nd; back[v] = u; }
      }
    }
    return nav = { sc, c0, r0, dist, back, at: now() };
  }
  // сколько секунд идти до точки в этой же комнате
  function eta(x, y) {
    const n = flood(), [c, r] = cellOf(x, y), d = n.dist[r * COLS + c];
    if (!isFinite(d)) return Infinity;
    return (d || Math.hypot(x - G.me.x, y - G.me.y)) / speed();
  }
  // идти к точке: напрямую, если видно, иначе — к самой дальней видимой клетке пути. true — пришли
  function walk(x, y, tol = 4) {
    const p = G.me, d = Math.hypot(x - p.x, y - p.y);
    if (d <= tol) { stop(); return true; }
    if (!aim || aim.tx !== x || aim.ty !== y || now() - aim.at > 0.15 || Math.hypot(aim.x - p.x, aim.y - p.y) < 6) {
      let a = { x, y };
      if (!clear(p.scene, p.x, p.y, x, y)) {
        const n = flood(), [c, r] = cellOf(x, y), list = [];
        let v = r * COLS + c;
        if (isFinite(n.dist[v])) for (v = n.back[v]; v >= 0 && n.back[v] >= 0; v = n.back[v]) list.push({ x: (v % COLS + .5) * T, y: (Math.floor(v / COLS) + .5) * T });
        if (list.length) {
          a = list[list.length - 1];
          for (const q of list) if (clear(p.scene, p.x, p.y, q.x, q.y)) { a = q; break; }
        }
      }
      aim = { tx: x, ty: y, x: a.x, y: a.y, at: now() };
    }
    const ax = aim.x - p.x, ay = aim.y - p.y, ad = Math.hypot(ax, ay) || 1, k = Math.min(1, Math.max(.3, d / 14));
    go(ax / ad * k, ay / ad * k);
    return false;
  }
  // в другую комнату: из мастерской — в цех, из цеха — в дверь мастерской. true — уже там
  function toScene(sc) {
    const p = G.me;
    if (p.scene === sc) return true;
    if (p.scene !== 'hall') {
      if (p.y < 1.3 * T && p.x > 3.35 * T && p.x < 5.65 * T) go(0, -1);
      else walk(4.5 * T, 1.05 * T, 8);
      return false;
    }
    const s = +sc.slice(1), d = G.DOORS[s], x = (d.c + 1) * T, bottom = d.r === ROWS - 1;
    if ((bottom ? p.y > 10.2 * T : p.y < 1.8 * T) && Math.abs(p.x - x) < 26) {
      const k = Math.max(-.5, Math.min(.5, (x - p.x) / 30));
      go(k, bottom ? 1 : -1);
    } else walk(x, bottom ? 10.5 * T : 1.5 * T, 10);
    return false;
  }

  // ---------- где стоять, чтобы дотянуться ----------
  function segOf(s) { for (let i = 0; i < 4; i++) if (s <= G.SEG[i].start + G.SEG[i].len) return i; return 3; }
  function beltSpot(s) {
    s = ((s % G.L) + G.L) % G.L;
    const i = segOf(s), q = G.pathPos(s), [nx, ny] = OUT[i];
    return { x: q.x + nx * BELT_OFF, y: q.y + ny * BELT_OFF, fx: -nx, fy: -ny };
  }
  // что едет по кольцу со скоростью v: первая точка, куда успеваем дойти раньше
  function intercept(s0, v, maxT = 9) {
    for (let t = 0.25; t <= maxT; t += 0.25) {
      const sp = beltSpot(s0 + v * t);
      if (eta(sp.x, sp.y) + 0.2 <= t) return { ...sp, t };
    }
    return null;
  }
  // к детали на полу — с той стороны, откуда ближе и где не мешает стена
  function floorSpot(sc, x, y) {
    let best = null;
    for (const [dx0, dy0] of STEP8) {
      const l = Math.hypot(dx0, dy0), dx = dx0 / l, dy = dy0 / l, sx = x - dx * 22, sy = y - dy * 22;
      if (hits(sc, sx, sy, G.R + .5)) continue;
      const e = sc === G.me.scene ? eta(sx, sy) : Math.hypot(sx - 4.5 * T, sy - 1.5 * T) / speed();
      if (!best || e < best.e) best = { x: sx, y: sy, fx: dx, fy: dy, e };
    }
    return best;
  }
  const machSpot = m => { const left = m.rect.x === 0; return { x: left ? 66 : 8 * T - 18, y: m.rect.y + m.rect.h / 2, fx: left ? -1 : 1, fy: 0 }; };

  // ---------- задачи: куда встать, куда смотреть и что должно подсветиться ----------
  const use = (key, sc, sp, ok, more) => ({ k: 'use', key, sc, x: sp.x, y: sp.y, fx: sp.fx, fy: sp.fy, ok, patience: 1.3, until: now() + 12, ...more });
  const homeTask = () => ({ k: 'scene', key: 'home', sc: own() });
  const hallTaskGo = () => ({ k: 'scene', key: 'hall', sc: 'hall' });
  function machTask(o, i, kind) {
    const m = (o === G.seat ? G.machines : G.mirrors[o].m)[i];
    return use(kind + o + ':' + i, 'w' + o, machSpot(m), t => t.kind === kind && t.i === i && (t.o === undefined || t.o === o), { repeat: kind === 'repair' });
  }
  function benchTask() {
    let best = null;
    for (const x of [3.5 * T, 4.5 * T, 5.5 * T]) for (const [y, fy] of [[222, 1], [306, -1]]) {
      const e = eta(x, y);
      if (!best || e < best.e) best = { x, y, fx: 0, fy, e };
    }
    return use('bench', own(), best, t => t.kind === 'bench' && t.o === G.seat);
  }
  function floorTask(sc, kind, it, sp, want) {
    return use(kind + it.id, sc, sp, t => t.kind === kind && (t.it.id === it.id || (want && want(t.it.type))));
  }
  function beltTask(it, sp, want) {
    return use('belt' + it.id, 'hall', sp, t => t.kind === 'belt' && (t.it.id === it.id || want(t.it.type)), { patience: sp.t + 1.2, until: now() + sp.t + 6 });
  }
  // окно приёмки срочного заказа — ближнее
  function deliverTask() {
    const low = { x: 4.5 * T, y: 510, fx: 0, fy: 1 }, high = { x: 4.5 * T, y: 66, fx: 0, fy: -1 };
    const w = G.me.scene === 'hall' ? (eta(low.x, low.y) <= eta(high.x, high.y) ? low : high) : G.DOORS[G.seat].r === ROWS - 1 ? low : high;
    return use('deliver', 'hall', w, t => t.kind === 'deliver', { patience: 2, until: now() + 15 });
  }
  // постоять у ленты против спуска со своей стороны — подождать нужное
  function beltWait() {
    const bottom = G.DOORS[G.seat].r === ROWS - 1;
    const sp = beltSpot(bottom ? G.SEG[2].start + G.SEG[2].len / 2 : G.SEG[0].len / 2);
    return { k: 'wait', key: 'beltwait', sc: 'hall', ...sp, until: now() + 0.8 };
  }
  const waitAt = (key, sc, sp) => ({ k: 'wait', key, sc, ...sp, until: now() + 0.8 });
  // бросить лишнее из рук: в мастерской — на склад у дальней стены, в цехе — подальше от ленты
  function dropTask(sc) {
    const floor = sc === 'hall' ? G.hallFloor : G.workFloor, p = G.me;
    const spots = [];
    if (sc === 'hall') {
      for (const [dx, dy] of STEP8) for (const r of [0, 40, 80]) spots.push({ x: p.x + dx * r, y: p.y + dy * r });
    } else for (let x = 2.5; x <= 6.5; x += 1) spots.push({ x: x * T, y: 9.4 * T, fx: 0, fy: 1 });
    let best = null;
    for (const s of spots) {
      if (hits(sc, s.x, s.y, G.R + .5)) continue;
      let fx = s.fx, fy = s.fy;
      if (sc === 'hall') {
        const dx = s.x - 4.5 * T, dy = s.y - 6 * T, d = Math.hypot(dx, dy) || 1;
        // от середины ленты не ближе двух клеток и не в проходе у дверей
        if (Math.max(Math.abs(dx) - 2 * T, 0) + Math.max(Math.abs(dy) - 1.5 * T, 0) < 1.6 * T || s.y > 10 * T || s.y < 2 * T) continue;
        fx = dx / d; fy = dy / d;
      }
      const tx = s.x + fx * 26, ty = s.y + fy * 26;
      if (floor.some(it => Math.hypot(it.x - tx, it.y - ty) < 48) || hits(sc, tx, ty, 6)) continue;
      const e = eta(s.x, s.y);
      if (!best || e < best.e) best = { ...s, fx, fy, e };
    }
    if (!best) return sc === 'hall' ? homeTask() : null;
    return use('drop' + sc, sc, best, t => t.kind === 'drop', { patience: 1 });
  }

  // ---------- план: чего не хватает в заказе и откуда это взять ----------
  // demand — что нужно сделать. Берём из рук, потом с пола мастерской, потом — со станков; остальное — сырьё с ленты.
  // raw — какое сырьё нести, gap — какие детали ещё предстоит сделать, mach — какие станки понадобятся,
  // use — что из рук пригодится, fl — что поднять с пола мастерской
  function plan(demand) {
    const hand = countOf(G.me.hands), floor = countOf(G.workFloor.map(i => i.type));
    const out = { raw: [], gap: new Set(), mach: new Set(), use: new Map(), fl: new Map() }, runs = {};
    const take = (m, k) => { const n = m.get(k) || 0; if (n > 0) m.set(k, n - 1); return n > 0; };
    const need = k => {
      if (take(hand, k)) { inc(out.use, k); return; }
      if (take(floor, k)) { inc(out.fl, k); return; }
      const mt = MAKER[k];
      if (!mt) { out.raw.push(k); return; }
      out.mach.add(mt);
      const m = G.machines.find(x => x.type === mt), r = runs[mt] = (runs[mt] || 0) + 1;
      if (r === 1 && (m.state === 'ready' || m.state === 'work')) return;
      out.gap.add(k);
      const loaded = r === 1 ? m.inputs.slice() : [];
      for (const inp of MACHINES[mt].in) { const j = loaded.indexOf(inp); if (j >= 0) loaded.splice(j, 1); else need(inp); }
    };
    demand.forEach(need);
    return out;
  }
  function demandNow() {
    const out = [], o = G.order;
    if (job) out.push(job.type);
    if (o && !G.benchBusy) for (const k in o.prod.need) for (let i = o.have[k] || 0; i < o.prod.need[k]; i++) out.push(k);
    return out;
  }
  const uselessOf = (hands, used) => { const u = new Map(used); return hands.filter(h => { const n = u.get(h) || 0; if (n > 0) { u.set(h, n - 1); return false; } return true; }); };
  // срочный заказ: браться ли и успеем ли сделать
  function updateJob() {
    const u = G.urgent;
    if (!u || u.by >= 0) { job = null; return; }
    if (u.id === jobId) { if (job && G.pendingD) job = null; return; }
    jobId = u.id; job = null;
    if (Math.random() >= cfg.urgent) return;
    const P = plan([u.type]);
    if (4 + 7 * P.raw.length + 3 * P.mach.size < u.dur - u.t - 2) job = { id: u.id, type: u.type };
  }
  // вор в моей мастерской
  function thiefHome() {
    for (const s of G.seats) { const q = G.peers[s]; if (s !== G.seat && q && q.here && q.scene === own() && G.rivals(G.seat, s)) return s; }
    return -1;
  }

  // ---------- выбор дела ----------
  function choose() {
    const p = G.me, sc = p.scene;
    if (G.boiler) {
      if (G.hasBoiler(G.seat)) return hotPotato();
      const h = G.boiler.holder, q = G.peers[h];
      if (q && q.here && q.scene === sc && Math.hypot(q.x - p.x, q.y - p.y) < 2.6 * T && roll('flee' + G.boiler.id + ':' + h, cfg.flee))
        return { k: 'flee', key: 'flee' + h, s: h, until: now() + 1 };
    }
    const sh = shoveTask();
    if (sh) return sh;
    if (job && p.hands.includes(job.type) && G.urgent && G.urgent.id === job.id && G.urgent.by < 0 && !G.pendingD) return deliverTask();
    const ct = catTask();
    if (ct) return ct;
    return sc === 'hall' ? hallTask() : sc === own() ? workTask() : visitTask();
  }
  function hallTask() {
    const p = G.me, P = plan(demandNow()), room = p.hands.length < G.cap();
    last = P;
    const th = thiefHome();
    if (th >= 0 && roll('home' + th + ':' + Math.floor(now() / 8), cfg.defend * cfg.defend)) return homeTask();
    if (!room) return uselessOf(p.hands, P.use).length ? dropTask('hall') : homeTask();
    // за чем идём; в «Ящиках без наклеек» с ленты берём наугад
    const blind = G.evt && G.evt.id === 'mystery';
    const want = k => P.raw.includes(k) || P.gap.has(k);
    let best = null;
    const consider = (e, t) => { if (t && !cooled(t.key) && (!best || e < best.e)) best = { e, t }; };
    if (P.raw.length) {
      for (const it of G.hallFloor) if (want(it.type)) { const sp = floorSpot('hall', it.x, it.y); if (sp) consider(sp.e, floorTask('hall', 'floor', it, sp, want)); }
      const v = G.beltSpeed();
      for (const it of G.belt) {
        if (!blind && !want(it.type)) continue;
        const sp = intercept(G.beltS(it), v);
        if (sp) consider(sp.t + (blind ? 1 : 0), beltTask(it, sp, blind ? () => true : want));
      }
      raids(P, want, consider);
    }
    if (best && (!p.hands.length || best.e < 6)) return best.t;
    if (p.hands.length || !P.raw.length) return homeTask();
    return beltWait();
  }
  // к соперникам за готовым: только когда хозяина нет дома
  function raids(P, want, consider) {
    if (!cfg.steal) return;
    const seat = G.seat, inside = sp => Math.hypot(sp.x - 4.5 * T, sp.y - 1.5 * T) / speed() + .6, slot = Math.floor(now() / 10);
    for (const o of G.seats) {
      if (o === seat || !G.isOn(o) || !G.rivals(seat, o) || !G.doorOpen(o)) continue;
      const q = G.peers[o];
      if (q && q.here && q.scene === 'w' + o) continue;
      const d = G.DOORS[o], door = eta((d.c + 1) * T, d.r === ROWS - 1 ? 10.5 * T : 1.5 * T);
      if (!isFinite(door)) continue;
      const mir = G.mirrors[o];
      mir.m.forEach((m, i) => {
        const type = MACHINES[m.type].out, key = `raid${o}m${i}`;
        if (m.state !== 'ready' || m.broken || !want(type) || !roll(key + ':' + slot, cfg.steal)) return;
        consider(door + inside(machSpot(m)) + (P.gap.has(type) ? -2 : 1.5), { k: 'scene', key, sc: 'w' + o, raid: { o, kind: 'vTake', i } });
      });
      for (const it of mir.f) {
        const key = `raid${o}f${it.id}`, sp = want(it.type) && floorSpot('w' + o, it.x, it.y);
        if (!sp || !roll(key, cfg.steal)) continue;
        consider(door + sp.e + .6 + (P.gap.has(it.type) ? -2 : 1.5), { k: 'scene', key, sc: 'w' + o, raid: { o, kind: 'vFloor', id: it.id } });
      }
    }
  }
  function workTask() {
    const p = G.me, P = plan(demandNow()), room = p.hands.length < G.cap(), seat = G.seat, list = [];
    const add = (t, bonus = 0) => { if (t && !cooled(t.key)) list.push({ t, e: eta(t.x, t.y) + bonus }); };
    if (!G.benchBusy && p.hands.some(h => G.needs(h) && !(job && h === job.type))) add(benchTask());
    let blocked = false;
    G.machines.forEach((m, i) => {
      if (!P.mach.has(m.type)) return;
      const def = MACHINES[m.type];
      if (m.broken > 0) add(machTask(seat, i, 'repair'));
      else if (m.state === 'ready') { if (room) add(machTask(seat, i, 'mTake')); else blocked = true; }
      else if (m.state === 'idle' && p.hands.some(h => def.in.includes(h) && !m.inputs.includes(h))) add(machTask(seat, i, 'mLoad'), -.6);
    });
    if (room) for (const it of G.workFloor) {
      if (!(P.fl.get(it.type) > 0)) continue;
      const sp = floorSpot(own(), it.x, it.y);
      if (sp) add(floorTask(own(), 'wfloor', it, sp, k => P.fl.get(k) > 0), .3);
    }
    if (list.length) { list.sort((a, b) => a.e - b.e); return list[0].t; }
    // руки заняты, а надо забрать готовое или сходить за сырьём — лишнее на пол
    const extra = uselessOf(p.hands, P.use).length;
    if (p.hands.length && (blocked || (!room && P.raw.length && extra))) { const d = dropTask(own()); if (d) return d; }
    if (P.raw.length && (room || extra)) return hallTaskGo();
    const busy = G.machines.find(m => m.state === 'work' && P.mach.has(m.type));
    if (busy) return waitAt('waitm', own(), machSpot(busy));
    return waitAt('waitb', own(), { x: 4.5 * T, y: 222, fx: 0, fy: 1 });
  }
  function visitTask() {
    const o = +G.me.scene.slice(1), room = G.me.hands.length < G.cap();
    if (raid && raid.o === o && now() < raid.until && room) {
      const mir = G.mirrors[o];
      if (raid.kind === 'vTake') {
        const m = mir.m[raid.i];
        if (m && m.state === 'ready' && !m.broken) return machTask(o, raid.i, 'vTake');
      } else {
        const it = mir.f.find(x => x.id === raid.id), sp = it && floorSpot(G.me.scene, it.x, it.y);
        if (sp) return floorTask(G.me.scene, 'vFloor', it, sp, null);
      }
    }
    raid = null;
    return hallTaskGo();
  }
  // толкнуть: вора у себя, передовика «Схватки», в «Стенку на стенку» — любого; иногда — того, кто несёт детали
  function shoveTask() {
    const p = G.me, seat = G.seat;
    if (task && task.k === 'chase' && !task.cross && !task.done && now() < task.until) return task;
    if (p.shoveCd > 0.2) return null;
    let best = null;
    for (const s of G.seats) {
      if (s === seat || !G.rivals(seat, s) || !G.isOn(s)) continue;
      const q = G.peers[s];
      if (!q || !q.here || q.scene !== p.scene || q.guard > 0 || q.stun > 0) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      let want = 0, range = 0;
      if (p.scene === own()) { want = cfg.defend; range = 6 * T; }
      else if (G.mode === 'brawl' && G.leader() === s && G.roundScore(s) >= 10) { want = Math.min(1, cfg.shove + .25); range = 4 * T; }
      else if (G.evt && G.evt.id === 'melee' && G.roundScore(s) > 0) { want = Math.min(1, cfg.shove + .2); range = 3 * T; }
      else if (q.hands.length) { want = cfg.shove * .6; range = 1.6 * T; }
      if (!want || d > range || !roll(`sh${s}:${Math.floor(now() / 6)}`, want)) continue;
      if (!best || d < best.d) best = { d, s };
    }
    return best && { k: 'chase', key: 'chase' + best.s, s: best.s, until: now() + (level === 'hard' ? 3 : 2.2) };
  }
  // с котлом: к ближнему, кого можно толкнуть, — хоть в чужую мастерскую
  function hotPotato() {
    const p = G.me;
    let best = null;
    for (const s of G.seats) {
      if (s === G.seat || !G.isOn(s) || G.backPass(s)) continue;
      const q = G.peers[s];
      if (!q || !q.here) continue;
      let e = q.scene === p.scene ? Math.hypot(q.x - p.x, q.y - p.y) / speed() : q.scene === 'hall' || p.scene === 'hall' ? 4 : 7;
      if (q.guard > 0 || q.stun > 0) e += 1.2;
      if (!best || e < best.e) best = { e, s };
    }
    if (!best) return waitAt('hotwait', p.scene, { x: p.x, y: p.y, fx: p.fx, fy: p.fy });
    return { k: 'chase', key: 'hot' + best.s, s: best.s, cross: true, until: now() + 5 };
  }
  // кот: перехватить его у ленты и шугнуть
  function catTask() {
    const c = G.cat(), e = G.evt;
    if (!c || c.k < 1 || G.me.scene !== 'hall' || !e || !e.arg || !roll('cat' + Math.floor(e.t / 4), cfg.cat)) return null;
    const sp = intercept(c.s, G.CAT_SPEED * e.arg[1], level === 'hard' ? 4 : 2);
    return sp && use('cat', 'hall', sp, t => t.kind === 'shoo', { patience: sp.t + .8, until: now() + sp.t + 2, quick: true });
  }

  // ---------- исполнение ----------
  function run(t, dt) {
    if (t.k === 'chase') return runChase(t, dt);
    if (t.k === 'flee') return runFlee(t);
    if (t.k === 'scene') { if (toScene(t.sc)) { stop(); t.done = true; } return; }
    if (!toScene(t.sc)) return;
    if (t.k === 'wait') { if (walk(t.x, t.y, 6)) G.face(t.fx, t.fy); if (now() > t.until) t.done = true; return; }
    if (now() > t.until) { t.done = true; return; }
    if (!walk(t.x, t.y, 4)) { t.wait = 0; return; }
    G.face(t.fx, t.fy);
    if (t.next && now() < t.next) return;
    const tg = G.target();
    if (tg && t.ok(tg)) {
      t.wait = (t.wait || 0) + dt;
      if (t.wait < (t.quick ? Math.min(react, .15) : react)) return;
      G.act();
      react = rnd(...cfg.react); t.wait = 0; t.idle = 0;
      if (t.repeat) t.next = now() + cfg.press * rnd(.8, 1.3);
      else { t.done = true; thinkT = Math.min(thinkT, .05); }
    } else {
      t.wait = 0;
      t.idle = (t.idle || 0) + dt;
      if (t.idle > t.patience) { t.done = true; cool.set(t.key, now() + 2); }
    }
  }
  function runChase(t, dt) {
    const p = G.me, q = G.peers[t.s];
    if (!q || !q.here || now() > t.until || (!t.cross && (q.guard > 0 || q.stun > 0))) { t.done = true; return; }
    if (q.scene !== p.scene) { if (t.cross) toScene(q.scene); else t.done = true; return; }
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 44) walk(q.x, q.y, 0); else go(dx / d * .6, dy / d * .6);
    if (d < 80) G.face(dx, dy);
    const tg = G.target();
    if (tg && tg.kind === 'shove' && tg.q.seat === t.s) {
      t.wait = (t.wait || 0) + dt;
      if (t.wait >= Math.min(react, .25)) { G.act(); react = rnd(...cfg.react); t.done = true; thinkT = .1; }
    } else t.wait = 0;
  }
  function runFlee(t) {
    const p = G.me, q = G.peers[t.s];
    if (!q || q.scene !== p.scene || now() > t.until) { t.done = true; return; }
    const d = Math.hypot(p.x - q.x, p.y - q.y) || 1, ax = (p.x - q.x) / d, ay = (p.y - q.y) / d;
    let bx = 0, by = 0, bs = -Infinity;
    for (const [sx, sy] of STEP8) {
      const l = Math.hypot(sx, sy), ux = sx / l, uy = sy / l;
      if (hits(p.scene, p.x + ux * 24, p.y + uy * 24, G.R - 1)) continue;
      const sc = ux * ax + uy * ay;
      if (sc > bs) { bs = sc; bx = ux; by = uy; }
    }
    go(bx, by);
  }
  // погрузчик: если едет на нас — шаг в сторону от его пути
  function dodge() {
    const e = G.evt, f = G.forklift();
    if (!cfg.dodge || G.me.scene !== 'hall' || !f || f.k < .3 || !e || !e.arg || !roll('dodge' + Math.floor(e.t / 3), cfg.dodge)) return;
    const dir = e.arg[1], p = G.me;
    for (const ahead of [0, .3, .6, .9, 1.2]) {
      const s = f.s + dir * G.LIFT_SPEED * ahead, a = G.liftAt(s), b = G.liftAt(s + dir * 14);
      const ang = Math.atan2(b.y - a.y, b.x - a.x), ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = p.x - a.x, dy = p.y - a.y, along = dx * ca + dy * sa, side = -dx * sa + dy * ca;
      if (along > -45 && along < 55 && Math.abs(side) < 40) { const k = side >= 0 ? 1 : -1; go(-sa * k, ca * k); return; }
    }
  }
  // упёрся и стоит — шаг наугад и другое дело
  function unstick(dt) {
    const p = G.me;
    if (cmd < .2) { stuckT = 0; anchor = { x: p.x, y: p.y }; return; }
    stuckT += dt;
    if (stuckT < .7) return;
    if (Math.hypot(p.x - anchor.x, p.y - anchor.y) < 8) {
      const a = Math.random() * Math.PI * 2;
      jiggle = { x: Math.cos(a), y: Math.sin(a), until: now() + .35 };
      if (task) { cool.set(task.key, now() + 1.5); task.done = true; }
      aim = null;
    }
    stuckT = 0; anchor = { x: p.x, y: p.y };
  }
  // фразы: толкнули, утащил, достался котёл, вор в мастерской
  function chat(i, chance) {
    if (now() < chatT || Math.random() > chance) return;
    chatT = now() + rnd(7, 13);
    G.say(i);
  }
  function reactions() {
    const p = G.me, st = G.stats, hot = G.hasBoiler(G.seat), th = p.scene === own() ? thiefHome() : -1;
    if (p.stun > 0 && prev.stun <= 0) chat(Math.random() < .5 ? 6 : 7, .3);
    if (st.steal > prev.steal) chat(3, .5);
    if (hot && !prev.boiler) chat(4, .45);
    if (st.pass > prev.pass) chat(3, .35);
    if (th >= 0 && th !== prev.thief) chat(Math.random() < .5 ? 6 : 0, .45);
    prev = { stun: p.stun, steal: st.steal, pass: st.pass, boiler: hot, thief: th };
  }
  function think() {
    updateJob();
    if (cfg.nap && !G.hasBoiler(G.seat) && Math.random() < cfg.nap) napUntil = now() + rnd(.8, 2);
    const t = choose();
    if (!t) { task = null; return; }
    if (task && !task.done && task.key === t.key) return;
    if (t.raid) raid = { ...t.raid, until: now() + 12 };
    task = t;
  }
  // магазин: подумать, купить по списку, нажать «готов»
  function shop(dt) {
    if (G.ready) return;
    if (shopT < 0) shopT = rnd(...cfg.shop);
    shopT -= dt;
    if (shopT > 0) return;
    const w = G.wallet, list = WISH[level === 'hard' && (G.mode === 'brawl' || G.mode === 'boiler') ? 'rough' : level] || WISH.normal;
    for (const id of list) {
      const u = UPGRADES.find(x => x.id === id), lvl = w.up[id];
      if (!u || lvl >= u.prices.length || u.prices[lvl] > w.coins) continue;
      if (level === 'easy' && Math.random() < .4) break;   // новичок деньги не считает
      G.buy(id);
      shopT = rnd(.3, .7);
      return;
    }
    G.setReady();
  }

  function tick(dt) {
    const st = G.state;
    if (st === 'shop') { stop(); shop(dt); return; }
    shopT = -1;
    if (st !== 'play') { stop(); task = null; aim = null; return; }
    reactions();
    if (G.me.stun > 0) { stop(); return; }
    if (jiggle && now() < jiggle.until) { go(jiggle.x, jiggle.y); return; }
    thinkT -= dt;
    if (thinkT <= 0 || (task && task.done)) { thinkT = cfg.think * rnd(.8, 1.25); think(); }
    if (now() < napUntil) { stop(); return; }
    if (task) run(task, dt); else stop();
    dodge();
    unstick(dt);
  }
  return { tick, get task() { return task ? task.key : ''; }, get job() { return job; }, get raw() { return last ? last.raw.join(',') : ''; } };
}

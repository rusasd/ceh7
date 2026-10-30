// Цех № 7 — данные игры и рисунки деталей. Общие для цеха и мастерских.
export const T = 48, COLS = 9, ROWS = 12, W = COLS * T, H = ROWS * T;
export const PI = Math.PI;
export const C = {
  p1:'#ef7d2d', p1d:'#9c4d1b', p2:'#3aa0d8', p2d:'#215f86', p3:'#58b95e', p3d:'#2f6f35', p4:'#b078e6', p4d:'#64408f',
  hazard:'#f2c230', alarm:'#e0493b', ink:'#eef2ea',
};
export const FONT_D = '"Russo One","Arial Black",sans-serif';
export const FONT_B = '"IBM Plex Sans",system-ui,sans-serif';

export const PARTS = {
  gear:   { name:'Шестерня',  val:10 },
  bolt:   { name:'Болт',      val:10 },
  board:  { name:'Плата',     val:15 },
  blank:  { name:'Заготовка', val:0  },
  wire:   { name:'Медь',      val:10 },
  sand:   { name:'Песок',     val:0  },
  rubber: { name:'Резина',    val:10 },
  battery:{ name:'Батарейка', val:15 },
  plastic:{ name:'Пластик',   val:0  },
  glass:  { name:'Стекло',    val:15 },
  lens:   { name:'Линза',     val:25 },
  shell:  { name:'Корпус',    val:20 },
  keys:   { name:'Кнопки',    val:15 },
  coil:   { name:'Катушка',   val:20 },
  tire:   { name:'Шина',      val:20 },
  frame:  { name:'Рама',      val:25 },
  chip:   { name:'Модуль',    val:40 },
  drive:  { name:'Привод',    val:45 },
};
export const ORDER_KEYS = ['gear','bolt','board','wire','rubber','battery','glass','lens','shell','keys','coil','tire','frame','chip','drive'];
export const RAW = ['gear','bolt','board','blank','wire','sand','rubber','battery','plastic'];
export const RAW_OF = {
  glass:['sand'], lens:['sand'], shell:['blank'], keys:['plastic'], coil:['wire'], tire:['rubber'], frame:['blank','bolt'],
  chip:['board','wire'], drive:['wire','gear'],
};
export const MACHINES = {
  furnace:   { name:'Печь',         tag:'печь',         in:['sand'],          out:'glass', time:2.4, body:'#6b3b2e', broke:'Погасли печи' },
  press:     { name:'Пресс',        tag:'пресс',        in:['blank'],         out:'shell', time:2.4, body:'#3b4c42', broke:'Сломались прессы' },
  winder:    { name:'Намотка',      tag:'намотка',      in:['wire'],          out:'coil',  time:2.6, body:'#454b5e', broke:'Сломались намоточные станки' },
  solder:    { name:'Пайка',        tag:'пайка',        in:['board','wire'],  out:'chip',  time:3.0, body:'#5a4a33', broke:'Сломались паяльные станции' },
  assembler: { name:'Сборка',       tag:'сборка',       in:['coil','gear'],   out:'drive', time:3.0, body:'#36535c', broke:'Встали сборочные стенды' },
  grinder:   { name:'Шлифовка',     tag:'шлифовка',     in:['glass'],         out:'lens',  time:2.4, body:'#4f5d66', broke:'Сломались шлифовальные станки' },
  molder:    { name:'Литьё',        tag:'литьё',        in:['plastic'],       out:'keys',  time:2.4, body:'#3f5a4a', broke:'Встали литьевые машины' },
  welder:    { name:'Сварка',       tag:'сварка',       in:['blank','bolt'],  out:'frame', time:3.0, body:'#4d4b58', broke:'Погасли сварочные посты' },
  vulcanizer:{ name:'Вулканизатор', tag:'вулканизатор', in:['rubber'],        out:'tire',  time:2.6, body:'#4a3f3a', broke:'Остыли вулканизаторы' },
};
export const PRODUCTS = [
  { name:'Будильник',        need:{ gear:2, bolt:1 },                    tier:1 },
  { name:'Колесо тачки',     need:{ rubber:2, bolt:1 },                  tier:1 },
  { name:'Часы',             need:{ gear:2, glass:1 },                   tier:1 },
  { name:'Настольная лампа', need:{ glass:1, wire:1, bolt:1 },           tier:1 },
  { name:'Вентилятор',       need:{ coil:1, gear:1, bolt:1 },            tier:2 },
  { name:'Фонарик',          need:{ shell:1, glass:1, board:1 },         tier:2 },
  { name:'Электромотор',     need:{ coil:1, shell:1, bolt:2 },           tier:2 },
  { name:'Трансформатор',    need:{ coil:2, shell:1 },                   tier:2 },
  { name:'Утюг',             need:{ shell:1, coil:1, rubber:1 },         tier:2 },
  { name:'Радиоприёмник',    need:{ chip:1, shell:1, bolt:1 },           tier:3 },
  { name:'Калькулятор',      need:{ chip:1, shell:1, glass:1 },          tier:3 },
  { name:'Телевизор',        need:{ chip:1, glass:2, shell:1 },          tier:3 },
  { name:'Дрель',            need:{ drive:1, shell:1, rubber:1 },        tier:3 },
  { name:'Миксер',           need:{ drive:1, shell:1, glass:1 },         tier:3 },
  { name:'Самокат',          need:{ drive:1, rubber:2, bolt:1 },         tier:3 },
  { name:'Робот-пылесос',    need:{ chip:1, drive:1, shell:1, rubber:1 },tier:4 },
  { name:'Компьютер',        need:{ chip:2, glass:1, shell:1 },          tier:4 },
  { name:'Станок с ЧПУ',     need:{ chip:1, drive:2, shell:1 },          tier:4 },
  { name:'Электромобиль',    need:{ chip:1, drive:1, rubber:2 },         tier:4 },
  // новые изделия — со второго раунда: первый раунд как раньше
  { name:'Пульт',            need:{ keys:1, battery:1, bolt:1 },         tier:1, since:2 },
  { name:'Ночник',           need:{ glass:1, battery:1 },                tier:1, since:2 },
  { name:'Очки',             need:{ lens:2, bolt:1 },                    tier:2, since:2 },
  { name:'Тачка',            need:{ frame:1, tire:1, bolt:1 },           tier:2, since:2 },
  { name:'Тостер',           need:{ shell:1, coil:1, keys:1 },           tier:2, since:2 },
  { name:'Велосипед',        need:{ frame:1, tire:2, gear:1 },           tier:3, since:2 },
  { name:'Фотоаппарат',      need:{ lens:1, shell:1, chip:1 },           tier:3, since:2 },
  { name:'Микроскоп',        need:{ lens:2, shell:1, bolt:1 },           tier:3, since:2 },
  { name:'Игровая приставка',need:{ chip:1, keys:1, shell:1 },           tier:3, since:2 },
  { name:'Мотоцикл',         need:{ frame:1, tire:2, drive:1 },          tier:4, since:2 },
  { name:'Смартфон',         need:{ chip:1, lens:1, keys:1, battery:1 }, tier:4, since:2 },
  { name:'Квадрокоптер',     need:{ frame:1, drive:2, chip:1 },          tier:4, since:2 },
];
PRODUCTS.forEach(p => {
  let s = 0, n = 0;
  for (const k in p.need) { s += PARTS[k].val * p.need[k]; n += p.need[k]; }
  p.value = s + 5 * n;
  p.slots = ORDER_KEYS.flatMap(k => Array(p.need[k] || 0).fill(k));
});
export const zeroCounts = () => Object.fromEntries(ORDER_KEYS.map(k => [k, 0]));

export const UPGRADES = [
  { id:'speed', name:'Сапоги',        desc:'+10% к скорости',      prices:[25,40,60] },
  { id:'cap',   name:'Ящик',          desc:'+1 деталь в руки',     prices:[45,75] },
  { id:'reach', name:'Длинные руки',  desc:'достаёте дальше',      prices:[25,40] },
  { id:'tune',  name:'Наладчик',      desc:'ваши станки быстрее',  prices:[30,50] },
  { id:'bonus', name:'Премия',        desc:'+15% очков',           prices:[35,55,80] },
  { id:'armor', name:'Устойчивость',  desc:'толчки слабее',        prices:[25,40] },
  { id:'elbow', name:'Локти',         desc:'толкаете чаще',        prices:[20,35] },
  { id:'grip',  name:'Подошвы',       desc:'не скользите',         prices:[20] },
  { id:'kit',   name:'Ремкомплект',   desc:'чините вдвое быстрее', prices:[20] },
];

// modes — в каких режимах бывает событие; без modes — во всех. w — как часто выпадает (без w — 1):
// событий много, и свои события режимов не должны в них теряться
export const EVENTS = [
  { id:'bonus',     title:'Премия ×2',        desc:'Изделия приносят вдвое больше очков', dur:14, short:'Премия ×2', modes:['classic','brawl','boiler'], w:2 },
  { id:'teamBonus', title:'Премия смене',     desc:'Отстающей смене — вдвое больше очков', dur:14, short:'Премия', modes:['teams'], w:2 },
  { id:'guard',     title:'Пропускной режим', desc:'Двери соперников заперты — ходите только к своим', dur:12, short:'Двери заперты', modes:['teams'], w:1.5 },
  { id:'race',      title:'Гонка смен',       desc:'Смене, первой собравшей изделие, — +30 каждому', dur:30, short:'Гонка смен', modes:['teams'], w:1.5 },
  { id:'hunt',      title:'Охота открыта',    desc:'За толчок передовика — вдвое больше очков', dur:12, short:'Охота ×2', modes:['brawl'], w:2 },
  { id:'melee',     title:'Стенка на стенку', desc:'Каждый толчок забирает у соперника 5 очков', dur:12, short:'Толчок −5', modes:['brawl'], w:1.5 },
  { id:'reverse',   title:'Лента назад',      desc:'Конвейер пошёл в обратную сторону',   dur:11, short:'Лента назад' },
  { id:'supply',    title:'Большая поставка', desc:'На ленту сыплются детали',            dur:7,  short:'Поставка' },
  { id:'oil',       title:'Разлито масло',    desc:'На тёмных пятнах в цехе скользко',    dur:15, short:'Масло на полу' },
  { id:'stop',      title:'Сбой подачи',      desc:'Лента встала, детали не поступают',   dur:7,  short:'Лента стоит' },
  { id:'forklift',  title:'Погрузчик в цехе', desc:'Уходите с дороги: собьёт — уроните детали', dur:14, short:'Погрузчик' },
  { id:'dark',      title:'Свет погас',       desc:'В цехе темно, видно только вокруг себя', dur:11, short:'Темно' },
  { id:'turbo',     title:'Ударная смена',    desc:'Станки работают вдвое быстрее',       dur:14, short:'Станки ×2' },
  { id:'carts',     title:'Выдали тележки',   desc:'Каждый уносит на деталь больше',      dur:16, short:'Тележки' },
  { id:'mystery',   title:'Ящики без наклеек', desc:'Что едет по ленте, видно, только когда возьмёте', dur:12, short:'Ящики' },
  { id:'mixup',     title:'Провода перепутались', desc:'Ходите наоборот: вверх — это вниз', dur:15, short:'Наоборот' },
  { id:'cat',       title:'Кот в цехе',       desc:'Бегает по ленте и роняет детали — гоните его!', dur:13, short:'Кот' },
  { id:'breakdown', title:'Поломка!',         desc:'',                                    dur:0,  short:'' },
];

// ---------- рисование ----------
export function rr(d, x, y, w, h, r) {
  d.beginPath();
  d.moveTo(x + r, y);
  d.arcTo(x + w, y, x + w, y + h, r);
  d.arcTo(x + w, y + h, x, y + h, r);
  d.arcTo(x, y + h, x, y, r);
  d.arcTo(x, y, x + w, y, r);
  d.closePath();
}
export function dot(d, x, y, r, fill) { d.beginPath(); d.arc(x, y, r, 0, PI * 2); d.fillStyle = fill; d.fill(); }
export function gearPath(d, x, y, ro, ri, n) {
  d.beginPath();
  for (let i = 0; i < n * 2; i++) d.arc(x, y, i % 2 ? ri : ro, i / (n * 2) * PI * 2, (i + 1) / (n * 2) * PI * 2);
  d.closePath();
}
export function drawItem(d, type, x, y, s = 1, alpha = 1, shadow = false) {
  d.save();
  d.translate(x, y); d.scale(s, s);
  d.globalAlpha *= alpha;
  d.lineJoin = 'round';
  if (shadow) { d.fillStyle = 'rgba(0,0,0,.28)'; d.beginPath(); d.ellipse(1.5, 4, 11, 7.5, 0, 0, PI * 2); d.fill(); }
  switch (type) {
    case 'gear': {
      gearPath(d, 0, 0, 11.4, 8.6, 8);
      d.fillStyle = '#c6cdcf'; d.fill();
      d.lineWidth = 1.4; d.strokeStyle = '#545e64'; d.stroke();
      dot(d, 0, 0, 4.2, '#4a5358');
      d.beginPath(); d.arc(0, 0, 6.6, PI * 1.05, PI * 1.55); d.strokeStyle = 'rgba(255,255,255,.65)'; d.lineWidth = 1.3; d.stroke();
      break;
    }
    case 'bolt': {
      d.rotate(-0.65);
      d.fillStyle = '#c7a54b'; d.strokeStyle = '#6f5a1f'; d.lineWidth = 1.2;
      rr(d, -3.5, -3.3, 15.5, 6.6, 1.6); d.fill(); d.stroke();
      d.strokeStyle = 'rgba(90,70,18,.8)'; d.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const xx = -1 + i * 2.7; d.beginPath(); d.moveTo(xx, -3.3); d.lineTo(xx + 1.4, 3.3); d.stroke(); }
      d.fillStyle = '#ddb955'; d.strokeStyle = '#6f5a1f'; d.lineWidth = 1.2;
      rr(d, -12.5, -6.8, 9.5, 13.6, 2); d.fill(); d.stroke();
      d.fillStyle = 'rgba(255,255,255,.38)'; d.fillRect(-11.3, -5.6, 2.6, 11.2);
      break;
    }
    case 'board': {
      d.fillStyle = '#2e8a4b'; d.strokeStyle = '#1b5530'; d.lineWidth = 1.3;
      rr(d, -11.5, -8.5, 23, 17, 2); d.fill(); d.stroke();
      d.strokeStyle = '#e2c35c'; d.lineWidth = 1.1;
      d.beginPath();
      d.moveTo(-9, -5); d.lineTo(-5.5, -5); d.lineTo(-3.5, -3);
      d.moveTo(-9, 5); d.lineTo(-5.5, 5); d.lineTo(-3.5, 3);
      d.moveTo(9, -5); d.lineTo(3.5, -5);
      d.moveTo(9, 4); d.lineTo(3.5, 4);
      d.stroke();
      d.fillStyle = '#1b201d'; d.fillRect(-3.8, -3.8, 7.6, 7.6);
      for (const [a, b] of [[-9,-5],[-9,5],[9,-5],[9,4]]) dot(d, a, b, 1.4, '#e2c35c');
      break;
    }
    case 'blank': {
      d.fillStyle = '#8f877c'; d.strokeStyle = '#59534b'; d.lineWidth = 1.3;
      rr(d, -10, -10, 20, 20, 2.5); d.fill(); d.stroke();
      d.strokeStyle = 'rgba(255,255,255,.2)'; d.lineWidth = 1;
      for (let i = -7; i <= 7; i += 3.5) { d.beginPath(); d.moveTo(-8, i); d.lineTo(8, i + 0.6); d.stroke(); }
      dot(d, 4, 5, 2.6, 'rgba(140,82,45,.6)');
      dot(d, -5, -4, 1.7, 'rgba(140,82,45,.6)');
      break;
    }
    case 'wire': {
      dot(d, 0, 0, 11, '#b86a33');
      d.strokeStyle = '#6e3a17'; d.lineWidth = 1.3; d.beginPath(); d.arc(0, 0, 11, 0, PI * 2); d.stroke();
      d.strokeStyle = 'rgba(255,205,160,.6)'; d.lineWidth = 1;
      for (const rad of [8.6, 6.4]) { d.beginPath(); d.arc(0, 0, rad, 0, PI * 2); d.stroke(); }
      dot(d, 0, 0, 4, '#2f241c');
      d.strokeStyle = '#e09a5e'; d.lineWidth = 1.7; d.lineCap = 'round';
      d.beginPath(); d.moveTo(8, 7); d.quadraticCurveTo(13, 10, 11, 13); d.stroke();
      break;
    }
    case 'sand': {
      d.beginPath(); d.moveTo(-12, 7); d.quadraticCurveTo(-6, -11, 0, -10); d.quadraticCurveTo(6, -11, 12, 7); d.closePath();
      d.fillStyle = '#d8bb7c'; d.fill(); d.strokeStyle = '#94763e'; d.lineWidth = 1.3; d.stroke();
      d.fillStyle = 'rgba(120,90,40,.55)';
      for (const [a, b] of [[-5,2],[2,-3],[5,3],[-1,5],[-7,5],[1,-7]]) d.fillRect(a, b, 1.6, 1.6);
      d.fillStyle = 'rgba(255,255,255,.35)'; d.fillRect(-3, -6, 4, 1.4);
      break;
    }
    case 'rubber': {
      rr(d, -11.5, -8, 23, 16, 5); d.fillStyle = '#2f3134'; d.fill();
      d.strokeStyle = '#111214'; d.lineWidth = 1.3; d.stroke();
      d.strokeStyle = 'rgba(255,255,255,.28)'; d.lineWidth = 1.6; d.lineCap = 'round';
      for (let i = -7; i <= 7; i += 4.6) { d.beginPath(); d.moveTo(i - 2, -4.5); d.lineTo(i + 1, 0); d.lineTo(i - 2, 4.5); d.stroke(); }
      break;
    }
    case 'glass': {
      rr(d, -10, -10, 20, 20, 3); d.fillStyle = 'rgba(178,226,234,.9)'; d.fill();
      d.strokeStyle = '#5e8f99'; d.lineWidth = 1.4; d.stroke();
      d.strokeStyle = 'rgba(255,255,255,.95)'; d.lineWidth = 1.7; d.lineCap = 'round';
      d.beginPath(); d.moveTo(-6, 3); d.lineTo(3, -6); d.moveTo(-2, 7); d.lineTo(7, -2); d.stroke();
      break;
    }
    case 'shell': {
      d.fillStyle = '#b8523e'; d.strokeStyle = '#62261b'; d.lineWidth = 1.3;
      rr(d, -11.5, -9, 23, 18, 3.5); d.fill(); d.stroke();
      d.fillStyle = 'rgba(255,236,226,.78)';
      for (let i = 0; i < 3; i++) { rr(d, -6, -4.6 + i * 3.4, 12, 1.7, 0.8); d.fill(); }
      for (const [a, b] of [[-8.5,-6],[8.5,-6],[-8.5,6],[8.5,6]]) dot(d, a, b, 1.1, '#62261b');
      break;
    }
    case 'coil': {
      d.fillStyle = '#8a9399'; d.strokeStyle = '#4c555b'; d.lineWidth = 1.2;
      rr(d, -12, -10.5, 4.5, 21, 1.2); d.fill(); d.stroke();
      rr(d, 7.5, -10.5, 4.5, 21, 1.2); d.fill(); d.stroke();
      rr(d, -7.5, -7.5, 15, 15, 2); d.fillStyle = '#c9773c'; d.fill(); d.strokeStyle = '#7a3f17'; d.stroke();
      d.strokeStyle = 'rgba(255,215,170,.65)'; d.lineWidth = 1;
      for (let i = -6; i <= 5; i += 2.6) { d.beginPath(); d.moveTo(i, -7.5); d.lineTo(i + 1.6, 7.5); d.stroke(); }
      break;
    }
    case 'chip': {
      d.fillStyle = '#c9ced1';
      for (let i = -6; i <= 6; i += 4) { d.fillRect(-12.5, i - 1, 4, 2); d.fillRect(8.5, i - 1, 4, 2); }
      rr(d, -9, -10.5, 18, 21, 2.5); d.fillStyle = '#22272a'; d.fill();
      d.strokeStyle = '#0f1214'; d.lineWidth = 1.2; d.stroke();
      dot(d, -4.5, -6, 1.7, '#e2c35c');
      d.strokeStyle = 'rgba(255,255,255,.22)'; d.lineWidth = 1.2;
      d.beginPath(); d.moveTo(-5, 2); d.lineTo(5, 2); d.moveTo(-5, 5.5); d.lineTo(2, 5.5); d.stroke();
      break;
    }
    case 'drive': {
      d.fillStyle = '#c9ced1'; d.fillRect(-13, -2, 6, 4);
      rr(d, -9, -9, 13, 18, 3); d.fillStyle = '#4f6a7d'; d.fill(); d.strokeStyle = '#26394a'; d.lineWidth = 1.3; d.stroke();
      d.fillStyle = '#c9773c'; d.fillRect(-6.5, -5.5, 8, 11);
      d.strokeStyle = 'rgba(255,215,170,.6)'; d.lineWidth = 1;
      for (let i = -5; i <= 0; i += 2.5) { d.beginPath(); d.moveTo(i, -5.5); d.lineTo(i + 1.4, 5.5); d.stroke(); }
      gearPath(d, 6, 0, 7.4, 5.4, 6);
      d.fillStyle = '#c6cdcf'; d.fill(); d.strokeStyle = '#545e64'; d.lineWidth = 1.2; d.stroke();
      dot(d, 6, 0, 2.2, '#4a5358');
      break;
    }
    case 'battery': {
      d.rotate(-0.35);
      rr(d, -11, -6.5, 19, 13, 3); d.fillStyle = '#3a4048'; d.fill();
      d.strokeStyle = '#15181c'; d.lineWidth = 1.3; d.stroke();
      d.fillStyle = '#d9a441'; d.fillRect(1.5, -5.9, 5.8, 11.8);
      rr(d, 8, -3, 3.5, 6, 1); d.fillStyle = '#c9ced1'; d.fill(); d.strokeStyle = '#545e64'; d.lineWidth = 1; d.stroke();
      d.strokeStyle = '#5a3d0e'; d.lineWidth = 1.4; d.lineCap = 'round';
      d.beginPath(); d.moveTo(2.6, 0); d.lineTo(6.2, 0); d.moveTo(4.4, -1.8); d.lineTo(4.4, 1.8); d.stroke();
      d.fillStyle = 'rgba(255,255,255,.18)'; d.fillRect(-9.5, -5, 10, 2);
      break;
    }
    case 'plastic': {
      const beads = [[-7, 4], [-1, 5.5], [5, 4], [-4, -1], [2, -1], [8, -2.5], [-1, -6.5], [-9, -3]];
      beads.forEach(([a, b], i) => {
        dot(d, a, b, 3.7, ['#e8eef0', '#7fc4ea', '#f08a6c'][i % 3]);
        d.strokeStyle = 'rgba(40,60,75,.55)'; d.lineWidth = 1; d.stroke();
      });
      break;
    }
    case 'lens': {
      dot(d, 0, 0, 11, '#8d969c');
      d.strokeStyle = '#4c555b'; d.lineWidth = 1.2; d.stroke();
      const gr = d.createRadialGradient(-3, -3, 1, 0, 0, 9);
      gr.addColorStop(0, '#f4fdff'); gr.addColorStop(1, 'rgba(150,210,225,.95)');
      dot(d, 0, 0, 8.4, gr);
      d.strokeStyle = 'rgba(255,255,255,.95)'; d.lineWidth = 1.6; d.lineCap = 'round';
      d.beginPath(); d.arc(0, 0, 5.6, PI * 1.1, PI * 1.6); d.stroke();
      break;
    }
    case 'tire': {
      dot(d, 0, 0, 11.5, '#26282b');
      d.strokeStyle = '#0d0e10'; d.lineWidth = 1.2; d.stroke();
      d.strokeStyle = 'rgba(255,255,255,.22)'; d.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * PI * 2;
        d.beginPath(); d.moveTo(Math.cos(a) * 8.6, Math.sin(a) * 8.6); d.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); d.stroke();
      }
      dot(d, 0, 0, 5.4, '#a9b1b5');
      d.strokeStyle = '#545e64'; d.lineWidth = 1.1; d.stroke();
      dot(d, 0, 0, 2, '#4a5358');
      break;
    }
    case 'frame': {
      d.lineCap = 'round';
      const bars = () => { d.beginPath(); d.moveTo(-11, 8); d.lineTo(10, 8); d.lineTo(1, -9); d.closePath(); d.moveTo(-5, 0); d.lineTo(6, 1.5); };
      bars(); d.strokeStyle = '#3b4146'; d.lineWidth = 5.5; d.stroke();
      bars(); d.strokeStyle = '#9aa4aa'; d.lineWidth = 3.2; d.stroke();
      for (const [a, b] of [[-11, 8], [10, 8], [1, -9]]) dot(d, a, b, 2.6, '#c7a54b');   // сварные швы
      break;
    }
    case 'keys': {
      rr(d, -11.5, -9.5, 23, 19, 3.5); d.fillStyle = '#ded9cc'; d.fill();
      d.strokeStyle = '#8a8577'; d.lineWidth = 1.3; d.stroke();
      const cols = ['#5d666b', '#5d666b', '#d1553f', '#5d666b', '#4caf6a', '#5d666b'];
      for (let i = 0; i < 6; i++) { rr(d, -8 + (i % 3) * 5.8, -6 + Math.floor(i / 3) * 6.6, 4.4, 4.8, 1.2); d.fillStyle = cols[i]; d.fill(); }
      break;
    }
  }
  d.restore();
}
const iconCache = {};
export function iconURL(type, size) {
  const key = type + size;
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const x = c.getContext('2d'); x.scale(2, 2);
  drawItem(x, type, size / 2, size / 2, size / 26);
  return (iconCache[key] = c.toDataURL());
}
export function iconImg(type, size) {
  const im = new Image(size, size);
  im.src = iconURL(type, size);
  im.alt = PARTS[type].name;
  return im;
}
export function hazard(s, x, y, w, h) {
  s.save(); s.beginPath(); s.rect(x, y, w, h); s.clip();
  s.fillStyle = '#e2b52c'; s.fillRect(x, y, w, h);
  s.strokeStyle = '#1d1f1a'; s.lineWidth = 4;
  const k = Math.max(w, h);
  for (let i = -k - 12; i < w + k + 12; i += 10) { s.beginPath(); s.moveTo(x + i, y + h); s.lineTo(x + i + h, y); s.stroke(); }
  s.restore();
}

// ---------- прочее ----------
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b > 1 && b < 5) return f[1];
  if (b === 1) return f[0];
  return f[2];
}
export function fmt(t) { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

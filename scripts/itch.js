// Сборка для itch.io: копия public/ в dist/itch и архив dist/ceh7-itch.zip для загрузки.
// На itch.io игра открывается с их адреса, поэтому адрес сервера прописывается в index.html.
//   node scripts/itch.js [адрес сервера]   — по умолчанию наш Worker на workers.dev
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SERVER = process.argv[2] || 'wss://ceh7.ruslanrs444.workers.dev';
const SRC = 'public', OUT = 'dist/itch', ZIP = 'dist/ceh7-itch.zip';
if (!/^wss?:\/\/[^/]+$/.test(SERVER)) throw new Error('адрес сервера вида wss://host, без пути: ' + SERVER);

const list = dir => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? list(join(dir, e.name)) : e.isFile() ? [join(dir, e.name).replace(/\\/g, '/')] : []);
const files = list('').sort().map(name => {
  let data = readFileSync(join(SRC, name));
  if (name === 'index.html') {
    const html = data.toString('utf8'), tag = '<meta charset="utf-8">';
    if (!html.includes(tag)) throw new Error('в index.html нет ' + tag);
    data = Buffer.from(html.replace(tag, `${tag}\n<meta name="ceh7-server" content="${SERVER}">`), 'utf8');
  }
  return { name, data };
});
if (!files.some(f => f.name === 'index.html')) throw new Error('в public нет index.html');

rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  mkdirSync(dirname(join(OUT, f.name)), { recursive: true });
  writeFileSync(join(OUT, f.name), f.data);
}
writeFileSync(ZIP, zip(files));
console.log(`${ZIP} (${files.map(f => f.name).join(', ')}) → сервер ${SERVER}`);

// ---------- zip без сторонних пакетов ----------
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return ~c >>> 0;
}
function zip(entries) {
  const DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // у всех файлов 1 января 2026: архив не меняется без причины
  const parts = [], dir = [];
  let offset = 0;
  for (const f of entries) {
    const name = Buffer.from(f.name, 'utf8'), body = deflateRawSync(f.data, { level: 9 }), crc = crc32(f.data);
    // общая часть заголовков: версия 2.0, имена в UTF-8, deflate, дата, crc, размеры, длина имени
    const common = [[20, 2], [0x0800, 2], [8, 2], [0, 2], [DATE, 2], [crc, 4], [body.length, 4], [f.data.length, 4], [name.length, 2], [0, 2]];
    const head = pack([[0x04034b50, 4], ...common]);
    dir.push(pack([[0x02014b50, 4], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), name);
    parts.push(head, name, body);
    offset += head.length + name.length + body.length;
  }
  const cd = Buffer.concat(dir);
  const end = pack([[0x06054b50, 4], [0, 2], [0, 2], [entries.length, 2], [entries.length, 2], [cd.length, 4], [offset, 4], [0, 2]]);
  return Buffer.concat([...parts, cd, end]);
}
function pack(fields) {
  const buf = Buffer.alloc(fields.reduce((n, [, size]) => n + size, 0));
  let at = 0;
  for (const [v, size] of fields) { if (size === 2) buf.writeUInt16LE(v, at); else buf.writeUInt32LE(v, at); at += size; }
  return buf;
}

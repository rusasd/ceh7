// Сервер «Цеха № 7». Ничего не считает: держит комнату до 4 игроков и пересылает сообщения
// каждого игрока всем остальным. Комната — Durable Object по коду из 4 цифр.
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 4;
const json = obj => JSON.stringify(obj);

// постоянный номер игрока из секретного ключа его вкладки: другие видят номер, но не ключ
async function pidOf(token) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ceh7:' + token)));
  return [...hash.slice(0, 5)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // «ping» от игроков отвечается без пробуждения комнаты
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  live() {
    return this.ctx.getWebSockets('p').map(ws => ({ ws, a: ws.deserializeAttachment() || {} }));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const token = (url.searchParams.get('token') || '').slice(0, 40);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    if ((role !== 'host' && role !== 'guest') || !token) return new Response('bad request', { status: 400 });

    const pid = await pidOf(token);
    const [client, server] = Object.values(new WebSocketPair());
    const all = this.live();
    const reject = why => {
      this.ctx.acceptWebSocket(server, ['reject']);
      server.send(json({ t: 'busy', why }));
      server.close(4001, why);
      return new Response(null, { status: 101, webSocket: client });
    };
    // создатель у комнаты один; код совпал с чужой комнатой — пусть выберет другой
    if (role === 'host' && all.some(x => x.a.role === 'host' && x.a.pid !== pid)) return reject('host');
    const others = new Set(all.filter(x => x.a.pid !== pid).map(x => x.a.pid));
    if (others.size >= MAX_PLAYERS) return reject('full');

    // тот же игрок переподключился — старое соединение больше не нужно
    for (const x of all) if (x.a.pid === pid) { try { x.ws.close(4000, 'replaced'); } catch (e) {} }
    this.ctx.acceptWebSocket(server, ['p']);
    server.serializeAttachment({ pid, role });

    const peers = all.filter(x => x.a.pid !== pid).map(x => ({ pid: x.a.pid, role: x.a.role }));
    server.send(json({ t: 'hi', pid, peers }));
    for (const x of all) if (x.a.pid !== pid) { try { x.ws.send(json({ t: 'join', pid, role })); } catch (e) {} }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    const me = ws.deserializeAttachment();
    if (!me || typeof msg !== 'string') return;
    const out = me.pid + '|' + msg;
    for (const x of this.live()) if (x.ws !== ws) { try { x.ws.send(out); } catch (e) {} }
  }

  webSocketClose(ws, code, reason) {
    // отвечаем на закрытие, иначе браузер долго ждёт; 1005 и 1006 отправлять нельзя
    const sendable = code === 1000 || (code >= 3000 && code < 5000);
    try { ws.close(sendable ? code : 1000, reason); } catch (e) {}
    this.left(ws);
  }

  webSocketError(ws) {
    this.left(ws);
  }

  left(ws) {
    const me = ws.deserializeAttachment();
    if (!me || !me.pid) return;
    const rest = this.live().filter(x => x.ws !== ws);
    // если игрок уже переподключился новым соединением, никого не тревожим
    if (rest.some(x => x.a.pid === me.pid)) return;
    for (const x of rest) { try { x.ws.send(json({ t: 'leave', pid: me.pid })); } catch (e) {} }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const room = url.searchParams.get('room') || '';
      if (!/^\d{4}$/.test(room)) return new Response('bad room', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

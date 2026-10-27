// Сервер «Цеха № 7». Ничего не считает: держит комнату на двоих (хозяин и гость)
// и пересылает сообщения одного игрока другому. Комната — Durable Object по коду из 4 цифр.
import { DurableObject } from 'cloudflare:workers';

const other = role => role === 'host' ? 'guest' : 'host';
const json = obj => JSON.stringify(obj);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // «ping» от игроков отвечается без пробуждения комнаты
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const token = (url.searchParams.get('token') || '').slice(0, 40);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    if (role !== 'host' && role !== 'guest') return new Response('bad role', { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    const same = this.ctx.getWebSockets(role);
    if (same.some(ws => (ws.deserializeAttachment() || {}).token !== token)) {
      // место занято другим человеком
      this.ctx.acceptWebSocket(server, ['reject']);
      server.send(json({ t: 'busy' }));
      server.close(4001, 'busy');
      return new Response(null, { status: 101, webSocket: client });
    }
    // тот же игрок переподключился — старое соединение больше не нужно
    for (const ws of same) { try { ws.close(4000, 'replaced'); } catch (e) {} }
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, token });

    const peers = this.ctx.getWebSockets(other(role));
    server.send(json({ t: 'peer', on: peers.length > 0 }));
    for (const ws of peers) { try { ws.send(json({ t: 'peer', on: true })); } catch (e) {} }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    const me = ws.deserializeAttachment();
    if (!me) return;
    for (const peer of this.ctx.getWebSockets(other(me.role))) {
      try { peer.send(msg); } catch (e) {}
    }
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
    if (!me) return;
    // если игрок уже переподключился новым соединением, никого не тревожим
    if (this.ctx.getWebSockets(me.role).some(s => s !== ws)) return;
    for (const peer of this.ctx.getWebSockets(other(me.role))) {
      try { peer.send(json({ t: 'peer', on: false })); } catch (e) {}
    }
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

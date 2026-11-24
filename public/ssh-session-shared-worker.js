/* LinkNest SSH session SharedWorker
 * Holds ttyd WebSockets so SSH stays alive across page refreshes.
 * Sessions are destroyed only when the UI explicitly sends `close`.
 */
/* eslint-disable no-restricted-globals */

const PROTOCOL = ['tty'];
const REPLAY_MAX_BYTES = 256 * 1024;

/** @type {Map<string, {
 *   ws: WebSocket,
 *   gatewaySessionId: string|null,
 *   meta: object|null,
 *   status: string,
 * subscribers: Set<MessagePort>,
 *   replay: Uint8Array[],
 *   replayBytes: number
 * }>} */
const sessions = new Map();

/** @type {Set<MessagePort>} */
const clients = new Set();

function broadcastAll(msg, transfer) {
  for (const port of clients) {
    try {
      if (transfer) port.postMessage(msg, transfer);
      else port.postMessage(msg);
    } catch {
      // ignore dead ports
    }
  }
}

function broadcastSession(sessionId, msg, transfer) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const port of session.subscribers) {
    try {
      if (transfer) port.postMessage(msg, transfer);
      else port.postMessage(msg);
    } catch {
      session.subscribers.delete(port);
    }
  }
}

function pushReplay(session, buffer) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) return;
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  session.replay.push(bytes.slice());
  session.replayBytes += bytes.byteLength;
  while (session.replayBytes > REPLAY_MAX_BYTES && session.replay.length > 1) {
    const dropped = session.replay.shift();
    session.replayBytes -= dropped ? dropped.byteLength : 0;
  }
}

function sendReplay(port, sessionId, session) {
  for (const chunk of session.replay) {
    try {
      const copy = chunk.slice().buffer;
      port.postMessage({ type: 'replay', id: sessionId, data: copy }, [copy]);
    } catch {
      // ignore
    }
  }
}

function listPayload() {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    status: s.status,
    gatewaySessionId: s.gatewaySessionId || null,
    meta: s.meta || null,
    wsUrl: s.wsUrl || null,
  }));
}

function closeSession(sessionId, opts) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    session.ws.onopen = null;
    session.ws.onmessage = null;
    session.ws.onerror = null;
    session.ws.onclose = null;
    if (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING) {
      session.ws.close();
    }
  } catch {
    // ignore
  }
  broadcastSession(sessionId, {
    type: 'status',
    id: sessionId,
    status: 'closed',
    intentional: Boolean(opts && opts.intentional),
    gatewaySessionId: session.gatewaySessionId || null,
  });
  session.subscribers.clear();
}

function openSession(port, msg) {
  const id = String(msg.id || '');
  const wsUrl = String(msg.wsUrl || '');
  if (!id || !wsUrl) {
    port.postMessage({ type: 'open-error', id, message: 'id and wsUrl are required' });
    return;
  }
  if (sessions.has(id)) {
    const existing = sessions.get(id);
    existing.subscribers.add(port);
    existing.gatewaySessionId = msg.gatewaySessionId || existing.gatewaySessionId || null;
    existing.meta = msg.meta || existing.meta || null;
    port.postMessage({
      type: 'open-ok',
      id,
      status: existing.status,
      resumed: true,
      gatewaySessionId: existing.gatewaySessionId,
      meta: existing.meta,
    });
    sendReplay(port, id, existing);
    return;
  }

  let ws;
  try {
    ws = new WebSocket(wsUrl, PROTOCOL);
  } catch (err) {
    port.postMessage({
      type: 'open-error',
      id,
      message: err && err.message ? err.message : 'Failed to open WebSocket',
    });
    return;
  }
  ws.binaryType = 'arraybuffer';

  const session = {
    ws,
    wsUrl,
    gatewaySessionId: msg.gatewaySessionId || null,
    meta: msg.meta || null,
    status: 'connecting',
    subscribers: new Set([port]),
    replay: [],
    replayBytes: 0,
  };
  sessions.set(id, session);

  ws.onopen = () => {
    session.status = 'open';
    broadcastSession(id, { type: 'status', id, status: 'open' });
  };

  ws.onmessage = (ev) => {
    let data = ev.data;
    if (typeof data === 'string') {
      const encoded = new TextEncoder().encode(data);
      pushReplay(session, encoded);
      broadcastSession(id, { type: 'message', id, data: encoded.buffer, encoding: 'utf8' }, [encoded.buffer]);
      return;
    }
    if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => {
        pushReplay(session, buf);
        const copy = buf.slice(0);
        broadcastSession(id, { type: 'message', id, data: copy }, [copy]);
      });
      return;
    }
    if (data instanceof ArrayBuffer) {
      pushReplay(session, data);
      const copy = data.slice(0);
      broadcastSession(id, { type: 'message', id, data: copy }, [copy]);
    }
  };

  ws.onerror = () => {
    session.status = 'error';
    broadcastSession(id, { type: 'status', id, status: 'error' });
  };

  ws.onclose = (ev) => {
    const still = sessions.get(id);
    if (!still || still.ws !== ws) return;
    sessions.delete(id);
    broadcastSession(id, {
      type: 'status',
      id,
      status: 'closed',
      intentional: false,
      code: typeof ev.code === 'number' ? ev.code : 0,
      gatewaySessionId: still.gatewaySessionId || null,
    });
    still.subscribers.clear();
  };

  port.postMessage({
    type: 'open-ok',
    id,
    status: 'connecting',
    resumed: false,
    gatewaySessionId: session.gatewaySessionId,
    meta: session.meta,
  });
}

function onClientMessage(port, ev) {
  const msg = ev.data || {};
  const type = msg.type;

  if (type === 'hello') {
    port.postMessage({ type: 'hello-ok', sessions: listPayload() });
    return;
  }

  if (type === 'list') {
    port.postMessage({ type: 'list-ok', sessions: listPayload() });
    return;
  }

  if (type === 'open') {
    openSession(port, msg);
    return;
  }

  if (type === 'attach') {
    const id = String(msg.id || '');
    const session = sessions.get(id);
    if (!session) {
      port.postMessage({ type: 'attach-error', id, message: 'Session not found' });
      return;
    }
    session.subscribers.add(port);
    port.postMessage({
      type: 'attach-ok',
      id,
      status: session.status,
      gatewaySessionId: session.gatewaySessionId,
      meta: session.meta,
      wsUrl: session.wsUrl,
    });
    sendReplay(port, id, session);
    return;
  }

  if (type === 'detach') {
    const id = String(msg.id || '');
    const session = sessions.get(id);
    if (session) session.subscribers.delete(port);
    return;
  }

  if (type === 'detach-all') {
    for (const session of sessions.values()) {
      session.subscribers.delete(port);
    }
    return;
  }

  if (type === 'send') {
    const id = String(msg.id || '');
    const session = sessions.get(id);
    if (!session || session.ws.readyState !== WebSocket.OPEN) return;
    try {
      if (msg.data instanceof ArrayBuffer) {
        session.ws.send(msg.data);
      } else if (ArrayBuffer.isView(msg.data)) {
        session.ws.send(msg.data);
      } else if (typeof msg.data === 'string') {
        session.ws.send(msg.data);
      } else if (Array.isArray(msg.bytes)) {
        session.ws.send(new Uint8Array(msg.bytes));
      }
    } catch {
      // ignore
    }
    return;
  }

  if (type === 'update-meta') {
    const id = String(msg.id || '');
    const session = sessions.get(id);
    if (!session) return;
    if (msg.gatewaySessionId !== undefined) session.gatewaySessionId = msg.gatewaySessionId;
    if (msg.meta !== undefined) session.meta = msg.meta;
    return;
  }

  if (type === 'close') {
    closeSession(String(msg.id || ''), { intentional: true });
    return;
  }

  if (type === 'close-all') {
    const ids = Array.from(sessions.keys());
    for (const id of ids) closeSession(id, { intentional: true });
    port.postMessage({ type: 'close-all-ok', closed: ids });
  }
}

self.onconnect = (e) => {
  const port = e.ports[0];
  clients.add(port);
  port.onmessage = (ev) => onClientMessage(port, ev);
  port.start();
  port.postMessage({ type: 'hello-ok', sessions: listPayload() });
};

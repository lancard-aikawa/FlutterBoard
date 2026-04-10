'use strict';
const http   = require('http');
const crypto = require('crypto');

// =====================================================================
// Minimal WebSocket client — 外部依存なし（RFC 6455 手動フレーミング）
// Dart VM Service はテキストフレーム（JSON-RPC）のみ使用するため
// text / ping / close の 3 種類だけ対応すれば十分
// =====================================================================

/**
 * Dart VM Service WebSocket に接続し、Stdout/Stderr ストリームを購読する。
 *
 * @param {string} vmServiceUrl  flutter run が出力する http://host:port/token=/ 形式の URL
 * @param {{ onOpen, onMessage, onClose }} callbacks
 *   onOpen(ws)      接続確立時。ws.send(obj) / ws.close() を返す
 *   onMessage(str)  テキストフレーム受信時（JSON 文字列）
 *   onClose()       切断時（正常・異常問わず）
 * @returns {{ close() }}  接続前に強制切断するための早期クローズハンドル
 */
function connectVMService(vmServiceUrl, { onOpen, onMessage, onClose }) {
  // http://host:port/path/ → ws://host:port/path/ws
  let wsUrl;
  try {
    const u    = new URL(vmServiceUrl);
    const path = u.pathname.replace(/\/+$/, '') + '/ws';
    wsUrl = `ws://${u.host}${path}`;
  } catch {
    setTimeout(() => onClose(), 0);
    return { close() {} };
  }

  const u   = new URL(wsUrl);
  const key = crypto.randomBytes(16).toString('base64');

  const reqOpts = {
    hostname: u.hostname,
    port:     parseInt(u.port) || 80,
    path:     u.pathname,
    method:   'GET',
    headers: {
      Host:                    `${u.hostname}:${u.port}`,
      Upgrade:                 'websocket',
      Connection:              'Upgrade',
      'Sec-WebSocket-Key':     key,
      'Sec-WebSocket-Version': '13',
    },
  };

  let closed      = false;
  let earlySocket = null;

  const req = http.request(reqOpts);

  req.on('upgrade', (_res, socket) => {
    earlySocket = socket;
    let buf = Buffer.alloc(0);

    const ws = {
      send(obj) {
        if (closed) return;
        _wsSend(socket, Buffer.from(JSON.stringify(obj)));
      },
      close() {
        if (closed) return;
        closed = true;
        try { socket.destroy(); } catch (_) {}
      },
    };

    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (buf.length < 2) break;
        const opcode  = buf[0] & 0x0f;
        const hasMask = (buf[1] & 0x80) !== 0;
        let payLen    = buf[1] & 0x7f;
        let off       = 2;

        if (payLen === 126) {
          if (buf.length < 4) break;
          payLen = buf.readUInt16BE(2); off = 4;
        } else if (payLen === 127) {
          if (buf.length < 10) break;
          payLen = Number(buf.readBigUInt64BE(2)); off = 10;
        }

        const maskLen = hasMask ? 4 : 0;
        if (buf.length < off + maskLen + payLen) break;

        let payload;
        if (hasMask) {
          const mask = buf.slice(off, off + 4);
          payload = Buffer.alloc(payLen);
          for (let i = 0; i < payLen; i++) payload[i] = buf[off + 4 + i] ^ mask[i % 4];
        } else {
          payload = buf.slice(off + maskLen, off + maskLen + payLen);
        }
        buf = buf.slice(off + maskLen + payLen);

        if      (opcode === 0x1) onMessage(payload.toString('utf8'));      // text
        else if (opcode === 0x9) _wsSend(socket, payload, 0xa);            // ping → pong
        else if (opcode === 0x8) {
          if (!closed) { closed = true; socket.destroy(); onClose(); }
          return;
        }
      }
    });

    socket.on('close', () => { if (!closed) { closed = true; onClose(); } });
    socket.on('error', () => { if (!closed) { closed = true; onClose(); } });

    // Stdout / Stderr ストリームを購読
    let rpcId = 1;
    ws.send({ jsonrpc: '2.0', id: rpcId++, method: 'streamListen', params: { streamId: 'Stdout' } });
    ws.send({ jsonrpc: '2.0', id: rpcId++, method: 'streamListen', params: { streamId: 'Stderr' } });

    onOpen(ws);
  });

  req.on('error', () => { if (!closed) { closed = true; onClose(); } });
  req.end();

  return {
    close() {
      if (closed) return;
      closed = true;
      try { req.destroy(); } catch (_) {}
      if (earlySocket) try { earlySocket.destroy(); } catch (_) {}
    },
  };
}

/**
 * WebSocket テキストフレームを送信（クライアント側はマスク必須）
 */
function _wsSend(socket, payload, opcode = 0x1) {
  const mask   = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];

  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try { socket.write(Buffer.concat([header, mask, masked])); } catch (_) {}
}

// =====================================================================
// VM Service イベントパーサー
// =====================================================================

/**
 * streamNotify イベントからログテキストを取り出す。
 * @param {string} json
 * @returns {{ type: 'stdout'|'stderr', text: string } | null}
 */
function parseVMEvent(json) {
  let msg;
  try { msg = JSON.parse(json); } catch { return null; }
  if (msg.method !== 'streamNotify') return null;
  const { streamId, event } = msg.params || {};
  if (event?.kind !== 'WriteEvent' || !event.bytes) return null;
  const text = Buffer.from(event.bytes, 'base64').toString('utf8');
  return { type: streamId === 'Stderr' ? 'stderr' : 'stdout', text };
}

module.exports = { connectVMService, parseVMEvent };

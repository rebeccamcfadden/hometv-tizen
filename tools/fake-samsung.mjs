// Pretend versions of the two Samsung servers the title-link checks talk to, for running the service on a PC:
// the remote-control socket (ws on 8001 on the TV) and DIAL (8080 on the TV). Both record what they were sent.

import http from 'node:http';
import crypto from 'node:crypto';

function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const header = len < 126 ? Buffer.from([0x81, len]) : Buffer.from([0x81, 126, len >> 8, len & 0xff]);
  return Buffer.concat([header, payload]);
}

function unmask(buf) {
  if (buf.length < 2) return null;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    len = buf.readUInt16BE(2);
    off = 4;
  }
  const mask = buf.subarray(off, off + 4);
  off += 4;
  if (buf.length < off + len) return null;
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = buf[off + i] ^ mask[i % 4];
  return { opcode: buf[0] & 0x0f, text: out.toString('utf8'), size: off + len };
}

/** The remote-control socket: says "connected", then records each message and answers like a TV. */
export function startFakeRemote({ log = () => {} } = {}) {
  const received = [];
  const server = http.createServer((req, res) => res.writeHead(426).end());
  server.on('upgrade', (req, socket) => {
    const accept = crypto
      .createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(frame(JSON.stringify({ event: 'ms.channel.connect', data: { id: 'x', token: 'secret-token' } })));
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (let f = unmask(buf); f; f = unmask(buf)) {
        buf = buf.subarray(f.size);
        if (f.opcode !== 1) continue;
        const msg = JSON.parse(f.text);
        received.push(msg);
        log(`remote socket got ${msg.params?.event} ${JSON.stringify(msg.params?.data)}`);
        socket.write(frame(JSON.stringify({ event: 'ed.apps.launch', data: 200 })));
      }
    });
    socket.on('error', () => {});
  });
  return listen(server, { received });
}

/** DIAL: records the launch body and answers 201 Created, as a TV does. */
export function startFakeDial({ log = () => {} } = {}) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body });
      log(`DIAL ${req.method} ${req.url} ${body}`);
      if (req.method === 'POST' && req.url === '/ws/apps/YouTube') {
        res.writeHead(201, { Location: 'http://127.0.0.1/ws/apps/YouTube/run' }).end();
      } else res.writeHead(404).end();
    });
  });
  return listen(server, { received });
}

function listen(server, extra) {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, ...extra })),
  );
}

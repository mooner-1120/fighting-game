// 시그널링 서버(WebSocket) 연결
import { serverUrl } from '../ui/storage';

type Handler = (msg: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export class ServerConn {
  ws: WebSocket | null = null;
  id = 0;
  private handlers = new Map<string, Set<Handler>>();
  closed = false;
  rtt = 0;
  private pingTimer = 0;

  connect(timeoutMs = 60000): Promise<void> {
    const url = serverUrl();
    return new Promise((resolve, reject) => {
      let done = false;
      const started = Date.now();
      const attempt = () => {
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.onopen = () => {
          done = true;
          this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 3000);
          resolve();
        };
        ws.onmessage = (e) => {
          let msg;
          try {
            msg = JSON.parse(e.data);
          } catch {
            return;
          }
          if (msg.t === 'pong') this.rtt = performance.now() - msg.ts;
          if (msg.t === 'welcome') this.id = msg.id;
          this.emit(msg.t, msg);
          this.emit('*', msg);
        };
        ws.onclose = () => {
          clearInterval(this.pingTimer);
          if (!done) {
            // 무료 서버가 잠들어 있으면 깨어날 때까지 재시도
            if (Date.now() - started < timeoutMs && !this.closed) setTimeout(attempt, 2500);
            else reject(new Error('서버에 연결할 수 없습니다'));
            return;
          }
          if (!this.closed) this.emit('disconnect', {});
        };
        ws.onerror = () => {};
      };
      attempt();
    });
  }

  send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(t: string, h: Handler): () => void {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t)!.add(h);
    return () => this.handlers.get(t)?.delete(h);
  }

  private emit(t: string, msg: unknown) {
    this.handlers.get(t)?.forEach((h) => h(msg));
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

/** 무료 서버(Render)를 페이지 로딩 직후 미리 깨운다 */
export function wakeServer() {
  try {
    const u = serverUrl().replace(/^ws/, 'http') + '/health';
    fetch(u, { mode: 'cors' }).catch(() => {});
  } catch {
    /* 무시 */
  }
}

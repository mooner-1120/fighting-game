// 대전 상대와의 연결: WebRTC DataChannel(P2P) 우선, 실패하면 서버 WebSocket 중계로 자동 전환.
import type { ServerConn } from './server';

const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export type LinkMode = 'connecting' | 'p2p' | 'relay';

export class PeerLink {
  mode: LinkMode = 'connecting';
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private offs: (() => void)[] = [];
  private fallbackTimer = 0;
  onMessage: (m: any) => void = () => {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  onMode: (m: LinkMode) => void = () => {};
  rtt = 0;
  private pingTimer = 0;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(private server: ServerConn, private peerId: number, private initiator: boolean, private matchId: number) {}

  start() {
    this.offs.push(
      this.server.on('signal', (m) => {
        if (m.from === this.peerId && m.data?.mid === this.matchId) this.onSignal(m.data);
      }),
      this.server.on('relay', (m) => {
        if (m.from === this.peerId && m.data?.mid === this.matchId) this.handle(m.data.p);
      }),
    );
    try {
      this.pc = new RTCPeerConnection({ iceServers: ICE });
      this.pc.onicecandidate = (e) => {
        if (e.candidate) this.signal({ ice: e.candidate.toJSON() });
      };
      this.pc.onconnectionstatechange = () => {
        const st = this.pc?.connectionState;
        if ((st === 'failed' || st === 'disconnected') && this.mode !== 'relay') this.useRelay();
      };
      if (this.initiator) {
        this.setupChannel(this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
        this.pc
          .createOffer()
          .then((o) => this.pc!.setLocalDescription(o))
          .then(() => this.signal({ sdp: this.pc!.localDescription }))
          .catch(() => this.useRelay());
      } else {
        this.pc.ondatachannel = (e) => this.setupChannel(e.channel);
      }
    } catch {
      this.useRelay();
    }
    // P2P가 6초 안에 안 붙으면 중계로
    this.fallbackTimer = window.setTimeout(() => {
      if (this.mode === 'connecting') this.useRelay();
    }, 6000);
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 1000);
  }

  private signal(data: object) {
    this.server.send({ t: 'signal', to: this.peerId, data: { ...data, mid: this.matchId } });
  }

  private async onSignal(d: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) {
    if (!this.pc) return;
    try {
      if (d.sdp) {
        await this.pc.setRemoteDescription(d.sdp);
        for (const c of this.pendingIce) await this.pc.addIceCandidate(c).catch(() => {});
        this.pendingIce = [];
        if (d.sdp.type === 'offer') {
          const ans = await this.pc.createAnswer();
          await this.pc.setLocalDescription(ans);
          this.signal({ sdp: this.pc.localDescription });
        }
      } else if (d.ice) {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(d.ice).catch(() => {});
        else this.pendingIce.push(d.ice);
      }
    } catch {
      /* 실패 시 타임아웃 후 중계로 */
    }
  }

  private setupChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      clearTimeout(this.fallbackTimer);
      this.setMode('p2p');
    };
    dc.onclose = () => {
      if (this.mode === 'p2p') this.useRelay();
    };
    dc.onmessage = (e) => {
      try {
        this.handle(JSON.parse(e.data));
      } catch {
        /* 무시 */
      }
    };
  }

  private useRelay() {
    clearTimeout(this.fallbackTimer);
    this.setMode('relay');
  }

  private setMode(m: LinkMode) {
    if (this.mode === m) return;
    this.mode = m;
    this.onMode(m);
  }

  private handle(m: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (m?.t === 'ping') {
      this.send({ t: 'pong', ts: m.ts });
      return;
    }
    if (m?.t === 'pong') {
      this.rtt = performance.now() - m.ts;
      return;
    }
    // 상대가 P2P로 보내고 있으면 나도 P2P 사용
    this.onMessage(m);
  }

  send(m: object) {
    if (this.mode === 'p2p' && this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(m));
        return;
      } catch {
        /* 중계로 */
      }
    }
    if (this.mode !== 'connecting' || (m as { t?: string }).t !== 'in') {
      this.server.send({ t: 'relay', to: this.peerId, data: { mid: this.matchId, p: m } });
    }
  }

  get ready(): boolean {
    return this.mode !== 'connecting';
  }

  close() {
    clearTimeout(this.fallbackTimer);
    clearInterval(this.pingTimer);
    for (const o of this.offs) o();
    this.offs = [];
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      /* 무시 */
    }
  }
}

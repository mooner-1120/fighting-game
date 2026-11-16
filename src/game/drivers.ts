// 게임 진행 방식별 드라이버: 로컬 / 트레이닝 / 온라인(롤백) / 관전 / 리플레이
import { input, type Device } from '../input/input';
import type { PeerLink } from '../net/peer';
import type { ServerConn } from '../net/server';
import { CHARS } from '../sim/chars';
import { cloneState, createState, step } from '../sim/sim';
import { BTN_LK, BTN_LP, BTN_RK, BTN_RP, IN_DOWN, IN_LEFT, IN_RIGHT, type GameEvent, type GameState, type MatchConfig } from '../sim/types';
import { onLeft } from '../sim/sim';
import { CpuBrain } from './ai';
import { RollbackSession, type NetPacket } from './rollback';

export interface Replay {
  v: 1;
  cfg: MatchConfig;
  names: [string, string];
  p0: number[];
  p1: number[];
  date: string;
}

export abstract class Driver {
  state!: GameState;
  onEvents: (ev: GameEvent[], s: GameState) => void = () => {};
  rec: { p0: number[]; p1: number[] } = { p0: [], p1: [] };
  abstract tick(): void;
  status(): string {
    return '';
  }
  dispose(): void {}
  get cfg(): MatchConfig {
    return this.state.cfg;
  }
  protected doStep(ins: [number, number], fresh = true) {
    step(this.state, ins);
    this.rec.p0.push(ins[0]);
    this.rec.p1.push(ins[1]);
    if (fresh) this.onEvents(this.state.ev, this.state);
  }
  replay(names: [string, string]): Replay {
    return { v: 1, cfg: this.state.cfg, names, p0: this.rec.p0, p1: this.rec.p1, date: new Date().toISOString() };
  }
}

export type Ctl = Device | 'cpu1' | 'cpu2' | 'cpu3' | 'any';

function readCtl(c: Ctl, brain: CpuBrain | null, s: GameState): number {
  if (c === 'any') return input.readAny();
  if (brain) return brain.read(s);
  return input.read(c as Device);
}

// ------------------------------------------------------------ 로컬 대전 / CPU 대전
export class LocalDriver extends Driver {
  brains: (CpuBrain | null)[];
  paused = false;
  constructor(cfg: MatchConfig, public ctl: [Ctl, Ctl]) {
    super();
    this.state = createState(cfg);
    this.brains = ctl.map((c, i) => (c.startsWith('cpu') ? new CpuBrain(i, Number(c.slice(3)) as 1 | 2 | 3) : null));
  }
  tick() {
    if (this.paused) return;
    const s = this.state;
    this.doStep([readCtl(this.ctl[0], this.brains[0], s), readCtl(this.ctl[1], this.brains[1], s)]);
  }
}

// ------------------------------------------------------------ 트레이닝
export type DummyMode = 'stand' | 'guard' | 'crouchGuard' | 'randomGuard' | 'cpu' | 'record' | 'playback';

export interface FrameReport {
  name: string;
  startup: number;
  onBlock: number;
  onHit: number;
  measured: number | null;
  result: 'hit' | 'block' | 'whiff' | '';
}

export class TrainingDriver extends Driver {
  mode: DummyMode = 'stand';
  infiniteGauge = true;
  autoHeal = true;
  paused = false;
  private brain = new CpuBrain(1, 2);
  private recBuf: number[] = [];
  private playPos = 0;
  private idleT = 0;
  private randT = 0;
  private randLow = false;
  report: FrameReport | null = null;
  private measure: { start: number; free: [number, number] | null[] } | null = null;
  challenge = 0;
  cleared = new Set<number>();
  constructor(cfg: MatchConfig, public ctl: Ctl) {
    super();
    cfg.noGuard = [false, true];
    cfg.timer = 999;
    cfg.rounds = 99;
    this.state = createState(cfg);
  }
  setMode(m: DummyMode) {
    this.mode = m;
    this.state.cfg.noGuard = [false, m === 'stand'];
    if (m === 'record') this.recBuf = [];
    this.playPos = 0;
  }
  resetPositions() {
    const s = this.state;
    const keep = s.f.map((f) => ({ gauge: f.gauge }));
    const ns = createState(s.cfg);
    while (ns.phase !== 'fight') step(ns, [0, 0]);
    ns.f.forEach((f, i) => (f.gauge = keep[i].gauge));
    this.state = ns;
  }
  tick() {
    if (this.paused) return;
    const s = this.state;
    if (s.phase === 'intro') {
      while (this.state.phase !== 'fight') step(this.state, [0, 0]);
      return;
    }
    const me = readCtl(this.ctl, null, s);
    let p1 = me;
    let p2 = 0;
    const back = onLeft(s, 1) ? IN_LEFT : IN_RIGHT;
    switch (this.mode) {
      case 'guard':
        p2 = 0;
        break;
      case 'crouchGuard':
        p2 = IN_DOWN | back;
        break;
      case 'randomGuard':
        if (--this.randT <= 0) {
          this.randT = 20 + Math.floor(Math.random() * 40);
          this.randLow = Math.random() < 0.5;
        }
        p2 = this.randLow ? IN_DOWN | back : 0;
        break;
      case 'cpu':
        p2 = this.brain.read(s);
        break;
      case 'record':
        // 녹화 중에는 내 조작이 더미로 간다
        p2 = me;
        p1 = 0;
        this.recBuf.push(me);
        if (this.recBuf.length > 600) this.recBuf.shift();
        break;
      case 'playback':
        if (this.recBuf.length) {
          p2 = this.recBuf[this.playPos % this.recBuf.length];
          this.playPos++;
        }
        break;
    }
    this.doStep([p1, p2]);
    this.post();
  }
  private post() {
    const s = this.state;
    const [a, d] = s.f;
    if (this.infiniteGauge) {
      a.gauge = 3000;
      a.ultUsed = false;
      a.emergencyUsed = false;
    }
    // 체력 자동 회복
    const free = (st: string) => st === 'idle' || st === 'walkf' || st === 'walkb' || st === 'crouch';
    if (this.autoHeal) {
      if (free(d.st) && free(a.st)) this.idleT++;
      else this.idleT = 0;
      if (this.idleT > 50) {
        d.hp = d.maxHp;
        a.hp = a.maxHp;
      }
    }
    if (s.phase !== 'fight') {
      d.hp = d.maxHp;
      a.hp = a.maxHp;
      this.resetPositions();
      return;
    }
    // 프레임 측정
    for (const e of s.ev) {
      if ((e.k === 'hit' || e.k === 'block') && e.who === 1 && a.lastMove) {
        const m = CHARS[a.char].moves[a.lastMove.id];
        this.report = { name: m?.name ?? a.lastMove.id, startup: a.lastMove.startup, onBlock: a.lastMove.onBlock, onHit: a.lastMove.onHit, measured: null, result: e.k };
        this.measure = { start: s.frame, free: [null, null] };
      }
    }
    if (this.measure) {
      const fr = this.measure.free as (number | null)[];
      if (fr[0] === null && free(a.st)) fr[0] = s.frame;
      if (fr[1] === null && free(d.st)) fr[1] = s.frame;
      if (d.st === 'air' || d.st === 'down') {
        this.measure = null; // 띄우기·다운은 측정 안 함
      } else if (fr[0] !== null && fr[1] !== null) {
        if (this.report) this.report.measured = fr[1] - fr[0];
        this.measure = null;
      } else if (s.frame - this.measure.start > 120) this.measure = null;
    }
    // 콤보 챌린지
    const ch = CHARS[a.char].combos[this.challenge];
    if (ch && !this.cleared.has(this.challenge)) {
      const mv = d.comboMoves;
      for (let i = 0; i + ch.seq.length <= mv.length; i++) {
        if (ch.seq.every((id, k) => mv[i + k] === id)) {
          this.cleared.add(this.challenge);
          this.onEvents([{ k: 'special', who: 0, name: `챌린지 성공! ${ch.name}` }], s);
          break;
        }
      }
    }
  }
  recLength() {
    return this.recBuf.length;
  }
}

// ------------------------------------------------------------ 온라인 (롤백)
export class OnlineDriver extends Driver {
  session: RollbackSession;
  started = false;
  private goSent = 0;
  private peerGo = false;
  private sentSpec = 0;
  reported = false;
  constructor(cfg: MatchConfig, public local: number, public link: PeerLink, private server: ServerConn, public matchId: number, public playerIds: [number, number], delay: number) {
    super();
    const init = createState(cfg);
    this.session = new RollbackSession(init, local, delay);
    this.state = this.session.state;
    this.session.send = (p) => this.link.send(p);
    this.session.onEvents = (ev, s) => this.onEvents(ev, s);
    this.link.onMessage = (m) => {
      if (m.t === 'in') {
        this.peerGo = true;
        this.session.receive(m as NetPacket);
      } else if (m.t === 'go') {
        this.peerGo = true;
        if (!m.ack) this.link.send({ t: 'go', ack: true });
      }
    };
  }
  tick() {
    if (!this.started) {
      if (this.link.ready && performance.now() - this.goSent > 400) {
        this.goSent = performance.now();
        this.link.send({ t: 'go' });
      }
      if (this.link.ready && this.peerGo) this.started = true;
      return;
    }
    this.session.tick(input.readAny());
    this.state = this.session.state;
    // 관전자용 입력 전송 (10프레임마다)
    if (this.session.frame - this.sentSpec >= 10) {
      const to = this.session.frame - 1;
      const mine = this.session.localInputs(this.sentSpec, to);
      if (mine.length) this.server.send({ t: 'inputs', mid: this.matchId, s: this.sentSpec, i: mine });
      this.sentSpec = to + 1;
    }
    // 결과 보고 (롤백 창보다 충분히 지난 뒤)
    const s = this.state;
    if (!this.reported && s.phase === 'matchEnd' && s.pt > 40) {
      this.reported = true;
      this.server.send({ t: 'result', mid: this.matchId, winner: this.playerIds[s.winner] });
    }
  }
  status() {
    const ses = this.session;
    const mode = this.link.mode === 'p2p' ? 'P2P' : this.link.mode === 'relay' ? '중계' : '연결 중';
    const ping = Math.round(this.link.rtt);
    let t = `${mode} · 핑 ${ping}ms · 롤백 ${ses.lastRollbackLen}F`;
    if (ses.desynced) t += ' · ⚠ 동기화 어긋남';
    if (!this.started) t = `상대와 연결 중… (${mode})`;
    return t;
  }
  replay(names: [string, string]): Replay {
    const c = this.session.confirmedInputs(0);
    return { v: 1, cfg: this.state.cfg, names, p0: c.p0, p1: c.p1, date: new Date().toISOString() };
  }
  dispose() {
    this.link.close();
  }
}

// ------------------------------------------------------------ 관전
export class SpectatorDriver extends Driver {
  inputs: [number[], number[]] = [[], []];
  private f = 0;
  constructor(cfg: MatchConfig) {
    super();
    this.state = createState(cfg);
  }
  feed(p: number, s: number, list: number[]) {
    const arr = this.inputs[p];
    for (let k = 0; k < list.length; k++) if (s + k === arr.length) arr.push(list[k]);
  }
  tick() {
    const avail = Math.min(this.inputs[0].length, this.inputs[1].length);
    const behind = avail - this.f;
    // 너무 뒤처졌으면 빨리 감기 (이벤트 생략)
    if (behind > 240) {
      while (avail - this.f > 30) {
        this.doStep([this.inputs[0][this.f], this.inputs[1][this.f]], false);
        this.f++;
      }
      return;
    }
    const steps = behind > 40 ? 2 : behind > 8 ? 1 : 0;
    for (let i = 0; i < steps; i++) {
      this.doStep([this.inputs[0][this.f], this.inputs[1][this.f]]);
      this.f++;
    }
  }
  status() {
    return '관전 중';
  }
}

// ------------------------------------------------------------ 리플레이
export class ReplayDriver extends Driver {
  private f = 0;
  speed = 1;
  paused = false;
  private acc = 0;
  constructor(public data: Replay) {
    super();
    this.state = createState(structuredClone(data.cfg));
  }
  tick() {
    if (this.paused) return;
    this.acc += this.speed;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.f >= this.data.p0.length) return;
      this.doStep([this.data.p0[this.f], this.data.p1[this.f]]);
      this.f++;
    }
  }
  restart() {
    this.state = createState(structuredClone(this.data.cfg));
    this.f = 0;
  }
  get progress() {
    return this.data.p0.length ? this.f / this.data.p0.length : 1;
  }
  status() {
    return `리플레이 ${Math.floor(this.progress * 100)}% · x${this.speed}`;
  }
}

export { cloneState, BTN_LK, BTN_LP, BTN_RK, BTN_RP };

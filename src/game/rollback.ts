// GGPO 방식 롤백 넷코드.
// - 내 입력은 INPUT_DELAY 프레임 뒤에 적용되도록 예약하고 상대에게 보낸다.
// - 상대 입력이 아직 안 왔으면 마지막 입력으로 예측해서 진행한다.
// - 실제 입력이 예측과 다르면 그 프레임으로 되감아(롤백) 다시 시뮬레이션한다.
// - 예측이 MAX_ROLLBACK 프레임을 넘게 앞서가면 기다린다.

import { checksum } from '../sim/fixed';
import { cloneState, step } from '../sim/sim';
import type { GameEvent, GameState } from '../sim/types';

export const MAX_ROLLBACK = 8;
const RING = 256;
const CHECK_EVERY = 30;

export interface SyncPacket {
  t: 'sync';
  f: number;
  s: GameState;
}

export interface NetPacket {
  t: 'in';
  s: number; // 첫 입력의 프레임
  i: number[]; // 입력들
  a: number; // 상대로부터 받은 마지막 프레임 (ack)
  f: number; // 보낸 쪽 현재 프레임
  c?: [number, number]; // [프레임, 체크섬]
}

export class RollbackSession {
  state: GameState;
  frame = 0; // 다음에 시뮬레이션할 프레임
  local: number;
  delay: number;
  private states: (GameState | null)[] = new Array(RING).fill(null);
  private inputs: [number[], number[]] = [[], []];
  private predicted: number[] = [];
  private remoteLast = -1; // 확정된 상대 입력의 마지막 프레임
  private remoteAck = -1; // 상대가 받은 내 입력 마지막 프레임
  private remoteFrame = 0;
  private rollbackTo = -1;
  private checks = new Map<number, number>();
  private remoteChecks = new Map<number, number>();
  desynced = false;
  resyncs = 0;
  rollbacks = 0;
  stalls = 0;
  lastRollbackLen = 0;
  /** 새로 진행된(재시뮬레이션이 아닌) 프레임의 이벤트 */
  onEvents: (ev: GameEvent[], s: GameState) => void = () => {};
  send: (p: NetPacket | SyncPacket) => void = () => {};
  private lastSyncSent = -1;
  private syncFloor = -1; // 이 프레임 이하의 체크섬은 복구 전 값이라 무시
  private skipCounter = 0;

  constructor(initial: GameState, local: number, delay = 2) {
    this.state = cloneState(initial);
    this.local = local;
    this.delay = delay;
    // 내 입력만 앞 delay 프레임을 0으로 채운다. 상대 입력은 상대가 보낸 값만 쓴다
    // (서로 입력 지연 설정이 달라도 어긋나지 않도록)
    for (let f = 0; f < delay; f++) this.inputs[local][f] = 0;
    this.remoteLast = -1;
    this.states[0] = cloneState(this.state);
  }

  get remote(): number {
    return 1 - this.local;
  }

  /** 상대보다 너무 앞서 있으면 true (이번 틱 쉬기) */
  shouldWait(): boolean {
    if (this.frame - this.remoteLast > MAX_ROLLBACK) return true;
    // 시간 동기: 상대가 계속 뒤처지면 가끔 한 프레임 쉰다
    const ahead = this.frame - this.remoteFrame;
    if (ahead > 3) {
      this.skipCounter++;
      if (this.skipCounter % 6 === 0) return true;
    }
    return false;
  }

  /** 한 틱: 내 입력을 넣고 한 프레임 진행. 진행 못하면 false */
  tick(localInput: number): boolean {
    const target = this.frame + this.delay;
    if (this.inputs[this.local][target] === undefined) this.inputs[this.local][target] = localInput;
    this.sendInputs();
    if (this.shouldWait()) {
      this.stalls++;
      return false;
    }
    this.doRollback();
    this.advance(true);
    this.verifyChecksums();
    return true;
  }

  private inputFor(p: number, f: number): number {
    const v = this.inputs[p][f];
    if (v !== undefined) return v;
    if (p === this.remote) {
      // 예측: 확정된 마지막 입력 반복
      const last = this.remoteLast >= 0 ? this.inputs[p][this.remoteLast] ?? 0 : 0;
      this.predicted[f] = last;
      return last;
    }
    return 0;
  }

  private advance(fresh: boolean): void {
    const f = this.frame;
    const ins: [number, number] = [this.inputFor(0, f), this.inputFor(1, f)];
    if (this.inputs[this.remote][f] !== undefined) delete this.predicted[f];
    step(this.state, ins);
    if (fresh) this.onEvents(this.state.ev, this.state);
    this.frame++;
    this.states[this.frame % RING] = cloneState(this.state);
  }

  private doRollback(): void {
    if (this.rollbackTo < 0) return;
    const to = this.rollbackTo;
    this.rollbackTo = -1;
    const snap = this.states[to % RING];
    if (!snap || snap.frame !== to || this.frame - to >= RING) return;
    const cur = this.frame;
    this.state = cloneState(snap);
    this.frame = to;
    this.lastRollbackLen = cur - to;
    this.rollbacks++;
    while (this.frame < cur) this.advance(false);
  }

  private sendInputs(): void {
    // 상대가 아직 못 받은 입력은 모두 다시 보낸다 (중간이 비면 상대가 영원히 기다리게 됨)
    const end = this.frame + this.delay;
    const start = Math.max(this.remoteAck + 1, end - 240, 0);
    const list: number[] = [];
    for (let f = start; f <= end; f++) list.push(this.inputs[this.local][f] ?? 0);
    const pkt: NetPacket = { t: 'in', s: start, i: list, a: this.remoteLast, f: this.frame };
    // 확정 프레임 체크섬
    let cf = -1;
    for (const k of this.checks.keys()) cf = Math.max(cf, k);
    if (cf > 0) pkt.c = [cf, this.checks.get(cf)!];
    this.send(pkt);
  }

  receive(p: NetPacket): void {
    this.remoteAck = Math.max(this.remoteAck, p.a);
    this.remoteFrame = Math.max(this.remoteFrame, p.f);
    for (let k = 0; k < p.i.length; k++) {
      const f = p.s + k;
      if (f <= this.remoteLast) continue;
      if (f !== this.remoteLast + 1) break; // 순서가 빠진 경우 다음 패킷에서 다시 받는다
      const v = p.i[k];
      this.inputs[this.remote][f] = v;
      this.remoteLast = f;
      if (f < this.frame) {
        const pred = this.predicted[f];
        if (pred !== undefined && pred !== v) {
          if (this.rollbackTo < 0 || f < this.rollbackTo) this.rollbackTo = f;
        }
        delete this.predicted[f];
      }
    }
    if (p.c) this.remoteChecks.set(p.c[0], p.c[1]);
  }

  private verifyChecksums(): void {
    // 양쪽 입력이 모두 확정된 프레임의 상태 체크섬을 기록·비교
    const confirmed = Math.min(this.remoteLast + 1, this.frame);
    const cf = Math.floor(confirmed / CHECK_EVERY) * CHECK_EVERY;
    if (cf > 0 && !this.checks.has(cf) && this.rollbackTo < 0) {
      const st = this.states[cf % RING];
      if (st && st.frame === cf) this.checks.set(cf, checksum(st));
    }
    for (const [f, c] of this.remoteChecks) {
      if (f <= this.syncFloor) {
        this.remoteChecks.delete(f);
        continue;
      }
      const mine = this.checks.get(f);
      if (mine !== undefined) {
        if (mine !== c) this.onDesync();
        this.remoteChecks.delete(f);
      }
    }
    if (this.checks.size > 20) {
      const keys = [...this.checks.keys()].sort((a, b) => a - b);
      for (let i = 0; i < keys.length - 10; i++) this.checks.delete(keys[i]);
    }
  }

  /** 어긋남 감지: 1P(호스트)가 확정 상태를 보내 2P가 그 상태로 맞춘다 */
  private onDesync(): void {
    this.desynced = true;
    if (this.local !== 0) return;
    let f = -1;
    for (const k of this.checks.keys()) if (this.frame - k < RING - 8) f = Math.max(f, k);
    if (f <= 0 || f === this.lastSyncSent) {
      this.desynced = false; // 이미 보낸 복구가 도착하는 중
      return;
    }
    const st = this.states[f % RING];
    if (!st || st.frame !== f) return;
    this.lastSyncSent = f;
    this.syncFloor = f;
    this.resyncs++;
    this.send({ t: 'sync', f, s: st });
    this.desynced = false;
  }

  /** 호스트가 보낸 상태로 덮어쓰고 그 프레임부터 다시 시뮬레이션 */
  receiveSync(p: SyncPacket): void {
    if (this.local === 0 || this.frame - p.f >= RING - 1 || p.f > this.frame) return;
    this.states[p.f % RING] = cloneState(p.s);
    this.checks.clear();
    this.checks.set(p.f, checksum(p.s));
    this.remoteChecks.clear();
    this.syncFloor = p.f;
    if (p.f === this.frame) {
      this.state = cloneState(p.s);
    } else if (this.rollbackTo < 0 || p.f < this.rollbackTo) this.rollbackTo = p.f;
    this.resyncs++;
    this.desynced = false;
  }

  /** 확정된 프레임까지의 입력 (리플레이·관전용) */
  confirmedInputs(from: number): { start: number; p0: number[]; p1: number[] } {
    const end = Math.min(this.remoteLast, this.frame - 1);
    const p0: number[] = [];
    const p1: number[] = [];
    for (let f = from; f <= end; f++) {
      p0.push(this.inputs[0][f] ?? 0);
      p1.push(this.inputs[1][f] ?? 0);
    }
    return { start: from, p0, p1 };
  }

  /** 내 입력 [from, to] (관전 전송용) */
  localInputs(from: number, to: number): number[] {
    const out: number[] = [];
    for (let f = from; f <= to; f++) out.push(this.inputs[this.local][f] ?? 0);
    return out;
  }

  /** 핑 측정 등에 쓰는 지연 프레임 */
  get remoteLag(): number {
    return this.frame - this.remoteLast;
  }
}

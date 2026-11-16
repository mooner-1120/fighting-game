// 결정론적 60fps 고정 스텝 격투 시뮬레이션.
// 같은 초기 설정 + 같은 입력열이면 어떤 PC에서도 같은 결과가 나와야 한다 (롤백 넷코드의 전제).

import { CHARS } from './chars';
import { clamp, idiv, isqrt, norm1000 } from './fixed';
import { dirOf, hasDoubleTap, hasQcf, HIST_LEN, pressed, pushHist, recentPresses, toRelative } from './input';
import { BTN_INDEX, firstActive, lastActive } from './moves';
import { addGauge, dealDamage, emit, faceOpponent, GAUGE_MAX, inEmergency } from './simutil';
import {
  ARENA,
  BODY_R,
  BTN_ALL,
  BTN_LK,
  BTN_LP,
  BTN_RK,
  BTN_RP,
  type CharId,
  type Fighter,
  type GameState,
  type HitDef,
  type MatchConfig,
  type MoveDef,
  type Proj,
  R_B,
  R_D,
  R_F,
  R_U,
} from './types';

const COMBO_IDS = new Set(['t1', 't2', 'ex', 'ult', 'emerg']);
const FREE = new Set(['idle', 'walkf', 'walkb', 'crouch']);
const GRAVITY = 5;
/** 기술 데이터의 띄우기 값 → 실제 속도 */
function lift(v: number): number {
  return idiv(v * 5, 2);
}
const ICE_STAGE = 1;

// ---------------------------------------------------------------- 생성

function newFighter(idx: number, char: CharId, spoke: boolean): Fighter {
  const def = CHARS[char];
  return {
    idx, char, hp: def.maxHp, maxHp: def.maxHp,
    x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, fx: 1000, fz: 0,
    st: 'idle', sf: 0, sd: 0, crouching: false,
    move: null, mf: 0, hitMask: 0, connected: 0, queued: null,
    sideDir: 0, jumpDir: 0,
    gauge: 0, ultUsed: false, emergencyUsed: false,
    combo: 0, comboDmg: 0, comboMoves: [], airHits: 0, wallHits: 0,
    buffs: { armor: 0, atkUp: 0, slow: 0, tariff: 0, briefing: 0 },
    res: [...def.resInit],
    hist: new Array(HIST_LEN).fill(0),
    raw: 0, downTapT: 0, buf: 0, bufT: 0,
    throwInfo: null, spoke, lastMove: null, dmgTaken: 0,
  };
}

export function createState(cfg: MatchConfig): GameState {
  const s: GameState = {
    frame: 0, cfg, phase: 'intro', pt: 0, round: 1, wins: [0, 0], timer: cfg.timer * 60,
    f: [newFighter(0, cfg.chars[0], cfg.spokesman[0]), newFighter(1, cfg.chars[1], cfg.spokesman[1])],
    side: 1, projs: [], nextId: 1, rng: (cfg.seed | 0) || 0x2545f491, cine: null, hitstop: 0, ev: [],
    winner: -1, lastRoundWinner: -1,
  };
  resetRound(s);
  return s;
}

function resetRound(s: GameState): void {
  s.side = 1;
  s.projs = [];
  s.cine = null;
  s.hitstop = 0;
  s.timer = s.cfg.timer * 60;
  s.phase = 'intro';
  s.pt = 0;
  for (const f of s.f) {
    const def = CHARS[f.char];
    f.hp = f.maxHp;
    f.x = f.idx === 0 ? -1400 : 1400;
    f.z = 0;
    f.y = 0;
    f.vx = f.vy = f.vz = 0;
    f.fx = f.idx === 0 ? 1000 : -1000;
    f.fz = 0;
    f.st = 'idle';
    f.sf = 0;
    f.crouching = false;
    f.move = null;
    f.queued = null;
    f.ultUsed = false;
    f.emergencyUsed = false;
    f.buffs = { armor: 0, atkUp: 0, slow: 0, tariff: 0, briefing: 0 };
    f.res = [...def.resInit];
    f.throwInfo = null;
    f.dmgTaken = 0;
    resetCombo(f);
    def.hooks.init?.(s, f);
  }
}

function resetCombo(f: Fighter) {
  f.combo = 0;
  f.comboDmg = 0;
  f.airHits = 0;
  f.wallHits = 0;
  f.comboMoves = [];
}

// ---------------------------------------------------------------- 좌표 도우미

export function onLeft(s: GameState, i: number): boolean {
  return s.side === 1 ? i === 0 : i === 1;
}

/** 화면 오른쪽 방향 R과 화면 안쪽 방향 I (렌더러 카메라도 같은 정의를 쓴다) */
export function screenAxes(s: GameState): { rx: number; rz: number; ix: number; iz: number } {
  const [dx, dz] = norm1000(s.f[1].x - s.f[0].x, s.f[1].z - s.f[0].z);
  const rx = dx * s.side;
  const rz = dz * s.side;
  return { rx, rz, ix: rz, iz: -rx };
}

function moveDef(f: Fighter): MoveDef | null {
  return f.move ? CHARS[f.char].moves[f.move] ?? null : null;
}

function inRange(v: number, r?: [number, number]): boolean {
  return !!r && v >= r[0] && v <= r[1];
}

function slowMul(f: Fighter, v: number): number {
  return f.buffs.slow > 0 ? idiv(v, 2) : v;
}

function becomeIdle(f: Fighter): void {
  f.st = 'idle';
  f.sf = 0;
  f.move = null;
  f.queued = null;
  f.crouching = false;
  resetCombo(f);
}

function setState(f: Fighter, st: Fighter['st'], sd = 0): void {
  f.st = st;
  f.sf = 0;
  f.sd = sd;
}

// ---------------------------------------------------------------- 메인 스텝

export function step(s: GameState, inputs: [number, number]): void {
  s.ev = [];
  s.frame++;
  for (let i = 0; i < 2; i++) {
    const f = s.f[i];
    const live = s.phase === 'fight' && !s.cine;
    const rel = live ? toRelative(inputs[i], onLeft(s, i)) : 0;
    pushHist(f.hist, rel);
    f.raw = inputs[i];
  }

  if (s.phase === 'intro') {
    s.pt++;
    if (s.pt === 1) emit(s, { k: 'round', n: s.round });
    if (s.pt >= 75) {
      s.phase = 'fight';
      s.pt = 0;
      emit(s, { k: 'fight' });
    }
    return;
  }

  if (s.cine) {
    s.cine.t++;
    if (s.cine.t >= s.cine.dur) endCine(s);
    return;
  }

  if (s.hitstop > 0) {
    s.hitstop--;
    // 경직 중에도 선입력은 받는다
    for (const f of s.f) captureBuffer(f);
    return;
  }

  if (s.phase === 'fight') {
    s.timer--;
  } else {
    s.pt++;
  }

  const [a, b] = s.f;
  for (const f of s.f) {
    CHARS[f.char].hooks.tick?.(s, f);
    const bf = f.buffs;
    if (bf.armor > 0) bf.armor--;
    if (bf.atkUp > 0) bf.atkUp--;
    if (bf.slow > 0) bf.slow--;
    if (bf.tariff > 0) bf.tariff--;
    if (bf.briefing > 0) bf.briefing--;
    if (f.bufT > 0) f.bufT--;
  }

  // 방향 갱신
  autoFace(a, b);
  autoFace(b, a);

  if (s.phase === 'fight') {
    control(s, a, b);
    control(s, b, a);
  }
  physics(s, a, b);
  physics(s, b, a);
  pushApart(s);
  for (const f of s.f) wallCheck(s, f);

  // 타격 판정 (동시 처리 → 상쇄 허용)
  if (s.phase === 'fight') {
    const pend = [...detectHits(a, b), ...detectHits(b, a)];
    for (const p of pend) {
      const A = s.f[p.a];
      const D = s.f[1 - p.a];
      const m = CHARS[A.char].moves[p.move];
      A.hitMask |= 1 << p.i;
      resolveHit(s, A, D, p.h, { rem: m.total - p.mf, fx: p.fx, fz: p.fz, moveId: p.move, proj: false });
    }
    throwCheck(s, a, b);
    throwCheck(s, b, a);
    updateProjs(s);
  }

  checkRoundEnd(s);
}

// ---------------------------------------------------------------- 조작

function autoFace(f: Fighter, o: Fighter): void {
  const m = moveDef(f);
  if (FREE.has(f.st) || f.st === 'side' || f.st === 'dash' || f.st === 'bdash' || f.st === 'hs' || f.st === 'bs' || f.st === 'getup' || f.st === 'win') {
    faceOpponent(f, o);
  } else if (f.st === 'atk' && m && m.track && f.mf < firstActive(m)) {
    faceOpponent(f, o);
  }
}

function captureBuffer(f: Fighter): void {
  const p = f.hist[0] & ~f.hist[1] & BTN_ALL;
  if (p) {
    f.buf = p;
    f.bufT = 6;
  }
}

function control(s: GameState, f: Fighter, o: Fighter): void {
  const rel = f.hist[0];
  const dir = dirOf(rel);
  const st = f.st;

  const free = FREE.has(st) || (st === 'side' && f.sf >= 3) || (st === 'dash' && f.sf >= 5) || (st === 'bdash' && f.sf >= 12);
  if (!free) {
    if (st === 'atk') {
      attackInput(s, f, o);
    } else if (st === 'down') {
      if (f.sf >= 18 && (rel !== 0)) setState(f, 'getup', 20);
    } else if (st === 'thrown') {
      throwBreakCheck(s, f);
    } else {
      captureBuffer(f);
    }
    return;
  }

  if (tryMove(s, f, o, false)) return;

  // 대시 / 백대시
  if (hasDoubleTap(f.hist, R_F) && st !== 'dash') {
    setState(f, 'dash', 16);
    f.crouching = false;
    return;
  }
  if (hasDoubleTap(f.hist, R_B) && st !== 'bdash') {
    setState(f, 'bdash', 20);
    f.crouching = false;
    return;
  }
  // 점프 (↗ / ↖)
  if ((dir === 9 || dir === 7) && pressed(f.hist, R_U)) {
    setState(f, 'jump', 34);
    f.jumpDir = dir === 9 ? 1 : -1;
    f.vy = lift(30);
    f.y = 1;
    f.crouching = false;
    return;
  }
  // 횡이동 인 (↑ 탭)
  if (dir === 8 && pressed(f.hist, R_U)) {
    setState(f, 'side', 14);
    f.sideDir = 1;
    f.crouching = false;
    return;
  }
  // 앉기 / 아래 탭 횡이동
  if (dir === 1 || dir === 2 || dir === 3) {
    if (st !== 'crouch') {
      setState(f, 'crouch');
      f.downTapT = 0;
    }
    f.crouching = true;
    f.downTapT++;
    return;
  }
  if (st === 'crouch') {
    const tap = f.downTapT > 0 && f.downTapT <= 7;
    f.crouching = false;
    if (tap) {
      setState(f, 'side', 14);
      f.sideDir = -1;
      return;
    }
  }
  if (st === 'side' || st === 'dash' || st === 'bdash') {
    // 이동 중 다른 입력이 없으면 계속 진행
    if (st === 'side' && f.sf >= f.sd && dir === 8 && f.sideDir === 1) {
      f.sf = f.sd - 3; // 횡보행 지속
    }
    if (f.sf < f.sd) return;
  }
  if (rel & R_F) {
    if (f.st !== 'walkf') setState(f, 'walkf');
  } else if (rel & R_B) {
    if (f.st !== 'walkb') setState(f, 'walkb');
  } else if (f.st !== 'idle') {
    becomeIdle(f);
  }
}

/** 기술 입력 해석 */
function tryMove(s: GameState, f: Fighter, o: Fighter, onlyCombos: boolean): boolean {
  let now = f.hist[0] & ~f.hist[1] & BTN_ALL;
  if (!now && f.bufT > 0 && f.buf && !onlyCombos) {
    now = f.buf & f.hist[0];
    if (!now) now = f.buf;
  }
  if (!now) return false;
  const pr = recentPresses(f.hist, 3) | now;
  const def = CHARS[f.char];

  const both = (x: number, y: number) => (pr & x) !== 0 && (pr & y) !== 0;
  if (both(BTN_LP, BTN_RP) && f.gauge >= GAUGE_MAX && !f.ultUsed) return startMove(s, f, o, 'ult');
  if (both(BTN_LP, BTN_RK) && inEmergency(f) && !f.emergencyUsed) return startMove(s, f, o, 'emerg');
  if (both(BTN_LK, BTN_RK) && f.gauge >= 1000) return startMove(s, f, o, 'ex');
  if (both(BTN_LP, BTN_LK)) return startMove(s, f, o, 't1');
  if (both(BTN_RP, BTN_RK)) return startMove(s, f, o, 't2');
  if (onlyCombos) return false;

  const btn = now & BTN_LP ? BTN_LP : now & BTN_RP ? BTN_RP : now & BTN_LK ? BTN_LK : BTN_RK;
  const n = BTN_INDEX[btn];
  f.bufT = 0;
  f.buf = 0;

  if (f.spoke) {
    const key = (['LP', 'RP', 'LK', 'RK'] as const)[n - 1];
    const chain = def.spoke[key];
    return startMove(s, f, o, chain[0]);
  }

  if (hasQcf(f.hist) && def.cmds['qcf' + n]) return startMove(s, f, o, def.cmds['qcf' + n]);
  const dir = dirOf(f.hist[0]);
  const keys = [`${dir}${n}`];
  if (dir === 1 || dir === 3) keys.push(`2${n}`);
  if (dir === 7) keys.push(`4${n}`);
  if (dir === 9) keys.push(`6${n}`);
  keys.push(`5${n}`);
  for (const k of keys) {
    const id = def.cmds[k];
    if (id && def.moves[id]) return startMove(s, f, o, id);
  }
  return false;
}

function startMove(s: GameState, f: Fighter, o: Fighter, id: string): boolean {
  const def = CHARS[f.char];
  const m = def.moves[id];
  if (!m) return false;
  if (m.cost && f.gauge < m.cost) return false;
  if (def.hooks.onMoveStart && !def.hooks.onMoveStart(s, f, m)) return false;
  if (m.cost) addGauge(f, -m.cost);
  if (m.ult) {
    f.ultUsed = true;
    addGauge(f, -GAUGE_MAX);
    emit(s, { k: 'ultStart', who: f.idx });
  }
  if (m.emergency) f.emergencyUsed = true;
  setState(f, 'atk', m.total);
  f.move = id;
  f.mf = 0;
  f.hitMask = 0;
  f.connected = 0;
  f.queued = null;
  f.crouching = !!m.crouch;
  if (!m.noTurn) faceOpponent(f, o);
  const h0 = m.hits[0];
  f.lastMove = { id, startup: firstActive(m), onBlock: h0 ? h0.onBlock : 0, onHit: h0 ? h0.onHit : 0 };
  return true;
}

/** 공격 중 입력: 연계(캔슬), 동시입력 보정 */
function attackInput(s: GameState, f: Fighter, o: Fighter): void {
  const m = moveDef(f);
  if (!m) return;
  if (f.mf <= 2 && !COMBO_IDS.has(m.id)) {
    if (tryMove(s, f, o, true)) return;
  }
  const now = f.hist[0] & ~f.hist[1] & BTN_ALL;
  if (!now) return;
  const def = CHARS[f.char];
  if (f.spoke) {
    const n = BTN_INDEX[now & BTN_LP ? BTN_LP : now & BTN_RP ? BTN_RP : now & BTN_LK ? BTN_LK : BTN_RK];
    const chain = def.spoke[(['LP', 'RP', 'LK', 'RK'] as const)[n - 1]];
    const i = chain.indexOf(m.id);
    if (i >= 0 && i + 1 < chain.length) {
      f.queued = '!' + chain[i + 1];
      return;
    }
  }
  if (m.cancels) {
    const dir = dirOf(f.hist[0]);
    for (const c of m.cancels) {
      if (now & c.btn && (c.dir === undefined || c.dir === dir)) {
        f.queued = c.to;
        return;
      }
    }
  }
  // 그 외 버튼은 선입력으로 저장
  f.buf = now;
  f.bufT = 10;
}

function throwBreakCheck(s: GameState, f: Fighter): void {
  const t = f.throwInfo;
  if (!t || f.sf > t.until || t.breakBtn === 'none') return;
  const mask = t.breakBtn === 'L' ? BTN_LP : t.breakBtn === 'R' ? BTN_RP : BTN_LP | BTN_RP;
  if (pressed(f.hist, mask)) {
    const a = s.f[t.partner];
    emit(s, { k: 'break', who: f.idx });
    f.throwInfo = null;
    setState(f, 'bs', 16);
    setState(a, 'bs', 16);
    a.move = null;
    f.vx = idiv(a.fx * 22, 1000);
    f.vz = idiv(a.fz * 22, 1000);
    a.vx = -idiv(a.fx * 22, 1000);
    a.vz = -idiv(a.fz * 22, 1000);
  }
}

// ---------------------------------------------------------------- 물리

function friction(s: GameState, f: Fighter): number {
  if (s.cfg.stage === ICE_STAGE && f.x * f.x + f.z * f.z < 2300 * 2300) return 95;
  return 86;
}

function physics(s: GameState, f: Fighter, o: Fighter): void {
  f.sf++;
  const fr = friction(s, f);
  const ax = screenAxes(s);
  let walk = 0;
  let lateral = 0;

  switch (f.st) {
    case 'walkf':
      walk = slowMul(f, CHARS[f.char].walkF);
      break;
    case 'walkb':
      walk = -slowMul(f, CHARS[f.char].walkB);
      break;
    case 'dash':
      walk = slowMul(f, Math.max(10, 58 - f.sf * 3));
      if (f.sf >= f.sd) becomeIdle(f);
      break;
    case 'bdash':
      walk = -slowMul(f, Math.max(6, 50 - f.sf * 2));
      if (f.sf >= f.sd) becomeIdle(f);
      break;
    case 'side':
      lateral = slowMul(f, f.sf >= f.sd ? 0 : 47) * f.sideDir;
      if (f.sf >= f.sd + 1) becomeIdle(f);
      break;
    case 'jump': {
      walk = 18 * f.jumpDir;
      f.y += f.vy;
      f.vy -= GRAVITY;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        becomeIdle(f);
        emit(s, { k: 'land', who: f.idx });
      }
      break;
    }
    case 'atk': {
      f.mf++;
      const m = moveDef(f)!;
      if (m.advance) for (const [a, b, v] of m.advance) if (f.mf >= a && f.mf <= b) walk += v;
      const def = CHARS[f.char];
      if (m.proj && f.mf === m.proj.f) def.hooks.spawn?.(s, f, o, m.proj.kind);
      def.hooks.onMoveFrame?.(s, f, o, m);
      if (inRange(f.mf, m.airborne)) f.y = 300;
      else if (f.y > 0 && m.airborne) f.y = 0;
      // 연계 실행
      if (f.queued && f.mf >= lastActive(m) + 1) {
        const q = f.queued;
        f.queued = null;
        const needConnect = q.startsWith('!');
        const id = needConnect ? q.slice(1) : q;
        if (!needConnect || f.connected) {
          startMove(s, f, o, id);
          return;
        }
      }
      if (f.mf >= m.total) {
        becomeIdle(f);
        f.y = 0;
        if (f.hist[0] & R_D) {
          f.st = 'crouch';
          f.crouching = true;
          f.downTapT = 99;
        }
      }
      break;
    }
    case 'hs':
    case 'bs':
      if (f.st === 'bs') f.crouching = (f.hist[0] & R_D) !== 0;
      if (f.sf >= f.sd) {
        becomeIdle(f);
      }
      break;
    case 'air':
    case 'ko':
      if (f.y > 0 || f.vy > 0) {
        f.y += f.vy;
        f.vy -= GRAVITY;
      }
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        if (f.st === 'air') {
          emit(s, { k: 'land', who: f.idx });
          if (f.hp <= 0) setState(f, 'ko');
          else setState(f, 'down', 42);
          f.airHits = 0;
        }
      }
      break;
    case 'wall':
      if (f.sf >= f.sd) {
        setState(f, 'air');
        f.vy = 0;
      }
      break;
    case 'down':
      if (f.hp <= 0) setState(f, 'ko');
      else if (f.sf >= f.sd) setState(f, 'getup', 20);
      break;
    case 'getup':
      if (f.sf >= f.sd) becomeIdle(f);
      break;
    case 'throwing':
      throwingStep(s, f, o);
      break;
    case 'thrown':
      break;
    case 'win':
    case 'idle':
    case 'crouch':
    case 'ult':
      break;
  }

  if (walk) {
    f.x += idiv(f.fx * walk, 1000);
    f.z += idiv(f.fz * walk, 1000);
  }
  if (lateral) {
    f.x += idiv(ax.ix * lateral, 1000);
    f.z += idiv(ax.iz * lateral, 1000);
  }
  if (f.vx || f.vz) {
    f.x += f.vx;
    f.z += f.vz;
    if (f.st !== 'air' && f.st !== 'ko') {
      f.vx = idiv(f.vx * fr, 100);
      f.vz = idiv(f.vz * fr, 100);
    } else {
      f.vx = idiv(f.vx * 97, 100);
      f.vz = idiv(f.vz * 97, 100);
    }
  }
}

function pushApart(s: GameState): void {
  const [a, b] = s.f;
  const skip = (f: Fighter) => f.st === 'thrown' || f.st === 'throwing' || f.st === 'ult';
  if (skip(a) || skip(b)) return;
  if (Math.abs(a.y - b.y) > 900) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const min = BODY_R * 2;
  if (d2 >= min * min) return;
  const d = isqrt(d2);
  const [nx, nz] = d === 0 ? [a.fx, a.fz] : norm1000(dx, dz);
  const push = idiv(min - d + 1, 2);
  a.x -= idiv(nx * push, 1000);
  a.z -= idiv(nz * push, 1000);
  b.x += idiv(nx * push, 1000);
  b.z += idiv(nz * push, 1000);
}

function wallCheck(s: GameState, f: Fighter): void {
  const lim = ARENA - BODY_R;
  let hitWall = false;
  let speed = 0;
  if (f.x > lim) { speed = Math.max(speed, f.vx); f.x = lim; hitWall = true; }
  if (f.x < -lim) { speed = Math.max(speed, -f.vx); f.x = -lim; hitWall = true; }
  if (f.z > lim) { speed = Math.max(speed, f.vz); f.z = lim; hitWall = true; }
  if (f.z < -lim) { speed = Math.max(speed, -f.vz); f.z = -lim; hitWall = true; }
  if (hitWall && (f.st === 'hs' || f.st === 'air') && speed >= 6 && f.wallHits === 0 && f.combo > 0 && f.hp > 0) {
    wallSplat(s, f);
  }
}

function wallSplat(s: GameState, f: Fighter): void {
  setState(f, 'wall', 36);
  f.y = Math.max(f.y, 350);
  f.vx = f.vz = f.vy = 0;
  f.wallHits = 1;
  emit(s, { k: 'wall', who: f.idx, x: f.x, z: f.z });
}

function nearWall(f: Fighter, margin: number): boolean {
  const lim = ARENA - BODY_R - margin;
  return Math.abs(f.x) > lim || Math.abs(f.z) > lim;
}

// ---------------------------------------------------------------- 타격

interface Pending {
  a: number;
  h: HitDef;
  i: number;
  move: string;
  mf: number;
  fx: number;
  fz: number;
}

function hittable(D: Fighter): boolean {
  if (D.st === 'down' || D.st === 'getup' || D.st === 'thrown' || D.st === 'throwing' || D.st === 'ult' || D.st === 'ko' || D.st === 'win') return false;
  const m = moveDef(D);
  if (D.st === 'atk' && m && inRange(D.mf, m.invuln)) return false;
  return true;
}

function evadesLevel(D: Fighter, lvl: HitDef['lvl']): boolean {
  const m = moveDef(D);
  if (lvl === 'h' && D.crouching && D.st !== 'air' && D.st !== 'wall') return true;
  if (lvl === 'l') {
    if (D.st === 'jump' || D.st === 'air') return true;
    if (D.st === 'atk' && m && inRange(D.mf, m.airborne)) return true;
  }
  return false;
}

function detectHits(A: Fighter, D: Fighter): Pending[] {
  const out: Pending[] = [];
  if (A.st !== 'atk') return out;
  const m = moveDef(A);
  if (!m) return out;
  if (!hittable(D)) return out;
  for (let i = 0; i < m.hits.length; i++) {
    if (A.hitMask & (1 << i)) continue;
    const h = m.hits[i];
    if (A.mf < h.f || A.mf > h.f + h.len - 1) continue;
    const rx = D.x - A.x;
    const rz = D.z - A.z;
    const fwd = idiv(rx * A.fx + rz * A.fz, 1000);
    const lat = idiv(-rx * A.fz + rz * A.fx, 1000);
    if (fwd < -150 || fwd > h.reach) continue;
    if (Math.abs(lat) > (h.width ?? 300) + 200) continue;
    if (D.y > 2200) continue;
    if (evadesLevel(D, h.lvl)) continue;
    out.push({ a: A.idx, h, i, move: m.id, mf: A.mf, fx: A.fx, fz: A.fz });
    break;
  }
  return out;
}

function attackPct(s: GameState, A: Fighter, h: HitDef | null, moveId: string): number {
  const def = CHARS[A.char];
  let pct = def.dmg;
  if (def.hooks.dmgMul) pct = idiv(pct * def.hooks.dmgMul(s, A, h, moveId), 100);
  if (A.buffs.atkUp > 0) pct = idiv(pct * 115, 100);
  if (A.buffs.tariff > 0) pct = idiv(pct * 75, 100);
  if (inEmergency(A)) pct = idiv(pct * 110, 100);
  if (A.spoke) pct = idiv(pct * 90, 100);
  return pct;
}

interface HitCtx {
  rem: number;
  fx: number;
  fz: number;
  moveId: string;
  proj: boolean;
  stunHit?: number;
  stunBlock?: number;
}

function canGuard(s: GameState, D: Fighter): boolean {
  if (s.cfg.noGuard?.[D.idx]) return false;
  if ((D.hist[0] & R_F) !== 0 && D.st !== 'bs') return false;
  return D.st === 'idle' || D.st === 'walkb' || D.st === 'crouch' || D.st === 'bs' || (D.st === 'side' && D.sf > 2) || (D.st === 'bdash' && D.sf > 10);
}

export function resolveHit(s: GameState, A: Fighter, D: Fighter, h: HitDef, c: HitCtx): string {
  const Dm = moveDef(D);
  const isUlt = h.tag === 'ult';
  const hx = idiv(A.x + D.x, 2);
  const hz = idiv(A.z + D.z, 2);
  const hy = Math.max(600, D.y + (h.lvl === 'h' ? 1500 : h.lvl === 'm' ? 1000 : 300));

  // 반격 자세 (김정은 현지 지도 포즈)
  if (!c.proj && !isUlt && D.st === 'atk' && Dm && inRange(D.mf, Dm.counter)) {
    emit(s, { k: 'parry', who: D.idx });
    D.move = 'parryhit';
    D.mf = 0;
    D.sd = CHARS[D.char].moves['parryhit'].total;
    faceOpponent(D, A);
    dealDamage(s, A, idiv(70 * attackPct(s, D, null, 'parry'), 100));
    setState(A, 'air');
    A.vy = lift(22);
    A.y = Math.max(A.y, 10);
    A.vx = idiv(D.fx * 12, 1000);
    A.vz = idiv(D.fz * 12, 1000);
    A.move = null;
    A.combo++;
    s.hitstop = 10;
    return 'parry';
  }

  // 가드
  if (canGuard(s, D)) {
    const crouchG = D.crouching;
    const blocks = crouchG ? h.lvl === 'l' : h.lvl !== 'l';
    if (blocks) {
      setState(D, 'bs', Math.max(1, c.stunBlock ?? c.rem + h.onBlock));
      D.move = null;
      D.vx = idiv(c.fx * 9, 1000);
      D.vz = idiv(c.fz * 9, 1000);
      if (!c.proj) {
        A.connected = 2;
        A.vx = -idiv(c.fx * 5, 1000);
        A.vz = -idiv(c.fz * 5, 1000);
      }
      addGauge(D, 25);
      addGauge(A, 15);
      s.hitstop = isUlt ? 10 : 4;
      emit(s, { k: 'block', who: D.idx, x: hx, y: hy, z: hz });
      return 'block';
    }
  }

  if (!c.proj) A.connected = 1;

  // 궁극기 → 컷신
  if (isUlt) {
    startCine(s, A, D);
    return 'hit';
  }

  // 데미지 계산
  const ch = D.st === 'atk' && !!Dm && D.mf <= lastActive(Dm);
  let pct = attackPct(s, A, h, c.moveId);
  if (ch && D.combo === 0) pct = idiv(pct * 115, 100);
  if (D.combo > 0) pct = idiv(pct * Math.max(30, 80 - (D.combo - 1) * 8), 100);
  const dmg = Math.max(1, idiv(h.dmg * pct, 100));
  dealDamage(s, D, dmg);
  D.comboDmg += dmg;
  D.combo++;
  D.comboMoves.push(c.moveId);
  if (D.comboMoves.length > 16) D.comboMoves.shift();
  addGauge(A, dmg * 3);
  addGauge(D, dmg * 4);
  CHARS[A.char].hooks.onHit?.(s, A, D, c.moveId, dmg, ch);
  CHARS[D.char].hooks.onHurt?.(s, D, dmg);
  if (ch) emit(s, { k: 'counter', who: A.idx });
  emit(s, { k: 'hit', who: D.idx, x: hx, y: hy, z: hz, heavy: !!h.heavy || ch || !!h.launch, ch, dmg });

  // 아머: 데미지만 받고 경직 없음
  const armored = D.buffs.armor > 0 || (D.st === 'atk' && !!Dm && inRange(D.mf, Dm.armor));
  if (armored && D.hp > 0) {
    s.hitstop = 7;
    D.combo = 0;
    return 'armor';
  }

  const wasAir = D.st === 'air' || D.st === 'jump';
  const onWall = D.st === 'wall';
  D.move = null;
  D.queued = null;
  let kb = 8;
  if (onWall) {
    D.sf = 0;
    D.sd = Math.max(10, 30 - D.wallHits * 5);
    D.wallHits++;
    kb = 0;
  } else if (wasAir) {
    setState(D, 'air');
    D.vy = lift(Math.max(8, 24 - D.airHits * 3));
    D.airHits++;
    kb = h.kb ?? 6;
    if (D.airHits > 1) kb = Math.min(kb, 8);
  } else if (h.launch || (ch && h.chLaunch) || h.bounce) {
    setState(D, 'air');
    D.vy = lift(h.launch || h.chLaunch || 30);
    D.y = Math.max(D.y, 10);
    D.airHits = 0;
    kb = h.kb ?? 5;
  } else if (h.kd || (ch && h.chKd)) {
    setState(D, 'air');
    D.vy = lift(14);
    D.y = Math.max(D.y, 10);
    kb = h.kb ?? 14;
  } else {
    setState(D, 'hs', Math.max(1, c.stunHit ?? c.rem + h.onHit));
    kb = h.kb ?? 8;
  }
  D.vx = idiv(c.fx * kb, 1000);
  D.vz = idiv(c.fz * kb, 1000);
  if (h.wallSplat && nearWall(D, 900) && D.wallHits === 0 && D.hp > 0) wallSplat(s, D);
  if (D.hp <= 0 && D.st !== 'air') {
    setState(D, 'air');
    D.vy = lift(20);
    D.y = Math.max(10, D.y);
  }
  s.hitstop = ch || h.heavy ? 8 : wasAir ? 3 : 5;
  return 'hit';
}

// ---------------------------------------------------------------- 잡기

function throwCheck(s: GameState, A: Fighter, D: Fighter): void {
  if (A.st !== 'atk') return;
  const m = moveDef(A);
  if (!m || !m.throw || A.mf !== m.throw.f) return;
  const t = m.throw;
  const ok = (D.st === 'idle' || D.st === 'walkf' || D.st === 'walkb' || D.st === 'crouch' || D.st === 'side' || D.st === 'dash' || D.st === 'bdash' || D.st === 'atk') && D.y === 0;
  if (!ok || !hittable(D)) return;
  if (D.crouching && !t.mid) return;
  const rx = D.x - A.x;
  const rz = D.z - A.z;
  const fwd = idiv(rx * A.fx + rz * A.fz, 1000);
  const lat = idiv(-rx * A.fz + rz * A.fx, 1000);
  if (fwd < 0 || fwd > t.reach || Math.abs(lat) > 480) return;
  // 동시 잡기 → 상쇄
  const Dm = moveDef(D);
  if (D.st === 'atk' && Dm && Dm.throw && D.mf === Dm.throw.f) {
    emit(s, { k: 'break', who: D.idx });
    setState(A, 'bs', 16);
    setState(D, 'bs', 16);
    A.move = D.move = null;
    return;
  }
  const breakBtn = CHARS[A.char].hooks.throwBreak?.(s, A, m.id, t.breakBtn) ?? t.breakBtn;
  setState(A, 'throwing', t.dur);
  A.throwInfo = { breakBtn, until: 18, dmg: t.dmg, tag: m.id, partner: D.idx };
  setState(D, 'thrown', t.dur);
  D.move = null;
  D.queued = null;
  D.crouching = false;
  D.throwInfo = { breakBtn, until: 18, dmg: t.dmg, tag: m.id, partner: A.idx };
  D.x = A.x + idiv(A.fx * 650, 1000);
  D.z = A.z + idiv(A.fz * 650, 1000);
  faceOpponent(D, A);
  emit(s, { k: 'throw', who: A.idx });
}

function throwingStep(s: GameState, A: Fighter, D: Fighter): void {
  const t = A.throwInfo;
  if (!t) {
    becomeIdle(A);
    return;
  }
  if (D.st !== 'thrown') {
    // 풀렸음
    A.throwInfo = null;
    return;
  }
  D.sf = A.sf;
  if (A.sf === 30) {
    const pct = attackPct(s, A, null, t.tag);
    const dmg = idiv(t.dmg * pct, 100);
    dealDamage(s, D, dmg);
    D.comboDmg += dmg;
    D.combo++;
    D.comboMoves.push(t.tag);
    addGauge(A, dmg * 3);
    addGauge(D, dmg * 4);
    CHARS[A.char].hooks.onThrow?.(s, A, D, t.tag);
    CHARS[D.char].hooks.onHurt?.(s, D, dmg);
    emit(s, { k: 'hit', who: D.idx, x: D.x, y: 900, z: D.z, heavy: true, ch: false, dmg });
    s.hitstop = 6;
  }
  if (A.sf >= A.sd) {
    A.throwInfo = null;
    D.throwInfo = null;
    becomeIdle(A);
    D.x = A.x + idiv(A.fx * 800, 1000);
    D.z = A.z + idiv(A.fz * 800, 1000);
    setState(D, D.hp <= 0 ? 'ko' : 'down', 40);
  }
}

// ---------------------------------------------------------------- 궁극기 컷신

function startCine(s: GameState, A: Fighter, D: Fighter): void {
  const def = CHARS[A.char];
  s.cine = { owner: A.idx, char: A.char, t: 0, dur: 250, fail: false, dmg: 0 };
  def.hooks.ultDecide?.(s, A, D, s.cine);
  setState(A, 'ult');
  setState(D, 'ult');
  A.move = null;
  D.move = null;
  A.y = D.y = 0;
  A.vx = A.vz = D.vx = D.vz = A.vy = D.vy = 0;
  D.x = A.x + idiv(A.fx * 1300, 1000);
  D.z = A.z + idiv(A.fz * 1300, 1000);
  faceOpponent(D, A);
  emit(s, { k: 'cine', who: A.idx, fail: s.cine.fail });
}

function endCine(s: GameState): void {
  const c = s.cine!;
  s.cine = null;
  const A = s.f[c.owner];
  const D = s.f[1 - c.owner];
  const before = [A.hp, D.hp];
  CHARS[A.char].hooks.ultApply(s, A, D, c);
  c.dmg = before[1] - D.hp;
  if (c.fail) {
    setState(A, 'air');
    A.vy = lift(18);
    A.y = 10;
    A.vx = -idiv(A.fx * 10, 1000);
    A.vz = -idiv(A.fz * 10, 1000);
    becomeIdle(D);
    emit(s, { k: 'hit', who: A.idx, x: A.x, y: 1000, z: A.z, heavy: true, ch: false, dmg: before[0] - A.hp });
  } else {
    setState(D, 'air');
    D.vy = lift(22);
    D.y = 10;
    D.vx = idiv(A.fx * 12, 1000);
    D.vz = idiv(A.fz * 12, 1000);
    D.combo = 1;
    becomeIdle(A);
    emit(s, { k: 'hit', who: D.idx, x: D.x, y: 1000, z: D.z, heavy: true, ch: false, dmg: c.dmg });
  }
  emit(s, { k: 'boom', x: D.x, z: D.z });
}

// ---------------------------------------------------------------- 투사체

function updateProjs(s: GameState): void {
  for (const p of s.projs) {
    if (p.done) continue;
    p.t++;
    p.life--;
    const enemy = s.f[1 - p.owner];
    const owner = s.f[p.owner];
    if (p.kind === 'barrier') {
      // 적 투사체 차단 + 적 밀어내기
      for (const q of s.projs) {
        if (q === p || q.done || q.owner === p.owner || q.kind === 'barrier') continue;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        if (dx * dx + dz * dz < (p.radius + q.radius) * (p.radius + q.radius) && q.y < 2500) q.done = true;
      }
      const dx = enemy.x - p.x;
      const dz = enemy.z - p.z;
      const min = p.radius + BODY_R;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && enemy.y < 1500) {
        const d = isqrt(d2);
        const [nx, nz] = d === 0 ? [-owner.fx, -owner.fz] : norm1000(dx, dz);
        enemy.x = p.x + idiv(nx * min, 1000);
        enemy.z = p.z + idiv(nz * min, 1000);
      }
      if (p.life <= 0) p.done = true;
      continue;
    }

    p.x += p.vx;
    p.z += p.vz;

    if (p.kind === 'missile') {
      if (p.life <= 0) {
        p.done = true;
        p.x = p.tx;
        p.z = p.tz;
        emit(s, { k: 'boom', x: p.x, z: p.z });
        const dx = enemy.x - p.x;
        const dz = enemy.z - p.z;
        const r = p.radius + BODY_R;
        if (dx * dx + dz * dz <= r * r && hittable(enemy)) projHit(s, p, owner, enemy);
      }
      continue;
    }

    // 직선 투사체
    if (Math.abs(p.x) > ARENA + 500 || Math.abs(p.z) > ARENA + 500 || p.life <= 0) {
      p.done = true;
      continue;
    }
    for (const q of s.projs) {
      if (q === p || q.done || q.owner === p.owner || q.kind === 'barrier' || q.kind === 'missile') continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      if (dx * dx + dz * dz < (p.radius + q.radius) * (p.radius + q.radius)) {
        p.done = true;
        q.done = true;
      }
    }
    if (p.done) continue;
    const dx = enemy.x - p.x;
    const dz = enemy.z - p.z;
    const r = p.radius + BODY_R;
    if (dx * dx + dz * dz <= r * r && hittable(enemy) && !evadesLevel(enemy, p.lvl)) {
      p.done = true;
      projHit(s, p, owner, enemy);
    }
  }
  s.projs = s.projs.filter((p) => !p.done);
}

function projHit(s: GameState, p: Proj, owner: Fighter, enemy: Fighter): void {
  let [fx, fz] = norm1000(p.vx, p.vz);
  if (p.vx === 0 && p.vz === 0) [fx, fz] = norm1000(enemy.x - p.x, enemy.z - p.z);
  const h: HitDef = { f: 0, len: 1, dmg: p.dmg, lvl: p.lvl, reach: 0, onHit: 0, onBlock: 0, kd: p.kd, launch: p.launch || undefined, kb: 10 };
  resolveHit(s, owner, enemy, h, { rem: 0, fx, fz, moveId: p.kind, proj: true, stunHit: p.onHit, stunBlock: p.onBlock });
}

// ---------------------------------------------------------------- 라운드

function checkRoundEnd(s: GameState): void {
  if (s.phase === 'fight') {
    const [a, b] = s.f;
    const ko = a.hp <= 0 || b.hp <= 0;
    const timeout = s.timer <= 0;
    if (!ko && !timeout) return;
    let winner = -1;
    if (ko) {
      if (a.hp <= 0 && b.hp > 0) winner = 1;
      else if (b.hp <= 0 && a.hp > 0) winner = 0;
      for (const f of s.f) if (f.hp <= 0) emit(s, { k: 'ko', who: f.idx });
    } else {
      const ra = idiv(a.hp * 1000, a.maxHp);
      const rb = idiv(b.hp * 1000, b.maxHp);
      winner = ra > rb ? 0 : rb > ra ? 1 : -1;
    }
    if (winner >= 0) s.wins[winner]++;
    s.lastRoundWinner = winner;
    s.phase = 'roundEnd';
    s.pt = 0;
    s.projs = [];
    const perfect = winner >= 0 && s.f[winner].hp === s.f[winner].maxHp;
    emit(s, { k: 'roundEnd', winner, perfect, timeout: !ko });
    return;
  }
  if (s.phase === 'roundEnd') {
    if (s.pt === 70 && s.lastRoundWinner >= 0) {
      const w = s.f[s.lastRoundWinner];
      if (w.hp > 0 && (FREE.has(w.st) || w.st === 'atk' || w.st === 'hs' || w.st === 'bs' || w.st === 'side' || w.st === 'dash' || w.st === 'bdash' || w.st === 'getup')) {
        becomeIdle(w);
        w.st = 'win';
      }
    }
    if (s.pt >= 210) {
      const w = s.wins[0] >= s.cfg.rounds ? 0 : s.wins[1] >= s.cfg.rounds ? 1 : -1;
      if (w >= 0) {
        s.phase = 'matchEnd';
        s.pt = 0;
        s.winner = w;
        emit(s, { k: 'matchEnd', winner: w });
      } else {
        s.round++;
        resetRound(s);
      }
    }
    return;
  }
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

/** 디버그·UI 용: 기술 정보 */
export function moveInfo(char: CharId, id: string | null): MoveDef | null {
  if (!id) return null;
  return CHARS[char].moves[id] ?? null;
}

export { clamp };

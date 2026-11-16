import { clamp, norm1000, rngNext } from './fixed';
import type { Fighter, GameEvent, GameState, Proj } from './types';

export const GAUGE_MAX = 3000;
export const EMERGENCY_PCT = 25;

export function emit(s: GameState, e: GameEvent): void {
  s.ev.push(e);
}

export function addGauge(f: Fighter, n: number): void {
  f.gauge = clamp(f.gauge + n, 0, GAUGE_MAX);
}

export function rand(s: GameState): number {
  const [n, v] = rngNext(s.rng);
  s.rng = n;
  return v;
}

export function inEmergency(f: Fighter): boolean {
  return f.hp > 0 && f.hp * 100 <= f.maxHp * EMERGENCY_PCT;
}

export function dirTo(a: Fighter, b: Fighter): [number, number] {
  return norm1000(b.x - a.x, b.z - a.z);
}

/** 고정 데미지 (궁극기·투사체 등) */
export function dealDamage(s: GameState, def: Fighter, dmg: number): void {
  const was = inEmergency(def);
  def.hp = Math.max(0, def.hp - dmg);
  def.dmgTaken += dmg;
  if (!was && inEmergency(def)) emit(s, { k: 'emergency', who: def.idx });
}

export function heal(s: GameState, f: Fighter, amt: number): void {
  f.hp = Math.min(f.maxHp, f.hp + amt);
  emit(s, { k: 'heal', who: f.idx, amt });
}

export function spawnProj(s: GameState, p: Partial<Proj> & { owner: number; kind: string; x: number; z: number }): Proj {
  const proj: Proj = {
    id: s.nextId++,
    y: 0, vx: 0, vz: 0, vy: 0, life: 60, t: 0, dmg: 0, lvl: 'm', radius: 300,
    onBlock: 10, onHit: 18, kd: false, launch: 0, done: false, tx: 0, tz: 0,
    ...p,
  };
  s.projs.push(proj);
  emit(s, { k: 'proj', who: p.owner, kind: p.kind });
  return proj;
}

/** 상대를 향해 고개만 돌리지 않고 몸 전체를 즉시 돌린다 */
export function faceOpponent(f: Fighter, o: Fighter): void {
  const [x, z] = dirTo(f, o);
  f.fx = x;
  f.fz = z;
}

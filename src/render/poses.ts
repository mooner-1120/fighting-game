// 절차적 애니메이션: 관절 각도(도 단위) 포즈와 기술 단계별 보간.
import { CHARS } from '../sim/chars';
import { firstActive, lastActive } from '../sim/moves';
import type { Fighter, GameState } from '../sim/types';

export type JointName =
  | 'hips' | 'spine' | 'chest' | 'neck'
  | 'lSh' | 'lEl' | 'rSh' | 'rEl'
  | 'lHip' | 'lKnee' | 'rHip' | 'rKnee';

/** [x, y, z] 회전 (도) + root 오프셋 */
export interface Pose {
  j: Partial<Record<JointName, [number, number, number]>>;
  dy?: number; // 엉덩이 높이 변화 (m)
  lean?: number; // 몸 전체 앞기울기 (도)
  roll?: number; // 몸 전체 눕기 (도) — 다운 상태
}

const P = (j: Pose['j'], extra: Omit<Pose, 'j'> = {}): Pose => ({ j, ...extra });

// 오른쪽 보기 기준 (모델은 +Z를 바라봄). 어깨 x 음수 = 팔을 앞으로.
export const POSES: Record<string, Pose> = {
  stance: P({
    spine: [8, -20, 0], chest: [0, -10, 0], neck: [-5, 25, 0],
    lSh: [-55, 0, 20], lEl: [-95, 0, 0], rSh: [-40, 0, -25], rEl: [-115, 0, 0],
    lHip: [-18, 0, 6], lKnee: [22, 0, 0], rHip: [12, 0, -6], rKnee: [18, 0, 0],
  }, { dy: -0.05 }),
  crouch: P({
    spine: [25, -15, 0], chest: [5, 0, 0], neck: [-20, 15, 0],
    lSh: [-70, 0, 20], lEl: [-100, 0, 0], rSh: [-55, 0, -20], rEl: [-115, 0, 0],
    lHip: [-80, 0, 10], lKnee: [110, 0, 0], rHip: [-30, 0, -10], rKnee: [120, 0, 0],
  }, { dy: -0.45 }),
  walkA: P({
    spine: [10, -15, 0], lSh: [-60, 0, 20], lEl: [-95, 0, 0], rSh: [-45, 0, -25], rEl: [-110, 0, 0],
    lHip: [-35, 0, 6], lKnee: [30, 0, 0], rHip: [20, 0, -6], rKnee: [25, 0, 0],
  }, { dy: -0.06 }),
  walkB: P({
    spine: [10, -15, 0], lSh: [-60, 0, 20], lEl: [-95, 0, 0], rSh: [-45, 0, -25], rEl: [-110, 0, 0],
    lHip: [10, 0, 6], lKnee: [15, 0, 0], rHip: [-30, 0, -6], rKnee: [40, 0, 0],
  }, { dy: -0.03 }),
  side: P({
    spine: [5, -30, 15], lSh: [-50, 0, 30], lEl: [-90, 0, 0], rSh: [-35, 0, -30], rEl: [-110, 0, 0],
    lHip: [-10, 0, 25], lKnee: [25, 0, 0], rHip: [5, 0, -20], rKnee: [25, 0, 0],
  }, { dy: -0.1 }),
  dash: P({
    spine: [30, -10, 0], lSh: [-70, 0, 20], lEl: [-90, 0, 0], rSh: [-30, 0, -20], rEl: [-120, 0, 0],
    lHip: [-60, 0, 0], lKnee: [70, 0, 0], rHip: [30, 0, 0], rKnee: [30, 0, 0],
  }, { dy: -0.15 }),
  jump: P({
    spine: [15, 0, 0], lSh: [-120, 0, 30], lEl: [-40, 0, 0], rSh: [-120, 0, -30], rEl: [-40, 0, 0],
    lHip: [-80, 0, 5], lKnee: [100, 0, 0], rHip: [-40, 0, -5], rKnee: [90, 0, 0],
  }),
  // ---- 공격: windup / strike 쌍
  jabL_w: P({ spine: [8, -10, 0], lSh: [-60, 0, 15], lEl: [-110, 0, 0] }),
  jabL_s: P({ spine: [10, 15, 0], chest: [0, 15, 0], lSh: [-90, 0, 5], lEl: [-5, 0, 0], rSh: [-45, 0, -25], rEl: [-115, 0, 0] }),
  straightR_w: P({ spine: [8, -30, 0], rSh: [-40, 0, -20], rEl: [-120, 0, 0] }),
  straightR_s: P({ spine: [15, 35, 0], chest: [0, 20, 0], rSh: [-90, 0, -5], rEl: [-5, 0, 0], lSh: [-50, 0, 30], lEl: [-110, 0, 0], rHip: [20, 0, -6], rKnee: [10, 0, 0] }),
  hookR_w: P({ spine: [10, -45, 0], rSh: [-30, 0, -60], rEl: [-90, 0, 0] }),
  hookR_s: P({ spine: [15, 45, 0], chest: [0, 25, 0], rSh: [-85, 40, -70], rEl: [-70, 0, 0], lSh: [-50, 0, 30], lEl: [-110, 0, 0] }, { lean: 8 }),
  bodyBlow_w: P({ spine: [15, -20, 0], lSh: [-40, 0, 20], lEl: [-110, 0, 0] }),
  bodyBlow_s: P({ spine: [25, 20, 0], lSh: [-70, 0, 10], lEl: [-20, 0, 0], lHip: [-40, 0, 6], lKnee: [50, 0, 0] }, { dy: -0.15 }),
  uppercut_w: P({ spine: [30, -25, 0], rSh: [-10, 0, -20], rEl: [-90, 0, 0], lHip: [-50, 0, 6], lKnee: [70, 0, 0], rKnee: [60, 0, 0] }, { dy: -0.3 }),
  uppercut_s: P({ spine: [-15, 20, 0], chest: [-10, 10, 0], rSh: [-170, 0, -15], rEl: [-30, 0, 0], lSh: [-40, 0, 30], lEl: [-110, 0, 0] }, { dy: 0.05 }),
  kickMidL_w: P({ lHip: [-60, 0, 5], lKnee: [100, 0, 0], spine: [0, -10, 0] }),
  kickMidL_s: P({ spine: [-10, 0, 0], lHip: [-95, 0, 5], lKnee: [5, 0, 0], rHip: [5, 0, -6], rKnee: [10, 0, 0], lSh: [-30, 0, 40], rSh: [-30, 0, -40] }),
  kickMidR_w: P({ rHip: [-60, 0, -5], rKnee: [100, 0, 0], spine: [0, -10, 0] }),
  kickMidR_s: P({ spine: [-10, 0, 0], rHip: [-95, 0, -5], rKnee: [5, 0, 0], lHip: [5, 0, 6], lKnee: [10, 0, 0], lSh: [-30, 0, 40], rSh: [-30, 0, -40] }),
  kickHighR_w: P({ spine: [-5, -30, 0], rHip: [-50, 0, -30], rKnee: [90, 0, 0] }),
  kickHighR_s: P({ spine: [-25, 40, 20], rHip: [-130, 0, -40], rKnee: [5, 0, 0], lHip: [0, 0, 10], lKnee: [10, 0, 0], lSh: [-20, 0, 60], rSh: [-10, 0, -60] }, { lean: -10 }),
  crouchJab_w: P({ lSh: [-60, 0, 15], lEl: [-110, 0, 0] }, { dy: -0.45 }),
  crouchJab_s: P({ spine: [25, 15, 0], lSh: [-85, 0, 5], lEl: [-5, 0, 0], lHip: [-80, 0, 10], lKnee: [110, 0, 0], rHip: [-30, 0, -10], rKnee: [120, 0, 0] }, { dy: -0.45 }),
  lowKick_w: P({ spine: [20, 0, 0], lHip: [-30, 0, 10], lKnee: [80, 0, 0], rKnee: [60, 0, 0] }, { dy: -0.3 }),
  lowKick_s: P({ spine: [10, -20, 0], lHip: [-60, 0, 30], lKnee: [0, 0, 0], rHip: [-20, 0, -5], rKnee: [70, 0, 0] }, { dy: -0.35 }),
  sweep_w: P({ spine: [40, -40, 0], rHip: [-20, 0, -40], rKnee: [60, 0, 0], lHip: [-90, 0, 0], lKnee: [120, 0, 0] }, { dy: -0.6 }),
  sweep_s: P({ spine: [40, 60, 0], rHip: [-70, 0, -80], rKnee: [0, 0, 0], lHip: [-90, 0, 0], lKnee: [130, 0, 0], lSh: [-20, 0, 60], rSh: [-20, 0, -40] }, { dy: -0.65 }),
  knee_w: P({ rHip: [-40, 0, 0], rKnee: [80, 0, 0], lSh: [-140, 0, 20], rSh: [-140, 0, -20] }, { dy: 0.05 }),
  knee_s: P({ spine: [-10, 0, 0], rHip: [-120, 0, 0], rKnee: [120, 0, 0], lHip: [10, 0, 0], lKnee: [40, 0, 0], lSh: [-170, 0, 30], rSh: [-170, 0, -30], lEl: [-60, 0, 0], rEl: [-60, 0, 0] }, { dy: 0.35 }),
  grab_w: P({ spine: [20, 0, 0], lSh: [-70, 0, 40], rSh: [-70, 0, -40], lEl: [-20, 0, 0], rEl: [-20, 0, 0] }),
  grab_s: P({ spine: [25, 0, 0], lSh: [-95, 0, 15], rSh: [-95, 0, -15], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-40, 0, 6], lKnee: [40, 0, 0] }),
  throwLift: P({ spine: [-25, 0, 0], lSh: [-170, 0, 20], rSh: [-170, 0, -20], lEl: [-20, 0, 0], rEl: [-20, 0, 0], lKnee: [30, 0, 0], rKnee: [30, 0, 0] }),
  emergency_w: P({ spine: [10, -40, 0], rSh: [-20, 0, -40], rEl: [-100, 0, 0], lSh: [-90, 0, 40], lEl: [-10, 0, 0] }),
  emergency_s: P({ spine: [20, 40, 0], chest: [0, 30, 0], rSh: [-95, 0, -5], rEl: [0, 0, 0], lSh: [-30, 0, 30], lEl: [-110, 0, 0], lHip: [-50, 0, 6], lKnee: [50, 0, 0] }, { dy: -0.15, lean: 10 }),
  // ---- 특수기
  summon_w: P({ spine: [-10, 0, 0], lSh: [-150, 0, 40], rSh: [-150, 0, -40], lEl: [-20, 0, 0], rEl: [-20, 0, 0] }),
  summon_s: P({ spine: [20, 0, 0], lSh: [-90, 0, 20], rSh: [-90, 0, -20], lEl: [0, 0, 0], rEl: [0, 0, 0], lHip: [-30, 0, 15], rHip: [10, 0, -15] }, { dy: -0.1 }),
  hammer_w: P({ spine: [-25, 0, 0], lSh: [-180, 0, 10], rSh: [-180, 0, -10], lEl: [-30, 0, 0], rEl: [-30, 0, 0] }, { dy: 0.05 }),
  hammer_s: P({ spine: [45, 0, 0], lSh: [-80, 0, 10], rSh: [-80, 0, -10], lEl: [0, 0, 0], rEl: [0, 0, 0], lHip: [-60, 0, 6], lKnee: [70, 0, 0], rKnee: [40, 0, 0] }, { dy: -0.3 }),
  flex_w: P({ spine: [-10, 0, 0], lSh: [-10, 0, 80], rSh: [-10, 0, -80], lEl: [-120, 0, 0], rEl: [-120, 0, 0] }),
  flex_s: P({ spine: [-15, 0, 0], chest: [-10, 0, 0], neck: [-15, 0, 0], lSh: [0, 0, 90], rSh: [0, 0, -90], lEl: [-130, 0, 0], rEl: [-130, 0, 0], lHip: [0, 0, 15], rHip: [0, 0, -15] }),
  point_w: P({ rSh: [-60, 0, -20], rEl: [-90, 0, 0], neck: [10, 0, 0] }),
  point_s: P({ spine: [0, 20, 0], rSh: [-100, 0, -10], rEl: [0, 0, 0], lSh: [-20, 0, 10], lEl: [-60, 0, 0], neck: [-10, 0, 0] }),
  golf_w: P({ spine: [30, -80, 0], lSh: [-60, 0, -40], rSh: [-60, 0, -60], lEl: [-10, 0, 0], rEl: [-30, 0, 0] }),
  golf_s: P({ spine: [-10, 90, 0], chest: [0, 20, 0], lSh: [-150, 0, 60], rSh: [-150, 0, 40], lEl: [-10, 0, 0], rEl: [-20, 0, 0], lHip: [-20, 0, 6], rHip: [10, 30, 0] }),
  barrier_w: P({ lSh: [-100, 0, 40], rSh: [-100, 0, -40], lEl: [-80, 0, 0], rEl: [-80, 0, 0] }),
  barrier_s: P({ spine: [10, 0, 0], lSh: [-90, 0, 0], rSh: [-90, 0, 0], lEl: [0, 0, 0], rEl: [0, 0, 0] }),
  rush_w: P({ spine: [30, -30, 0], lSh: [-30, 0, 60], lEl: [-90, 0, 0], lHip: [-50, 0, 0], lKnee: [70, 0, 0] }, { dy: -0.2 }),
  rush_s: P({ spine: [35, -60, 0], chest: [0, -20, 0], lSh: [-60, 0, 80], lEl: [-100, 0, 0], rSh: [-30, 0, -20], rEl: [-120, 0, 0], lHip: [-70, 0, 0], lKnee: [60, 0, 0], rHip: [30, 0, 0] }, { dy: -0.25 }),
  launch_w: P({ rSh: [-150, 0, -10], rEl: [-90, 0, 0], neck: [-20, 0, 0] }),
  launch_s: P({ spine: [10, 0, 0], rSh: [-110, 0, -10], rEl: [-10, 0, 0], lSh: [-20, 0, 30], lEl: [-40, 0, 0], neck: [-25, 0, 0] }),
  clap_w: P({ lSh: [-80, -20, 30], rSh: [-80, 20, -30], lEl: [-60, 0, 0], rEl: [-60, 0, 0] }),
  clap_s: P({ lSh: [-90, 30, 5], rSh: [-90, -30, -5], lEl: [-40, 0, 0], rEl: [-40, 0, 0], neck: [-15, 0, 0] }),
  pose: P({ spine: [-8, 0, 0], neck: [-15, 0, 0], lSh: [-70, 30, 10], lEl: [-80, 0, 0], rSh: [20, 0, -20], rEl: [-90, 0, 0], lHip: [0, 0, 10], rHip: [0, 0, -10] }),
  rush3_w: P({ spine: [25, -20, 0], lSh: [-60, 0, 15], lEl: [-100, 0, 0] }, { dy: -0.1 }),
  rush3_s: P({ spine: [25, 25, 0], lSh: [-90, 0, 5], lEl: [-5, 0, 0], rSh: [-90, 0, -5], rEl: [-30, 0, 0], lHip: [-50, 0, 6], lKnee: [40, 0, 0] }, { dy: -0.1 }),
  slam_w: P({ spine: [-20, 0, 0], rSh: [-190, 0, -10], rEl: [-40, 0, 0], lSh: [-150, 0, 20] }),
  slam_s: P({ spine: [40, 10, 0], rSh: [-70, 0, -10], rEl: [-5, 0, 0], lSh: [-40, 0, 20], lHip: [-50, 0, 6], lKnee: [60, 0, 0] }, { dy: -0.25 }),
  phone_w: P({ rSh: [-30, 0, -40], rEl: [-140, 0, 0], neck: [10, 20, 0] }),
  phone_s: P({ rSh: [-20, 0, -50], rEl: [-150, 0, 0], neck: [5, 30, 0], lSh: [-60, 0, 30], lEl: [-50, 0, 0] }),
  ult_w: P({ spine: [-15, 0, 0], neck: [-25, 0, 0], lSh: [-160, 0, 30], rSh: [-160, 0, -30], lEl: [-10, 0, 0], rEl: [-10, 0, 0] }, { dy: 0.05 }),
  ult_s: P({ spine: [25, 20, 0], rSh: [-95, 0, -5], rEl: [0, 0, 0], lSh: [-95, 0, 5], lEl: [0, 0, 0], lHip: [-50, 0, 6], lKnee: [50, 0, 0] }, { dy: -0.1 }),
  // ---- 피격·다운
  hitHigh: P({ spine: [-25, 10, 0], neck: [-35, 0, 0], lSh: [-20, 0, 50], rSh: [-20, 0, -50], lEl: [-40, 0, 0], rEl: [-40, 0, 0], lHip: [-20, 0, 6], lKnee: [25, 0, 0] }),
  hitMid: P({ spine: [35, -10, 0], neck: [20, 0, 0], lSh: [-20, 0, 30], rSh: [-20, 0, -30], lEl: [-60, 0, 0], rEl: [-60, 0, 0], lHip: [-30, 0, 6], lKnee: [40, 0, 0], rKnee: [30, 0, 0] }, { dy: -0.1 }),
  block: P({ spine: [10, -10, 0], neck: [10, 0, 0], lSh: [-80, 30, 25], lEl: [-140, 0, 0], rSh: [-80, -30, -25], rEl: [-140, 0, 0], lHip: [-15, 0, 6], lKnee: [25, 0, 0], rKnee: [25, 0, 0] }, { dy: -0.08 }),
  blockLow: P({ spine: [25, -10, 0], lSh: [-40, 0, 25], lEl: [-60, 0, 0], rSh: [-30, 0, -25], rEl: [-80, 0, 0], lHip: [-80, 0, 10], lKnee: [110, 0, 0], rHip: [-30, 0, -10], rKnee: [120, 0, 0] }, { dy: -0.45 }),
  air: P({ spine: [-30, 0, 0], neck: [-30, 0, 0], lSh: [-150, 0, 40], rSh: [-140, 0, -40], lEl: [-10, 0, 0], rEl: [-10, 0, 0], lHip: [-30, 0, 10], lKnee: [50, 0, 0], rHip: [-10, 0, -10], rKnee: [20, 0, 0] }, { lean: -40 }),
  down: P({ spine: [0, 0, 0], neck: [0, 0, 0], lSh: [-170, 0, 30], rSh: [-160, 0, -30], lEl: [0, 0, 0], rEl: [0, 0, 0], lHip: [-5, 0, 10], lKnee: [10, 0, 0], rHip: [-20, 0, -10], rKnee: [30, 0, 0] }, { roll: -88, dy: -0.75 }),
  getup: P({ spine: [40, 0, 0], lSh: [-60, 0, 30], rSh: [-60, 0, -30], lHip: [-90, 0, 10], lKnee: [120, 0, 0], rHip: [-60, 0, -10], rKnee: [100, 0, 0] }, { dy: -0.4 }),
  wall: P({ spine: [-20, 0, 0], neck: [-25, 0, 0], lSh: [-120, 0, 80], rSh: [-120, 0, -80], lEl: [0, 0, 0], rEl: [0, 0, 0], lHip: [0, 0, 20], rHip: [0, 0, -20] }, { lean: -15 }),
  thrown: P({ spine: [-30, 0, 0], neck: [-30, 0, 0], lSh: [-140, 0, 40], rSh: [-140, 0, -40], lHip: [-40, 0, 10], lKnee: [60, 0, 0] }, { lean: -30 }),
  win: P({ spine: [-10, 0, 0], neck: [-20, 0, 0], lSh: [-170, 0, 20], lEl: [-10, 0, 0], rSh: [10, 0, -20], rEl: [-90, 0, 0], lHip: [0, 0, 8], rHip: [0, 0, -8] }),
  ko: P({ lSh: [-170, 0, 50], rSh: [-170, 0, -50], lHip: [0, 0, 15], rHip: [0, 0, -15], lKnee: [5, 0, 0] }, { roll: -90, dy: -0.75 }),
};

const ALL_JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'];

function full(p: Pose, base: Pose): Required<Pose> {
  const j: Pose['j'] = {};
  for (const n of ALL_JOINTS) j[n] = p.j[n] ?? base.j[n] ?? [0, 0, 0];
  return { j, dy: p.dy ?? base.dy ?? 0, lean: p.lean ?? 0, roll: p.roll ?? 0 };
}

export function lerpPose(a: Pose, b: Pose, t: number): Required<Pose> {
  const A = full(a, POSES.stance);
  const B = full(b, POSES.stance);
  const j: Pose['j'] = {};
  for (const n of ALL_JOINTS) {
    const x = A.j[n]!;
    const y = B.j[n]!;
    j[n] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return { j, dy: A.dy + (B.dy - A.dy) * t, lean: A.lean + (B.lean - A.lean) * t, roll: A.roll + (B.roll - A.roll) * t };
}

function smooth(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** 현재 상태에 맞는 목표 포즈 */
export function targetPose(s: GameState, f: Fighter, time: number): Required<Pose> {
  const stand = f.crouching ? POSES.crouch : POSES.stance;
  switch (f.st) {
    case 'idle': {
      const b = Math.sin(time * 3 + f.idx) * 0.5 + 0.5;
      return lerpPose(POSES.stance, { ...POSES.stance, dy: -0.08 }, b);
    }
    case 'crouch':
      return lerpPose(POSES.crouch, POSES.crouch, 0);
    case 'walkf':
    case 'walkb': {
      const t = Math.sin(time * 9) * 0.5 + 0.5;
      return lerpPose(POSES.walkA, POSES.walkB, t);
    }
    case 'side':
      return lerpPose(POSES.side, POSES.side, 0);
    case 'dash':
    case 'bdash':
      return lerpPose(POSES.dash, POSES.stance, f.st === 'dash' ? f.sf / 20 : 0.5);
    case 'jump':
      return lerpPose(POSES.jump, POSES.jump, 0);
    case 'atk': {
      const m = CHARS[f.char].moves[f.move ?? ''];
      if (!m) return lerpPose(stand, stand, 0);
      const w = POSES[m.anim + '_w'] ?? POSES[m.anim] ?? POSES.stance;
      const st = POSES[m.anim + '_s'] ?? POSES[m.anim] ?? POSES.stance;
      const s0 = Math.max(2, firstActive(m) || Math.min(20, m.total / 2));
      const e0 = Math.max(s0, lastActive(m) || s0 + 4);
      const mf = f.mf;
      const back = m.crouch ? POSES.crouch : POSES.stance;
      if (mf < s0 * 0.6) return lerpPose(stand, w, smooth(mf / (s0 * 0.6)));
      if (mf < s0) return lerpPose(w, st, smooth((mf - s0 * 0.6) / (s0 * 0.4)));
      if (mf <= e0) return lerpPose(st, st, 0);
      // 다단히트 기술은 타격마다 반복
      if (m.hits.length > 1) {
        const period = (e0 - s0) / (m.hits.length - 1 || 1);
        const ph = ((mf - s0) % period) / period;
        if (mf < e0) return lerpPose(st, w, Math.sin(ph * Math.PI));
      }
      return lerpPose(st, back, smooth((mf - e0) / Math.max(1, m.total - e0)));
    }
    case 'hs':
      return lerpPose(f.crouching ? POSES.blockLow : (f.sf % 2 ? POSES.hitMid : POSES.hitHigh), stand, smooth(f.sf / Math.max(1, f.sd)));
    case 'bs':
      return lerpPose(f.crouching ? POSES.blockLow : POSES.block, POSES.block, 0);
    case 'air':
      return lerpPose(POSES.air, POSES.air, 0);
    case 'down':
      return lerpPose(POSES.down, POSES.down, 0);
    case 'ko':
      return lerpPose(POSES.ko, POSES.ko, 0);
    case 'getup':
      return lerpPose(POSES.getup, POSES.stance, smooth(f.sf / Math.max(1, f.sd)));
    case 'wall':
      return lerpPose(POSES.wall, POSES.wall, 0);
    case 'throwing':
      return f.sf < 26 ? lerpPose(POSES.grab_s, POSES.throwLift, smooth(f.sf / 26)) : lerpPose(POSES.throwLift, POSES.stance, smooth((f.sf - 26) / 30));
    case 'thrown':
      return lerpPose(POSES.thrown, POSES.thrown, 0);
    case 'ult':
      return s.cine && s.cine.owner === f.idx ? lerpPose(POSES.ult_w, POSES.ult_s, (Math.sin(time * 4) + 1) / 2) : lerpPose(POSES.hitHigh, POSES.thrown, 0.5);
    case 'win':
      return lerpPose(POSES.win, POSES.win, 0);
  }
  return lerpPose(stand, stand, 0);
}

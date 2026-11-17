// 무함마드 빈 살만 (사우디아라비아) — 스피드형. 고유 시스템: 유가 (사인파로 오르내림, 높으면 공격력↑·속도↓)
import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, dirTo, emit, faceOpponent, spawnProj } from '../simutil';
import { clamp, idiv } from '../fixed';
import { ARENA, BODY_R } from '../types';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

/** 유가 한 주기 (프레임) */
const OIL_PERIOD = 600;
const HALF = OIL_PERIOD / 2;

/** 정수 사인 근사(포물선): 위상(0..OIL_PERIOD) → -50..50 */
export function oilWave(ph: number): number {
  const q = ph % HALF;
  const v = idiv(4 * q * (HALF - q) * 50, HALF * HALF);
  return ph < HALF ? v : -v;
}

const moves = baseMoves();
moves['qcf1'] = {
  id: 'qcf1', name: '슈퍼카 돌진', total: 46, anim: 'car',
  advance: [[4, 22, 66]],
  hits: [hit(10, 13, 55, 'm', 750, -14, 0, { kd: true, kb: 20, heavy: true, width: 360 })],
};
moves['qcf2'] = { id: 'qcf2', name: '매 소환', total: 42, anim: 'falcon', hits: [], proj: { f: 14, kind: 'falcon' } };
moves['41'] = { id: '41', name: '모래폭풍 대시', total: 32, anim: 'sandDash', hits: [], invuln: [1, 16], noTurn: true };
moves['ex'] = {
  id: 'ex', name: '금빛 슈퍼카 EX', total: 50, anim: 'car', cost: 1000, armor: [1, 22],
  advance: [[4, 24, 74]],
  hits: [hit(10, 15, 75, 'm', 800, -10, 0, { kd: true, kb: 26, heavy: true, wallSplat: true, width: 380 })],
};
moves['ult'] = ultMove('유가 폭등');

export const mbs: CharDef = {
  id: 'mbs',
  name: '무함마드 빈 살만',
  country: '사우디아라비아',
  title: '오일머니 왕세자',
  style: '스피드형',
  maxHp: 950,
  walkF: 30,
  walkB: 25,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: COMMON_SPOKE,
  resName: '유가',
  resMax: 100,
  resInit: [50, 0, 1, 0, 0, 0, 0],
  ultName: '유가 폭등',
  ultHeadline: '[긴급 속보] 사우디, 원유 감산 전격 발표',
  ultTicker: [
    '국제 유가 하루 만에 300% 폭등',
    '주유소 대기 줄 10km',
    '슈퍼카 한 대 더 구매 확인',
  ],
  ultLine: '기름값은 내가 정한다.',
  winLine: '오늘 유가는 아주 좋군.',
  loseLine: '…증산을 검토하겠다.',
  hooks: {
    init(_s, f) {
      // res[0]: 유가 0~100, res[1]: 위상(프레임), res[2]: 1 오르는 중 / 0 내리는 중, res[3..4]: 대시 출발점, res[5..6]: 대시 도착점
      f.res = [50, 0, 1, 0, 0, 0, 0];
    },
    tick(s, f) {
      if (s.phase !== 'fight') return;
      f.res[1] = (f.res[1] + 1) % OIL_PERIOD;
      const prev = f.res[0];
      f.res[0] = 50 + oilWave(f.res[1]);
      if (f.res[0] !== prev) f.res[2] = f.res[0] > prev ? 1 : 0;
      if (f.res[1] === idiv(HALF, 2)) emit(s, { k: 'special', who: f.idx, name: '유가 최고치! 공격력↑' });
      if (f.res[1] === HALF + idiv(HALF, 2)) emit(s, { k: 'special', who: f.idx, name: '유가 바닥! 속도↑' });
    },
    dmgMul(_s, f) {
      return 85 + idiv(f.res[0] * 30, 100); // 85~115%
    },
    speedMul(_s, f) {
      return 120 - idiv(f.res[0] * 35, 100); // 120~85%
    },
    onMoveFrame(_s, f, o, m) {
      if (m.id !== '41') return;
      if (f.mf === 3) {
        // 상대 옆·뒤로 돌아가는 경로를 정한다
        const [dx, dz] = dirTo(f, o);
        const lim = ARENA - BODY_R;
        f.res[3] = f.x;
        f.res[4] = f.z;
        f.res[5] = clamp(o.x + idiv(dx * 650, 1000) - idiv(dz * 350, 1000), -lim, lim);
        f.res[6] = clamp(o.z + idiv(dz * 650, 1000) + idiv(dx * 350, 1000), -lim, lim);
        f.buffs.hidden = 13;
      }
      if (f.mf >= 4 && f.mf <= 14) {
        const k = f.mf - 3;
        f.x = f.res[3] + idiv((f.res[5] - f.res[3]) * k, 11);
        f.z = f.res[4] + idiv((f.res[6] - f.res[4]) * k, 11);
      }
      if (f.mf === 15) faceOpponent(f, o);
    },
    spawn(s, f, _o, kind) {
      if (kind !== 'falcon') return;
      // 높은 곳에서 사선으로 내려와 머리 높이로 날아간다
      spawnProj(s, {
        owner: f.idx, kind: 'falcon',
        x: f.x + idiv(f.fx * 400, 1000), z: f.z + idiv(f.fz * 400, 1000), y: 2150, vy: -30,
        vx: idiv(f.fx * 54, 1000), vz: idiv(f.fz * 54, 1000),
        life: 72, dmg: 40, lvl: 'h', radius: 260, onHit: 18, onBlock: 6,
      });
    },
    ultTick(_s, _f, _o, c) {
      // 원유 기둥 높이 (mm)
      c.v = c.t < 90 ? 0 : Math.min(6000, (c.t - 90) * 80);
    },
    ultApply(s, _f, o) {
      dealDamage(s, o, 220);
    },
    ultAfter(_s, f, o) {
      // 하늘 높이 띄워 추가타를 넣을 수 있게 (어퍼컷보다 높이, 가까이 떨어진다)
      o.x = f.x + idiv(f.fx * 700, 1000);
      o.z = f.z + idiv(f.fz * 700, 1000);
      o.vy = 120;
      o.vx = idiv(f.fx * 2, 1000);
      o.vz = idiv(f.fz * 2, 1000);
      o.airHits = 0;
      o.comboMoves.push('ult');
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '슈퍼카 돌진', desc: '빠른 장거리 돌진 (중단, 다운). 가드당하면 -14' },
    { cmd: '↓↘→ + RP', name: '매 소환', desc: '매가 사선으로 내려와 날아간다 (상단 투사체)' },
    { cmd: '← + LP', name: '모래폭풍 대시', desc: '무적 대시로 상대 옆·뒤로 돌아간다' },
    { cmd: 'LK+RK', name: '금빛 슈퍼카 (EX)', desc: '아머 돌진, 벽에 붙이기' },
    { cmd: 'LP+RP', name: '궁극기: 유가 폭등', desc: '유전 분출로 22% 피해 + 상대를 하늘 높이 띄운다 (추가타 가능)' },
    { cmd: '고유', name: '유가', desc: '10초 주기로 오르내린다. 높으면 공격력 최대 +15%·속도 -15%, 낮으면 속도 +20%·공격력 -15%' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투 미들킥', inputs: 'LP, RP, LK', seq: ['51', '12', '123'] },
    { name: '띄우기 슈퍼카', inputs: '↘RP → ↓↘→LP', seq: ['32', 'qcf1'] },
    { name: '궁극기 추가타', inputs: 'LP+RP → LP, RP', seq: ['ult', '51', '12'] },
  ],
  look: {
    skin: 0xc99a72, suit: 0xf4f1ea, shirt: 0xf4f1ea, tie: 0xf4f1ea, pants: 0xf4f1ea,
    hair: 0x1a1410, hairStyle: 'fade', headScale: 1.0, bodyW: 1.05, belly: 1.0, height: 1.02, accent: 0x2fbf71,
    collar: 'mao',
  },
  theme: { root: 50, scale: [0, 1, 4, 5, 7, 8, 11], tempo: 138 },
};

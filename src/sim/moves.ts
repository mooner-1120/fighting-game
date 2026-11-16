import { BTN_LP, BTN_RP, type HitDef, type MoveDef } from './types';

export function hit(f: number, len: number, dmg: number, lvl: HitDef['lvl'], reach: number, onBlock: number, onHit: number, extra: Partial<HitDef> = {}): HitDef {
  return { f, len, dmg, lvl, reach, onBlock, onHit, ...extra };
}

export function lastActive(m: MoveDef): number {
  let e = 0;
  for (const h of m.hits) e = Math.max(e, h.f + h.len - 1);
  if (m.throw) e = Math.max(e, m.throw.f);
  return e;
}

export function firstActive(m: MoveDef): number {
  let s = 999;
  for (const h of m.hits) s = Math.min(s, h.f);
  if (m.throw) s = Math.min(s, m.throw.f);
  return s === 999 ? 0 : s;
}

/** 모든 캐릭터 공통 기본기 (철권식 기본 체계) */
export function baseMoves(): Record<string, MoveDef> {
  const list: MoveDef[] = [
    {
      id: '51', name: '잽', total: 21, anim: 'jabL',
      hits: [hit(10, 2, 25, 'h', 950, 1, 8, { width: 260 })],
      cancels: [{ btn: BTN_RP, to: '12' }, { btn: BTN_LP, to: '11' }],
    },
    {
      id: '11', name: '더블 잽', total: 22, anim: 'jabL',
      hits: [hit(9, 2, 22, 'h', 950, 0, 7, { width: 260 })],
    },
    {
      id: '12', name: '원투', total: 26, anim: 'straightR',
      hits: [hit(9, 2, 30, 'h', 1000, -3, 6, { width: 260 })],
      cancels: [{ btn: 64, to: '123' }],
    },
    {
      id: '123', name: '원투 미들킥', total: 40, anim: 'kickMidL',
      hits: [hit(15, 3, 40, 'm', 1150, -12, 3, { kb: 14 })],
    },
    {
      id: '52', name: '스트레이트', total: 26, anim: 'straightR',
      hits: [hit(12, 2, 35, 'h', 1050, -3, 5, { width: 260 })],
    },
    {
      id: '53', name: '미들킥', total: 34, anim: 'kickMidL',
      hits: [hit(14, 3, 40, 'm', 1150, -7, 4)],
    },
    {
      id: '54', name: '하이킥', total: 33, anim: 'kickHighR',
      hits: [hit(12, 3, 45, 'h', 1200, -9, 3, { chKd: true, kb: 12 })],
    },
    {
      id: '21', name: '앉아 잽', total: 24, anim: 'crouchJab', crouch: true,
      hits: [hit(10, 2, 15, 'l', 900, -5, 5)],
    },
    {
      id: '22', name: '앉아 스트레이트', total: 28, anim: 'crouchJab', crouch: true,
      hits: [hit(11, 2, 22, 'l', 950, -6, 4)],
    },
    {
      id: '23', name: '로우킥', total: 38, anim: 'lowKick', crouch: true,
      hits: [hit(16, 3, 28, 'l', 1150, -13, -2)],
    },
    {
      id: '24', name: '다리 후리기', total: 48, anim: 'sweep', crouch: true,
      hits: [hit(20, 4, 45, 'l', 1250, -22, 0, { kd: true })],
    },
    {
      id: '31', name: '중단 찌르기', total: 28, anim: 'bodyBlow',
      hits: [hit(13, 2, 30, 'm', 950, -2, 6)],
    },
    {
      id: '32', name: '어퍼컷', total: 40, anim: 'uppercut',
      hits: [hit(15, 2, 45, 'm', 950, -13, 0, { launch: 44, kb: 5 })],
    },
    {
      id: '33', name: '앞차기', total: 34, anim: 'kickMidR',
      hits: [hit(14, 3, 35, 'm', 1100, -7, 4)],
    },
    {
      id: '34', name: '앞 로우킥', total: 36, anim: 'lowKick', crouch: true,
      hits: [hit(15, 3, 26, 'l', 1100, -12, -1)],
    },
    {
      id: '62', name: '돌진 훅', total: 40, anim: 'hookR',
      hits: [hit(16, 3, 55, 'm', 1150, -9, 4, { chLaunch: 38, kb: 12 })],
      advance: [[6, 16, 22]],
    },
    {
      id: '61', name: '팔꿈치', total: 30, anim: 'bodyBlow',
      hits: [hit(14, 2, 32, 'm', 900, -4, 5)],
      advance: [[4, 12, 15]],
    },
    {
      id: '63', name: '무릎 차기', total: 36, anim: 'kickMidL',
      hits: [hit(15, 3, 42, 'm', 950, -8, 4, { kb: 12 })],
      advance: [[5, 14, 15]],
    },
    {
      id: '64', name: '돌려차기', total: 40, anim: 'kickHighR',
      hits: [hit(16, 3, 52, 'h', 1250, -10, 6, { kd: true })],
      advance: [[4, 14, 10]],
    },
    {
      id: '44', name: '추적 하이킥', total: 42, anim: 'kickHighR', track: true,
      hits: [hit(17, 3, 50, 'h', 1250, -9, 0, { kd: true, width: 450 })],
    },
    {
      id: '42', name: '백 스윙', total: 36, anim: 'hookR', track: true,
      hits: [hit(15, 3, 38, 'h', 1050, -6, 5, { width: 420 })],
    },
    {
      id: '43', name: '뒷걸음 미들킥', total: 38, anim: 'kickMidR',
      hits: [hit(16, 3, 40, 'm', 1150, -8, 3)],
      advance: [[1, 8, -12]],
    },
    {
      id: '94', name: '점프 니킥', total: 44, anim: 'knee', airborne: [4, 22],
      hits: [hit(15, 4, 48, 'm', 1000, -12, 0, { launch: 42 })],
      advance: [[1, 18, 18]],
    },
    {
      id: 't1', name: '잡기 (LP+LK)', total: 40, anim: 'grab',
      hits: [],
      throw: { f: 12, reach: 900, dmg: 130, breakBtn: 'L', dur: 60 },
    },
    {
      id: 't2', name: '잡기 (RP+RK)', total: 40, anim: 'grab',
      hits: [],
      throw: { f: 12, reach: 900, dmg: 135, breakBtn: 'R', dur: 60 },
    },
    {
      id: 'emerg', name: '비상 담화', total: 52, anim: 'emergency', emergency: true,
      armor: [1, 15],
      hits: [hit(13, 3, 120, 'm', 1350, -15, 0, { kd: true, heavy: true, kb: 20, width: 380 })],
      advance: [[5, 14, 25]],
    },
    {
      id: 'parryhit', name: '반격', total: 30, anim: 'pose', hits: [], invuln: [1, 30],
    },
  ];
  const out: Record<string, MoveDef> = {};
  for (const m of list) out[m.id] = m;
  return out;
}

export const UNIVERSAL_CMDS: Record<string, string> = {
  '51': '51', '52': '52', '53': '53', '54': '54',
  '21': '21', '22': '22', '23': '23', '24': '24',
  '31': '31', '32': '32', '33': '33', '34': '34',
  '11': '21', '12': '22', '13': '23', '14': '24',
  '61': '61', '62': '62', '63': '63', '64': '64',
  '41': '41', '42': '42', '43': '43', '44': '44',
  '94': '94', '91': '61', '92': '62', '93': '63',
};

export const BTN_INDEX: Record<number, number> = { [BTN_LP]: 1, [BTN_RP]: 2, 64: 3, 128: 4 };

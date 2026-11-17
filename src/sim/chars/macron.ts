// 에마뉘엘 마크롱 (프랑스) — 펜싱 테크니션. 고유 시스템: 우아함 (저스트 가드로 차오르고 데미지↑)
import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, heal, spawnProj } from '../simutil';
import { idiv } from '../fixed';
import { BTN_LP } from '../types';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['qcf1'] = {
  id: 'qcf1', name: '레이피어 찌르기', total: 32, anim: 'rapier',
  hits: [hit(11, 2, 28, 'h', 1250, -4, 6, { width: 220 })],
  cancels: [{ btn: BTN_LP, to: '!qcf1b' }],
};
moves['qcf1b'] = {
  id: 'qcf1b', name: '연속 찌르기', total: 30, anim: 'rapier',
  hits: [hit(8, 2, 20, 'h', 1250, -6, 8, { width: 220 })],
  cancels: [{ btn: BTN_LP, to: '!qcf1c' }],
};
moves['qcf1c'] = {
  id: 'qcf1c', name: '마무리 찌르기', total: 42, anim: 'rapier',
  hits: [hit(12, 3, 40, 'm', 1300, -12, 0, { kd: true, kb: 16, width: 240 })],
  advance: [[4, 12, 12]],
};
moves['qcf2'] = { id: 'qcf2', name: '바게트 투척', total: 44, anim: 'throwBread', hits: [], proj: { f: 15, kind: 'baguette' } };
moves['41'] = { id: '41', name: '와인 잔 건배', total: 72, anim: 'toast', hits: [] };
moves['ex'] = {
  id: 'ex', name: '플레슈', total: 50, anim: 'rapier', cost: 1000, armor: [1, 16],
  advance: [[5, 20, 62]],
  hits: [hit(14, 6, 70, 'm', 1100, -12, 0, { kd: true, kb: 22, heavy: true, wallSplat: true, width: 300 })],
};
moves['ult'] = ultMove('총파업');

export const macron: CharDef = {
  id: 'macron',
  name: '에마뉘엘 마크롱',
  country: '프랑스',
  title: '엘리트 대통령',
  style: '펜싱 테크니션',
  maxHp: 980,
  walkF: 27,
  walkB: 23,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: { ...COMMON_SPOKE, LK: ['qcf1', 'qcf1b', 'qcf1c'] },
  resName: '우아함',
  resMax: 100,
  resInit: [0],
  ultName: '총파업',
  ultHeadline: '[긴급 속보] 프랑스 전국 총파업 돌입',
  ultTicker: [
    '지하철·철도 전면 중단',
    '노란 조끼 시위대 샹젤리제 행진',
    '연금 개혁 반대 집회 사흘째',
  ],
  ultLine: 'En garde!',
  winLine: 'Voilà. 우아하게 끝났군요.',
  loseLine: '…개혁은 계속됩니다.',
  hooks: {
    init(_s, f) {
      // res[0]: 우아함 0~100
      f.res = [0];
    },
    dmgMul(_s, f) {
      return 100 + idiv(f.res[0], 4); // 100~125%
    },
    onGuard(s, f, _att, just) {
      if (!just) return 0;
      f.res[0] = Math.min(100, f.res[0] + 20);
      emit(s, { k: 'justGuard', who: f.idx });
      emit(s, { k: 'special', who: f.idx, name: `저스트 가드! 우아함 ${f.res[0]}%` });
      return 4; // 가드 경직 4F 단축
    },
    onHurt(_s, f) {
      f.res[0] = Math.max(0, f.res[0] - 8);
    },
    onMoveFrame(s, f, _o, m) {
      if (m.id === '41' && f.mf === 42) {
        heal(s, f, 45);
        f.res[0] = Math.min(100, f.res[0] + 10);
      }
    },
    spawn(s, f, _o, kind) {
      if (kind !== 'baguette') return;
      spawnProj(s, {
        owner: f.idx, kind: 'baguette',
        x: f.x + idiv(f.fx * 450, 1000), z: f.z + idiv(f.fz * 450, 1000), y: 1200,
        vx: idiv(f.fx * 46, 1000), vz: idiv(f.fz * 46, 1000),
        life: 76, dmg: 35, lvl: 'm', radius: 260, onHit: 16, onBlock: 4,
      });
    },
    ultTick(_s, _f, _o, c) {
      // 지금까지 찌른 횟수 (1.5초부터 10F마다 한 번, 최대 12회)
      c.v = c.t < 90 ? 0 : Math.min(12, idiv(c.t - 90, 10) + 1);
    },
    ultApply(s, f, o) {
      dealDamage(s, o, 290 + f.res[0]);
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '레이피어 찌르기', desc: '빠른 상단 찌르기 (발생 11F). 닿으면 LP 추가 입력으로 연속 찌르기 최대 3회' },
    { cmd: '↓↘→ + RP', name: '바게트 투척', desc: '회전하는 바게트 투사체 (중단)' },
    { cmd: '← + LP', name: '와인 잔 건배', desc: '체력 4.5% 회복 + 우아함 10. 틈이 매우 큼' },
    { cmd: 'LK+RK', name: '플레슈 (EX)', desc: '아머 + 장거리 돌진 찌르기, 벽에 붙이기' },
    { cmd: 'LP+RP', name: '궁극기: 총파업', desc: '모두가 멈춘 사이 혼자 연속 찌르기. 29% 피해 + 우아함만큼 추가' },
    { cmd: '고유', name: '우아함', desc: '공격이 닿기 직전(6F 안)에 뒤를 새로 눌러 막으면 저스트 가드: 우아함 +20, 가드 경직 4F 감소. 높을수록 데미지 최대 +25%. 맞으면 감소' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '3단 찌르기', inputs: '↓↘→LP → LP → LP', seq: ['qcf1', 'qcf1b', 'qcf1c'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '띄우기 찌르기', inputs: '↘RP → ↓↘→LP → LP', seq: ['32', 'qcf1', 'qcf1b'] },
  ],
  look: {
    skin: 0xf1d2b6, suit: 0x1b2440, shirt: 0xffffff, tie: 0x1b2440, pants: 0x1b2440,
    hair: 0x5a4632, hairStyle: 'neat', headScale: 0.98, bodyW: 0.95, belly: 0.9, height: 1.0, accent: 0x6f8cff,
    collar: 'tie',
  },
  theme: { root: 53, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 124 },
};

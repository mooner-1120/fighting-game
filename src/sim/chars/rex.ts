import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, spawnProj } from '../simutil';
import { idiv } from '../fixed';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['qcf1'] = { id: 'qcf1', name: 'SNS 폭격', total: 40, anim: 'point', hits: [], proj: { f: 14, kind: 'tweet' } };
moves['qcf2'] = {
  id: 'qcf2', name: '골프채 스윙', total: 52, anim: 'golf',
  hits: [hit(20, 3, 58, 'm', 1300, -16, 0, { launch: 46, heavy: true, kb: 8, width: 380 })],
};
moves['41'] = { id: '41', name: '장벽 세우기', total: 36, anim: 'barrier', hits: [], proj: { f: 14, kind: 'barrier' } };
moves['ex'] = {
  id: 'ex', name: '황금 돌진', total: 50, anim: 'rush', cost: 1000, armor: [1, 18],
  hits: [hit(16, 6, 70, 'm', 950, -10, 0, { kd: true, heavy: true, kb: 24, wallSplat: true, width: 380 })],
  advance: [[6, 22, 60]],
};
moves['ult'] = ultMove('관세 폭탄');

export const rex: CharDef = {
  id: 'rex',
  name: '도널드 트럼프',
  country: '자유합중국 콜럼비아',
  title: '재벌 대통령',
  style: '파워형 돌진',
  maxHp: 1050,
  walkF: 21,
  walkB: 17,
  dmg: 104,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: COMMON_SPOKE,
  resName: '재화($)',
  resMax: 999,
  resInit: [100, 0, 0],
  ultName: '관세 폭탄',
  ultHeadline: '[긴급 속보] 콜럼비아, 전 세계에 관세 25% 부과',
  ultTicker: [
    "트럼프 '역대 최고의 관세, 아무도 이런 관세 본 적 없다'",
    '돈다발 폭격으로 링 주변 교통 마비',
    '상대국 공격력 25% 인하 확정',
    'SNS 게시물 3분 만에 400개 돌파',
  ],
  ultLine: '관세다! 아주 아름다운 관세!',
  winLine: '최고의 승리. 다들 그렇게 말하더군.',
  loseLine: '조작이다! 재경기를 요구한다!',
  hooks: {
    init(_s, f) {
      f.res = [100, 0, 0];
    },
    onMoveStart(s, f, m) {
      if (m.id === 'qcf2') {
        if (f.res[0] >= 100) {
          f.res[0] -= 100;
          f.res[1] = 1;
          emit(s, { k: 'special', who: f.idx, name: '$100 투자 — 골든 스윙!' });
        } else f.res[1] = 0;
      }
      if (m.id === '41') {
        if (f.res[0] >= 80) {
          f.res[0] -= 80;
          f.res[2] = 1;
        } else {
          f.res[2] = 0;
          emit(s, { k: 'special', who: f.idx, name: '예산 부족! (장벽 $80)' });
        }
      }
      return true;
    },
    dmgMul(_s, f, _h, id) {
      return id === 'qcf2' && f.res[1] === 1 ? 150 : 100;
    },
    onHit(_s, att, _d, _id, dmg) {
      att.res[0] = Math.min(999, att.res[0] + 8 + idiv(dmg, 5));
    },
    spawn(s, f, _o, kind) {
      if (kind === 'tweet') {
        spawnProj(s, {
          owner: f.idx, kind: 'tweet',
          x: f.x + idiv(f.fx * 450, 1000), z: f.z + idiv(f.fz * 450, 1000), y: 1450,
          vx: idiv(f.fx * 52, 1000), vz: idiv(f.fz * 52, 1000),
          life: 72, dmg: 35, lvl: 'h', radius: 260, onHit: 20, onBlock: 8,
        });
      } else if (kind === 'barrier' && f.res[2] === 1) {
        spawnProj(s, {
          owner: f.idx, kind: 'barrier',
          x: f.x + idiv(f.fx * 1100, 1000), z: f.z + idiv(f.fz * 1100, 1000),
          tx: f.fx, tz: f.fz, life: 300, radius: 480,
        });
      }
    },
    ultApply(s, f, o) {
      dealDamage(s, o, 300);
      o.buffs.tariff = 600;
      f.res[0] = Math.min(999, f.res[0] + 200);
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: 'SNS 폭격', desc: '말풍선 투사체 (상단 — 앉아서 피할 수 있음)' },
    { cmd: '↓↘→ + RP', name: '골프채 스윙', desc: '띄우기. $100 이상이면 자동 투자해 데미지 1.5배' },
    { cmd: '← + LP', name: '장벽 세우기', desc: '$80 소모. 5초간 투사체와 접근을 막는 벽' },
    { cmd: 'LK+RK', name: '황금 돌진 (EX)', desc: '아머 돌진, 벽에 붙이기' },
    { cmd: 'LP+RP', name: '궁극기: 관세 폭탄', desc: '돈다발 폭격 + 10초간 상대 공격력 -25%' },
    { cmd: '고유', name: '재화', desc: '때릴 때마다 돈 획득, 기술 강화에 소모' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '골든 스윙 콤보', inputs: '↓↘→RP → LP, RP', seq: ['qcf2', '51', '12'] },
  ],
  look: {
    skin: 0xf0a868, suit: 0x1d2b4f, shirt: 0xffffff, tie: 0xd11f1f, pants: 0x1d2b4f,
    hair: 0xf4d35e, hairStyle: 'swoop', headScale: 1.0, bodyW: 1.2, belly: 1.4, height: 1.02, accent: 0xffd23f,
  },
  theme: { root: 48, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 124 },
};

// 시진핑 (중국) — 뼈대. 고유 기술·시스템은 docs/new-characters.md 설계대로 채운다.
import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage } from '../simutil';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['ult'] = ultMove('디지털 만리방벽');

export const xi: CharDef = {
  id: 'xi',
  name: '시진핑',
  country: '중국',
  title: '천하의 국가주석',
  style: '구역 장악형',
  maxHp: 1050,
  walkF: 22,
  walkB: 20,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS },
  spoke: COMMON_SPOKE,
  resName: '감시망',
  resMax: 100,
  resInit: [0],
  ultName: '디지털 만리방벽',
  ultHeadline: '[긴급 속보] 중국, 디지털 만리방벽 가동',
  ultTicker: [
    '검색어 일시 차단 중',
    '드론 감시망 전국 확대',
    '국가주석 공식 일정 비공개',
  ],
  ultLine: '벽 안이 가장 안전합니다.',
  winLine: '모든 것은 계획대로입니다.',
  loseLine: '…당분간 공식 석상에 나오지 않겠습니다.',
  hooks: {
    ultApply(s, _f, o) {
      dealDamage(s, o, 300);
    },
  },
  moveList: [
    { cmd: 'LP+RP', name: '궁극기: 디지털 만리방벽', desc: '준비 중' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
  ],
  look: {
    skin: 0xf0d0ad, suit: 0x23262d, shirt: 0xffffff, tie: 0xb3202a, pants: 0x23262d,
    hair: 0x111111, hairStyle: 'neat', headScale: 1.05, bodyW: 1.08, belly: 1.15, height: 0.98, accent: 0xffc928,
    collar: 'tie', pin: 'red',
  },
  theme: { root: 50, scale: [0, 2, 4, 7, 9], tempo: 100 },
};

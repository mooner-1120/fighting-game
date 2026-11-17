// 무함마드 빈 살만 (사우디아라비아) — 뼈대. 고유 기술·시스템은 docs/new-characters.md 설계대로 채운다.
import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage } from '../simutil';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
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
  cmds: { ...UNIVERSAL_CMDS },
  spoke: COMMON_SPOKE,
  resName: '유가',
  resMax: 100,
  resInit: [0],
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
    ultApply(s, _f, o) {
      dealDamage(s, o, 300);
    },
  },
  moveList: [
    { cmd: 'LP+RP', name: '궁극기: 유가 폭등', desc: '준비 중' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
  ],
  look: {
    skin: 0xc99a72, suit: 0xf4f1ea, shirt: 0xf4f1ea, tie: 0xf4f1ea, pants: 0xf4f1ea,
    hair: 0x1a1410, hairStyle: 'fade', headScale: 1.0, bodyW: 1.05, belly: 1.0, height: 1.02, accent: 0x2fbf71,
    collar: 'mao',
  },
  theme: { root: 50, scale: [0, 1, 4, 5, 7, 8, 11], tempo: 138 },
};

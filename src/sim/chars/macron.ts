// 에마뉘엘 마크롱 (프랑스) — 뼈대. 고유 기술·시스템은 docs/new-characters.md 설계대로 채운다.
import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage } from '../simutil';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
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
  cmds: { ...UNIVERSAL_CMDS },
  spoke: COMMON_SPOKE,
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
    ultApply(s, _f, o) {
      dealDamage(s, o, 300);
    },
  },
  moveList: [
    { cmd: 'LP+RP', name: '궁극기: 총파업', desc: '준비 중' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
  ],
  look: {
    skin: 0xf1d2b6, suit: 0x1b2440, shirt: 0xffffff, tie: 0x1b2440, pants: 0x1b2440,
    hair: 0x5a4632, hairStyle: 'neat', headScale: 0.98, bodyW: 0.95, belly: 0.9, height: 1.0, accent: 0x6f8cff,
    collar: 'tie',
  },
  theme: { root: 53, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 124 },
};

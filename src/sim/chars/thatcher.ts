// 마거릿 대처 (영국) — 뼈대. 고유 기술·시스템은 docs/new-characters.md 설계대로 채운다.
import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage } from '../simutil';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['ult'] = ultMove('해협 봉쇄');

export const thatcher: CharDef = {
  id: 'thatcher',
  name: '마거릿 대처',
  country: '영국',
  title: '철의 여인',
  style: '우산 리치형',
  maxHp: 1000,
  walkF: 24,
  walkB: 21,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS },
  spoke: COMMON_SPOKE,
  resName: '티타임',
  resMax: 100,
  resInit: [0],
  ultName: '해협 봉쇄',
  ultHeadline: '[긴급 속보] 영국, 해협 전면 봉쇄 선언',
  ultTicker: [
    "대처 총리 '이 여인은 돌아서지 않는다'",
    '해협에 군함 집결, 물살 거세져',
    "런던 시민들 '일단 차부터 마시고'",
  ],
  ultLine: '이 여인은 돌아서지 않습니다!',
  winLine: 'The lady is not for turning.',
  loseLine: '…차 한 잔 하고 다시 오죠.',
  hooks: {
    ultApply(s, _f, o) {
      dealDamage(s, o, 300);
    },
  },
  moveList: [
    { cmd: 'LP+RP', name: '궁극기: 해협 봉쇄', desc: '준비 중' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
  ],
  look: {
    skin: 0xf2d4bf, suit: 0x1f3a7a, shirt: 0xffffff, tie: 0x1f3a7a, pants: 0x1f3a7a,
    hair: 0xc9b48a, hairStyle: 'helmet', headScale: 1.0, bodyW: 0.92, belly: 0.9, height: 0.95, accent: 0x5c8dff,
    collar: 'tie',
  },
  theme: { root: 52, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 108 },
};

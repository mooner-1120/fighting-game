import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, heal } from '../simutil';
import { idiv } from '../fixed';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['qcf1'] = {
  id: 'qcf1', name: '시장 방문 러시', total: 58, anim: 'rush3',
  advance: [[8, 34, 22]],
  hits: [
    hit(14, 2, 20, 'm', 950, -8, 10),
    hit(22, 2, 20, 'm', 950, -8, 10),
    hit(32, 3, 35, 'm', 1050, -12, 0, { kd: true, kb: 16 }),
  ],
};
moves['qcf2'] = {
  id: 'qcf2', name: '서류 내리치기', total: 46, anim: 'slam',
  hits: [hit(20, 3, 52, 'm', 1050, -14, 0, { bounce: true, launch: 42, heavy: true })],
};
moves['41'] = { id: '41', name: '긴급 브리핑', total: 34, anim: 'phone', hits: [] };
moves['ex'] = {
  id: 'ex', name: '시장 방문 러시 EX', total: 58, anim: 'rush3', cost: 1000, armor: [1, 22],
  advance: [[6, 34, 26]],
  hits: [
    hit(14, 2, 30, 'm', 1000, -6, 10),
    hit(22, 2, 30, 'm', 1000, -6, 10),
    hit(32, 3, 55, 'm', 1100, -10, 0, { kd: true, kb: 18, wallSplat: true }),
  ],
};
moves['ult'] = ultMove('국민 소통 라이브');

export const seo: CharDef = {
  id: 'seo',
  name: '이재명',
  country: '대한민국',
  title: '서민형 승부사',
  style: '밸런스형 (입문 추천)',
  maxHp: 1000,
  walkF: 21,
  walkB: 18,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: COMMON_SPOKE,
  resName: '지지율',
  resMax: 100,
  resInit: [50],
  ultName: '국민 소통 라이브',
  ultHeadline: '[생중계] 이재명, 국민 소통 라이브 긴급 편성',
  ultTicker: [
    '동시 접속자 5천만 명 돌파',
    "댓글창 폭주 '떡볶이 맛집 어디예요'",
    '지지율 실시간 반영 중',
    '서버 터짐 직전, 비서실 비상',
  ],
  ultLine: '국민 여러분, 지금 라이브 켭니다!',
  winLine: '이 승리는 시장 상인 여러분 덕분입니다!',
  loseLine: '겸허히 받아들이겠습니다… 다음 판에서!',
  hooks: {
    init(_s, f) {
      f.res = [50];
    },
    onMoveFrame(s, f, _o, m) {
      if (m.id === '41' && f.mf === 18) {
        f.buffs.briefing = 420;
        emit(s, { k: 'special', who: f.idx, name: '긴급 브리핑 — 상대 기술 예고' });
      }
    },
    dmgMul(_s, f) {
      return 75 + idiv(f.res[0], 2);
    },
    onHit(s, att, _d, id, _dmg, ch) {
      att.res[0] = Math.min(100, att.res[0] + (ch ? 6 : 2));
      if ((id === 'qcf1' || id === 'ex') && att.mf >= 32) heal(s, att, id === 'ex' ? 60 : 40);
    },
    onHurt(_s, f) {
      f.res[0] = Math.max(0, f.res[0] - 1);
    },
    ultApply(s, f, o) {
      dealDamage(s, o, 250 + idiv(f.res[0] * 3, 2));
      f.res[0] = Math.min(100, f.res[0] + 10);
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '시장 방문 러시', desc: '3연타 돌진. 마지막 타가 맞으면 떡볶이로 체력 회복' },
    { cmd: '↓↘→ + RP', name: '서류 내리치기', desc: '중단 내려치기, 바운드 → 콤보' },
    { cmd: '← + LP', name: '긴급 브리핑', desc: '7초간 상대가 쓰는 기술 이름이 미리 보인다' },
    { cmd: 'LK+RK', name: '시장 방문 러시 EX', desc: '아머 + 데미지 증가 + 벽 붙이기' },
    { cmd: 'LP+RP', name: '궁극기: 국민 소통 라이브', desc: '댓글 탄막. 지지율이 높을수록 강함 (최대 40%)' },
    { cmd: '고유', name: '지지율', desc: '맞히면 상승(카운터는 크게), 맞으면 하락. 데미지 75~125%' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '서류 바운드', inputs: '↓↘→RP → LP, RP', seq: ['qcf2', '51', '12'] },
  ],
  look: {
    skin: 0xf3d2b3, suit: 0x2f5d9b, shirt: 0xffffff, tie: 0x3b7dd8, pants: 0x2a3d5c,
    hair: 0x2a2a2a, hairStyle: 'neat', headScale: 1.0, bodyW: 1.0, belly: 1.0, height: 1.0, glasses: true, accent: 0x4fc3f7,
  },
  theme: { root: 50, scale: [0, 2, 4, 7, 9], tempo: 132 },
};

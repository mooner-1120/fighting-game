// 마거릿 대처 (영국) — 우산 리치형. 고유 시스템: 티타임 (10초마다 3초 창, RP+LK로 차를 마셔 회복)
import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, heal, spawnProj } from '../simutil';
import { idiv } from '../fixed';
import { BTN_LK, BTN_RP } from '../types';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

/** 티타임 주기 (프레임) */
export const TEA_EVERY = 600;
/** 티타임 알림 뒤 마실 수 있는 시간 */
export const TEA_WINDOW = 180;
/** 차를 다 마셨을 때 회복량 */
const TEA_HEAL = 60;
/** 회복이 들어가는 프레임 (그 전에 맞으면 회복 없음) */
const TEA_SIP_F = 38;

const moves = baseMoves();
moves['qcf1'] = {
  id: 'qcf1', name: '장우산 찌르기', total: 40, anim: 'umbrella',
  hits: [hit(15, 3, 45, 'm', 1450, -8, 4, { kb: 12, width: 220 })],
};
moves['qcf2'] = { id: 'qcf2', name: '이층버스 낙하', total: 52, anim: 'summonBus', hits: [], proj: { f: 18, kind: 'bus' } };
moves['41'] = {
  id: '41', name: '의회 질의', total: 34, anim: 'question',
  hits: [hit(12, 3, 20, 'm', 850, -4, 16, { kb: 4 })],
};
moves['ex'] = {
  id: 'ex', name: '장우산 회전 EX', total: 54, anim: 'umbrella', cost: 1000, armor: [1, 18],
  advance: [[4, 14, 14]],
  hits: [
    hit(14, 2, 25, 'm', 1450, -8, 12, { width: 300 }),
    hit(21, 2, 25, 'm', 1450, -8, 12, { width: 300 }),
    hit(29, 3, 50, 'm', 1500, -10, 0, { kd: true, kb: 18, heavy: true, width: 300 }),
  ],
};
moves['tea'] = { id: 'tea', name: '티타임', total: 56, anim: 'tea', hits: [], noTurn: true };
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
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: { ...COMMON_SPOKE, LK: ['qcf1'], RK: ['41', '51', '12'] },
  resName: '티타임',
  resMax: 600,
  resInit: [600, 0],
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
    init(_s, f) {
      // res[0]: 다음 티타임까지 남은 프레임, res[1]: 티타임 창 남은 프레임 (>0 이면 마실 수 있음)
      f.res = [TEA_EVERY, 0];
    },
    tick(s, f) {
      if (s.phase !== 'fight') return;
      if (f.res[1] > 0) {
        f.res[1]--;
        if (f.res[1] === 0) f.res[0] = TEA_EVERY;
        return;
      }
      if (f.move === 'tea') return;
      f.res[0]--;
      if (f.res[0] <= 0) {
        f.res[0] = 0;
        f.res[1] = TEA_WINDOW;
        emit(s, { k: 'teaTime', who: f.idx });
        emit(s, { k: 'special', who: f.idx, name: '티타임! RP+LK' });
      }
    },
    customCmd(_s, f, _o, pr) {
      if (f.res[1] <= 0 || f.move === 'tea') return null;
      // RP+LK: 다른 기술과 겹치지 않는 유일한 두 버튼 조합 (키보드 I+J)
      return (pr & BTN_RP) !== 0 && (pr & BTN_LK) !== 0 ? 'tea' : null;
    },
    onMoveStart(_s, f, m) {
      if (m.id === 'tea') {
        f.res[1] = 0;
        f.res[0] = TEA_EVERY;
      }
      return true;
    },
    onMoveFrame(s, f, _o, m) {
      if (m.id === 'tea' && f.mf === TEA_SIP_F) heal(s, f, TEA_HEAL);
    },
    spawn(s, f, o, kind) {
      if (kind !== 'bus') return;
      // 상대가 서 있던 자리 머리 위에서 떨어진다 (34F 뒤 착지)
      const T = 34;
      spawnProj(s, {
        owner: f.idx, kind: 'bus', x: o.x, z: o.z, y: 3400, vy: -idiv(3400, T),
        tx: o.x, tz: o.z, life: T, dmg: 70, lvl: 'm', radius: 420, kd: true, onBlock: 10,
      });
    },
    ultTick(_s, _f, _o, c) {
      // 물 높이 (mm): 1.5초 동안 차오른 뒤 유지
      c.v = Math.min(1200, c.t * 14);
    },
    ultApply(s, _f, o) {
      dealDamage(s, o, 280);
      o.buffs.slow = 300;
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '장우산 찌르기', desc: '기본기보다 훨씬 긴 중단 찌르기 (발생 15F, 가드 -8)' },
    { cmd: '↓↘→ + RP', name: '이층버스 낙하', desc: '상대가 있던 자리에 이층버스가 떨어진다 (중단, 다운). 움직이면 피할 수 있음' },
    { cmd: '← + LP', name: '의회 질의', desc: '짧은 질문 공격. 맞으면 길게 경직 → 원투로 이어진다' },
    { cmd: 'LK+RK', name: '장우산 회전 (EX)', desc: '아머 + 3연속 찌르기, 마지막 타 다운' },
    { cmd: 'LP+RP', name: '궁극기: 해협 봉쇄', desc: '물이 차오르고 군함 포격. 28% 피해 + 상대 5초 이동속도 -50%' },
    { cmd: '고유', name: '티타임', desc: '10초마다 3초 동안 RP+LK로 차를 마셔 체력 6% 회복. 마시는 동안 무방비' },
    { cmd: 'RP+LK', name: '티타임', desc: '10초마다 「티타임」 알림, 3초 안에 입력하면 차를 마셔 체력 6% 회복. 마시는 동안 무방비' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '질의 원투', inputs: '←LP → LP, RP', seq: ['41', '51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '우산 회전', inputs: 'LK+RK (3타)', seq: ['ex', 'ex', 'ex'] },
  ],
  look: {
    skin: 0xf4d8c4, suit: 0x1f4ea0, shirt: 0xfaf7f0, tie: 0, pants: 0x1f4ea0,
    hair: 0xd9bd7c, hairStyle: 'helmet', headScale: 1.0, bodyW: 0.86, belly: 0.85, height: 0.95, accent: 0x5c8dff,
    face: 'thatcher', collar: 'bow', outfit: 'skirt', pearls: true, brooch: 0xe8c547,
  },
  theme: { root: 52, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 108 },
};

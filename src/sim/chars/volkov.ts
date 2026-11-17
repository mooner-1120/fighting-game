import type { CharDef } from '../chardef';
import { baseMoves, hit, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, spawnProj } from '../simutil';
import { idiv } from '../fixed';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['qcf1'] = { id: 'qcf1', name: '곰 호출 돌진', total: 52, anim: 'summon', hits: [], proj: { f: 18, kind: 'bear' } };
moves['qcf2'] = {
  id: 'qcf2', name: '얼음판 업어치기', total: 52, anim: 'grab', hits: [],
  throw: { f: 14, reach: 1050, dmg: 190, breakBtn: 'any', mid: true, dur: 75, tag: 'ice' },
  advance: [[1, 10, 20]],
};
moves['41'] = {
  id: '41', name: '볼가 해머', total: 52, anim: 'hammer',
  hits: [hit(22, 3, 62, 'm', 1100, -14, 0, { bounce: true, launch: 42, heavy: true })],
};
moves['ex'] = { id: 'ex', name: '웃통 벗기', total: 40, anim: 'flex', hits: [], cost: 1000, invuln: [1, 14] };
moves['ult'] = ultMove('동토의 겨울');

export const volkov: CharDef = {
  id: 'volkov',
  name: '블라디미르 푸틴',
  country: '러시아',
  title: '강철 스트롱맨',
  style: '잡기형 (삼보·유도)',
  maxHp: 1150,
  walkF: 23,
  walkB: 19,
  dmg: 108,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: { ...COMMON_SPOKE, RK: ['qcf2'] },
  resName: '오라',
  resMax: 3,
  resInit: [0],
  ultName: '동토의 겨울',
  ultHeadline: '[긴급 속보] 러시아, 가스 밸브 전면 차단',
  ultTicker: [
    '동토의 겨울 도래… 난방비 300% 폭등',
    '푸틴 대통령, 웃통 벗고 직접 밸브 잠가',
    "기상청 '체감온도 영하 80도, 외출 자제'",
    '곰들도 동면 포기하고 출근',
  ],
  ultLine: '겨울이 온다. 내가 데려왔지.',
  winLine: '약한 자는 겨울을 넘기지 못한다.',
  loseLine: '이건… 연출된 패배다.',
  hooks: {
    init(_s, f) {
      f.res = [0];
    },
    onMoveStart(s, f, m) {
      if (m.id === 'ex') {
        f.buffs.armor = 420;
        emit(s, { k: 'special', who: f.idx, name: '웃통 벗기! 아머 발동' });
      }
      return true;
    },
    throwBreak(_s, att, _id, base) {
      return att.res[0] >= 3 ? 'none' : base;
    },
    onThrow(s, att) {
      if (att.res[0] >= 3) {
        att.res[0] = 0;
        emit(s, { k: 'special', who: att.idx, name: '오라 해방!' });
      } else {
        att.res[0] = Math.min(3, att.res[0] + 1);
        if (att.res[0] === 3) emit(s, { k: 'special', who: att.idx, name: '오라 MAX — 잡기 풀기 불가' });
      }
    },
    spawn(s, f, _o, kind) {
      if (kind !== 'bear') return;
      spawnProj(s, {
        owner: f.idx, kind: 'bear',
        x: f.x + idiv(f.fx * 500, 1000), z: f.z + idiv(f.fz * 500, 1000),
        vx: idiv(f.fx * 68, 1000), vz: idiv(f.fz * 68, 1000),
        life: 64, dmg: 70, lvl: 'm', radius: 430, kd: true, onBlock: 16,
      });
    },
    ultApply(s, _f, o) {
      dealDamage(s, o, 350);
      o.buffs.slow = 300;
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '곰 호출 돌진', desc: '곰이 바닥을 따라 돌진 (중단, 다운)' },
    { cmd: '↓↘→ + RP', name: '얼음판 업어치기', desc: '앉은 상대도 잡는 커맨드 잡기 (LP·RP로 풀기)' },
    { cmd: '← + LP', name: '볼가 해머', desc: '내려찍기. 맞으면 바운드 → 콤보' },
    { cmd: 'LK+RK', name: '웃통 벗기 (EX)', desc: '7초간 아머 (경직 무시)' },
    { cmd: 'LP+RP', name: '궁극기: 동토의 겨울', desc: '스테이지 빙결 + 대폭발 잡기, 상대 5초 이동속도 -50%' },
    { cmd: '고유', name: '오라', desc: '잡기 성공마다 1스택, 3스택이면 다음 잡기는 풀기 불가' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '해머 바운드', inputs: '←LP → LP, RP', seq: ['41', '51', '12'] },
  ],
  look: {
    skin: 0xf0c8a8, suit: 0x232a38, shirt: 0xf3f3f3, tie: 0x6e1f2a, pants: 0x1d2230,
    hair: 0xbfa27f, hairStyle: 'bald', headScale: 0.95, bodyW: 1.08, belly: 0.9, height: 0.97, accent: 0x6aa9ff,
    face: 'putin', collar: 'tie',
  },
  theme: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 112 },
};

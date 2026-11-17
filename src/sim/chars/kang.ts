import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, rand, spawnProj } from '../simutil';
import { clamp, idiv } from '../fixed';
import { ARENA, type Fighter, type GameState } from '../types';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

const moves = baseMoves();
moves['qcf1'] = { id: 'qcf1', name: '단거리 미사일', total: 44, anim: 'launch', hits: [], proj: { f: 16, kind: 'missile' } };
moves['qcf2'] = { id: 'qcf2', name: '인민 박수단 소환', total: 56, anim: 'clap', hits: [] };
moves['41'] = { id: '41', name: '현지 지도 포즈', total: 40, anim: 'pose', hits: [], counter: [5, 28] };
moves['ex'] = { id: 'ex', name: '미사일 일제 발사', total: 50, anim: 'launch', hits: [], cost: 1000, proj: { f: 16, kind: 'salvo' } };
moves['ult'] = ultMove('핵 단추');

const MISSILE_CHARGE = 150;

function lob(s: GameState, f: Fighter, tx: number, tz: number, T: number) {
  const x = f.x + idiv(f.fx * 200, 1000);
  const z = f.z + idiv(f.fz * 200, 1000);
  tx = clamp(tx, -ARENA, ARENA);
  tz = clamp(tz, -ARENA, ARENA);
  spawnProj(s, {
    owner: f.idx, kind: 'missile', x, z, y: 1600,
    vx: idiv(tx - x, T), vz: idiv(tz - z, T), tx, tz,
    life: T, dmg: 75, lvl: 'm', radius: 760, kd: true, onBlock: 14,
  });
}

export const kang: CharDef = {
  id: 'kang',
  name: '김정은',
  country: '북한',
  title: '은둔의 원수',
  style: '원거리 설치형',
  maxHp: 960,
  walkF: 23,
  walkB: 22,
  dmg: 100,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: { ...COMMON_SPOKE, RK: ['41'] },
  resName: '미사일',
  resMax: 3,
  resInit: [1, 0],
  ultName: '핵 단추',
  ultHeadline: '[긴급 속보] 북한, 붉은 단추 눌러',
  ultTicker: [
    "원수님, 단추 누르며 '이번엔 진짜다'",
    '인민 박수단 박수 소리 측정 불가 수준',
    '대륙간 미사일 링 위로 낙하 중',
    '※ 불발 확률 5%, 담당자 행방불명',
  ],
  ultLine: '단추는 늘 내 책상 위에 있다.',
  winLine: '위대한 승리를 인민에게 바친다!',
  loseLine: '이 패배는 보도되지 않는다.',
  hooks: {
    init(_s, f) {
      f.res = [1, 0];
    },
    tick(_s, f) {
      if (f.res[0] < 3) {
        f.res[1]++;
        if (f.res[1] >= MISSILE_CHARGE) {
          f.res[0]++;
          f.res[1] = 0;
        }
      }
    },
    onMoveFrame(s, f, _o, m) {
      if (m.id === 'qcf2' && f.mf === 30) {
        f.buffs.atkUp = 360;
        emit(s, { k: 'special', who: f.idx, name: '인민 박수단! 공격력 +15%' });
      }
    },
    spawn(s, f, o, kind) {
      if (kind === 'missile') {
        if (f.res[0] <= 0) {
          emit(s, { k: 'special', who: f.idx, name: '장전 중…' });
          return;
        }
        f.res[0]--;
        lob(s, f, o.x, o.z, 42);
      } else if (kind === 'salvo') {
        const px = -f.fz;
        const pz = f.fx;
        lob(s, f, o.x, o.z, 34);
        lob(s, f, o.x + idiv(px * 900, 1000), o.z + idiv(pz * 900, 1000), 44);
        lob(s, f, o.x - idiv(px * 900, 1000), o.z - idiv(pz * 900, 1000), 54);
      }
    },
    ultDecide(s, _f, _o, cine) {
      cine.fail = rand(s) < 500;
    },
    ultApply(s, f, o, cine) {
      if (cine.fail) dealDamage(s, f, 100);
      else dealDamage(s, o, 400);
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '단거리 미사일', desc: '상대 위치로 곡사 미사일 (장전 칸 1 소모)' },
    { cmd: '↓↘→ + RP', name: '인민 박수단 소환', desc: '6초간 공격력 +15% (빈틈 큼)' },
    { cmd: '← + LP', name: '현지 지도 포즈', desc: '반격 자세. 타격을 받아내면 자동 반격' },
    { cmd: 'LK+RK', name: '미사일 일제 발사 (EX)', desc: '세 발 동시 곡사, 장전 칸 소모 없음' },
    { cmd: 'LP+RP', name: '궁극기: 핵 단추', desc: '체력 40% 피해. 5% 확률로 불발(자폭 10%)' },
    { cmd: '고유', name: '발사 대기', desc: '2.5초마다 미사일 1칸 장전 (최대 3)' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '원투', inputs: 'LP, RP', seq: ['51', '12'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '니킥 콤보', inputs: '↗RK → LP, RP', seq: ['94', '51', '12'] },
  ],
  look: {
    skin: 0xf2d3b0, suit: 0x1c1c1e, shirt: 0x1c1c1e, tie: 0, pants: 0x1c1c1e,
    hair: 0x101010, hairStyle: 'fade', headScale: 1.12, bodyW: 1.2, belly: 1.4, height: 0.93, accent: 0xd62828,
    face: 'kim', collar: 'mao', pin: 'red',
  },
  theme: { root: 43, scale: [0, 2, 4, 5, 7, 9, 10], tempo: 104 },
};

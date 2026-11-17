// 시진핑 (중국) — 구역 장악형. 고유 시스템: 감시망 (게이지가 차면 6초간 상대 다음 기술 예고)
import type { CharDef } from '../chardef';
import { baseMoves, UNIVERSAL_CMDS } from '../moves';
import { dealDamage, emit, faceOpponent, spawnProj } from '../simutil';
import { clamp, idiv } from '../fixed';
import { ARENA, BODY_R, type Fighter, type GameState } from '../types';
import { COMMON_LIST, COMMON_SPOKE, ultMove } from './common';

/** 감시망 가동 시간 (프레임) */
const WATCH_TIME = 360;
/** 잠적(피격 무시) 구간 */
const OFFLINE_FROM = 6;
const OFFLINE_TO = 40;

const moves = baseMoves();
moves['qcf1'] = { id: 'qcf1', name: '드론 편대', total: 46, anim: 'drone', hits: [], proj: { f: 16, kind: 'drone' } };
moves['qcf2'] = { id: 'qcf2', name: '연산 방벽 설치', total: 40, anim: 'firewall', hits: [], proj: { f: 14, kind: 'firewall' } };
moves['41'] = { id: '41', name: '장기 오프라인', total: 58, anim: 'offline', hits: [], invuln: [OFFLINE_FROM, OFFLINE_TO], noTurn: true };
moves['ex'] = { id: 'ex', name: '드론 일제 출격 EX', total: 46, anim: 'drone', hits: [], cost: 1000, proj: { f: 14, kind: 'droneEx' } };
moves['ult'] = ultMove('디지털 만리방벽');

/** 드론 n대를 일렬로 띄워 보낸다 (뒤쪽 드론일수록 늦게 도착) */
function drones(s: GameState, f: Fighter, n: number, ex: boolean) {
  for (let i = 0; i < n; i++) {
    const back = 450 - i * 330;
    spawnProj(s, {
      owner: f.idx, kind: 'drone',
      x: f.x + idiv(f.fx * back, 1000), z: f.z + idiv(f.fz * back, 1000), y: 1550,
      vx: idiv(f.fx * 40, 1000), vz: idiv(f.fz * 40, 1000),
      life: 110, dmg: 20, lvl: ex ? 'm' : 'h', radius: 240,
      onHit: 18, onBlock: 6, kd: ex && i === n - 1,
    });
  }
}

export const xi: CharDef = {
  id: 'xi',
  name: '시진핑',
  country: '중국',
  title: '천하의 국가주석',
  style: '구역 장악형',
  maxHp: 1050,
  walkF: 22,
  walkB: 20,
  dmg: 104,
  moves,
  cmds: { ...UNIVERSAL_CMDS, qcf1: 'qcf1', qcf2: 'qcf2', '41': '41' },
  spoke: { ...COMMON_SPOKE, RK: ['qcf1'] },
  resName: '감시망',
  resMax: 100,
  resInit: [0, 0],
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
    init(_s, f) {
      // res[0]: 감시망 0~100, res[1]: 충전용 프레임 카운터
      f.res = [0, 0];
    },
    tick(s, f) {
      if (s.phase !== 'fight' || f.buffs.briefing > 0) return;
      f.res[1]++;
      if (f.res[1] >= 8) {
        f.res[1] = 0;
        f.res[0]++;
      }
      if (f.res[0] >= 100) {
        f.res[0] = 0;
        f.buffs.briefing = WATCH_TIME;
        emit(s, { k: 'special', who: f.idx, name: '감시망 가동 — 상대 기술 예고' });
      }
    },
    onHit(_s, att) {
      if (att.buffs.briefing <= 0) att.res[0] = Math.min(100, att.res[0] + 4);
    },
    onMoveFrame(s, f, o, m) {
      if (m.id !== '41') return;
      if (f.mf === OFFLINE_FROM) {
        f.buffs.hidden = OFFLINE_TO - OFFLINE_FROM + 1;
        emit(s, { k: 'special', who: f.idx, name: '장기 오프라인…' });
      }
      if (f.mf === OFFLINE_TO) {
        // 상대 뒤로 다시 나타난다
        const lim = ARENA - BODY_R;
        f.x = clamp(o.x - idiv(o.fx * 750, 1000), -lim, lim);
        f.z = clamp(o.z - idiv(o.fz * 750, 1000), -lim, lim);
        faceOpponent(f, o);
        // 등 뒤를 잡힌 상대는 잠깐 돌아서지도, 막지도 못한다 (시진핑 회복 18F + 잽 발생보다 길게)
        o.buffs.backTurn = 34;
        emit(s, { k: 'special', who: f.idx, name: '등 뒤를 잡았다!' });
      }
    },
    spawn(s, f, _o, kind) {
      if (kind === 'drone') drones(s, f, 3, false);
      else if (kind === 'droneEx') drones(s, f, 5, true);
      else if (kind === 'firewall') {
        // 방벽은 한 번에 하나만
        for (const p of s.projs) if (p.owner === f.idx && p.kind === 'firewall') p.done = true;
        spawnProj(s, {
          owner: f.idx, kind: 'firewall',
          x: f.x + idiv(f.fx * 1100, 1000), z: f.z + idiv(f.fz * 1100, 1000),
          tx: f.fx, tz: f.fz, life: 300, radius: 480,
        });
      }
    },
    ultTick(_s, _f, _o, c) {
      // 붉은 벽 높이 (mm)
      c.v = Math.min(3000, c.t * 40);
    },
    ultApply(s, _f, o) {
      dealDamage(s, o, 300);
      o.buffs.cage = 240;
      o.buffs.cageX = o.x;
      o.buffs.cageZ = o.z;
    },
  },
  moveList: [
    { cmd: '↓↘→ + LP', name: '드론 편대', desc: '드론 3대가 차례로 공격 (상단 투사체 — 앉으면 피함)' },
    { cmd: '↓↘→ + RP', name: '연산 방벽 설치', desc: '5초간 앞쪽에 붉은 방벽. 투사체와 접근을 막는다 (하나만 유지)' },
    { cmd: '← + LP', name: '장기 오프라인', desc: '잠적해 공격을 무시하다가 상대 뒤에 다시 나타난다. 끝 틈이 큼' },
    { cmd: 'LK+RK', name: '드론 일제 출격 (EX)', desc: '드론 5대, 중단 판정, 마지막 드론 다운' },
    { cmd: 'LP+RP', name: '궁극기: 디지털 만리방벽', desc: '붉은 벽으로 가두고 드론 일제 사격. 30% 피해 + 4초간 좁은 구역에 갇힘' },
    { cmd: '고유', name: '감시망', desc: '시간이 지나거나 때리면 차오른다. 가득 차면 6초간 상대 기술이 미리 보인다' },
    ...COMMON_LIST,
  ],
  combos: [
    { name: '드론 편대', inputs: '↓↘→LP (3타)', seq: ['drone', 'drone', 'drone'] },
    { name: '띄우기 콤보', inputs: '↘RP → LP, RP', seq: ['32', '51', '12'] },
    { name: '드론 일제 출격', inputs: 'LK+RK (5타)', seq: ['drone', 'drone', 'drone', 'drone', 'drone'] },
  ],
  look: {
    skin: 0xefcfa6, suit: 0x23262d, shirt: 0xffffff, tie: 0xc0212b, pants: 0x23262d,
    hair: 0x0e0e10, hairStyle: 'neat', headScale: 1.06, bodyW: 1.1, belly: 1.2, height: 0.98, accent: 0xffc928,
    face: 'xi', collar: 'tie', pin: 'red',
  },
  theme: { root: 50, scale: [0, 2, 4, 7, 9], tempo: 100 },
};

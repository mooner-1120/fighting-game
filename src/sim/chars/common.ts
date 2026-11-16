import type { MoveListEntry } from '../chardef';
import { hit } from '../moves';
import type { MoveDef } from '../types';

export function ultMove(name: string): MoveDef {
  return {
    id: 'ult', name, total: 75, anim: 'ult', ult: true, invuln: [1, 12],
    hits: [hit(18, 4, 0, 'm', 1550, -30, 0, { width: 480, tag: 'ult' })],
  };
}

export const COMMON_SPOKE = {
  LP: ['51', '12', '123'],
  RP: ['32', '51', '12', '123'],
  LK: ['qcf1'],
  RK: ['qcf2'],
};

export const COMMON_LIST: MoveListEntry[] = [
  { cmd: 'LP, RP, LK', name: '원투 미들킥', desc: '기본 3연타 콤보 (상·상·중)' },
  { cmd: '↘ + RP', name: '어퍼컷', desc: '띄우기 기술. 맞으면 공중 콤보' },
  { cmd: '→ + RP', name: '돌진 훅', desc: '카운터 히트 시 띄우기' },
  { cmd: '← + RK', name: '추적 하이킥', desc: '횡이동을 따라가는 기술' },
  { cmd: '↓ + RK', name: '다리 후리기', desc: '하단, 맞으면 다운' },
  { cmd: '↗ + RK', name: '점프 니킥', desc: '하단을 피하며 띄우기' },
  { cmd: 'LP+LK / RP+RK', name: '잡기', desc: 'LP 잡기는 LP, RP 잡기는 RP로 풀기' },
  { cmd: 'LK+RK', name: '강화기 (EX)', desc: '권력 게이지 1칸 소모' },
  { cmd: 'LP+RP', name: '궁극기', desc: '권력 게이지 3칸, 라운드당 1회' },
  { cmd: 'LP+RK', name: '비상 담화', desc: '체력 25% 이하에서 라운드당 1회, 아머 반격기' },
  { cmd: '↑ / ↓ 탭', name: '횡이동', desc: '직선 기술을 피한다' },
  { cmd: '→→ / ←←', name: '대시 / 백대시', desc: '' },
];

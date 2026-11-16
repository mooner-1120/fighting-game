// 결정론적 시뮬레이션에서 쓰는 모든 상태 타입.
// 규칙: 모든 수치는 정수(mm, mm/frame, 프레임)로만 다룬다. 부동소수점 금지.

// ---- 입력 비트 (원시 입력: 화면 기준 절대 방향) ----
export const IN_UP = 1;
export const IN_DOWN = 2;
export const IN_LEFT = 4;
export const IN_RIGHT = 8;
export const BTN_LP = 16;
export const BTN_RP = 32;
export const BTN_LK = 64;
export const BTN_RK = 128;
export const BTN_ALL = BTN_LP | BTN_RP | BTN_LK | BTN_RK;

// ---- 상대 입력 비트 (캐릭터 기준: 앞/뒤/안쪽/바깥쪽) ----
export const R_U = 1; // 화면 안쪽 (사이드스텝 인)
export const R_D = 2; // 아래 (앉기)
export const R_B = 4; // 뒤
export const R_F = 8; // 앞

export type CharId = 'volkov' | 'rex' | 'kang' | 'seo';
export const CHAR_IDS: CharId[] = ['volkov', 'rex', 'kang', 'seo'];

export type HitLevel = 'h' | 'm' | 'l';

export interface HitDef {
  f: number; // 발생 프레임 (1부터)
  len: number; // 지속 프레임
  dmg: number;
  lvl: HitLevel;
  reach: number; // mm
  width?: number; // 측면 판정 폭 mm
  onHit: number; // 히트 시 이득 프레임
  onBlock: number; // 가드 시 이득 프레임
  kb?: number; // 넉백 속도
  launch?: number; // 띄우기 vy
  kd?: boolean; // 다운
  chLaunch?: number; // 카운터 시 띄우기
  chKd?: boolean;
  wallSplat?: boolean;
  bounce?: boolean; // 바운드(지상 피격도 띄움)
  heavy?: boolean;
  tag?: string; // 훅에서 쓰는 식별자
}

export interface ThrowDef {
  f: number;
  reach: number;
  dmg: number;
  breakBtn: 'L' | 'R' | 'any' | 'none';
  mid?: boolean; // 앉은 상대도 잡음
  dur: number; // 연출 길이
  tag?: string;
}

export interface CancelDef {
  btn: number; // 버튼 비트
  dir?: number; // 숫자패드 방향, 생략 시 무관
  to: string;
}

export interface ProjSpawn {
  f: number;
  kind: string;
}

export interface MoveDef {
  id: string;
  name: string;
  total: number;
  anim: string;
  hits: HitDef[];
  throw?: ThrowDef;
  advance?: [number, number, number][]; // [시작F, 끝F, 전진속도]
  track?: boolean; // 발생 전까지 상대를 따라 회전
  crouch?: boolean; // 앉은 판정
  airborne?: [number, number]; // 하단 회피 구간
  armor?: [number, number];
  invuln?: [number, number];
  counter?: [number, number]; // 반격 자세 구간
  cancels?: CancelDef[];
  proj?: ProjSpawn;
  cost?: number; // 권력 게이지 소모
  ult?: boolean;
  emergency?: boolean;
  noTurn?: boolean;
}

export type FState =
  | 'idle'
  | 'walkf'
  | 'walkb'
  | 'crouch'
  | 'side'
  | 'dash'
  | 'bdash'
  | 'jump'
  | 'atk'
  | 'hs' // 피격 경직
  | 'bs' // 가드 경직
  | 'air' // 공중 피격(콤보)
  | 'down'
  | 'getup'
  | 'wall'
  | 'throwing'
  | 'thrown'
  | 'ult'
  | 'ko'
  | 'win';

export interface Buffs {
  armor: number; // 남은 프레임
  atkUp: number;
  slow: number;
  tariff: number;
  briefing: number;
}

export interface Fighter {
  idx: number;
  char: CharId;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  y: number;
  vy: number;
  vx: number; // 넉백/이동 속도 (월드)
  vz: number;
  fx: number; // 바라보는 방향 (단위벡터 * 1000)
  fz: number;
  st: FState;
  sf: number; // 상태 경과 프레임
  sd: number; // 상태 길이
  crouching: boolean;
  move: string | null;
  mf: number;
  hitMask: number;
  connected: number; // 0 없음, 1 히트, 2 가드
  queued: string | null;
  sideDir: number;
  jumpDir: number;
  gauge: number;
  ultUsed: boolean;
  emergencyUsed: boolean;
  combo: number; // 피격 콤보 수
  comboDmg: number;
  comboMoves: string[];
  airHits: number;
  wallHits: number;
  buffs: Buffs;
  res: number[]; // 캐릭터 고유 자원 슬롯
  hist: number[]; // 상대 입력 기록 (0 = 최신)
  raw: number; // 직전 원시 입력
  downTapT: number; // 아래 탭 사이드스텝 판정용
  buf: number; // 경직 중 눌린 버튼 (선입력)
  bufT: number;
  throwInfo: { breakBtn: string; until: number; dmg: number; tag: string; partner: number } | null;
  spoke: boolean;
  lastMove: { id: string; startup: number; onBlock: number; onHit: number } | null;
  dmgTaken: number;
}

export interface Proj {
  id: number;
  owner: number;
  kind: string;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  life: number;
  t: number;
  dmg: number;
  lvl: HitLevel;
  radius: number;
  onBlock: number;
  onHit: number;
  kd: boolean;
  launch: number;
  done: boolean;
  tx: number;
  tz: number;
}

export interface Cine {
  owner: number;
  char: CharId;
  t: number;
  dur: number;
  fail: boolean;
  dmg: number;
}

export type GameEvent =
  | { k: 'hit'; who: number; x: number; y: number; z: number; heavy: boolean; ch: boolean; dmg: number }
  | { k: 'block'; who: number; x: number; y: number; z: number }
  | { k: 'whiff'; who: number }
  | { k: 'throw'; who: number }
  | { k: 'break'; who: number }
  | { k: 'wall'; who: number; x: number; z: number }
  | { k: 'land'; who: number }
  | { k: 'ko'; who: number }
  | { k: 'round'; n: number }
  | { k: 'fight' }
  | { k: 'roundEnd'; winner: number; perfect: boolean; timeout: boolean }
  | { k: 'matchEnd'; winner: number }
  | { k: 'ultStart'; who: number }
  | { k: 'cine'; who: number; fail: boolean }
  | { k: 'emergency'; who: number }
  | { k: 'parry'; who: number }
  | { k: 'proj'; who: number; kind: string }
  | { k: 'boom'; x: number; z: number }
  | { k: 'heal'; who: number; amt: number }
  | { k: 'special'; who: number; name: string }
  | { k: 'counter'; who: number };

export interface MatchConfig {
  chars: [CharId, CharId];
  stage: number;
  rounds: number; // 선승 수
  timer: number; // 초
  spokesman: [boolean, boolean];
  seed: number;
  noGuard?: [boolean, boolean]; // 트레이닝 더미용
  guardBack?: boolean; // true: 뒤를 눌러야 가드 (스트리트 파이터식), false/없음: 가만히 있으면 자동 가드 (철권식)
}

export interface GameState {
  frame: number;
  cfg: MatchConfig;
  phase: 'intro' | 'fight' | 'roundEnd' | 'matchEnd';
  pt: number; // 페이즈 경과
  round: number;
  wins: [number, number];
  timer: number; // 남은 프레임
  f: [Fighter, Fighter];
  side: number; // 1이면 f[0]이 화면 왼쪽
  projs: Proj[];
  nextId: number;
  rng: number;
  cine: Cine | null;
  hitstop: number;
  ev: GameEvent[];
  winner: number; // -1 미정
  lastRoundWinner: number;
}

export const FRAME_RATE = 60;
export const ARENA = 5200; // 경기장 반지름(정사각형 반 변) mm
export const BODY_R = 260;

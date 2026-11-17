import type { CharId, Cine, Fighter, GameState, HitDef, MoveDef } from './types';

export interface MoveListEntry {
  cmd: string;
  name: string;
  desc: string;
}

export interface ComboChallenge {
  name: string;
  inputs: string; // 표시용
  seq: string[]; // 콤보 안에 순서대로 나와야 하는 기술 id
}

export interface CharHooks {
  init?(s: GameState, f: Fighter): void;
  tick?(s: GameState, f: Fighter): void;
  /** false 반환 시 기술 취소 */
  onMoveStart?(s: GameState, f: Fighter, m: MoveDef): boolean;
  onMoveFrame?(s: GameState, f: Fighter, o: Fighter, m: MoveDef): void;
  /** 공격자 데미지 배율(%) */
  dmgMul?(s: GameState, f: Fighter, h: HitDef | null, moveId: string): number;
  onHit?(s: GameState, att: Fighter, def: Fighter, moveId: string, dmg: number, ch: boolean): void;
  onHurt?(s: GameState, f: Fighter, dmg: number): void;
  onThrow?(s: GameState, att: Fighter, def: Fighter, moveId: string): void;
  throwBreak?(s: GameState, att: Fighter, moveId: string, base: 'L' | 'R' | 'any' | 'none'): 'L' | 'R' | 'any' | 'none';
  spawn?(s: GameState, f: Fighter, o: Fighter, kind: string): void;
  ultDecide?(s: GameState, f: Fighter, o: Fighter, cine: Cine): void;
  ultApply(s: GameState, f: Fighter, o: Fighter, cine: Cine): void;
  /** 궁극기 연출 매 프레임 (cine.v 갱신 등) */
  ultTick?(s: GameState, f: Fighter, o: Fighter, cine: Cine): void;
  /** 궁극기 연출이 끝나고 기본 처리(상대 띄우기 등)가 끝난 뒤 호출 */
  ultAfter?(s: GameState, f: Fighter, o: Fighter, cine: Cine): void;
  /** 캐릭터 고유 명령. 기술 id 를 돌려주면 그 기술을 쓴다. pr = 최근 눌린 버튼 */
  customCmd?(s: GameState, f: Fighter, o: Fighter, pr: number): string | null;
  /** 이동 속도 배율(%) — 걷기·대시 */
  speedMul?(s: GameState, f: Fighter): number;
  /** 가드 성공 시. just = 저스트 가드(직전 몇 F 안에 뒤 입력). 돌려준 값만큼 가드 경직이 줄어든다 */
  onGuard?(s: GameState, f: Fighter, att: Fighter, just: boolean): number;
}

export interface CharLook {
  skin: number;
  suit: number;
  shirt: number;
  tie: number;
  pants: number;
  hair: number;
  hairStyle: 'bald' | 'swoop' | 'fade' | 'neat' | 'helmet' | 'curly';
  headScale: number;
  bodyW: number; // 상체 폭 배율
  belly: number;
  height: number;
  glasses?: boolean;
  medals?: boolean;
  face?: 'putin' | 'trump' | 'kim' | 'lee'; // 인물별 캐리커처 얼굴
  collar?: 'tie' | 'mao'; // mao: 넥타이 없는 인민복 칼라
  pin?: 'us' | 'kr' | 'red'; // 옷깃 배지
  accent: number;
}

export interface CharDef {
  id: CharId;
  name: string;
  country: string;
  title: string;
  style: string;
  maxHp: number;
  walkF: number;
  walkB: number;
  dmg: number; // 기본 데미지 배율(%)
  moves: Record<string, MoveDef>;
  cmds: Record<string, string>;
  spoke: { LP: string[]; RP: string[]; LK: string[]; RK: string[] };
  resName: string;
  resMax: number;
  resInit: number[];
  ultName: string;
  ultHeadline: string;
  ultTicker: string[];
  ultLine: string;
  winLine: string;
  loseLine: string;
  hooks: CharHooks;
  moveList: MoveListEntry[];
  combos: ComboChallenge[];
  look: CharLook;
  theme: { root: number; scale: number[]; tempo: number };
}

import {
  BTN_ALL,
  IN_DOWN,
  IN_LEFT,
  IN_RIGHT,
  IN_UP,
  R_B,
  R_D,
  R_F,
  R_U,
} from './types';

export const HIST_LEN = 24;

/** 원시 입력(화면 기준)을 캐릭터 기준 입력으로 바꾼다. onLeft: 화면 왼쪽에 있으면 오른쪽이 '앞' */
export function toRelative(raw: number, onLeft: boolean): number {
  let r = raw & BTN_ALL;
  if (raw & IN_UP) r |= R_U;
  if (raw & IN_DOWN) r |= R_D;
  const right = (raw & IN_RIGHT) !== 0;
  const left = (raw & IN_LEFT) !== 0;
  if (right && !left) r |= onLeft ? R_F : R_B;
  if (left && !right) r |= onLeft ? R_B : R_F;
  return r;
}

/** 숫자패드 방향 (5=중립, 6=앞, 4=뒤, 2=아래, 8=위 ...) */
export function dirOf(rel: number): number {
  const u = (rel & R_U) !== 0;
  const d = (rel & R_D) !== 0 && !u;
  const f = (rel & R_F) !== 0;
  const b = (rel & R_B) !== 0 && !f;
  if (u) return f ? 9 : b ? 7 : 8;
  if (d) return f ? 3 : b ? 1 : 2;
  return f ? 6 : b ? 4 : 5;
}

export function pressed(hist: number[], bits: number): boolean {
  return (hist[0] & bits) !== 0 && (hist[1] & bits) === 0;
}

/** 최근 n프레임 안에 새로 눌린 버튼들 (현재 누르고 있는 것만) */
export function recentPresses(hist: number[], n: number): number {
  let out = 0;
  for (let i = 0; i < n && i + 1 < hist.length; i++) {
    out |= hist[i] & ~hist[i + 1];
  }
  return out & hist[0] & BTN_ALL;
}

/** ↓↘→ 커맨드 확인 (최근 14프레임) */
export function hasQcf(hist: number[]): boolean {
  let stage = 0; // 0: 6이나 3 찾기, 1: 3 찾기, 2: 2 찾기
  for (let i = 0; i < 14 && i < hist.length; i++) {
    const d = dirOf(hist[i]);
    if (stage === 0) {
      if (d === 6) stage = 1;
      else if (d === 3) stage = 2;
      else if (i > 3) return false;
    } else if (stage === 1) {
      if (d === 3) stage = 2;
    } else if (stage === 2) {
      if (d === 2 || d === 1) return true;
    }
  }
  return false;
}

/** 방향 두 번 탭 (→→ 또는 ←←) */
export function hasDoubleTap(hist: number[], bit: number): boolean {
  if (!((hist[0] & bit) && !(hist[1] & bit))) return false;
  let sawRelease = false;
  for (let i = 1; i < 12 && i < hist.length; i++) {
    if (!(hist[i] & bit)) sawRelease = true;
    else if (sawRelease) return true;
  }
  return false;
}

export function pushHist(hist: number[], rel: number): void {
  for (let i = hist.length - 1; i > 0; i--) hist[i] = hist[i - 1];
  hist[0] = rel;
}

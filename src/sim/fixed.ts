// 결정론 보장용 정수 수학 도구.

/** 정수 나눗셈 (0 방향 절사) */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** 정수 제곱근 (내림) */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** (dx, dz)를 길이 1000짜리 정수 벡터로 정규화 */
export function norm1000(dx: number, dz: number): [number, number] {
  const len = isqrt(dx * dx + dz * dz);
  if (len === 0) return [1000, 0];
  return [idiv(dx * 1000, len), idiv(dz * 1000, len)];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** xorshift32 — 상태를 받아 [다음 상태, 0..9999 값] 반환 */
export function rngNext(s: number): [number, number] {
  let x = s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x = x | 0;
  const v = ((x >>> 0) % 10000);
  return [x === 0 ? 0x1234567 : x, v];
}

/** 상태 체크섬 (FNV-1a over JSON) */
export function checksum(obj: unknown): number {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

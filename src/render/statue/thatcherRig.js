// 마거릿 대처: 여성 정장 조각상(chimerefls013, 손을 허리에 얹은 자세)의 원래 머리·윗가슴을 잘라 내고
// 대처 흉상(MakerWorld, Julien Mairy)을 얹은 모델에 뼈대를 심는다. 몸이 짝다리라 왼쪽·오른쪽 관절을 따로 잰다.
// 좌표: 미터, Y 위, +Z 앞, 캐릭터의 왼쪽 = +X
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- 관절 (부위 단면 측정값)
export const J = {
  root: [0, 0.9, 0.03],
  spine: [0, 1.05, 0.0],
  chest: [0, 1.22, -0.01],
  neck: [0, 1.42, -0.01],
  head: [0, 1.49, 0.0],
  headTop: [0, 1.74, 0.0],
  L_sh: [0.165, 1.33, -0.03], L_el: [0.285, 1.18, -0.045], L_wr: [0.19, 1.034, 0.042], L_tip: [0.115, 1.02, 0.045],
  R_sh: [-0.155, 1.33, -0.02], R_el: [-0.262, 1.2, -0.042], R_wr: [-0.184, 1.04, 0.04], R_tip: [-0.1, 1.036, 0.064],
  L_hip: [0.08, 0.86, 0.0], L_knee: [0.047, 0.481, -0.041], L_ank: [0.027, 0.095, -0.063], L_toe: [0.06, 0.015, 0.07],
  R_hip: [-0.08, 0.86, 0.08], R_knee: [-0.085, 0.482, 0.146], R_ank: [-0.079, 0.095, 0.117], R_toe: [-0.12, 0.015, 0.24],
};

const BONES = [
  ['root', null, 'root', 'spine'],
  ['spine', 'root', 'spine', 'chest'],
  ['chest', 'spine', 'chest', 'neck'],
  ['neck', 'chest', 'neck', 'head'],
  ['head', 'neck', 'head', 'headTop'],
];
for (const s of ['L', 'R']) {
  BONES.push(
    [s + '_upper', 'chest', s + '_sh', s + '_el'],
    [s + '_fore', s + '_upper', s + '_el', s + '_wr'],
    [s + '_hand', s + '_fore', s + '_wr', s + '_tip'],
    [s + '_thigh', 'root', s + '_hip', s + '_knee'],
    [s + '_shin', s + '_thigh', s + '_knee', s + '_ank'],
    [s + '_foot', s + '_shin', s + '_ank', s + '_toe'],
  );
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function segDist(p, a, b) {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/** 팔·손 소속 판정: 팔이 굽어 있어서(허리에 손) 팔 중심선까지의 3D 거리로 본다.
 *  몸통 쪽(안쪽)은 좁게, 바깥쪽은 넉넉히 — 허리에 닿은 손바닥·옆구리에 붙은 팔 안쪽만 깔끔히 떼어 낸다 */
const ARM_LINE = {
  L: [J.L_sh, J.L_el, J.L_wr, J.L_tip].map(v3),
  R: [J.R_sh, J.R_el, J.R_wr, J.R_tip].map(v3),
};
export function limbOf(p) {
  if (p.y > 1.36 || p.y < 0.95) return null;
  const P = new THREE.Vector3(p.x, p.y, p.z);
  const line = ARM_LINE[p.x >= 0 ? 'L' : 'R'];
  let best = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], ab = line[i + 1].clone().sub(a);
    const t = Math.max(0, Math.min(1, P.clone().sub(a).dot(ab) / ab.lengthSq()));
    const c = a.clone().addScaledVector(ab, t);
    const d = P.distanceTo(c);
    if (!best || d < best.d) best = { d, c, i, t };
  }
  if (best.i === 0 && best.t < 0.12) return null; // 어깨 꼭대기는 몸통(흉상)으로
  const hand = best.i === 2 || (best.i === 1 && best.t > 0.88);
  const off = P.clone().sub(best.c);
  const inward = new THREE.Vector3(-best.c.x, 0, -best.c.z).normalize();
  const di = off.dot(inward);
  const perp = Math.sqrt(Math.max(0, off.lengthSq() - di * di));
  const rin = di > 0 ? (hand ? 0.028 : 0.05) : (hand ? 0.07 : 0.11);
  const rp = hand ? 0.05 : 0.075;
  return (di / rin) ** 2 + (perp / rp) ** 2 <= 1 ? (hand ? 'hand' : 'arm') : null;
}

/** 위치로 후보 뼈와 배율 결정 (팔이 몸통에 붙어 있고 손이 허벅지 옆에 있는 조각상) */
function candidates(cat, p, label) {
  const s = p.x >= 0 ? 'L' : 'R';
  const o = s === 'L' ? 'R' : 'L';
  const ax = Math.abs(p.x);
  if (cat === 'bust') {
    // 흉상: 머리 / 목 / 옷깃·어깨 (어깨 끝은 위팔을 조금 따라감)
    if (p.y > 1.47) return [['head', 1], ['neck', 0.4]];
    if (p.y > 1.4) return [['head', 1], ['neck', 1], ['chest', 0.5]];
    const c = [['chest', 1], ['neck', 0.6], ['spine', 0.3]];
    if (ax > 0.12) c.push([s + '_upper', 0.25 + (ax - 0.12) * 4]);
    return c;
  }
  const limb = label === undefined ? limbOf(p) : [null, 'arm', 'hand', 'arm', 'hand', null, null][label];
  if (limb === 'hand') return { sharp: true, list: [[s + '_hand', 1], [s + '_fore', 0.6]] };
  if (limb === 'arm') {
    const c = [[s + '_upper', 1], [s + '_fore', 1], [s + '_hand', 0.4]];
    return { sharp: true, list: c };
  }
  // 다리
  if (p.y < 0.8) {
    const ls = label === 5 ? 'L' : label === 6 ? 'R' : legOf(p.x, p.y, p.z);
    const c = [[ls + '_thigh', 1], [ls + '_shin', 1], [ls + '_foot', 1]];
    if (p.y < 0.76) return c;
    if (ax < 0.03) c.push([o + '_thigh', 0.6], ['root', 0.6]);
    return c;
  }
  const c = [['root', 1], ['spine', 1], ['chest', 1], ['neck', 0.7]];
  // 어깨 윗부분만 팔을 조금 따라가게
  if (p.y < 0.92) c.push([s + '_thigh', 0.5 + (0.92 - p.y) * 3]);
  return c;
}

/** 조각상에 색이 없어서 부위별로 칠한다. 규칙은 JS(GLB 정점 색)와 GLSL(화면) 양쪽에서 쓰는 공통 문법으로 한 번만 쓴다.
 *  색 번호: 0 파란 정장, 1 피부, 2 흰 블라우스, 3 진주, 4 구두, 5 금발.  lb = 9 는 흉상
 *  (흉상 좌표: 턱 y≈1.465, 목 중심 z≈-0.005) */
const BODY_COLORS = [0x1f4ea0, 0xf0cdb6, 0xfaf7f0, 0xf3eee2, 0x15110f, 0xd9bd7c].map((c) => new THREE.Color(c));
const COLOR_RULES = `
  if (lb > 8.5) {
    float hz = z + 0.005;
    // 얼굴(앞쪽, 폭 8cm, 이마 1.612까지)과 목(1.47 아래)은 피부, 나머지 머리 위쪽은 금발
    float face = (hz > -0.015 && ax < 0.08 && y < 1.612) ? 1.0 : 0.0;
    if (y > 1.405) kk = (y < 1.47 || face > 0.5) ? 1.0 : 5.0;
    else kk = 0.0;
    // 블라우스 리본·깃: 앞쪽 가운데, 아래로 갈수록 좁아짐
    if (y < 1.43 && hz > 0.02) {
      float w = 0.025 + (y - 1.25) * 0.42;
      if (ax < w) kk = 2.0;
    }
    if (y < 1.405 && y > 1.36 && hz > -0.04 && ax < 0.09) kk = 2.0;   // 목 둘레 깃
    // 진주 귀걸이
    if (y > 1.492 && y < 1.522 && ax > 0.06 && ax < 0.092 && abs(hz) < 0.035) kk = 3.0;
  } else {
    if (y < 0.08) kk = 4.0;
    // 손: 손목에서 손끝 쪽만 피부 (소맷부리는 정장색)
    else if (lb == 2.0 && (x - 0.19) * -0.983 + (y - 1.034) * -0.183 + (z - 0.042) * 0.039 > -0.004) kk = 1.0;
    else if (lb == 4.0 && (x + 0.184) * 0.961 + (y - 1.04) * -0.046 + (z - 0.04) * 0.275 > -0.004) kk = 1.0;
  }
`;
const colorKeyFn = new Function('x', 'y', 'z', 'lb',
  
  'const abs = Math.abs, len2 = Math.hypot; const ax = abs(x); const r = len2(x, z - 0.02); let kk = 0.0;' +
  COLOR_RULES.replace(/float /g, 'let ') + 'return kk;');
function colorKey(x, y, z, label) {
  return Math.round(colorKeyFn(x, y, z, label));
}
/** 같은 규칙을 조각 셰이더에서 (원래 자세 좌표 rest 기준) */
export function bodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, name: 'body' });
  const pal = BODY_COLORS.map((c) => `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`).join(',');
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute vec3 rest;\nattribute float lab;\nvarying vec3 vRest;\nvarying float vLab;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest; vLab = lab;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying vec3 vRest;\nvarying float vLab;\nfloat len2(float a, float b) { return length(vec2(a, b)); }\n#include <common>')
      .replace('#include <color_fragment>', `
        { float x = vRest.x, y = vRest.y, z = vRest.z; float ax = abs(x); float r = len2(x, z - 0.02);
          float lb = floor(vLab + 0.5); float kk = 0.0;
          ${COLOR_RULES}
          vec3 pal[${BODY_COLORS.length}] = vec3[${BODY_COLORS.length}](${pal});
          diffuseColor.rgb *= pal[int(kk + 0.5)]; }`);
  };
  return m;
}

/** 삼각형마다 색 하나 (무게중심 기준). 색이 다른 이웃과는 정점을 복제해 경계를 또렷하게 한다 */
function colorSplit(pos, idx, lab, nrm) {
  const n0 = pos.length / 3;
  const vcol = new Array(n0).fill(-1);
  const dup = new Map();
  const col = [];
  for (let t = 0; t < idx.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      cx += pos[v * 3] / 3; cy += pos[v * 3 + 1] / 3; cz += pos[v * 3 + 2] / 3;
    }
    const c = colorKey(cx, cy, cz, lab[idx[t]]);
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      if (vcol[v] === -1) vcol[v] = c;
      if (vcol[v] === c) continue;
      const key = v * 8 + c;
      let nv = dup.get(key);
      if (nv === undefined) {
        nv = pos.length / 3;
        pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        lab.push(lab[v]);
        vcol.push(c);
        dup.set(key, nv);
      }
      idx[t + k] = nv;
    }
  }
  for (let v = 0; v < vcol.length; v++) {
    const k = BODY_COLORS[Math.max(0, vcol[v])];
    col.push(k.r, k.g, k.b);
  }
  return col;
}

/** 눈동자: 눈알 앞쪽 정점을 홍채·동공 색으로 칠한다 (텍스처가 없어서) */
function eyeColors(part, geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  c.divideScalar(n);
  let r = 0;
  for (let i = 0; i < n; i++) r = Math.max(r, new THREE.Vector3().fromBufferAttribute(pos, i).distanceTo(c));
  const white = new THREE.Color(0xf3f1ec), iris = new THREE.Color(0x3b2717), pupil = new THREE.Color(0x0a0705);
  for (let i = 0; i < n; i++) {
    const f = (pos.getZ(i) - c.z) / r;
    const k = f > 0.9 ? pupil : f > 0.62 ? iris : white;
    col.set([k.r, k.g, k.b], i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  void part;
}

const MAT = {
  skin: [0xf0cdb0, 0.65], skinHand: [0xf0cdb0, 0.65], hair: [0x121212, 0.75], teeth: [0xf4f1e8, 0.4],
  jacket: [0x2b2c31, 0.72], pants: [0x2b2c31, 0.72], button: [0x5d5d63, 0.35], shoe: [0x0c0c0e, 0.3],
};

/** 손이 허벅지에, 팔이 옆구리에 붙어 있으므로 경계 삼각형을 다수 쪽에 붙이고 나머지 정점은 복제해 떼어 낸다 */
const LABELS = { body: 0, L_arm: 1, L_hand: 2, R_arm: 3, R_hand: 4, L_leg: 5, R_leg: 6 };
const LEG_LINE = {
  L: [J.L_hip, J.L_knee, J.L_ank, J.L_toe].map(v3),
  R: [J.R_hip, J.R_knee, J.R_ank, J.R_toe].map(v3),
};
function lineDist(P, line) {
  let d = 9;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(P, line[i], line[i + 1]));
  return d;
}
/** 다리: 어느 다리 중심선에 더 가까운지로 나눈다 (짝다리라 x 부호로는 안 됨) */
function legOf(x, y, z) {
  const P = new THREE.Vector3(x, y, z);
  return lineDist(P, LEG_LINE.L) <= lineDist(P, LEG_LINE.R) ? 'L' : 'R';
}
function labelOf(x, y, z) {
  if (y < 0.76) return LABELS[legOf(x, y, z) + '_leg'];
  const l = limbOf({ x, y, z });
  return l ? LABELS[(x >= 0 ? 'L_' : 'R_') + l] : 0;
}
function splitLimbs(p0, i0) {
  const pos = Array.from(p0);
  const idx = Array.from(i0);
  const n0 = pos.length / 3;
  const lab = [];
  for (let v = 0; v < n0; v++) lab.push(labelOf(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
  // 라벨 다듬기: 이웃 정점 다수결을 몇 번 반복해 경계의 자잘한 조각을 없앤다
  const nb = Array.from({ length: n0 }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  for (let it = 0; it < 4; it++) {
    const next = lab.slice();
    for (let v = 0; v < n0; v++) {
      const cnt = new Map([[lab[v], 1.5]]);
      for (const u of nb[v]) cnt.set(lab[u], (cnt.get(lab[u]) || 0) + 1);
      let best = lab[v], bc = -1;
      for (const [k, c] of cnt) if (c > bc) { best = k; bc = c; }
      next[v] = best;
    }
    for (let v = 0; v < n0; v++) lab[v] = next[v];
  }
  // 팔·손 라벨마다 가장 큰 덩어리만 남긴다 (손 옆 허벅지·재킷 자락 조각이 손을 따라가지 않게)
  const comp = new Int32Array(n0).fill(-1);
  const sizes = [];
  for (let v = 0; v < n0; v++) {
    if (lab[v] === 0 || comp[v] !== -1) continue;
    const id = sizes.length;
    let sz = 0;
    const st = [v];
    comp[v] = id;
    while (st.length) {
      const u = st.pop();
      sz++;
      for (const w of nb[u]) if (comp[w] === -1 && lab[w] === lab[v]) { comp[w] = id; st.push(w); }
    }
    sizes.push([lab[v], sz]);
  }
  const best = {};
  sizes.forEach(([l, sz], id) => { if (best[l] === undefined || sz > sizes[best[l]][1]) best[l] = id; });
  for (let v = 0; v < n0; v++) if (lab[v] !== 0 && best[lab[v]] !== comp[v]) lab[v] = 0;
  const dup = new Map();
  const other = new Map(); // 잘린 자리 정점 → 맞은편 라벨
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const l = v.map((k) => lab[k]);
    if (l[0] === l[1] && l[1] === l[2]) continue;
    // 다수 라벨 (모두 다르면 팔·손 쪽)
    const want = l[0] === l[1] || l[0] === l[2] ? l[0] : l[1] === l[2] ? l[1] : Math.max(...l);
    for (let k = 0; k < 3; k++) {
      if (l[k] === want) continue;
      const key = v[k] * 8 + want;
      let nv = dup.get(key);
      if (nv === undefined) {
        nv = pos.length / 3;
        pos.push(pos[v[k] * 3], pos[v[k] * 3 + 1], pos[v[k] * 3 + 2]);
        lab.push(want);
        dup.set(key, nv);
        other.set(nv, lab[v[k]]);
        other.set(v[k], want);
      }
      idx[t + k] = nv;
    }
  }
  const caps = capHoles(pos, idx, lab, other);
  return { pos, idx, lab, caps };
}

/** 잘라 낸 자리(열린 테두리)를 막는다: 테두리 고리마다 가운데 점을 하나 두고 부채꼴로 채운다.
 *  막는 면은 정점을 따로 복제해 써서 원래 표면의 법선(음영)에 영향을 주지 않는다. */
function capHoles(pos, idx, lab, other) {
  const nTri = idx.length;
  const cnt = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < nTri; t += 3) {
    for (let k = 0; k < 3; k++) {
      const kk = key(idx[t + k], idx[t + ((k + 1) % 3)]);
      cnt.set(kk, (cnt.get(kk) || 0) + 1);
    }
  }
  // 열린 테두리: 삼각형 하나에만 속한 모서리. 막는 면은 반대 방향(b→a)으로 감는다
  const next = new Map();
  for (let t = 0; t < nTri; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + ((k + 1) % 3)];
      if (cnt.get(key(a, b)) === 1) next.set(b, a);
    }
  }
  const used = new Set();
  const caps = [];
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let v = start;
    while (v !== undefined && !used.has(v)) {
      used.add(v);
      loop.push(v);
      v = next.get(v);
    }
    if (v !== start || loop.length < 5) continue;
    // 몸통과 팔·손 사이만 막는다 (손목처럼 팔 안쪽 경계는 붙어 움직이므로 그대로 둔다)
    const touchesBody = (u) => lab[u] === 0 || other.get(u) === 0;
    if (loop.filter(touchesBody).length < loop.length * 0.8) continue;
    // 잘린 선이 톱니처럼 들쭉날쭉해서, 고리를 따라 위치를 몇 번 고르게 편다 (양쪽 고리가 같은 위치라 틈이 안 생긴다)
    for (let it = 0; it < 4; it++) {
      const P = loop.map((u) => [pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]]);
      for (let i = 0; i < loop.length; i++) {
        const a = P[(i + loop.length - 1) % loop.length], b = P[(i + 1) % loop.length];
        if (!touchesBody(loop[i])) continue;
        for (let d = 0; d < 3; d++) pos[loop[i] * 3 + d] = P[i][d] * 0.5 + (a[d] + b[d]) * 0.25;
      }
    }
    // 고리 안 라벨 다수결 (팔 쪽/몸통 쪽)
    const lc = new Map();
    for (const u of loop) lc.set(lab[u], (lc.get(lab[u]) || 0) + 1);
    const l = [...lc.entries()].sort((x, y) => y[1] - x[1])[0][0];
    let cx = 0, cy = 0, cz = 0;
    for (const u of loop) { cx += pos[u * 3]; cy += pos[u * 3 + 1]; cz += pos[u * 3 + 2]; }
    const c = pos.length / 3;
    pos.push(cx / loop.length, cy / loop.length, cz / loop.length);
    lab.push(l);
    const copy = loop.map((u) => {
      const nv = pos.length / 3;
      pos.push(pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]);
      lab.push(lab[u]);
      return nv;
    });
    for (let i = 0; i < copy.length; i++) idx.push(copy[i], copy[(i + 1) % copy.length], c);
    // 막는 면은 평평하게 보이도록 법선 하나 (뉴얼 방법)
    const n = [0, 0, 0];
    for (let i = 0; i < copy.length; i++) {
      const a = copy[i] * 3, b = copy[(i + 1) % copy.length] * 3;
      n[0] += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]);
      n[1] += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]);
      n[2] += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
    }
    const len = Math.hypot(...n) || 1;
    caps.push({ verts: [c, ...copy], n: n.map((x) => x / len) });
  }
  return caps;
}

export function buildRig(parts) {
  const bones = {};
  const list = [];
  for (const [name, parent, a] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const pa = v3(J[a]);
    if (parent) {
      b.position.copy(pa.sub(v3(J[BONES.find((x) => x[0] === parent)[2]])));
      bones[parent].add(b);
    } else b.position.copy(pa);
    bones[name] = b;
    list.push(b);
  }
  const segs = Object.fromEntries(BONES.map(([n, , a, e]) => [n, [v3(J[a]), v3(J[e])]]));
  const idx = Object.fromEntries(list.map((b, i) => [b.name, i]));

  // 재질별로 묶어서 하나의 메시로
  const byMat = new Map();
  for (const part of parts) {
    const key = part.cat === 'eyeWhite' ? 'cornea' : part.cat === 'bust' ? 'body' : part.cat;
    if (!byMat.has(key)) byMat.set(key, []);
    const g = new THREE.BufferGeometry();
    let labels = null;
    if (part.cat === 'body') {
      const sp = splitLimbs(part.p, part.i);
      labels = sp.lab;
      // 매끈한 법선은 색 경계 복제 전에 구한다 (복제한 정점이 같은 법선을 갖도록)
      const tmp = new THREE.BufferGeometry();
      tmp.setAttribute('position', new THREE.Float32BufferAttribute(sp.pos, 3));
      tmp.setIndex(sp.idx);
      tmp.computeVertexNormals();
      const nrm = Array.from(tmp.attributes.normal.array);
      for (const cap of sp.caps) for (const v of cap.verts) nrm.splice(v * 3, 3, ...cap.n);
      const col = colorSplit(sp.pos, sp.idx, labels, nrm);
      g.setAttribute('position', new THREE.Float32BufferAttribute(sp.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      // 화면에서는 픽셀마다 같은 규칙으로 칠한다 (가늘고 긴 삼각형 때문에 정점 색 경계가 들쭉날쭉해서)
      g.setAttribute('rest', new THREE.Float32BufferAttribute(sp.pos, 3));
      g.setAttribute('lab', new THREE.Float32BufferAttribute(labels, 1));
      g.setIndex(sp.idx);
    } else {
      g.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
      g.setIndex(part.i);
    }
    if (part.cat !== 'body') {
      g.computeVertexNormals();
      const n = g.attributes.position.count;
      const bust = part.cat === 'bust';
      g.setAttribute('rest', new THREE.Float32BufferAttribute(bust ? Float32Array.from(part.p) : new Float32Array(n * 3), 3));
      g.setAttribute('lab', new THREE.Float32BufferAttribute(new Float32Array(n).fill(bust ? 9 : 0), 1));
      if (bust) {
        // GLB용 정점 색 (화면은 셰이더가 같은 규칙으로 칠함)
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const k = BODY_COLORS[colorKey(part.p[i * 3], part.p[i * 3 + 1], part.p[i * 3 + 2], 9)];
          col.set([k.r, k.g, k.b], i * 3);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      }
    }
    if (part.cat === 'iris') eyeColors(part, g);
    else if (part.cat === 'body' || part.cat === 'bust') { /* colorSplit·위에서 칠함 */ }
    else {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    // 스킨 가중치
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position, i);
      const cand = candidates(part.cat, p, labels ? labels[i] : undefined);
      const list = Array.isArray(cand) ? cand : cand.list;
      const pw = Array.isArray(cand) ? 5 : 9; // 팔·손은 몸통과 붙어 있어 경계를 날카롭게
      const cs = list.map(([name, k]) => {
        const [a, e] = segs[name];
        return { name, w: k / Math.pow(segDist(p, a, e) + 0.02, pw) };
      });
      cs.sort((x, y) => y.w - x.w);
      const top = cs.slice(0, 4);
      const sum = top.reduce((s, c) => s + c.w, 0);
      top.forEach((c, k) => {
        si[i * 4 + k] = idx[c.name];
        sw[i * 4 + k] = c.w / sum;
      });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    byMat.get(key).push(g);
  }
  const geos = [];
  const mats = [];
  for (const [key, gs] of byMat) {
    geos.push(mergeGeometries(gs, false));
    if (key === 'cornea') mats.push(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.15, depthWrite: false, name: key }));
    else if (key === 'iris') mats.push(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, name: key }));
    else if (key === 'body') mats.push(bodyMaterial());
    else {
      const [c, r] = MAT[key] ?? [0xff00ff, 0.7];
      mats.push(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: key === 'button' ? 0.4 : 0, name: key }));
    }
  }
  const geo = mergeGeometries(geos, true);
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.name = 'Thatcher';
  // 하늘로 솟구치는 동작이 있어서, 서 있는 자세 기준 화면 밖 판정으로 사라지지 않게
  mesh.frustumCulled = false;
  mesh.add(bones.root);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);
  // 떼어 낸 자리의 안쪽 면은 어둡게
  // 안쪽 면도 같은 색 규칙으로, 어둡게 (손에 뚫린 자리는 어두운 살색)
  const innerMats = mats.map((m) => {
    const c = m.name === 'body' ? bodyMaterial() : m.clone();
    c.side = THREE.BackSide;
    c.color = new THREE.Color(0xb0b0b0);
    c.roughness = 0.9;
    return c;
  });
  const inner = new THREE.SkinnedMesh(geo, innerMats);
  inner.name = 'ThatcherInner';
  inner.frustumCulled = false;
  inner.bind(skeleton, mesh.bindMatrix);
  mesh.add(inner);
  return { mesh, bones, list };
}

// ---------------------------------------------------------------- 자세 (트럼프와 같은 방향 기반 정의)
const REST_DIR = {};
for (const [name, , a, e] of BONES) REST_DIR[name] = v3(J[e]).sub(v3(J[a])).normalize();
const D = (x, y, z) => [x, y, z];
const GUARD = {
  root: D(0, -10, 0), spine: D(5, -6, 0), chest: D(4, -8, 0), neck: D(4, 12, 0), head: D(2, 0, 0), drop: -0.07, fist: 1,
  L_upper: D(0.35, -0.75, 0.55), L_fore: D(-0.25, 0.75, 0.6),
  R_upper: D(0.35, -0.8, 0.45), R_fore: D(-0.3, 0.8, 0.5),
  L_thigh: D(0.08, -0.96, 0.2), L_shin: D(0.02, -1, -0.04),
  R_thigh: D(0.06, -0.97, -0.16), R_shin: D(0.0, -1, -0.2),
};
const P = (over) => ({ ...GUARD, ...over });

export const POSES = {
  tpose: { root: D(0, 0, 0), spine: D(0, 0, 0), chest: D(0, 0, 0), neck: D(0, 0, 0), head: D(0, 0, 0), drop: 0 },
  guard: GUARD,
  guard2: P({ drop: -0.09, chest: D(6, -8, 0), L_fore: D(-0.2, 0.8, 0.55) }),
  jabW: P({ chest: D(4, -16, 0), L_upper: D(0.3, -0.55, 0.75), L_fore: D(-0.1, 0.5, 0.85) }),
  jab: P({ spine: D(8, 12, 0), chest: D(6, 16, 0), L_upper: D(0.1, 0.02, 1), L_fore: D(0.0, 0.05, 1), drop: -0.08 }),
  strW: P({ chest: D(4, -24, 0), R_upper: D(0.4, -0.7, 0.3) }),
  str: P({ root: D(0, 18, 0), spine: D(10, 18, 0), chest: D(8, 24, 0), R_upper: D(0.08, 0.05, 1), R_fore: D(0.02, 0.05, 1), L_upper: D(0.4, -0.75, 0.3), L_fore: D(-0.35, 0.8, 0.4), R_thigh: D(0.06, -0.92, -0.3), R_shin: D(0.02, -1, -0.15), drop: -0.1 }),
  upW: P({ spine: D(20, -14, 0), chest: D(10, -12, 0), R_upper: D(0.3, -0.85, 0.2), R_fore: D(0, 0.2, 1), drop: -0.2, L_thigh: D(0.06, -0.85, 0.5), L_shin: D(0, -1, -0.2) }),
  up: P({ root: D(0, 14, 0), spine: D(-10, 14, 0), chest: D(-8, 16, 0), neck: D(-10, 0, 0), R_upper: D(-0.05, 0.75, 0.65), R_fore: D(-0.05, 1, 0.1), drop: 0.03, R_thigh: D(0.04, -1, -0.1), R_shin: D(0, -1, -0.05) }),
  hookW: P({ chest: D(6, -30, 0), L_upper: D(0.85, -0.2, 0.3), L_fore: D(0.1, 0.1, 1) }),
  hook: P({ spine: D(8, 26, 0), chest: D(8, 34, 0), L_upper: D(0.75, 0.15, 0.65), L_fore: D(-0.9, 0.05, 0.45), drop: -0.1 }),
  fkW: P({ spine: D(-4, 0, 0), R_thigh: D(0, -0.2, 1), R_shin: D(0, -1, 0.1), L_shin: D(0, -1, 0.05), L_thigh: D(0.05, -1, 0.05), drop: -0.04 }),
  fk: P({ spine: D(-14, 0, 0), chest: D(-8, 0, 0), R_thigh: D(0.02, 0.1, 1), R_shin: D(0.02, 0.12, 1), L_thigh: D(0.05, -1, 0.0), L_shin: D(0, -1, 0.05), L_upper: D(0.6, -0.5, -0.3), L_fore: D(0.1, 0.4, 0.9), R_upper: D(-0.2, -0.7, -0.5), drop: 0 }),
  rkW: P({ root: D(0, -30, 0), chest: D(0, -20, 0), L_thigh: D(0.45, -0.3, 0.6), L_shin: D(0.3, -0.9, -0.2), R_thigh: D(-0.05, -1, 0), R_shin: D(0, -1, 0), drop: -0.04 }),
  rk: P({ root: D(0, -35, 0), spine: D(0, -12, -14), chest: D(0, -8, -6), neck: D(0, 20, 8), L_thigh: D(0.6, 0.15, 0.75), L_shin: D(0.4, 0.3, 0.85), R_thigh: D(-0.12, -1, 0), R_shin: D(0, -1, 0), L_upper: D(0.3, -0.9, -0.2), R_upper: D(0.9, 0.1, 0.3), R_fore: D(0.4, 0.3, 0.85), drop: -0.02 }),
  lkW: P({ drop: -0.14, R_thigh: D(0.25, -0.75, 0.3), R_shin: D(0.1, -0.9, -0.35) }),
  lk: P({ spine: D(8, -14, 8), drop: -0.18, R_thigh: D(-0.2, -0.75, 0.62), R_shin: D(-0.15, -0.45, 0.88), L_thigh: D(0.08, -0.8, 0.45), L_shin: D(0, -1, -0.25) }),
  hit: P({ spine: D(-18, 8, 0), chest: D(-14, 6, 0), neck: D(-20, 0, 0), L_upper: D(0.7, -0.3, 0.2), L_fore: D(0.3, 0.6, 0.6), R_upper: D(0.7, -0.4, 0), drop: -0.03 }),
  // 승리: 박수 (손을 가슴 앞에서 모음)
  // 승리: 가슴을 펴고 뒷짐
  behind: P({ root: D(0, 0, 0), spine: D(-6, 0, 0), chest: D(-8, 0, 0), neck: D(-6, 0, 0), drop: 0, L_upper: D(0.25, -0.82, -0.5), L_fore: D(-0.75, -0.15, -0.62), R_upper: D(0.25, -0.82, -0.5), R_fore: D(-0.75, -0.15, -0.62), L_thigh: D(0.05, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.05, -1, 0), R_shin: D(0, -1, 0) }),
  behind2: P({ root: D(0, 8, 0), spine: D(-8, 4, 0), chest: D(-10, 4, 0), neck: D(-10, -12, 0), drop: 0.01, L_upper: D(0.25, -0.82, -0.5), L_fore: D(-0.75, -0.15, -0.62), R_upper: D(0.25, -0.82, -0.5), R_fore: D(-0.75, -0.15, -0.62), L_thigh: D(0.05, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.05, -1, 0), R_shin: D(0, -1, 0) }),
  pumpA: P({ root: D(0, -10, 0), spine: D(-6, -8, 0), chest: D(-8, -10, 0), neck: D(-14, 0, 0), drop: 0, R_upper: D(0.35, 0.9, 0.2), R_fore: D(0.1, 1, 0.15), L_upper: D(0.35, -0.85, 0.3), L_fore: D(-0.3, 0.3, 0.9), L_thigh: D(0.06, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.06, -1, 0), R_shin: D(0, -1, 0) }),
  pumpB: P({ root: D(0, -10, 0), spine: D(-2, -8, 0), chest: D(-4, -10, 0), neck: D(-6, 0, 0), drop: -0.03, R_upper: D(0.55, 0.65, 0.3), R_fore: D(0.0, 1, 0.3), L_upper: D(0.35, -0.85, 0.3), L_fore: D(-0.3, 0.3, 0.9), L_thigh: D(0.06, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.06, -1, 0), R_shin: D(0, -1, 0) }),
  clapA: P({ fist: 0, root: D(0, 0, 0), spine: D(-4, 0, 0), chest: D(-4, 0, 0), neck: D(-8, 0, 0), drop: 0, L_upper: D(0.45, -0.6, 0.65), L_fore: D(-0.75, 0.15, 0.65), R_upper: D(0.45, -0.6, 0.65), R_fore: D(-0.75, 0.15, 0.65), L_thigh: D(0.03, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.03, -1, 0), R_shin: D(0, -1, 0) }),
  // ---- 궁극기: 핵 단추
  pressW: P({ fist: 0, root: D(0, 0, 0), spine: D(-10, 0, 0), chest: D(-8, -14, 0), neck: D(-6, 0, 0), drop: 0.02, R_upper: D(-0.15, 0.9, 0.35), R_fore: D(-0.1, 0.95, 0.25), L_upper: D(0.5, -0.6, 0.3), L_fore: D(0.0, 0.3, 0.95), L_thigh: D(0.05, -1, 0.05), L_shin: D(0, -1, 0), R_thigh: D(0.04, -1, -0.05), R_shin: D(0, -1, -0.05) }),
  press: P({ fist: 0, root: D(0, 0, 0), spine: D(24, 0, 0), chest: D(16, 6, 0), neck: D(14, 0, 0), drop: -0.12, R_upper: D(-0.1, -0.55, 0.83), R_fore: D(-0.05, -0.3, 0.95), R_palm: D(0, -1, 0), L_upper: D(0.6, -0.3, -0.4), L_fore: D(0.4, 0.5, 0.2), L_thigh: D(0.05, -0.95, 0.2), L_shin: D(0, -1, -0.1), R_thigh: D(0.04, -0.98, -0.12), R_shin: D(0, -1, -0.15) }),
  cheer: P({ root: D(0, 0, 0), spine: D(-10, 0, 0), chest: D(-8, 0, 0), neck: D(-28, 0, 0), drop: 0.02, L_upper: D(0.35, 0.93, 0.1), L_fore: D(0.1, 1, 0.05), R_upper: D(0.35, 0.93, 0.1), R_fore: D(0.1, 1, 0.05), L_thigh: D(0.06, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.06, -1, 0), R_shin: D(0, -1, 0) }),
  crouchJ: P({ root: D(0, 0, 0), spine: D(24, 0, 0), chest: D(10, 0, 0), neck: D(-10, 0, 0), drop: -0.32, L_upper: D(0.3, -0.7, -0.6), L_fore: D(0.2, -0.8, -0.5), R_upper: D(0.3, -0.7, -0.6), R_fore: D(0.2, -0.8, -0.5), L_thigh: D(0.12, -0.6, 0.78), L_shin: D(0.02, -0.95, -0.3), R_thigh: D(0.12, -0.6, 0.78), R_shin: D(0.02, -0.95, -0.3) }),
  launch: P({ root: D(0, 0, 0), spine: D(-4, 0, 0), chest: D(0, 0, 0), neck: D(-20, 0, 0), drop: 0, rootPos: [0, 3, 0], L_upper: D(0.2, 0.97, 0), L_fore: D(0.05, 1, 0), R_upper: D(0.2, 0.97, 0), R_fore: D(0.05, 1, 0), L_thigh: D(0.03, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.03, -1, 0), R_shin: D(0, -1, 0) }),
  launchHigh: P({ root: D(0, 0, 0), spine: D(0, 0, 0), chest: D(0, 0, 0), neck: D(0, 0, 0), drop: 0, rootPos: [0, 11, 0], L_upper: D(0.12, -1, 0), L_fore: D(0.04, -1, 0.04), R_upper: D(0.12, -1, 0), R_fore: D(0.04, -1, 0.04), L_thigh: D(0.02, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.02, -1, 0), R_shin: D(0, -1, 0) }),
  // 탄두가 된 김정은: 거꾸로 머리부터, 팔은 몸에 붙이고 다리는 꼿꼿이 (다리 끝에 미사일 꼬리)
  diveHigh: P({ root: D(180, 0, 0), spine: D(0, 0, 0), chest: D(0, 0, 0), neck: D(0, 0, 0), head: D(0, 0, 0), drop: 0, rootPos: [0, 11, 0], L_upper: D(0.1, -1, 0), L_fore: D(0.03, -1, 0.03), R_upper: D(0.1, -1, 0), R_fore: D(0.03, -1, 0.03), L_thigh: D(0.0, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.0, -1, 0), R_shin: D(0, -1, 0) }),
  diveLow: P({ root: D(180, 720, 0), spine: D(0, 0, 0), chest: D(0, 0, 0), neck: D(-20, 0, 0), head: D(0, 0, 0), drop: 0, rootPos: [0, 1.4, 0], L_upper: D(0.1, -1, 0), L_fore: D(0.03, -1, 0.03), R_upper: D(0.1, -1, 0), R_fore: D(0.03, -1, 0.03), L_thigh: D(0.0, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.0, -1, 0), R_shin: D(0, -1, 0) }),
  // 배치기: 엎드려 팔다리를 쫙 편 채 배로 착지
  flop: P({ root: D(90, 720, 0), spine: D(0, 0, 0), chest: D(0, 0, 0), neck: D(-35, 0, 0), head: D(0, 0, 0), drop: 0, rootPos: [0, -0.6, -0.1], L_upper: D(0.8, 0.55, -0.2), L_fore: D(0.55, 0.8, -0.2), R_upper: D(0.8, 0.55, -0.2), R_fore: D(0.55, 0.8, -0.2), L_thigh: D(0.4, -0.92, -0.05), L_shin: D(0.3, -0.95, -0.05), R_thigh: D(0.4, -0.92, -0.05), R_shin: D(0.3, -0.95, -0.05) }),
  getupK: P({ root: D(30, 0, 0), spine: D(30, 0, 0), chest: D(10, 0, 0), neck: D(-20, 0, 0), drop: -0.45, L_upper: D(0.3, -0.9, 0.3), L_fore: D(0.1, -0.9, 0.4), R_upper: D(0.3, -0.9, 0.3), R_fore: D(0.1, -0.9, 0.4), L_thigh: D(0.1, -0.2, 0.98), L_shin: D(0, -1, -0.1), R_thigh: D(0.1, -0.85, -0.5), R_shin: D(0, -0.2, -0.98) }),
  clapB: P({ fist: 0, root: D(0, 0, 0), spine: D(-4, 0, 0), chest: D(-4, 0, 0), neck: D(-8, 0, 0), drop: 0, L_upper: D(0.55, -0.55, 0.6), L_fore: D(-0.35, 0.2, 0.92), R_upper: D(0.55, -0.55, 0.6), R_fore: D(-0.35, 0.2, 0.92), L_thigh: D(0.03, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.03, -1, 0), R_shin: D(0, -1, 0) }),
};

const POSES_REF = POSES;
export const MOVES = {
  '대기 (가드)': [[0, 'guard'], [0.6, 'guard2'], [1.2, 'guard']],
  '잽': [[0, 'guard'], [0.08, 'jabW'], [0.16, 'jab'], [0.26, 'jab'], [0.5, 'guard']],
  '원투': [[0, 'guard'], [0.08, 'jabW'], [0.16, 'jab'], [0.24, 'guard'], [0.32, 'strW'], [0.42, 'str'], [0.54, 'str'], [0.85, 'guard']],
  '스트레이트': [[0, 'guard'], [0.12, 'strW'], [0.22, 'str'], [0.34, 'str'], [0.7, 'guard']],
  '훅': [[0, 'guard'], [0.14, 'hookW'], [0.26, 'hook'], [0.36, 'hook'], [0.75, 'guard']],
  '어퍼컷': [[0, 'guard'], [0.16, 'upW'], [0.3, 'up'], [0.44, 'up'], [0.85, 'guard']],
  '앞차기': [[0, 'guard'], [0.16, 'fkW'], [0.3, 'fk'], [0.44, 'fk'], [0.62, 'fkW'], [0.9, 'guard']],
  '돌려차기': [[0, 'guard'], [0.18, 'rkW'], [0.34, 'rk'], [0.48, 'rk'], [0.7, 'rkW'], [1.0, 'guard']],
  '로우킥': [[0, 'guard'], [0.14, 'lkW'], [0.26, 'lk'], [0.38, 'lk'], [0.7, 'guard']],
  '피격': [[0, 'guard'], [0.06, 'hit'], [0.3, 'hit'], [0.7, 'guard']],
  '승리 (주먹 번쩍)': [[0, 'guard'], [0.35, 'pumpA'], [0.6, 'pumpB'], [0.85, 'pumpA'], [1.1, 'pumpB'], [1.35, 'pumpA'], [1.9, 'pumpA'], [2.3, 'guard']],
  '차렷 (원래 자세)': [[0, 'tpose'], [1, 'tpose']],
};

const DEG = Math.PI / 180;
const ROT_BONES = ['root', 'spine', 'chest', 'neck', 'head'];

function mirror(name, d) {
  return name.startsWith('R_') ? new THREE.Vector3(-d[0], d[1], d[2]) : new THREE.Vector3(d[0], d[1], d[2]);
}

function blend(a, b, t) {
  const out = {};
  const ZERO = { rootPos: [0, 0, 0], squash: 0, drop: 0 };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? ZERO[k], y = b[k] ?? ZERO[k];
    if (x === undefined) out[k] = y;
    else if (y === undefined) out[k] = x;
    else if (typeof x === 'number') out[k] = x + (y - x) * t;
    else out[k] = x.map((v, i) => v + (y[i] - v) * t);
  }
  return out;
}

export function applyPose(rig, pose) {
  const { bones } = rig;
  for (const n of ROT_BONES) {
    const r = pose[n] || [0, 0, 0];
    bones[n].quaternion.setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, -r[2] * DEG, 'YXZ'));
  }
  const rp = pose.rootPos || [0, 0, 0];
  bones.root.position.set(J.root[0] + rp[0], J.root[1] + (pose.drop || 0) + rp[1], J.root[2] + rp[2]);
  // 찌그러짐: 엎드린 자세에서 몸 두께 방향(로컬 Z)으로 눌리고 옆으로 퍼진다
  const sq = pose.squash || 0;
  bones.root.scale.set(1 + sq * 0.35, 1 + sq * 0.12, 1 - sq * 0.42);
  const inv = new THREE.Quaternion();
  for (const s of ['L', 'R']) {
    for (const [up, lo] of [[s + '_upper', s + '_fore'], [s + '_thigh', s + '_shin']]) {
      if (!pose[up]) {
        bones[up].quaternion.identity();
        bones[lo].quaternion.identity();
        continue;
      }
      const tUp = mirror(up, pose[up]).normalize();
      const tLo = mirror(lo, pose[lo] || pose[up]).normalize();
      const qUp = new THREE.Quaternion().setFromUnitVectors(REST_DIR[up], tUp);
      bones[up].quaternion.copy(qUp);
      const local = tLo.clone().applyQuaternion(inv.copy(qUp).invert());
      bones[lo].quaternion.setFromUnitVectors(REST_DIR[lo], local.normalize());
    }
    // 아래팔 비틀기: 손바닥이 몸 안쪽·아래를 보게
    if (pose[s + '_upper']) {
      const up = s + '_upper', lo = s + '_fore';
      const qTot = bones[up].quaternion.clone().multiply(bones[lo].quaternion);
      const axis = REST_DIR[lo];
      const fore = axis.clone().applyQuaternion(qTot);
      const inward = new THREE.Vector3(s === 'L' ? -1 : 1, 0, 0);
      const want = pose[s + '_palm'] ? mirror(s + '_palm', pose[s + '_palm']) : inward.multiplyScalar(0.8).add(new THREE.Vector3(0, -0.6, 0));
      want.addScaledVector(fore, -want.dot(fore));
      if (want.lengthSq() > 1e-6) {
        const dRest = want.normalize().applyQuaternion(qTot.clone().invert());
        const p0 = new THREE.Vector3(s === 'L' ? -1 : 1, 0, 0); // 차렷 자세: 손바닥이 허벅지 쪽
        p0.addScaledVector(axis, -p0.dot(axis)).normalize();
        dRest.addScaledVector(axis, -dRest.dot(axis)).normalize();
        const ang = Math.atan2(new THREE.Vector3().crossVectors(p0, dRest).dot(axis), p0.dot(dRest));
        bones[lo].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      }
    }
    bones[s + '_hand'].quaternion.identity();
    bones[s + '_foot'].quaternion.identity();
  }
}

export function sampleMove(keys, t) {
  const end = keys[keys.length - 1][0];
  t = Math.max(0, Math.min(end, t));
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      let k = (t - t0) / Math.max(1e-6, t1 - t0);
      const ease = keys[i + 1][2];
      k = ease === 'in' ? k * k : ease === 'out' ? 1 - (1 - k) * (1 - k) : ease === 'lin' ? k : k * k * (3 - 2 * k);
      return blend(typeof a === 'string' ? POSES[a] : a, typeof b === 'string' ? POSES[b] : b, k);
    }
  }
  const last = keys[keys.length - 1][1];
  return typeof last === 'string' ? POSES[last] : last;
}

export function bakeClips(rig, fps = 30) {
  const clips = [];
  for (const [name, keys] of Object.entries(MOVES)) {
    const dur = keys[keys.length - 1][0];
    const times = [];
    const q = Object.fromEntries(rig.list.map((b) => [b.name, []]));
    const rootPos = [];
    const rootScale = [];
    for (let f = 0; f <= Math.ceil(dur * fps); f++) {
      const t = Math.min(dur, f / fps);
      times.push(t);
      applyPose(rig, sampleMove(keys, t));
      for (const b of rig.list) q[b.name].push(...b.quaternion.toArray());
      rootPos.push(...rig.bones.root.position.toArray());
      rootScale.push(...rig.bones.root.scale.toArray());
    }
    const tracks = rig.list.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, q[b.name]));
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, rootPos));
    tracks.push(new THREE.VectorKeyframeTrack('root.scale', times, rootScale));
    clips.push(new THREE.AnimationClip(name, dur, tracks));
  }
  return clips;
}

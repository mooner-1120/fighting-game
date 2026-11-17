// 김정은 OBJ(T자 자세, 부위별 분리)에 뼈대를 심고 격투 동작을 만든다.
// 좌표: 미터, Y 위, +Z 앞, 캐릭터의 왼쪽 = +X
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- 관절 (부위 단면 측정값)
export const J = {
  root: [0, 0.92, -0.01],
  spine: [0, 1.06, -0.01],
  chest: [0, 1.24, -0.02],
  neck: [0, 1.44, -0.02],
  head: [0, 1.52, 0.0],
  headTop: [0, 1.76, 0.0],
  L_sh: [0.2, 1.385, -0.047],
  L_el: [0.44, 1.385, -0.047],
  L_wr: [0.68, 1.383, -0.047],
  L_palm: [0.84, 1.382, -0.045],
  L_hip: [0.11, 0.86, -0.01],
  L_knee: [0.117, 0.5, -0.01],
  L_ank: [0.118, 0.1, -0.04],
  L_toe: [0.115, 0.03, 0.16],
};
// 손가락: 위에서 내려다본 손 렌더링에서 잰 뿌리·끝 위치 (x, z), 손 두께 중심 y
const HAND_Y = 1.382;
export const FINGERS = {
  idx: { root: [0.847, -0.028], tip: [0.943, -0.002], cuts: [0, 0.45, 0.75, 1], r: 0.013 },
  mid: { root: [0.847, -0.06], tip: [0.953, -0.053], cuts: [0, 0.45, 0.75, 1], r: 0.013 },
  ring: { root: [0.843, -0.078], tip: [0.93, -0.103], cuts: [0, 0.45, 0.75, 1], r: 0.013 },
  pinky: { root: [0.835, -0.097], tip: [0.873, -0.147], cuts: [0, 0.45, 0.75, 1], r: 0.012 },
  thb: { root: [0.77, -0.005], tip: [0.848, 0.066], cuts: [0, 0.45, 1], r: 0.016 },
};
for (const [f, d] of Object.entries(FINGERS)) {
  d.cuts.forEach((t, i) => {
    J[`L_${f}${i}`] = [d.root[0] + (d.tip[0] - d.root[0]) * t, HAND_Y, d.root[1] + (d.tip[1] - d.root[1]) * t];
  });
}
for (const k of Object.keys(J)) if (k.startsWith('L_')) { const [x, y, z] = J[k]; J['R_' + k.slice(2)] = [-x, y, z]; }

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
    [s + '_hand', s + '_fore', s + '_wr', s + '_palm'],
    [s + '_thigh', 'root', s + '_hip', s + '_knee'],
    [s + '_shin', s + '_thigh', s + '_knee', s + '_ank'],
    [s + '_foot', s + '_shin', s + '_ank', s + '_toe'],
  );
}
for (const s of ['L', 'R']) {
  for (const [f, d] of Object.entries(FINGERS)) {
    for (let i = 1; i < d.cuts.length; i++) BONES.push([`${s}_${f}${i}`, i === 1 ? s + '_hand' : `${s}_${f}${i - 1}`, `${s}_${f}${i - 1}`, `${s}_${f}${i}`]);
  }
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** 손 정점 → 손가락 마디 가중치 (가장 가까운 손가락 축에 투영해 마디를 정함). 손바닥이면 null */
function fingerWeights(p, s) {
  const sx = s === 'L' ? 1 : -1;
  let best = null;
  for (const [f, d] of Object.entries(FINGERS)) {
    const ax = d.root[0] * sx, az = d.root[1];
    const dx = (d.tip[0] - d.root[0]) * sx, dz = d.tip[1] - d.root[1];
    const len2 = dx * dx + dz * dz;
    const t = ((p.x - ax) * dx + (p.z - az) * dz) / len2;
    const tc = Math.max(0, Math.min(1.6, t));
    const lat = Math.hypot(p.x - (ax + dx * tc), p.z - (az + dz * tc));
    // 손끝·손톱은 측정한 끝점보다 더 나가 있으므로 손가락 축 연장선(최대 1.6배)까지 포함
    if (!best || lat < best.lat) best = { f, d, t: Math.min(1, t), lat };
  }
  if (!best) return null;
  // 손바닥: 마디 뒤쪽이거나, 엄지 근처라도 축에서 멀면
  if (best.t < -0.12) return null;
  if (best.f === 'thb' ? best.lat > 0.02 : best.lat > 0.03) return null;
  if (!best) return null;
  const { f, d, t } = best;
  const segs = d.cuts.length - 1;
  const w = new Map();
  const add = (n, v) => v > 0 && w.set(n, (w.get(n) || 0) + v);
  // 손바닥 ↔ 첫 마디
  const a0 = Math.max(0, Math.min(1, (t + 0.08) / 0.16));
  add(s + '_hand', 1 - a0);
  let rest = a0;
  for (let i = 1; i <= segs; i++) {
    if (i === segs) { add(`${s}_${f}${i}`, rest); break; }
    const b = d.cuts[i];
    const a = Math.max(0, Math.min(1, (t - b + 0.05) / 0.1));
    add(`${s}_${f}${i}`, rest * (1 - a));
    rest *= a;
  }
  return [...w.entries()];
}

function segDist(p, a, b) {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/** 부위(cat)와 위치로 후보 뼈와 배율 결정. 반환: [뼈, 배율][] */
function candidates(cat, p) {
  const s = p.x >= 0 ? 'L' : 'R';
  const o = s === 'L' ? 'R' : 'L';
  switch (cat) {
    case 'hair': case 'eyeWhite': case 'iris': case 'teeth':
      return [['head', 1]];
    case 'skin': // 머리 + 목
      if (p.y > 1.5) return [['head', 1]];
      return [['head', 1], ['neck', 1], ['chest', 0.6]];
    case 'skinHand': {
      const fw = fingerWeights(p, s);
      if (fw) return { direct: fw };
      if (Math.abs(p.x) < J.L_wr[0] + 0.03) return [[s + '_hand', 1], [s + '_fore', 0.7]];
      return { direct: [[s + '_hand', 1]] };
    }
    case 'shoe':
      return p.y > 0.085 ? [[s + '_foot', 1], [s + '_shin', 0.8]] : [[s + '_foot', 1]];
    case 'pants': {
      if (p.y > 0.8) return [['root', 1], [s + '_thigh', 0.7]];
      const c = [[s + '_thigh', 1], [s + '_shin', 1], [s + '_foot', 0.6]];
      if (Math.abs(p.x) < 0.03 && p.y > 0.6) c.push([o + '_thigh', 0.6], ['root', 0.5]);
      return c;
    }
    case 'button':
    case 'jacket': {
      if (Math.abs(p.x) > 0.21 && p.y > 1.25) return [[s + '_upper', 1], [s + '_fore', 1], [s + '_hand', 0.3], ['chest', 0.8]];
      const c = [['root', 1], ['spine', 1], ['chest', 1], ['neck', 0.5]];
      if (Math.abs(p.x) > 0.15 && p.y > 1.2) c.push([s + '_upper', 0.8]);
      // 재킷 아랫단은 허벅지를 조금 따라가게 (발차기 때 다리가 옷을 뚫지 않도록)
      if (p.y < 0.9) c.push([s + '_thigh', 0.45 + (0.9 - p.y) * 2.5]);
      return c;
    }
  }
  return [['root', 1]];
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
    const key = part.cat === 'eyeWhite' ? 'cornea' : part.cat;
    if (!byMat.has(key)) byMat.set(key, []);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
    g.setIndex(part.i);
    g.computeVertexNormals();
    if (part.cat === 'iris') eyeColors(part, g);
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
      const cand = candidates(part.cat, p);
      const cs = cand.direct
        ? cand.direct.map(([name, w]) => ({ name, w }))
        : cand.map(([name, k]) => {
            const [a, e] = segs[name];
            return { name, w: k / Math.pow(segDist(p, a, e) + 0.02, 5) };
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
    else {
      const [c, r] = MAT[key] ?? [0xff00ff, 0.7];
      mats.push(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: key === 'button' ? 0.4 : 0, name: key }));
    }
  }
  const geo = mergeGeometries(geos, true);
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.name = 'Kim';
  // 하늘로 솟구치는 동작이 있어서, 서 있는 자세 기준 화면 밖 판정으로 사라지지 않게
  mesh.frustumCulled = false;
  mesh.add(bones.root);
  mesh.bind(new THREE.Skeleton(list));
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
  '승리 (박수)': [[0, 'guard'], [0.3, 'clapA'], [0.42, 'clapB'], [0.54, 'clapA'], [0.66, 'clapB'], [0.78, 'clapA'], [0.9, 'clapB'], [1.02, 'clapA'], [1.14, 'clapB'], [1.5, 'guard']],
  '궁극기: 핵 단추': [
    [0, 'guard'], [0.4, 'pressW'], [0.62, 'press', 'in'], [0.85, 'press'], [1.1, 'cheer'], [1.3, 'crouchJ'],
    [1.5, 'launch', 'out'], [1.85, 'launchHigh', 'out'], [2.1, 'diveHigh'], [2.8, 'diveLow', 'in'], [2.97, 'flop', 'in'],
    [3.0, { ...POSES_REF.flop, squash: 1 }, 'lin'], [3.13, { ...POSES_REF.flop, squash: -0.25 }, 'out'], [3.24, { ...POSES_REF.flop, squash: 0.35 }],
    [3.34, 'flop'], [3.9, 'flop'], [4.35, 'getupK'], [4.75, 'cheer'], [5.1, 'cheer'], [5.4, 'guard'],
  ],
  'T자 (원래 자세)': [[0, 'tpose'], [1, 'tpose']],
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
        const p0 = new THREE.Vector3(0, -1, 0);
        p0.addScaledVector(axis, -p0.dot(axis)).normalize();
        dRest.addScaledVector(axis, -dRest.dot(axis)).normalize();
        const ang = Math.atan2(new THREE.Vector3().crossVectors(p0, dRest).dot(axis), p0.dot(dRest));
        bones[lo].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      }
    }
    bones[s + '_hand'].quaternion.identity();
    curlHand(bones, s, pose.fist ?? 0);
    bones[s + '_foot'].quaternion.identity();
  }
}

// 주먹 각도 (라디안): 첫째·둘째·셋째 마디. 엄지는 손가락 위로 덮는다
const CURL = { idx: [1.5, 1.7, 1.1], mid: [1.5, 1.7, 1.1], ring: [1.5, 1.7, 1.1], pinky: [1.45, 1.7, 1.1], thb: [0.55, 0.9] };
const PALM_N = new THREE.Vector3(0, -1, 0);

function curlHand(bones, s, fist) {
  const sx = s === 'L' ? 1 : -1;
  const fwd = new THREE.Vector3(sx, 0, 0);
  for (const [f, d] of Object.entries(FINGERS)) {
    const dir = new THREE.Vector3((d.tip[0] - d.root[0]) * sx, 0, d.tip[1] - d.root[1]).normalize();
    const thumb = f === 'thb';
    if (thumb) {
      // 엄지: 첫 마디는 아래·안쪽, 둘째 마디는 접은 손가락 앞을 가로질러 덮는다
      const t1 = new THREE.Vector3(0.68 * sx, -0.62, -0.38).normalize();
      const t2 = new THREE.Vector3(0.38 * sx, -0.42, -0.82).normalize();
      const q1 = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(dir, t1), fist);
      bones[`${s}_thb1`].quaternion.copy(q1);
      const local = t2.clone().applyQuaternion(q1.clone().invert()).normalize();
      bones[`${s}_thb2`].quaternion.copy(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(dir, local), fist));
      continue;
    }
    // 말리는 방향: 손가락은 손바닥(-Y), 엄지는 손바닥 쪽 + 새끼손가락 쪽(-Z)
    const n = thumb ? new THREE.Vector3(0, -0.75, -0.66).normalize() : PALM_N;
    const axis = new THREE.Vector3().crossVectors(dir, n).normalize();
    const angles = CURL[f];
    for (let i = 1; i < d.cuts.length; i++) {
      const b = bones[`${s}_${f}${i}`];
      const curl = new THREE.Quaternion().setFromAxisAngle(axis, angles[i - 1] * fist);
      if (i === 1 && !thumb) {
        // 벌어진 손가락을 나란히 모으기 (주먹 정도만큼)
        const add = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(dir, fwd), fist * 0.85);
        const axis2 = new THREE.Vector3().crossVectors(dir.clone().applyQuaternion(add), n).normalize();
        b.quaternion.setFromAxisAngle(axis2, angles[0] * fist).multiply(add);
      } else b.quaternion.copy(curl);
    }
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

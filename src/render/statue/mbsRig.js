// 무함마드 빈 살만: 무료 OBJ(ArabicGuy, T자 자세, 토브·구트라 차림 아바타)에 뼈대를 심고 격투 동작을 만든다.
// 좌표: 미터, Y 위, +Z 앞, 캐릭터의 왼쪽 = +X. 손바닥은 아래(-Y), 엄지는 앞(+Z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- 관절 (단면 측정값)
export const J = {
  root: [0, 0.95, 0.0],
  spine: [0, 1.1, 0.0],
  chest: [0, 1.3, 0.0],
  neck: [0, 1.53, 0.02],
  head: [0, 1.6, 0.04],
  headTop: [0, 1.84, 0.04],
  L_sh: [0.17, 1.45, -0.02],
  L_el: [0.45, 1.45, 0.0],
  L_wr: [0.735, 1.47, 0.04],
  L_kn: [0.81, 1.47, 0.05], // 손가락 뿌리 (주먹 관절)
  L_m1: [0.842, 1.468, 0.05], // 둘째 마디
  L_m2: [0.87, 1.466, 0.05], // 셋째 마디
  L_tip: [0.9, 1.465, 0.05],
  L_th0: [0.745, 1.455, 0.095], // 엄지 뿌리
  L_th1: [0.778, 1.428, 0.15],
  L_hip: [0.1, 0.9, 0.0],
  L_knee: [0.11, 0.5, -0.01],
  L_ank: [0.14, 0.085, -0.03],
  L_toe: [0.15, 0.02, 0.13],
};
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
    [s + '_hand', s + '_fore', s + '_wr', s + '_kn'],
    [s + '_f1', s + '_hand', s + '_kn', s + '_m1'],
    [s + '_f2', s + '_f1', s + '_m1', s + '_m2'],
    [s + '_f3', s + '_f2', s + '_m2', s + '_tip'],
    [s + '_thumb', s + '_hand', s + '_th0', s + '_th1'],
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

/** 토브 아랫단은 두 다리 사이(x=0)에서 갈라 각 다리를 따라가게 한다 */
const CROTCH = 0.86;
function legLabel(x, y) {
  return y < CROTCH ? (x >= 0 ? 1 : 2) : 0;
}

/** 부위·위치로 후보 뼈와 배율, 거리 지수 결정 */
function candidates(cat, p, label) {
  const s = p.x >= 0 ? 'L' : 'R';
  const ax = Math.abs(p.x);
  switch (cat) {
    case 'skinBody': { // 손 (토브 소매 밖)
      if (ax < J.L_kn[0] - 0.01 && p.z > 0.088) return { pw: 8, list: [[s + '_thumb', 1], [s + '_hand', 0.7]] };
      if (ax < J.L_wr[0] - 0.005) return { pw: 6, list: [[s + '_hand', 1], [s + '_fore', 1]] };
      return { pw: 9, list: [[s + '_hand', 1], [s + '_f1', 1], [s + '_f2', 1], [s + '_f3', 1]] };
    }
    case 'skin': case 'iris': case 'eyeWhite': case 'teeth': case 'lash':
      if (p.y > 1.585) return [['head', 1]];
      return [['head', 1], ['neck', 1], ['chest', 0.5]];
    case 'hat': // 구트라: 머리에 붙고, 어깨로 늘어진 자락은 가슴 쪽도 따라감
      if (p.y > 1.62) return [['head', 1]];
      return [['head', 1], ['neck', 0.8], ['chest', 0.4 + (1.62 - p.y) * 3]];
    case 'outfit': {
      if (ax > 0.2 && p.y > 1.3) {
        const c = [[s + '_upper', 1], [s + '_fore', 1], [s + '_hand', 0.35]];
        if (ax < 0.27) c.push(['chest', 0.8]);
        return { pw: 6, list: c };
      }
      if (label === 1 || label === 2) {
        const c = [[s + '_thigh', 1], [s + '_shin', 1], [s + '_foot', p.y < 0.12 ? 1.5 : 0.4]];
        if (p.y > 0.7) c.push(['root', 0.25 + (p.y - 0.7) * 4]);
        return c;
      }
      const c = [['root', 1], ['spine', 1], ['chest', 1], ['neck', 0.6]];
      if (ax > 0.13 && p.y > 1.3) c.push([s + '_upper', 0.5]);
      if (p.y < 1.0) c.push([s + '_thigh', 0.3 + (1.0 - p.y) * 3]);
      return c;
    }
  }
  return [['root', 1]];
}

// ---------------------------------------------------------------- 색 (텍스처가 없어서 부위·위치로 칠한다)
const COL = {
  skin: 0xb98a66, thobe: 0xf3f1ea, red: 0xc62832, white: 0xf4f1ec, agal: 0x111111, beard: 0x1a1512,
  shoe: 0x4a3324, iris: 0x2a1a10, teeth: 0xf0ece0, lash: 0x111111,
};
const hex = (c) => { const k = new THREE.Color(c); return `vec3(${k.r.toFixed(4)},${k.g.toFixed(4)},${k.b.toFixed(4)})`; };
/** 원래 자세 위치(position)로 조각마다 색을 정하는 재질 */
function patternMaterial(name, code, opts = {}) {
  const uvDecl = 'attribute vec2 guv;\nvarying vec2 vGuv;\n';
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, name, ...opts });
  m.customProgramCacheKey = () => 'mbs-' + name; // 재질마다 셰이더가 달라서 캐시를 나눈다
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', uvDecl + 'varying vec3 vRest;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vGuv = guv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying vec2 vGuv;\nvarying vec3 vRest;\n#include <common>')
      .replace('#include <color_fragment>', `{ float x = vRest.x, y = vRest.y, z = vRest.z; float ax = abs(x); vec3 k; ${code} diffuseColor.rgb *= k; }`);
  };
  return m;
}
function makeMaterial(cat) {
  switch (cat) {
    case 'skin': // 얼굴 + 짧은 검은 수염·콧수염 (빈 살만)
      return patternMaterial('skin', `
        k = ${hex(COL.skin)};
        // 턱수염: 아랫입술 아래 + 턱선을 따라 귀 앞까지 (뒤로 갈수록 경계가 높아짐), 목은 비움
        float top = 1.643 + clamp(0.13 - z, 0.0, 0.2) * 0.42;
        float edge = smoothstep(top + 0.004, top - 0.004, y) * smoothstep(1.565, 1.585, y) * step(-0.01, z);
        // 콧수염: 윗입술 바로 위
        float st = smoothstep(1.666, 1.67, y) * smoothstep(1.684, 1.679, y) * smoothstep(0.033 - (y - 1.666) * 0.6, 0.024 - (y - 1.666) * 0.6, ax) * step(0.125, z);
        k = mix(k, ${hex(COL.beard)}, max(edge, st) * 0.92);`);
    case 'skinBody':
      return new THREE.MeshStandardMaterial({ color: COL.skin, roughness: 0.65, name: cat });
    case 'hat': { // 빨강·흰 체크 구트라 (원래 UV 기준) + 검은 이칼(머리띠 고리)
      const m = patternMaterial('hat', `
        float r = length(vec2(x, z - 0.05));
        float a = step(0.5, fract(vGuv.x * 60.0)), b = step(0.5, fract(vGuv.y * 60.0));
        k = (a + b == 1.0) ? ${hex(COL.red)} : (a * b > 0.5 ? ${hex(0x8e1820)} : ${hex(COL.white)});
        if (y > 1.795 && y < 1.835 && r > 0.098) k = ${hex(COL.agal)};`, { side: THREE.DoubleSide, roughness: 0.85 });
      m.userData.uv = true;
      return m;
    }
    case 'outfit': // 흰 토브 + 갈색 신발
      return patternMaterial('outfit', `k = y < 0.075 ? ${hex(COL.shoe)} : ${hex(COL.thobe)};`, { side: THREE.DoubleSide, roughness: 0.8 });
    case 'eyeWhite':
      return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.15, depthWrite: false, name: cat });
    case 'iris': return new THREE.MeshStandardMaterial({ color: COL.iris, roughness: 0.3, name: cat });
    case 'teeth': return new THREE.MeshStandardMaterial({ color: COL.teeth, roughness: 0.4, name: cat });
    case 'lash': return new THREE.MeshStandardMaterial({ color: COL.lash, roughness: 0.9, side: THREE.DoubleSide, name: cat });
  }
  return new THREE.MeshStandardMaterial({ color: 0xff00ff, name: cat });
}

/** 토브 아랫단을 두 다리 사이에서 가른다: 라벨이 섞인 삼각형은 다수 쪽에 붙이고 나머지 정점은 복제 */
function splitLegs(p0, i0) {
  const pos = Array.from(p0);
  const idx = Array.from(i0);
  const n0 = pos.length / 3;
  const lab = [];
  for (let v = 0; v < n0; v++) lab.push(legLabel(pos[v * 3], pos[v * 3 + 1]));
  const dup = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const l = v.map((k) => lab[k]);
    if (l[0] === l[1] && l[1] === l[2]) continue;
    const want = l[0] === l[1] || l[0] === l[2] ? l[0] : l[1] === l[2] ? l[1] : Math.max(...l);
    for (let k = 0; k < 3; k++) {
      if (l[k] === want) continue;
      const key = v[k] * 4 + want;
      let nv = dup.get(key);
      if (nv === undefined) {
        nv = pos.length / 3;
        pos.push(pos[v[k] * 3], pos[v[k] * 3 + 1], pos[v[k] * 3 + 2]);
        lab.push(want);
        dup.set(key, nv);
      }
      idx[t + k] = nv;
    }
  }
  return { pos, idx, lab };
}

const SKIP = new Set(['glasses']); // 선글라스는 빼고 쓴다

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

  const byMat = new Map();
  for (const part of parts) {
    if (SKIP.has(part.cat)) continue;
    const g = new THREE.BufferGeometry();
    let labels = null;
    if (part.cat === 'outfit') {
      const sp = splitLegs(part.p, part.i);
      labels = sp.lab;
      g.setAttribute('position', new THREE.Float32BufferAttribute(sp.pos, 3));
      g.setIndex(sp.idx);
    } else {
      g.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
      g.setIndex(part.i);
    }
    g.computeVertexNormals();
    const n = g.attributes.position.count;
    g.setAttribute('guv', new THREE.Float32BufferAttribute(part.uv && part.cat !== 'outfit' ? part.uv : new Float32Array(n * 2), 2));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position, i);
      const cand = candidates(part.cat, p, labels ? labels[i] : 0);
      const lst = Array.isArray(cand) ? cand : cand.list;
      const pw = Array.isArray(cand) ? 5 : cand.pw;
      const cs = lst.map(([name, k]) => {
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
    if (!byMat.has(part.cat)) byMat.set(part.cat, []);
    byMat.get(part.cat).push(g);
  }
  const geos = [];
  const mats = [];
  for (const [cat, gs] of byMat) {
    geos.push(mergeGeometries(gs, false));
    mats.push(makeMaterial(cat));
  }
  const geo = mergeGeometries(geos, true);
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.name = 'MBS';
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
  // 승리: 가슴을 펴고 뒷짐
  behind: P({ root: D(0, 0, 0), spine: D(-6, 0, 0), chest: D(-8, 0, 0), neck: D(-6, 0, 0), drop: 0, L_upper: D(0.25, -0.82, -0.5), L_fore: D(-0.75, -0.15, -0.62), R_upper: D(0.25, -0.82, -0.5), R_fore: D(-0.75, -0.15, -0.62), L_thigh: D(0.05, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.05, -1, 0), R_shin: D(0, -1, 0) }),
  behind2: P({ root: D(0, 8, 0), spine: D(-8, 4, 0), chest: D(-10, 4, 0), neck: D(-10, -12, 0), drop: 0.01, L_upper: D(0.25, -0.82, -0.5), L_fore: D(-0.75, -0.15, -0.62), R_upper: D(0.25, -0.82, -0.5), R_fore: D(-0.75, -0.15, -0.62), L_thigh: D(0.05, -1, 0), L_shin: D(0, -1, 0), R_thigh: D(0.05, -1, 0), R_shin: D(0, -1, 0) }),
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
  '승리 (뒷짐)': [[0, 'guard'], [0.45, 'behind'], [1.6, 'behind2'], [2.0, 'guard']],
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
        const p0 = new THREE.Vector3(0, -1, 0); // T자 자세: 손바닥이 아래
        p0.addScaledVector(axis, -p0.dot(axis)).normalize();
        dRest.addScaledVector(axis, -dRest.dot(axis)).normalize();
        const ang = Math.atan2(new THREE.Vector3().crossVectors(p0, dRest).dot(axis), p0.dot(dRest));
        bones[lo].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      }
    }
    bones[s + '_hand'].quaternion.identity();
    // 주먹: 네 손가락을 두 마디로 말고, 엄지를 손바닥 쪽으로 접는다
    const fist = pose.fist ?? 0;
    const sg = s === 'L' ? -1 : 1;
    const Z = new THREE.Vector3(0, 0, 1);
    bones[s + '_f1'].quaternion.setFromAxisAngle(Z, sg * 1.65 * fist);
    bones[s + '_f2'].quaternion.setFromAxisAngle(Z, sg * 1.9 * fist);
    bones[s + '_f3'].quaternion.setFromAxisAngle(Z, sg * 1.35 * fist);
    bones[s + '_thumb'].quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sg * 0.8 * fist)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.15 * fist));
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

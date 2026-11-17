// 인물별 캐리커처 얼굴. 기본 도형만으로 각 인물의 특징(헤어라인·얼굴형·눈·입)을 과장해서 만든다.
// 머리통은 회전체(lathe)이고, 눈·코·입·머리카락은 모두 그 표면 위치를 계산해 붙인다.
import * as THREE from 'three';
import type { CharLook } from '../sim/chardef';

type Mk = (c: number, extra?: THREE.MeshToonMaterialParameters) => THREE.MeshToonMaterial;
type V3 = [number, number, number];

const outline = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

function ol(m: THREE.Mesh, s = 1.05) {
  const o = new THREE.Mesh(m.geometry, outline);
  o.scale.setScalar(s);
  m.add(o);
  return m;
}

function ell(g: THREE.Object3D, r: number, mat: THREE.Material, pos: V3, sc: V3 = [1, 1, 1], rot: V3 = [0, 0, 0], withOutline = false, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat);
  m.position.set(...pos);
  m.scale.set(...sc);
  m.rotation.set(...rot);
  if (withOutline) ol(m, 1.04);
  g.add(m);
  return m;
}

function bar(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, pos: V3, rotZ = 0, rotX = 0, rotY = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(...pos);
  m.rotation.set(rotX, rotY, rotZ);
  g.add(m);
  return m;
}

const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * smooth(t);

/** 머리통 정보: 반지름 R과 표면 좌표 계산 */
interface Head {
  R: number;
  sc: V3;
  /** 얼굴 앞 표면의 z (x, y는 실제 좌표) */
  z(x: number, y: number): number;
  /** 머리를 감싸는 껍데기(머리카락). 윗머리용이라 구 모양, 머리통과 같은 비율 */
  shell(mat: THREE.Material, grow: number, phiStart: number, phiLen: number, t0: number, t1: number): THREE.Mesh;
}

/**
 * 회전체 머리통. jaw: 턱 폭, cheek: 볼 폭 (1 = 기본 구).
 * 위쪽 절반은 구와 같은 곡면이라 머리카락 껍데기가 잘 맞는다.
 */
function skull(g: THREE.Object3D, L: CharLook, skin: THREE.Material, sc: V3, jaw: number, cheek: number): Head {
  const R = 0.27 * L.headScale;
  // y: -1(턱) ~ 1(정수리) → 반지름 비율
  const prof = (y: number): number => {
    if (y >= 0) return Math.sqrt(Math.max(0, 1 - y * y));
    const t = -y;
    if (t < 0.45) return lerp(1, cheek, t / 0.45);
    if (t < 0.8) return lerp(cheek, jaw, (t - 0.45) / 0.35);
    return Math.max(0.0001, jaw * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.8) / 0.2, 2))));
  };
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const y = -1 + (2 * i) / 48;
    pts.push(new THREE.Vector2(Math.max(0.0001, prof(y)) * R, y * R));
  }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), skin);
  m.scale.set(...sc);
  ol(m, 1.035);
  g.add(m);
  for (const sx of [-1, 1]) {
    ell(g, R * 0.22, skin, [sx * R * sc[0] * prof(-0.05) * 0.97, -R * 0.08, -R * 0.05], [0.45, 1, 0.75], [0, 0, 0], false, 10);
  }
  return {
    R,
    sc,
    z(x: number, y: number) {
      const r = prof(Math.max(-1, Math.min(1, y / (R * sc[1]))));
      const xr = x / (R * sc[0]);
      return R * sc[2] * Math.sqrt(Math.max(0, r * r - xr * xr));
    },
    shell(mat, grow, phiStart, phiLen, t0, t1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(R * grow, 36, 24, phiStart, phiLen, t0, t1 - t0), mat);
      s.scale.set(...sc);
      g.add(s);
      return s;
    },
  };
}

const FRONT = Math.PI / 2; // 얼굴 앞(+Z)의 phi
/** 얼굴 앞을 gap(라디안)만큼 비운 옆·뒤 범위 [시작, 길이] */
const sidesBack = (gap: number): [number, number] => [FRONT + gap, Math.PI * 2 - gap * 2];

interface EyeOpt {
  x: number;
  y: number;
  w: number;
  h: number;
  iris: number;
  lid: number;
  lower?: number;
}

function yawAt(hd: Head, x: number) {
  return Math.asin(Math.max(-0.7, Math.min(0.7, x / (hd.R * hd.sc[0]))));
}

function eyes(g: THREE.Object3D, hd: Head, o: EyeOpt, skin: THREE.Material, mk: Mk) {
  const white = mk(0xffffff);
  const black = mk(0x111111);
  const iris = mk(o.iris);
  for (const sx of [-1, 1]) {
    const x = sx * o.x;
    const e = new THREE.Group();
    e.position.set(x, o.y, hd.z(x, o.y) - o.w * 0.12);
    e.rotation.y = yawAt(hd, x);
    g.add(e);
    ell(e, o.w, white, [0, 0, 0], [1, o.h, 0.45]);
    ell(e, o.w * 0.5, iris, [0, -o.w * 0.08, o.w * 0.32], [1, 1, 0.5]);
    ell(e, o.w * 0.23, black, [0, -o.w * 0.08, o.w * 0.45], [1, 1, 0.5]);
    if (o.lid > 0) ell(e, o.w * 1.1, skin, [0, o.w * o.h * (1.15 - o.lid * 0.9), o.w * 0.06], [1.05, o.h * 0.75, 0.55]);
    if (o.lower) ell(e, o.w * 1.07, skin, [0, -o.w * o.h * (1.25 - o.lower * 0.8), o.w * 0.05], [1.05, o.h * 0.6, 0.55]);
  }
}

function brows(g: THREE.Object3D, hd: Head, x: number, y: number, w: number, t: number, col: number, tilt: number, mk: Mk) {
  const m = mk(col);
  for (const sx of [-1, 1]) {
    const bx = sx * x;
    bar(g, w, t, t * 1.2, m, [bx, y, hd.z(bx, y) + t * 0.1], sx * -tilt, 0, yawAt(hd, bx));
  }
}

export function buildFace(head: THREE.Group, face: NonNullable<CharLook['face']>, L: CharLook, skin: THREE.Material, mk: Mk) {
  const hairMat = mk(L.hair, { side: THREE.DoubleSide });
  switch (face) {
    // ------------------------------------------------ 블라디미르 푸틴: 좁은 턱, 뒤로 물러난 옅은 머리, 처진 눈, 얇은 입술
    case 'putin': {
      const hd = skull(head, L, skin, [0.9, 1.08, 0.98], 0.62, 0.9);
      const R = hd.R;
      eyes(head, hd, { x: R * 0.3, y: R * 0.18, w: R * 0.14, h: 0.7, iris: 0x7b97b5, lid: 0.6 }, skin, mk);
      brows(head, hd, R * 0.3, R * 0.37, R * 0.34, R * 0.045, 0xa98d6c, 0.06, mk);
      ell(head, R * 0.11, skin, [0, -R * 0.02, hd.z(0, -R * 0.02)], [0.75, 1.9, 0.9], [-0.25, 0, 0]);
      ell(head, R * 0.11, skin, [0, -R * 0.24, hd.z(0, -R * 0.24) + R * 0.05]);
      const lip = mk(0xa86868);
      const my = -R * 0.52;
      bar(head, R * 0.38, R * 0.035, R * 0.05, lip, [0, my, hd.z(0, my)]);
      for (const sx of [-1, 1]) bar(head, R * 0.08, R * 0.03, R * 0.05, lip, [sx * R * 0.21, my - R * 0.03, hd.z(sx * R * 0.21, my - R * 0.03)], sx * 0.5);
      // 옆·뒤통수만 남은 머리. 이마와 정수리 앞은 맨살
      const [ps, pl] = sidesBack(0.95);
      hd.shell(hairMat, 1.03, ps, pl, 0.75, 1.72);
      // 정수리 뒤쪽 성긴 머리
      const [ps2, pl2] = sidesBack(1.7);
      hd.shell(mk(0xc9b08e, { side: THREE.DoubleSide }), 1.025, ps2, pl2, 0.3, 0.8);
      break;
    }
    // ------------------------------------------------ 도널드 트럼프: 넓은 턱살, 부풀린 금발, 눈가 밝은 피부, 내민 입
    case 'trump': {
      const hd = skull(head, L, skin, [1.04, 1.02, 1.0], 1.0, 1.1);
      const R = hd.R;
      ell(head, R * 0.42, skin, [0, -R * 0.92, R * 0.12], [1.35, 0.5, 1.0]);
      const pale = mk(0xf3d0ad);
      for (const sx of [-1, 1]) {
        const x = sx * R * 0.3;
        const p = ell(head, R * 0.21, pale, [x, R * 0.16, hd.z(x, R * 0.16) - R * 0.07], [1.25, 0.9, 0.35]);
        p.rotation.y = yawAt(hd, x);
      }
      eyes(head, hd, { x: R * 0.3, y: R * 0.16, w: R * 0.13, h: 0.65, iris: 0x5b80a8, lid: 0.6, lower: 0.5 }, pale, mk);
      brows(head, hd, R * 0.3, R * 0.37, R * 0.38, R * 0.07, 0xdcc07a, 0.12, mk);
      ell(head, R * 0.15, skin, [0, -R * 0.08, hd.z(0, -R * 0.08) + R * 0.03], [1, 1.15, 1]);
      for (const sx of [-1, 1]) ell(head, R * 0.07, skin, [sx * R * 0.12, -R * 0.2, hd.z(sx * R * 0.12, -R * 0.2)]);
      const my = -R * 0.52;
      const lips = new THREE.Mesh(new THREE.TorusGeometry(R * 0.1, R * 0.05, 8, 16), mk(0xc97f6a));
      lips.position.set(0, my, hd.z(0, my) + R * 0.03);
      lips.scale.set(1.2, 0.85, 1);
      head.add(lips);
      ell(head, R * 0.08, mk(0x5a2020), [0, my, hd.z(0, my) + R * 0.01], [1.1, 0.7, 0.4]);
      // 금발: 부풀린 윗머리 + 이마 위로 넘긴 앞머리 + 뒤로 빗은 옆머리
      hd.shell(hairMat, 1.07, 0, Math.PI * 2, 0, 1.1);
      const [ps, pl] = sidesBack(1.05);
      hd.shell(hairMat, 1.08, ps, pl, 0.9, 1.6);
      ell(head, R * 0.85, hairMat, [R * 0.05, R * 0.85, R * 0.42], [1.4, 0.5, 0.9], [0.2, 0, -0.1], true);
      ell(head, R * 0.5, mk(0xfbe39a), [R * 0.2, R * 1.1, R * 0.45], [1.6, 0.28, 0.7], [0.15, 0, -0.1]);
      ell(head, R * 0.72, hairMat, [0, R * 0.92, -R * 0.22], [1.35, 0.5, 1.1], [0, 0, 0], true);
      break;
    }
    // ------------------------------------------------ 김정은: 둥근 얼굴, 옆을 바짝 민 머리 + 볼륨 있는 윗머리
    case 'kim': {
      const hd = skull(head, L, skin, [1.12, 0.98, 1.0], 1.08, 1.14);
      const R = hd.R;
      ell(head, R * 0.44, skin, [0, -R * 0.88, R * 0.1], [1.4, 0.5, 1.0]);
      eyes(head, hd, { x: R * 0.3, y: R * 0.12, w: R * 0.12, h: 0.55, iris: 0x2a1a10, lid: 0.35 }, skin, mk);
      brows(head, hd, R * 0.3, R * 0.3, R * 0.3, R * 0.045, 0x151515, 0.05, mk);
      ell(head, R * 0.14, skin, [0, -R * 0.12, hd.z(0, -R * 0.12) + R * 0.02], [1.25, 0.95, 0.9]);
      const my = -R * 0.5;
      bar(head, R * 0.28, R * 0.045, R * 0.05, mk(0xa86a60), [0, my, hd.z(0, my)]);
      // 바짝 민 옆·뒷머리 (회색빛)
      const [ps, pl] = sidesBack(0.9);
      hd.shell(mk(0x4a4a50, { side: THREE.DoubleSide }), 1.012, ps, pl, 0.55, 1.6);
      // 볼륨 있게 뒤로 넘긴 윗머리, 앞이 높다
      hd.shell(hairMat, 1.05, 0, Math.PI * 2, 0, 0.62);
      ell(head, R * 0.62, hairMat, [0, R * 0.98, R * 0.34], [1.4, 0.55, 0.8], [-0.4, 0, 0], true);
      ell(head, R * 0.72, hairMat, [0, R * 1.0, -R * 0.15], [1.3, 0.45, 1.05], [0, 0, 0], true);
      break;
    }
    // ------------------------------------------------ 이재명: 갸름한 얼굴, 옆가르마 짧은 머리 + 희끗한 옆머리, 웃는 눈
    case 'lee': {
      const hd = skull(head, L, skin, [0.93, 1.1, 0.98], 0.68, 0.92);
      const R = hd.R;
      eyes(head, hd, { x: R * 0.3, y: R * 0.17, w: R * 0.13, h: 0.7, iris: 0x2a1a10, lid: 0.35, lower: 0.55 }, skin, mk);
      brows(head, hd, R * 0.31, R * 0.38, R * 0.38, R * 0.065, 0x1a1a1a, 0.18, mk);
      ell(head, R * 0.11, skin, [0, -R * 0.02, hd.z(0, -R * 0.02)], [0.85, 1.7, 0.9], [-0.2, 0, 0]);
      ell(head, R * 0.11, skin, [0, -R * 0.22, hd.z(0, -R * 0.22) + R * 0.05]);
      const my = -R * 0.4;
      const smile = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.035, 6, 16, Math.PI * 0.8), mk(0xa85f5f));
      smile.position.set(0, my, hd.z(0, my - R * 0.12) + R * 0.005);
      smile.rotation.z = Math.PI + Math.PI * 0.1;
      head.add(smile);
      // 안경: 얇은 테 + 코받침 다리 + 귀까지 이어지는 다리
      {
        const gm = mk(0x2b2b30);
        const ey = R * 0.17;
        for (const sx of [-1, 1]) {
          const x = sx * R * 0.3;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.165, R * 0.018, 6, 20), gm);
          rim.position.set(x, ey, hd.z(x, ey) + R * 0.05);
          rim.rotation.y = yawAt(hd, x);
          rim.scale.set(1.1, 0.85, 1);
          head.add(rim);
          const ex = sx * R * 0.48;
          const ez = hd.z(ex, ey);
          const len = R * 0.75;
          bar(head, R * 0.025, R * 0.025, len, gm, [sx * R * 0.6, ey, ez - len / 2 + R * 0.05], 0, 0, sx * -0.25);
        }
        bar(head, R * 0.24, R * 0.022, R * 0.022, gm, [0, ey + R * 0.03, hd.z(0, ey) + R * 0.06]);
      }
      // 짧은 머리: 윗 캡 + 옆·뒤
      hd.shell(hairMat, 1.05, 0, Math.PI * 2, 0, 0.95);
      const [ps, pl] = sidesBack(1.15);
      hd.shell(hairMat, 1.045, ps, pl, 0.85, 1.65);
      // 옆가르마로 넘긴 앞머리
      ell(head, R * 0.45, hairMat, [-R * 0.15, R * 0.93, R * 0.44], [1.5, 0.28, 0.6], [0.4, 0, 0.18]);
      // 희끗한 옆머리
      const gray = mk(0x6f6f74, { side: THREE.DoubleSide });
      hd.shell(gray, 1.05, FRONT + 1.15, 0.45, 1.25, 1.6);
      hd.shell(gray, 1.05, FRONT - 1.15 - 0.45 + Math.PI * 2, 0.45, 1.25, 1.6);
      break;
    }
  }
}

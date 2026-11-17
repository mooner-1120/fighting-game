// 인물별 캐리커처 얼굴. 기본 도형만으로 각 인물의 특징(헤어라인·얼굴형·눈·입)을 과장해서 만든다.
// 머리통은 회전체(lathe)이고, 눈·코·입·머리카락은 모두 그 표면 위치를 계산해 붙인다.
import * as THREE from 'three';
import type { CharLook } from '../sim/chardef';
import { ghutraTexture } from './propMeshes';

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
  /** 머리통 윤곽을 그대로 따르는 띠 (수염 등). y0~y1: -1(턱)~1(정수리), phi 0 = 얼굴 앞 */
  band(mat: THREE.Material, grow: number, phiStart: number, phiLen: number, y0: number, y1: number): THREE.Mesh;
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
    band(mat, grow, phiStart, phiLen, y0, y1) {
      const bp: THREE.Vector2[] = [];
      for (let i = 0; i <= 20; i++) {
        const y = y0 + ((y1 - y0) * i) / 20;
        bp.push(new THREE.Vector2(Math.max(0.0001, prof(y)) * R * grow, y * R));
      }
      const b = new THREE.Mesh(new THREE.LatheGeometry(bp, 32, phiStart, phiLen), mat);
      b.scale.set(...sc);
      g.add(b);
      return b;
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
    // ------------------------------------------------ 마거릿 대처: 볼륨 있는 금발 헬멧 단발, 파란 아이섀도, 아치형 눈썹, 곧은 코, 붉은 입술
    case 'thatcher': {
      const hd = skull(head, L, skin, [0.92, 1.08, 0.97], 0.66, 0.9);
      const R = hd.R;
      // 볼 터치
      const blush = mk(0xf0b0a8);
      for (const sx of [-1, 1]) {
        const x = sx * R * 0.42;
        const b = ell(head, R * 0.13, blush, [x, -R * 0.2, hd.z(x, -R * 0.2) - R * 0.06], [1.3, 0.8, 0.3]);
        b.rotation.y = yawAt(hd, x);
      }
      // 아이섀도를 바른 눈꺼풀
      eyes(head, hd, { x: R * 0.29, y: R * 0.17, w: R * 0.13, h: 0.78, iris: 0x4f7fb8, lid: 0.5 }, mk(0xa9b6dc), mk);
      // 아치형 눈썹
      {
        const bm = mk(0x8a6a3c);
        for (const sx of [-1, 1]) {
          const x = sx * R * 0.3;
          const y = R * 0.33;
          const arc = new THREE.Mesh(new THREE.TorusGeometry(R * 0.17, R * 0.025, 5, 12, Math.PI * 0.7), bm);
          arc.position.set(x, y - R * 0.12, hd.z(x, y) - R * 0.01);
          arc.rotation.set(0, yawAt(hd, x), Math.PI * 0.15);
          head.add(arc);
        }
      }
      // 길고 곧은 코
      ell(head, R * 0.1, skin, [0, -R * 0.02, hd.z(0, -R * 0.02)], [0.7, 2.0, 1.0], [-0.3, 0, 0]);
      ell(head, R * 0.1, skin, [0, -R * 0.24, hd.z(0, -R * 0.24) + R * 0.06], [0.95, 0.9, 1]);
      // 붉은 입술 (살짝 다문 미소)
      const lip = mk(0xc23a4a);
      const my = -R * 0.5;
      ell(head, R * 0.16, lip, [0, my + R * 0.02, hd.z(0, my) - R * 0.02], [1.15, 0.26, 0.4]);
      ell(head, R * 0.15, lip, [0, my - R * 0.035, hd.z(0, my) - R * 0.025], [1.05, 0.3, 0.4]);
      // 진주 귀걸이
      if (L.pearls) {
        const pearl = mk(0xfaf6ee, { emissive: 0x222018 });
        for (const sx of [-1, 1]) ell(head, R * 0.075, pearl, [sx * R * 0.86, -R * 0.42, R * 0.05]);
      }
      // 금발 헬멧: 크게 부풀린 윗머리 + 귀를 덮는 옆·뒷머리 + 이마 위로 넘긴 앞머리 웨이브
      hd.shell(hairMat, 1.16, 0, Math.PI * 2, 0, 1.2);
      const [ps, pl] = sidesBack(0.92);
      hd.shell(hairMat, 1.17, ps, pl, 0.9, 2.05);
      ell(head, R * 0.95, hairMat, [0, R * 1.0, -R * 0.12], [1.22, 0.62, 1.15], [0, 0, 0], true);
      ell(head, R * 0.62, hairMat, [R * 0.12, R * 0.92, R * 0.52], [1.55, 0.55, 0.85], [0.35, 0, -0.18], true);
      ell(head, R * 0.45, hairMat, [-R * 0.42, R * 0.78, R * 0.55], [1.0, 0.6, 0.8], [0.3, 0, 0.3], true);
      // 바깥으로 말린 옆머리 끝
      for (const sx of [-1, 1]) ell(head, R * 0.36, hairMat, [sx * R * 0.98, -R * 0.36, -R * 0.12], [0.75, 0.55, 1.5], [0, 0, sx * 0.4], true);
      ell(head, R * 0.62, hairMat, [0, -R * 0.38, -R * 0.75], [1.6, 0.6, 0.7], [0, 0, 0], true);
      // 하이라이트
      ell(head, R * 0.4, mk(0xf2dca2), [R * 0.2, R * 1.12, R * 0.48], [1.5, 0.3, 0.6], [0.35, 0, -0.18]);
      break;
    }
    // ------------------------------------------------ 시진핑: 넓고 둥근 얼굴, 이중 턱, 가는 눈, 넓은 이마, 단정히 넘긴 검은 머리
    case 'xi': {
      const hd = skull(head, L, skin, [1.15, 0.98, 1.0], 1.06, 1.17);
      const R = hd.R;
      ell(head, R * 0.46, skin, [0, -R * 0.86, R * 0.12], [1.45, 0.5, 1.0]);
      // 통통한 볼
      for (const sx of [-1, 1]) ell(head, R * 0.32, skin, [sx * R * 0.6, -R * 0.3, R * 0.5], [1, 0.9, 0.8]);
      eyes(head, hd, { x: R * 0.31, y: R * 0.12, w: R * 0.12, h: 0.48, iris: 0x23160e, lid: 0.45, lower: 0.35 }, skin, mk);
      brows(head, hd, R * 0.32, R * 0.3, R * 0.32, R * 0.045, 0x141414, -0.06, mk);
      // 넓적한 코
      ell(head, R * 0.14, skin, [0, -R * 0.12, hd.z(0, -R * 0.12) + R * 0.03], [1.35, 0.95, 0.85]);
      for (const sx of [-1, 1]) ell(head, R * 0.07, skin, [sx * R * 0.13, -R * 0.2, hd.z(sx * R * 0.13, -R * 0.2) + R * 0.01]);
      // 작게 다문 미소
      const my = -R * 0.46;
      const smile = new THREE.Mesh(new THREE.TorusGeometry(R * 0.15, R * 0.03, 6, 14, Math.PI * 0.7), mk(0xa3655a));
      smile.position.set(0, my + R * 0.08, hd.z(0, my) + R * 0.01);
      smile.rotation.z = Math.PI + Math.PI * 0.15;
      head.add(smile);
      // 넓은 이마 위로 단정히 넘긴 머리
      hd.shell(hairMat, 1.05, 0, Math.PI * 2, 0, 0.78);
      const [ps, pl] = sidesBack(1.05);
      hd.shell(hairMat, 1.045, ps, pl, 0.6, 1.55);
      ell(head, R * 0.62, hairMat, [-R * 0.05, R * 0.9, R * 0.28], [1.5, 0.45, 1.0], [-0.25, 0, 0.05], true);
      ell(head, R * 0.35, mk(0x2a2a30), [-R * 0.18, R * 1.08, R * 0.32], [1.6, 0.18, 0.7], [-0.3, 0, 0.05]);
      break;
    }
    // ------------------------------------------------ 무함마드 빈 살만: 빨강·흰 체크 구트라 + 검은 이칼, 짙은 눈썹, 짧은 검은 수염
    case 'mbs': {
      const hd = skull(head, L, skin, [0.98, 1.08, 1.0], 0.86, 1.0);
      const R = hd.R;
      eyes(head, hd, { x: R * 0.3, y: R * 0.15, w: R * 0.135, h: 0.68, iris: 0x2a1608, lid: 0.45 }, skin, mk);
      brows(head, hd, R * 0.31, R * 0.34, R * 0.38, R * 0.075, 0x111111, 0.08, mk);
      // 큰 코
      ell(head, R * 0.12, skin, [0, -R * 0.04, hd.z(0, -R * 0.04)], [0.85, 1.8, 1.05], [-0.25, 0, 0]);
      ell(head, R * 0.13, skin, [0, -R * 0.26, hd.z(0, -R * 0.26) + R * 0.06]);
      // 짧은 수염: 턱선을 따라 + 콧수염 + 구레나룻
      const beard = mk(0x161210, { side: THREE.DoubleSide });
      hd.band(beard, 1.03, -1.7, 3.4, -1, -0.5);
      for (const sx of [-1, 1]) hd.band(beard, 1.03, sx > 0 ? 1.25 : -1.7, 0.45, -0.55, 0.05);
      ell(head, R * 0.17, beard, [0, -R * 0.37, hd.z(0, -R * 0.37) + R * 0.02], [1.45, 0.26, 0.5]);
      // 입술 (수염 사이)
      ell(head, R * 0.11, mk(0x8a4a40), [0, -R * 0.52, hd.z(0, -R * 0.52) + R * 0.05], [1.2, 0.35, 0.5]);
      // 구트라: 머리를 덮는 천 + 어깨까지 늘어진 자락 (얼굴 앞은 트임)
      const cloth = mk(0xffffff, { map: ghutraTexture(), side: THREE.DoubleSide });
      hd.shell(cloth, 1.12, 0, Math.PI * 2, 0, 1.3);
      {
        const gap = 0.95;
        const drape = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.75, R * 2.3, 28, 1, true, gap, Math.PI * 2 - gap * 2), cloth);
        drape.position.set(0, -R * 0.7, -R * 0.05);
        drape.scale.set(hd.sc[0], 1, hd.sc[2] * 1.05);
        head.add(drape);
        // 이마 위 접힌 테두리
        const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, R * 0.07, 6, 28, Math.PI * 0.75), cloth);
        brim.position.set(0, R * 0.52, 0);
        brim.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.125);
        brim.scale.set(hd.sc[0], hd.sc[2], 1);
        head.add(brim);
      }
      // 검은 이칼 두 줄
      const agal = mk(0x0d0d0d);
      for (const [y, r] of [[0.72, 0.86], [0.82, 0.78]] as const) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(R * r, R * 0.07, 8, 28), agal);
        t.position.set(0, R * y, -R * 0.06);
        t.rotation.x = Math.PI / 2 + 0.22;
        t.scale.set(hd.sc[0] * 1.08, hd.sc[2] * 1.08, 1);
        head.add(t);
      }
      break;
    }
    // ------------------------------------------------ 에마뉘엘 마크롱: 갸름한 얼굴, 옆가르마 갈색 짧은 머리, 파란 눈, 큰 귀, 자신만만한 미소
    case 'macron': {
      const hd = skull(head, L, skin, [0.9, 1.1, 0.97], 0.7, 0.9);
      const R = hd.R;
      for (const sx of [-1, 1]) ell(head, R * 0.26, skin, [sx * R * 0.88, -R * 0.02, -R * 0.08], [0.38, 1.05, 0.7], [0, sx * 0.35, 0], true, 10);
      eyes(head, hd, { x: R * 0.29, y: R * 0.17, w: R * 0.135, h: 0.78, iris: 0x4d86c7, lid: 0.28 }, skin, mk);
      brows(head, hd, R * 0.3, R * 0.39, R * 0.34, R * 0.055, 0x3e2c1e, -0.12, mk);
      ell(head, R * 0.1, skin, [0, -R * 0.02, hd.z(0, -R * 0.02)], [0.8, 1.85, 1.0], [-0.25, 0, 0]);
      ell(head, R * 0.1, skin, [0, -R * 0.23, hd.z(0, -R * 0.23) + R * 0.055]);
      const my = -R * 0.42;
      const smile = new THREE.Mesh(new THREE.TorusGeometry(R * 0.17, R * 0.03, 6, 16, Math.PI * 0.75), mk(0xb0706a));
      smile.position.set(0, my, hd.z(0, my - R * 0.1) + R * 0.005);
      smile.rotation.z = Math.PI + Math.PI * 0.125;
      head.add(smile);
      // 턱 보조개
      ell(head, R * 0.05, mk(0xe0bba0), [0, -R * 0.78, hd.z(0, -R * 0.78) - R * 0.01], [1, 0.6, 0.4]);
      // 짧은 갈색 머리 + 옆가르마로 넘긴 앞머리
      hd.shell(hairMat, 1.05, 0, Math.PI * 2, 0, 0.92);
      const [ps, pl] = sidesBack(1.18);
      hd.shell(hairMat, 1.04, ps, pl, 0.8, 1.6);
      ell(head, R * 0.5, hairMat, [R * 0.12, R * 0.92, R * 0.42], [1.55, 0.3, 0.65], [0.4, 0, -0.22], true);
      // 가르마
      bar(head, R * 0.035, R * 0.02, R * 0.9, mk(0xd9b89a), [-R * 0.36, R * 0.98, R * 0.05], 0.4, 0, 0);
      break;
    }
  }
}

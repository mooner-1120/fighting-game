// 새 캐릭터(대처·시진핑·빈 살만·마크롱)의 손 소품, 투사체, 궁극기 소품을 기본 도형으로 만든다 (외부 에셋 없음).
// 재질은 호출하는 쪽의 mk(색) 함수로 만든다 — 캐릭터 모델은 피격 플래시용으로 재질을 모아 둔다.
import * as THREE from 'three';

export type Mk = (c: number, extra?: THREE.MeshToonMaterialParameters) => THREE.Material;
type V3 = [number, number, number];

function mesh(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], sc: V3 = [1, 1, 1]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...sc);
  g.add(m);
  return m;
}

/** 글자 판 텍스처 (피켓·간판용) */
export function labelTexture(text: string, bg: string, fg: string, w = 256, h = 128, font?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font ?? `bold ${Math.floor(h * 0.42)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let ghutraTex: THREE.CanvasTexture | null = null;
/** 빨강·흰 체크 구트라 무늬 */
export function ghutraTexture(): THREE.CanvasTexture {
  if (ghutraTex) return ghutraTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f2ec';
  g.fillRect(0, 0, 128, 128);
  const n = 8;
  const s = 128 / n;
  g.fillStyle = '#c4161c';
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if ((i + j) % 2 === 0) g.fillRect(i * s + s * 0.15, j * s + s * 0.15, s * 0.7, s * 0.7);
    }
  // 가는 격자선
  g.strokeStyle = 'rgba(160,10,20,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 128);
    g.moveTo(0, i * s);
    g.lineTo(128, i * s);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 3);
  ghutraTex = t;
  return t;
}

// ================================================================ 손 소품 (손 기준: -Y가 주먹 바깥, 팔 방향)

/** 대처 장우산 (접힌 검은 우산, 손잡이는 나무 갈고리) */
export function makeUmbrella(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const wood = mk(0x6b3e1f);
  const crook = new THREE.TorusGeometry(0.06, 0.016, 6, 14, Math.PI);
  mesh(g, crook, wood, [0, 0.06, -0.06], [0, Math.PI / 2, 0]);
  mesh(g, new THREE.CylinderGeometry(0.016, 0.016, 0.12, 6), wood, [0, 0.0, 0]);
  const shaft = new THREE.CylinderGeometry(0.011, 0.011, 1.05, 6);
  mesh(g, shaft, mk(0x2a2a2a), [0, -0.55, 0]);
  // 접힌 우산 천: 길쭉한 원뿔 두 개
  const black = mk(0x15161c);
  mesh(g, new THREE.ConeGeometry(0.075, 0.55, 8), black, [0, -0.62, 0], [Math.PI, 0, 0]);
  mesh(g, new THREE.ConeGeometry(0.075, 0.12, 8), black, [0, -0.3, 0]);
  const strap = new THREE.TorusGeometry(0.078, 0.012, 4, 10);
  mesh(g, strap, mk(0x3a3a46), [0, -0.5, 0], [Math.PI / 2, 0, 0]);
  mesh(g, new THREE.CylinderGeometry(0.008, 0.004, 0.1, 6), mk(0xd8d8d8), [0, -1.1, 0]);
  return g;
}

/** 찻잔 + 받침 (위가 +Y인 똑바로 선 모양) */
export function makeTeacup(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const china = mk(0xfdfbf6);
  mesh(g, new THREE.CylinderGeometry(0.11, 0.08, 0.02, 16), china, [0, -0.01, 0]);
  mesh(g, new THREE.CylinderGeometry(0.075, 0.05, 0.08, 16, 1, true), mk(0xfdfbf6, { side: THREE.DoubleSide }), [0, 0.04, 0]);
  mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.005, 12), china, [0, 0.003, 0]);
  mesh(g, new THREE.CylinderGeometry(0.068, 0.068, 0.006, 14), mk(0x8a4b22), [0, 0.066, 0]);
  mesh(g, new THREE.TorusGeometry(0.077, 0.006, 4, 18), mk(0x2f5bb7), [0, 0.07, 0], [Math.PI / 2, 0, 0]);
  mesh(g, new THREE.TorusGeometry(0.028, 0.008, 6, 10), china, [0.085, 0.045, 0]);
  return g;
}

/** 대처 핸드백 (손잡이를 쥔 손 아래로 매달림, 위가 +Y) */
export function makeHandbag(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const leather = mk(0x1b1b22);
  mesh(g, new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), leather, [0, -0.06, 0]);
  const body = mesh(g, new THREE.BoxGeometry(0.26, 0.18, 0.09), leather, [0, -0.16, 0]);
  body.geometry.translate(0, 0, 0);
  mesh(g, new THREE.BoxGeometry(0.27, 0.05, 0.095), mk(0x2a2a33), [0, -0.085, 0]);
  mesh(g, new THREE.BoxGeometry(0.04, 0.025, 0.02), mk(0xe8c547), [0, -0.1, 0.05]);
  return g;
}

/** 시진핑 드론 조종기 */
export function makeController(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const body = mk(0x2b2e36);
  mesh(g, new THREE.BoxGeometry(0.22, 0.03, 0.12), body, [0, -0.05, 0.05]);
  for (const sx of [-1, 1]) mesh(g, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6), mk(0x111111), [sx * 0.06, -0.02, 0.06]);
  mesh(g, new THREE.BoxGeometry(0.1, 0.005, 0.06), mk(0xd8302f, { emissive: 0x551010 }), [0, -0.033, 0.07]);
  mesh(g, new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4), mk(0x888888), [0.09, 0.03, -0.02], [-0.3, 0, 0]);
  return g;
}

/** 마크롱 레이피어: 가는 칼날 + 종 모양 손보호대 */
export function makeRapier(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const steel = mk(0xe4e8ef, { emissive: 0x222630 });
  mesh(g, new THREE.CylinderGeometry(0.006, 0.003, 1.0, 6), steel, [0, -0.6, 0]);
  const bell = new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  mesh(g, bell, mk(0xd4af37, { side: THREE.DoubleSide }), [0, -0.1, 0], [Math.PI, 0, 0]);
  mesh(g, new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), mk(0xd4af37), [0, -0.1, 0], [0, 0, Math.PI / 2]);
  mesh(g, new THREE.SphereGeometry(0.022, 8, 6), mk(0xd4af37), [0, 0.07, 0]);
  return g;
}

/** 바게트 (긴 축이 +Y) */
export function makeBaguette(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const crust = mk(0xc98a3c);
  mesh(g, new THREE.CapsuleGeometry(0.05, 0.5, 4, 10), crust, [0, 0, 0], [0, 0, 0], [1, 1, 0.85]);
  const cut = mk(0xf0d29a);
  for (let i = 0; i < 4; i++) {
    mesh(g, new THREE.SphereGeometry(0.03, 8, 6), cut, [0, -0.18 + i * 0.12, 0.038], [0.4, 0, 0], [0.7, 1.6, 0.35]);
  }
  return g;
}

/** 와인 잔 (위가 +Y) */
export function makeWineGlass(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const glass = mk(0xf2f8ff, { transparent: true, opacity: 0.55 });
  mesh(g, new THREE.SphereGeometry(0.065, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), glass, [0, 0.2, 0]);
  mesh(g, new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), mk(0xb0183f, { emissive: 0x300008 }), [0, 0.2, 0]);
  mesh(g, new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), glass, [0, 0.085, 0]);
  mesh(g, new THREE.CylinderGeometry(0.045, 0.05, 0.008, 12), glass, [0, 0.02, 0]);
  return g;
}

/** 매: wings=true면 날개를 편다. 앞이 +Z, 위가 +Y. 날개 그룹 이름 wingL/wingR */
export function makeFalcon(mk: Mk, wings = false): THREE.Group {
  const g = new THREE.Group();
  const brown = mk(0x7a5a3c);
  const cream = mk(0xeadfc8);
  const dark = mk(0x3b2a1c);
  mesh(g, new THREE.SphereGeometry(0.1, 12, 10), brown, [0, 0.1, 0], [0.5, 0, 0], [0.85, 1.35, 0.9]);
  mesh(g, new THREE.SphereGeometry(0.075, 10, 8), cream, [0, 0.07, 0.05], [0.5, 0, 0], [0.8, 1.2, 0.6]);
  mesh(g, new THREE.SphereGeometry(0.07, 12, 10), brown, [0, 0.24, 0.05]);
  mesh(g, new THREE.SphereGeometry(0.045, 10, 8), cream, [0, 0.225, 0.08], [0, 0, 0], [1.1, 0.8, 0.6]);
  mesh(g, new THREE.ConeGeometry(0.025, 0.06, 6), mk(0xe8b830), [0, 0.225, 0.13], [Math.PI / 2 + 0.5, 0, 0]);
  for (const sx of [-1, 1]) {
    mesh(g, new THREE.SphereGeometry(0.015, 8, 6), mk(0x111111), [sx * 0.04, 0.25, 0.1]);
    mesh(g, new THREE.SphereGeometry(0.022, 8, 6), mk(0xf0c040), [sx * 0.04, 0.25, 0.095], [0, 0, 0], [1, 1, 0.4]);
  }
  // 꼬리
  mesh(g, new THREE.BoxGeometry(0.09, 0.015, 0.16), dark, [0, 0.0, -0.13], [0.6, 0, 0]);
  // 발
  for (const sx of [-1, 1]) mesh(g, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 5), mk(0xe8b830), [sx * 0.03, -0.01, 0.01]);
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.name = sx > 0 ? 'wingL' : 'wingR';
    w.position.set(sx * 0.06, 0.15, 0.0);
    g.add(w);
    if (wings) {
      // 나는 자세용 날개: 몸을 앞으로 눕혔을 때 수평이 되도록 xy 평면에 편다 (날갯짓은 y축 회전)
      mesh(w, new THREE.BoxGeometry(0.34, 0.14, 0.015), brown, [sx * 0.17, 0, 0]);
      mesh(w, new THREE.BoxGeometry(0.16, 0.1, 0.012), dark, [sx * 0.38, -0.02, 0], [0, 0, sx * 0.25]);
    } else {
      mesh(w, new THREE.SphereGeometry(0.08, 10, 8), dark, [0, -0.02, -0.04], [0.5, 0, 0], [0.4, 1.4, 1.2]);
    }
  }
  return g;
}

/** 빈 살만 금색 슈퍼카 (오픈카, 앞이 +Z) */
export function makeSupercar(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const gold = mk(0xe3b53a, { emissive: 0x3a2a00 });
  const black = mk(0x111111);
  // 낮은 차체: 앞 쐐기 + 몸통 + 뒤
  mesh(g, new THREE.BoxGeometry(0.95, 0.28, 1.2), gold, [0, 0.3, -0.15]);
  const nose = new THREE.CylinderGeometry(0.01, 0.48, 0.95, 4, 1);
  mesh(g, nose, gold, [0, 0.28, 0.85], [Math.PI / 2, Math.PI / 4, 0], [1.0, 1, 0.35]);
  mesh(g, new THREE.BoxGeometry(0.95, 0.2, 0.5), gold, [0, 0.42, -0.6]);
  // 앞유리
  mesh(g, new THREE.BoxGeometry(0.85, 0.3, 0.02), mk(0x9fd3ff, { transparent: true, opacity: 0.5 }), [0, 0.55, 0.35], [-0.6, 0, 0]);
  // 스포일러
  mesh(g, new THREE.BoxGeometry(1.0, 0.03, 0.18), black, [0, 0.62, -0.82]);
  for (const sx of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.03, 0.14, 0.05), black, [sx * 0.35, 0.55, -0.82]);
  // 바퀴
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = mesh(g, new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14), black, [sx * 0.5, 0.17, sz * 0.62 + 0.05], [0, 0, Math.PI / 2]);
      w.name = 'wheel';
      mesh(g, new THREE.CylinderGeometry(0.09, 0.09, 0.13, 8), mk(0xdddddd), [sx * 0.5, 0.17, sz * 0.62 + 0.05], [0, 0, Math.PI / 2]);
    }
  // 전조등
  for (const sx of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.16, 0.04, 0.04), mk(0xffffff, { emissive: 0xffffaa }), [sx * 0.28, 0.32, 1.12], [0, sx * 0.4, 0]);
  return g;
}

// ================================================================ 투사체·궁극기 소품

/** 빨간 런던 이층버스 (길이 방향 +Z) */
export function makeBus(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const red = mk(0xd21f1f);
  const glass = mk(0x26303c);
  const L = 2.6;
  mesh(g, new THREE.BoxGeometry(1.0, 1.6, L), red, [0, 1.0, 0]);
  // 창문 두 줄 + 흰 띠
  for (const y of [0.85, 1.45]) {
    for (const sx of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.02, 0.32, L * 0.88), glass, [sx * 0.51, y, 0]);
    mesh(g, new THREE.BoxGeometry(0.88, 0.32, 0.02), glass, [0, y, L / 2 + 0.005]);
  }
  for (const sx of [-1, 1]) mesh(g, new THREE.BoxGeometry(0.02, 0.06, L), mk(0xf2efe6), [sx * 0.515, 1.13, 0]);
  // 지붕
  mesh(g, new THREE.BoxGeometry(1.02, 0.06, L + 0.02), mk(0xb81a1a), [0, 1.82, 0]);
  // 행선지 표시
  const sign = new THREE.MeshBasicMaterial({ map: labelTexture('WESTMINSTER', '#111', '#ffcc33', 256, 48) });
  mesh(g, new THREE.PlaneGeometry(0.8, 0.13), sign, [0, 1.7, L / 2 + 0.012]);
  // 바퀴
  const black = mk(0x111111);
  for (const sx of [-1, 1]) for (const sz of [-0.85, 0.85]) mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), black, [sx * 0.48, 0.2, sz], [0, 0, Math.PI / 2]);
  // 전조등
  for (const sx of [-1, 1]) mesh(g, new THREE.SphereGeometry(0.06, 8, 6), mk(0xffffff, { emissive: 0xffffaa }), [sx * 0.35, 0.35, L / 2 + 0.01]);
  return g;
}

/** 쿼드콥터 드론 (프로펠러 이름 rotor) */
export function makeDrone(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const body = mk(0x30343c);
  mesh(g, new THREE.BoxGeometry(0.2, 0.07, 0.2), body);
  mesh(g, new THREE.SphereGeometry(0.05, 10, 8), mk(0x111111), [0, -0.05, 0.08]);
  mesh(g, new THREE.SphereGeometry(0.02, 6, 4), mk(0xff2222, { emissive: 0xff0000 }), [0, 0.045, 0.09]);
  const rotorMat = mk(0xdddddd, { transparent: true, opacity: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const ax = Math.sin(a) * 0.2;
    const az = Math.cos(a) * 0.2;
    mesh(g, new THREE.BoxGeometry(0.03, 0.025, 0.26), body, [ax / 2, 0, az / 2], [0, a, 0]);
    mesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), body, [ax, 0.03, az]);
    const r = mesh(g, new THREE.BoxGeometry(0.2, 0.006, 0.025), rotorMat, [ax, 0.06, az]);
    r.name = 'rotor';
  }
  // 빨간 별 표식
  mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.005, 5), mk(0xd8302f), [0, 0.038, -0.03]);
  return g;
}

/** 붉은 격자 데이터 방벽 (폭 w, 높이 h, 바닥 y=0, 정면 +Z) */
export function makeFirewall(mk: Mk, w = 1.4, h = 1.9, label = '방화벽', depth = 0, cell = 0.22): THREE.Group {
  const g = new THREE.Group();
  const glow = mk(0xff3030, { emissive: 0xaa0000 });
  const panel = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const nx = Math.max(3, Math.round(w / cell));
  const ny = Math.max(4, Math.round(h / cell));
  const bt = Math.min(0.03, cell * 0.12);
  // depth > 0: 두께 있는 방벽 (옆에서 봐도 격자가 보이게 앞·뒤·옆면 모두)
  const faces = depth > 0 ? [-depth / 2, depth / 2] : [0];
  if (depth > 0) mesh(g, new THREE.BoxGeometry(w, h, depth), panel, [0, h / 2, 0]);
  else mesh(g, new THREE.PlaneGeometry(w, h), panel, [0, h / 2, 0]);
  for (const z of faces) {
    for (let i = 0; i <= nx; i++) mesh(g, new THREE.BoxGeometry(bt, h, bt), glow, [-w / 2 + (i * w) / nx, h / 2, z]);
    for (let j = 0; j <= ny; j++) mesh(g, new THREE.BoxGeometry(w, bt, bt), glow, [0, (j * h) / ny, z]);
  }
  if (depth > 0) {
    for (const x of [-w / 2, w / 2]) {
      for (let j = 0; j <= ny; j++) mesh(g, new THREE.BoxGeometry(bt, bt, depth), glow, [x, (j * h) / ny, 0]);
      mesh(g, new THREE.BoxGeometry(bt, h, bt), glow, [x, h / 2, 0]);
    }
  }
  // 성가퀴 (만리장성 느낌)
  const n = Math.max(3, Math.round(w / 0.35));
  for (let i = 0; i < n; i++) mesh(g, new THREE.BoxGeometry((w / n) * 0.55, 0.16, 0.1), glow, [-w / 2 + (i + 0.5) * (w / n), h + 0.08, 0]);
  if (!label) return g;
  const tex = labelTexture(label, 'rgba(120,0,0,0.85)', '#ffd34d', 256, 64);
  const sign = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  mesh(g, new THREE.PlaneGeometry(Math.min(1.0, w * 0.7), 0.25), sign, [0, h * 0.72, 0.03]);
  return g;
}

/** 회색 군함 (뱃머리 +Z) */
export function makeWarship(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const grey = mk(0x7d8794);
  const dark = mk(0x4b525c);
  mesh(g, new THREE.BoxGeometry(1.4, 0.9, 6), grey, [0, 0.2, 0]);
  mesh(g, new THREE.CylinderGeometry(0.01, 0.7, 1.6, 4), grey, [0, 0.2, 3.75], [Math.PI / 2, Math.PI / 4, 0], [1, 1, 0.64]);
  mesh(g, new THREE.BoxGeometry(1.45, 0.12, 7.4), dark, [0, -0.15, 0.4]);
  mesh(g, new THREE.BoxGeometry(1.0, 0.8, 1.8), grey, [0, 1.05, -0.4]);
  mesh(g, new THREE.BoxGeometry(0.8, 0.5, 1.0), grey, [0, 1.7, -0.3]);
  mesh(g, new THREE.BoxGeometry(0.82, 0.12, 0.02), mk(0x1a1f26), [0, 1.75, 0.21]);
  mesh(g, new THREE.CylinderGeometry(0.2, 0.25, 0.9, 10), dark, [0, 1.6, -1.6]);
  mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), dark, [0, 2.6, -0.3]);
  for (const z of [1.6, -2.6]) {
    const tur = new THREE.Group();
    tur.position.set(0, 0.8, z);
    tur.name = 'turret';
    g.add(tur);
    mesh(tur, new THREE.CylinderGeometry(0.35, 0.4, 0.3, 12), grey);
    for (const sx of [-1, 1]) mesh(tur, new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), dark, [sx * 0.1, 0.05, z > 0 ? 0.55 : -0.55], [Math.PI / 2, 0, 0]);
  }
  // 깃발 (빨강·흰·파랑)
  const flag = new THREE.Group();
  flag.position.set(0, 3.2, -0.3);
  g.add(flag);
  mesh(flag, new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshBasicMaterial({ color: 0x1f3a8a, side: THREE.DoubleSide }), [0.0, 0, -0.35], [0, Math.PI / 2, 0]);
  mesh(flag, new THREE.PlaneGeometry(0.7, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), [0.002, 0, -0.35], [0, Math.PI / 2, 0]);
  mesh(flag, new THREE.PlaneGeometry(0.09, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), [0.002, 0, -0.35], [0, Math.PI / 2, 0]);
  mesh(flag, new THREE.PlaneGeometry(0.7, 0.05), new THREE.MeshBasicMaterial({ color: 0xc8102e, side: THREE.DoubleSide }), [0.004, 0, -0.35], [0, Math.PI / 2, 0]);
  mesh(flag, new THREE.PlaneGeometry(0.05, 0.4), new THREE.MeshBasicMaterial({ color: 0xc8102e, side: THREE.DoubleSide }), [0.004, 0, -0.35], [0, Math.PI / 2, 0]);
  return g;
}

/** 원유 시추탑 (철골 격자) */
export function makeDerrick(mk: Mk, h = 5): THREE.Group {
  const g = new THREE.Group();
  const steel = mk(0x3a3a3a);
  const b = 0.9;
  const t = 0.15;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, h, 4), steel, [(sx * (b + t)) / 2, h / 2, (sz * (b + t)) / 2]);
      leg.rotation.set((sz * -(b - t)) / h / 1.0, 0, ((sx * (b - t)) / h) * 1.0);
    }
  for (let i = 1; i < 7; i++) {
    const y = (i / 7) * h;
    const w = b - (b - t) * (i / 7);
    for (const r of [0, Math.PI / 2]) {
      for (const s of [-1, 1]) {
        const bar = mesh(g, new THREE.BoxGeometry(w * 2, 0.03, 0.03), steel, [0, y, 0]);
        bar.rotation.y = r;
        bar.position.set(r ? s * w : 0, y, r ? 0 : s * w);
      }
    }
  }
  mesh(g, new THREE.BoxGeometry(0.4, 0.15, 0.4), steel, [0, h, 0]);
  return g;
}

const VEST_SIGNS = ['총파업!', 'GRÈVE', '연금개혁 반대', 'NON !', '노란 조끼', 'MACRON\nDÉMISSION'];
/** 노란 조끼 시위대 한 명 (i: 모양 변화용 번호). 팔 그룹 이름 arm */
export function makeProtester(mk: Mk, i: number): THREE.Group {
  const g = new THREE.Group();
  const skins = [0xf1d2b6, 0xd9a882, 0xa8754f, 0xf5dcc6, 0x8a5a3c];
  const skin = mk(skins[i % skins.length]);
  const jeans = mk([0x2b3a55, 0x3a3a3a, 0x4a3f35][i % 3]);
  const vest = mk(0xf2e21a, { emissive: 0x2a2600 });
  for (const sx of [-1, 1]) mesh(g, new THREE.CapsuleGeometry(0.09, 0.55, 3, 8), jeans, [sx * 0.11, 0.4, 0]);
  mesh(g, new THREE.CapsuleGeometry(0.22, 0.45, 4, 10), vest, [0, 1.1, 0], [0, 0, 0], [1, 1, 0.75]);
  for (const y of [0.95, 1.2]) mesh(g, new THREE.TorusGeometry(0.205, 0.022, 4, 16), mk(0xbfc4c8), [0, y, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
  mesh(g, new THREE.SphereGeometry(0.17, 12, 10), skin, [0, 1.65, 0]);
  if (i % 3 === 0) mesh(g, new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mk(0x222222), [0, 1.68, 0]);
  if (i % 4 === 1) mesh(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), mk(0x2244aa), [0, 1.77, 0]);
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.set(0.25, 1.4, 0);
  g.add(arm);
  mesh(arm, new THREE.CapsuleGeometry(0.07, 0.45, 3, 8), vest, [0, 0.25, 0]);
  if (i % 2 === 0) {
    // 피켓
    mesh(arm, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), mk(0x8a6a44), [0, 0.7, 0]);
    const text = VEST_SIGNS[i % VEST_SIGNS.length].split('\n')[0];
    const tex = labelTexture(text, '#ffffff', i % 4 === 0 ? '#c8102e' : '#1f3a8a', 256, 128);
    mesh(arm, new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), [0, 1.25, 0.03]);
  } else {
    mesh(arm, new THREE.SphereGeometry(0.08, 8, 6), skin, [0, 0.55, 0]);
  }
  const arm2 = mesh(g, new THREE.CapsuleGeometry(0.07, 0.45, 3, 8), vest, [-0.27, 1.05, 0.05], [0.3, 0, -0.2]);
  arm2.name = 'arm2';
  return g;
}

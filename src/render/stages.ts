// 스테이지 6종 — 전부 코드로 생성 (외부 에셋 없음).
import * as THREE from 'three';
import { toon } from './fighterModel';

export interface StageInfo {
  name: string;
  concept: string;
  gimmick: string;
}

export const STAGES: StageInfo[] = [
  { name: '정상회의장', concept: '원형 테이블 회의장', gimmick: '벽 콤보 시 테이블이 부서진다' },
  { name: '동토의 궁전', concept: '눈 덮인 궁전 광장', gimmick: '가운데 빙판에서 넉백이 미끄러진다' },
  { name: '황금 타워 옥상', concept: '헬기 착륙장', gimmick: '벽에 부딪히면 바닥에 금이 간다' },
  { name: '미사일 발사장', concept: '열병식 광장', gimmick: '주기적으로 배경 미사일 발사 (화면 흔들림)' },
  { name: '전통시장', concept: '밤 포장마차 거리', gimmick: '상인·시민 NPC가 응원한다' },
  { name: '국회 본회의장', concept: '난투극 컨셉', gimmick: '배경에서 의원들이 따로 난투' },
];

const A = 5.2; // 경기장 반 변 (m)

export function textTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#b71c1c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = opts.fg ?? '#fff';
  g.font = opts.font ?? `bold ${Math.floor(h * 0.55)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture(a: string, b: string, n = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const s = 256 / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * s, j * s, s, s);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface Npc {
  g: THREE.Group;
  base: THREE.Vector3;
  phase: number;
  mode: 'cheer' | 'brawl';
}

function npc(color: number, skin = 0xf1c8a0): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 3, 8), toon(color));
  body.position.y = 0.75;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon(skin));
  head.position.y = 1.45;
  g.add(head);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 2, 6), toon(color));
  arm.position.set(0.28, 1.2, 0);
  arm.name = 'arm';
  g.add(arm);
  return g;
}

export class Stage {
  group = new THREE.Group();
  index: number;
  shake = 0;
  private npcs: Npc[] = [];
  private snow: THREE.Points | null = null;
  private table: THREE.Group | null = null;
  private debris: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];
  private missiles: { m: THREE.Group; t: number; x: number }[] = [];
  private missileTimer = 6;
  private cracks: THREE.Mesh[] = [];
  private excitement = 0;
  lightColor = 0xffffff;
  fog: THREE.Fog;
  bg: THREE.Color;

  constructor(index: number) {
    this.index = index;
    this.bg = new THREE.Color(0x202030);
    this.fog = new THREE.Fog(0x202030, 18, 45);
    const build = [this.summit, this.palace, this.tower, this.missileBase, this.market, this.assembly][index] ?? this.summit;
    build.call(this);
  }

  private floor(mat: THREE.Material, size = 2 * A + 1) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    f.rotation.x = -Math.PI / 2;
    this.group.add(f);
    // 경기장 경계선
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(2 * A, 2 * A)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.02;
    this.group.add(edge);
  }

  private walls(color: number, height = 1.2, opacity = 1) {
    const mat = toon(color, { transparent: opacity < 1, opacity });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2 * A + 0.6, height, 0.3), mat);
      const ang = (i * Math.PI) / 2;
      w.position.set(Math.sin(ang) * (A + 0.15), height / 2, Math.cos(ang) * (A + 0.15));
      w.rotation.y = ang;
      this.group.add(w);
    }
  }

  private ring<T extends THREE.Object3D>(n: number, r: number, make: (i: number) => T, y = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const o = make(i);
      o.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      o.lookAt(0, y, 0);
      this.group.add(o);
    }
  }

  private addCrowd(n: number, r: number, mode: Npc['mode'], colors: number[]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (mode === 'brawl' ? 0.1 : 0);
      const rr = r + (i % 3) * 0.9;
      const g = npc(colors[i % colors.length]);
      g.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      g.lookAt(0, 0, 0);
      this.group.add(g);
      this.npcs.push({ g, base: g.position.clone(), phase: i * 1.7, mode });
    }
  }

  // ---------------- 0. 정상회의장
  private summit() {
    this.bg.set(0x1a1f33);
    this.fog = new THREE.Fog(0x1a1f33, 20, 50);
    this.floor(toon(0xffffff, { map: checkerTexture('#d8d2c4', '#a89f8c', 10) }));
    this.walls(0x6b4f3a, 1.0);
    // 뒤쪽 원형 테이블
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.15, 40, 1, false), toon(0x7b4a2a));
    top.position.y = 0.8;
    table.add(top);
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8), toon(0x4a2c18));
      const a = (i / 6) * Math.PI * 2;
      leg.position.set(Math.sin(a) * 2.6, 0.4, Math.cos(a) * 2.6);
      table.add(leg);
    }
    table.position.set(0, 0, -12);
    this.group.add(table);
    this.table = table;
    // 깃발 (가상 국가 색)
    const flagCols = [0x6aa9ff, 0xffd23f, 0xd62828, 0x4fc3f7, 0x2e7d32, 0x8e24aa, 0xf57c00, 0x455a64];
    this.ring(16, 15, (i) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), toon(0xcccccc));
      pole.position.y = 2;
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), toon(flagCols[i % flagCols.length], { side: THREE.DoubleSide }));
      flag.position.set(0.6, 3.5, 0);
      g.add(flag);
      return g;
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: textTexture('세계 정상회의 2026', { bg: '#0d47a1' }) }));
    banner.position.set(0, 6, -16);
    this.group.add(banner);
    // 샹들리에
    for (const x of [-6, 0, 6]) {
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
      ch.position.set(x, 9, -4);
      this.group.add(ch);
    }
  }

  // ---------------- 1. 동토의 궁전
  private palace() {
    this.bg.set(0x9fb4c8);
    this.fog = new THREE.Fog(0x9fb4c8, 15, 42);
    this.lightColor = 0xdde8ff;
    this.floor(toon(0xf2f5fa));
    const ice = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshPhongMaterial({ color: 0x9ad3ff, shininess: 120, transparent: true, opacity: 0.75 }));
    ice.rotation.x = -Math.PI / 2;
    ice.position.y = 0.015;
    this.group.add(ice);
    this.walls(0xd7dde6, 0.6);
    // 양파 돔
    const domeCols = [0xd62828, 0x2e7d32, 0x1565c0, 0xf9a825, 0x6a1b9a];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const h = 5 + (i % 3) * 2.5;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, h, 12), toon(0xf5efe6));
      tower.position.y = h / 2;
      g.add(tower);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10), toon(domeCols[i % domeCols.length]));
      dome.scale.set(1, 1.3, 1);
      dome.position.y = h + 1;
      g.add(dome);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 8), toon(0xffd54f));
      tip.position.y = h + 2.9;
      g.add(tip);
      g.position.set(-15 + i * 5, 0, -17 - (i % 2) * 3);
      this.group.add(g);
    }
    // 눈
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 }));
    this.group.add(this.snow);
  }

  // ---------------- 2. 황금 타워 옥상
  private tower() {
    this.bg.set(0x0b1026);
    this.fog = new THREE.Fog(0x0b1026, 25, 70);
    this.lightColor = 0xffe7b0;
    this.floor(toon(0x3a3a44), 2 * A + 4);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ map: textTexture('H', { w: 256, h: 256, bg: '#2f2f38', fg: '#ffd23f', font: 'bold 200px sans-serif' }) }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.012;
    this.group.add(pad);
    const rim = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.013;
    this.group.add(rim);
    this.walls(0xc9a227, 0.5);
    // 도시 스카이라인
    const winTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#1b1f33';
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10) {
        g.fillStyle = Math.random() < 0.45 ? '#ffd98a' : '#283050';
        g.fillRect(x, y, 6, 6);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (let i = 0; i < 40; i++) {
      const h = 6 + Math.random() * 20;
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), new THREE.MeshBasicMaterial({ map: winTex }));
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 20;
      b.position.set(Math.sin(a) * r, h / 2 - 12, Math.cos(a) * r);
      this.group.add(b);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), new THREE.MeshBasicMaterial({ map: textTexture('GOLD TOWER', { bg: '#000000', fg: '#ffd23f' }) }));
    sign.position.set(0, 3.5, -A - 1);
    this.group.add(sign);
  }

  // ---------------- 3. 미사일 발사장
  private missileBase() {
    this.bg.set(0x4a5560);
    this.fog = new THREE.Fog(0x4a5560, 22, 60);
    this.floor(toon(0xffffff, { map: checkerTexture('#8d6e63', '#795548', 6) }), 2 * A + 4);
    this.walls(0x5d4037, 0.6);
    for (let i = 0; i < 5; i++) {
      const g = this.makeMissile();
      g.position.set(-12 + i * 6, 0, -16);
      this.group.add(g);
    }
    // 단상 + 대형 초상 대신 붉은 깃발
    const stand = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 3), toon(0x8b0000));
    stand.position.set(0, 1, 16);
    this.group.add(stand);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(12, 2), new THREE.MeshBasicMaterial({ map: textTexture('위대한 발사 기념 열병식', { bg: '#b71c1c' }), side: THREE.DoubleSide }));
    banner.position.set(0, 4.5, 16);
    banner.rotation.y = Math.PI;
    this.group.add(banner);
    this.addCrowd(18, 19, 'cheer', [0x556b2f, 0x4b5320, 0x3b4a2f]);
  }

  makeMissile(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 6, 12), toon(0xe0e0e0));
    body.position.y = 3.5;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 12), toon(0xb71c1c));
    nose.position.y = 7.2;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.8), toon(0x424242));
      fin.position.set(Math.sin((i * Math.PI) / 2) * 0.5, 1, Math.cos((i * Math.PI) / 2) * 0.5);
      fin.rotation.y = (i * Math.PI) / 2;
      g.add(fin);
    }
    return g;
  }

  // ---------------- 4. 전통시장
  private market() {
    this.bg.set(0x120c1c);
    this.fog = new THREE.Fog(0x120c1c, 16, 40);
    this.lightColor = 0xffc890;
    this.floor(toon(0x4e4a46));
    this.walls(0x6d4c41, 0.4);
    const foods = ['떡볶이', '순대', '어묵', '호떡', '붕어빵', '튀김', '김밥', '국밥'];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const stall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.6), toon(0x8d6e63));
      stall.position.y = 0.55;
      g.add(stall);
      const tent = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 2.2), toon(i % 2 ? 0xe53935 : 0xff8f00));
      tent.position.y = 2.6;
      g.add(tent);
      for (const x of [-1.6, 1.6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon(0x9e9e9e));
        pole.position.set(x, 1.3, 0.9);
        g.add(pole);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: textTexture(foods[i], { bg: '#fff3e0', fg: '#c62828' }) }));
      sign.position.set(0, 2.1, 1.12);
      g.add(sign);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7043 }));
      lantern.position.set(0, 2.3, 1.2);
      g.add(lantern);
      const a = (i / 8) * Math.PI * 2 + 0.2;
      g.position.set(Math.sin(a) * 10, 0, Math.cos(a) * 10);
      g.lookAt(0, 0, 0);
      this.group.add(g);
    }
    this.addCrowd(22, 7.5, 'cheer', [0x1976d2, 0x388e3c, 0xfbc02d, 0x7b1fa2, 0xe64a19, 0x5d4037]);
  }

  // ---------------- 5. 국회 본회의장
  private assembly() {
    this.bg.set(0x2b2330);
    this.fog = new THREE.Fog(0x2b2330, 20, 50);
    this.floor(toon(0x3f51b5));
    this.walls(0x5d4037, 0.9);
    for (let row = 0; row < 4; row++) {
      const r = 9 + row * 2;
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5 + row * 0.5, 48, 1, true, -Math.PI * 0.75, Math.PI * 1.5), toon(0x6d4c41, { side: THREE.DoubleSide }));
      seat.position.y = (0.5 + row * 0.5) / 2;
      seat.rotation.y = Math.PI;
      this.group.add(seat);
    }
    const podium = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 1.5), toon(0x4e342e));
    podium.position.set(0, 1.1, -A - 3);
    this.group.add(podium);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshBasicMaterial({ map: textTexture('본회의 (정회 아님)', { bg: '#263238' }) }));
    sign.position.set(0, 5, -A - 6);
    this.group.add(sign);
    this.addCrowd(26, 10, 'brawl', [0x37474f, 0x263238, 0x455a64, 0x1a237e, 0x880e4f]);
  }

  // ---------------- 갱신
  update(dt: number, time: number) {
    if (this.snow) {
      const p = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 1.2;
        if (y < 0) y = 12;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.2);
      }
      p.needsUpdate = true;
    }
    this.excitement = Math.max(0, this.excitement - dt * 0.5);
    for (const n of this.npcs) {
      const t = time * (n.mode === 'brawl' ? 6 : 4 + this.excitement * 6) + n.phase;
      if (n.mode === 'cheer') {
        n.g.position.y = Math.max(0, Math.sin(t)) * (0.15 + this.excitement * 0.5);
        const arm = n.g.getObjectByName('arm');
        if (arm) arm.rotation.z = -1.2 - Math.sin(t * 2) * (0.3 + this.excitement);
      } else {
        n.g.position.x = n.base.x + Math.sin(t * 0.7) * 0.4;
        n.g.position.y = Math.max(0, Math.sin(t * 1.3)) * 0.4;
        n.g.rotation.z = Math.sin(t) * 0.25;
        const arm = n.g.getObjectByName('arm');
        if (arm) arm.rotation.z = -Math.abs(Math.sin(t * 2)) * 2;
      }
    }
    for (const d of this.debris) {
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.r.x * dt;
      d.m.rotation.z += d.r.z * dt;
      if (d.m.position.y < 0.05) {
        d.m.position.y = 0.05;
        d.v.set(0, 0, 0);
        d.r.set(0, 0, 0);
      }
    }
    if (this.index === 3) {
      this.missileTimer -= dt;
      if (this.missileTimer <= 0) {
        this.missileTimer = 9 + Math.random() * 4;
        const m = this.makeMissile();
        const x = -14 + Math.random() * 28;
        m.position.set(x, 0, -22);
        this.group.add(m);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 10), new THREE.MeshBasicMaterial({ color: 0xff9800 }));
        flame.rotation.x = Math.PI;
        flame.position.y = -0.5;
        m.add(flame);
        this.missiles.push({ m, t: 0, x });
        this.shake = 0.35;
      }
      for (const ms of this.missiles) {
        ms.t += dt;
        ms.m.position.y = ms.t * ms.t * 6;
      }
      this.missiles = this.missiles.filter((ms) => {
        if (ms.t > 5) {
          this.group.remove(ms.m);
          return false;
        }
        return true;
      });
    }
    this.shake = Math.max(0, this.shake - dt);
  }

  /** 타격 시 관중 반응 */
  cheer(amount: number) {
    this.excitement = Math.min(1.5, this.excitement + amount);
  }

  onWallSplat(x: number, z: number) {
    if (this.index === 0 && this.table && this.table.visible) {
      // 테이블 파괴
      this.table.visible = false;
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6 + Math.random(), 0.12, 0.5 + Math.random()), toon(0x7b4a2a));
        m.position.set(x / 1000 + (Math.random() - 0.5), 1, z / 1000 + (Math.random() - 0.5));
        this.group.add(m);
        this.debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6), r: new THREE.Vector3(Math.random() * 8, 0, Math.random() * 8) });
      }
    }
    if (this.index === 2) {
      const crack = new THREE.Mesh(new THREE.CircleGeometry(0.9, 7), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
      crack.rotation.x = -Math.PI / 2;
      crack.position.set(x / 1000, 0.02, z / 1000);
      this.group.add(crack);
      this.cracks.push(crack);
    }
    this.cheer(0.8);
    this.shake = Math.max(this.shake, 0.25);
  }

  resetRound() {
    if (this.table) this.table.visible = true;
    for (const d of this.debris) this.group.remove(d.m);
    this.debris = [];
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture };
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}

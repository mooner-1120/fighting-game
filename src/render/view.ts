// 3D 장면: 카메라(철권식 측면 추적), 이펙트, 투사체, 궁극기 연출.
import * as THREE from 'three';
import { CHARS } from '../sim/chars';
import { CAGE_R, type GameEvent, type GameState, type Proj } from '../sim/types';
import { FighterModel, toon } from './fighterModel';
import { KimModel, kimReady } from './kim/kimModel';
import { StatueModel, statueReady } from './statue/statueModel';
import { NewsOverlay } from './overlay';
import { makeBaguette, makeBus, makeTeacup, makeDerrick, makeDrone, makeFalcon, makeFirewall, makeProtester, makeWarship, type Mk } from './propMeshes';
import { Stage, textTexture } from './stages';

const mkToon: Mk = (c, e) => toon(c, e);
const smooth01 = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

interface Particle {
  m: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  max: number;
  grow?: number;
  gravity?: number;
}

export type Quality = 'low' | 'mid' | 'high';

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  fighters: (FighterModel | KimModel | StatueModel)[] = [];
  private prevUlt = [-1, -1];
  stage: Stage | null = null;
  overlay: NewsOverlay;
  private projMeshes = new Map<number, THREE.Object3D>();
  private particles: Particle[] = [];
  private camPos = new THREE.Vector3(0, 2, 8);
  private camLook = new THREE.Vector3(0, 1, 0);
  private shake = 0;
  private time = 0;
  private ultFx: THREE.Group = new THREE.Group();
  private ultChar = '';
  private lastStab = 0;
  /** 대처 티타임 창 표시 (머리 위 찻잔) */
  private teaIcons: (THREE.Object3D | null)[] = [null, null];
  /** 시진핑 궁극기 뒤 가두기 원 */
  private cageMesh: THREE.Object3D | null = null;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private lastRound = 0;
  private sparkGeo = new THREE.SphereGeometry(0.06, 6, 4);
  private ringGeo = new THREE.RingGeometry(0.3, 0.45, 24);
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, quality: Quality = 'mid') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.setQuality(quality);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(4, 10, 6);
    this.scene.add(this.sun);
    this.scene.add(this.ultFx);
    this.overlay = new NewsOverlay(overlayCanvas);
  }

  setQuality(q: Quality) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.7 : q === 'mid' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlay.resize(w, h);
  }

  /** 새 경기 준비 */
  setup(s: GameState) {
    this.clear();
    this.stage = new Stage(s.cfg.stage);
    this.scene.add(this.stage.group);
    this.scene.background = this.stage.bg;
    this.scene.fog = this.stage.fog;
    this.sun.color.setHex(this.stage.lightColor);
    const same = s.cfg.chars[0] === s.cfg.chars[1];
    for (let i = 0; i < 2; i++) {
      const def = CHARS[s.cfg.chars[i]];
      // 김정은·푸틴·트럼프는 리깅한 3D 모델을 쓴다 (못 읽었으면 도형 캐릭터)
      const tint = same && i === 1;
      const fm =
        (def.id === 'kang' || def.id === 'xi') && kimReady(def.id) ? new KimModel(def, tint) : statueReady(def.id) ? new StatueModel(def, tint) : new FighterModel(def, tint);
      this.fighters.push(fm);
      this.scene.add(fm.root);
      this.scene.add(fm.shadow);
    }
    this.lastRound = s.round;
    this.snapCamera(s);
  }

  clear() {
    for (const f of this.fighters) {
      this.scene.remove(f.root);
      this.scene.remove(f.shadow);
      f.dispose();
    }
    this.fighters = [];
    if (this.stage) {
      this.scene.remove(this.stage.group);
      this.stage.dispose();
      this.stage = null;
    }
    for (const m of this.projMeshes.values()) this.scene.remove(m);
    for (const m of this.teaIcons) if (m) this.scene.remove(m);
    this.teaIcons = [null, null];
    if (this.cageMesh) this.scene.remove(this.cageMesh);
    this.cageMesh = null;
    this.projMeshes.clear();
    for (const p of this.particles) this.scene.remove(p.m);
    this.particles = [];
    this.clearUltFx();
  }

  private clearUltFx() {
    for (const c of [...this.ultFx.children]) this.ultFx.remove(c);
    this.ultChar = '';
    this.lastStab = 0;
  }

  // ---------------------------------------------------------- 이벤트
  handleEvents(ev: GameEvent[], s: GameState) {
    for (const e of ev) {
      switch (e.k) {
        case 'hit': {
          const p = new THREE.Vector3(e.x / 1000, e.y / 1000, e.z / 1000);
          this.burst(p, e.ch ? 0xff3b3b : e.heavy ? 0xffc400 : 0xffffff, e.heavy ? 26 : 14, e.heavy ? 6 : 4);
          this.ringFx(p, e.ch ? 0xff3b3b : 0xffe082);
          this.fighters[e.who]?.hitFlash();
          this.shake = Math.max(this.shake, e.heavy ? 0.22 : 0.08);
          this.stage?.cheer(e.heavy ? 0.5 : 0.2);
          break;
        }
        case 'block': {
          const p = new THREE.Vector3(e.x / 1000, e.y / 1000, e.z / 1000);
          this.burst(p, 0x64b5f6, 10, 3);
          this.ringFx(p, 0x64b5f6);
          break;
        }
        case 'boom':
          this.explosion(new THREE.Vector3(e.x / 1000, 0.3, e.z / 1000));
          break;
        case 'wall':
          this.stage?.onWallSplat(e.x, e.z);
          this.shake = Math.max(this.shake, 0.3);
          break;
        case 'cine':
          this.startUltFx(s, e.who, e.fail);
          break;
        case 'ultStart': {
          const f = s.f[e.who];
          this.ringFx(new THREE.Vector3(f.x / 1000, 1.2, f.z / 1000), 0xff1744, 3);
          break;
        }
        case 'parry': {
          const f = s.f[e.who];
          this.burst(new THREE.Vector3(f.x / 1000, 1.3, f.z / 1000), 0xffd700, 30, 5);
          break;
        }
        case 'heal': {
          const f = s.f[e.who];
          this.burst(new THREE.Vector3(f.x / 1000, 1.5, f.z / 1000), 0x66ff88, 16, 2, -2);
          break;
        }
        case 'ko':
          this.shake = 0.4;
          break;
        case 'justGuard': {
          // 마크롱 저스트 가드: 금빛 반짝임
          const f = s.f[e.who];
          const p = new THREE.Vector3(f.x / 1000 + (f.fx / 1000) * 0.4, 1.3, f.z / 1000 + (f.fz / 1000) * 0.4);
          this.burst(p, 0xffe082, 18, 4, 1);
          this.ringFx(p, 0xffd54f, 4);
          break;
        }
        case 'teaTime': {
          const f = s.f[e.who];
          this.ringFx(new THREE.Vector3(f.x / 1000, 2.3, f.z / 1000), 0xfff3e0, 3);
          break;
        }
        case 'round':
          this.stage?.resetRound();
          break;
      }
    }
  }

  /** 머리 위 찻잔(대처 티타임 창, f.res[1] > 0)과 시진핑 가두기 원(상대 buffs.cage) */
  private updateMarkers(s: GameState) {
    for (let i = 0; i < 2; i++) {
      const f = s.f[i];
      const on = f.char === 'thatcher' && f.res[1] > 0 && !s.cine && !(f.st === 'atk' && f.move === 'tea');
      let icon = this.teaIcons[i];
      if (on && !icon) {
        icon = makeTeacup(mkToon);
        icon.scale.setScalar(2.2);
        this.scene.add(icon);
        this.teaIcons[i] = icon;
      }
      if (icon) {
        icon.visible = on;
        if (on) {
          const hw = this.fighters[i]?.headWorld;
          icon.position.set(f.x / 1000, (hw ? hw.y : 1.8) + 0.55 + Math.sin(this.time * 4) * 0.05, f.z / 1000);
          icon.rotation.y = this.time * 1.5;
        }
      }
    }
    let cage: { x: number; z: number; left: number } | null = null;
    for (const f of s.f) if (f.buffs.cage > 0) cage = { x: f.buffs.cageX, z: f.buffs.cageZ, left: f.buffs.cage };
    if (cage && !this.cageMesh) {
      const g = new THREE.Group();
      const r = CAGE_R / 1000;
      const n = 14;
      const w = 2 * Math.PI * r / n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const seg = makeFirewall(mkToon, w * 1.02, 1.1, i % 7 === 0 ? '방화벽' : '', 0, 0.28);
        seg.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
        seg.rotation.y = a;
        g.add(seg);
      }
      this.scene.add(g);
      this.cageMesh = g;
    }
    if (this.cageMesh) {
      this.cageMesh.visible = !!cage;
      if (cage) {
        this.cageMesh.position.set(cage.x / 1000, 0, cage.z / 1000);
        this.cageMesh.scale.set(1, Math.min(1, cage.left / 20), 1);
      }
    }
  }

  /** 빈 살만 모래폭풍 대시·슈퍼카 돌진 중 발밑 모래 먼지 */
  private moveDust(s: GameState, i: number) {
    const f = s.f[i];
    if (f.st !== 'atk' || !f.move) return;
    const anim = CHARS[f.char].moves[f.move]?.anim;
    if (anim !== 'sandDash' && anim !== 'car') return;
    if (Math.random() < 0.5) return;
    const p = new THREE.Vector3(f.x / 1000 - (f.fx / 1000) * 0.4, 0.15, f.z / 1000 - (f.fz / 1000) * 0.4);
    this.burst(p, anim === 'car' ? 0xc8b48a : 0xd9b46a, anim === 'car' ? 3 : 5, 2, 1);
  }

  private burst(p: THREE.Vector3, color: number, n: number, speed: number, gravity = 6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.copy(p);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.scene.add(m);
      this.particles.push({ m, v, life: 0.35, max: 0.35, gravity });
    }
  }

  private ringFx(p: THREE.Vector3, color: number, grow = 6) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
    m.position.copy(p);
    m.lookAt(this.camera.position);
    this.scene.add(m);
    this.particles.push({ m, v: new THREE.Vector3(), life: 0.25, max: 0.25, grow, gravity: 0 });
  }

  private explosion(p: THREE.Vector3) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8f00, transparent: true }));
    m.position.copy(p);
    this.scene.add(m);
    this.particles.push({ m, v: new THREE.Vector3(), life: 0.5, max: 0.5, grow: 5, gravity: 0 });
    this.burst(p, 0xff5722, 30, 7);
    this.burst(p, 0x616161, 20, 3, -1);
    this.shake = Math.max(this.shake, 0.35);
  }

  // ---------------------------------------------------------- 궁극기
  private startUltFx(s: GameState, who: number, fail: boolean) {
    this.clearUltFx();
    const A = s.f[who];
    const D = s.f[1 - who];
    this.ultChar = A.char;
    const ax = A.x / 1000;
    const az = A.z / 1000;
    const dx = D.x / 1000;
    const dz = D.z / 1000;
    const g = this.ultFx;
    if (A.char === 'volkov') {
      const ice = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshPhongMaterial({ color: 0xb3e5fc, shininess: 150, transparent: true, opacity: 0.85 }));
      ice.rotation.x = -Math.PI / 2;
      ice.position.set((ax + dx) / 2, 0.03, (az + dz) / 2);
      ice.name = 'ice';
      g.add(ice);
      for (let i = 0; i < 18; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.15 + Math.random() * 0.2, 1 + Math.random() * 1.5, 6), toon(0xe1f5fe, { transparent: true, opacity: 0.9 }));
        const a = (i / 18) * Math.PI * 2;
        c.position.set(dx + Math.sin(a) * 1.1, -1, dz + Math.cos(a) * 1.1);
        c.name = 'crystal';
        g.add(c);
      }
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20), toon(0xd32f2f));
      valve.position.set(ax, 2.2, az);
      valve.name = 'valve';
      g.add(valve);
    } else if (A.char === 'rex') {
      const billTex = textTexture('$', { w: 128, h: 64, bg: '#2e7d32', fg: '#c8e6c9', font: 'bold 50px serif' });
      const mat = new THREE.MeshBasicMaterial({ map: billTex, side: THREE.DoubleSide });
      for (let i = 0; i < 120; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), mat);
        b.position.set(dx + (Math.random() - 0.5) * 6, 4 + Math.random() * 10, dz + (Math.random() - 0.5) * 6);
        b.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        b.name = 'bill';
        g.add(b);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ map: textTexture('관세 25%', { bg: '#ffd23f', fg: '#b71c1c' }), side: THREE.DoubleSide }));
      sign.position.set(dx, 3.2, dz);
      sign.name = 'tariff';
      g.add(sign);
    } else if (A.char === 'kang' && this.fighters[who] instanceof KimModel) {
      // 모델 자체가 단추·탄두·폭발 연출을 한다 (kimUlt)
    } else if (A.char === 'kang') {
      const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 20), toon(0x333333));
      btnBase.position.set(ax + A.fx / 1000 * 0.5, 1.0, az + A.fz / 1000 * 0.5);
      g.add(btnBase);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 20), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
      btn.position.copy(btnBase.position).add(new THREE.Vector3(0, 0.15, 0));
      btn.name = 'button';
      g.add(btn);
      const m = this.stage!.makeMissile();
      m.scale.setScalar(0.6);
      m.rotation.z = Math.PI;
      const tx = fail ? ax : dx;
      const tz = fail ? az : dz;
      m.position.set(tx, 30, tz);
      m.name = 'icbm';
      m.userData = { tx, tz };
      g.add(m);
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(tx, 0.04, tz);
      mark.name = 'mark';
      g.add(mark);
    } else if (A.char === 'thatcher' || A.char === 'xi' || A.char === 'mbs' || A.char === 'macron') {
      this.startNewUltFx(s, who);
    } else if (A.char === 'seo') {
      const phone = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), toon(0x111133));
      phone.position.set(ax - (A.fz / 1000) * 1.4, 2.6, az + (A.fx / 1000) * 1.4);
      phone.name = 'bigphone';
      g.add(phone);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.9), new THREE.MeshBasicMaterial({ map: textTexture('● LIVE', { w: 256, h: 460, bg: '#e53935', font: 'bold 60px sans-serif' }) }));
      screen.position.set(0, 0, 0.05);
      phone.add(screen);
      const heartTex = textTexture('♥', { w: 64, h: 64, bg: 'rgba(0,0,0,0)', fg: '#ff4081', font: 'bold 56px sans-serif' });
      const hm = new THREE.MeshBasicMaterial({ map: heartTex, transparent: true, side: THREE.DoubleSide });
      for (let i = 0; i < 40; i++) {
        const h = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), hm);
        h.position.set(dx + (Math.random() - 0.5) * 3, Math.random() * 0.5, dz + (Math.random() - 0.5) * 3);
        h.userData = { sp: 0.6 + Math.random() * 1.5 };
        h.name = 'heart';
        g.add(h);
      }
    }
  }

  /** 새 캐릭터 4인의 궁극기 소품. 카메라·자막은 공용 연출을 그대로 쓴다 */
  private startNewUltFx(s: GameState, who: number) {
    const A = s.f[who];
    const D = s.f[1 - who];
    const g = this.ultFx;
    const ap = new THREE.Vector3(A.x / 1000, 0, A.z / 1000);
    const dp = new THREE.Vector3(D.x / 1000, 0, D.z / 1000);
    const mid = ap.clone().lerp(dp, 0.5);
    const fwd = new THREE.Vector3(A.fx / 1000, 0, A.fz / 1000).normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const yaw = Math.atan2(fwd.x, fwd.z);
    const R = (a: number, b: number) => a + Math.random() * (b - a);
    if (A.char === 'thatcher') {
      // 해협 봉쇄: 물이 차오르고, 뒤쪽 회색 군함 두 척이 포격
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(18, 48),
        new THREE.MeshPhongMaterial({ color: 0x2a6fb0, shininess: 120, specular: 0x88bbff, transparent: true, opacity: 0.78 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(mid.x, -0.1, mid.z);
      water.name = 'water';
      g.add(water);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), new THREE.MeshBasicMaterial({ color: 0xe3f2fd, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(dp.x, 0, dp.z);
        ring.userData = { ph: i / 3 };
        ring.name = 'wave';
        g.add(ring);
      }
      const ships: THREE.Vector3[] = [];
      for (const k of [-1, 1]) {
        const ship = makeWarship(mkToon);
        ship.position.copy(mid).addScaledVector(side, -9 - (k > 0 ? 2 : 0)).addScaledVector(fwd, k * 4.5);
        ship.rotation.y = yaw + (k > 0 ? Math.PI : 0);
        ship.name = 'ship';
        ship.userData = { ph: k };
        g.add(ship);
        ships.push(ship.position.clone());
      }
      for (let i = 0; i < 8; i++) {
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0x333333, { emissive: 0x552200 }));
        const from = ships[i % 2].clone().setY(1.4);
        const to = dp.clone().addScaledVector(fwd, R(-0.8, 0.8)).addScaledVector(side, R(-0.8, 0.8)).setY(0.3);
        shell.userData = { t0: 1.5 + i * 0.28, from, to };
        shell.visible = false;
        shell.name = 'shell';
        g.add(shell);
      }
    } else if (A.char === 'xi') {
      // 디지털 만리방벽: 양쪽에 붉은 벽이 솟고 드론이 일제 사격
      // 먼 쪽 벽은 마지막 컷 카메라(상대 앞 3.5m)보다 뒤에 세워 시야를 막지 않게 한다
      for (const [base, off] of [[dp, 4.0], [ap, -2.2]] as const) {
        const w = makeFirewall(mkToon, 7, 3.2, '디지털 만리방벽', 0, 0.6);
        w.position.copy(base).addScaledVector(fwd, off).setY(-3.6);
        w.rotation.y = yaw;
        w.name = 'xwall';
        g.add(w);
      }
      const drones: THREE.Object3D[] = [];
      for (let i = 0; i < 10; i++) {
        const d = makeDrone(mkToon);
        d.scale.setScalar(1.5);
        const lat = -2.4 + (i % 5) * 1.2;
        const base = ap.clone().addScaledVector(side, lat).addScaledVector(fwd, -0.6 - Math.floor(i / 5) * 0.8).setY(2.4 + Math.floor(i / 5) * 0.9);
        d.userData = { base, ph: i, rise: 0.6 + i * 0.06 };
        d.position.copy(base).setY(-1);
        d.name = 'xdrone';
        g.add(d);
        drones.push(d);
      }
      const boltMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
      for (let i = 0; i < 26; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), boltMat);
        b.userData = { src: drones[(i * 3) % drones.length], t0: 1.7 + i * 0.075, to: dp.clone().setY(R(0.7, 1.6)).addScaledVector(side, R(-0.3, 0.3)) };
        b.visible = false;
        b.name = 'bolt';
        g.add(b);
      }
    } else if (A.char === 'mbs') {
      // 유가 폭등: 상대 발밑에서 검은 원유 기둥이 솟구친다
      const crack = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 }));
      crack.rotation.x = -Math.PI / 2;
      crack.position.set(dp.x, 0.03, dp.z);
      crack.name = 'crack';
      g.add(crack);
      const rig = makeDerrick(mkToon, 6);
      rig.position.copy(dp).addScaledVector(fwd, 2.2).addScaledVector(side, -1.8);
      g.add(rig);
      const oilMat = new THREE.MeshPhongMaterial({ color: 0x1a120b, shininess: 160, specular: 0xb09a70 });
      const colGeo = new THREE.CylinderGeometry(0.32, 0.6, 1, 18);
      colGeo.translate(0, 0.5, 0);
      const col = new THREE.Mesh(colGeo, oilMat);
      col.position.set(dp.x, 0, dp.z);
      col.scale.y = 0.001;
      col.name = 'oil';
      g.add(col);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), oilMat);
      top.position.copy(col.position);
      top.name = 'oilTop';
      g.add(top);
      for (let i = 0; i < 46; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(R(0.08, 0.2), 8, 6), oilMat);
        d.userData = { t0: 1.25 + Math.random() * 1.6, v: new THREE.Vector3(R(-2.5, 2.5), R(2, 6), R(-2.5, 2.5)), base: dp.clone() };
        d.visible = false;
        d.name = 'drop';
        g.add(d);
      }
    } else if (A.char === 'macron') {
      // 총파업: 노란 조끼 시위대가 양쪽에서 몰려와 둘러싼다
      let n = 0;
      for (const k of [-1, 1]) {
        for (let i = 0; i < 14; i++) {
          const pr = makeProtester(mkToon, n++);
          const row = Math.floor(i / 5);
          const lat = -3.4 + (i % 5) * 0.95 + row * 0.4;
          const to = mid.clone().addScaledVector(fwd, k * (3.6 + row * 0.8)).addScaledVector(side, lat);
          const from = to.clone().addScaledVector(fwd, k * 8);
          pr.position.copy(from);
          pr.userData = { from, to, ph: Math.random() * 6, delay: Math.random() * 0.5, look: mid.clone() };
          pr.name = 'protester';
          g.add(pr);
        }
      }
      // 뒤쪽 줄
      for (let i = 0; i < 8; i++) {
        const pr = makeProtester(mkToon, n++);
        const to = mid.clone().addScaledVector(side, -4.2 - (i % 2) * 0.8).addScaledVector(fwd, -3 + i * 0.85);
        const from = to.clone().addScaledVector(side, -6);
        pr.position.copy(from);
        pr.userData = { from, to, ph: Math.random() * 6, delay: Math.random() * 0.5, look: mid.clone() };
        pr.name = 'protester';
        g.add(pr);
      }
    }
  }

  /** 빈 살만 궁극기: 원유 기둥에 실려 상대가 하늘로 솟는 높이 (렌더 전용 연출, m) */
  private ultLift(s: GameState, i: number): number {
    const c = s.cine;
    if (!c || c.char !== 'mbs' || c.fail || i === c.owner) return 0;
    const t = c.t / 60;
    // 원유 기둥 높이(s.cine.v)를 따라 솟았다가, 마지막 컷(상대 클로즈업) 전에 내려온다.
    // 컷신이 끝나면 시뮬레이션이 상대를 실제로 높이 띄운다.
    const up = Math.min(3.0, c.v / 1000);
    return up * (1 - smooth01((t - 2.9) / 0.5));
  }

  private updateUltFx(s: GameState, dt: number) {
    const c = s.cine;
    if (!c) {
      if (this.ultChar) this.clearUltFx();
      return;
    }
    const t = c.t / 60;
    // 시뮬레이션 진행값 s.cine.v (mm·횟수) — docs/new-characters.md 「렌더 연결」
    const v = c.v / 1000;
    const waterY = -0.1 + Math.min(1.2, v) * 0.75; // 대처: 물 높이 (얼굴은 보이게 75%)
    const wallK = Math.min(1, v / 3); // 시진핑: 벽 높이 0~3000
    const oilH = Math.min(6, v); // 빈 살만: 원유 기둥 0~6000
    if (c.char === 'macron' && c.v !== this.lastStab) {
      // 마크롱: 찌른 횟수가 오를 때마다 상대에게 불꽃
      if (c.v > this.lastStab) {
        const D = s.f[1 - c.owner];
        this.burst(new THREE.Vector3(D.x / 1000, 1.1 + Math.random() * 0.5, D.z / 1000), 0xe4e8ef, 10, 4);
        this.shake = Math.max(this.shake, 0.08);
      }
      this.lastStab = c.v;
    }
    for (const o of this.ultFx.children) {
      switch (o.name) {
        case 'ice':
          o.scale.setScalar(Math.min(6, 0.5 + t * 3));
          break;
        case 'crystal':
          o.position.y = Math.min(0.5, -1 + t * 1.2);
          break;
        case 'valve':
          o.rotation.z += dt * 8;
          break;
        case 'bill':
          o.position.y -= dt * 3;
          o.rotation.x += dt * 4;
          if (o.position.y < 0) o.position.y = 10;
          break;
        case 'tariff':
          o.visible = t > 2;
          o.lookAt(this.camera.position);
          break;
        case 'button':
          o.scale.y = t > 1 && t < 1.3 ? 0.3 : 1;
          break;
        case 'icbm': {
          const k = Math.max(0, (t - 1.5) / 2);
          o.position.y = 30 - k * 30;
          if (o.position.y <= 0.5 && o.visible) {
            o.visible = false;
            this.explosion(new THREE.Vector3(o.userData.tx, 0.5, o.userData.tz));
            this.explosion(new THREE.Vector3(o.userData.tx, 2, o.userData.tz));
            this.shake = 0.8;
          }
          break;
        }
        case 'mark':
          o.visible = Math.floor(t * 6) % 2 === 0;
          break;
        case 'heart':
          o.position.y += dt * (o.userData.sp as number);
          o.lookAt(this.camera.position);
          break;
        case 'bigphone':
          o.lookAt(this.camera.position);
          break;
        // ---- 대처
        case 'water':
          o.position.y = waterY + Math.sin(this.time * 2) * 0.02;
          break;
        case 'wave': {
          const k = (t * 0.8 + (o.userData.ph as number)) % 1;
          o.scale.setScalar(0.5 + k * 4);
          o.position.y = waterY + 0.02;
          ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
          break;
        }
        case 'ship':
          o.position.y = waterY - 0.25 + Math.sin(this.time * 1.5 + (o.userData.ph as number)) * 0.06;
          o.rotation.z = Math.sin(this.time * 1.2 + (o.userData.ph as number)) * 0.03;
          break;
        case 'shell': {
          const u = o.userData as { t0: number; from: THREE.Vector3; to: THREE.Vector3; done?: boolean };
          const k = (t - u.t0) / 0.7;
          if (k < 0 || u.done) {
            o.visible = false;
            break;
          }
          if (!o.visible && k < 0.1) this.burst(u.from.clone().setY(1.6), 0xffb74d, 8, 3, 1);
          o.visible = true;
          o.position.lerpVectors(u.from, u.to, Math.min(1, k));
          o.position.y += Math.sin(Math.min(1, k) * Math.PI) * 4.5;
          if (k >= 1) {
            u.done = true;
            o.visible = false;
            this.explosion(u.to.clone());
            this.burst(u.to.clone().setY(0.5), 0xbbdefb, 18, 5);
          }
          break;
        }
        // ---- 시진핑
        case 'xwall':
          o.position.y = -3.6 + 3.6 * wallK;
          break;
        case 'xdrone': {
          const u = o.userData as { base: THREE.Vector3; ph: number; rise: number };
          const k = smooth01((t - u.rise) / 0.8);
          o.position.copy(u.base);
          o.position.y = -1 + (u.base.y + 1) * k + Math.sin(this.time * 4 + u.ph) * 0.08;
          if (s.f[1 - c.owner]) {
            const D = s.f[1 - c.owner];
            o.lookAt(D.x / 1000, 1.2, D.z / 1000);
          }
          o.traverse((r) => {
            if (r.name === 'rotor') r.rotation.y += dt * 40;
          });
          break;
        }
        case 'bolt': {
          const u = o.userData as { src: THREE.Object3D; t0: number; to: THREE.Vector3; from?: THREE.Vector3; done?: boolean };
          const k = (t - u.t0) / 0.22;
          if (k < 0 || u.done) {
            o.visible = false;
            break;
          }
          u.from ??= u.src.position.clone();
          o.visible = true;
          o.position.lerpVectors(u.from, u.to, Math.min(1, k));
          o.lookAt(u.to);
          if (k >= 1) {
            u.done = true;
            o.visible = false;
            this.burst(u.to.clone(), 0xff3b3b, 8, 3);
            this.shake = Math.max(this.shake, 0.12);
          }
          break;
        }
        // ---- 빈 살만
        case 'crack':
          o.scale.setScalar(Math.min(1.6, 0.2 + t * 1.2));
          break;
        case 'oil': {
          const h = Math.max(0.001, oilH);
          // 마지막 컷(상대 클로즈업) 전에 기둥이 가늘어져 상대가 보이게 한다
          const thin = 1 - 0.75 * smooth01((t - 2.9) / 0.4);
          o.scale.set((1 + Math.sin(this.time * 13) * 0.06) * thin, h, (1 + Math.cos(this.time * 11) * 0.06) * thin);
          break;
        }
        case 'oilTop': {
          o.position.y = oilH > 0 ? oilH : -2;
          o.scale.setScalar(oilH <= 0 ? 0.01 : (1 + Math.sin(this.time * 9) * 0.15) * (1 - 0.75 * smooth01((t - 2.9) / 0.4)));
          break;
        }
        case 'drop': {
          const u = o.userData as { t0: number; v: THREE.Vector3; base: THREE.Vector3; t1?: number };
          if (oilH <= 0.3) break;
          if (u.t1 === undefined || o.position.y < 0) {
            if (t > 3.6) {
              o.visible = false;
              break;
            }
            u.t1 = t;
            o.position.copy(u.base).setY(oilH);
            u.v.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
          }
          o.visible = true;
          u.v.y -= 9.8 * dt;
          o.position.addScaledVector(u.v, dt);
          break;
        }
        // ---- 마크롱
        case 'protester': {
          const u = o.userData as { from: THREE.Vector3; to: THREE.Vector3; ph: number; delay: number; look: THREE.Vector3 };
          const k = smooth01((t - 0.3 - u.delay) / 2.0);
          o.position.lerpVectors(u.from, u.to, k);
          const walking = k > 0 && k < 1;
          o.position.y = walking ? Math.abs(Math.sin(this.time * 9 + u.ph)) * 0.1 : Math.abs(Math.sin(this.time * 5 + u.ph)) * 0.05;
          o.lookAt(u.look.x, 0, u.look.z);
          const arm = o.getObjectByName('arm');
          if (arm) arm.rotation.z = -0.25 + Math.sin(this.time * 6 + u.ph) * 0.35;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------- 투사체
  private projMesh(p: Proj): THREE.Object3D {
    const g = new THREE.Group();
    if (p.kind === 'bear') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), toon(0x6d4c41));
      body.scale.set(0.9, 0.8, 1.4);
      body.position.y = 0.7;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), toon(0x6d4c41));
      head.position.set(0, 1.0, 0.75);
      g.add(head);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0x4e342e));
        ear.position.set(sx * 0.22, 1.3, 0.7);
        g.add(ear);
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 2, 6), toon(0x5d4037));
          leg.position.set(sx * 0.3, 0.25, sz * 0.4);
          leg.name = 'leg';
          g.add(leg);
        }
      }
      const snout = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), toon(0xbcaaa4));
      snout.position.set(0, 0.95, 1.05);
      g.add(snout);
    } else if (p.kind === 'tweet') {
      const tex = textTexture('#가짜뉴스!', { w: 256, h: 128, bg: '#ffffff', fg: '#1565c0', font: 'bold 42px sans-serif' });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      b.name = 'bill';
      g.add(b);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      tail.position.set(-0.3, -0.35, 0);
      tail.rotation.z = Math.PI;
      g.add(tail);
    } else if (p.kind === 'missile') {
      const m = this.stage!.makeMissile();
      m.scale.setScalar(0.18);
      m.rotation.z = Math.PI;
      m.name = 'body';
      g.add(m);
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.76, 28), new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2;
      mark.name = 'mark';
      this.scene.add(mark);
      g.userData.mark = mark;
    } else if (p.kind === 'bus') {
      const bus = makeBus(mkToon);
      bus.name = 'body';
      g.add(bus);
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 28), new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2;
      this.scene.add(mark);
      g.userData.mark = mark;
    } else if (p.kind === 'drone') {
      const d = makeDrone(mkToon);
      d.scale.setScalar(1.4);
      d.rotation.x = 0.25;
      g.add(d);
    } else if (p.kind === 'firewall') {
      g.add(makeFirewall(mkToon, 1.4, 1.9, '방화벽', 0.4));
    } else if (p.kind === 'falcon') {
      const b = makeFalcon(mkToon, true);
      b.scale.setScalar(1.6);
      b.position.set(0, -0.05, -0.15);
      b.rotation.x = Math.PI / 2 * 0.9; // 몸을 앞으로 눕혀 나는 자세
      g.add(b);
    } else if (p.kind === 'baguette') {
      const spin = new THREE.Group();
      spin.name = 'spin';
      const b = makeBaguette(mkToon);
      b.scale.setScalar(1.3);
      spin.add(b);
      g.add(spin);
    } else if (p.kind === 'barrier') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.25), toon(0xffd23f, { emissive: 0x332200 }));
      wall.position.y = 0.9;
      g.add(wall);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), new THREE.MeshBasicMaterial({ map: textTexture('장벽', { w: 256, h: 64, bg: '#b71c1c' }) }));
      sign.position.set(0, 1.3, 0.14);
      g.add(sign);
      const sign2 = sign.clone();
      sign2.position.z = -0.14;
      sign2.rotation.y = Math.PI;
      g.add(sign2);
    }
    return g;
  }

  private updateProjs(s: GameState) {
    const seen = new Set<number>();
    for (const p of s.projs) {
      seen.add(p.id);
      let m = this.projMeshes.get(p.id);
      if (!m) {
        m = this.projMesh(p);
        this.projMeshes.set(p.id, m);
        this.scene.add(m);
      }
      if (p.kind === 'missile') {
        const T = p.t + p.life;
        const k = T > 0 ? p.t / T : 1;
        m.position.set(p.x / 1000, 1.6 + Math.sin(k * Math.PI) * 6 - k * 1.6, p.z / 1000);
        const body = m.getObjectByName('body');
        if (body) body.rotation.z = Math.PI * (0.5 + k * 0.5) * (p.vx >= 0 ? -1 : 1) + Math.PI;
        const mark = m.userData.mark as THREE.Mesh;
        mark.position.set(p.tx / 1000, 0.03, p.tz / 1000);
      } else if (p.kind === 'bus') {
        // 위에서 떨어진다: 시뮬레이션이 y 3400 → 0 으로 내려 준다
        const fy = Math.max(0, p.y / 1000);
        m.position.set(p.x / 1000, fy, p.z / 1000);
        const own = s.f[p.owner];
        m.rotation.y = Math.atan2(own.fx, own.fz);
        const body = m.getObjectByName('body');
        if (body) body.scale.set(1, fy <= 0.01 ? 0.9 : 1, 1);
        const mark = m.userData.mark as THREE.Mesh;
        mark.position.set(p.x / 1000, 0.03, p.z / 1000);
        mark.visible = fy > 0.3;
      } else if (p.kind === 'firewall') {
        m.position.set(p.x / 1000, 0, p.z / 1000);
        m.rotation.y = p.tx || p.tz ? Math.atan2(p.tx, p.tz) : Math.atan2(s.f[p.owner].fx, s.f[p.owner].fz);
        const sc = p.life < 30 ? p.life / 30 : Math.min(1, p.t / 8);
        m.scale.set(1, Math.max(0.01, sc), 1);
      } else if (p.kind === 'falcon') {
        m.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
        const hv = Math.hypot(p.vx, p.vz);
        m.rotation.set(0, 0, 0);
        m.rotation.y = Math.atan2(p.vx, p.vz);
        m.rotateX(-Math.atan2(p.vy, hv || 1));
        const flap = Math.sin(this.time * 24) * 0.7;
        const wl = m.getObjectByName('wingL');
        const wr = m.getObjectByName('wingR');
        if (wl) wl.rotation.y = flap;
        if (wr) wr.rotation.y = -flap;
      } else if (p.kind === 'barrier') {
        m.position.set(p.x / 1000, 0, p.z / 1000);
        m.rotation.y = Math.atan2(p.tx, p.tz);
        const sc = p.life < 30 ? p.life / 30 : Math.min(1, p.t / 8);
        m.scale.set(1, sc, 1);
      } else {
        m.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
        m.rotation.y = Math.atan2(p.vx, p.vz);
        if (p.kind === 'tweet') m.lookAt(this.camera.position);
        if (p.kind === 'bear') {
          m.position.y = Math.abs(Math.sin(this.time * 18)) * 0.15;
        }
        if (p.kind === 'drone') {
          m.position.y += Math.sin(this.time * 6 + p.id) * 0.06;
          m.traverse((r) => {
            if (r.name === 'rotor') r.rotation.y += 0.9;
          });
        }
        if (p.kind === 'baguette') {
          const spin = m.getObjectByName('spin');
          if (spin) spin.rotation.x = this.time * 18;
        }
      }
    }
    for (const [id, m] of this.projMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        const mark = m.userData.mark as THREE.Object3D | undefined;
        if (mark) this.scene.remove(mark);
        this.projMeshes.delete(id);
      }
    }
  }

  // ---------------------------------------------------------- 카메라
  private camTarget(s: GameState): [THREE.Vector3, THREE.Vector3] {
    const [a, b] = s.f;
    const ax = a.x / 1000, az = a.z / 1000, bx = b.x / 1000, bz = b.z / 1000;
    let dx = bx - ax;
    let dz = bz - az;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;
    const rx = dx * s.side;
    const rz = dz * s.side;
    // 화면 안쪽 벡터 I = (rz, -rx) — 시뮬레이션 screenAxes와 같은 정의
    const ix = rz;
    const iz = -rx;
    const mid = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2);
    const back = Math.min(11, Math.max(5.2, 3.8 + dist * 0.9));
    const height = Math.max(a.y, b.y) / 1000;
    const pos = new THREE.Vector3(mid.x - ix * back, 1.55 + back * 0.08 + height * 0.3, mid.z - iz * back);
    const look = new THREE.Vector3(mid.x, 1.05 + height * 0.4, mid.z);
    const kim = s.cine ? this.fighters[s.cine.owner] : null;
    if (s.cine && kim instanceof KimModel) {
      const ut = kim.ultTime(s, s.f[s.cine.owner]);
      if (ut !== null) {
        const [cp, cl] = kim.ultCameraWorld(ut);
        return [cp, cl];
      }
    }
    if (s.cine) {
      const A = s.f[s.cine.owner];
      const D = s.f[1 - s.cine.owner];
      const t = s.cine.t / 60;
      const ap = new THREE.Vector3(A.x / 1000, 0, A.z / 1000);
      const dp = new THREE.Vector3(D.x / 1000, 0, D.z / 1000);
      const fwd = new THREE.Vector3(A.fx / 1000, 0, A.fz / 1000);
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      if (t < 1.4) {
        // 시전자 얼굴 클로즈업
        pos.copy(ap).addScaledVector(fwd, 2.2).addScaledVector(side, 0.6 * Math.sin(t)).setY(1.8);
        look.copy(ap).setY(1.7);
      } else if (t < 3) {
        const ang = (t - 1.4) * 0.8;
        const c = ap.clone().lerp(dp, 0.5);
        pos.copy(c).addScaledVector(side, Math.cos(ang) * 6).addScaledVector(fwd, Math.sin(ang) * 6).setY(3.5 + (A.char === 'kang' ? 3 : 0));
        look.copy(c).setY(1.2);
      } else {
        pos.copy(dp).addScaledVector(fwd, 3.5).addScaledVector(side, 2).setY(1.6);
        look.copy(dp).setY(1.1);
      }
    }
    return [pos, look];
  }

  snapCamera(s: GameState) {
    const [p, l] = this.camTarget(s);
    this.camPos.copy(p);
    this.camLook.copy(l);
  }

  // ---------------------------------------------------------- 렌더
  render(s: GameState, dt: number) {
    this.time += dt;
    if (s.round !== this.lastRound) {
      this.lastRound = s.round;
      this.snapCamera(s);
    }
    for (let i = 0; i < this.fighters.length; i++) {
      const fm = this.fighters[i];
      fm.update(s, s.f[i], dt, this.time);
      const lift = this.ultLift(s, i);
      if (lift > 0) fm.root.position.y += lift;
      this.moveDust(s, i);
      // 김정은 배치기 착지 순간: 흙먼지 + 화면 흔들림
      if (fm instanceof KimModel) {
        const ut = fm.ultTime(s, s.f[i]) ?? -1;
        if (this.prevUlt[i] < 3.0 && ut >= 3.0) {
          fm.root.updateMatrixWorld(true);
          this.explosion(fm.root.localToWorld(new THREE.Vector3(0, 0.3, 0.4)));
          this.shake = 0.9;
        }
        this.prevUlt[i] = ut;
      }
    }
    this.updateProjs(s);
    this.updateUltFx(s, dt);
    this.updateMarkers(s);
    this.stage?.update(dt, this.time);

    for (const p of this.particles) {
      p.life -= dt;
      p.v.y -= (p.gravity ?? 6) * dt;
      p.m.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      if (p.grow) p.m.scale.setScalar(1 + (1 - k) * p.grow);
      ((p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k));
    }
    this.particles = this.particles.filter((p) => {
      if (p.life <= 0) {
        this.scene.remove(p.m);
        return false;
      }
      return true;
    });

    const [tp, tl] = this.camTarget(s);
    const kimCine = s.cine && s.cine.char === 'kang' && this.fighters[s.cine.owner] instanceof KimModel;
    const k = kimCine ? 1 : s.cine ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 8);
    this.camPos.lerp(tp, k);
    this.camLook.lerp(tl, k);
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake + (this.stage?.shake ?? 0);
    this.camera.position.copy(this.camPos);
    if (sh > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
    this.overlay.draw(s, dt);
  }

  /** 월드 좌표 → 화면 픽셀 */
  toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
  }

  headScreen(i: number): { x: number; y: number } | null {
    const f = this.fighters[i];
    if (!f) return null;
    return this.toScreen(f.headWorld.clone().add(new THREE.Vector3(0, 0.5, 0)));
  }
}

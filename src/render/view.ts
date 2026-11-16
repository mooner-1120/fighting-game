// 3D 장면: 카메라(철권식 측면 추적), 이펙트, 투사체, 궁극기 연출.
import * as THREE from 'three';
import { CHARS } from '../sim/chars';
import type { GameEvent, GameState, Proj } from '../sim/types';
import { FighterModel, toon } from './fighterModel';
import { NewsOverlay } from './overlay';
import { Stage, textTexture } from './stages';

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
  fighters: FighterModel[] = [];
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
      const fm = new FighterModel(CHARS[s.cfg.chars[i]], same && i === 1);
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
    this.projMeshes.clear();
    for (const p of this.particles) this.scene.remove(p.m);
    this.particles = [];
    this.clearUltFx();
  }

  private clearUltFx() {
    for (const c of [...this.ultFx.children]) this.ultFx.remove(c);
    this.ultChar = '';
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
        case 'round':
          this.stage?.resetRound();
          break;
      }
    }
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

  private updateUltFx(s: GameState, dt: number) {
    const c = s.cine;
    if (!c) {
      if (this.ultChar) this.clearUltFx();
      return;
    }
    const t = c.t / 60;
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
    for (let i = 0; i < this.fighters.length; i++) this.fighters[i].update(s, s.f[i], dt, this.time);
    this.updateProjs(s);
    this.updateUltFx(s, dt);
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
    const k = s.cine ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 8);
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

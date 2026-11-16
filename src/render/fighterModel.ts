// 캐리커처 3D 캐릭터: 큰 머리 + 과장된 체형을 기본 도형으로 조립한다 (외부 에셋 없음).
import * as THREE from 'three';
import type { CharDef } from '../sim/chardef';
import type { Fighter, GameState } from '../sim/types';
import { type JointName, targetPose } from './poses';

const DEG = Math.PI / 180;
let gradientMap: THREE.Texture | null = null;

export function toonGradient(): THREE.Texture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradientMap = tex;
  return tex;
}

export function toon(color: number, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

function addOutline(m: THREE.Mesh, s = 1.06) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.setScalar(s);
  o.raycast = () => {};
  m.add(o);
}

function capsule(r: number, len: number, mat: THREE.Material, outline = true): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -len / 2 - r * 0.3, 0);
  const m = new THREE.Mesh(g, mat);
  if (outline) addOutline(m, 1.08);
  return m;
}

function sphere(r: number, mat: THREE.Material, outline = true, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat);
  if (outline) addOutline(m);
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, outline = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  if (outline) addOutline(m, 1.05);
  return m;
}

export class FighterModel {
  root = new THREE.Group();
  hips = new THREE.Group();
  joints = {} as Record<JointName, THREE.Group>;
  private cur = new Map<JointName, THREE.Vector3>();
  private curDy = 0;
  private curLean = 0;
  private curRoll = 0;
  private mats: THREE.MeshToonMaterial[] = [];
  private jacket: THREE.Object3D[] = [];
  private bareChest: THREE.Object3D[] = [];
  private props: Record<string, THREE.Object3D> = {};
  private flash = 0;
  private legLen: number;
  shadow: THREE.Mesh;
  def: CharDef;
  headWorld = new THREE.Vector3();

  constructor(def: CharDef, tint = false) {
    this.def = def;
    const L = def.look;
    const H = L.height;
    const mk = (c: number) => {
      const m = toon(tint ? new THREE.Color(c).lerp(new THREE.Color(0x888888), 0.35).getHex() : c);
      this.mats.push(m);
      return m;
    };
    const skin = mk(L.skin);
    const suit = mk(L.suit);
    const shirt = mk(L.shirt);
    const pants = mk(L.pants);
    const hair = mk(L.hair);
    const shoe = mk(0x151515);
    const black = mk(0x111111);
    const white = mk(0xffffff);

    this.legLen = 0.86 * H;
    this.root.add(this.hips);
    const J = (name: JointName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      this.cur.set(name, new THREE.Vector3());
      return g;
    };
    this.joints.hips = this.hips;
    this.cur.set('hips', new THREE.Vector3());

    // 골반
    const pelvis = box(0.36 * L.bodyW, 0.18, 0.24, pants);
    this.hips.add(pelvis);

    // 상체
    const spine = J('spine', this.hips, 0, 0.06);
    const belly = sphere(0.21 * L.belly, suit);
    belly.scale.set(L.bodyW * 1.0, 1.0, 0.95 * L.belly);
    belly.position.set(0, 0.16, 0.03 * L.belly);
    spine.add(belly);
    this.jacket.push(belly);
    const bellyBare = sphere(0.21 * L.belly, skin);
    bellyBare.scale.copy(belly.scale);
    bellyBare.position.copy(belly.position);
    bellyBare.visible = false;
    spine.add(bellyBare);
    this.bareChest.push(bellyBare);

    const chest = J('chest', spine, 0, 0.3);
    const torso = box(0.5 * L.bodyW, 0.36, 0.3, suit);
    torso.position.y = 0.08;
    chest.add(torso);
    this.jacket.push(torso);
    const torsoBare = box(0.5 * L.bodyW, 0.36, 0.3, skin);
    torsoBare.position.y = 0.08;
    torsoBare.visible = false;
    chest.add(torsoBare);
    this.bareChest.push(torsoBare);
    // 가슴 근육 (웃통 벗기)
    for (const sx of [-1, 1]) {
      const pec = sphere(0.12, skin, false, 10);
      pec.scale.set(1.1, 0.7, 0.5);
      pec.position.set(sx * 0.12 * L.bodyW, 0.14, 0.15);
      pec.visible = false;
      chest.add(pec);
      this.bareChest.push(pec);
    }
    // 셔츠 V + 넥타이
    const collar = box(0.16, 0.2, 0.02, shirt, false);
    collar.position.set(0, 0.16, 0.155);
    chest.add(collar);
    this.jacket.push(collar);
    if (L.tie) {
      const tieMat = mk(L.tie);
      const tieLen = def.id === 'rex' ? 0.62 : 0.4;
      const tie = box(0.07, tieLen, 0.02, tieMat, false);
      tie.position.set(0, 0.24 - tieLen / 2, 0.17);
      chest.add(tie);
      this.jacket.push(tie);
    }
    if (L.medals) {
      const cols = [0xd62828, 0xf4d35e, 0x2a9d8f, 0xe9c46a, 0xd62828, 0x264653];
      cols.forEach((c, i) => {
        const md = box(0.05, 0.035, 0.02, mk(c), false);
        md.position.set(-0.17 + (i % 3) * 0.055, 0.18 - Math.floor(i / 3) * 0.045, 0.16);
        chest.add(md);
        this.jacket.push(md);
      });
      // 단추 줄
      for (let i = 0; i < 4; i++) {
        const b = sphere(0.015, mk(0x888866), false, 6);
        b.position.set(0.02, 0.2 - i * 0.09, 0.16);
        chest.add(b);
      }
    }

    // 목 + 머리
    const neck = J('neck', chest, 0, 0.27);
    const neckM = capsule(0.07, 0.04, skin, false);
    neckM.position.y = 0.06;
    neck.add(neckM);
    const head = new THREE.Group();
    head.position.y = 0.26 * L.headScale;
    neck.add(head);
    this.buildHead(head, L, skin, hair, black, white, mk);

    // 팔
    for (const side of ['l', 'r'] as const) {
      const sx = side === 'l' ? 1 : -1;
      const sh = J(side === 'l' ? 'lSh' : 'rSh', chest, sx * 0.3 * L.bodyW, 0.2);
      const shoulder = sphere(0.1, suit);
      sh.add(shoulder);
      this.jacket.push(shoulder);
      const up = capsule(0.075, 0.24, suit);
      sh.add(up);
      this.jacket.push(up);
      const upBare = capsule(0.08, 0.24, skin);
      upBare.visible = false;
      sh.add(upBare);
      this.bareChest.push(upBare);
      const el = J(side === 'l' ? 'lEl' : 'rEl', sh, 0, -0.32);
      const fore = capsule(0.068, 0.22, suit);
      el.add(fore);
      this.jacket.push(fore);
      const foreBare = capsule(0.072, 0.22, skin);
      foreBare.visible = false;
      el.add(foreBare);
      this.bareChest.push(foreBare);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), shirt);
      cuff.position.y = -0.3;
      el.add(cuff);
      const hand = sphere(0.085, skin);
      hand.position.y = -0.37;
      hand.scale.set(1, 1.1, 0.9);
      el.add(hand);
      if (side === 'r') this.props.hand = hand;
    }

    // 다리
    for (const side of ['l', 'r'] as const) {
      const sx = side === 'l' ? 1 : -1;
      const hip = J(side === 'l' ? 'lHip' : 'rHip', this.hips, sx * 0.11 * L.bodyW, -0.05);
      const thigh = capsule(0.095, 0.3, pants);
      hip.add(thigh);
      const knee = J(side === 'l' ? 'lKnee' : 'rKnee', hip, 0, -0.42 * H);
      const shin = capsule(0.08, 0.3, pants);
      knee.add(shin);
      const foot = box(0.14, 0.09, 0.28, shoe);
      foot.position.set(0, -0.42 * H, 0.06);
      knee.add(foot);
    }

    this.buildProps(mk);
    this.hips.position.y = this.legLen;

    // 블롭 그림자
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.01;
    this.shadow = sh;

    const sc = 1.0;
    this.root.scale.setScalar(sc);
  }

  private buildHead(head: THREE.Group, L: CharDef['look'], skin: THREE.Material, hair: THREE.Material, black: THREE.Material, white: THREE.Material, mk: (c: number) => THREE.MeshToonMaterial) {
    const hs = L.headScale;
    const R = 0.27 * hs;
    const skull = sphere(R, skin, true, 20);
    skull.scale.set(1, 1.08, 1);
    head.add(skull);
    // 귀
    for (const sx of [-1, 1]) {
      const ear = sphere(0.06 * hs, skin, false, 8);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sx * R * 0.98, 0, 0);
      head.add(ear);
    }
    // 코
    const nose = sphere(0.065 * hs, skin, false, 10);
    nose.scale.set(0.9, 1.1, 1.2);
    nose.position.set(0, -0.02 * hs, R * 0.98);
    head.add(nose);
    // 눈
    for (const sx of [-1, 1]) {
      const eye = sphere(0.05 * hs, white, false, 10);
      eye.scale.set(1, 0.8, 0.5);
      eye.position.set(sx * 0.09 * hs, 0.06 * hs, R * 0.9);
      head.add(eye);
      const pupil = sphere(0.025 * hs, black, false, 8);
      pupil.position.set(sx * 0.09 * hs, 0.06 * hs, R * 0.9 + 0.025);
      head.add(pupil);
      const brow = box(0.1 * hs, 0.022, 0.03, mk(L.hair === 0xf4d35e ? 0xc9a43e : 0x2a2018), false);
      brow.position.set(sx * 0.09 * hs, 0.13 * hs, R * 0.88);
      brow.rotation.z = sx * -0.15;
      head.add(brow);
    }
    // 입
    const mouth = box(0.13 * hs, 0.025, 0.02, mk(0x7a2c2c), false);
    mouth.position.set(0, -0.13 * hs, R * 0.88);
    head.add(mouth);

    switch (L.hairStyle) {
      case 'bald': {
        // 듬성듬성 옆머리
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.92, 0.04, 6, 20, Math.PI * 1.2), hair);
        ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.9);
        ring.position.y = 0.02;
        head.add(ring);
        const tuft = sphere(R * 0.75, hair, false, 12);
        tuft.scale.set(1, 0.25, 0.9);
        tuft.position.set(0, R * 0.85, -0.03);
        head.add(tuft);
        break;
      }
      case 'swoop': {
        const cap = sphere(R * 1.04, hair, true, 16);
        cap.scale.set(1.05, 0.55, 1.05);
        cap.position.set(0, R * 0.55, -0.02);
        head.add(cap);
        const swoop = sphere(R * 0.75, hair, true, 14);
        swoop.scale.set(1.5, 0.55, 0.9);
        swoop.position.set(R * 0.15, R * 0.75, R * 0.45);
        swoop.rotation.z = -0.2;
        head.add(swoop);
        const back = sphere(R * 0.9, hair, false, 12);
        back.scale.set(1.1, 0.9, 0.6);
        back.position.set(0, R * 0.15, -R * 0.55);
        head.add(back);
        break;
      }
      case 'fade': {
        const top = box(R * 1.7, R * 0.55, R * 1.75, hair);
        top.position.set(0, R * 0.92, -0.01);
        head.add(top);
        const sides = sphere(R * 1.01, mk(0x3a3a3a), false, 16);
        sides.scale.set(1, 0.5, 1);
        sides.position.y = R * 0.35;
        head.add(sides);
        break;
      }
      case 'neat':
      case 'helmet':
      case 'curly': {
        const cap = sphere(R * 1.05, hair, true, 16);
        cap.scale.set(1.02, 0.6, 1.05);
        cap.position.set(0, R * 0.5, -0.03);
        head.add(cap);
        const part = sphere(R * 0.6, hair, false, 10);
        part.scale.set(1.4, 0.5, 1);
        part.position.set(-R * 0.25, R * 0.78, R * 0.35);
        head.add(part);
        break;
      }
    }
    if (L.glasses) {
      const gm = mk(0x222222);
      for (const sx of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055 * hs, 0.01, 6, 16), gm);
        rim.position.set(sx * 0.09 * hs, 0.06 * hs, R * 0.95 + 0.02);
        head.add(rim);
      }
      const bridge = box(0.05 * hs, 0.01, 0.01, gm, false);
      bridge.position.set(0, 0.07 * hs, R * 0.97 + 0.02);
      head.add(bridge);
    }
    this.props.head = head;
  }

  private buildProps(mk: (c: number) => THREE.MeshToonMaterial) {
    const hand = this.props.hand;
    // 골프채 (렉스)
    const club = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), mk(0xcccccc));
    shaft.position.y = -0.5;
    club.add(shaft);
    const headC = box(0.08, 0.06, 0.16, mk(0xffd23f));
    headC.position.set(0, -1.0, 0.05);
    club.add(headC);
    club.visible = false;
    hand.add(club);
    this.props.golf = club;
    // 서류 (서도윤)
    const paper = box(0.3, 0.02, 0.4, mk(0xf8f8f0));
    paper.position.set(0, -0.08, 0.1);
    paper.visible = false;
    hand.add(paper);
    this.props.slam = paper;
    // 휴대폰
    const phone = box(0.08, 0.15, 0.015, mk(0x111133));
    phone.position.set(0, -0.06, 0.06);
    phone.visible = false;
    hand.add(phone);
    this.props.phone = phone;
    // 와인잔/마이크 대체: 확성기 (궁극기)
    const mic = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10, 1, true), mk(0xdddddd));
    mic.rotation.x = Math.PI / 2;
    mic.position.set(0, -0.1, 0.12);
    mic.visible = false;
    hand.add(mic);
    this.props.mic = mic;
  }

  /** 렌더 프레임마다 호출 */
  update(s: GameState, f: Fighter, dt: number, time: number) {
    // 위치·방향
    this.root.position.set(f.x / 1000, f.y / 1000, f.z / 1000);
    this.root.rotation.y = Math.atan2(f.fx, f.fz);
    this.shadow.position.set(f.x / 1000, 0.01, f.z / 1000);
    const sc = Math.max(0.4, 1 - f.y / 3000);
    this.shadow.scale.setScalar(sc);

    const tp = targetPose(s, f, time);
    const snappy = f.st === 'atk' || f.st === 'hs' || f.st === 'bs';
    const k = snappy ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 16);
    for (const [name, g] of Object.entries(this.joints) as [JointName, THREE.Group][]) {
      const t = tp.j[name];
      if (!t) continue;
      const c = this.cur.get(name)!;
      c.x += (t[0] - c.x) * k;
      c.y += (t[1] - c.y) * k;
      c.z += (t[2] - c.z) * k;
      if (name === 'hips') continue;
      g.rotation.set(c.x * DEG, c.y * DEG, c.z * DEG);
    }
    this.curDy += (tp.dy - this.curDy) * k;
    this.curLean += (tp.lean - this.curLean) * k;
    this.curRoll += (tp.roll - this.curRoll) * k;
    this.hips.position.y = this.legLen + this.curDy;
    this.hips.rotation.x = (this.curLean + this.curRoll) * DEG;

    // 웃통 벗기 (볼코프 아머)
    const bare = this.def.id === 'volkov' && f.buffs.armor > 0;
    for (const o of this.jacket) o.visible = !bare;
    for (const o of this.bareChest) o.visible = bare;

    // 소품
    const anim = f.st === 'atk' && f.move ? this.def.moves[f.move]?.anim : '';
    this.props.golf.visible = anim === 'golf';
    this.props.slam.visible = anim === 'slam';
    this.props.phone.visible = anim === 'phone';
    this.props.mic.visible = f.st === 'ult' && s.cine?.owner === f.idx;

    // 피격 플래시
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    const armorGlow = f.buffs.armor > 0 ? 0.25 + 0.15 * Math.sin(time * 10) : 0;
    const emerg = f.hp > 0 && f.hp * 4 <= f.maxHp ? 0.15 + 0.1 * Math.sin(time * 8) : 0;
    for (const m of this.mats) {
      m.emissive.setRGB(this.flash + emerg, this.flash * 0.9 + armorGlow * 0.5, this.flash * 0.8 + armorGlow);
    }
    this.props.head.getWorldPosition(this.headWorld);
  }

  hitFlash() {
    this.flash = 0.8;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
    for (const m of this.mats) m.dispose();
  }
}

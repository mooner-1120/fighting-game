// 리깅한 조각상 모델(푸틴·트럼프 3MF 기반)을 게임 캐릭터로 쓰기 위한 래퍼.
// 김정은과 같은 방식으로, 게임의 절차적 애니메이션(관절 각도)을 모델의 팔다리 방향으로 바꿔 재생한다.
import * as THREE from 'three';
import type { CharDef } from '../../sim/chardef';
import type { CharId, Fighter, GameState } from '../../sim/types';
import { targetPose, type JointName } from '../poses';
import { dummyFighter, dummyState, gamePoseToKim } from '../kim/kimModel';
import type { KimPart, KimPose, KimRig } from '../kim/kimRig';
import { makeFalcon, makeHandbag, makeSupercar, makeTeacup, makeUmbrella } from '../propMeshes';
import * as mbs from './mbsRig';
import * as putin from './putinRig';
import * as thatcher from './thatcherRig';
import * as trump from './trumpRig';

interface RigModule {
  J: Record<string, [number, number, number]>;
  buildRig(parts: KimPart[]): KimRig;
  applyPose(rig: KimRig, pose: KimPose): void;
}

/** 게임 캐릭터 id → 모델 (볼코프 자리 = 푸틴, 렉스 자리 = 트럼프) */
const MODELS: Partial<Record<CharId, { file: string; rig: RigModule }>> = {
  volkov: { file: './models/putin_parts.json', rig: putin },
  rex: { file: './models/trump_parts.json', rig: trump },
  mbs: { file: './models/mbs_parts.json', rig: mbs },
  thatcher: { file: './models/thatcher_parts.json', rig: thatcher },
};
const loaded = new Map<CharId, KimPart[]>();

/** 모델 데이터를 미리 읽어 둔다 (실패한 캐릭터는 기존 도형 캐릭터를 쓴다) */
export async function loadStatues(): Promise<void> {
  await Promise.all(
    Object.entries(MODELS).map(async ([id, m]) => {
      try {
        const res = await fetch(m!.file);
        if (!res.ok) return;
        loaded.set(id as CharId, ((await res.json()) as { parts: KimPart[] }).parts);
      } catch {
        /* 도형 캐릭터로 대신한다 */
      }
    }),
  );
}

export function statueReady(id: CharId): boolean {
  return loaded.has(id);
}

interface Scrap {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export class StatueModel {
  root = new THREE.Group();
  shadow: THREE.Mesh;
  headWorld = new THREE.Vector3();
  rig: KimRig;
  private mod: RigModule;
  private legRatio: number;
  private cur = new Map<JointName, THREE.Vector3>();
  private curDy = 0;
  private curLean = 0;
  private curRoll = 0;
  private flash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private bareUniforms: { value: number }[] = [];
  private wasBare = false;
  private scraps: Scrap[] = [];
  private club: THREE.Group;
  private mic: THREE.Mesh;
  /** 기술(anim)마다 보이는 소품. untilProj: 투사체를 던진 뒤엔 사라짐, upright: 몸 기준으로 똑바로 */
  private animProps: { obj: THREE.Object3D; anims: string[]; untilProj: boolean; upright: boolean }[] = [];
  private ghost = 1;
  /** 궁극기 때 확성기 대신 장우산 */
  private ultUmbrella = false;

  constructor(public def: CharDef, tint = false) {
    const parts = loaded.get(def.id);
    const m = MODELS[def.id];
    if (!parts || !m) throw new Error(`${def.name} 모델이 아직 로드되지 않았습니다`);
    this.mod = m.rig;
    this.legRatio = m.rig.J.root[1] / 0.86;
    this.rig = m.rig.buildRig(parts);
    this.rig.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshStandardMaterial[]) {
        if (o === this.rig.mesh) this.mats.push(mat);
        if (mat.userData.bare) this.bareUniforms.push(mat.userData.bare);
      }
    });
    // 같은 캐릭터끼리 붙으면 2P는 색을 조금 죽인다
    if (tint) for (const mat of this.mats) mat.color.lerp(new THREE.Color(0x888888), 0.35);
    this.root.add(this.rig.mesh);

    // 손에 드는 소품: 골프채(트럼프 기술), 확성기(궁극기)
    const J = m.rig.J;
    const hand = this.rig.bones.R_hand;
    const palm = new THREE.Vector3(...J.R_tip).sub(new THREE.Vector3(...J.R_wr)).multiplyScalar(0.55);
    const metal = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.6 });
    this.club = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.0, 6), metal(0xcccccc));
    shaft.position.y = -0.45;
    const clubHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), metal(0xffd23f));
    clubHead.position.set(0, -0.95, 0.05);
    this.club.add(shaft, clubHead);
    this.club.position.copy(palm);
    this.club.visible = false;
    hand.add(this.club);
    this.mic = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
    this.mic.rotation.x = Math.PI / 2;
    this.mic.position.copy(palm).add(new THREE.Vector3(0, 0, 0.1));
    this.mic.visible = false;
    hand.add(this.mic);

    // 빈 살만: 슈퍼카(몸 아래), 왼팔에 앉은 매
    if (def.id === 'mbs') {
      const mk = (c: number, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: c, ...extra });
      const car = makeSupercar(mk);
      car.position.set(0, 0, 0.15);
      car.visible = false;
      this.rig.bones.root.parent!.add(car);
      this.animProps.push({ obj: car, anims: ['car'], untilProj: false, upright: false });
      const anchor = new THREE.Group();
      const bird = makeFalcon(mk);
      bird.position.set(0, 0.05, 0);
      anchor.add(bird);
      anchor.visible = false;
      anchor.position.copy(new THREE.Vector3(...J.L_kn).sub(new THREE.Vector3(...J.L_wr)).multiplyScalar(0.5));
      this.rig.bones.L_hand.add(anchor);
      this.animProps.push({ obj: anchor, anims: ['falcon'], untilProj: true, upright: true });
    }

    // 대처: 장우산(궁극기에도 듦), 찻잔(티타임), 핸드백(의회 질의) — 오른손
    if (def.id === 'thatcher') {
      const mk = (c: number, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: c, ...extra });
      const umb = makeUmbrella(mk);
      umb.position.copy(palm);
      umb.visible = false;
      hand.add(umb);
      this.animProps.push({ obj: umb, anims: ['umbrella', 'ult'], untilProj: false, upright: false });
      const upright = (obj: THREE.Object3D, anims: string[], scale = 1) => {
        const a = new THREE.Group();
        obj.scale.setScalar(scale);
        a.add(obj);
        a.position.copy(palm);
        a.visible = false;
        hand.add(a);
        this.animProps.push({ obj: a, anims, untilProj: false, upright: true });
      };
      upright(makeTeacup(mk), ['tea'], 0.85);
      upright(makeHandbag(mk), ['question'], 1.6);
      this.ultUmbrella = true;
    }

    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.01;
    this.shadow = sh;
    this.mod.applyPose(this.rig, gamePoseToKim(targetPose(dummyState, dummyFighter, 0), this.legRatio));
  }

  /** 초상화용: 팔을 내린 차렷 자세 (T자 자세 모델도 팔을 내린다) */
  restPose() {
    const down: [number, number, number] = [0.12, -1, 0.04];
    this.mod.applyPose(this.rig, { drop: 0, fist: 0.35, L_upper: down, L_fore: [0.06, -1, 0.1], R_upper: down, R_fore: [0.06, -1, 0.1] });
  }

  update(s: GameState, f: Fighter, dt: number, time: number) {
    this.root.position.set(f.x / 1000, f.y / 1000, f.z / 1000);
    this.root.rotation.y = Math.atan2(f.fx, f.fz);
    this.shadow.position.set(f.x / 1000, 0.01, f.z / 1000);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - f.y / 3000));

    const tp = targetPose(s, f, time);
    const snappy = f.st === 'atk' || f.st === 'hs' || f.st === 'bs';
    const k = snappy ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 16);
    const sm: typeof tp = { j: {}, dy: 0, lean: 0, roll: 0 };
    for (const [name, t] of Object.entries(tp.j) as [JointName, [number, number, number]][]) {
      let c = this.cur.get(name);
      if (!c) this.cur.set(name, (c = new THREE.Vector3(...t)));
      c.x += (t[0] - c.x) * k;
      c.y += (t[1] - c.y) * k;
      c.z += (t[2] - c.z) * k;
      sm.j[name] = [c.x, c.y, c.z];
    }
    this.curDy += (tp.dy - this.curDy) * k;
    this.curLean += (tp.lean - this.curLean) * k;
    this.curRoll += (tp.roll - this.curRoll) * k;
    sm.dy = this.curDy;
    sm.lean = this.curLean;
    sm.roll = this.curRoll;
    this.mod.applyPose(this.rig, gamePoseToKim(sm, this.legRatio));

    // 소품
    const ulting = f.st === 'ult' && s.cine?.owner === f.idx;
    const anim = f.st === 'atk' && f.move ? this.def.moves[f.move]?.anim : ulting ? 'ult' : '';
    this.club.visible = anim === 'golf';
    const mv = f.st === 'atk' && f.move ? this.def.moves[f.move] : undefined;
    let uprightDirty = false;
    for (const p of this.animProps) {
      let v = !!anim && p.anims.includes(anim);
      if (v && p.untilProj && mv?.proj && f.mf >= mv.proj.f) v = false;
      p.obj.visible = v;
      if (v && p.upright) uprightDirty = true;
    }
    if (uprightDirty) {
      this.root.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      for (const p of this.animProps) {
        if (!p.upright || !p.obj.visible) continue;
        p.obj.parent!.getWorldQuaternion(q);
        p.obj.quaternion.copy(q.invert().multiply(this.root.quaternion));
      }
    }
    // 모래폭풍 대시 등 통과 상태는 반투명
    this.setGhost(f.buffs.hidden > 0 ? 0.5 : 1);
    this.mic.visible = ulting && !this.ultUmbrella;

    // 웃통 벗기 (푸틴 아머): 맨살로 바꾸고, 벗는 순간 재킷·셔츠 조각이 찢어져 날아간다
    const bare = this.bareUniforms.length > 0 && f.buffs.armor > 0;
    for (const u of this.bareUniforms) u.value = bare ? 1 : 0;
    if (bare && !this.wasBare) this.tearClothes();
    this.wasBare = bare;
    this.updateScraps(dt);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    const armorGlow = f.buffs.armor > 0 ? 0.04 + 0.03 * Math.sin(time * 10) : 0;
    const emerg = f.hp > 0 && f.hp * 4 <= f.maxHp ? 0.15 + 0.1 * Math.sin(time * 8) : 0;
    for (const m of this.mats) m.emissive.setRGB(this.flash + emerg + armorGlow, this.flash * 0.9 + armorGlow * 0.5, this.flash * 0.8 + armorGlow * 0.3);
    this.rig.bones.head.getWorldPosition(this.headWorld);
    this.headWorld.y += 0.12;
  }

  private tearClothes() {
    const chest = new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    this.rig.bones.chest.getWorldPosition(chest);
    this.root.worldToLocal(chest);
    const colors = [0x2b3140, 0x2b3140, 0x2b3140, 0x2b3140, 0x2b3140, 0x2b3140, 0xeef0f2, 0xeef0f2, 0x5e1d2a];
    for (const c of colors) {
      // 찢어진 천 조각: 꼭짓점을 흩뜨린 사각형
      const g = new THREE.PlaneGeometry(0.16 + Math.random() * 0.14, 0.12 + Math.random() * 0.12, 2, 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setXY(i, pos.getX(i) * (0.7 + Math.random() * 0.6), pos.getY(i) * (0.7 + Math.random() * 0.6));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide, transparent: true }));
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a) * 0.8 + 0.2);
      m.position.copy(chest).addScaledVector(dir, 0.15).add(new THREE.Vector3(0, (Math.random() - 0.3) * 0.25, 0));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const v = dir.multiplyScalar(1.6 + Math.random() * 1.6).add(new THREE.Vector3(0, 2 + Math.random() * 2, 0));
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
      this.root.add(m);
      this.scraps.push({ m, v, spin, life: 1.1 + Math.random() * 0.4 });
    }
  }

  private updateScraps(dt: number) {
    for (const p of this.scraps) {
      p.life -= dt;
      p.v.y -= 7 * dt;
      p.v.multiplyScalar(1 - dt * 1.2);
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      p.m.rotation.z += p.spin.z * dt;
      (p.m.material as THREE.MeshStandardMaterial).opacity = Math.min(1, p.life * 2);
    }
    this.scraps = this.scraps.filter((p) => {
      if (p.life > 0) return true;
      this.root.remove(p.m);
      p.m.geometry.dispose();
      (p.m.material as THREE.Material).dispose();
      return false;
    });
  }

  private setGhost(a: number) {
    if (a === this.ghost) return;
    this.ghost = a;
    for (const m of this.mats) {
      m.transparent = a < 1;
      m.opacity = a;
      m.depthWrite = a >= 1;
      m.needsUpdate = true;
    }
  }

  hitFlash() {
    this.flash = 0.8;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
  }
}

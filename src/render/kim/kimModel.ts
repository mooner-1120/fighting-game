// 리깅한 김정은 모델(OBJ 기반)을 게임 캐릭터로 쓰기 위한 래퍼.
// 게임의 절차적 애니메이션(관절 각도)을 이 모델의 팔다리 방향으로 바꿔 재생한다 (리타기팅).
import * as THREE from 'three';
import type { CharDef } from '../../sim/chardef';
import type { Fighter, GameState } from '../../sim/types';
import { targetPose, type JointName } from '../poses';
import { applyPose, buildRig, J, MOVES, sampleMove, type KimPart, type KimPose, type KimRig } from './kimRig';
import { buildProps, ULT, ultCamera, updateProps, type UltProps } from './kimUlt';

let parts: KimPart[] | null = null;

/** 모델 데이터를 미리 읽어 둔다 (실패하면 기존 도형 캐릭터를 쓴다) */
export async function loadKim(): Promise<void> {
  try {
    const res = await fetch('./models/kim_parts.json');
    if (!res.ok) return;
    parts = ((await res.json()) as { parts: KimPart[] }).parts;
  } catch {
    parts = null;
  }
}

export function kimReady(): boolean {
  return parts !== null;
}

/** 궁극기 연출 속도: 배치기 착지(연출 3.0초)가 화면의 「직격!」 자막(컷신 3.6초) 직후에 오도록 */
export const ULT_SPEED = 0.83;

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);
const LEG_RATIO = J.root[1] / 0.86; // 게임 도형 캐릭터 다리 길이 대비

function dirOf(...rots: [number, number, number][]): THREE.Vector3 {
  const q = new THREE.Quaternion();
  for (const r of rots) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)));
  return DOWN.clone().applyQuaternion(q);
}

export class KimModel {
  root = new THREE.Group();
  shadow: THREE.Mesh;
  headWorld = new THREE.Vector3();
  rig: KimRig;
  props: UltProps;
  private cur = new Map<JointName, THREE.Vector3>();
  private curDy = 0;
  private curLean = 0;
  private curRoll = 0;
  private flash = 0;
  private mats: THREE.MeshStandardMaterial[];

  constructor(public def: CharDef, tint = false) {
    if (!parts) throw new Error('김정은 모델이 아직 로드되지 않았습니다');
    this.rig = buildRig(parts);
    this.mats = (this.rig.mesh.material as THREE.MeshStandardMaterial[]).filter((m) => m.name !== 'cornea');
    if (tint) for (const m of this.mats) m.color.lerp(new THREE.Color(0x888888), 0.35);
    this.root.add(this.rig.mesh);
    this.props = buildProps(this.rig);
    this.root.add(this.props.world);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.01;
    this.shadow = sh;
    applyPose(this.rig, { ...gamePoseToKim(targetPose(dummyState, dummyFighter, 0)), fist: 1 });
  }

  /** 이 캐릭터의 궁극기 컷신이 재생 중이면 컷신 시간(초, 연출 기준) */
  ultTime(s: GameState, f: Fighter): number | null {
    if (!s.cine || s.cine.owner !== f.idx) return null;
    return (s.cine.t / 60) * ULT_SPEED;
  }

  update(s: GameState, f: Fighter, dt: number, time: number) {
    this.root.position.set(f.x / 1000, f.y / 1000, f.z / 1000);
    this.root.rotation.y = Math.atan2(f.fx, f.fz);
    this.shadow.position.set(f.x / 1000, 0.01, f.z / 1000);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - f.y / 3000));

    const ut = this.ultTime(s, f);
    if (ut !== null) {
      // 궁극기: 핵 단추 → 탄두가 된 원수님 → 배치기
      applyPose(this.rig, sampleMove(MOVES[ULT], ut));
      updateProps(this.props, ut);
      this.shadow.visible = ut < 1.3 || ut > 2.85;
    } else {
      updateProps(this.props, -1);
      this.shadow.visible = true;
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
      const pose = gamePoseToKim(sm);
      pose.fist = f.st === 'win' || f.st === 'ko' || f.st === 'down' ? 0.4 : 1;
      applyPose(this.rig, pose);
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    const emerg = f.hp > 0 && f.hp * 4 <= f.maxHp ? 0.15 + 0.1 * Math.sin(time * 8) : 0;
    for (const m of this.mats) m.emissive.setRGB(this.flash + emerg, this.flash * 0.9, this.flash * 0.8);
    this.rig.bones.head.getWorldPosition(this.headWorld);
    this.headWorld.y += 0.12;
  }

  /** 궁극기 카메라 (월드 좌표) */
  ultCameraWorld(ut: number): [THREE.Vector3, THREE.Vector3] {
    this.root.updateMatrixWorld(true);
    const rp = new THREE.Vector3();
    this.rig.bones.root.getWorldPosition(rp);
    const c = ultCamera(ut, rp.y - this.root.position.y);
    return [this.root.localToWorld(c.pos), this.root.localToWorld(c.target)];
  }

  hitFlash() {
    this.flash = 0.8;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
  }
}

/** 게임 포즈(관절 각도, 팔다리가 아래로 늘어진 기준) → 김정은 리그 포즈(팔다리 방향) */
function gamePoseToKim(tp: ReturnType<typeof targetPose>): KimPose {
  const j = tp.j as Record<JointName, [number, number, number]>;
  const z: [number, number, number] = [0, 0, 0];
  const g = (n: JointName) => j[n] ?? z;
  const out: KimPose = {
    // kimRig는 [x, y, -z]를 YXZ 순서로 쓰므로 z 부호를 맞춘다
    root: [tp.lean + tp.roll, 0, 0],
    spine: [g('spine')[0], g('spine')[1], -g('spine')[2]],
    chest: [g('chest')[0], g('chest')[1], -g('chest')[2]],
    neck: [g('neck')[0], g('neck')[1], -g('neck')[2]],
    head: [0, 0, 0],
    drop: tp.dy * LEG_RATIO,
  };
  const set = (side: 'L' | 'R', key: string, v: THREE.Vector3) => {
    // kimRig는 오른쪽(R) 방향의 x를 뒤집어 쓰므로 미리 뒤집어 넘긴다
    out[`${side}_${key}`] = side === 'R' ? [-v.x, v.y, v.z] : [v.x, v.y, v.z];
  };
  set('L', 'upper', dirOf(g('lSh')));
  set('L', 'fore', dirOf(g('lSh'), g('lEl')));
  set('R', 'upper', dirOf(g('rSh')));
  set('R', 'fore', dirOf(g('rSh'), g('rEl')));
  set('L', 'thigh', dirOf(g('lHip')));
  set('L', 'shin', dirOf(g('lHip'), g('lKnee')));
  set('R', 'thigh', dirOf(g('rHip')));
  set('R', 'shin', dirOf(g('rHip'), g('rKnee')));
  return out;
}

// 생성 직후 기본 자세용
const dummyFighter = { st: 'idle', crouching: false, idx: 0, sf: 0, sd: 0, mf: 0, move: null } as unknown as Fighter;
const dummyState = { cine: null } as unknown as GameState;

// 궁극기 「핵 단추」 소품과 카메라: 붉은 단추, 발끝에 붙는 미사일 꼬리(김정은이 탄두), 폭발·충격파·구덩이
import * as THREE from 'three';

export const ULT = '궁극기: 핵 단추';

const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

/** 시간 t(초)의 소품 상태 (0~1) */
export function propState(t) {
  return {
    button: ramp(t, 0.1, 0.4) * (1 - ramp(t, 1.35, 1.6)),
    press: ramp(t, 0.58, 0.64) * (1 - ramp(t, 0.95, 1.1)),
    tail: ramp(t, 2.0, 2.1) * (1 - ramp(t, 3.35, 3.6)),
    boom: t < 3.0 ? 0 : t < 3.22 ? 0.25 + 0.75 * ramp(t, 3.0, 3.22) : 1 - ramp(t, 3.22, 3.65),
    ring: t < 3.0 || t > 3.75 ? 0 : 0.05 + ramp(t, 3.0, 3.75),
    crater: t < 3.0 ? 0 : 1 - ramp(t, 4.9, 5.3),
    shake: t < 3.0 ? 0 : Math.max(0, 1 - (t - 3.0) / 0.9),
    alarm: t >= 0.62 && t < 2.1 ? 1 : 0,
  };
}

function label(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg;
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

export function buildProps(rig) {
  // ---- 핵 단추 (김정은 앞)
  const button = new THREE.Group();
  button.name = 'NukeButton';
  button.position.set(-0.12, -0.12, 0.42);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.7, 24), std(0x3a3d44, { metalness: 0.5 }));
  ped.position.y = 0.35;
  button.add(ped);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 24), std(0xf2c230));
  stripe.position.y = 0.08;
  button.add(stripe);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), new THREE.MeshBasicMaterial({ map: label('핵', '#111', '#ff3030') }));
  plate.position.set(0, 0.5, 0.135);
  plate.rotation.x = -0.08;
  button.add(plate);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 24), std(0x22252b, { metalness: 0.6 }));
  cap.position.y = 0.72;
  button.add(cap);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe01010, { emissive: 0x330000, roughness: 0.25 }));
  top.name = 'NukeButtonTop';
  top.position.y = 0.74;
  top.scale.set(1, 0.7, 1);
  button.add(top);

  // ---- 미사일 꼬리: 루트 뼈에 붙여 다리 끝 너머로 (몸 전체가 탄두)
  const tail = new THREE.Group();
  tail.name = 'WarheadTail';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 1.0, 24), std(0xd9dcdf, { metalness: 0.3 }));
  body.position.y = -1.45;
  tail.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.12, 24), std(0xc81414));
  band.position.y = -1.05;
  tail.add(band);
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: label('★', '#c81414', '#ffffff'), side: THREE.DoubleSide }));
  star.position.set(0, -1.3, 0.205);
  tail.add(star);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.24), std(0x3b3f46));
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.sin(a) * 0.26, -1.8, Math.cos(a) * 0.26);
    fin.rotation.y = a;
    tail.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0xffa020 }));
  flame.position.y = -2.18;
  flame.rotation.x = Math.PI;
  flame.name = 'WarheadFlame';
  tail.add(flame);
  tail.scale.setScalar(0.0001);
  rig.bones.root.add(tail);

  // ---- 폭발·충격파·구덩이 (착지 지점)
  const world = new THREE.Group();
  world.name = 'UltFx';
  world.add(button);
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.75, depthWrite: false }));
  boom.name = 'Boom';
  boom.position.set(0, 0.25, 0.35);
  world.add(boom);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85 }));
  ring.name = 'BoomRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.05, 0.35);
  world.add(ring);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0x15171c, transparent: true, opacity: 0.8, depthWrite: false }));
  crater.name = 'Crater';
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(0, 0.012, 0.35);
  world.add(crater);
  const props = { world, button, top, tail, flame, boom, ring, crater };
  updateProps(props, -1);
  return props;
}

const TINY = 0.0001;

/** 소품을 t초 상태로 맞춘다 (t < 0 이면 모두 숨김) */
export function updateProps(props, t) {
  const st = t < 0 ? { button: 0, press: 0, tail: 0, boom: 0, ring: 0, crater: 0, alarm: 0 } : propState(t);
  props.button.scale.setScalar(Math.max(TINY, st.button));
  props.top.position.y = 0.74 - st.press * 0.04;
  props.top.material.emissive.setHex(st.alarm ? (Math.floor(t * 8) % 2 ? 0xff2020 : 0x550000) : 0x330000);
  props.tail.scale.setScalar(Math.max(TINY, st.tail));
  props.flame.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * 40)), 1);
  props.boom.scale.setScalar(Math.max(TINY, st.boom * 1.5));
  props.boom.material.opacity = 0.55 * Math.min(1, st.boom * 1.5) * (t < 3.25 ? 1 : 0.6);
  props.ring.scale.setScalar(Math.max(TINY, st.ring * 6));
  props.ring.material.opacity = 0.9 * (1 - st.ring);
  props.crater.scale.setScalar(Math.max(TINY, st.crater));
}

/** 궁극기 카메라: 하늘로 솟는 김정은을 따라 올려다보고, 떨어지는 탄두를 받아 착지 순간 흔들린다 */
export function ultCamera(t, rootY) {
  const st = propState(t);
  const ty = Math.max(0.9, rootY);
  const dist = 4.6 + (ty - 0.9) * 0.45 + (t > 3.0 ? 1.4 * Math.min(1, (t - 3) * 3) : 0);
  // 게임에서는 상대가 앞(+Z) 1.3m에 서 있으므로 옆에서 본다 (상대가 가리지 않게)
  const pos = new THREE.Vector3(dist * 0.97, 1.1 + ty * 0.35, dist * 0.22);
  const target = new THREE.Vector3(0, ty - 0.15, 0.55);
  if (st.shake > 0) {
    const k = st.shake * st.shake * 0.25;
    pos.x += Math.sin(t * 97) * k;
    pos.y += Math.sin(t * 131) * k;
    target.y += Math.sin(t * 83) * k * 0.5;
  }
  return { pos, target };
}

/** GLB용 소품 애니메이션 트랙 */
export function propTracks(times) {
  const s = (name, f) => new THREE.VectorKeyframeTrack(`${name}.scale`, times, times.flatMap((t) => { const v = Math.max(TINY, f(propState(t))); return [v, v, v]; }));
  return [
    s('NukeButton', (p) => p.button),
    new THREE.VectorKeyframeTrack('NukeButtonTop.position', times, times.flatMap((t) => [0, 0.74 - propState(t).press * 0.04, 0])),
    s('WarheadTail', (p) => p.tail),
    s('Boom', (p) => p.boom * 1.5),
    s('BoomRing', (p) => p.ring * 6),
    s('Crater', (p) => p.crater),
  ];
}

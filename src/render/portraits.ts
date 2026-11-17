// 캐릭터 초상화를 3D 모델에서 한 번 렌더링해 이미지로 캐시한다.
import * as THREE from 'three';
import { CHAR_LIST } from '../sim/chars';
import type { CharId } from '../sim/types';
import { FighterModel } from './fighterModel';
import { applyPose, POSES } from './kim/kimRig';
import { KimModel, kimReady } from './kim/kimModel';
import { StatueModel, statueReady } from './statue/statueModel';

const cache = new Map<CharId, string>();
const BG: Record<CharId, string> = {
  seo: '#173a6b', volkov: '#1f3345', rex: '#4a3608', kang: '#4a0f12',
  thatcher: '#1d2f5c', xi: '#5a0f0f', mbs: '#0f4a2c', macron: '#24306b',
};

export function portraits(): Map<CharId, string> {
  if (cache.size) return cache;
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
    r.setSize(size, size, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.8));
    const d = new THREE.DirectionalLight(0xffffff, 1.4);
    d.position.set(2, 3, 4);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    for (const def of CHAR_LIST) {
      scene.background = new THREE.Color(BG[def.id]);
      if ((def.id === 'kang' || def.id === 'xi') && kimReady(def.id)) {
        // 리깅한 김정은 모델: 팔을 내린 차렷 자세로
        const k = new KimModel(def);
        applyPose(k.rig, { ...POSES.guard, root: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], drop: 0, fist: 0.3, L_upper: [0.18, -1, 0.05], L_fore: [0.08, -1, 0.12], R_upper: [0.18, -1, 0.05], R_fore: [0.08, -1, 0.12] });
        k.root.rotation.y = -0.35;
        scene.add(k.root);
        k.root.updateMatrixWorld(true);
        const hp = new THREE.Vector3();
        k.rig.bones.head.getWorldPosition(hp);
        cam.position.set(0.5, hp.y + 0.05, 1.95);
        cam.lookAt(0, hp.y - 0.12, 0);
        r.render(scene, cam);
        cache.set(def.id, canvas.toDataURL('image/png'));
        scene.remove(k.root);
        k.dispose();
        continue;
      }
      if (statueReady(def.id)) {
        // 리깅한 푸틴·트럼프 조각상: 원래 차렷 자세로
        const k = new StatueModel(def);
        k.restPose();
        k.root.rotation.y = -0.35;
        scene.add(k.root);
        k.root.updateMatrixWorld(true);
        const hp = new THREE.Vector3();
        k.rig.bones.head.getWorldPosition(hp);
        cam.position.set(0.5, hp.y + 0.1, 1.95);
        cam.lookAt(0, hp.y + 0.02, 0);
        r.render(scene, cam);
        cache.set(def.id, canvas.toDataURL('image/png'));
        scene.remove(k.root);
        k.dispose();
        continue;
      }
      const m = new FighterModel(def);
      // 정면, 가드 자세 대신 차렷 + 살짝 비틀기
      m.root.rotation.y = -0.35;
      for (const [n, g] of Object.entries(m.joints)) {
        if (n === 'lSh' || n === 'rSh') g.rotation.set(-0.2, 0, n === 'lSh' ? 0.25 : -0.25);
      }
      scene.add(m.root);
      m.root.updateMatrixWorld(true);
      // 머리 높이 근사
      const head = new THREE.Vector3(0, 1.75 * def.look.height + 0.05, 0);
      cam.position.set(0.55, head.y + 0.05, 2.3);
      cam.lookAt(0, head.y - 0.2, 0);
      r.render(scene, cam);
      cache.set(def.id, canvas.toDataURL('image/png'));
      scene.remove(m.root);
      m.dispose();
    }
    r.dispose();
    r.forceContextLoss();
  } catch {
    for (const def of CHAR_LIST) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = BG[def.id];
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#fff';
      g.font = 'bold 40px sans-serif';
      g.textAlign = 'center';
      g.fillText(def.name[0], 64, 78);
      cache.set(def.id, c.toDataURL());
    }
  }
  return cache;
}

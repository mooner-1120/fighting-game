import type * as THREE from 'three';

export type PoseValue = number | number[];
export type KimPose = Record<string, PoseValue | undefined>;

export interface KimRig {
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  list: THREE.Bone[];
}

export interface KimPart {
  name: string;
  cat: string;
  p: number[];
  i: number[];
}

export const J: Record<string, [number, number, number]>;
export const POSES: Record<string, KimPose>;
export const MOVES: Record<string, [number, string | KimPose, string?][]>;
export function buildRig(parts: KimPart[]): KimRig;
export function applyPose(rig: KimRig, pose: KimPose): void;
export function sampleMove(keys: [number, string | KimPose, string?][], t: number): KimPose;
export function bakeClips(rig: KimRig, fps?: number): THREE.AnimationClip[];

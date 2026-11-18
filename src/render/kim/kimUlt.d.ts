import type * as THREE from 'three';
import type { KimRig } from './kimRig';

export interface UltProps {
  world: THREE.Group;
  button: THREE.Group;
  top: THREE.Mesh;
  tail: THREE.Group;
  flame: THREE.Mesh;
  boom: THREE.Mesh;
  ring: THREE.Mesh;
  crater: THREE.Mesh;
}

export const ULT: string;
export function propState(t: number): Record<string, number>;
export function buildProps(rig: KimRig): UltProps;
export function updateProps(props: UltProps, t: number, fail?: boolean): void;
export function ultCamera(t: number, rootY: number): { pos: THREE.Vector3; target: THREE.Vector3 };
export function propTracks(times: number[]): THREE.KeyframeTrack[];

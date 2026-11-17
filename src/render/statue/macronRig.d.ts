import type { KimPart, KimPose, KimRig } from '../kim/kimRig';

export const J: Record<string, [number, number, number]>;
export const POSES: Record<string, KimPose>;
export const MOVES: Record<string, [number, string | KimPose, string?][]>;
export function buildRig(parts: KimPart[]): KimRig;
export function applyPose(rig: KimRig, pose: KimPose): void;
export function sampleMove(keys: [number, string | KimPose, string?][], t: number): KimPose;
export function setHeadTexture(url: string): void;
export function preloadHeadTexture(): Promise<void>;

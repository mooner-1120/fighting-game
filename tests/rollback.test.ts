declare const process: { exit(code: number): void };
import { RollbackSession, type NetPacket } from '../src/game/rollback';
import { checksum } from '../src/sim/fixed';
import { createState, step } from '../src/sim/sim';
import type { MatchConfig } from '../src/sim/types';

// 두 피어를 지연·패킷 손실이 있는 가상 네트워크로 연결해 롤백 결과가 일치하는지 확인
console.log('롤백 넷코드 테스트');
const cfg: MatchConfig = { chars: ['volkov', 'kang'], stage: 1, rounds: 3, timer: 60, spokesman: [false, true], seed: 42 };
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 8 & 0xffffff) / (1 << 24);

const peers = [new RollbackSession(createState(cfg), 0, 2), new RollbackSession(createState(cfg), 1, 2)];
const queue: { at: number; to: number; p: NetPacket }[] = [];
let now = 0;
peers.forEach((s, i) => {
  s.send = (p) => {
    if (rnd() < 0.15) return; // 15% 손실
    queue.push({ at: now + 1 + Math.floor(rnd() * 5), to: 1 - i, p: JSON.parse(JSON.stringify(p)) });
  };
});
const held = [0, 0];
const T = 5000;
for (now = 0; now < T; now++) {
  for (let i = 0; i < 2; i++) {
    if (rnd() < 0.12) held[i] = Math.floor(rnd() * 256);
    peers[i].tick(held[i]);
  }
  for (let k = queue.length - 1; k >= 0; k--) {
    if (queue[k].at <= now) {
      peers[queue[k].to].receive(queue[k].p);
      queue.splice(k, 1);
    }
  }
}
for (let n = 0; n < 200; n++) {
  for (const q of queue.splice(0)) peers[q.to].receive(q.p);
  for (let i = 0; i < 2; i++) peers[i].tick(held[i]);
}
const a = peers[0].confirmedInputs(0);
const b = peers[1].confirmedInputs(0);
const n = Math.min(a.p0.length, b.p0.length);
const ref = createState(cfg);
for (let f = 0; f < n; f++) step(ref, [a.p0[f], a.p1[f]]);
const ref2 = createState(cfg);
for (let f = 0; f < n; f++) step(ref2, [b.p0[f], b.p1[f]]);
let fail = 0;
const same = checksum(ref) === checksum(ref2);
console.log(same ? '  ✓' : '  ✗', `두 피어 확정 입력 일치 (${n}F)`);
if (!same) fail++;
const desync = peers.some((p) => p.desynced);
console.log(desync ? '  ✗ 체크섬 불일치 감지됨' : '  ✓ 체크섬 동기 유지');
if (desync) fail++;
console.log(`  · 롤백 ${peers[0].rollbacks}/${peers[1].rollbacks}회, 대기 ${peers[0].stalls}/${peers[1].stalls}틱, 진행 ${peers[0].frame}/${peers[1].frame}F`);
if (peers[0].frame < T * 0.8) {
  console.log('  ✗ 진행이 너무 느림');
  fail++;
}
if (fail) process.exit(1);
console.log('롤백 테스트 통과');

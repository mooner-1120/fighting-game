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

// ---- 입력 지연 설정이 서로 다르고, 중간에 한쪽 상태가 깨져도 복구되는지
{
  let sd = 4242;
  const r = () => ((sd = (Math.imul(sd, 1103515245) + 12345) | 0) >>> 8 & 0xffffff) / (1 << 24);
  const ps = [new RollbackSession(createState(cfg), 0, 2), new RollbackSession(createState(cfg), 1, 4)];
  const qq: { at: number; to: number; p: unknown }[] = [];
  let t = 0;
  ps.forEach((s, i) => (s.send = (p) => { if (r() < 0.1) return; qq.push({ at: t + 1 + Math.floor(r() * 6), to: 1 - i, p: JSON.parse(JSON.stringify(p)) }); }));
  const hd = [0, 0];
  for (t = 0; t < 4000; t++) {
    if (t === 1500) {
      // 강제로 어긋나게: 현재 상태와 저장된 스냅샷 모두 (롤백으로 지워지지 않는 진짜 불일치)
      const p1 = ps[1] as unknown as { state: { f: { hp: number }[] }; states: ({ f: { hp: number }[] } | null)[] };
      p1.state.f[0].hp -= 300;
      for (const st of p1.states) if (st) st.f[0].hp -= 300;
    }
    for (let i = 0; i < 2; i++) {
      if (r() < 0.12) hd[i] = Math.floor(r() * 256);
      ps[i].tick(hd[i]);
    }
    for (let k = qq.length - 1; k >= 0; k--) if (qq[k].at <= t) {
      const m = qq[k].p as { t: string };
      if (m.t === 'sync') ps[qq[k].to].receiveSync(m as never); else ps[qq[k].to].receive(m as never);
      qq.splice(k, 1);
    }
  }
  for (let n = 0; n < 300; n++) {
    for (const x of qq.splice(0)) { const m = x.p as { t: string }; if (m.t === 'sync') ps[x.to].receiveSync(m as never); else ps[x.to].receive(m as never); }
    for (let i = 0; i < 2; i++) ps[i].tick(hd[i]);
  }
  const f0 = ps[0].frame, f1 = ps[1].frame;
  const same = f0 === f1 ? checksum(ps[0].state) === checksum(ps[1].state) : null;
  const ok2 = ps[1].resyncs > 0 && !ps[0].desynced && !ps[1].desynced && same !== false;
  console.log(ok2 ? '  ✓' : '  ✗', `입력 지연 2F/4F 혼합 + 강제 어긋남 복구 (복구 ${ps[1].resyncs}회, 프레임 ${f0}/${f1}, 최종 상태 ${same === null ? '프레임 다름' : same ? '일치' : '불일치'})`);
  if (!ok2) fail++;
}
if (fail) process.exit(1);
console.log('롤백 테스트 통과');

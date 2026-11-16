declare const process: { exit(code: number): void };
import { CHARS } from '../src/sim/chars';
import { checksum } from '../src/sim/fixed';
import { cloneState, createState, step } from '../src/sim/sim';
import { BTN_LK, BTN_LP, BTN_RK, BTN_RP, IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP, type CharId, type GameState } from '../src/sim/types';

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else {
    failed++;
    console.log('  ✗ ' + msg);
  }
}

function cfg(a: CharId, b: CharId, seed = 7, noGuard = true) {
  return { noGuard: [false, noGuard] as [boolean, boolean], chars: [a, b] as [CharId, CharId], stage: 0, rounds: 2, timer: 60, spokesman: [false, false] as [boolean, boolean], seed };
}

function rngInputs(seed: number, n: number): [number, number][] {
  let x = seed;
  const out: [number, number][] = [];
  let cur: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < 2; p++) {
      x = (Math.imul(x, 1103515245) + 12345) | 0;
      if (((x >>> 8) & 7) === 0) cur[p] = (x >>> 12) & 255;
    }
    out.push([cur[0], cur[1]]);
  }
  return out;
}

function fight(s: GameState) {
  while (s.phase !== 'fight') step(s, [0, 0]);
}

/** P1(오른쪽 보는 왼쪽 캐릭터) 입력 시퀀스를 프레임 단위로 실행 */
function run(s: GameState, seq: [number, number][], frames = 1) {
  for (const inp of seq) for (let i = 0; i < frames; i++) step(s, inp);
}

function press(btn: number, hold = 2): [number, number][] {
  return [...Array(hold).fill([btn, 0]), [0, 0]];
}
function idle(n: number): [number, number][] {
  return Array(n).fill([0, 0]);
}

console.log('결정론 테스트');
{
  const ids = Object.keys(CHARS) as CharId[];
  for (const a of ids) {
    for (const b of ids) {
      const inputs = rngInputs(a.length * 31 + b.length, 6000);
      const s1 = createState(cfg(a, b));
      const s2 = createState(cfg(a, b));
      for (const i of inputs) step(s1, i);
      for (const i of inputs) step(s2, i);
      const same = checksum(s1) === checksum(s2);
      if (!same) ok(false, `${a} vs ${b} 결정론`);
    }
  }
  ok(true, '16개 대진 랜덤 입력 6000F 결정론 일치');

  // 복제 후 이어서 진행해도 동일
  const inputs = rngInputs(99, 3000);
  const s = createState(cfg('kang', 'rex'));
  let snap: GameState | null = null;
  inputs.forEach((inp, i) => {
    if (i === 1500) snap = cloneState(s);
    step(s, inp);
  });
  const r = snap as unknown as GameState;
  for (let i = 1500; i < 3000; i++) step(r, inputs[i]);
  ok(checksum(r) === checksum(s), '스냅샷 복원 후 재시뮬레이션 일치 (롤백 전제)');
}

console.log('기술 테스트');
{
  const s = createState(cfg('seo', 'volkov'));
  fight(s);
  s.f[0].x = -400;
  s.f[1].x = 400;
  const hp = s.f[1].hp;
  run(s, press(BTN_LP));
  run(s, idle(12));
  ok(s.f[1].hp < hp, `잽 히트 (${hp} → ${s.f[1].hp})`);
}
{
  const s = createState(cfg('seo', 'volkov', 7, false));
  fight(s);
  s.f[0].x = -400;
  s.f[1].x = 400;
  // 상대가 가드 (뒤 = 오른쪽 캐릭터에게 오른쪽 입력)
  const hp = s.f[1].hp;
  for (let i = 0; i < 20; i++) step(s, [i < 2 ? BTN_LP : 0, IN_RIGHT]);
  ok(s.f[1].hp === hp, '서서 가드로 상단 막기');
}
{
  const s = createState(cfg('seo', 'volkov'));
  fight(s);
  s.f[0].x = -400;
  s.f[1].x = 400;
  const hp = s.f[1].hp;
  for (let i = 0; i < 20; i++) step(s, [i < 2 ? BTN_LP : 0, IN_DOWN]);
  ok(s.f[1].hp === hp, '앉아서 상단 피하기');
}

type Step = [number, number] | 'free';
function comboTest(char: CharId, _name: string, script: Step[]) {
  const s = createState(cfg(char, 'seo'));
  fight(s);
  s.f[0].x = -380;
  s.f[1].x = 380;
  let best = 0;
  let moves: string[] = [];
  const track = () => {
    if (s.f[1].combo > best) {
      best = s.f[1].combo;
      moves = [...s.f[1].comboMoves];
    }
  };
  for (const inp of script) {
    if (inp === 'free') {
      for (let i = 0; i < 120 && s.f[0].st !== 'idle'; i++) {
        step(s, [0, 0]);
        track();
      }
      continue;
    }
    step(s, inp);
    track();
  }
  return { best, moves };
}

const DF = IN_DOWN | IN_RIGHT;
const B = IN_LEFT;
function seq(...parts: Step[][]): Step[] {
  return parts.flat();
}
function hold(inp: number, n: number): [number, number][] {
  return Array(n).fill([inp, 0]);
}
const QCF = (btn: number) => [[IN_DOWN, 0], [IN_DOWN, 0], [DF, 0], [DF, 0], [IN_RIGHT, 0], [IN_RIGHT | btn, 0], [IN_RIGHT | btn, 0], [0, 0]] as [number, number][];

{
  const launcher = seq(hold(DF | BTN_RP, 2), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60));
  for (const c of ['seo', 'volkov', 'rex', 'kang'] as CharId[]) {
    const r = comboTest(c, '띄우기', launcher);
    ok(r.best >= 3, `${c}: 어퍼컷 → 원투 공중 콤보 (${r.moves.join(' > ')})`);
  }
  const r2 = comboTest('volkov', '해머', seq(hold(B | BTN_LP, 2), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60)));
  ok(r2.best >= 3, `volkov: 볼가 해머 → 원투 (${r2.moves.join(' > ')})`);
  const r3 = comboTest('rex', '골프', seq(QCF(BTN_RP), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60)));
  ok(r3.best >= 3, `rex: 골프채 → 원투 (${r3.moves.join(' > ')})`);
  const r4 = comboTest('seo', '서류', seq(QCF(BTN_RP), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60)));
  ok(r4.best >= 3, `seo: 서류 → 원투 (${r4.moves.join(' > ')})`);
  const r5 = comboTest('kang', '니킥', seq(hold(IN_UP | IN_RIGHT | BTN_RK, 2), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60)));
  ok(r5.best >= 3, `kang: 니킥 → 원투 (${r5.moves.join(' > ')})`);
  const r6 = comboTest('seo', '러시', seq(QCF(BTN_LP), idle(70)));
  ok(r6.best >= 3, `seo: 시장 방문 러시 3연타 (${r6.moves.join(' > ')})`);
}
{
  const s = createState(cfg('volkov', 'seo'));
  fight(s);
  s.f[0].x = -350;
  s.f[1].x = 350;
  const hp = s.f[1].hp;
  run(s, [[BTN_LP | BTN_LK, 0], [BTN_LP | BTN_LK, 0], ...idle(80)]);
  ok(s.f[1].hp < hp && s.f[0].res[0] === 1, `잡기 성공 + 오라 1스택 (${hp}→${s.f[1].hp})`);
  const s2 = createState(cfg('volkov', 'seo'));
  fight(s2);
  s2.f[0].x = -350;
  s2.f[1].x = 350;
  const hp2 = s2.f[1].hp;
  for (let i = 0; i < 80; i++) step(s2, [i < 2 ? BTN_LP | BTN_LK : 0, i === 16 ? BTN_LP : 0]);
  ok(s2.f[1].hp === hp2, '잡기 풀기 (LP)');
}
{
  for (const c of ['seo', 'volkov', 'rex', 'kang'] as CharId[]) {
    const s = createState(cfg(c, 'seo', 3));
    fight(s);
    s.f[0].x = -500;
    s.f[1].x = 500;
    s.f[0].gauge = 3000;
    const hp = s.f[1].hp;
    let sawCine = false;
    for (let i = 0; i < 400; i++) {
      step(s, [i < 2 ? BTN_LP | BTN_RP : 0, 0]);
      if (s.cine) sawCine = true;
    }
    ok(sawCine && (s.f[1].hp < hp || s.f[0].hp < s.f[0].maxHp), `${c}: 궁극기 컷신 + 피해 (${hp}→${s.f[1].hp})`);
  }
}
{
  // 횡이동으로 직선기 회피
  const s = createState(cfg('seo', 'seo'));
  fight(s);
  s.f[0].x = -450;
  s.f[1].x = 450;
  const hp = s.f[1].hp;
  for (let i = 0; i < 40; i++) step(s, [i < 2 ? DF | BTN_RP : 0, i < 2 ? IN_UP : 0]);
  ok(s.f[1].hp === hp, '횡이동으로 어퍼컷 회피');
}
{
  // 라운드 진행 → 매치 종료
  const s = createState(cfg('seo', 'seo'));
  let ended = false;
  for (let i = 0; i < 60 * 60 * 6 && !ended; i++) {
    if (s.phase === 'fight') {
      s.f[1].hp = 0;
    }
    step(s, [0, 0]);
    if (s.phase === 'matchEnd') ended = true;
  }
  ok(ended && s.winner === 0 && s.wins[0] === 2, `2선승 매치 종료 (승자 P${s.winner + 1})`);
}

{
  // 가드 방식: 뒤 누르기
  const g = (guardBack: boolean, p2: number, atk: number) => {
    const s = createState({ ...cfg('seo', 'volkov', 7, false), guardBack });
    fight(s);
    s.f[0].x = -400;
    s.f[1].x = 400;
    const hp = s.f[1].hp;
    for (let i = 0; i < 30; i++) step(s, [i < 2 ? atk : 0, p2]);
    return s.f[1].hp < hp;
  };
  ok(!g(false, 0, BTN_LP), '자동 가드: 가만히 있으면 상단 막음');
  ok(g(true, 0, BTN_LP), '뒤 누르기: 가만히 있으면 맞음');
  ok(!g(true, IN_RIGHT, BTN_LP), '뒤 누르기: 뒤를 누르면 상단 막음');
  ok(g(true, IN_DOWN, IN_DOWN | BTN_LK), '뒤 누르기: 그냥 앉으면 하단 맞음');
  ok(!g(true, IN_DOWN | IN_RIGHT, IN_DOWN | BTN_LK), '뒤 누르기: ↙ 앉아 가드로 하단 막음');
}
void BTN_RK;
if (failed) {
  console.log(`\n실패 ${failed}개`);
  process.exit(1);
}
console.log('\n모든 테스트 통과');

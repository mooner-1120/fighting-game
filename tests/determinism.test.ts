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
  ok(true, `${ids.length * ids.length}개 대진 랜덤 입력 6000F 결정론 일치`);

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

const ALL: CharId[] = ['seo', 'volkov', 'rex', 'kang', 'thatcher', 'xi', 'mbs', 'macron'];
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
  for (const c of ALL) {
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
  for (const c of ALL) {
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

console.log('새 캐릭터 테스트');
{
  // 캐릭터별 대표 콤보
  const t1 = comboTest('thatcher', '질의', seq(hold(B | BTN_LP, 2), ['free'], press(BTN_LP), idle(6), press(BTN_RP), idle(60)));
  ok(t1.best >= 3, `thatcher: 의회 질의 → 원투 (${t1.moves.join(' > ')})`);
  const x1 = comboTest('xi', '드론', seq(QCF(BTN_LP), idle(90)));
  ok(x1.best >= 3, `xi: 드론 편대 3타 (${x1.moves.join(' > ')})`);
  const m1 = comboTest('mbs', '슈퍼카', seq(hold(DF | BTN_RP, 2), ['free'], QCF(BTN_LP), idle(60)));
  ok(m1.best >= 2 && m1.moves.join() === '32,qcf1', `mbs: 어퍼컷 → 슈퍼카 돌진 (${m1.moves.join(' > ')})`);
  const c1 = comboTest('macron', '찌르기', seq(QCF(BTN_LP), idle(4), press(BTN_LP), idle(10), press(BTN_LP), idle(60)));
  ok(c1.best >= 3 && c1.moves.join() === 'qcf1,qcf1b,qcf1c', `macron: 레이피어 3단 찌르기 (${c1.moves.join(' > ')})`);
}
{
  // 대처 EX 3연타 (게이지 있음)
  const s = createState(cfg('thatcher', 'seo'));
  fight(s);
  s.f[0].x = -500;
  s.f[1].x = 500;
  s.f[0].gauge = 1000;
  let best = 0;
  for (let i = 0; i < 80; i++) {
    step(s, [i < 2 ? BTN_LK | BTN_RK : 0, 0]);
    best = Math.max(best, s.f[1].combo);
  }
  ok(best >= 3, `thatcher: 장우산 회전 EX 3타 (${best}히트)`);
}
{
  const s = createState(cfg('xi', 'seo'));
  fight(s);
  s.f[0].gauge = 1000;
  let best = 0;
  for (let i = 0; i < 120; i++) {
    step(s, [i < 2 ? BTN_LK | BTN_RK : 0, 0]);
    best = Math.max(best, s.f[1].combo);
  }
  ok(best >= 5, `xi: 드론 일제 출격 EX 5타 (${best}히트)`);
}
{
  // 대처 티타임: 창이 열리면 RP+LK 로 회복, 창 밖에서는 안 나감
  const s = createState(cfg('thatcher', 'seo'));
  fight(s);
  s.f[0].hp = 500;
  run(s, [[BTN_RP | BTN_LK, 0], [BTN_RP | BTN_LK, 0], ...idle(60)]);
  ok(s.f[0].hp === 500, '티타임 창 밖에서는 차를 못 마심');
  s.f[0].res[0] = 1;
  step(s, [0, 0]);
  ok(s.f[0].res[1] > 0, '10초 뒤 티타임 창 열림');
  run(s, [[0, 0], [BTN_RP | BTN_LK, 0], [BTN_RP | BTN_LK, 0]]);
  ok(s.f[0].move === 'tea', 'RP+LK 로 차 마시기 시작');
  run(s, idle(60));
  ok(s.f[0].hp > 500 && s.f[0].res[1] === 0, `티타임 회복 (500 → ${s.f[0].hp})`);
}
{
  // 대처 이층버스: 서 있는 상대 머리 위로 떨어짐
  const s = createState(cfg('thatcher', 'seo'));
  fight(s);
  const hp = s.f[1].hp;
  run(s, [...QCF(BTN_RP), ...idle(80)]);
  ok(s.f[1].hp < hp, `thatcher: 이층버스 낙하 명중 (${hp} → ${s.f[1].hp})`);
}
{
  // 시진핑 방벽이 트럼프 SNS 폭격을 막는다
  const s = createState(cfg('xi', 'rex'));
  fight(s);
  run(s, [...QCF(BTN_RP), ...idle(20)]);
  ok(s.projs.some((p) => p.kind === 'firewall'), 'xi: 연산 방벽 설치');
  const hp = s.f[0].hp;
  const P2QCF: [number, number][] = [[0, IN_DOWN], [0, IN_DOWN], [0, IN_DOWN | IN_LEFT], [0, IN_DOWN | IN_LEFT], [0, IN_LEFT], [0, IN_LEFT | BTN_LP], [0, IN_LEFT | BTN_LP], [0, 0]];
  let tweet = false;
  for (const inp of [...P2QCF, ...idle(90)]) {
    step(s, inp);
    if (s.projs.some((p) => p.kind === 'tweet')) tweet = true;
  }
  ok(tweet && s.f[0].hp === hp, 'xi: 방벽이 상대 투사체(SNS 폭격) 차단');
}
{
  // 시진핑 장기 오프라인: 잠적 중 피격 무시 + 상대 뒤로 이동
  const s = createState(cfg('xi', 'seo', 7, false));
  fight(s);
  s.f[0].x = -500;
  s.f[1].x = 500;
  const hp = s.f[0].hp;
  for (let i = 0; i < 70; i++) {
    step(s, [i < 2 ? B | BTN_LP : 0, i >= 6 && i < 8 ? BTN_LP : 0]);
    if (i === 10) ok(s.f[0].buffs.hidden > 0, 'xi: 잠적 상태 (buffs.hidden)');
  }
  ok(s.f[0].hp === hp && s.f[0].x > s.f[1].x, `xi: 잠적 중 잽 무시 + 상대 뒤로 등장 (x ${s.f[0].x} > ${s.f[1].x})`);
}
{
  // 시진핑 장기 오프라인 뒤 등 공격: 상대는 잠깐 돌아서지도, 막지도 못한다 (자동 가드여도 맞음)
  const s = createState(cfg('xi', 'seo', 7, false));
  fight(s);
  s.f[0].x = -500;
  s.f[1].x = 500;
  let back = false;
  for (let i = 0; i < 60; i++) {
    step(s, [i < 2 ? B | BTN_LP : 0, 0]);
    if (s.f[1].buffs.backTurn > 0) back = true;
  }
  ok(back && s.f[1].fx * (s.f[0].x - s.f[1].x) < 0, 'xi: 등장 직후 상대 등 돌림 (backTurn, 시진핑 쪽을 등지고 있음)');
  const hp1 = s.f[1].hp;
  for (let i = 0; i < 30; i++) step(s, [i < 2 ? BTN_LP : 0, 0]);
  ok(s.f[1].hp < hp1 && s.f[1].buffs.backTurn === 0, `xi: 등 공격 잽이 가드되지 않고 맞음 (${hp1} → ${s.f[1].hp}), 맞으면 등 돌림 해제`);
}
{
  // 벽 앞: 시진핑 방벽이 상대를 경기장 밖으로 밀지 않음, 벽을 등진 상대에게 잠적하면 옆으로 나오고 등 공격 이득 없음
  const lim = 5200 - 260;
  const s = createState(cfg('xi', 'volkov', 7, false));
  fight(s);
  s.f[0].x = 3600;
  s.f[1].x = 4940;
  s.f[0].z = s.f[1].z = 0;
  run(s, [...QCF(BTN_RP), ...idle(40)]);
  ok(s.projs.some((p) => p.kind === 'firewall') && Math.abs(s.f[1].x) <= lim, `방벽에 밀려도 경기장 안 (x ${s.f[1].x})`);
  const s2 = createState(cfg('xi', 'volkov', 7, false));
  fight(s2);
  s2.f[0].x = 4040;
  s2.f[1].x = 4940;
  s2.f[0].z = s2.f[1].z = 0;
  let back = 0;
  for (let i = 0; i < 60; i++) {
    step(s2, [i < 2 ? B | BTN_LP : 0, 0]);
    back = Math.max(back, s2.f[1].buffs.backTurn);
  }
  ok(back === 0 && Math.abs(s2.f[0].x) <= lim && Math.abs(s2.f[0].z) <= lim, `벽을 등진 상대: 옆으로 등장, 등 돌림 없음 (시진핑 ${s2.f[0].x},${s2.f[0].z})`);
}
{
  // 빈 살만 유가: 오르내리며 속도·공격력 변화
  const s = createState(cfg('mbs', 'seo'));
  fight(s);
  let lo = 100;
  let hi = 0;
  for (let i = 0; i < 600; i++) {
    step(s, [0, 0]);
    lo = Math.min(lo, s.f[0].res[0]);
    hi = Math.max(hi, s.f[0].res[0]);
  }
  ok(lo === 0 && hi === 100, `mbs: 유가 0~100 주기 변동 (${lo}~${hi})`);
  // 모래폭풍 대시로 상대 뒤로
  const s2 = createState(cfg('mbs', 'seo'));
  fight(s2);
  s2.f[0].x = -600;
  s2.f[1].x = 600;
  run(s2, [...hold(B | BTN_LP, 2), ...idle(40)]);
  ok(s2.f[0].x > s2.f[1].x - 200, `mbs: 모래폭풍 대시로 돌아가기 (x ${s2.f[0].x}, 상대 ${s2.f[1].x})`);
}
{
  // 빈 살만 궁극기: 높이 띄운 뒤 추가타
  const s = createState(cfg('mbs', 'seo', 3));
  fight(s);
  s.f[0].x = -500;
  s.f[1].x = 500;
  s.f[0].gauge = 3000;
  run(s, [[BTN_LP | BTN_RP, 0], [BTN_LP | BTN_RP, 0]]);
  for (let i = 0; i < 400 && (s.cine || s.f[0].st !== 'idle'); i++) step(s, [0, 0]);
  const air = s.f[1].st === 'air' && s.f[1].vy > 60;
  let best = 0;
  for (const inp of [...idle(8), ...press(BTN_LP), ...idle(6), ...press(BTN_RP), ...idle(60)]) {
    step(s, inp);
    best = Math.max(best, s.f[1].combo);
  }
  ok(air && best >= 3, `mbs: 유가 폭등 띄우기 → 추가타 (${s.f[1].comboMoves.join(' > ') || best + '히트'})`);
}
{
  // 마크롱 저스트 가드
  const jg = (pressAt: number) => {
    const s = createState(cfg('seo', 'macron', 7, false));
    fight(s);
    s.f[0].x = -400;
    s.f[1].x = 400;
    for (let i = 0; i < 30; i++) step(s, [i < 2 ? BTN_LP : 0, i >= pressAt ? IN_RIGHT : 0]);
    return s.f[1].res[0];
  };
  ok(jg(7) === 20, `macron: 저스트 가드로 우아함 +20 (${jg(7)})`);
  ok(jg(0) === 0, 'macron: 미리 뒤를 누르고 있으면 저스트 가드 아님');
}
{
  // 궁극기 부가 효과
  const ult = (c: CharId) => {
    const s = createState(cfg(c, 'seo', 3));
    fight(s);
    s.f[0].x = -500;
    s.f[1].x = 500;
    s.f[0].gauge = 3000;
    let maxV = 0;
    for (let i = 0; i < 300 && (i < 5 || s.cine || s.f[0].st !== 'idle'); i++) {
      step(s, [i < 2 ? BTN_LP | BTN_RP : 0, 0]);
      if (s.cine) maxV = Math.max(maxV, s.cine.v);
    }
    return { s, maxV };
  };
  const th = ult('thatcher');
  ok(th.s.f[1].buffs.slow > 0 && th.maxV > 0, `thatcher: 해협 봉쇄 둔화 + 물 높이 ${th.maxV}`);
  const xi = ult('xi');
  ok(xi.s.f[1].buffs.cage > 0, 'xi: 디지털 만리방벽 가두기');
  // 갇힌 상대는 멀리 못 간다
  const cx = xi.s.f[1].buffs.cageX;
  for (let i = 0; i < 150; i++) step(xi.s, [0, i % 20 < 2 ? 0 : IN_RIGHT]);
  ok(Math.abs(xi.s.f[1].x - cx) <= 1600, `xi: 갇힌 상대 이동 제한 (${xi.s.f[1].x - cx}mm)`);
  const mc = ult('macron');
  ok(mc.maxV === 12, `macron: 총파업 찌르기 ${mc.maxV}회`);
}
void BTN_RK;
if (failed) {
  console.log(`\n실패 ${failed}개`);
  process.exit(1);
}
console.log('\n모든 테스트 통과');

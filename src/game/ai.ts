// 간단한 CPU 상대 (로컬 전용이라 결정론이 필요 없다)
import { onLeft } from '../sim/sim';
import { BTN_LK, BTN_LP, BTN_RK, BTN_RP, IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP, type GameState } from '../sim/types';

export class CpuBrain {
  private queue: number[] = [];
  private wait = 0;
  constructor(public idx: number, public level: 1 | 2 | 3 = 2) {}

  private dirs(s: GameState) {
    const left = onLeft(s, this.idx);
    return { F: left ? IN_RIGHT : IN_LEFT, B: left ? IN_LEFT : IN_RIGHT };
  }

  private push(...frames: number[]) {
    this.queue.push(...frames);
  }

  read(s: GameState): number {
    if (s.phase !== 'fight' || s.cine) {
      this.queue = [];
      return 0;
    }
    const me = s.f[this.idx];
    // 맞힌 기술을 궁극기로 캔슬 (난이도가 높을수록 자주)
    if (me.st === 'atk' && me.connected === 1 && me.gauge >= 3000 && !me.ultUsed && Math.random() < (this.level === 1 ? 0.03 : this.level === 2 ? 0.08 : 0.2)) {
      this.queue = [];
      return BTN_LP | BTN_RP;
    }
    if (this.queue.length) return this.queue.shift()!;
    const op = s.f[1 - this.idx];
    const { F, B } = this.dirs(s);
    const d = Math.hypot(op.x - me.x, op.z - me.z);
    const r = Math.random();
    const react = this.level === 1 ? 0.25 : this.level === 2 ? 0.55 : 0.8;

    // 상대가 공격 중이면 확률적으로 가드
    if (op.st === 'atk' && d < 1700 && r < react) {
      const low = Math.random() < 0.4;
      this.push(...Array(10).fill(low ? IN_DOWN | B : B));
      return low ? IN_DOWN | B : B;
    }
    if (me.st !== 'idle' && me.st !== 'walkf' && me.st !== 'walkb' && me.st !== 'crouch') return 0;
    if (this.wait > 0) {
      this.wait--;
      return d > 1300 ? F : 0;
    }
    this.wait = this.level === 1 ? 25 : this.level === 2 ? 12 : 6;

    // 공중 콤보
    if (op.st === 'air' && d < 1200) {
      this.push(BTN_LP, BTN_LP, 0, 0, 0, 0, BTN_RP, BTN_RP, 0, 0, 0, 0, 0, 0, BTN_LK, BTN_LK);
      return 0;
    }
    // 궁극기
    if (me.gauge >= 3000 && !me.ultUsed && d < 1500 && r < 0.3) {
      this.push(BTN_LP | BTN_RP, BTN_LP | BTN_RP);
      return 0;
    }
    // 캐릭터 고유 행동
    const qcf = (btn: number) => [IN_DOWN, IN_DOWN, IN_DOWN | F, IN_DOWN | F, F, F | btn, F | btn, 0];
    if (me.char === 'thatcher' && me.res[1] > 0 && d > 1500 && r < 0.6) {
      // 티타임 창이 열렸고 상대가 멀면 차를 마신다
      this.push(IN_DOWN, IN_DOWN | BTN_LP | BTN_RP, IN_DOWN | BTN_LP | BTN_RP, 0);
      return IN_DOWN;
    }
    if (me.char === 'thatcher' && d > 1500 && d < 3500 && r < 0.12) {
      this.push(...qcf(BTN_RP)); // 이층버스
      return 0;
    }
    if (me.char === 'xi' && d > 1800 && r < 0.1 && !s.projs.some((p) => p.owner === this.idx && p.kind === 'firewall')) {
      this.push(...qcf(BTN_RP)); // 방벽
      return 0;
    }
    if (me.char === 'mbs' && d > 1800 && d < 3200 && r < 0.12) {
      this.push(...qcf(BTN_LP)); // 슈퍼카 돌진
      return 0;
    }
    if (me.char === 'macron' && d > 2400 && me.hp * 2 < me.maxHp && r < 0.08) {
      this.push(B | BTN_LP, B | BTN_LP, 0); // 멀리서 건배 회복
      return 0;
    }

    if (d > 2200) {
      if (r < 0.15) {
        this.push(IN_DOWN, IN_DOWN, IN_DOWN | F, IN_DOWN | F, F, F | BTN_LP, F | BTN_LP, 0);
        return 0;
      }
      if (r < 0.35) {
        this.push(F, F, 0, 0, F, F, F, F);
        return 0;
      }
      this.push(...Array(15).fill(F));
      return F;
    }
    if (d > 1250) {
      if (r < 0.4) this.push(...Array(12).fill(F));
      else if (r < 0.55) this.push(IN_DOWN, IN_DOWN, IN_DOWN | F, IN_DOWN | F, F, F | BTN_RP, F | BTN_RP, 0);
      else if (r < 0.7) this.push(F | BTN_RP, F | BTN_RP, 0);
      else this.push(...Array(10).fill(0));
      return 0;
    }
    // 근거리 선택지
    const opts: number[][] = [
      [BTN_LP, BTN_LP, 0, 0, 0, BTN_RP, BTN_RP, 0, 0, 0, BTN_LK, BTN_LK],
      [IN_DOWN | F | BTN_RP, IN_DOWN | F | BTN_RP],
      [IN_DOWN | BTN_LK, IN_DOWN | BTN_LK],
      [IN_DOWN | BTN_RK, IN_DOWN | BTN_RK],
      [IN_DOWN | F | BTN_LP, IN_DOWN | F | BTN_LP],
      [BTN_LP | BTN_LK, BTN_LP | BTN_LK],
      [IN_UP, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, BTN_RP, BTN_RP],
      [B | BTN_RK, B | BTN_RK],
      [F | BTN_RP, F | BTN_RP],
      [...Array(14).fill(B)],
      [B | BTN_LP, B | BTN_LP],
      [IN_DOWN, IN_DOWN, IN_DOWN | F, IN_DOWN | F, F, F | BTN_LP, F | BTN_LP],
    ];
    if (me.gauge >= 1000 && Math.random() < 0.1) opts.push([BTN_LK | BTN_RK, BTN_LK | BTN_RK]);
    // 근거리 고유기: 마크롱 연속 찌르기, 빈 살만 모래폭풍 대시
    if (me.char === 'macron') {
      opts[11] = [...qcf(BTN_LP), 0, 0, 0, 0, BTN_LP, BTN_LP, 0, 0, 0, 0, 0, 0, 0, 0, BTN_LP, BTN_LP];
      opts[10] = [B | BTN_RK, B | BTN_RK]; // 건배(←LP)는 근거리에서 쓰지 않는다
    }
    if (me.char === 'mbs' && Math.random() < 0.3) opts.push([B | BTN_LP, B | BTN_LP]);
    if (me.hp * 4 <= me.maxHp && !me.emergencyUsed) opts.push([BTN_LP | BTN_RK, BTN_LP | BTN_RK]);
    this.push(...opts[Math.floor(Math.random() * opts.length)]);
    return 0;
  }
}

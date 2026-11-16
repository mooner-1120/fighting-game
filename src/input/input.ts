// 키보드 + Gamepad API 입력. 키 설정은 localStorage에 저장한다.
import { BTN_LK, BTN_LP, BTN_RK, BTN_RP, IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP } from '../sim/types';
import { load, save } from '../ui/storage';

export type Action = 'up' | 'down' | 'left' | 'right' | 'lp' | 'rp' | 'lk' | 'rk';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'lp', 'rp', 'lk', 'rk'];
export const ACTION_LABEL: Record<Action, string> = {
  up: '위 (횡이동 안쪽)', down: '아래 (앉기)', left: '왼쪽', right: '오른쪽',
  lp: 'LP 왼손', rp: 'RP 오른손', lk: 'LK 왼발', rk: 'RK 오른발',
};
const BIT: Record<Action, number> = {
  up: IN_UP, down: IN_DOWN, left: IN_LEFT, right: IN_RIGHT, lp: BTN_LP, rp: BTN_RP, lk: BTN_LK, rk: BTN_RK,
};

export type KeyMap = Record<Action, string[]>;
export type Device = 'kb1' | 'kb2' | 'pad0' | 'pad1' | 'pad2' | 'pad3' | 'none';

export const DEFAULT_KEYS: { kb1: KeyMap; kb2: KeyMap } = {
  kb1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    lp: ['KeyU'], rp: ['KeyI'], lk: ['KeyJ'], rk: ['KeyK'],
  },
  kb2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    lp: ['Numpad4', 'BracketLeft'], rp: ['Numpad5', 'BracketRight'], lk: ['Numpad1', 'Semicolon'], rk: ['Numpad2', 'Quote'],
  },
};

class InputManager {
  private down = new Set<string>();
  /** 프레임 사이에 눌렀다 뗀 짧은 탭도 놓치지 않도록 다음 프레임까지 유지 */
  private latched = new Set<string>();
  keys: { kb1: KeyMap; kb2: KeyMap };
  /** 한 PC 1인 플레이일 때 kb1·kb2 둘 다 받기 */
  merged = true;

  constructor() {
    this.keys = load('keys', DEFAULT_KEYS);
    for (const k of ['kb1', 'kb2'] as const) for (const a of ACTIONS) if (!this.keys[k]?.[a]) this.keys[k] = { ...DEFAULT_KEYS[k], ...this.keys[k] };
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.down.add(e.code);
      this.latched.add(e.code);
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.latched.clear();
    });
  }

  private isGameKey(code: string): boolean {
    for (const k of [this.keys.kb1, this.keys.kb2]) for (const a of ACTIONS) if (k[a].includes(code)) return true;
    return code === 'Space';
  }

  saveKeys() {
    save('keys', this.keys);
  }

  resetKeys() {
    this.keys = structuredClone(DEFAULT_KEYS);
    this.saveKeys();
  }

  private kb(map: KeyMap): number {
    let v = 0;
    for (const a of ACTIONS) if (map[a].some((c) => this.down.has(c) || this.latched.has(c))) v |= BIT[a];
    return v;
  }

  private pad(i: number): number {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads[i];
    if (!p) return 0;
    const b = (n: number) => !!p.buttons[n]?.pressed;
    let v = 0;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    if (b(12) || ay < -0.5) v |= IN_UP;
    if (b(13) || ay > 0.5) v |= IN_DOWN;
    if (b(14) || ax < -0.5) v |= IN_LEFT;
    if (b(15) || ax > 0.5) v |= IN_RIGHT;
    // 철권 배치: □=LP △=RP ×=LK ○=RK
    if (b(2)) v |= BTN_LP;
    if (b(3)) v |= BTN_RP;
    if (b(0)) v |= BTN_LK;
    if (b(1)) v |= BTN_RK;
    if (b(5)) v |= BTN_LP | BTN_RP; // R1: 궁극기
    if (b(4)) v |= BTN_LK | BTN_RK; // L1: EX
    if (b(7)) v |= BTN_LP | BTN_LK; // R2: 잡기
    if (b(6)) v |= BTN_LP | BTN_RK; // L2: 비상 담화
    return v;
  }

  read(dev: Device): number {
    switch (dev) {
      case 'kb1':
        return this.kb(this.keys.kb1);
      case 'kb2':
        return this.kb(this.keys.kb2);
      case 'pad0':
        return this.pad(0);
      case 'pad1':
        return this.pad(1);
      case 'pad2':
        return this.pad(2);
      case 'pad3':
        return this.pad(3);
      default:
        return 0;
    }
  }

  /** 1인 모드: 키보드 두 세트 + 첫 패드 모두 */
  readAny(): number {
    return this.kb(this.keys.kb1) | this.kb(this.keys.kb2) | this.pad(0);
  }

  /** 시뮬레이션 한 프레임이 입력을 읽은 뒤 호출 */
  endFrame() {
    this.latched.clear();
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  padCount(): number {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let n = 0;
    for (const p of pads) if (p) n++;
    return n;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

export const input = new InputManager();

export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '방향 ').replace('Numpad', '넘패드 ').replace('BracketLeft', '[').replace('BracketRight', ']').replace('Semicolon', ';').replace('Quote', "'");
}

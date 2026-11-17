// 경기 화면: 고정 60fps 루프 + 렌더 + 이벤트 연출(효과음·앵커 중계·HUD)
import { audio } from '../audio/audio';
import { ANCHOR, say } from '../audio/tts';
import { type Driver, LocalDriver, ReplayDriver, TrainingDriver, type DummyMode } from '../game/drivers';
import { input } from '../input/input';
import { GameView } from '../render/view';
import { CHARS } from '../sim/chars';
import { dirOf } from '../sim/input';
import type { GameEvent, GameState } from '../sim/types';
import { h } from './dom';
import { Hud } from './hud';
import { moveListModal } from './movelist';
import { settings } from './storage';

/** 회복 알림 문구 (캐릭터별) */
const HEAL_NAME: Partial<Record<string, string>> = { seo: '떡볶이 회복', thatcher: '티타임 회복', macron: '건배 회복' };

export type GameMode = 'local' | 'cpu' | 'training' | 'online' | 'spectate' | 'replay';

export interface GameOpts {
  mode: GameMode;
  names: [string, string];
  onExit: () => void;
  onRematch?: () => void;
  onCharSelect?: () => void;
  extra?: HTMLElement; // 관전 리액션 바 등
}

const STEP = 1 / 60;

export class GameScreen {
  el: HTMLElement;
  view: GameView;
  hud: Hud;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private modal: HTMLElement | null = null;
  private ended = false;
  private prevMoves: (string | null)[] = [null, null];
  private clip: ClipRecorder;
  private clipUrl: string | null = null;
  private tpanel: HTMLElement | null = null;
  private lastSetupFrame = -1;
  private ro: ResizeObserver;
  private keyHandler: (e: KeyboardEvent) => void;
  private fpsT = 0;
  private fpsN = 0;
  fps = 60;

  constructor(public driver: Driver, public opts: GameOpts) {
    const gl = h('canvas', { class: 'gl' });
    const ov = h('canvas', { class: 'ov' });
    this.view = new GameView(gl, ov, settings.quality);
    this.hud = new Hud(driver.state, opts.names);
    this.el = h('div', { class: 'game' }, gl, ov, this.hud.el);
    if (opts.extra) this.el.append(opts.extra);
    this.clip = new ClipRecorder(gl, ov);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    driver.onEvents = (ev, s) => this.present(ev, s);
    this.view.setup(driver.state);
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    if (driver instanceof TrainingDriver) this.buildTrainingPanel(driver);
    this.hud.inputsEl.style.display = opts.mode === 'training' || settings.showInputs ? 'block' : 'none';
    audio.ensure();
    const def = CHARS[driver.state.cfg.chars[1]];
    audio.startMusic(def.theme, driver.state.cfg.seed);
    (window as unknown as { __game?: GameScreen }).__game = this;
  }

  start() {
    this.resize();
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.25) dt = 0.25;
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) {
        this.driver.tick();
        input.endFrame();
        this.acc -= STEP;
        n++;
      }
      if (n === 5) this.acc = 0;
      const s = this.driver.state;
      if (s.frame < this.lastSetupFrame) this.view.snapCamera(s);
      this.lastSetupFrame = s.frame;
      this.view.render(s, dt);
      this.clip.frame();
      this.hud.update(s, dt);
      this.updateExtras(s);
      this.fpsN++;
      this.fpsT += dt;
      if (this.fpsT >= 1) {
        this.fps = this.fpsN / this.fpsT;
        this.fpsN = 0;
        this.fpsT = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.view.resize(Math.max(1, r.width), Math.max(1, r.height));
  }

  private updateExtras(s: GameState) {
    // 긴급 브리핑: 상대 기술 이름 표시
    let shown = false;
    for (let i = 0; i < 2; i++) {
      const f = s.f[i];
      const o = s.f[1 - i];
      if (f.buffs.briefing > 0 && o.st === 'atk' && o.move) {
        const m = CHARS[o.char].moves[o.move];
        const p = this.view.headScreen(1 - i);
        if (m && p) {
          this.hud.brief.style.display = 'block';
          this.hud.brief.style.left = p.x + 'px';
          this.hud.brief.style.top = p.y + 'px';
          this.hud.brief.textContent = `예고: ${m.name}`;
          shown = true;
        }
      }
    }
    if (!shown) this.hud.brief.style.display = 'none';
    // 네트워크 상태
    const st = this.driver.status();
    this.hud.net.textContent = st ? `${st} · ${Math.round(this.fps)}fps` : '';
    this.hud.net.style.display = st ? 'block' : 'none';
    // 입력 표시
    if (this.hud.inputsEl.style.display !== 'none') {
      const f = s.f[0];
      const arrows: Record<number, string> = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
      const rows: string[] = [];
      let prev = -1;
      let cnt = 0;
      for (let k = 0; k < f.hist.length && rows.length < 10; k++) {
        const v = f.hist[k];
        if (v === prev) {
          cnt++;
          continue;
        }
        if (prev >= 0) rows.push(fmt(prev, cnt));
        prev = v;
        cnt = 1;
      }
      if (prev >= 0 && rows.length < 10) rows.push(fmt(prev, cnt));
      function fmt(v: number, c: number) {
        const b = [v & 16 ? 'LP' : '', v & 32 ? 'RP' : '', v & 64 ? 'LK' : '', v & 128 ? 'RK' : ''].filter(Boolean).join('+');
        return `${arrows[dirOf(v)]} ${b.padEnd(11)} ${c}`;
      }
      this.hud.inputsEl.textContent = '입력 (앞 기준)\n' + rows.join('\n');
    }
    if (this.tpanel && this.driver instanceof TrainingDriver) {
      this.tpanel.style.visibility = s.cine ? 'hidden' : 'visible';
      this.refreshTraining(this.driver);
    }
  }

  // ---------------------------------------------------------- 이벤트 연출
  private present(ev: GameEvent[], s: GameState) {
    this.view.handleEvents(ev, s);
    for (const e of ev) {
      switch (e.k) {
        case 'hit':
          audio.play(e.heavy ? 'heavy' : 'hit');
          if (e.ch) audio.play('counter');
          break;
        case 'counter':
          this.hud.toast(e.who, '카운터!');
          if (Math.random() < 0.4) say(ANCHOR.counter(), 1);
          break;
        case 'block':
          audio.play('block');
          break;
        case 'throw':
          audio.play('throw');
          break;
        case 'break':
          audio.play('break');
          this.hud.toast(e.who, '잡기 풀기!');
          say(ANCHOR.breakThrow(), 1);
          break;
        case 'boom':
          audio.play('boom');
          break;
        case 'wall':
          if (Math.random() < 0.5) say(ANCHOR.wall(), 1);
          break;
        case 'ko':
          audio.play('bell');
          break;
        case 'round':
          audio.play('gong');
          this.hud.announce(e.n >= s.cfg.rounds * 2 - 1 ? '최종 라운드' : `${e.n} 라운드`, '');
          say(ANCHOR.round(e.n), 0, true);
          break;
        case 'fight':
          this.hud.announce('회담 시작!', 'FIGHT', 0.9);
          say(ANCHOR.fight(), 0, true);
          break;
        case 'roundEnd': {
          if (e.timeout) {
            this.hud.announce('시간 종료', e.winner >= 0 ? `${CHARS[s.f[e.winner].char].name} 판정승` : '무승부', 2.2);
            say(ANCHOR.timeout(), 0, true);
          } else if (e.winner < 0) {
            this.hud.announce('더블 K.O.', '공멸', 2.2);
            say('더블 케이오!', 0, true);
          } else {
            this.hud.announce(e.perfect ? 'PERFECT' : 'K.O.', e.perfect ? '일방적 정상회담' : '회담 결렬', 2.2);
            say(e.perfect ? ANCHOR.perfect() : ANCHOR.ko(), 0, true);
          }
          audio.play('cheer');
          break;
        }
        case 'matchEnd': {
          const def = CHARS[s.f[e.winner].char];
          this.hud.announce(`${def.name} 승리`, this.opts.names[e.winner], 3);
          setTimeout(() => say(def.winLine, 2, true), 1200);
          if (this.opts.mode !== 'online' && this.opts.mode !== 'spectate' && this.opts.mode !== 'training') {
            setTimeout(() => this.showResult(s), 3200);
          }
          this.ended = true;
          break;
        }
        case 'ultStart':
          audio.play('ult');
          this.hud.toast(e.who, '궁극기 발동!');
          break;
        case 'cine': {
          const def = CHARS[s.f[e.who].char];
          say(def.ultLine, 2, true);
          this.clip.start(audio.stream());
          break;
        }
        case 'emergency': {
          const def = CHARS[s.f[e.who].char];
          audio.play('alarm');
          this.hud.toast(e.who, '비상사태 선포! 공격력 +10%');
          say(ANCHOR.emergency(def.name), 1);
          break;
        }
        case 'parry':
          audio.play('parry');
          this.hud.toast(e.who, '현지 지도!');
          say(ANCHOR.parry(), 1);
          break;
        case 'proj':
          audio.play(e.kind === 'bear' ? 'throw' : e.kind === 'barrier' ? 'block' : 'whoosh');
          break;
        case 'heal':
          audio.play('heal');
          this.hud.toast(e.who, `${HEAL_NAME[s.f[e.who].char] ?? '회복'} +${e.amt}`);
          break;
        case 'justGuard':
          audio.play('parry');
          break;
        case 'teaTime':
          audio.play('gauge');
          break;
        case 'special':
          if (e.name.includes('$')) audio.play('money');
          else if (e.name.includes('박수')) audio.play('clap');
          else audio.play('gauge');
          this.hud.toast(e.who, e.name);
          break;
      }
    }
    // 헛치기 소리 + 콤보 멘트
    for (let i = 0; i < 2; i++) {
      const f = s.f[i];
      if (f.st === 'atk' && f.move !== this.prevMoves[i] && f.mf <= 1) audio.play('whoosh');
      this.prevMoves[i] = f.st === 'atk' ? f.move : null;
    }
    // 컷신 끝나면 클립 정리
    if (!s.cine && this.clip.recording) {
      this.clip.stop((url) => {
        this.clipUrl = url;
        this.hud.toast(0, '궁극기 클립 저장 가능 (일시정지 메뉴)');
      });
    }
  }

  // ---------------------------------------------------------- 메뉴
  private onKey(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      if (this.modal) this.closeModal();
      else this.showPause();
    }
    if (this.driver instanceof TrainingDriver) {
      if (e.code === 'Backspace') this.driver.resetPositions();
      if (e.code === 'F2') this.toggleRecord(this.driver);
      if (e.code === 'F3') this.togglePlay(this.driver);
    }
  }

  private setPaused(p: boolean) {
    const d = this.driver;
    if (d instanceof LocalDriver || d instanceof TrainingDriver || d instanceof ReplayDriver) d.paused = p;
  }

  private closeModal() {
    this.modal?.remove();
    this.modal = null;
    this.setPaused(false);
  }

  private openModal(content: HTMLElement) {
    this.modal?.remove();
    this.modal = h('div', { class: 'modal-back' }, content);
    this.el.append(this.modal);
  }

  private showPause() {
    const online = this.opts.mode === 'online' || this.opts.mode === 'spectate';
    if (!online) this.setPaused(true);
    const s = this.driver.state;
    const btns: HTMLElement[] = [
      h('button', { class: 'btn primary', onclick: () => this.closeModal() }, online ? '닫기 (경기는 계속 진행 중)' : '계속하기'),
      h('button', { class: 'btn', onclick: () => this.openModal(moveListModal(s.cfg.chars[online ? 0 : 0], () => this.showPause())) }, '기술표 보기'),
    ];
    if (this.clipUrl) btns.push(h('a', { class: 'btn blue', href: this.clipUrl, download: '궁극기_클립.webm' }, '궁극기 클립 저장 (WebM)'));
    if (this.opts.mode !== 'online' && this.opts.mode !== 'spectate') btns.push(h('button', { class: 'btn', onclick: () => this.saveReplay() }, '리플레이 저장'));
    if (this.driver instanceof ReplayDriver) {
      const d = this.driver;
      btns.push(h('div', { class: 'row' }, ...[0.5, 1, 2, 4].map((sp) => h('button', { class: 'btn sm' + (d.speed === sp ? ' on' : ''), onclick: () => { d.speed = sp; this.showPause(); } }, `x${sp}`)), h('button', { class: 'btn sm', onclick: () => { d.restart(); this.view.setup(d.state); this.closeModal(); } }, '처음부터')));
    }
    if (this.opts.onRematch && !online) btns.push(h('button', { class: 'btn', onclick: () => { this.destroy(); this.opts.onRematch!(); } }, '처음부터 다시'));
    if (this.opts.onCharSelect) btns.push(h('button', { class: 'btn', onclick: () => { this.destroy(); this.opts.onCharSelect!(); } }, '캐릭터 선택'));
    btns.push(h('button', { class: 'btn ghost', onclick: () => { this.destroy(); this.opts.onExit(); } }, online ? (this.opts.mode === 'online' ? '경기 포기하고 나가기' : '관전 그만두기') : '타이틀로'));
    this.openModal(h('div', { class: 'modal' }, h('h2', null, online ? '메뉴' : '일시정지'), h('div', { class: 'col' }, ...btns), h('p', { class: 'muted small' }, 'Esc: 메뉴 열기/닫기')));
  }

  private showResult(s: GameState) {
    if (this.modal) return;
    const w = s.winner;
    const wd = CHARS[s.f[w].char];
    const ld = CHARS[s.f[1 - w].char];
    const btns: HTMLElement[] = [];
    if (this.opts.onRematch) btns.push(h('button', { class: 'btn primary', onclick: () => { this.destroy(); this.opts.onRematch!(); } }, '한 판 더!'));
    if (this.opts.onCharSelect) btns.push(h('button', { class: 'btn', onclick: () => { this.destroy(); this.opts.onCharSelect!(); } }, '캐릭터 선택'));
    btns.push(h('button', { class: 'btn', onclick: () => this.saveReplay() }, '리플레이 저장'));
    if (this.clipUrl) btns.push(h('a', { class: 'btn blue', href: this.clipUrl, download: '궁극기_클립.webm' }, '궁극기 클립 저장'));
    btns.push(h('button', { class: 'btn ghost', onclick: () => { this.destroy(); this.opts.onExit(); } }, '타이틀로'));
    this.openModal(
      h('div', { class: 'modal' },
        h('div', { class: 'breaking' }, '개표 결과'),
        h('p', { class: 'result-win' }, `${wd.name} 승리`),
        h('p', { class: 'muted' }, `${this.opts.names[w]} · ${s.wins[0]} : ${s.wins[1]}`),
        h('p', { class: 'quote' }, `“${wd.winLine}”`),
        h('p', { class: 'muted small' }, `${ld.name}: “${ld.loseLine}”`),
        h('div', { class: 'row' }, ...btns),
      ),
    );
  }

  saveReplay() {
    const data = this.driver.replay(this.opts.names);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `서밋파이터즈_리플레이_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json` });
    a.click();
  }

  /** 온라인: 서버가 경기 종료를 알리면 호출 */
  finish(text: string) {
    if (!this.ended) this.hud.announce('경기 종료', text, 3);
  }

  // ---------------------------------------------------------- 트레이닝 패널
  private buildTrainingPanel(d: TrainingDriver) {
    this.tpanel = h('div', { class: 'tpanel' });
    this.el.append(this.tpanel);
    this.refreshTraining(d, true);
  }

  private trainingSig = '';
  private refreshTraining(d: TrainingDriver, force = false) {
    const s = d.state;
    const def = CHARS[s.f[0].char];
    const r = d.report;
    const sig = JSON.stringify([d.mode, r, d.challenge, [...d.cleared], d.infiniteGauge, d.autoHeal, d.recLength() > 0]);
    if (sig === this.trainingSig && !force) return;
    this.trainingSig = sig;
    const sign = (v: number) => (v > 0 ? `<span class="pos">+${v}</span>` : v < 0 ? `<span class="neg">${v}</span>` : '±0');
    const modes: [DummyMode, string][] = [
      ['stand', '서있기 (가드 X)'], ['guard', '서서 가드'], ['crouchGuard', '앉아 가드'], ['randomGuard', '랜덤 가드'], ['cpu', 'CPU 반격'],
    ];
    const fd = h('div', { class: 'fd' });
    fd.innerHTML = r
      ? `<span>기술</span><span class="v">${r.name}</span><span>발생</span><span class="v">${r.startup}F</span><span>가드 시</span><span class="v">${sign(r.onBlock)}</span><span>히트 시</span><span class="v">${sign(r.onHit)}</span><span>실측 (${r.result === 'hit' ? '히트' : '가드'})</span><span class="v">${r.measured === null ? '-' : sign(r.measured)}</span>`
      : '<span class="muted">기술을 맞혀 보세요</span><span></span>';
    this.tpanel!.replaceChildren(
      h('div', { class: 'row' }, h('b', null, '트레이닝'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => d.resetPositions() }, '위치 초기화 ⌫')),
      h('h4', null, '프레임 데이터'),
      fd,
      h('h4', null, '더미'),
      h('div', { class: 'row', style: 'gap:4px' }, ...modes.map(([m, l]) => h('button', { class: 'btn' + (d.mode === m ? ' on' : ''), onclick: () => d.setMode(m) }, l))),
      h('h4', null, '녹화·재생 (더미 행동)'),
      h('div', { class: 'row', style: 'gap:4px' },
        h('button', { class: 'btn' + (d.mode === 'record' ? ' on' : ''), onclick: () => this.toggleRecord(d) }, d.mode === 'record' ? '■ 녹화 끝 (F2)' : '● 녹화 (F2)'),
        h('button', { class: 'btn' + (d.mode === 'playback' ? ' on' : ''), disabled: d.recLength() === 0, onclick: () => this.togglePlay(d) }, '▶ 재생 (F3)'),
      ),
      h('p', { class: 'muted small', style: 'margin:4px 0' }, '녹화 중에는 내 조작으로 더미를 움직입니다.'),
      h('h4', null, `콤보 챌린지 — ${def.name}`),
      ...def.combos.map((c, i) => h('div', { class: 'ch' + (d.challenge === i ? ' sel' : '') + (d.cleared.has(i) ? ' ok' : ''), onclick: () => (d.challenge = i) }, `${i + 1}. ${c.name}: ${c.inputs}`)),
      h('h4', null, '옵션'),
      h('div', { class: 'row', style: 'gap:4px' },
        h('button', { class: 'btn' + (d.infiniteGauge ? ' on' : ''), onclick: () => (d.infiniteGauge = !d.infiniteGauge) }, '게이지 무한'),
        h('button', { class: 'btn' + (d.autoHeal ? ' on' : ''), onclick: () => (d.autoHeal = !d.autoHeal) }, '체력 회복'),
      ),
    );
  }

  private toggleRecord(d: TrainingDriver) {
    d.setMode(d.mode === 'record' ? 'stand' : 'record');
  }

  private togglePlay(d: TrainingDriver) {
    if (d.recLength() === 0) return;
    d.setMode(d.mode === 'playback' ? 'stand' : 'playback');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyHandler);
    this.ro.disconnect();
    this.view.clear();
    this.view.renderer.dispose();
    this.driver.dispose();
    audio.stopMusic();
    this.el.remove();
  }
}

// ---------------------------------------------------------- 궁극기 클립 (WebM)
class ClipRecorder {
  private comp: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  recording = false;
  private stopping = false;
  constructor(private gl: HTMLCanvasElement, private ov: HTMLCanvasElement) {}

  start(audioStream: MediaStream | null) {
    if (this.recording || !settings.clip || typeof MediaRecorder === 'undefined') return;
    try {
      const w = Math.min(854, this.gl.width);
      const hh = Math.round((w / this.gl.width) * this.gl.height);
      this.comp = document.createElement('canvas');
      this.comp.width = w;
      this.comp.height = hh;
      this.g = this.comp.getContext('2d');
      const stream = this.comp.captureStream(30);
      audioStream?.getAudioTracks().forEach((t) => stream.addTrack(t));
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      this.chunks = [];
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.rec.start(250);
      this.recording = true;
      this.stopping = false;
    } catch {
      this.recording = false;
    }
  }

  frame() {
    if (!this.recording || !this.g || !this.comp) return;
    this.g.drawImage(this.gl, 0, 0, this.comp.width, this.comp.height);
    this.g.drawImage(this.ov, 0, 0, this.comp.width, this.comp.height);
  }

  stop(done: (url: string) => void) {
    if (!this.rec || this.stopping) return;
    this.stopping = true;
    setTimeout(() => {
      const rec = this.rec!;
      rec.onstop = () => {
        this.recording = false;
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        done(URL.createObjectURL(blob));
      };
      rec.stop();
    }, 700);
  }
}

export { input };

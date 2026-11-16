// 온라인 친구 방: 입장 → 캐릭터 선택 → 준비 → 자동 매칭(이긴 사람 남기) / 토너먼트 / 관전
import { audio } from '../audio/audio';
import { say } from '../audio/tts';
import { OnlineDriver, SpectatorDriver } from '../game/drivers';
import { PeerLink } from '../net/peer';
import { ServerConn } from '../net/server';
import { portraits } from '../render/portraits';
import { STAGES } from '../render/stages';
import { CHAR_LIST, CHARS } from '../sim/chars';
import type { CharId, MatchConfig } from '../sim/types';
import { BUILD_ID } from '../build';
import { h, mount, toast } from './dom';
import { GameScreen } from './gameScreen';
import type { Nav } from './menus';
import { load, save, saveSettings, settings } from './storage';

interface RoomPlayer {
  id: number;
  nick: string;
  char: CharId;
  ready: boolean;
  spoke: boolean;
  wins: number;
  title: string | null;
}
interface BracketMatch {
  a: number | null;
  b: number | null;
  w: number | null;
}
interface RoomSnap {
  code: string;
  host: number;
  mode: 'versus' | 'tournament';
  settings: { rounds: number; spokesman: boolean };
  players: RoomPlayer[];
  queue: number[];
  match: { id: number; p: [number, number]; chars: [CharId, CharId]; stage: number } | null;
  bracket: BracketMatch[][] | null;
  countdown: number;
}
interface MatchMsg {
  id: number;
  p: [number, number];
  chars: [CharId, CharId];
  stage: number;
  rounds: number;
  seed: number;
  spokesman: [boolean, boolean];
  names: [string, string];
}

const REACTS = ['👏', 'ㅋㅋ', '😱', '🔥', '💸', '🚀', '🍢', '🐻'];

export function lobbyScreen(nav: Nav, code: string | null) {
  if (!settings.nick) {
    askNick(() => lobbyScreen(nav, code));
    return;
  }
  new Lobby(nav, code).start();
}

function askNick(done: () => void) {
  const inp = h('input', { type: 'text', maxlength: 12, placeholder: '닉네임 (최대 12자)', style: 'font-size:22px;width:100%' }) as HTMLInputElement;
  const ok = () => {
    const v = inp.value.trim();
    if (!v) return toast('닉네임을 입력하세요');
    settings.nick = v;
    saveSettings();
    done();
  };
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
  mount(h('div', { class: 'screen' }, h('div', { class: 'loading' }, h('div', { class: 'breaking' }, '정상회의 입장'), h('h2', null, '링에서 쓸 이름은?'), h('div', { class: 'row', style: 'width:min(420px,90vw)' }, inp, h('button', { class: 'btn primary', onclick: ok }, '입장')), h('p', { class: 'muted small' }, '계정 없이 닉네임만 씁니다.'))));
  setTimeout(() => inp.focus(), 50);
}

class Lobby {
  conn = new ServerConn();
  room: RoomSnap | null = null;
  el!: HTMLElement;
  private chatLog = h('div', { class: 'log' });
  private game: GameScreen | null = null;
  private spec: SpectatorDriver | null = null;
  private specMid = 0;
  private myChar: CharId = load<CharId>('lastChar', 'seo');
  private ready = false;
  private spoke = false;
  private left = false;

  constructor(private nav: Nav, private code: string | null) {}

  async start() {
    const msg = h('p', { class: 'muted' }, '서버에 연결하는 중…');
    mount(h('div', { class: 'screen' }, h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('h2', null, this.code ? `방 ${this.code} 입장 중` : '방 만드는 중'), msg, h('button', { class: 'btn ghost', onclick: () => this.leave() }, '취소'))));
    const slow = setTimeout(() => (msg.textContent = '무료 서버가 잠들어 있어 깨우는 중입니다… (최대 1분, 한 번 깨어나면 빨라집니다)'), 3500);
    try {
      await this.conn.connect(75000);
    } catch {
      clearTimeout(slow);
      if (this.left) return;
      toast('서버에 연결할 수 없습니다. 설정에서 서버 주소를 확인하세요.', 5000);
      this.nav.title();
      return;
    }
    clearTimeout(slow);
    if (this.left) return this.conn.close();
    this.bind();
    this.conn.send({ t: 'hello', nick: settings.nick, room: this.code, create: !this.code, char: this.myChar, ver: BUILD_ID });
  }

  private bind() {
    const c = this.conn;
    c.on('welcome', (m) => {
      this.code = m.code;
      const url = new URL(location.href);
      url.searchParams.set('room', m.code);
      history.replaceState(null, '', url.toString());
    });
    c.on('error', (m) => {
      if (m.code === 'version') {
        // 옛 버전 페이지 → 새 버전으로 새로고침 (같은 방으로 다시 들어옴)
        toast('게임이 업데이트되었습니다. 새 버전으로 다시 불러옵니다…', 4000);
        this.left = true;
        this.conn.close();
        const url = new URL(location.href);
        if (this.code) url.searchParams.set('room', this.code);
        url.searchParams.set('v', String(Date.now()));
        setTimeout(() => location.replace(url.toString()), 1200);
        return;
      }
      toast(m.msg, 4000);
      if (!this.room) {
        this.leave();
      }
    });
    c.on('room', (m) => {
      this.room = m.room;
      if (!this.game) this.render();
    });
    c.on('chat', (m) => this.addChat(m.nick, m.text));
    c.on('react', (m) => this.floatReact(m.e, m.nick));
    c.on('match', (m) => this.onMatch(m.match as MatchMsg));
    c.on('spec', (m) => {
      if (this.spec && m.mid === this.specMid) this.spec.feed(m.p, m.s, m.i);
    });
    c.on('specHistory', (m) => {
      if (this.spec && m.mid === this.specMid) {
        this.spec.feed(0, 0, m.p0);
        this.spec.feed(1, 0, m.p1);
      }
    });
    c.on('matchEnd', (m) => this.onMatchEnd(m));
    c.on('champion', (m) => {
      toast(`🏆 ${m.nick} — 세계의 지배자 등극!`, 6000);
      say(`${m.nick}, 세계의 지배자에 등극합니다!`, 0, true);
      audio.play('cheer');
    });
    c.on('disconnect', () => {
      if (this.left) return;
      toast('서버 연결이 끊어졌습니다', 4000);
      this.leave();
    });
  }

  private me(): RoomPlayer | undefined {
    return this.room?.players.find((p) => p.id === this.conn.id);
  }

  private leave() {
    this.left = true;
    this.game?.destroy();
    this.game = null;
    this.conn.send({ t: 'leave' });
    this.conn.close();
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.toString());
    this.nav.title();
  }

  // ---------------------------------------------------------- 경기
  private onMatch(m: MatchMsg) {
    const cfg: MatchConfig = { chars: m.chars, stage: m.stage, rounds: m.rounds, timer: 60, spokesman: m.spokesman, seed: m.seed };
    const local = m.p.indexOf(this.conn.id);
    this.game?.destroy();
    this.game = null;
    this.spec = null;
    if (local >= 0) {
      const link = new PeerLink(this.conn, m.p[1 - local], local === 0, m.id);
      link.start();
      link.onMode = (mode) => mode === 'relay' && toast('P2P 연결이 안 돼서 서버 중계로 대전합니다 (약간 느릴 수 있음)', 4000);
      const d = new OnlineDriver(cfg, local, link, this.conn, m.id, m.p, settings.inputDelay);
      this.game = new GameScreen(d, { mode: 'online', names: m.names, onExit: () => this.leave() });
    } else {
      const d = new SpectatorDriver(cfg);
      this.spec = d;
      this.specMid = m.id;
      const bar = h('div', { class: 'spec-bar' }, ...REACTS.map((e) => h('button', { onclick: () => this.conn.send({ t: 'react', e }) }, e)));
      this.game = new GameScreen(d, { mode: 'spectate', names: m.names, onExit: () => { this.game?.destroy(); this.game = null; this.spec = null; this.render(); }, extra: bar });
    }
    mount(this.game.el);
    this.game.start();
    audio.play('gong');
  }

  private onMatchEnd(m: { mid: number; winner: number; reason: string }) {
    const p = this.room?.players.find((x) => x.id === m.winner);
    const text = m.reason === 'disconnect' ? `${p?.nick ?? '상대'} 부전승 (상대 연결 끊김)` : `${p?.nick ?? ''} 승리`;
    if (this.game) {
      this.game.finish(text);
      const g = this.game;
      setTimeout(() => {
        if (this.game === g) {
          g.destroy();
          this.game = null;
          this.spec = null;
          this.render();
        }
      }, m.reason === 'disconnect' ? 1500 : 4500);
    } else toast(text);
  }

  // ---------------------------------------------------------- UI
  private addChat(nick: string, text: string) {
    this.chatLog.append(h('div', null, h('b', null, nick), ' ', text));
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private floatReact(e: string, nick: string) {
    const el = h('div', { class: 'float-react', style: `left:${10 + Math.random() * 80}%` }, e, h('small', null, nick));
    document.body.append(el);
    setTimeout(() => el.remove(), 2300);
    audio.play('select');
  }

  private render() {
    const r = this.room;
    if (!r || this.left) return;
    const pics = portraits();
    const me = this.me();
    const isHost = r.host === this.conn.id;
    const nick = (id: number | null) => (id === null ? '부전승' : r.players.find((p) => p.id === id)?.nick ?? '(나감)');
    const invite = `${location.origin}${location.pathname}?room=${r.code}${new URLSearchParams(location.search).get('server') ? '&server=' + encodeURIComponent(new URLSearchParams(location.search).get('server')!) : ''}`;

    // 왼쪽: 방 정보
    const left = h('div', { class: 'col' },
      h('div', { class: 'panel col' },
        h('div', { class: 'muted small' }, '방 코드'),
        h('div', { class: 'code' }, r.code),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => { navigator.clipboard?.writeText(invite).then(() => toast('초대 링크를 복사했습니다'), () => prompt('초대 링크', invite)); } }, '초대 링크 복사'),
          h('button', { class: 'btn ghost', onclick: () => this.leave() }, '나가기'),
        ),
        h('div', { class: 'muted small', style: 'word-break:break-all' }, invite),
      ),
      h('div', { class: 'panel col' },
        h('b', null, isHost ? '방 설정 (방장)' : '방 설정'),
        h('label', { class: 'row small' }, '승리 조건 ',
          h('select', { disabled: !isHost, onchange: (e: Event) => this.conn.send({ t: 'settings', rounds: Number((e.target as HTMLSelectElement).value) }) }, ...[1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: r.settings.rounds === n }, `${n}선승`)))),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', disabled: !isHost, checked: r.settings.spokesman, onchange: (e: Event) => this.conn.send({ t: 'settings', spokesman: (e.target as HTMLInputElement).checked }) }), '스포크스맨 모드 허용 (초보용 연타 콤보)'),
        r.mode === 'tournament'
          ? h('div', { class: 'tag gold' }, '토너먼트 진행 중')
          : isHost
            ? h('button', { class: 'btn blue', disabled: !!r.match, onclick: () => this.conn.send({ t: 'tournament' }) }, '토너먼트 시작 (준비한 사람끼리)')
            : h('div', { class: 'muted small' }, '방장이 토너먼트를 열 수 있습니다.'),
        r.bracket ? this.bracketView(r.bracket, nick) : null,
      ),
    );

    // 가운데: 내 캐릭터 + 참가자
    const status = r.match
      ? h('div', { class: 'tag red' }, `대전 중: ${nick(r.match.p[0])} (${CHARS[r.match.chars[0]].name}) vs ${nick(r.match.p[1])} (${CHARS[r.match.chars[1]].name}) · ${STAGES[r.match.stage].name}`)
      : r.countdown > 0
        ? h('div', { class: 'tag gold' }, '곧 경기가 시작됩니다!')
        : h('div', { class: 'muted small' }, '준비 완료한 사람이 2명 이상이면 자동으로 대전이 시작됩니다. 이긴 사람은 남고, 진 사람은 대기열 맨 뒤로.');
    const order = [...r.queue.map((id) => r.players.find((p) => p.id === id)).filter(Boolean)] as RoomPlayer[];
    const mid = h('div', { class: 'col' },
      h('div', { class: 'panel col' },
        h('div', { class: 'row' }, h('b', null, '내 캐릭터'), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${settings.nick}`)),
        h('div', { class: 'mini-chars' }, ...CHAR_LIST.map((c) => h('div', { class: 'char-card' + (this.myChar === c.id ? ' p1' : ''), onclick: () => this.pickChar(c.id) }, h('img', { src: pics.get(c.id) }), h('div', { class: 'nm' }, c.name), h('div', { class: 'ct' }, c.style)))),
        h('div', { class: 'row' },
          h('button', { class: 'btn ' + (me?.ready ? 'on' : 'primary'), style: 'flex:1;font-size:18px', onclick: () => this.toggleReady() }, me?.ready ? '준비 완료 ✓' : '준비 완료'),
          r.settings.spokesman ? h('button', { class: 'btn' + (me?.spoke ? ' on' : ''), onclick: () => this.toggleSpoke() }, '스포크스맨') : null,
        ),
      ),
      h('div', { class: 'panel col' },
        h('div', { class: 'row' }, h('b', null, `참가자 ${r.players.length}/8`), h('span', { class: 'spacer' }), status),
        h('div', { class: 'plist' },
          ...order.map((p, i) => {
            const fighting = r.match?.p.includes(p.id);
            return h('div', { class: 'pitem' + (p.id === this.conn.id ? ' me' : '') + (fighting ? ' fighting' : '') },
              h('img', { src: pics.get(p.char) }),
              h('div', { class: 'who' }, h('b', null, `${i + 1}. ${p.nick}`), h('span', { class: 'muted small' }, `${CHARS[p.char].name} · ${p.wins}승`)),
              p.title ? h('span', { class: 'tag gold' }, `👑 ${p.title}`) : null,
              p.id === r.host ? h('span', { class: 'tag' }, '방장') : null,
              fighting ? h('span', { class: 'tag red' }, '대전 중') : p.ready ? h('span', { class: 'tag green' }, '준비') : h('span', { class: 'tag' }, '대기'),
            );
          }),
        ),
      ),
    );

    // 오른쪽: 채팅 + 리액션
    const chatIn = h('input', { type: 'text', maxlength: 120, placeholder: '채팅' }) as HTMLInputElement;
    const right = h('div', { class: 'col' },
      h('div', { class: 'panel chat' },
        this.chatLog,
        h('form', { onsubmit: (e: Event) => { e.preventDefault(); if (chatIn.value.trim()) this.conn.send({ t: 'chat', text: chatIn.value }); chatIn.value = ''; } }, chatIn, h('button', { class: 'btn sm' }, '전송')),
      ),
      h('div', { class: 'panel col' }, h('b', null, '리액션'), h('div', { class: 'reacts' }, ...REACTS.map((e) => h('button', { class: 'btn', onclick: () => this.conn.send({ t: 'react', e }) }, e)))),
      r.match && !r.match.p.includes(this.conn.id) && !this.game
        ? h('button', { class: 'btn blue', onclick: () => this.conn.send({ t: 'spectate' }) }, '진행 중인 경기 관전하기')
        : null,
      h('p', { class: 'muted small' }, `서버 핑 ${Math.round(this.conn.rtt)}ms`),
    );

    const el = h('div', { class: 'screen' }, h('div', { class: 'row', style: 'max-width:1400px;margin:0 auto 14px' }, h('div', { class: 'breaking' }, '세계 정상회의 · 친구 방'), h('span', { class: 'spacer' })), h('div', { class: 'lobby' }, left, mid, right));
    this.el = el;
    mount(el);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private bracketView(b: BracketMatch[][], nick: (id: number | null) => string) {
    return h('div', { class: 'bracket' },
      ...b.map((round, ri) =>
        h('div', { class: 'rnd' },
          h('div', { class: 'muted small' }, ri === b.length - 1 ? '결승' : `${ri + 1}라운드`),
          ...round.map((m) => h('div', { class: 'bm' },
            h('div', { class: m.w !== null && m.w === m.a ? 'w' : '' }, m.a === null && ri > 0 && m.w === null ? '?' : nick(m.a)),
            h('div', { class: m.w !== null && m.w === m.b ? 'w' : '' }, m.b === null && ri > 0 && m.w === null ? '?' : nick(m.b)),
          )),
        ),
      ),
    );
  }

  private pickChar(c: CharId) {
    this.myChar = c;
    save('lastChar', c);
    audio.ensure();
    audio.play('select');
    this.conn.send({ t: 'char', char: c });
  }

  private toggleReady() {
    audio.ensure();
    this.ready = !this.me()?.ready;
    this.conn.send({ t: 'ready', ready: this.ready });
    audio.play('confirm');
  }

  private toggleSpoke() {
    this.spoke = !this.me()?.spoke;
    this.conn.send({ t: 'spoke', on: this.spoke });
  }
}

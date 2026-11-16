// 타이틀 · 캐릭터 선택 · 설정 · 키 설정 · 리플레이
import { audio } from '../audio/audio';
import { setTtsEnabled, ttsAvailable } from '../audio/tts';
import { type Ctl, LocalDriver, ReplayDriver, type Replay, TrainingDriver } from '../game/drivers';
import { ACTION_LABEL, ACTIONS, input, keyLabel, type Action, type KeyMap } from '../input/input';
import { portraits } from '../render/portraits';
import { STAGES } from '../render/stages';
import { CHAR_LIST, CHARS } from '../sim/chars';
import type { CharId, MatchConfig } from '../sim/types';
import { h, mount, toast } from './dom';
import { GameScreen } from './gameScreen';
import { moveListModal } from './movelist';
import { saveSettings, settings } from './storage';

export interface Nav {
  title(): void;
  lobby(code: string | null): void;
}

const TICKER = [
  '[속보] 세계 정상 8인, 정상회의장 링 위에서 직접 담판 예정',
  '푸틴 대통령 「잡히면 못 푼다」 경고',
  '트럼프 「역대 최고의 펀치, 다들 그렇게 말한다」',
  '김정은, 단추 위치 공개 거부',
  '이재명, 시장 방문 중 떡볶이로 체력 회복',
  '※ 비상업 풍자 패러디입니다. 실제 인물의 발언·행동과 무관합니다',
];

export function titleScreen(nav: Nav) {
  const pics = portraits();
  const codeIn = h('input', { type: 'text', placeholder: '방 코드 6자리', maxlength: 6 }) as HTMLInputElement;
  const join = () => {
    const c = codeIn.value.trim().toUpperCase();
    if (c.length !== 6) return toast('방 코드는 6자리입니다');
    nav.lobby(c);
  };
  codeIn.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  const item = (label: string, desc: string, cls: string, fn: () => void) =>
    h('button', { class: 'btn ' + cls, onclick: () => { audio.ensure(); audio.play('confirm'); fn(); } }, label, h('span', { class: 'desc' }, desc));
  const el = h('div', { class: 'screen' },
    h('div', { class: 'title-wrap' },
      h('div', null,
        h('div', { class: 'breaking' }, '긴급 속보'),
        h('h1', { class: 'logo' }, '서밋', h('br'), '파이터즈', h('small', null, 'SUMMIT FIGHTERS · 세계 정상회의 격투')),
        h('p', { class: 'muted', style: 'max-width:520px;line-height:1.7;margin-top:20px' }, '세계 정상들이 링 위에서 맞붙는 철권식 3D 격투 + 정치 풍자. 링크 하나로 친구들과 바로 대전하세요.'),
        h('div', { class: 'portrait-strip' }, ...CHAR_LIST.map((c) => h('img', { src: pics.get(c.id), alt: c.name, title: `${c.name} — ${c.title}` }))),
      ),
      h('div', { class: 'menu' },
        item('친구 방 만들기', '초대 링크로 온라인 대전', 'primary', () => nav.lobby(null)),
        h('div', { class: 'join' }, codeIn, h('button', { class: 'btn blue', onclick: join }, '입장')),
        item('로컬 대전', '한 PC에서 2인 (키보드·패드)', '', () => charSelect(nav, 'local')),
        item('CPU 대전', '혼자 연습 상대와', '', () => charSelect(nav, 'cpu')),
        item('트레이닝', '프레임 데이터 · 녹화 · 콤보 챌린지', '', () => charSelect(nav, 'training')),
        item('기술표 · 조작법', '', '', () => howTo(nav)),
        item('리플레이 보기', '저장한 .json 파일 열기', '', () => openReplay(nav)),
        item('설정', '소리 · 음성 · 그래픽 · 키 설정', 'ghost', () => settingsScreen(nav)),
      ),
    ),
    h('div', { class: 'ticker' }, h('span', null, TICKER.join('     ◆     '))),
  );
  mount(el);
}

// ------------------------------------------------------------ 캐릭터 선택 (로컬)
type SelMode = 'local' | 'cpu' | 'training';

interface SelState {
  chars: [CharId, CharId];
  ctl: [Ctl, Ctl];
  stage: number; // -1 랜덤
  rounds: number;
  spoke: [boolean, boolean];
}

const lastSel: Record<SelMode, SelState> = {
  local: { chars: ['seo', 'volkov'], ctl: ['kb1', 'kb2'], stage: -1, rounds: 3, spoke: [false, false] },
  cpu: { chars: ['seo', 'rex'], ctl: ['any', 'cpu2'], stage: -1, rounds: 3, spoke: [false, false] },
  training: { chars: ['seo', 'volkov'], ctl: ['any', 'none'], stage: 0, rounds: 99, spoke: [false, false] },
};

export function charSelect(nav: Nav, mode: SelMode) {
  const st = lastSel[mode];
  const pics = portraits();
  const grid = h('div', { class: 'chars' });
  const sides = h('div', { class: 'sel-grid' });
  let picking = 0;

  const ctlOptions = (i: number): [Ctl, string][] => {
    if (mode === 'local') return [['kb1', '키보드 1 (WASD + UIJK)'], ['kb2', '키보드 2 (방향키 + 넘패드)'], ['pad0', '게임패드 1'], ['pad1', '게임패드 2']];
    if (mode === 'cpu') return i === 0 ? [['any', '키보드/패드']] : [['cpu1', 'CPU 쉬움'], ['cpu2', 'CPU 보통'], ['cpu3', 'CPU 어려움']];
    return [['any', '키보드/패드']];
  };

  const render = () => {
    grid.replaceChildren(
      ...CHAR_LIST.map((c) => {
        const cls = ['char-card'];
        if (st.chars[0] === c.id) cls.push('p1');
        if (st.chars[1] === c.id) cls.push('p2');
        return h('div', { class: cls.join(' '), onclick: () => { st.chars[picking] = c.id; audio.play('select'); picking = mode === 'local' || mode === 'cpu' || mode === 'training' ? 1 - picking : 0; render(); } },
          st.chars[0] === c.id ? h('span', { class: 'cur c1' }, '1P') : null,
          st.chars[1] === c.id ? h('span', { class: 'cur c2' }, mode === 'training' ? '더미' : mode === 'cpu' ? 'CPU' : '2P') : null,
          h('img', { src: pics.get(c.id), alt: c.name }),
          h('div', { class: 'nm' }, c.name),
          h('div', { class: 'ct' }, c.country),
          h('div', { class: 'st' }, `${c.title} · ${c.style}`),
        );
      }),
    );
    sides.replaceChildren(
      ...[0, 1].map((i) => {
        const def = CHARS[st.chars[i]];
        const label = i === 0 ? '1P' : mode === 'training' ? '더미' : mode === 'cpu' ? 'CPU' : '2P';
        const ctl = h('select', { onchange: (e: Event) => { st.ctl[i] = (e.target as HTMLSelectElement).value as Ctl; } }, ...ctlOptions(i).map(([v, l]) => h('option', { value: v, selected: st.ctl[i] === v }, l)));
        return h('div', { class: `panel sel-side ${i ? 'p2' : 'p1'}` },
          h('div', { class: 'row' }, h('h3', null, `${label} · ${def.name}`), h('span', { class: 'spacer' }), h('button', { class: 'btn sm' + (picking === i ? ' on' : ''), onclick: () => { picking = i; render(); } }, picking === i ? '선택 중' : '이 칸 선택')),
          mode !== 'training' || i === 0 ? h('div', { class: 'row small' }, '조작: ', ctl) : null,
          h('div', { class: 'uniq' },
            h('div', null, h('b', null, `고유 시스템 · ${def.resName}`), ' — ', def.moveList.find((m) => m.cmd === '고유')?.desc ?? ''),
            h('div', null, h('b', null, `궁극기 · ${def.ultName}`), ' — ', def.moveList.find((m) => m.cmd === 'LP+RP')?.desc ?? ''),
          ),
          mode !== 'training' && !(mode === 'cpu' && i === 1)
            ? h('label', { class: 'row small', style: 'margin-top:8px' }, h('input', { type: 'checkbox', checked: st.spoke[i], onchange: (e: Event) => (st.spoke[i] = (e.target as HTMLInputElement).checked) }), '스포크스맨 모드 (버튼 연타 자동 콤보 · 초보용, 데미지 -10%)')
            : null,
        );
      }),
    );
  };

  const stageSel = h('select', { onchange: (e: Event) => (st.stage = Number((e.target as HTMLSelectElement).value)) },
    h('option', { value: -1, selected: st.stage === -1 }, '랜덤'),
    ...STAGES.map((s, i) => h('option', { value: i, selected: st.stage === i }, `${s.name} — ${s.gimmick}`)),
  );
  const roundSel = h('select', { onchange: (e: Event) => (st.rounds = Number((e.target as HTMLSelectElement).value)) }, ...[1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: st.rounds === n }, `${n}선승`)));

  const go = () => {
    audio.ensure();
    audio.play('confirm');
    startLocal(nav, mode, st);
  };
  const title = mode === 'local' ? '로컬 대전' : mode === 'cpu' ? 'CPU 대전' : '트레이닝';
  render();
  const el = h('div', { class: 'screen' },
    h('div', { style: 'max-width:1100px;margin:0 auto' },
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => nav.title() }, '← 뒤로'), h('h2', { style: 'margin:0' }, `${title} · 캐릭터 선택`)),
      h('p', { class: 'muted' }, mode === 'local' ? '카드를 누르면 1P → 2P 순서로 번갈아 선택됩니다. 기본 키: 1P WASD + U I J K / 2P 방향키 + 넘패드 4 5 1 2 (또는 [ ] ; \')' : '카드를 눌러 캐릭터를 고르세요.'),
      grid,
      sides,
      h('div', { class: 'row', style: 'margin-top:16px' },
        h('span', null, '스테이지 '), stageSel,
        mode !== 'training' ? h('span', null, ' 라운드 ') : null, mode !== 'training' ? roundSel : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', style: 'font-size:20px;padding:14px 34px', onclick: go }, '시작!'),
      ),
    ),
  );
  mount(el);
}

function startLocal(nav: Nav, mode: SelMode, st: SelState) {
  const cfg: MatchConfig = {
    chars: [...st.chars] as [CharId, CharId],
    stage: st.stage < 0 ? Math.floor(Math.random() * STAGES.length) : st.stage,
    rounds: mode === 'training' ? 99 : st.rounds,
    timer: 60,
    spokesman: mode === 'training' ? [false, false] : [...st.spoke] as [boolean, boolean],
    seed: (Math.random() * 1e9) | 0,
  };
  const names: [string, string] =
    mode === 'local' ? ['1P', '2P'] : mode === 'cpu' ? [settings.nick || '나', 'CPU'] : [settings.nick || '나', '더미'];
  const driver = mode === 'training' ? new TrainingDriver(cfg, st.ctl[0]) : new LocalDriver(cfg, st.ctl);
  const gs = new GameScreen(driver, {
    mode,
    names,
    onExit: () => nav.title(),
    onRematch: () => startLocal(nav, mode, st),
    onCharSelect: () => charSelect(nav, mode),
  });
  mount(gs.el);
  gs.start();
}

// ------------------------------------------------------------ 조작법
function howTo(nav: Nav) {
  const k = input.keys;
  const row = (a: string, b: string) => h('tr', null, h('td', null, a), h('td', null, b));
  const back = () => howTo(nav);
  const el = h('div', { class: 'screen' },
    h('div', { style: 'max-width:900px;margin:0 auto' },
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => nav.title() }, '← 뒤로'), h('h2', { style: 'margin:0' }, '조작법')),
      h('div', { class: 'panel', style: 'margin-top:12px' },
        h('table', { class: 'movelist' },
          row('이동', `${keyLabel(k.kb1.left[0])}/${keyLabel(k.kb1.right[0])} (또는 방향키). 앞으로 두 번: 대시, 뒤로 두 번: 백대시`),
          row('가드', '가만히 있거나 뒤: 상단·중단 가드 / 아래: 하단 가드 (상단은 앉으면 피함)'),
          row('횡이동', `위(${keyLabel(k.kb1.up[0])}) 탭: 화면 안쪽, 아래 짧게 탭: 바깥쪽. 직선 기술을 피한다`),
          row('점프', '↗ / ↖'),
          row('4버튼', `LP ${keyLabel(k.kb1.lp[0])} · RP ${keyLabel(k.kb1.rp[0])} · LK ${keyLabel(k.kb1.lk[0])} · RK ${keyLabel(k.kb1.rk[0])}`),
          row('잡기', 'LP+LK (LP로 풀기) · RP+RK (RP로 풀기)'),
          row('권력 게이지', '때리고, 맞고, 막으면 찬다 (3칸). 1칸: LK+RK 강화기 / 3칸: LP+RP 궁극기'),
          row('비상사태', '체력 25% 이하: 공격력 +10%, 라운드당 1회 LP+RK 비상 담화 (아머 반격기)'),
          row('궁극기', '발생 18F, 가드 가능 (막히면 큰 빈틈). 맞으면 뉴스 속보 컷신 + 큰 피해'),
          row('게임패드', '□ LP · △ RP · × LK · ○ RK · R1 궁극기 · L1 강화기 · R2 잡기 · L2 비상 담화'),
          row('스포크스맨 모드', '방향 + 버튼 연타만으로 콤보 (LP 연타: 3연타, RP: 띄우기 콤보, LK/RK: 필살기)'),
          row('Esc', '일시정지 · 기술표'),
        ),
      ),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: () => { const m = moveListModal('seo', back); mount(h('div', { class: 'screen' }, m)); } }, '캐릭터별 기술표')),
    ),
  );
  mount(el);
}

// ------------------------------------------------------------ 설정
export function settingsScreen(nav: Nav) {
  const slider = (label: string, val: number, set: (v: number) => void) =>
    h('label', { class: 'row' }, h('span', { style: 'width:110px' }, label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: val, oninput: (e: Event) => { set(Number((e.target as HTMLInputElement).value)); audio.setVolumes(settings.sfx, settings.music); saveSettings(); } }));
  const el = h('div', { class: 'screen' },
    h('div', { style: 'max-width:900px;margin:0 auto' },
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => nav.title() }, '← 뒤로'), h('h2', { style: 'margin:0' }, '설정')),
      h('div', { class: 'panel col', style: 'margin-top:12px' },
        h('label', { class: 'row' }, h('span', { style: 'width:110px' }, '닉네임'), h('input', { type: 'text', value: settings.nick, maxlength: 12, oninput: (e: Event) => { settings.nick = (e.target as HTMLInputElement).value; saveSettings(); } })),
        slider('효과음', settings.sfx, (v) => (settings.sfx = v)),
        slider('배경음악', settings.music, (v) => (settings.music = v)),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: settings.tts, onchange: (e: Event) => { settings.tts = (e.target as HTMLInputElement).checked; setTtsEnabled(settings.tts); saveSettings(); } }), `앵커 중계 · 대사 음성 (브라우저 TTS${ttsAvailable() ? '' : ' — 이 브라우저는 지원 안 함'})`),
        h('label', { class: 'row' }, h('span', { style: 'width:110px' }, '그래픽'), h('select', { onchange: (e: Event) => { settings.quality = (e.target as HTMLSelectElement).value as typeof settings.quality; saveSettings(); } }, ...(['low', 'mid', 'high'] as const).map((q) => h('option', { value: q, selected: settings.quality === q }, { low: '낮음 (저사양)', mid: '보통', high: '높음' }[q])))),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: settings.showInputs, onchange: (e: Event) => { settings.showInputs = (e.target as HTMLInputElement).checked; saveSettings(); } }), '대전 중 입력 표시'),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: settings.clip, onchange: (e: Event) => { settings.clip = (e.target as HTMLInputElement).checked; saveSettings(); } }), '궁극기 장면 클립(WebM) 자동 녹화 — 저사양 PC에서 끊기면 끄세요'),
        h('label', { class: 'row' }, h('span', { style: 'width:110px' }, '온라인 입력 지연'), h('select', { onchange: (e: Event) => { settings.inputDelay = Number((e.target as HTMLSelectElement).value); saveSettings(); } }, ...[1, 2, 3, 4].map((n) => h('option', { value: n, selected: settings.inputDelay === n }, `${n}F${n === 2 ? ' (기본)' : ''}`)))),
        h('label', { class: 'row' }, h('span', { style: 'width:110px' }, '서버 주소'), h('input', { type: 'text', value: settings.server, placeholder: '비워두면 기본 서버', style: 'flex:1', oninput: (e: Event) => { settings.server = (e.target as HTMLInputElement).value.trim(); saveSettings(); } })),
      ),
      h('h2', { style: 'margin-top:24px' }, '키 설정'),
      keyConfig(),
    ),
  );
  mount(el);
}

function keyConfig(): HTMLElement {
  const wrap = h('div', { class: 'panel' });
  let waiting: { dev: 'kb1' | 'kb2'; a: Action; btn: HTMLButtonElement } | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== 'Escape') {
      const map: KeyMap = input.keys[waiting.dev];
      map[waiting.a] = [e.code];
      input.saveKeys();
    }
    waiting = null;
    render();
  };
  window.addEventListener('keydown', onKey, true);
  const render = () => {
    const grid = h('div', { class: 'keycfg' }, h('b', null, '동작'), h('b', null, '키보드 1 (1P)'), h('b', null, '키보드 2 (2P)'));
    for (const a of ACTIONS) {
      grid.append(h('span', null, ACTION_LABEL[a]));
      for (const dev of ['kb1', 'kb2'] as const) {
        const b = h('button', { class: 'btn sm' }, input.keys[dev][a].map(keyLabel).join(' / ')) as HTMLButtonElement;
        b.onclick = () => {
          waiting = { dev, a, btn: b };
          b.classList.add('wait');
          b.textContent = '키를 누르세요…';
        };
        grid.append(b);
      }
    }
    wrap.replaceChildren(grid, h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn sm', onclick: () => { input.resetKeys(); render(); } }, '기본값으로'), h('span', { class: 'muted small' }, '게임패드는 표준 배치(□ LP △ RP × LK ○ RK)로 자동 인식됩니다.')));
  };
  render();
  return wrap;
}

// ------------------------------------------------------------ 리플레이
function openReplay(nav: Nav) {
  const f = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  f.onchange = async () => {
    const file = f.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Replay;
      if (data.v !== 1 || !data.cfg || !Array.isArray(data.p0)) throw new Error();
      const d = new ReplayDriver(data);
      const gs = new GameScreen(d, { mode: 'replay', names: data.names, onExit: () => nav.title() });
      mount(gs.el);
      gs.start();
    } catch {
      toast('리플레이 파일을 읽을 수 없습니다');
    }
  };
  f.click();
}

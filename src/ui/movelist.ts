import { CHAR_LIST, CHARS } from '../sim/chars';
import type { CharId } from '../sim/types';
import { h } from './dom';

export function moveListModal(initial: CharId, onBack: () => void): HTMLElement {
  let cur = initial;
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  const render = () => {
    tabs.replaceChildren(...CHAR_LIST.map((c) => h('button', { class: 'btn sm' + (c.id === cur ? ' on' : ''), onclick: () => { cur = c.id; render(); } }, c.name)));
    const def = CHARS[cur];
    body.replaceChildren(
      h('p', { class: 'muted', style: 'margin-top:0' }, `${def.country} · ${def.title} · ${def.style}`),
      h('table', { class: 'movelist' }, ...def.moveList.map((m) => h('tr', null, h('td', null, m.cmd), h('td', null, m.name), h('td', { class: 'muted' }, m.desc)))),
    );
  };
  render();
  return h('div', { class: 'modal', style: 'width:min(760px,94vw)' },
    h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, '기술표'), h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: onBack }, '뒤로')),
    h('p', { class: 'muted small' }, '방향은 캐릭터가 오른쪽을 볼 때 기준입니다. → 앞, ← 뒤, ↑ 화면 안쪽.'),
    tabs,
    body,
  );
}

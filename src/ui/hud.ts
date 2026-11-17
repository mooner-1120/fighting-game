// 경기 HUD: 체력·권력 게이지·고유 자원·타이머·콤보·안내 문구
import { CHARS } from '../sim/chars';
import type { GameState } from '../sim/types';
import { h } from './dom';

interface SideEls {
  nm: HTMLElement;
  hp: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  pips: HTMLElement;
  buffs: HTMLElement;
  gauge: HTMLElement;
  segs: HTMLElement[];
  res: HTMLElement;
  combo: HTMLElement;
  toasts: HTMLElement;
}

export class Hud {
  el: HTMLElement;
  private sides: SideEls[] = [];
  private timer: HTMLElement;
  private announceEl: HTMLElement;
  private announceT = 0;
  brief: HTMLElement;
  net: HTMLElement;
  inputsEl: HTMLElement;
  private lastCombo = [0, 0];
  private comboHide = [0, 0];
  private cache = new Map<string, string>();

  constructor(s: GameState, names: [string, string]) {
    this.timer = h('div', { class: 'timer' });
    this.announceEl = h('div', { class: 'announce' });
    this.brief = h('div', { class: 'brief' });
    this.net = h('div', { class: 'net' });
    this.inputsEl = h('div', { class: 'inputs', style: 'display:none' });
    const top = h('div', { class: 'top' });
    const bottom = h('div', { class: 'bottom' });
    const toasts = h('div', { class: 'toasts' });
    const combos: HTMLElement[] = [];
    for (let i = 0; i < 2; i++) {
      const def = CHARS[s.cfg.chars[i]];
      const cls = i === 0 ? 'p1' : 'p2';
      const fill = h('div', { class: 'fill' });
      const trail = h('div', { class: 'trail' });
      const hp = h('div', { class: 'hp' }, trail, fill);
      const nm = h('div', { class: 'nm' }, h('span', { class: 'pl' }, i === 0 ? '1P' : '2P'), def.name, h('span', { class: 'ct' }, `${def.country} · ${names[i]}`));
      if (i === 1) nm.style.flexDirection = 'row-reverse';
      const pips = h('div', { class: 'pips' });
      const buffs = h('div', { class: 'buffs' });
      const side = h('div', { class: `side ${cls}` }, nm, hp, h('div', { class: 'row', style: `justify-content:${i ? 'flex-end' : 'flex-start'};gap:8px` }, pips, buffs));
      const segs = [0, 1, 2].map(() => h('div', { class: 'gseg' }, h('i')));
      const gauge = h('div', { class: 'gauge' }, ...segs);
      const res = h('span', { class: 'res' });
      const gw = h('div', { class: `gauge-wrap ${cls}` }, h('div', { class: 'glabel' }, h('span', null, '권력 게이지'), res), gauge);
      const combo = h('div', { class: `combo ${cls}`, style: 'opacity:0' });
      combos.push(combo);
      const tcol = h('div', { class: `toast-col ${cls}` });
      toasts.append(tcol);
      this.sides.push({ nm, hp, fill, trail, pips, buffs, gauge, segs, res, combo, toasts: tcol });
      if (i === 0) {
        top.append(side, this.timer);
        bottom.append(gw);
      } else {
        top.append(side);
        bottom.append(gw);
      }
    }
    this.el = h('div', { class: 'hud' }, top, bottom, toasts, ...combos, this.announceEl, this.brief, this.net, this.inputsEl);
  }

  private set(key: string, el: HTMLElement, prop: 'width' | 'text' | 'html' | 'class', v: string) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (prop === 'width') el.style.width = v;
    else if (prop === 'text') el.textContent = v;
    else if (prop === 'html') el.innerHTML = v;
    else el.className = v;
  }

  update(s: GameState, dt: number) {
    const secs = Math.max(0, Math.ceil(s.timer / 60));
    this.set('timer', this.timer, 'html', `${s.cfg.timer >= 999 ? '∞' : secs}<span class="rd">ROUND ${s.round}</span>`);
    for (let i = 0; i < 2; i++) {
      const f = s.f[i];
      const el = this.sides[i];
      const def = CHARS[f.char];
      const pct = Math.max(0, (f.hp / f.maxHp) * 100);
      this.set(`f${i}`, el.fill, 'width', pct.toFixed(1) + '%');
      if (f.combo === 0 || pct > parseFloat(this.cache.get(`t${i}`) ?? '100')) this.set(`t${i}`, el.trail, 'width', pct.toFixed(1) + '%');
      this.set(`e${i}`, el.hp, 'class', f.hp > 0 && f.hp * 4 <= f.maxHp ? 'hp emerg' : 'hp');
      let pips = '';
      for (let k = 0; k < s.cfg.rounds && s.cfg.rounds < 10; k++) pips += `<div class="pip${k < s.wins[i] ? ' on' : ''}"></div>`;
      this.set(`p${i}`, el.pips, 'html', pips);
      // 버프
      const b: string[] = [];
      if (f.hp > 0 && f.hp * 4 <= f.maxHp) b.push(`<span class="buff bad">비상사태${f.emergencyUsed ? '' : ' · 담화 가능'}</span>`);
      if (f.buffs.armor > 0) b.push('<span class="buff good">아머</span>');
      if (f.buffs.atkUp > 0) b.push('<span class="buff good">공격력 +15%</span>');
      if (f.buffs.tariff > 0) b.push(`<span class="buff bad">관세 25% (${Math.ceil(f.buffs.tariff / 60)})</span>`);
      if (f.buffs.slow > 0) b.push(`<span class="buff bad">이동 -50% (${Math.ceil(f.buffs.slow / 60)})</span>`);
      if (f.buffs.briefing > 0) b.push(`<span class="buff good">${f.char === 'xi' ? '감시망' : '브리핑'}</span>`);
      if (f.buffs.cage > 0) b.push(`<span class="buff bad">갇힘 (${Math.ceil(f.buffs.cage / 60)})</span>`);
      if (f.buffs.hidden > 0 && f.char === 'xi') b.push('<span class="buff good">잠적</span>');
      if (f.spoke) b.push('<span class="buff">스포크스맨</span>');
      this.set(`b${i}`, el.buffs, 'html', b.join(''));
      // 게이지
      for (let k = 0; k < 3; k++) {
        const fillPct = Math.max(0, Math.min(1, (f.gauge - k * 1000) / 1000)) * 100;
        const seg = el.segs[k];
        this.set(`g${i}${k}`, seg.firstChild as HTMLElement, 'width', fillPct.toFixed(0) + '%');
        this.set(`gs${i}${k}`, seg, 'class', fillPct >= 100 ? 'gseg full' : 'gseg');
      }
      this.set(`gm${i}`, el.gauge, 'class', f.gauge >= 3000 && !f.ultUsed ? 'gauge max' : 'gauge');
      // 고유 자원
      let r = '';
      switch (def.id) {
        case 'volkov':
          r = `오라 ${'●'.repeat(f.res[0])}${'○'.repeat(3 - f.res[0])}${f.res[0] >= 3 ? ' MAX' : ''}`;
          break;
        case 'rex':
          r = `재화 $${f.res[0]}`;
          break;
        case 'kang':
          r = `미사일 ${'■'.repeat(f.res[0])}${'□'.repeat(3 - f.res[0])}`;
          break;
        case 'seo':
          r = `지지율 ${f.res[0]}%`;
          break;
        case 'thatcher':
          if (f.move === 'tea') r = '티타임 ☕ 마시는 중…';
          else if (f.res[1] > 0) r = `티타임 ☕ ${Math.ceil(f.res[1] / 60)}초! (↓+LP+RP)`;
          else r = `티타임까지 ${Math.ceil(f.res[0] / 60)}초`;
          break;
        case 'xi':
          r = f.buffs.briefing > 0 ? `감시망 가동 (${Math.ceil(f.buffs.briefing / 60)}초)` : `감시망 ${f.res[0]}%`;
          break;
        case 'mbs':
          r = `유가 $${40 + f.res[0]} ${f.res[2] ? '▲' : '▼'}`;
          break;
        case 'macron':
          r = `우아함 ${f.res[0]}%`;
          break;
      }
      if (f.ultUsed) r += ' · 궁극기 사용함';
      else if (f.gauge >= 3000) r += ' · 궁극기 LP+RP!';
      this.set(`r${i}`, el.res, 'text', r);
      // 콤보
      const d = s.f[1 - i];
      if (d.combo >= 2) {
        this.lastCombo[i] = d.combo;
        this.comboHide[i] = 1.2;
        this.set(`c${i}`, el.combo, 'html', `<div class="n">${d.combo} HIT</div><div class="d">${d.comboDmg} 데미지</div>`);
        el.combo.style.opacity = '1';
      } else if (this.comboHide[i] > 0) {
        this.comboHide[i] -= dt;
        if (this.comboHide[i] <= 0) el.combo.style.opacity = '0';
      }
    }
    if (this.announceT > 0) {
      this.announceT -= dt;
      if (this.announceT <= 0) this.announceEl.classList.remove('show');
    }
    this.el.style.visibility = s.cine ? 'hidden' : 'visible';
  }

  announce(text: string, sub = '', dur = 1.4) {
    this.announceEl.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
    this.announceEl.classList.remove('show');
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add('show');
    this.announceT = dur;
  }

  toast(side: number, text: string) {
    const col = this.sides[side]?.toasts;
    if (!col) return;
    const t = h('div', { class: 'hud-toast' }, text);
    col.append(t);
    while (col.children.length > 4) col.firstChild?.remove();
    setTimeout(() => t.remove(), 2200);
  }
}

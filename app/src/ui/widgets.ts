// Pieces the ported screens share, from design_preview's ui/widgets.ts: the nav (Home, Movies, TV Shows, Search),
// buttons, chips, the guide line and the title card (F46's poster card with the service pill). Styles in widgets.css,
// on @hometv/core's tokens.

import '@hometv/core/tokens.css';
import './widgets.css';
import type { Title } from '@hometv/core/types.ts';
import { cardSubtitle } from '../data/offerStandIns';
import { posterUrl } from '../data/posters';
import { h } from '../shell/dom';
import { focusable, type FocusOpts } from '../shell/focus';
import { shell, type TabId } from '../shell/app';
import { icon, type IconName } from './icons';

/**
 * The page's sections. OK on one switches to it; focusing it only highlights it. OK on the page you are already on
 * does nothing. The device icons of design_preview's nav (Wi-Fi, Inputs, quick settings) aren't part of these ports.
 */
export function navBar(active: TabId | null): HTMLElement {
  const tabs: [TabId, string][] = [
    ['home', 'Home'],
    ['movies', 'Movies'],
    ['tv', 'TV Shows'],
  ];
  let tabsRoot: HTMLElement | null = null;
  const section = (id: TabId, label: string | null) => {
    const el = label ? h('div.nav-tab' + (id === active ? '.is-active' : ''), label) : h('div.nav-search' + (id === active ? '.is-active' : ''), { html: icon('search') });
    const open = () => {
      if (el.classList.contains('is-active')) return;
      const from = shell.top();
      shell.goTab(id, { focusNav: true });
      // Coming back to the page we left puts focus on its own section, not on the one we switched to.
      const own = tabsRoot && (tabsRoot.querySelector('.is-active') as HTMLElement | null);
      if (from && own) {
        from.lastFocus = own;
        from.lastFocusKey = own.getAttribute('data-key') || undefined;
        if (!from.memory) from.memory = {};
        from.memory.nav = own;
      }
    };
    return focusable(el, { group: 'nav', key: `nav-${id}`, isDefault: id === active, onOk: open });
  };
  tabsRoot = h('div.nav-left', h('div.nav-tabs', tabs.map(([id, label]) => section(id, label))), section('search', null));
  return h('div.nav', tabsRoot);
}

export function button(label: string, opts: FocusOpts & { icon?: IconName; primary?: boolean; small?: boolean } = {}): HTMLElement {
  const cls = 'div.btn' + (opts.primary ? '.btn--primary' : '') + (opts.small ? '.btn--small' : '');
  const el = h(cls, opts.icon ? h('span.btn-icon', { html: icon(opts.icon, opts.small ? 22 : 26) }) : null, h('span.btn-label', label));
  return focusable(el, opts);
}

export function chip(label: string, opts: FocusOpts & { selected?: boolean } = {}): HTMLElement {
  return focusable(h('div.chip' + (opts.selected ? '.is-selected' : ''), label), opts);
}

export const guide = (left: string, right: string) => h('div.guide', h('span', left), h('span.guide-right', right));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * F46 (Rebecca, 2026-11-04 09:57): the title card on every page with title cards. Only the poster (195 × 293), with the
 * service pill on its top-left corner. Focused: the accent ring, a slight scale-up, and the name with "year · score"
 * on a dark fade at the poster's foot. The poster loads when it comes near the screen ({@link lazyImages}); with none,
 * or when it won't load, the card shows the title's name.
 */
export function miniCard(t: Title, opts: FocusOpts & { name?: Node | string } = {}): HTMLElement {
  const img = h('img.lazy', { alt: '' }) as HTMLImageElement;
  const url = posterUrl(t);
  if (url) img.setAttribute('data-src', url);
  else img.className = 'is-missing';
  img.onerror = () => {
    img.onerror = null;
    img.className = 'is-missing';
  };
  const line = cardSubtitle(t);
  return focusable(
    h(
      'div.card.card--mini',
      { 'data-title': t.id },
      h(
        'div.card-art',
        h('div.card-fallback', t.name),
        img,
        line ? h('div.svc-pill', h('span.pill-name', line)) : null,
        h('div.mini-focus', h('div.mini-name', opts.name || t.name), h('div.mini-meta', `${t.year} · ${t.score.toFixed(1)}/10`)),
      ),
    ),
    opts,
  );
}

/**
 * Loads `img.lazy[data-src]` under `scroller` once they come within `margin` px (stage px) of its visible part: only
 * what is near the screen asks the network, and the rest waits for a scroll. Call `check()` after drawing.
 */
export function lazyImages(scroller: HTMLElement, margin = 600): { check(): void } {
  let pending = false;
  const check = () => {
    pending = false;
    const imgs = scroller.querySelectorAll('img.lazy[data-src]');
    if (!imgs.length) return;
    const box = scroller.getBoundingClientRect();
    const m = margin * shell.scale;
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i] as HTMLImageElement;
      const r = img.getBoundingClientRect();
      if (!r.height || r.bottom < box.top - m || r.top > box.bottom + m) continue;
      img.src = img.getAttribute('data-src')!;
      img.removeAttribute('data-src');
      img.classList.remove('lazy');
    }
  };
  scroller.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    window.setTimeout(check, 80);
  });
  return { check };
}

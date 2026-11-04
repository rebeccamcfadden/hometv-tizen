// The pieces Search and the title page share, from hometv-launcher's design_preview/src/ui/widgets.ts at 2bf3c2d:
// buttons, chips, the C title card (F46) with its service pill, people and rows. Built for Chromium 56; posters load
// when their card comes into view.
import type { Offer, Title } from '@hometv/core/types.ts';
import { SERVICES } from '@hometv/core/services.ts';
import { cardOffer } from '../data/offers';
import { posterUrl } from '../data/posters';
import { CURRENCY } from '../data/settings';
import { h } from '../shell/dom';
import { focusable, type FocusOpts } from '../shell/focus';
import { icon, type IconName } from './icons';
import '@hometv/core/tokens.css';
import './widgets.css';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export function button(
  label: string,
  opts: FocusOpts & { icon?: IconName; primary?: boolean; small?: boolean; iconOnly?: boolean; on?: boolean } = {},
): HTMLElement {
  const cls = ['btn', opts.primary && 'btn--primary', opts.small && 'btn--small', opts.iconOnly && 'btn--icon', opts.on && 'is-on']
    .filter(Boolean)
    .join('.');
  const el = h(
    `div.${cls}`,
    opts.icon ? h('span.btn-icon', { html: icon(opts.icon, opts.small ? 22 : 26, opts.icon === 'play' || (!!opts.on && opts.icon === 'heart')) }) : null,
    h('span.btn-label', label),
  );
  return focusable(el, opts);
}

export function chip(label: string, opts: FocusOpts & { selected?: boolean } = {}): HTMLElement {
  return focusable(h(`div.chip${opts.selected ? '.is-selected' : ''}`, label), opts);
}

/** Sets or removes a boolean attribute (toggleAttribute is Chromium 69). */
export function flag(el: Element, name: string, on: boolean) {
  if (on) el.setAttribute(name, '');
  else el.removeAttribute(name);
}

// Posters load once their card is in view (the TV may draw 40 at a time); without IntersectionObserver, at once.
const lazy =
  typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.intersectionRatio <= 0 && !(e as { isIntersecting?: boolean }).isIntersecting) continue;
            lazy!.unobserve(e.target);
            load(e.target as HTMLImageElement);
          }
        },
        { rootMargin: '200px' },
      )
    : null;

function load(img: HTMLImageElement) {
  const src = img.getAttribute('data-src');
  if (src) img.src = src;
}

/** The title's poster; with none, or when it won't load, the art box gets is-missing and shows the name instead. */
export function posterArt(t: Title, box: HTMLElement): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = '';
  const url = posterUrl(t);
  const missing = () => {
    img.onerror = null;
    box.classList.add('is-missing');
  };
  if (!url) missing();
  else {
    img.onerror = missing;
    img.setAttribute('data-src', url);
    if (lazy) lazy.observe(img);
    else load(img);
  }
  return img;
}

/**
 * F46: the pill on a C card: a round icon (a tick on green for Included or Free, the currency for rent or buy) and the
 * service's name. None when the household has no offer.
 */
export function servicePill(o: Offer | undefined): HTMLElement | null {
  if (!o) return null;
  const paid = o.type === 'rent' || o.type === 'buy';
  const mark = paid ? h('span.pill-ico.pill-ico--paid', CURRENCY) : h('span.pill-ico.pill-ico--incl', { html: icon('check', 18) });
  return h('div.svc-pill', mark, h('span.pill-name', SERVICES[o.service].name));
}

/**
 * F46: the title card. Only the poster, the service pill on its corner; focused, the name (two lines at most) and
 * "year · score" on a dark fade at its foot. `name` replaces the shown name (Search's highlighted match).
 */
export function miniCard(t: Title, opts: FocusOpts & { name?: Node | string } = {}): HTMLElement {
  const art = h('div.card-art');
  art.appendChild(posterArt(t, art));
  const pill = servicePill(cardOffer(t));
  if (pill) art.appendChild(pill);
  art.appendChild(h('div.card-missing', t.name));
  art.appendChild(h('div.mini-focus', h('div.mini-name', opts.name || t.name), h('div.mini-meta', `${t.year} · ${t.score.toFixed(1)}/10`)));
  return focusable(h('div.card.card--mini', { 'data-title': t.id }, art), opts);
}

export function personCard(name: string, role: string, opts: FocusOpts = {}): HTMLElement {
  return focusable(h('div.person', h('div.person-portrait', initials(name)), h('div.person-name', name), h('div.person-role', role)), opts);
}

/** A labelled row that scrolls sideways; `pad` keeps the focused card that far from its edges. */
export function rowOf(label: string, items: HTMLElement[], pad = 0): HTMLElement {
  return h('div.row', h('div.row-label', label), h('div.row-items', { 'data-scroll': 'x', 'data-scroll-pad': pad }, items));
}

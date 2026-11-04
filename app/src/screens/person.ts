// The person page, from design_preview's screens/person.ts (a stub there too: "Person · not designed yet"): enough
// to follow the flow from a title page's Cast & crew or a People search result (both W3's), which push it with the
// person's name. Their titles in the catalogue, eight across; OK opens a title page.

import './person.css';
import { createSearch } from '@hometv/core/fuzzy.ts';
import { GENRES, TITLES } from '../data/catalog';
import { shell, type Screen } from '../shell/app';
import { h } from '../shell/dom';
import { columnsOf, gridMove } from '../shell/grid';
import { button, initials, lazyImages, miniCard } from '../ui/widgets';
import { openTitle } from './openTitle';

let people: ReturnType<typeof createSearch> | null = null;
/** The catalogue's titles with `name` in their cast or crew. */
export function titlesForPerson(name: string) {
  if (!people) people = createSearch(TITLES, GENRES);
  return people.titlesForPerson(name);
}

export function personScreen(name: string): Screen {
  const titles = titlesForPerson(name);
  const back = button('Back', { icon: 'back', small: true, key: 'back', onOk: () => shell.back() });
  const grid = h(
    'div.person-grid',
    titles.map((t, i) => miniCard(t, { group: 'known', key: `p-${t.id}`, isDefault: i === 0, onOk: () => openTitle(t) })),
  );
  const scroll = h('div.person-scroll', { 'data-scroll': 'y', 'data-scroll-pad': 40 }, grid);
  const lazy = lazyImages(scroll);
  const el = h(
    'div.screen.screen--full.person-page',
    back,
    h('div.person-hero', h('div.person-portrait', initials(name)), h('div', h('div.eyebrow', 'Person · not designed yet'), h('h1.page-title', name))),
    h('div.row-label.person-known', `Known for · ${titles.length} title${titles.length === 1 ? '' : 's'} in the catalogue`),
    scroll,
  );
  let cols = 0;
  return {
    label: name,
    el,
    defaultFocus: () => (grid.querySelector('[data-focus]') as HTMLElement | null) || back,
    onShow: () => lazy.check(),
    onKey(key, f) {
      if (!f || !grid.contains(f) || (key !== 'up' && key !== 'down' && key !== 'left' && key !== 'right')) return false;
      const cards = grid.querySelectorAll('.card') as NodeListOf<HTMLElement>;
      if (!cols) cols = columnsOf(cards);
      const next = gridMove(Array.prototype.indexOf.call(cards, f), cards.length, cols, key);
      if (next !== null) {
        shell.focus(cards[next]);
        return true;
      }
      return key !== 'up';
    },
  };
}

export function showPerson(name: string): void {
  shell.push(personScreen(name));
}

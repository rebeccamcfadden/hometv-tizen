// The rent/buy dialog (07-prices A), from hometv-launcher's design_preview/src/screens/rent.ts at 2bf3c2d: the store's
// name, an HD/4K switch when it prices both, a big button per price, Cancel, and a line that says payment finishes
// in the store's app, naming a cheaper store when there is one. A price button opens the store's app.

import { appName, SERVICES } from '@hometv/core/services.ts';
import type { Offer, OfferType, Quality, Title } from '@hometv/core/types.ts';
import { cheapest, cheapestStore, kr, offersByService, qualitiesOf, type ServiceOffers } from '../data/offers';
import { shell, type Screen } from '../shell/app';
import { h, replace } from '../shell/dom';
import { focusable } from '../shell/focus';
import { samsungApp } from '../titleLinks';
import { button, chip } from '../ui/widgets';
import { openWith } from './opening';

/** "4K costs 10–30 kr more here", from the store's HD and 4K prices; null when it has no 4K or no difference. */
export function fourKNote(s: ServiceOffers): string | null {
  const diffs: number[] = [];
  for (const o of [s.rent, s.buy]) {
    const hd = o && o.prices ? o.prices.HD : undefined;
    const uhd = o && o.prices ? o.prices['4K'] : undefined;
    if (hd !== undefined && uhd !== undefined && uhd > hd) diffs.push(uhd - hd);
  }
  if (!diffs.length) return null;
  const lo = Math.min.apply(null, diffs);
  const hi = Math.max.apply(null, diffs);
  return `4K costs ${lo === hi ? lo : `${lo}–${hi}`} kr more here`;
}

/**
 * The cheaper offer elsewhere, of the type that decided Cheapest (rent against rent, buy against buy):
 * " SF Anytime has it for 39 kr (HD)." or " … for 129 kr to buy (HD).", else ''.
 */
export function cheaperElsewhere(t: Title, s: ServiceOffers): string {
  const all = offersByService(t);
  const best = cheapestStore(all);
  const bestOffers = all.filter((x) => x.service === best)[0];
  if (!best || !bestOffers || best === s.service) return '';
  const byRent = !!bestOffers.rent && cheapest(bestOffers.rent) !== undefined;
  const theirs = byRent ? bestOffers.rent : bestOffers.buy;
  const ours = byRent ? s.rent : s.buy;
  const here = ours ? cheapest(ours) : undefined;
  const there = theirs ? cheapest(theirs) : undefined;
  if (there === undefined || (here !== undefined && there >= here)) return '';
  const prices = theirs!.prices || {};
  const q = (Object.keys(prices) as Quality[]).filter((x) => prices[x] === there)[0];
  return ` ${SERVICES[best].name} has it for ${kr(there)}${byRent ? '' : ' to buy'}${q ? ` (${q})` : ''}.`;
}

export function rentDialog(t: Title, s: ServiceOffers): Screen {
  const name = SERVICES[s.service].name;
  const app = appName(s.service);
  const qualities = qualitiesOf(s);
  const lead = s.rent || s.buy;
  const leadMin = lead ? cheapest(lead) : undefined;
  // The quality the dialog opens on: that of the store's cheapest rental (else purchase), none when nothing is priced.
  let quality: Quality | null = qualities.filter((q) => !!lead && !!lead.prices && lead.prices[q] === leadMin)[0] || qualities[0] || null;

  const qualRow = h('div.qual');
  const prices = h('div.dlg-prices');
  const detail = h('div.dialog-detail');

  const priceButton = (type: OfferType, o: Offer, isDefault: boolean) => {
    const amount = quality && o.prices ? o.prices[quality] : undefined;
    const season = o.seasonal ? ' a season' : '';
    const k = `${type === 'rent' ? 'Rent' : 'Buy'}${season}${quality ? ` · ${quality}` : ''}`;
    const v = amount !== undefined ? kr(amount) : quality ? '–' : 'Price in the app';
    const d = type === 'rent' ? '48 hours to finish once started' : o.seasonal ? `Per season, yours to keep in ${app}` : `Yours to keep in ${app}`;
    return focusable(h('div.pbtn', h('div.k', k), h('div.v', v), h('div.d', d)), {
      group: 'prices',
      key: `p-${type}`,
      isDefault,
      onOk: () => {
        shell.pop();
        openWith({ how: 'app', app: samsungApp(s.service) }, `Opening ${app} to ${type} ${t.name}${quality ? ` in ${quality}` : ''}…`);
      },
    });
  };

  const paint = () => {
    const note = fourKNote(s);
    replace(
      qualRow,
      qualities.length > 1
        ? [
            qualities.map((q) =>
              chip(q, {
                selected: q === quality,
                group: 'qual',
                key: `q-${q}`,
                isDefault: q === quality,
                onOk: () => {
                  quality = q;
                  paint();
                  shell.refocus();
                },
              }),
            ),
            note ? h('span.qual-note', note) : null,
          ]
        : null,
    );
    qualRow.hidden = qualities.length < 2;
    // Only the offers the store has in the chosen quality; both when nothing is priced.
    const shown = ([['rent', s.rent], ['buy', s.buy]] as [OfferType, Offer | undefined][]).filter(
      (x) => !!x[1] && (!quality || (!!x[1].prices && x[1].prices[quality] !== undefined)),
    ) as [OfferType, Offer][];
    replace(prices, shown.map((x, i) => priceButton(x[0], x[1], i === 0)));
    replace(detail, `Payment finishes in the ${app} app.${cheaperElsewhere(t, s)}`);
  };
  paint();

  const cancel = button('Cancel', { key: 'cancel', onOk: () => shell.pop() });
  const el = h(
    'div.screen.layer-dialog',
    h('div.scrim'),
    h('div.dialog.dialog--rent', h('div.dialog-title', `${t.name} on ${name}`), qualRow, prices, h('div.dialog-actions', cancel), detail),
  );
  return {
    label: `${t.name} on ${name}`,
    el,
    layer: 'dialog',
    defaultFocus: () => (prices.querySelector('[data-default]') as HTMLElement | null) || cancel,
  };
}

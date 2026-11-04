// Where W4's screens meet the offers (design_preview's data/offers.ts), which W3 ports in parallel: until then these
// stand in, in one place, so nothing of the screens is dropped. builder-4 wires these to data/offers.ts after W3
// merges: cardSubtitle → cardLine (or the pill's servicePill(cardOffer(t))), included → isOwnIncluded, rentable →
// offersOf(t).some(rent), servicesCount → subscribedCount.

import type { Title } from '@hometv/core/types.ts';

/** The title's availability line on its card, for the household's services; '' for none. */
// builder-4 wires this to data/offers.ts cardLine after W3 merges.
export function cardSubtitle(_t: Title): string {
  return '';
}

/** Included with a subscription, or free. Stand-in: any such offer, not only the household's ticked services. */
export const included = (t: Title) => t.offers.some((o) => o.type === 'sub' || o.type === 'free');

/** For rent in a store. */
export const rentable = (t: Title) => t.offers.some((o) => o.type === 'rent');

/** How many services the household has ticked, for the library's scope line; null leaves it out. */
export const servicesCount = (): number | null => null;

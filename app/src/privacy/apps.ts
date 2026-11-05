// Settings › Privacy's apps report: the TV's apps sorted by what they are, read-only. Only app ids this repo already
// documents are sorted (the list is the platform's `knownApps`); everything else is "unknown". Nothing here is ever
// offered for removal: Developer Mode can't disable Samsung's apps, and the ad and ACR parts are protected system parts
// (docs/privacy.md). Pure, so tests run it in Node.

import type { AppSeen } from './store';

export type BucketId = 'ads' | 'tracking' | 'voice' | 'extras' | 'keep' | 'unknown';
export const BUCKET_ORDER: BucketId[] = ['ads', 'tracking', 'voice', 'extras', 'keep', 'unknown'];

/** One app id (or a package, matching every app in it) the repo knows, and which bucket it goes in. */
export interface KnownApp {
  /** An app id ("org.tizen.ADPlayer"), or a package id followed by "." ("ZODRT12q2l.") to match its apps. */
  match: string;
  bucket: Exclude<BucketId, 'unknown'>;
  /** What it is, in a few words. */
  what: string;
}

export const BUCKETS: Record<BucketId, { title: string; note: string }> = {
  ads: { title: 'Ads', note: 'Samsung’s ad parts. Protected: Interest-Based Advertisement and the DNS step do the work.' },
  tracking: { title: 'Tracking (ACR)', note: 'Samsung’s screen recognition. Protected: Viewing Information Services off stops it.' },
  voice: { title: 'Voice', note: 'Voice Recognition Services and Bixby’s review switches cover these.' },
  extras: { title: 'Samsung extras', note: 'TV Plus and the like: the home-bar steps cover these.' },
  keep: { title: 'Keep', note: 'The TV, its settings, the streaming apps and HomeTV itself need these.' },
  unknown: { title: 'Unknown', note: 'Not ones HomeTV knows. Leave them alone unless you know what they are.' },
};

export interface ReportApp extends AppSeen {
  bucket: BucketId;
  what: string;
  /** Always false: HomeTV never offers to remove or disable an app. */
  removable: false;
}

export type Report = Record<BucketId, ReportApp[]>;

/** The known entry for an app id, or null. */
export function knownFor(id: string, known: KnownApp[]): KnownApp | null {
  for (const k of known) {
    if (k.match.charAt(k.match.length - 1) === '.' ? id.indexOf(k.match) === 0 : id === k.match) return k;
  }
  return null;
}

/**
 * Sorts the apps into buckets. `homeKeys` is the set of app ids HomeTV has a Home tile for: those are apps the household
 * uses, so they go in Keep. Each bucket keeps the TV's order.
 */
export function bucketApps(apps: AppSeen[], known: KnownApp[], homeKeys: string[] = []): Report {
  const out: Report = { ads: [], tracking: [], voice: [], extras: [], keep: [], unknown: [] };
  const seen: Record<string, true> = {};
  for (const a of apps) {
    if (!a || !a.id || seen[a.id]) continue;
    seen[a.id] = true;
    const k = knownFor(a.id, known);
    if (k) out[k.bucket].push({ id: a.id, name: a.name, bucket: k.bucket, what: k.what, removable: false });
    else if (homeKeys.indexOf(a.id) >= 0) out.keep.push({ id: a.id, name: a.name, bucket: 'keep', what: 'Has a tile on Home', removable: false });
    else out.unknown.push({ id: a.id, name: a.name, bucket: 'unknown', what: '', removable: false });
  }
  return out;
}

export const reportCount = (r: Report): number => BUCKET_ORDER.reduce((n, b) => n + r[b].length, 0);

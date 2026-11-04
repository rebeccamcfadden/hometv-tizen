// The check report's allowlist (report-schema.json): what leaves the TV is only what the schema lists, each value
// checked against its rule. Anything else (an app id, an address, a name, an error's text) is dropped here, and the
// laptop tool drops it again (tools/check/check_report.py) before it writes the report file.

import schema from './report-schema.json';

export type Spec = string | { [key: string]: Spec };

const PATTERNS: Record<string, RegExp> = {};
for (const name of Object.keys(schema.patterns)) PATTERNS[name] = new RegExp((schema.patterns as Record<string, string>)[name]);

/** The value if it keeps to `rule`, else undefined. */
function leaf(value: unknown, rule: string): unknown {
  const parts = rule.split(':');
  const kind = parts[0];
  if (kind === 'bool') return typeof value === 'boolean' ? value : undefined;
  if (kind === 'int') {
    const min = Number(parts[1]);
    const max = Number(parts[2]);
    return typeof value === 'number' && Math.floor(value) === value && value >= min && value <= max ? value : undefined;
  }
  if (kind === 'enum') return typeof value === 'string' && parts.slice(1).join(':').split('|').indexOf(value) >= 0 ? value : undefined;
  if (kind === 're') {
    const re = PATTERNS[parts[1]];
    return re && typeof value === 'string' && re.test(value) ? value : undefined;
  }
  return undefined;
}

/** A copy of `value` with only what `spec` allows; empty objects are left out. */
export function clean(value: unknown, spec: Spec): unknown {
  if (typeof spec === 'string') return leaf(value, spec);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const key of Object.keys(spec)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const v = clean((value as Record<string, unknown>)[key], spec[key]);
    if (v !== undefined) {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** The TV's part of the report, allowlisted. */
export function cleanTvReport(draft: unknown): Record<string, unknown> {
  return (clean(draft, schema.tv as Spec) as Record<string, unknown>) || {};
}

/** The keys the report knows streaming apps by (their Samsung ids are in the schema, for the laptop's app list). */
export const KNOWN_APPS: string[] = Object.keys(schema.knownApps);
export const KNOWN_APP_NAMES: Record<string, string> = {};
for (const k of KNOWN_APPS) KNOWN_APP_NAMES[k] = (schema.knownApps as Record<string, { name: string }>)[k].name;

/**
 * A short error code from a TV error's text ("NotFoundError: …" → "NotFoundError", our own "NotOpened" as it is);
 * anything else is just "Error". The text itself never leaves.
 */
export function errorName(error: string | undefined | null): string | undefined {
  if (!error) return undefined;
  if (/^[A-Za-z]{1,40}$/.test(error)) return error;
  const m = /^\s*([A-Za-z]{1,40})\s*:/.exec(error);
  return m ? m[1] : 'Error';
}

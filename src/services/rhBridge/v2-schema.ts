// SPDX-License-Identifier: Apache-2.0
// Manual validation of the bundled closed UB04 wire contract. No remote schemas/defaults/coercion.
import contract from './v2-contract.json';
import type * as V2 from './v2-types';
type Json = Record<string, any>;
const defs = contract.$defs as Json;
const fail = (): never => {
  throw new Error('RH_V2_SCHEMA_INVALID');
};
export function raw256(v: unknown): string {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(v) || BigInt(v) >= BigInt(1) << BigInt(256))
    return fail();
  return v;
}
export function timeMs(v: unknown): number {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(v))
    return fail();
  const year = Number(v.slice(0, 4)),
    month = Number(v.slice(5, 7)),
    day = Number(v.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
    days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(v.slice(11, 13)) > 23 ||
    Number(v.slice(14, 16)) > 59 ||
    Number(v.slice(17, 19)) > 59
  )
    return fail();
  const n = Date.parse(v);
  if (!Number.isFinite(n)) return fail();
  return n;
}
function check(v: unknown, s: Json, depth: number): void {
  if (depth > 40) return fail();
  if (s.$ref) {
    const name = s.$ref.replace('#/$defs/', '');
    if (!defs[name]) return fail();
    if (name === 'RawAmount') raw256(v);
    if (name === 'Timestamp') timeMs(v);
    return check(v, defs[name], depth + 1);
  }
  if (s.anyOf) {
    if (
      !s.anyOf.some((x: Json) => {
        try {
          check(v, x, depth + 1);
          return true;
        } catch {
          return false;
        }
      })
    )
      return fail();
  }
  if (s.enum && !s.enum.includes(v)) return fail();
  if ('const' in s && s.const !== v) return fail();
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    const matches = (t: string) =>
      t === 'null'
        ? v === null
        : t === 'array'
        ? Array.isArray(v)
        : t === 'object'
        ? !!v && typeof v === 'object' && !Array.isArray(v)
        : t === 'integer'
        ? typeof v === 'number' && Number.isSafeInteger(v)
        : typeof v === t;
    if (!types.some(matches)) return fail();
  }
  if (
    typeof v === 'string' &&
    ((s.pattern && !new RegExp(s.pattern).test(v)) ||
      (s.minLength !== undefined && v.length < s.minLength) ||
      (s.maxLength !== undefined && v.length > s.maxLength))
  )
    return fail();
  if (
    typeof v === 'number' &&
    (!Number.isFinite(v) || (s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum))
  )
    return fail();
  if (Array.isArray(v)) {
    if (
      (s.minItems !== undefined && v.length < s.minItems) ||
      (s.maxItems !== undefined && v.length > s.maxItems) ||
      v.length > 1000
    )
      return fail();
    if (s.items) v.forEach((x) => check(x, s.items, depth + 1));
  } else if (v !== null && typeof v === 'object') {
    const row = v as Json;
    if (![Object.prototype, null].includes(Object.getPrototypeOf(row))) return fail();
    if (s.required?.some((k: string) => !Object.prototype.hasOwnProperty.call(row, k))) return fail();
    for (const k of Object.keys(row)) {
      if (s.properties?.[k]) check(row[k], s.properties[k], depth + 1);
      else if (s.additionalProperties === false) return fail();
    }
  }
  if (s.allOf)
    for (const rule of s.allOf) {
      let yes = true;
      try {
        check(v, rule.if, depth + 1);
      } catch {
        yes = false;
      }
      if (yes) check(v, rule.then, depth + 1);
    }
}
export function parseV2<T>(name: string, value: unknown): T {
  if (!defs[name]) return fail();
  check(value, defs[name], 0);
  return value as T;
}
export function sameBinding(a: V2.Binding, b: V2.Binding): boolean {
  return (
    a.assetId === b.assetId &&
    a.profileSha256 === b.profileSha256 &&
    a.profileVersion === b.profileVersion &&
    a.abiVersion === b.abiVersion
  );
}
export function freshObservation(o: V2.Observation, maxAge: number, now: number): number {
  const at = timeMs(o.observedAt),
    end = timeMs(o.expiresAt);
  if (
    o.freshness !== 'FRESH' ||
    at > now + 5000 ||
    end < at ||
    end - at > maxAge ||
    now >= end ||
    !o.robinhood ||
    !o.onyx ||
    !o.ledgerObservedAt
  )
    throw new Error('RH_V2_STALE');
  if (timeMs(o.ledgerObservedAt) > now + 5000 || timeMs(o.ledgerObservedAt) < at) throw new Error('RH_V2_STALE');
  return end;
}
export function validateQuote(
  q: V2.FeeQuote,
  binding: V2.Binding,
  direction: V2.Direction,
  gross: string,
  limits: V2.Limits,
  now: number
): number {
  const end = freshObservation(q.observation, 30000, now),
    quoted = timeMs(q.quotedAt),
    expires = timeMs(q.expiresAt);
  if (
    !sameBinding(q.binding, binding) ||
    q.direction !== direction ||
    q.gross !== gross ||
    quoted > now + 5000 ||
    expires < quoted ||
    expires - quoted > 30000 ||
    expires > end ||
    now >= expires
  )
    return fail();
  const g = BigInt(gross),
    f = BigInt(q.fee),
    min = BigInt(limits.fee.minFee),
    computed = (g * BigInt(limits.fee.feeBps) + BigInt(9999)) / BigInt(10000);
  const expected = direction === 'RH_TO_ONYX' ? BigInt(0) : computed > min ? computed : min;
  if (
    g === BigInt(0) ||
    f !== expected ||
    f >= g ||
    BigInt(q.net) + f !== g ||
    q.suggestedMaxFee !== q.fee ||
    (direction === 'ONYX_TO_RH' && (q.feeBps !== limits.fee.feeBps || q.minFee !== limits.fee.minFee))
  )
    return fail();
  return expires;
}

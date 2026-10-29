// SPDX-License-Identifier: Apache-2.0
// Presentation-only balance observations. Action authority stays on the full V2 snapshot.
import { keccak256 } from 'ethers/lib/utils';
import type { ChainReader } from './chainReads';
import { readDecimals, readTokenBalance } from './chainReads';

export const BALANCE_DISPLAY_TTL_MS = 15_000;
export const GENESIS: Record<number, string> = {
  46630: '0x829a42e6d68c872aafcef3abb2123fe371138fc415dd8b44381bbbf23049dd32',
  8901: '0xdc7a820f4bc825abbfec84107c41d2f84ea9aea2e4af78af511f05e20eb18e32',
};

export interface BalanceIdentity {
  account: string;
  providerEpoch: number;
  chainId: number;
  profileSha256: string;
  assetId: string;
  kind: 'native' | 'erc20';
  token: string | null;
  decimals: number;
}

export interface BalanceClock {
  requestStartedAtMs: number;
  observedAtMs: number;
  expiresAtMs: number;
}

export type BalancePhase = 'idle' | 'disconnected' | 'loading' | 'ready' | 'refreshing' | 'stale' | 'unavailable';

export interface PresentedBalance {
  status: BalancePhase;
  identity: BalanceIdentity | null;
  valueAtomic?: string;
  clock?: BalanceClock;
  code?: string;
}

export type QualifyCode = 'GENESIS' | 'CODE' | 'DECIMALS' | 'CHAIN' | 'RPC' | 'TIMEOUT';

export type QualifyResult =
  | {
      kind: 'qualified';
      identity: BalanceIdentity;
      valueAtomic: string;
      clock: BalanceClock;
    }
  | {
      kind: 'unavailable';
      identity: BalanceIdentity;
      clock: BalanceClock;
      code: 'RPC' | 'TIMEOUT';
    }
  | {
      kind: 'mismatch';
      chainId: number;
      profileSha256: string;
      assetId: string;
      clock: BalanceClock;
      code: 'GENESIS' | 'CODE' | 'DECIMALS' | 'CHAIN';
    };

export interface MismatchLatch {
  profileSha256: string;
  epoch: number;
  code: 'REGISTRY' | 'CODE' | 'GENESIS' | 'DECIMALS' | 'PROFILE';
}

export interface BalanceChannelState {
  epoch: number;
  providerEpoch: number;
  profileSha256: string | null;
  account: string | null;
  latch: MismatchLatch | null;
  source: PresentedBalance;
  destination: PresentedBalance;
}

const emptySide = (): PresentedBalance => ({ status: 'idle', identity: null });

export function createBalanceChannel(epoch = 0): BalanceChannelState {
  return {
    epoch,
    providerEpoch: 0,
    profileSha256: null,
    account: null,
    latch: null,
    source: emptySide(),
    destination: emptySide(),
  };
}

export function isAvailabilityFailure(code: string): boolean {
  return (
    code === '503' || code === '429' || code === 'TIMEOUT' || code === 'RH_V2_HTTP' || code === 'RH_RPC_UNREACHABLE'
  );
}

export function clockFor(startedAtMs: number, observedAtMs: number, qualificationExpiresAtMs?: number): BalanceClock {
  const display = startedAtMs + BALANCE_DISPLAY_TTL_MS;
  return {
    requestStartedAtMs: startedAtMs,
    observedAtMs,
    expiresAtMs: qualificationExpiresAtMs === undefined ? display : Math.min(display, qualificationExpiresAtMs),
  };
}

export interface QualifyInput {
  reader: ChainReader;
  now: () => number;
  account: string;
  providerEpoch: number;
  chainId: number;
  profileSha256: string;
  assetId: string;
  kind: 'native' | 'erc20';
  token: string | null;
  expectedCodeKeccak256?: string;
  qualificationExpiresAtMs?: number;
}

function unavailableIdentity(input: QualifyInput, decimals = 18): BalanceIdentity {
  return {
    account: input.account.toLowerCase(),
    providerEpoch: input.providerEpoch,
    chainId: input.chainId,
    profileSha256: input.profileSha256,
    assetId: input.assetId,
    kind: input.kind,
    token: input.token ? input.token.toLowerCase() : null,
    decimals,
  };
}

export async function qualifyChainBalance(input: QualifyInput): Promise<QualifyResult> {
  const startedAtMs = input.now();
  const finish = (code?: QualifyCode, identity?: BalanceIdentity, valueAtomic?: string): QualifyResult => {
    const clock = clockFor(startedAtMs, input.now(), input.qualificationExpiresAtMs);
    if (valueAtomic !== undefined && identity) return { kind: 'qualified', identity, valueAtomic, clock };
    if (code === 'RPC' || code === 'TIMEOUT')
      return { kind: 'unavailable', identity: identity ?? unavailableIdentity(input), clock, code };
    return {
      kind: 'mismatch',
      chainId: input.chainId,
      profileSha256: input.profileSha256,
      assetId: input.assetId,
      clock,
      code: (code as 'GENESIS' | 'CODE' | 'DECIMALS' | 'CHAIN') || 'CHAIN',
    };
  };
  try {
    if (!input.reader.getChainId || !input.reader.genesisHash) return finish('CHAIN');
    const chain = input.chainId as 46630 | 8901;
    const codePromise =
      input.kind === 'erc20' && input.token && input.reader.getCode && input.expectedCodeKeccak256
        ? input.reader.getCode(chain, input.token)
        : Promise.resolve(undefined);
    const [chainId, genesis, code] = await Promise.all([
      input.reader.getChainId(chain),
      input.reader.genesisHash(chain),
      codePromise,
    ]);
    if (chainId !== input.chainId || genesis !== GENESIS[input.chainId]) return finish('GENESIS');
    let decimals = 18;
    if (input.kind === 'erc20') {
      if (!input.token || !input.reader.getCode || !input.expectedCodeKeccak256 || code === undefined)
        return finish('CODE');
      if (keccak256(code) !== input.expectedCodeKeccak256) return finish('CODE');
      decimals = await readDecimals(input.reader, chain, input.token);
      if (decimals !== 18) return finish('DECIMALS');
    }
    const identity = unavailableIdentity(input, decimals);
    const valueAtomic =
      input.kind === 'native'
        ? await input.reader.getBalance(input.chainId as 46630 | 8901, identity.account)
        : await readTokenBalance(input.reader, input.chainId as 46630 | 8901, input.token!, identity.account);
    if (!/^(0|[1-9][0-9]*)$/.test(valueAtomic)) return finish('RPC', identity);
    return finish(undefined, identity, valueAtomic);
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.message);
    return finish(timedOut ? 'TIMEOUT' : 'RPC', unavailableIdentity(input));
  }
}

export async function qualifySettled(work: Promise<QualifyResult>): Promise<QualifyResult> {
  try {
    return await work;
  } catch {
    const clock = clockFor(0, 0);
    return {
      kind: 'unavailable',
      identity: {
        account: '',
        providerEpoch: 0,
        chainId: 0,
        profileSha256: '',
        assetId: '',
        kind: 'erc20',
        token: null,
        decimals: 18,
      },
      clock,
      code: 'RPC',
    };
  }
}

interface Inflight<T> {
  cycle: number;
  startedAtMs: number;
  deadlineMs: number;
  promise: Promise<{ value: T; startedAtMs: number; deadlineMs: number }>;
}

/** Same-cycle, same-key reads share one promise and its original start. A later cycle never reuses it. */
export class SameCycleCoordinator {
  private inflight = new Map<string, Inflight<unknown>>();

  constructor(private readonly now: () => number) {}

  share<T>(
    cycle: number,
    key: string,
    ttlMs: number,
    work: () => Promise<T>
  ): Promise<{ value: T; startedAtMs: number; deadlineMs: number }> {
    const hit = this.inflight.get(key) as Inflight<T> | undefined;
    if (hit && hit.cycle === cycle) {
      if (this.now() >= hit.deadlineMs) return Promise.reject(new Error('RH_READ_DEADLINE'));
      return hit.promise;
    }
    const startedAtMs = this.now();
    const deadlineMs = startedAtMs + ttlMs;
    const promise = work().then((value) => ({ value, startedAtMs, deadlineMs }));
    this.inflight.set(key, { cycle, startedAtMs, deadlineMs, promise });
    const clear = () => {
      if (this.inflight.get(key)?.promise === promise) this.inflight.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  get size(): number {
    return this.inflight.size;
  }
}

export function acceptPublication(readCycle: number, currentCycle: number, nowMs: number, deadlineMs: number): boolean {
  return readCycle === currentCycle && nowMs < deadlineMs;
}

/** Share balance-qualification RPCs for one cycle. Gas, nonce, and receipt reads stay unshared. */
export function shareChainReader(reader: ChainReader, coordinator: SameCycleCoordinator, cycle: number): ChainReader {
  const share = <T>(key: string, work: () => Promise<T>): Promise<T> =>
    coordinator.share(cycle, key, BALANCE_DISPLAY_TTL_MS, work).then((item) => item.value);
  return {
    ...reader,
    call: (chainId, to, data) =>
      share(`call:${chainId}:${to.toLowerCase()}:${data}`, () => reader.call(chainId, to, data)),
    getBalance: (chainId, address) =>
      share(`bal:${chainId}:${address.toLowerCase()}`, () => reader.getBalance(chainId, address)),
    getCode: reader.getCode
      ? (chainId, address) => share(`code:${chainId}:${address.toLowerCase()}`, () => reader.getCode!(chainId, address))
      : undefined,
    getChainId: reader.getChainId ? (chainId) => share(`id:${chainId}`, () => reader.getChainId!(chainId)) : undefined,
    genesisHash: reader.genesisHash
      ? (chainId) => share(`genesis:${chainId}`, () => reader.genesisHash!(chainId))
      : undefined,
  };
}

export type BalanceEvent =
  | { type: 'context'; epoch: number; providerEpoch: number; account: string | null; profileSha256: string | null }
  | { type: 'loading'; side: 'source' | 'destination'; epoch: number; nowMs: number }
  | { type: 'result'; side: 'source' | 'destination'; epoch: number; result: QualifyResult; revalidated: boolean }
  | { type: 'registry-mismatch'; epoch: number; profileSha256: string; code: MismatchLatch['code'] }
  | { type: 'availability' }
  | { type: 'expire'; nowMs: number };

function sameIdentity(presented: PresentedBalance, result: QualifyResult): boolean {
  if (result.kind === 'mismatch' || !presented.identity) return false;
  const next = result.identity;
  const prev = presented.identity;
  return (
    prev.account === next.account &&
    prev.chainId === next.chainId &&
    prev.profileSha256 === next.profileSha256 &&
    prev.assetId === next.assetId &&
    prev.kind === next.kind &&
    prev.token === next.token &&
    prev.decimals === next.decimals &&
    prev.providerEpoch === next.providerEpoch
  );
}

function retain(previous: PresentedBalance, status: 'stale' | 'unavailable'): PresentedBalance {
  if (previous.valueAtomic === undefined || !previous.clock) return { ...previous, status, valueAtomic: undefined };
  return { ...previous, status, clock: previous.clock };
}

function latched(state: BalanceChannelState, profileSha256: string, epoch: number): boolean {
  return !!state.latch && state.latch.profileSha256 === profileSha256 && state.latch.epoch === epoch;
}

export function reduceBalanceChannel(state: BalanceChannelState, event: BalanceEvent): BalanceChannelState {
  if (event.type === 'availability') return state;
  if (event.type === 'context') {
    if (
      state.epoch === event.epoch &&
      state.providerEpoch === event.providerEpoch &&
      state.account === event.account &&
      state.profileSha256 === event.profileSha256
    )
      return state;
    const disconnected = !event.account;
    return {
      epoch: event.epoch,
      providerEpoch: event.providerEpoch,
      account: event.account,
      profileSha256: event.profileSha256,
      latch: null,
      source: disconnected ? { status: 'disconnected', identity: null } : { status: 'loading', identity: null },
      destination: disconnected ? { status: 'disconnected', identity: null } : { status: 'loading', identity: null },
    };
  }
  if (event.type === 'registry-mismatch') {
    if (event.epoch !== state.epoch) return state;
    return {
      ...state,
      latch: { profileSha256: event.profileSha256, epoch: event.epoch, code: event.code },
      source: { status: 'unavailable', identity: null },
      destination: { status: 'unavailable', identity: null },
    };
  }
  if (event.type === 'expire') {
    const age = (side: PresentedBalance): PresentedBalance =>
      side.clock && side.valueAtomic !== undefined && event.nowMs >= side.clock.expiresAtMs && side.status === 'ready'
        ? { ...side, status: 'stale' }
        : side;
    return { ...state, source: age(state.source), destination: age(state.destination) };
  }
  if (event.epoch !== state.epoch) return state;
  if (event.type === 'loading') {
    const current = state[event.side];
    const next: PresentedBalance =
      current.valueAtomic !== undefined && current.clock
        ? { ...current, status: event.nowMs >= current.clock.expiresAtMs ? 'stale' : 'refreshing' }
        : { status: 'loading', identity: current.identity };
    return { ...state, [event.side]: next };
  }
  const result = event.result;
  const profileSha256 = result.kind === 'mismatch' ? result.profileSha256 : result.identity.profileSha256;
  if (latched(state, profileSha256, event.epoch) && !event.revalidated) {
    return { ...state, [event.side]: { status: 'unavailable', identity: null } };
  }
  if (result.kind === 'qualified' && event.revalidated && state.latch?.epoch === event.epoch) {
    const next = { ...state, latch: null };
    return {
      ...next,
      [event.side]: {
        status: 'ready',
        identity: result.identity,
        valueAtomic: result.valueAtomic,
        clock: result.clock,
      },
    };
  }
  if (result.kind === 'qualified') {
    return {
      ...state,
      [event.side]: {
        status: 'ready',
        identity: result.identity,
        valueAtomic: result.valueAtomic,
        clock: result.clock,
      },
    };
  }
  if (result.kind === 'mismatch') {
    return {
      ...state,
      latch: {
        profileSha256: result.profileSha256,
        epoch: event.epoch,
        code: result.code === 'DECIMALS' ? 'DECIMALS' : result.code === 'GENESIS' ? 'GENESIS' : 'CODE',
      },
      [event.side]: { status: 'unavailable', identity: null },
    };
  }
  const previous = state[event.side];
  if (sameIdentity(previous, result)) return { ...state, [event.side]: retain(previous, 'unavailable') };
  return {
    ...state,
    [event.side]: { status: 'unavailable', identity: result.identity, clock: result.clock, code: result.code },
  };
}

export function contradictsAuthority(authoritative: string | undefined, displayed: string | undefined): boolean {
  if (authoritative === undefined || displayed === undefined) return false;
  return authoritative !== displayed;
}

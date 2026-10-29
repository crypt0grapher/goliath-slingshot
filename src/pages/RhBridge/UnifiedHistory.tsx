// SPDX-License-Identifier: Apache-2.0
import React, { useState } from 'react';
import styled from 'styled-components';
import type { HistoryView, RhRecord } from '../../state/rhBridge/history';
import { sameBindings } from '../../state/rhBridge/history';
import { RH_EXPLORERS, RH_LANE } from '../../config/rhBridge';
import { REVIEWED_PROFILES, legacyTslaProfile } from '../../config/rhBridge/profiles';
import type { ProfileCatalog } from '../../config/rhBridge/profiles';
import { formatUnits } from '../../services/rhBridge/lane';
import { ONYX_TESTNET_CHAIN_ID, RH_TESTNET_CHAIN_ID } from '../../constants/rhBridge';
import { laneTxUrl } from '../../services/rhBridge/explorer';

const HistorySection = styled.section`
  max-width: 560px;
  width: 100%;
  margin-top: 28px;

  @media (max-width: 720px) {
    padding-bottom: 112px;
  }
`;

const HistoryCard = styled.article`
  min-width: 0;
  padding: 20px;
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 16px;
  background: ${({ theme }) => theme.bg1};
  color: ${({ theme }) => theme.text1};
`;

const CardHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Status = styled.span<{ $delivered: boolean }>`
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
  background: ${({ $delivered, theme }) => ($delivered ? 'rgba(39, 174, 96, 0.15)' : theme.bg2)};
`;

const Route = styled.p`
  margin: 12px 0 16px;
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.text2};
`;

const Details = styled.dl`
  display: grid;
  gap: 16px;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.bg3};

  dt {
    margin-bottom: 5px;
    color: ${({ theme }) => theme.text2};
    font-size: 12px;
    line-height: 1.5;
  }

  dd {
    margin: 0;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
    direction: ltr;
    text-align: left;
  }
`;

const ExplorerLink = styled.a`
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    opacity: 0.75;
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
    border-radius: 2px;
  }
`;

function HistoryDetail({ label, value, url }: { label: string; value: string; url?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {url ? (
          <ExplorerLink
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label}: ${value} (opens explorer in a new tab)`}
          >
            {value}
          </ExplorerLink>
        ) : (
          value
        )}
        <CopyValue value={value} />
      </dd>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={`Copy ${value}`}
        onClick={() => {
          const write = navigator.clipboard?.writeText?.bind(navigator.clipboard);
          if (!write) {
            setMessage('Copy failed');
            return;
          }
          write(value).then(
            () => setMessage('Copied'),
            () => setMessage('Copy failed')
          );
        }}
      >
        Copy
      </button>
      <span role="status">{message}</span>
    </>
  );
}

function sameProfile(left: RhRecord, right: RhRecord): boolean {
  const sameRecordBindings =
    left.bindings.token === right.bindings.token &&
    left.bindings.escrow === right.bindings.escrow &&
    left.bindings.wrapper === right.bindings.wrapper &&
    left.bindings.minter === right.bindings.minter;
  if (!sameRecordBindings) return false;
  const leftProfile = left.assetBinding;
  const rightProfile = right.assetBinding;
  if (!leftProfile && !rightProfile) return true;
  return (
    !!leftProfile &&
    !!rightProfile &&
    leftProfile.profileSha256 === rightProfile.profileSha256 &&
    leftProfile.assetId === rightProfile.assetId &&
    leftProfile.profileVersion === rightProfile.profileVersion
  );
}

/** Hide an approval only when a bridge row shares its profile and a real record or hash link. */
export function provenApprovalLink(approval: RhRecord, bridge: RhRecord): boolean {
  if (approval.step !== 'APPROVE' || bridge.step !== 'BRIDGE' || !bridge.sourceTxHash) return false;
  if (approval.stage === 'DISMISSED' || bridge.stage === 'DISMISSED') return false;
  if (!sameProfile(approval, bridge)) return false;
  if (approval.id === bridge.id) return true;
  const approvalHash = (approval.sourceTxHash || approval.approveTxHash || '').toLowerCase();
  return approvalHash !== '' && approvalHash === (bridge.approveTxHash || '').toLowerCase();
}

export function visibleBridgeHistory(records: readonly RhRecord[]): RhRecord[] {
  const bridges = records.filter((record) => record.step === 'BRIDGE' && record.sourceTxHash);
  return records.filter((record) => {
    if (record.stage === 'DISMISSED') return false;
    if (record.step !== 'APPROVE') return true;
    return !bridges.some((bridge) => provenApprovalLink(record, bridge));
  });
}

export function activityAge(createdAtMs: number, nowMs: number): string {
  const elapsed = Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
  if (elapsed === 0) return 'Record started just now';
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds || !minutes) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return `Record started ${parts.join(' ')} ago`;
}

export function historyPhase(record: RhRecord): string {
  switch (record.stage) {
    case 'WALLET_PROMPT':
      return 'Waiting for the wallet';
    case 'SOURCE_PENDING':
      return record.step === 'APPROVE' ? 'Approval confirming' : 'Waiting for confirmation';
    case 'APPROVED':
      return 'Approved';
    case 'SOURCE_FINAL':
    case 'RELAY_PENDING':
      return 'Waiting for the destination';
    case 'DELIVERED':
      return 'Delivered';
    case 'HELD':
      return 'Paused';
    case 'FAILED':
      return 'Failed';
    case 'UNCERTAIN':
      return 'Check the wallet';
    case 'DISMISSED':
      return 'Dismissed';
  }
}

export function historyStatus(record: RhRecord, _etaSeconds: number | null | undefined, nowMs: number): string {
  return `${historyPhase(record)} · ${activityAge(record.createdAtMs, nowMs)}`;
}

function isLookupMiss(failure: string): boolean {
  return /\b404\b|not found|NOT_FOUND/i.test(failure);
}

export function historyRecovery(record: RhRecord): string | null {
  if (record.stage === 'UNCERTAIN') return 'Check wallet / view source transaction / refresh status';
  if (record.failure && isLookupMiss(record.failure)) return null;
  return record.failure;
}

export default function UnifiedRhHistory({
  history,
  catalog = REVIEWED_PROFILES,
  etaSeconds,
  nowMs = Date.now(),
}: {
  history: HistoryView;
  catalog?: ProfileCatalog;
  etaSeconds?: { RH_TO_ONYX: number | null; ONYX_TO_RH: number | null };
  nowMs?: number;
}) {
  const records = visibleBridgeHistory(history.records);
  if (!records.length && !history.invalidRows && history.status === 'READY') return null;
  return (
    <HistorySection aria-label="Robinhood bridge history">
      <h3 style={{ fontSize: 18, lineHeight: 1.3, margin: '0 0 16px' }}>Robinhood bridge history</h3>
      {history.status !== 'READY' && <p>Stored history is unavailable. Its bytes are preserved.</p>}
      {history.invalidRows > 0 && <p>Unrecognized stored entries are preserved.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {records.map((record) => {
          const profile = record.assetBinding
            ? catalog.recorded(record.assetBinding)
            : sameBindings(record.bindings, RH_LANE)
            ? legacyTslaProfile(catalog)
            : null;
          const eta = etaSeconds?.[record.direction];
          const outbound = record.direction === 'RH_TO_ONYX';
          const sourceChain = outbound ? RH_TESTNET_CHAIN_ID : ONYX_TESTNET_CHAIN_ID;
          const destinationChain = outbound ? ONYX_TESTNET_CHAIN_ID : RH_TESTNET_CHAIN_ID;
          const sourceName = outbound ? 'Robinhood' : 'Onyx';
          const destinationName = outbound ? 'Onyx' : 'Robinhood';
          return (
            <HistoryCard key={record.id}>
              <CardHeader>
                <h4
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    margin: 0,
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                  }}
                >
                  {profile ? formatUnits(record.grossRaw, profile.descriptor.decimals) : record.grossRaw}{' '}
                  {profile?.descriptor.symbol ?? 'Unrecognized profile (raw units)'}
                </h4>
                <Status $delivered={record.stage === 'DELIVERED'}>{historyStatus(record, eta, nowMs)}</Status>
              </CardHeader>
              <Route>
                {sourceName} → {destinationName} · Robinhood-backed
              </Route>
              <Details>
                <HistoryDetail
                  label={`Sender · ${sourceName}`}
                  value={record.account}
                  url={`${RH_EXPLORERS[sourceChain]}/address/${record.account}`}
                />
                <HistoryDetail
                  label={`Recipient · ${destinationName}`}
                  value={record.recipient}
                  url={`${RH_EXPLORERS[destinationChain]}/address/${record.recipient}`}
                />
                {record.sourceTxHash && (
                  <HistoryDetail
                    label={`Source transaction · ${sourceName}`}
                    value={record.sourceTxHash}
                    url={laneTxUrl(sourceChain, record.sourceTxHash)}
                  />
                )}
                {record.destinationTxHash && (
                  <HistoryDetail
                    label={`Destination transaction · ${destinationName}`}
                    value={record.destinationTxHash}
                    url={laneTxUrl(destinationChain, record.destinationTxHash)}
                  />
                )}
              </Details>
              {historyRecovery(record) && (
                <p style={{ fontSize: 13, lineHeight: 1.45, margin: '4px 0 0' }}>{historyRecovery(record)}</p>
              )}
            </HistoryCard>
          );
        })}
      </div>
    </HistorySection>
  );
}

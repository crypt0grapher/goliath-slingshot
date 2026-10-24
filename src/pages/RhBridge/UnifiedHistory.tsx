// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import type { RhLaneController } from '../../hooks/rhBridge/controller';
import type { HistoryView } from '../../state/rhBridge/history';
import { sameBindings } from '../../state/rhBridge/history';
import { RH_LANE } from '../../config/rhBridge';
import { REVIEWED_PROFILES, legacyTslaProfile } from '../../config/rhBridge/profiles';
import type { ProfileCatalog } from '../../config/rhBridge/profiles';
import { walletActionBusy } from '../../hooks/bridge/walletIntent';
import { formatUnits } from '../../services/rhBridge/lane';
export default function UnifiedRhHistory({
  controller,
  history,
  catalog = REVIEWED_PROFILES,
}: {
  controller: RhLaneController;
  history: HistoryView;
  catalog?: ProfileCatalog;
}) {
  if (!history.records.length && !history.invalidRows && history.status === 'READY') return null;
  return (
    <section aria-label="Robinhood bridge history" style={{ maxWidth: 560, width: '100%', marginTop: 20 }}>
      <h3>Robinhood bridge history</h3>
      {history.status !== 'READY' && <p>Stored history is unavailable. Its bytes are preserved.</p>}
      {history.invalidRows > 0 && <p>Unrecognized stored entries are preserved.</p>}
      {history.records.map((record) => {
        const profile = record.assetBinding
          ? catalog.recorded(record.assetBinding)
          : sameBindings(record.bindings, RH_LANE)
          ? legacyTslaProfile(catalog)
          : null;
        return (
          <article key={record.id}>
            <p>
              {profile ? formatUnits(record.grossRaw, profile.descriptor.decimals) : record.grossRaw}{' '}
              {profile?.descriptor.symbol ?? 'Unrecognized profile (raw units)'} · Robinhood-backed ·{' '}
              {record.direction === 'RH_TO_ONYX' ? 'Robinhood → Onyx' : 'Onyx → Robinhood'} · {record.stage}
            </p>
            <p style={{ overflowWrap: 'anywhere' }}>
              Sender: {record.account} · Recipient: {record.recipient}
            </p>
            {record.sourceTxHash && <p style={{ overflowWrap: 'anywhere' }}>{record.sourceTxHash}</p>}
            {record.destinationTxHash && <p style={{ overflowWrap: 'anywhere' }}>{record.destinationTxHash}</p>}
            {record.failure && <p>{record.failure}</p>}
            {controller.canDismiss(record) && (
              <button type="button" disabled={walletActionBusy()} onClick={() => controller.dismiss(record.id)}>
                Dismiss record
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

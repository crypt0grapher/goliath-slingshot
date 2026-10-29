// SPDX-License-Identifier: Apache-2.0
// Compatibility import only. The dedicated execution page is retired.
import React from 'react';
import CompatibilityRedirect from './CompatibilityRedirect';
export { RhBridgeEntryLink } from './EntryLink';
export default function RhBridgePage({ enabled = true }: { enabled?: boolean }) {
  return enabled ? <CompatibilityRedirect /> : null;
}

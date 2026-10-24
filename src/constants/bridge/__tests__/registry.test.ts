// SPDX-License-Identifier: Apache-2.0
import { BridgeNetwork } from '../networks';
import { BRIDGE_ROUTES, routeFor, normalizeBridgeSelection, DEFAULT_BRIDGE_SELECTION } from '../registry';
import { getTokenConfigForChain } from '../tokens';
import { getBridgeContractAddress } from '../contracts';
import reducer, { bridgeActions } from '../../../state/bridge/reducer';

test('exactly four supported directed pairs, with origin-qualified pair assets', () => {
  expect(BRIDGE_ROUTES.map((r) => [r.source, r.destination])).toEqual([
    ['SEPOLIA', 'GOLIATH'],
    ['GOLIATH', 'SEPOLIA'],
    ['ROBINHOOD', 'GOLIATH'],
    ['GOLIATH', 'ROBINHOOD'],
  ]);
  expect(routeFor(BridgeNetwork.GOLIATH, BridgeNetwork.ROBINHOOD)?.assets).toEqual(['TSLA', 'RH_ETH']);
  expect(routeFor(BridgeNetwork.GOLIATH, BridgeNetwork.SEPOLIA)?.assets).toEqual(['SEPOLIA_ETH', 'SEPOLIA_XCN']);
  expect(routeFor(BridgeNetwork.SEPOLIA, BridgeNetwork.ROBINHOOD)).toBeUndefined();
  expect(routeFor(BridgeNetwork.ROBINHOOD, BridgeNetwork.SEPOLIA)).toBeUndefined();
  expect(routeFor(BridgeNetwork.GOLIATH, BridgeNetwork.GOLIATH)).toBeUndefined();
});
test.each([
  null,
  {},
  { originNetwork: 'ROBINHOOD', destinationNetwork: 'SEPOLIA', selectedAssetKey: 'RH_ETH' },
  { originNetwork: 'GOLIATH', destinationNetwork: 'ROBINHOOD', selectedAssetKey: 'SEPOLIA_ETH' },
  { originNetwork: 1, destinationNetwork: 327, selectedAssetKey: 'ETH' },
  { originNetwork: 'SEPOLIA', destinationNetwork: 'GOLIATH', selectedAssetKey: 'SEPOLIA_USDC' },
])('malformed/forbidden persisted selection fails to safe default: %p', (input) => {
  expect(normalizeBridgeSelection(input)).toEqual(DEFAULT_BRIDGE_SELECTION);
});
test('old binary form hydrates to exact legacy ETH without adopting RH ETH', () => {
  expect(
    normalizeBridgeSelection({
      originNetwork: 'GOLIATH',
      destinationNetwork: 'SEPOLIA',
      selectedToken: 'ETH',
      inputAmount: '0.01',
    })
  ).toMatchObject({
    originNetwork: 'GOLIATH',
    destinationNetwork: 'SEPOLIA',
    selectedAssetKey: 'SEPOLIA_ETH',
    inputAmount: '0.01',
  });
});
test('atomic pair/token transitions preserve backing on reversal and invalidate confirmation', () => {
  let s = reducer(undefined, { type: '@@init' });
  s = reducer(s, bridgeActions.setInputAmount('0.01'));
  s = reducer(s, bridgeActions.openConfirmModal());
  s = reducer(s, bridgeActions.setOriginNetwork(BridgeNetwork.ROBINHOOD));
  expect(s.form).toMatchObject({
    originNetwork: 'ROBINHOOD',
    destinationNetwork: 'GOLIATH',
    selectedAssetKey: 'TSLA',
    inputAmount: '',
  });
  expect(s.isConfirmModalOpen).toBe(false);
  s = reducer(s, bridgeActions.setSelectedAsset('RH_ETH'));
  s = reducer(s, bridgeActions.swapDirection());
  expect(s.form).toMatchObject({
    originNetwork: 'GOLIATH',
    destinationNetwork: 'ROBINHOOD',
    selectedAssetKey: 'RH_ETH',
  });
  s = reducer(s, bridgeActions.setDestinationNetwork(BridgeNetwork.SEPOLIA));
  expect(s.form.selectedAssetKey).toBe('SEPOLIA_ETH');
  s = reducer(s, bridgeActions.setSelectedAsset('RH_ETH'));
  expect(s.form.selectedAssetKey).toBe('SEPOLIA_ETH');
});
test('legacy token/contract lookup refuses RH rather than treating it as Onyx', () => {
  expect(() => getTokenConfigForChain('ETH', BridgeNetwork.ROBINHOOD)).toThrow('LEGACY_BRIDGE_NETWORK_REQUIRED');
  expect(() => getBridgeContractAddress(BridgeNetwork.ROBINHOOD)).toThrow('LEGACY_BRIDGE_NETWORK_REQUIRED');
});

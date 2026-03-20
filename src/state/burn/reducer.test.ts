import { createStore, Store } from 'redux';

import { Field, resetBurnState, typeInput } from './actions';
import reducer, { BurnState } from './reducer';

describe('burn reducer', () => {
  let store: Store<BurnState>;

  beforeEach(() => {
    store = createStore(reducer, {
      independentField: Field.LIQUIDITY_PERCENT,
      typedValue: '0',
    });
  });

  it('typeInput sets independentField and typedValue', () => {
    store.dispatch(typeInput({ field: Field.LIQUIDITY_PERCENT, typedValue: '50' }));
    expect(store.getState()).toEqual({ independentField: Field.LIQUIDITY_PERCENT, typedValue: '50' });
  });

  it('typeInput handles different fields', () => {
    store.dispatch(typeInput({ field: Field.CURRENCY_A, typedValue: '100' }));
    expect(store.getState().independentField).toEqual(Field.CURRENCY_A);
  });

  it('resetBurnState returns initial state', () => {
    store.dispatch(typeInput({ field: Field.LIQUIDITY_PERCENT, typedValue: '75' }));
    store.dispatch(resetBurnState());
    expect(store.getState()).toEqual({ independentField: Field.LIQUIDITY_PERCENT, typedValue: '0' });
  });
});

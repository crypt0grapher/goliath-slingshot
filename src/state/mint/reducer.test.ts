import { createStore, Store } from 'redux';

import { Field, resetMintState, typeInput } from './actions';
import reducer, { MintState } from './reducer';

describe('mint reducer', () => {
  let store: Store<MintState>;

  beforeEach(() => {
    store = createStore(reducer, {
      independentField: Field.CURRENCY_A,
      typedValue: '',
      otherTypedValue: '',
    });
  });

  describe('typeInput', () => {
    it('sets typed value', () => {
      store.dispatch(typeInput({ field: Field.CURRENCY_A, typedValue: '1.0', noLiquidity: false }));
      expect(store.getState()).toEqual({ independentField: Field.CURRENCY_A, typedValue: '1.0', otherTypedValue: '' });
    });
    it('clears other value', () => {
      store.dispatch(typeInput({ field: Field.CURRENCY_A, typedValue: '1.0', noLiquidity: false }));
      store.dispatch(typeInput({ field: Field.CURRENCY_B, typedValue: '1.0', noLiquidity: false }));
      expect(store.getState()).toEqual({ independentField: Field.CURRENCY_B, typedValue: '1.0', otherTypedValue: '' });
    });
  });

  describe('resetMintState', () => {
    it('clears state after normal (with-liquidity) entry', () => {
      store.dispatch(typeInput({ field: Field.CURRENCY_A, typedValue: '100', noLiquidity: false }));
      store.dispatch(resetMintState());
      expect(store.getState()).toEqual({ independentField: Field.CURRENCY_A, typedValue: '', otherTypedValue: '' });
    });
    it('clears both typedValue and otherTypedValue after no-liquidity two-field entry', () => {
      store.dispatch(typeInput({ field: Field.CURRENCY_A, typedValue: '50', noLiquidity: true }));
      store.dispatch(typeInput({ field: Field.CURRENCY_B, typedValue: '100', noLiquidity: true }));
      expect(store.getState().otherTypedValue).toBe('50');
      store.dispatch(resetMintState());
      expect(store.getState()).toEqual({ independentField: Field.CURRENCY_A, typedValue: '', otherTypedValue: '' });
    });
  });
});

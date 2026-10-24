import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { BridgeState, BridgeFormState, BridgeOperation, BridgeNetwork, BridgeTokenSymbol, BridgeStatus } from './types';
import type { BridgeAssetKey } from '../../constants/bridge/registry';
import {
  DEFAULT_BRIDGE_SELECTION,
  normalizeBridgeSelection,
  changeBridgePair,
  legacyAssetKey,
  routeFor,
} from '../../constants/bridge/registry';

const initialFormState: BridgeFormState = DEFAULT_BRIDGE_SELECTION;

const initialState: BridgeState = {
  form: initialFormState,
  operations: {},
  operationIds: [],
  activeOperationId: null,
  isConfirmModalOpen: false,
  isStatusModalOpen: false,
  isSubmitting: false,
  isApproving: false,
  error: null,
  pollingError: null,
};

const bridgeSlice = createSlice({
  name: 'bridge',
  initialState,
  reducers: {
    // ========================================
    // Form Actions
    // ========================================
    setOriginNetwork(state, action: PayloadAction<BridgeNetwork>) {
      const form = normalizeBridgeSelection(state.form);
      let destination = form.destinationNetwork;
      if (destination === action.payload) destination = form.originNetwork;
      if (!routeFor(action.payload, destination))
        destination = action.payload === BridgeNetwork.GOLIATH ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;
      state.form = changeBridgePair(form, action.payload, destination);
      state.isConfirmModalOpen = false;
      state.error = null;
    },
    setDestinationNetwork(state, action: PayloadAction<BridgeNetwork>) {
      state.form = changeBridgePair(normalizeBridgeSelection(state.form), state.form.originNetwork, action.payload);
      state.isConfirmModalOpen = false;
      state.error = null;
    },
    hydrateForm(state, action: PayloadAction<BridgeFormState>) {
      state.form = normalizeBridgeSelection(action.payload);
      state.isConfirmModalOpen = false;
    },

    swapDirection(state) {
      const form = normalizeBridgeSelection(state.form);
      state.form = changeBridgePair(form, form.destinationNetwork, form.originNetwork);
      state.isConfirmModalOpen = false;
      state.error = null;
    },

    setSelectedToken(state, action: PayloadAction<BridgeTokenSymbol>) {
      const key = legacyAssetKey(action.payload);
      if (key && routeFor(state.form.originNetwork, state.form.destinationNetwork)?.assets.includes(key)) {
        state.form.selectedAssetKey = key;
        state.form.inputAmount = '';
      }
      state.isConfirmModalOpen = false;
      state.error = null;
    },
    setSelectedAsset(state, action: PayloadAction<BridgeAssetKey>) {
      if (routeFor(state.form.originNetwork, state.form.destinationNetwork)?.assets.includes(action.payload)) {
        state.form.selectedAssetKey = action.payload;
        state.form.inputAmount = '';
      }
      state.isConfirmModalOpen = false;
      state.error = null;
    },

    setInputAmount(state, action: PayloadAction<string>) {
      state.form.inputAmount = action.payload;
      state.isConfirmModalOpen = false;
      state.error = null;
    },

    setRecipient(state, action: PayloadAction<string | null>) {
      state.form.recipient = action.payload;
      state.isConfirmModalOpen = false;
    },

    resetForm(state) {
      state.form = initialFormState;
      state.error = null;
    },

    // ========================================
    // Operation Actions
    // ========================================
    addOperation(state, action: PayloadAction<BridgeOperation>) {
      const op = action.payload;
      state.operations[op.id] = op;
      state.operationIds.unshift(op.id); // Add to beginning (newest first)
      state.activeOperationId = op.id;
    },

    updateOperation(state, action: PayloadAction<{ id: string; updates: Partial<BridgeOperation> }>) {
      const { id, updates } = action.payload;
      if (state.operations[id]) {
        state.operations[id] = {
          ...state.operations[id],
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },

    updateOperationStatus(
      state,
      action: PayloadAction<{
        id: string;
        status: BridgeStatus;
        originConfirmations?: number;
        destinationTxHash?: string;
        errorMessage?: string;
        estimatedCompletionTime?: string;
      }>
    ) {
      const { id, ...updates } = action.payload;
      if (state.operations[id]) {
        state.operations[id] = {
          ...state.operations[id],
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },

    removeOperation(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.operations[id];
      state.operationIds = state.operationIds.filter((opId) => opId !== id);
      if (state.activeOperationId === id) {
        state.activeOperationId = null;
      }
    },

    setActiveOperationId(state, action: PayloadAction<string | null>) {
      state.activeOperationId = action.payload;
    },

    // Load operations from localStorage
    loadOperations(
      state,
      action: PayloadAction<{
        operations: Record<string, BridgeOperation>;
        operationIds: string[];
      }>
    ) {
      state.operations = action.payload.operations;
      state.operationIds = action.payload.operationIds;
    },

    // ========================================
    // Modal Actions
    // ========================================
    openConfirmModal(state) {
      state.isConfirmModalOpen = true;
    },

    closeConfirmModal(state) {
      state.isConfirmModalOpen = false;
    },

    openStatusModal(state, action: PayloadAction<string>) {
      state.activeOperationId = action.payload;
      state.isStatusModalOpen = true;
    },

    closeStatusModal(state) {
      state.isStatusModalOpen = false;
    },

    // ========================================
    // Loading States
    // ========================================
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },

    setApproving(state, action: PayloadAction<boolean>) {
      state.isApproving = action.payload;
    },

    // ========================================
    // Error Handling
    // ========================================
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    clearError(state) {
      state.error = null;
    },

    setPollingError(state, action: PayloadAction<string | null>) {
      state.pollingError = action.payload;
    },

    clearPollingError(state) {
      state.pollingError = null;
    },
  },
});

export const bridgeActions = bridgeSlice.actions;
export default bridgeSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  BridgeState,
  BridgeFormState,
  BridgeOperation,
  BridgeNetwork,
  BridgeTokenSymbol,
  BridgeStatus,
} from './types';
import { DEFAULT_BRIDGE_TOKEN } from '../../constants/bridge/tokens';

const initialFormState: BridgeFormState = {
  originNetwork: BridgeNetwork.SEPOLIA,
  destinationNetwork: BridgeNetwork.GOLIATH,
  selectedToken: DEFAULT_BRIDGE_TOKEN,
  inputAmount: '',
  recipient: null,
};

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
};

const bridgeSlice = createSlice({
  name: 'bridge',
  initialState,
  reducers: {
    // ========================================
    // Form Actions
    // ========================================
    setOriginNetwork(state, action: PayloadAction<BridgeNetwork>) {
      state.form.originNetwork = action.payload;
      state.form.destinationNetwork =
        action.payload === BridgeNetwork.SEPOLIA ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;
      state.error = null;
    },

    swapDirection(state) {
      const temp = state.form.originNetwork;
      state.form.originNetwork = state.form.destinationNetwork;
      state.form.destinationNetwork = temp;
      state.error = null;
    },

    setSelectedToken(state, action: PayloadAction<BridgeTokenSymbol>) {
      state.form.selectedToken = action.payload;
      state.error = null;
    },

    setInputAmount(state, action: PayloadAction<string>) {
      state.form.inputAmount = action.payload;
      state.error = null;
    },

    setRecipient(state, action: PayloadAction<string | null>) {
      state.form.recipient = action.payload;
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

    updateOperation(
      state,
      action: PayloadAction<{ id: string; updates: Partial<BridgeOperation> }>
    ) {
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
  },
});

export const bridgeActions = bridgeSlice.actions;
export default bridgeSlice.reducer;

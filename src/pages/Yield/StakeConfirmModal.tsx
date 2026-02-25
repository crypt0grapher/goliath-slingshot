import React from 'react';
import TransactionConfirmationModal, {
  TransactionErrorContent,
} from '../../components/TransactionConfirmationModal';

interface StakeConfirmModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  attemptingTxn: boolean;
  txHash: string | undefined;
  pendingText: string;
  errorMessage: string | undefined;
}

export default function StakeConfirmModal({
  isOpen,
  onDismiss,
  attemptingTxn,
  txHash,
  pendingText,
  errorMessage,
}: StakeConfirmModalProps) {
  return (
    <TransactionConfirmationModal
      isOpen={isOpen}
      onDismiss={onDismiss}
      attemptingTxn={attemptingTxn}
      hash={txHash}
      pendingText={pendingText}
      content={() =>
        errorMessage ? <TransactionErrorContent message={errorMessage} onDismiss={onDismiss} /> : <div />
      }
    />
  );
}

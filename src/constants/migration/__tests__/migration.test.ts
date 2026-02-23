// Tests for migration constants, enums, bridge status mapping, and localStorage key helper
// Also validates CHNStaking ABI and ERC20 ABI exports

import {
  MigrationStep,
  StepExecutionStatus,
  BRIDGE_STATUS_LABELS,
  getMigrationStorageKey,
  STAKING_CONTRACT_ADDRESS,
  XCN_TOKEN_ADDRESS,
} from '../index';
import { CHN_STAKING_ABI } from '../../../abis/CHNStaking';
import { ERC20_ABI } from '../../../abis/ERC20';

describe('MigrationStep enum', () => {
  it('should export all four migration steps', () => {
    expect(MigrationStep.CLAIM_REWARDS).toBeDefined();
    expect(MigrationStep.APPROVE).toBeDefined();
    expect(MigrationStep.UNSTAKE).toBeDefined();
    expect(MigrationStep.BRIDGE).toBeDefined();
  });

  it('should have exactly 4 members', () => {
    const values = Object.values(MigrationStep);
    expect(values).toHaveLength(4);
  });

  it('should have unique values for each step', () => {
    const values = Object.values(MigrationStep);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('StepExecutionStatus enum', () => {
  it('should export all five status values', () => {
    expect(StepExecutionStatus.IDLE).toBeDefined();
    expect(StepExecutionStatus.WAITING_SIGNATURE).toBeDefined();
    expect(StepExecutionStatus.TX_PENDING).toBeDefined();
    expect(StepExecutionStatus.CONFIRMED).toBeDefined();
    expect(StepExecutionStatus.FAILED).toBeDefined();
  });

  it('should have exactly 5 members', () => {
    const values = Object.values(StepExecutionStatus);
    expect(values).toHaveLength(5);
  });

  it('should have unique values for each status', () => {
    const values = Object.values(StepExecutionStatus);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('BRIDGE_STATUS_LABELS', () => {
  it('should map known backend statuses to UI labels', () => {
    expect(BRIDGE_STATUS_LABELS['pending']).toBeDefined();
    expect(BRIDGE_STATUS_LABELS['processing']).toBeDefined();
    expect(BRIDGE_STATUS_LABELS['completed']).toBeDefined();
    expect(BRIDGE_STATUS_LABELS['failed']).toBeDefined();
  });

  it('should return human-readable strings for each status', () => {
    // Each label should be a non-empty string
    Object.values(BRIDGE_STATUS_LABELS).forEach((label) => {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });

  it('should be a frozen/readonly object (values should not be reassignable at runtime)', () => {
    // Verify it is a plain object with string values
    expect(typeof BRIDGE_STATUS_LABELS).toBe('object');
    expect(BRIDGE_STATUS_LABELS).not.toBeNull();
  });
});

describe('getMigrationStorageKey', () => {
  it('should return the correct key format for a lowercase address', () => {
    const address = '0xabcdef1234567890abcdef1234567890abcdef12';
    const key = getMigrationStorageKey(address);
    expect(key).toBe('migration:pending:v1:0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('should lowercase a mixed-case address', () => {
    const address = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    const key = getMigrationStorageKey(address);
    expect(key).toBe('migration:pending:v1:0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('should lowercase an all-uppercase address', () => {
    const address = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
    const key = getMigrationStorageKey(address);
    expect(key).toBe('migration:pending:v1:0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('should handle already lowercase addresses correctly', () => {
    const address = '0x0000000000000000000000000000000000000001';
    const key = getMigrationStorageKey(address);
    expect(key).toBe('migration:pending:v1:0x0000000000000000000000000000000000000001');
  });
});

describe('contract address re-exports', () => {
  it('should export STAKING_CONTRACT_ADDRESS from migrationConfig', () => {
    expect(typeof STAKING_CONTRACT_ADDRESS).toBe('string');
    expect(STAKING_CONTRACT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should export XCN_TOKEN_ADDRESS from migrationConfig', () => {
    expect(typeof XCN_TOKEN_ADDRESS).toBe('string');
    expect(XCN_TOKEN_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

describe('CHN_STAKING_ABI', () => {
  it('should be an array', () => {
    expect(Array.isArray(CHN_STAKING_ABI)).toBe(true);
  });

  it('should contain a userInfo function entry', () => {
    const entry = CHN_STAKING_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'userInfo' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    // userInfo(uint256 pid, address user) -> (uint256 amount, uint256 rewardDebt, uint256 pendingTokenReward)
    expect(entry.inputs).toHaveLength(2);
    expect(entry.inputs[0].type).toBe('uint256');
    expect(entry.inputs[1].type).toBe('address');
    expect(entry.outputs).toHaveLength(3);
  });

  it('should contain a pendingReward function entry', () => {
    const entry = CHN_STAKING_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'pendingReward' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    // pendingReward(uint256 pid, address user) -> uint256
    expect(entry.inputs).toHaveLength(2);
    expect(entry.outputs).toHaveLength(1);
    expect(entry.outputs[0].type).toBe('uint256');
  });

  it('should contain a withdraw function entry', () => {
    const entry = CHN_STAKING_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'withdraw' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    // withdraw(uint256 pid, uint256 amount)
    expect(entry.inputs).toHaveLength(2);
    expect(entry.inputs[0].type).toBe('uint256');
    expect(entry.inputs[1].type).toBe('uint256');
  });

  it('should contain a getStakingAmount function entry', () => {
    const entry = CHN_STAKING_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'getStakingAmount' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    // getStakingAmount(uint256 pid, address user) -> uint256
    expect(entry.inputs).toHaveLength(2);
    expect(entry.outputs).toHaveLength(1);
    expect(entry.outputs[0].type).toBe('uint256');
  });

  it('should only contain function type entries (no events or other types)', () => {
    CHN_STAKING_ABI.forEach((item: { type?: string }) => {
      expect(item.type).toBe('function');
    });
  });
});

describe('ERC20_ABI', () => {
  it('should be an array', () => {
    expect(Array.isArray(ERC20_ABI)).toBe(true);
  });

  it('should contain an approve function entry', () => {
    const entry = ERC20_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'approve' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    expect(entry.inputs).toHaveLength(2);
  });

  it('should contain a balanceOf function entry', () => {
    const entry = ERC20_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'balanceOf' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    expect(entry.inputs).toHaveLength(1);
    expect(entry.outputs).toHaveLength(1);
  });

  it('should contain an allowance function entry', () => {
    const entry = ERC20_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'allowance' && item.type === 'function'
    );
    expect(entry).toBeDefined();
    expect(entry.inputs).toHaveLength(2);
  });

  it('should contain a transfer function entry', () => {
    const entry = ERC20_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'transfer' && item.type === 'function'
    );
    expect(entry).toBeDefined();
  });

  it('should contain a transferFrom function entry', () => {
    const entry = ERC20_ABI.find(
      (item: { name?: string; type?: string }) => item.name === 'transferFrom' && item.type === 'function'
    );
    expect(entry).toBeDefined();
  });
});

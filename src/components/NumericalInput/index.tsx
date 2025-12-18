import React, { useMemo } from 'react';
import styled from 'styled-components';
import { escapeRegExp } from '../../utils';
import { sanitizeInputValue, isValidInputValue, DUST_THRESHOLD } from '../../utils/safeAmountFormatting';

const StyledInput = styled.input<{ error?: boolean; fontSize?: string; align?: string }>`
  color: ${({ error, theme }) => (error ? theme.red1 : theme.text1)};
  width: 0;
  position: relative;
  font-weight: 500;
  outline: none;
  border: none;
  flex: 1 1 auto;
  background-color: ${({ theme }) => theme.bg1};
  font-size: ${({ fontSize }) => fontSize ?? '24px'};
  text-align: ${({ align }) => align && align};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0px;
  -webkit-appearance: textfield;

  ::-webkit-search-decoration {
    -webkit-appearance: none;
  }

  [type='number'] {
    -moz-appearance: textfield;
  }

  ::-webkit-outer-spin-button,
  ::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }

  ::placeholder {
    color: ${({ theme }) => theme.text4};
  }
`;

const inputRegex = RegExp(`^\\d*(?:\\\\[.])?\\d*$`); // match escaped "." characters via in a non-capturing group

/**
 * Maximum number of decimal places allowed in input
 * This prevents extremely long strings that could cause rendering issues
 */
const MAX_DECIMALS = 18;

/**
 * Sanitizes the display value to prevent rendering issues
 * - Handles scientific notation (e.g., 1e-13)
 * - Truncates extremely long decimal strings
 * - Returns '0' for dust amounts
 */
function sanitizeDisplayValue(value: string | number): string {
  if (value === '' || value === undefined || value === null) {
    return '';
  }

  const strValue = String(value);

  // Handle scientific notation
  if (strValue.includes('e') || strValue.includes('E')) {
    const numValue = parseFloat(strValue);
    if (!isFinite(numValue) || isNaN(numValue)) {
      return '0';
    }
    // Dust amounts should display as 0
    if (numValue > 0 && numValue < DUST_THRESHOLD) {
      return '0';
    }
    // Convert from scientific to decimal notation
    return sanitizeInputValue(strValue, MAX_DECIMALS);
  }

  // Truncate overly long decimal strings
  const parts = strValue.split('.');
  if (parts.length === 2 && parts[1].length > MAX_DECIMALS) {
    return `${parts[0]}.${parts[1].substring(0, MAX_DECIMALS)}`;
  }

  return strValue;
}

export const Input = React.memo(function InnerInput({
  value,
  onUserInput,
  placeholder,
  ...rest
}: {
  value: string | number;
  onUserInput: (input: string) => void;
  error?: boolean;
  fontSize?: string;
  align?: 'right' | 'left';
} & Omit<React.HTMLProps<HTMLInputElement>, 'ref' | 'onChange' | 'as'>) {
  // Sanitize the value prop to prevent rendering issues with edge case values
  const safeValue = useMemo(() => {
    try {
      return sanitizeDisplayValue(value);
    } catch (error) {
      console.warn('NumericalInput: Failed to sanitize value', value, error);
      return '';
    }
  }, [value]);

  const enforcer = (nextUserInput: string) => {
    // Handle empty input
    if (nextUserInput === '') {
      onUserInput('');
      return;
    }

    // Validate and sanitize the input
    const sanitized = sanitizeInputValue(nextUserInput, MAX_DECIMALS);

    // Check if the sanitized value is valid
    if (!isValidInputValue(sanitized)) {
      // If the value is scientific notation or otherwise invalid,
      // convert it to a safe decimal format
      const numValue = parseFloat(sanitized);
      if (!isFinite(numValue) || isNaN(numValue)) {
        return; // Reject completely invalid input
      }
      // Handle dust amounts
      if (numValue > 0 && numValue < DUST_THRESHOLD) {
        onUserInput('0');
        return;
      }
    }

    // Apply the standard regex check on the sanitized value
    if (inputRegex.test(escapeRegExp(sanitized))) {
      onUserInput(sanitized);
    }
  };

  return (
    <StyledInput
      {...rest}
      value={safeValue}
      onChange={(event) => enforcer(event.target.value.replace(/,/g, '.'))}
      // universal input options
      inputMode="decimal"
      title="Token Amount"
      autoComplete="off"
      autoCorrect="off"
      // text-specific options
      type="text"
      pattern="^[0-9]*[.,]?[0-9]*$"
      placeholder={placeholder || '0.0'}
      minLength={1}
      maxLength={79}
      spellCheck="false"
    />
  );
});

export default Input;

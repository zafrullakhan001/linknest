/**
 * Password rules: at least 8 characters, 1 uppercase, 1 number, 1 special character.
 */
const MIN_LENGTH = 8;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_NUMBER = /[0-9]/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < MIN_LENGTH) {
    errors.push(`At least ${MIN_LENGTH} characters`);
  }
  if (!HAS_UPPER.test(password)) {
    errors.push('At least one uppercase letter');
  }
  if (!HAS_NUMBER.test(password)) {
    errors.push('At least one number');
  }
  if (!HAS_SPECIAL.test(password)) {
    errors.push('At least one special character (!@#$%^&* etc.)');
  }
  return {
    valid: errors.length === 0,
    message: errors.length === 0 ? undefined : errors.join(', '),
    errors,
  };
}

export const PASSWORD_RULE_TEXT = `At least ${MIN_LENGTH} characters, 1 uppercase, 1 number, 1 special character (!@#$%^&* etc.)`;

export interface PasswordCriteria {
  length: boolean;
  upper: boolean;
  number: boolean;
  special: boolean;
}

/** Per-rule status for live UI feedback as the user types */
export function getPasswordCriteria(password: string): PasswordCriteria {
  return {
    length: password.length >= MIN_LENGTH,
    upper: HAS_UPPER.test(password),
    number: HAS_NUMBER.test(password),
    special: HAS_SPECIAL.test(password),
  };
}

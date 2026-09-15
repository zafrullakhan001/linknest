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

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const NUMBERS = '23456789';
const SPECIAL = '!@#$%^&*_+-=';
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SPECIAL;

function randomInt(max: number): number {
  if (max <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pickChar(set: string): string {
  return set.charAt(randomInt(set.length));
}

/**
 * Cryptographically random password that always satisfies validatePassword().
 */
export function generateStrongPassword(length = 16): string {
  const size = Math.max(length, MIN_LENGTH);
  const chars: string[] = [
    pickChar(UPPERCASE),
    pickChar(LOWERCASE),
    pickChar(NUMBERS),
    pickChar(SPECIAL),
  ];
  while (chars.length < size) {
    chars.push(pickChar(ALL_CHARS));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

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

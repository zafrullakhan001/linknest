import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';

/** Generate a RFC 4122 UUID v4 string. */
export function generateUuid(): string {
  return uuidv4();
}

/** Return true if value is a valid UUID v4. */
export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidValidate(value) && uuidVersion(value) === 4;
}

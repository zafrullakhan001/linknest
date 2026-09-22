/**
 * Helpers for showing a person's full name next to their login id.
 *
 * Shared by the space editor / share pickers so LDAP (and SAML) accounts are
 * identifiable by their directory display name instead of the raw login id.
 * Mirrors the name rules already used in ChatWidget: display_name → name derived
 * from the email local part → username.
 */

export type PersonNameFields = {
  username?: string | null;
  email?: string | null;
  display_name?: string | null;
};

const titleCaseToken = (token: string): string => {
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

/** First / last name guessed from the email local part (jane.doe@x.com → Jane Doe). */
export const nameFromEmail = (email?: string | null): string => {
  if (!email || !email.includes('@')) return '';
  const local = email.split('@')[0].trim();
  if (!local) return '';
  const parts = local.split(/[._+\-]+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(titleCaseToken).join(' ');
};

/** Best available full name for a user (directory display name first). */
export const getUserDisplayName = (person?: PersonNameFields | null): string => {
  const display = person?.display_name?.trim();
  if (display) return display;
  const fromEmail = nameFromEmail(person?.email);
  if (fromEmail) return fromEmail;
  return person?.username?.trim() || 'Unknown';
};

/** Login id, unless it is already the label we would show as the name. */
export const getUserLoginId = (person?: PersonNameFields | null): string => {
  const username = person?.username?.trim() || '';
  if (!username) return '';
  if (username.toLowerCase() === getUserDisplayName(person).toLowerCase()) return '';
  return username;
};

/**
 * "Full Name · login.id" style label for pickers: the login id stays first so
 * admins can scan by the id they know, with the full name added right after.
 */
export const formatUserLabel = (person?: PersonNameFields | null): string => {
  const loginId = person?.username?.trim() || '';
  const name = getUserDisplayName(person);
  if (!loginId) return name;
  if (!name || name.toLowerCase() === loginId.toLowerCase()) return loginId;
  return `${loginId} · ${name}`;
};

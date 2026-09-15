import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AccessRestrictions } from '../types';
import { AccessRestrictionDeniedDialog, type AccessRestrictionDeniedInfo } from '../components/AccessRestrictionDeniedDialog';
import { anyFingerprintHashes, checkAccessRestriction } from '../services/accessRestrictionService';
import { getFingerprintHash, readPersistedFingerprintHash } from '../services/fingerprintService';

export interface AssertCanOpenOptions {
  /** Known restriction objects for this entity (and ancestors). When set, fingerprint collect runs only if a hash allowlist is present. */
  rules?: AccessRestrictions | AccessRestrictions[] | null;
  /** Skip a second check when the same tile was already allowed in this page session (grid click → detail fetch). */
  skipIfAlreadyAllowed?: boolean;
}

interface AccessRestrictionContextValue {
  assertCanOpen: (
    entityType: 'tile' | 'tab' | 'link',
    id: string,
    options?: AssertCanOpenOptions
  ) => Promise<boolean>;
}

const AccessRestrictionContext = createContext<AccessRestrictionContextValue | null>(null);

const gateKey = (entityType: string, id: string): string => `${entityType}:${id}`;

export const AccessRestrictionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [denied, setDenied] = useState<AccessRestrictionDeniedInfo | null>(null);
  const allowedKeysRef = useRef<Set<string>>(new Set());

  const assertCanOpen = useCallback(async (
    entityType: 'tile' | 'tab' | 'link',
    id: string,
    options?: AssertCanOpenOptions
  ): Promise<boolean> => {
    if (!id) return true;
    const key = gateKey(entityType, id);
    if (options?.skipIfAlreadyAllowed && allowedKeysRef.current.has(key)) {
      return true;
    }
    try {
      let fingerprintHash: string | undefined;
      const rulesKnown = options !== undefined && 'rules' in options;
      const needsFingerprint = rulesKnown ? anyFingerprintHashes(options?.rules) : true;
      try {
        if (needsFingerprint) {
          fingerprintHash = await getFingerprintHash({ accessCheck: true });
        } else {
          fingerprintHash = readPersistedFingerprintHash() || undefined;
        }
      } catch {
        fingerprintHash = readPersistedFingerprintHash() || undefined;
      }
      const result = await checkAccessRestriction(entityType, id, fingerprintHash);
      if (result.allowed) {
        allowedKeysRef.current.add(key);
        return true;
      }
      allowedKeysRef.current.delete(key);
      setDenied({
        message: result.message,
        reason: result.reason,
        failedAt: result.failedAt,
      });
      return false;
    } catch {
      return true;
    }
  }, []);

  const value = useMemo(() => ({ assertCanOpen }), [assertCanOpen]);

  return (
    <AccessRestrictionContext.Provider value={value}>
      {children}
      <AccessRestrictionDeniedDialog open={!!denied} info={denied} onClose={() => setDenied(null)} />
    </AccessRestrictionContext.Provider>
  );
};

export const useAccessRestrictionGate = (): AccessRestrictionContextValue => {
  const ctx = useContext(AccessRestrictionContext);
  if (!ctx) {
    return {
      assertCanOpen: async () => true,
    };
  }
  return ctx;
};

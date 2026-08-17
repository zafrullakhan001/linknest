import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AccessRestrictionDeniedDialog, type AccessRestrictionDeniedInfo } from '../components/AccessRestrictionDeniedDialog';
import { checkAccessRestriction } from '../services/accessRestrictionService';

interface AccessRestrictionContextValue {
  assertCanOpen: (entityType: 'tile' | 'tab' | 'link', id: string) => Promise<boolean>;
}

const AccessRestrictionContext = createContext<AccessRestrictionContextValue | null>(null);

export const AccessRestrictionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [denied, setDenied] = useState<AccessRestrictionDeniedInfo | null>(null);

  const assertCanOpen = useCallback(async (entityType: 'tile' | 'tab' | 'link', id: string): Promise<boolean> => {
    if (!id) return true;
    try {
      const result = await checkAccessRestriction(entityType, id);
      if (result.allowed) return true;
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

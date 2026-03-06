import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type TabSwipeContextValue = {
  swipeEnabled: boolean;
  setSwipeEnabled: (enabled: boolean) => void;
  /** Convenience helpers */
  disableSwipe: () => void;
  enableSwipe: () => void;
};

const TabSwipeContext = createContext<TabSwipeContextValue | null>(null);

export function TabSwipeProvider({ children }: { children: React.ReactNode }) {
  const [swipeEnabled, setSwipeEnabledState] = useState(true);

  const setSwipeEnabled = useCallback((enabled: boolean) => {
    setSwipeEnabledState(enabled);
  }, []);

  const disableSwipe = useCallback(() => setSwipeEnabledState(false), []);
  const enableSwipe = useCallback(() => setSwipeEnabledState(true), []);

  const value = useMemo(
    () => ({ swipeEnabled, setSwipeEnabled, disableSwipe, enableSwipe }),
    [swipeEnabled, setSwipeEnabled, disableSwipe, enableSwipe]
  );

  return <TabSwipeContext.Provider value={value}>{children}</TabSwipeContext.Provider>;
}

export function useTabSwipe() {
  const ctx = useContext(TabSwipeContext);
  if (!ctx) {
    throw new Error("useTabSwipe must be used within a TabSwipeProvider");
  }
  return ctx;
}

import React, { createContext, useContext, useMemo, useState } from 'react';

type TabSwipeContextValue = {
  swipeEnabled: boolean;
  setSwipeEnabled: (enabled: boolean) => void;
};

const TabSwipeContext = createContext<TabSwipeContextValue | null>(null);

export function TabSwipeProvider({ children }: { children: React.ReactNode }) {
  const [swipeEnabled, setSwipeEnabled] = useState(true);

  const value = useMemo(
    () => ({ swipeEnabled, setSwipeEnabled }),
    [swipeEnabled]
  );

  return <TabSwipeContext.Provider value={value}>{children}</TabSwipeContext.Provider>;
}

export function useTabSwipe(): TabSwipeContextValue {
  const ctx = useContext(TabSwipeContext);
  if (!ctx) {
    // Safe default: keep swipe enabled if provider isn't mounted for some reason
    return { swipeEnabled: true, setSwipeEnabled: () => {} };
  }
  return ctx;
}

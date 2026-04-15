import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useMemberStore, canEditAttendance, canManagePTL, canManagePTPrograms, type AccountType } from '@/lib/store';
import { updateRosterPasswordStatus } from '@/lib/supabaseData';

type TutorialStep = {
  id: string;
  route: '/' | '/workouts' | '/attendance' | '/calculator' | '/profile';
  targetId: string;
  title: string;
  description: string;
};

type MeasuredRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TutorialTourContextValue = {
  active: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  currentTargetId: string | null;
  refreshCurrentTarget: () => void;
  startTutorial: () => void;
  skipTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  registerTarget: (id: string, node: View | null) => void;
  notifyTargetLayout: (id: string) => void;
};

const TutorialTourContext = createContext<TutorialTourContextValue | null>(null);

const SCREEN = Dimensions.get('window');

function normalizeTutorialPath(path: string | null | undefined) {
  if (!path) {
    return '/';
  }

  let normalized = path.replace(/\\/g, '/').replace(/\.html$/i, '');
  normalized = normalized.replace(/\/\([^/]+\)/g, '');

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/index$/i, '/');
  normalized = normalized.replace(/\/{2,}/g, '/');

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
}

function buildTutorialSteps(accountType: AccountType): TutorialStep[] {
  const steps: TutorialStep[] = [
    {
      id: 'home-leaderboard',
      route: '/',
      targetId: 'home-leaderboard',
      title: 'Leaderboard Snapshot',
      description: 'Open the live squadron leaderboard to check current rankings and points.',
    },
    {
      id: 'workouts-search',
      route: '/workouts',
      targetId: 'workouts-search',
      title: 'Workout Library',
      description: 'Search, filter, and browse shared workouts your squadron can use.',
    },
    {
      id: 'attendance-grid',
      route: '/attendance',
      targetId: 'attendance-grid',
      title: 'Attendance Grid',
      description: 'Track PT participation by member and day across the current week.',
    },
    {
      id: 'calculator-actions',
      route: '/calculator',
      targetId: 'calculator-actions',
      title: 'PFRA Tools',
      description: 'Calculate PFRA results, export them, and save PFRA records to account history.',
    },
    {
      id: 'account-summary',
      route: '/profile',
      targetId: 'account-summary',
      title: 'Account Summary',
      description: 'Review current stats, trophies, and recent fitness activity from one place.',
    },
  ];

  if (canManagePTPrograms(accountType)) {
    steps.push({
      id: 'attendance-report',
      route: '/attendance',
      targetId: 'attendance-report',
      title: 'Attendance Reports',
      description: 'Leadership roles can export the current attendance view as PDF or Excel.',
    });
  }

  steps.push(
    {
      id: 'account-quick-actions',
      route: '/profile',
      targetId: 'account-quick-actions',
      title: 'Quick Actions',
      description: canManagePTPrograms(accountType)
        ? 'Use Quick Actions for manual workout logging, manual PFRA entry, and PT scheduling.'
        : 'Use Quick Actions for manual workout logging and manual PFRA entry.',
    },
    {
      id: 'account-connected-apps',
      route: '/profile',
      targetId: 'account-connected-apps',
      title: 'Connected Apps',
      description: 'Connect supported fitness services so workouts can flow into FitFlight automatically.',
    },
    {
      id: 'account-help',
      route: '/profile',
      targetId: 'account-help',
      title: 'Help and Resources',
      description: 'Reopen the tutorial, read official documents, and install FitFlight on your device.',
    }
  );

  if (canManagePTL(accountType) || canManagePTPrograms(accountType)) {
    steps.push({
      id: 'account-admin',
      route: '/profile',
      targetId: 'account-admin',
      title: 'Leadership Tools',
      description: 'Access the member management and squadron administration tools available to your role.',
    });
  }

  if (accountType === 'fitflight_creator' || accountType === 'ufpm' || accountType === 'demo') {
    steps.push({
      id: 'account-password-reset',
      route: '/profile',
      targetId: 'account-password-reset',
      title: 'Reset User Password',
      description: 'Authorized roles can securely set a brand-new password for a member when needed.',
    });
  }

  if (accountType === 'fitflight_creator') {
    steps.push({
      id: 'account-analytics',
      route: '/profile',
      targetId: 'account-analytics',
      title: 'Squadron Analytics',
      description: 'Admin-only analytics give you broader squadron reporting, trends, and export tools.',
    });
  }

  return steps;
}

export function TutorialTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const updateUser = useAuthStore((state) => state.updateUser);
  const updateMember = useMemberStore((state) => state.updateMember);

  const targetRefs = useRef<Record<string, View | null>>({});
  const rootRef = useRef<View | null>(null);
  const measureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<MeasuredRect | null>(null);
  const [currentTargetReady, setCurrentTargetReady] = useState(false);

  const currentStep = active ? steps[currentStepIndex] ?? null : null;
  const normalizedPathname = normalizeTutorialPath(pathname);

  const clearMeasureTimeout = useCallback(() => {
    if (measureTimeoutRef.current) {
      clearTimeout(measureTimeoutRef.current);
      measureTimeoutRef.current = null;
    }
  }, []);

  const measureCurrentTarget = useCallback(() => {
    if (!active || !currentStep) {
      setTargetRect(null);
      return;
    }

    const node = targetRefs.current[currentStep.targetId];
    const rootNode = rootRef.current;
    if (!node) {
      setTargetRect(null);
      return;
    }

    const applyRect = (x: number, y: number, width: number, height: number) => {
      if (!width || !height) {
        setTargetRect(null);
        return;
      }

      setTargetRect({ x, y, width, height });
    };

    if (rootNode && typeof rootNode.measureInWindow === 'function' && typeof node.measureInWindow === 'function') {
      rootNode.measureInWindow((rootX, rootY) => {
        node.measureInWindow((targetX, targetY, width, height) => {
          applyRect(targetX - rootX, targetY - rootY, width, height);
        });
      });
      return;
    }

    if (typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        applyRect(x, y, width, height);
      });
      return;
    }

    setTargetRect(null);
  }, [active, currentStep]);

  const scheduleMeasure = useCallback((delay = 180) => {
    clearMeasureTimeout();
    measureTimeoutRef.current = setTimeout(() => {
      measureCurrentTarget();
      measureTimeoutRef.current = null;
    }, delay);
  }, [clearMeasureTimeout, measureCurrentTarget]);

  const registerTarget = useCallback((id: string, node: View | null) => {
    if (node) {
      targetRefs.current[id] = node;
    } else {
      delete targetRefs.current[id];
    }

    if (active && currentStep?.targetId === id) {
      setCurrentTargetReady(!!node);
    }

    if (active && currentStep?.targetId === id) {
      scheduleMeasure(60);
    }
  }, [active, currentStep?.targetId, scheduleMeasure]);

  const notifyTargetLayout = useCallback((id: string) => {
    if (active && currentStep?.targetId === id) {
      setCurrentTargetReady(true);
      scheduleMeasure(60);
    }
  }, [active, currentStep?.targetId, scheduleMeasure]);

  const refreshCurrentTarget = useCallback(() => {
    if (!active || !currentStep) {
      return;
    }

    scheduleMeasure(0);
  }, [active, currentStep, scheduleMeasure]);

  const finishTutorial = useCallback(async () => {
    clearMeasureTimeout();
    setActive(false);
    setTargetRect(null);
    setCurrentStepIndex(0);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    updateUser({ hasSeenTutorial: true, hasLoggedIntoApp: true });
    if (user) {
      updateMember(user.id, { hasSeenTutorial: true, hasLoggedIntoApp: true });
      if (accessToken) {
        await updateRosterPasswordStatus(
          user.email,
          { hasLoggedIntoApp: true },
          accessToken
        ).catch(() => undefined);
      }
    }

    router.replace('/');
  }, [accessToken, clearMeasureTimeout, router, updateMember, updateUser, user]);

  const skipTutorial = useCallback(() => {
    void finishTutorial();
  }, [finishTutorial]);

  const startTutorial = useCallback(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    const nextSteps = buildTutorialSteps(user.accountType);
    setSteps(nextSteps);
    setCurrentStepIndex(0);
    setTargetRect(null);
    setActive(true);
    router.navigate(nextSteps[0]?.route ?? '/');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [router, user]);

  const nextStep = useCallback(() => {
    if (!currentStep) {
      return;
    }

    if (currentStepIndex >= steps.length - 1) {
      void finishTutorial();
      return;
    }

    Haptics.selectionAsync();
    setCurrentStepIndex((index) => index + 1);
    setTargetRect(null);
  }, [currentStep, currentStepIndex, finishTutorial, steps.length]);

  const previousStep = useCallback(() => {
    if (currentStepIndex <= 0) {
      return;
    }

    Haptics.selectionAsync();
    setCurrentStepIndex((index) => index - 1);
    setTargetRect(null);
  }, [currentStepIndex]);

  useEffect(() => {
    if (!active || !currentStep) {
      return;
    }

    setCurrentTargetReady(!!targetRefs.current[currentStep.targetId]);

    if (normalizedPathname !== currentStep.route) {
      router.navigate(currentStep.route);
      setTargetRect(null);
      return;
    }

    scheduleMeasure(220);
  }, [active, currentStep, normalizedPathname, router, scheduleMeasure]);

  useEffect(() => {
    if (!active || !currentStep || normalizedPathname !== currentStep.route || targetRect) {
      return;
    }

    let attempts = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const retryMeasure = () => {
      attempts += 1;
      refreshCurrentTarget();
      if (attempts >= 8) {
        return;
      }
      retryTimeout = setTimeout(retryMeasure, 180);
    };

    retryTimeout = setTimeout(retryMeasure, 120);

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [active, currentStep, normalizedPathname, refreshCurrentTarget, targetRect]);

  useEffect(() => () => clearMeasureTimeout(), [clearMeasureTimeout]);

  const value = useMemo<TutorialTourContextValue>(() => ({
    active,
    currentStep,
    currentStepIndex,
    totalSteps: steps.length,
    currentTargetId: currentStep?.targetId ?? null,
    refreshCurrentTarget,
    startTutorial,
    skipTutorial,
    nextStep,
    previousStep,
    registerTarget,
    notifyTargetLayout,
  }), [active, currentStep, currentStepIndex, nextStep, notifyTargetLayout, previousStep, refreshCurrentTarget, registerTarget, skipTutorial, startTutorial, steps.length]);

  const cardAtTop = !!targetRect && targetRect.y > SCREEN.height * 0.5;

  return (
    <TutorialTourContext.Provider value={value}>
      <View ref={rootRef} collapsable={false} style={styles.providerRoot}>
        {children}
        {active && currentStep ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {Platform.OS !== 'web' ? (
              <View pointerEvents="none" style={styles.fullOverlay} />
            ) : null}

            <View
              style={[
                styles.cardContainer,
                cardAtTop ? styles.cardTop : styles.cardBottom,
              ]}
            >
              <View style={styles.card}>
                <Text style={styles.stepText}>Step {currentStepIndex + 1} of {steps.length}</Text>
                <Text style={styles.title}>{currentStep.title}</Text>
                <Text style={styles.description}>{currentStep.description}</Text>

                <View style={styles.buttonRow}>
                  <Pressable onPress={skipTutorial} style={[styles.button, styles.secondaryButton]}>
                    <Text style={styles.secondaryButtonText}>Skip</Text>
                  </Pressable>

                  <View style={styles.rightButtons}>
                    {currentStepIndex > 0 ? (
                      <Pressable onPress={previousStep} style={[styles.button, styles.secondaryButton, styles.inlineButton]}>
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={nextStep} style={[styles.button, styles.primaryButton]}>
                      <Text style={styles.primaryButtonText}>
                        {currentStepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </TutorialTourContext.Provider>
  );
}

export function useTutorialTour() {
  const context = useContext(TutorialTourContext);
  if (!context) {
    throw new Error('useTutorialTour must be used within TutorialTourProvider.');
  }
  return context;
}

export function TutorialTarget({
  id,
  children,
  onLayout,
}: {
  id: string;
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const ref = useRef<View | null>(null);
  const { active, currentTargetId, registerTarget, notifyTargetLayout } = useTutorialTour();
  const isActive = active && currentTargetId === id;

  useEffect(() => {
    registerTarget(id, ref.current);
    return () => registerTarget(id, null);
  }, [id, registerTarget]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={(event) => {
        onLayout?.(event);
        notifyTargetLayout(id);
      }}
      style={isActive ? styles.targetActive : undefined}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 10, 22, 0.78)',
    zIndex: 40,
  },
  cardContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 80,
  },
  cardTop: {
    top: 56,
  },
  cardBottom: {
    bottom: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0A1628',
    padding: 18,
  },
  stepText: {
    color: '#9FB3D1',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  description: {
    color: '#C0C0C0',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  buttonRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inlineButton: {
    marginRight: 10,
  },
  primaryButton: {
    backgroundColor: '#4A90D9',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  targetActive: {
    position: 'relative',
    zIndex: 70,
    elevation: 70,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#4A90D9',
    backgroundColor: 'transparent',
    boxShadow: '0 0 0 9999px rgba(4, 10, 22, 0.78), 0 0 0 2px #4A90D9, 0 0 14px rgba(74, 144, 217, 0.18)',
  },
});

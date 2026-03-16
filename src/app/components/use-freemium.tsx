// =============================================
// Proper Food AI — useFreemium Hook
// =============================================
// Fetches /subscription/usage and provides
// per-feature limit info for UI components.
// Auto-refreshes when refreshKey changes.
// =============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api-client';
import { useAuth } from './auth-context';

export interface UsageBucket {
  used: number;
  limit: number | null;       // null = unlimited (premium)
  remaining: number | null;   // null = unlimited
}

export interface FreemiumUsage {
  isPremium: boolean;
  scans: UsageBucket;
  foodEstimates: UsageBucket;
  mealPlans: UsageBucket;
  workoutPlans: UsageBucket & { advanced: boolean };
  aiAnalysis: UsageBucket;
  coachMessages: UsageBucket;
  activityLogs: UsageBucket;
}

const EMPTY_BUCKET: UsageBucket = { used: 0, limit: null, remaining: null };

const DEFAULT_USAGE: FreemiumUsage = {
  isPremium: false,
  scans: EMPTY_BUCKET,
  foodEstimates: EMPTY_BUCKET,
  mealPlans: EMPTY_BUCKET,
  workoutPlans: { ...EMPTY_BUCKET, advanced: false },
  aiAnalysis: EMPTY_BUCKET,
  coachMessages: EMPTY_BUCKET,
  activityLogs: EMPTY_BUCKET,
};

/**
 * Hook to fetch and track freemium usage limits.
 * Call `refresh()` after any action that consumes a limit (scan, coach message, etc.)
 */
export function useFreemium() {
  const { isAuthenticated, subscriptionActive, isAdmin } = useAuth();
  const [usage, setUsage] = useState<FreemiumUsage>(DEFAULT_USAGE);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await api.getUsage();
      setUsage({
        isPremium: data.is_premium,
        scans: data.scans,
        foodEstimates: data.food_estimates,
        mealPlans: data.meal_plans,
        workoutPlans: data.workout_plans,
        aiAnalysis: data.ai_analysis,
        coachMessages: data.coach_messages,
        activityLogs: data.activity_logs,
      });
    } catch (err) {
      console.warn('[useFreemium] Failed to fetch usage:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Auto-fetch on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    if (!isAuthenticated) return;
    fetchedRef.current = true;
    fetch();
  }, [isAuthenticated, fetch]);

  // Premium / admin users have no limits
  const hasAccess = subscriptionActive || isAdmin;

  /**
   * Check if a specific feature has remaining uses.
   * Returns true if premium/admin OR remaining > 0 OR limit is null (unlimited).
   */
  const canUse = useCallback((bucket: UsageBucket): boolean => {
    if (hasAccess) return true;
    if (bucket.limit === null) return true;
    return (bucket.remaining ?? 0) > 0;
  }, [hasAccess]);

  /**
   * Get a display string like "2/3" or "unlimited"
   */
  const limitLabel = useCallback((bucket: UsageBucket): string => {
    if (hasAccess || bucket.limit === null) return '\u221e';
    return `${bucket.used}/${bucket.limit}`;
  }, [hasAccess]);

  return {
    usage,
    loading,
    refresh: fetch,
    canUse,
    limitLabel,
    hasAccess,
  };
}

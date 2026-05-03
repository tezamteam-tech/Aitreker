// =============================================
// AI Nutrition & Fitness Tracker — Home Screen
// =============================================
// Main dashboard showing:
//   - Daily calorie tracking (consumed vs remaining)
//   - Scan Food button (camera integration)
//   - Today's meal plan preview
//   - Today's workout plan preview
//   - Quick stats and progress
// =============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Camera,
  Flame,
  ChevronRight,
  ChevronDown,
  Utensils,
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  Zap,
  Crown,
  Salad,
  Scale,
  BarChart3,
  Activity,
  Gift,
  Sparkles,
  Droplet,
} from 'lucide-react';
import { toast } from 'sonner';
import { GlassCard } from './glass-card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { cn } from './ui/utils';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { calculateCalories, type CalorieResult } from './calorie-calculator';
import { StreakShareCard } from './streak-share-card';
import { SmartBurnCard } from './smart-burn-card';
import { ActivityLogger } from './activity-logger';
import { useFreemium } from './use-freemium';
import { FreemiumLimitBadge } from './premium-gate';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface NutritionData {
  caloriesConsumed: number;
  caloriesGoal: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber_g: number;
  sugar_g: number;
  added_sugar_g: number;
  water_ml: number;
  sodium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  vitamin_d_mcg: number;
  magnesium_mg: number;
}

interface MealPlanItem {
  id: string;
  name: string;
  time: string;
  calories: number;
  completed: boolean;
}

interface WorkoutPlanItem {
  id: string;
  name: string;
  duration: string;
  calories: number;
  completed: boolean;
}

const waterStorageKey = (date: string) => `proper_water_ml_${date}`;

export function HomeNutritionPage() {
  const { user, subscriptionActive, subscriptionDaysLeft, isTrial, trialDaysLeft, trialExpired } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const { usage, hasAccess } = useFreemium();

  // Calorie target from profile (loaded from API or localStorage cache)
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [bmr, setBmr] = useState<number>(0);
  const [maintenanceCalories, setMaintenanceCalories] = useState<number>(0);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [scansLimit, setScansLimit] = useState<number>(3);
  
  // Weight tracking state
  const [latestWeight, setLatestWeight] = useState<{ weight: number; date: string } | null>(null);
  const [weeklyWeightChange, setWeeklyWeightChange] = useState<number | null>(null);
  
  // Streak milestone state
  const [streakMilestone, setStreakMilestone] = useState<{ milestone: number; streak: number } | null>(null);

  // Profile data for SmartBurnCard
  const [profileData, setProfileData] = useState<{ gender: string; age: number; weight: number; activityLevel: string } | null>(null);

  // SmartBurn calories burned today
  const [burnedToday, setBurnedToday] = useState(0);

  const [nutritionData, setNutritionData] = useState<NutritionData>({
    caloriesConsumed: 0,
    caloriesGoal: 2000,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber_g: 0,
    sugar_g: 0,
    added_sugar_g: 0,
    water_ml: 0,
    sodium_mg: 0,
    iron_mg: 0,
    calcium_mg: 0,
    vitamin_d_mcg: 0,
    magnesium_mg: 0,
  });

  // Water tracker (server-side + local fallback when API fails)
  const [waterMl, setWaterMl] = useState(0);
  const waterGoalMl = 2000;
  const [dayCardOpen, setDayCardOpen] = useState(false);

  const [todayMeals, setTodayMeals] = useState<MealPlanItem[]>([]);

  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutPlanItem[]>([]);

  useEffect(() => {
    // 1. Try localStorage cache first for instant display
    const cachedTarget = localStorage.getItem('nutrition_calorie_target');
    const cachedBmr = localStorage.getItem('nutrition_bmr');
    const cachedMaintenance = localStorage.getItem('nutrition_maintenance');
    
    if (cachedTarget) {
      const target = Number(cachedTarget);
      setCalorieTarget(target);
      setNutritionData((prev) => ({ ...prev, caloriesGoal: target }));
    }
    if (cachedBmr) setBmr(Number(cachedBmr));
    if (cachedMaintenance) setMaintenanceCalories(Number(cachedMaintenance));
    if (cachedTarget) setProfileLoaded(true);

    // 2. Then fetch from API for latest data
    if (!user) return;
    api.getUserProfile().then((profile) => {
      if (!profile) return;
      
      // If backend has calorie data, use it
      if (profile.daily_calorie_target) {
        setCalorieTarget(profile.daily_calorie_target);
        setNutritionData((prev) => ({ ...prev, caloriesGoal: profile.daily_calorie_target! }));
        localStorage.setItem('nutrition_calorie_target', String(profile.daily_calorie_target));
      }
      if (profile.bmr) {
        setBmr(profile.bmr);
        localStorage.setItem('nutrition_bmr', String(profile.bmr));
      }
      if (profile.daily_maintenance_calories) {
        setMaintenanceCalories(profile.daily_maintenance_calories);
        localStorage.setItem('nutrition_maintenance', String(profile.daily_maintenance_calories));
      }
      
      // If backend doesn't have calorie data yet, recalculate from profile
      if (!profile.daily_calorie_target && profile.gender && profile.age) {
        const result = calculateCalories({
          gender: profile.gender as 'male' | 'female',
          age: profile.age,
          height: profile.height,
          weight: profile.weight,
          activityLevel: profile.activity_level as 'low' | 'medium' | 'high' | 'athlete',
          goal: profile.goal as 'lose_weight' | 'maintain_weight' | 'gain_muscle',
        });
        setCalorieTarget(result.targetCalories);
        setBmr(result.bmr);
        setMaintenanceCalories(result.dailyCalories);
        setNutritionData((prev) => ({ ...prev, caloriesGoal: result.targetCalories }));
        // Cache locally
        localStorage.setItem('nutrition_calorie_target', String(result.targetCalories));
        localStorage.setItem('nutrition_bmr', String(result.bmr));
        localStorage.setItem('nutrition_maintenance', String(result.dailyCalories));
      }
      
      setProfileLoaded(true);
      // Set profile data for SmartBurnCard
      setProfileData({
        gender: profile.gender,
        age: profile.age,
        weight: profile.weight,
        activityLevel: profile.activity_level,
      });
    }).catch((err) => {
      console.warn('[HomeNutrition] Failed to load profile:', err);
      setProfileLoaded(true);
    });
  }, [user]);

  // Load today's food entries from API (real data)
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    api.getFoodEntries(today).then((data) => {
      const entries = data.entries || [];
      const totals = data.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber_g: 0, sugar_g: 0, added_sugar_g: 0, water_ml: 0, sodium_mg: 0, iron_mg: 0, calcium_mg: 0, vitamin_d_mcg: 0, magnesium_mg: 0 };

      // Update nutrition data with real totals
      setNutritionData((prev) => ({
        ...prev,
        caloriesConsumed: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fats: totals.fat,
        fiber_g: totals.fiber_g || 0,
        sugar_g: totals.sugar_g || 0,
        added_sugar_g: totals.added_sugar_g || 0,
        water_ml: totals.water_ml || 0,
        sodium_mg: totals.sodium_mg || 0,
        iron_mg: totals.iron_mg || 0,
        calcium_mg: totals.calcium_mg || 0,
        vitamin_d_mcg: totals.vitamin_d_mcg || 0,
        magnesium_mg: totals.magnesium_mg || 0,
      }));

      // Map food entries to today's meals display
      if (entries.length > 0) {
        const mealItems: MealPlanItem[] = entries.map((e: any) => ({
          id: e.id,
          name: e.food_name,
          time: e.created_at ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
          calories: e.calories || 0,
          completed: true, // logged entries are always "completed"
        }));
        setTodayMeals(mealItems);
      }
    }).catch((err) => {
      console.warn('[HomeNutrition] Failed to load food entries:', err);
    });
  }, [user]);

  // Load today's water
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    api.getWater(today)
      .then((d) => {
        const server = Number(d.total_ml) || 0;
        setWaterMl(server);
        try {
          if (server > 0) localStorage.setItem(waterStorageKey(today), String(server));
        } catch {}
      })
      .catch((err) => {
        console.warn('[HomeNutrition] Failed to load water:', err);
        try {
          setWaterMl(Number(localStorage.getItem(waterStorageKey(today))) || 0);
        } catch {
          setWaterMl(0);
        }
      });
  }, [user]);

  const addWater = async (amount: number) => {
    const today = new Date().toISOString().slice(0, 10);
    hapticFeedback('light');
    const prev = waterMl;
    const optimistic = prev + amount;
    setWaterMl(optimistic);
    try {
      localStorage.setItem(waterStorageKey(today), String(optimistic));
    } catch {}

    try {
      const d = await api.logWater(amount, today);
      const serverTotal = Number((d as { total_ml?: number }).total_ml) || optimistic;
      setWaterMl(serverTotal);
      try {
        localStorage.setItem(waterStorageKey(today), String(serverTotal));
      } catch {}
    } catch (err: unknown) {
      console.warn('[HomeNutrition] Water log failed:', err);
      toast.error(lang === 'ru' ? 'Вода: не сохранилась на сервере' : 'Water not saved to server', {
        description:
          lang === 'ru'
            ? 'Значение оставлено у вас на экране. Проверьте сеть или авторизацию.'
            : 'Your tap is still shown here. Check connection or auth.',
      });
      // Keep optimistic UI + localStorage so taps never feel "dead"
    }
  };

  const macroPie = (() => {
    const p = Math.max(0, Number(nutritionData.protein) || 0) * 4;
    const c = Math.max(0, Number(nutritionData.carbs) || 0) * 4;
    const f = Math.max(0, Number(nutritionData.fats) || 0) * 9;
    const total = p + c + f;
    if (total <= 0) return null;
    return [
      { name: lang === 'ru' ? 'Белки' : 'Protein', value: p, color: '#6c5ce7' },
      { name: lang === 'ru' ? 'Углеводы' : 'Carbs', value: c, color: '#fdcb6e' },
      { name: lang === 'ru' ? 'Жиры' : 'Fats', value: f, color: '#fd79a8' },
    ];
  })();

  // Load today's workout from active workout plan
  useEffect(() => {
    if (!user) return;
    api.getWorkoutPlans().then((data) => {
      const plans = data.plans || [];
      if (plans.length === 0) return;

      // Load the latest workout plan
      const latestPlanId = plans[0].id;
      api.getWorkoutPlan(latestPlanId).then((plan) => {
        if (!plan?.workout_data?.days) return;
        const dayNum = Math.max(1, Math.min(
          Math.ceil((Date.now() - new Date(plan.created_at).getTime()) / (24 * 60 * 60 * 1000)) + 1,
          plan.workout_data.days.length
        ));
        const todayDay = plan.workout_data.days.find((d: any) => d.day === dayNum) || plan.workout_data.days[0];
        if (todayDay) {
          const exercises = todayDay.exercises || [];
          const items: WorkoutPlanItem[] = exercises.length > 0
            ? exercises.map((ex: any, i: number) => ({
                id: `w_${i}`,
                name: ex.name || 'Exercise',
                duration: ex.sets ? `${ex.sets} sets  ${ex.reps || '10'}` : `${todayDay.duration_min || 30} min`,
                calories: Math.round((todayDay.calories_burn || 200) / exercises.length),
                completed: false,
              }))
            : [{
                id: 'w_0',
                name: todayDay.name || todayDay.workout_type || 'Workout',
                duration: `${todayDay.duration_min || 30} min`,
                calories: todayDay.calories_burn || 200,
                completed: false,
              }];
          setTodayWorkouts(items);
        }
      }).catch(() => {});
    }).catch((err) => {
      console.warn('[HomeNutrition] Failed to load workout plans:', err);
    });
  }, [user]);

  // Load usage data for free tier banner
  useEffect(() => {
    if (!user || subscriptionActive) return;
    api.getUsage().then((usage) => {
      if (usage.scans.remaining !== null) {
        setScansRemaining(usage.scans.remaining);
      }
      if (usage.scans.limit !== null) {
        setScansLimit(usage.scans.limit);
      }
    }).catch(() => {});
  }, [user, subscriptionActive]);

  // Load weight tracking data
  useEffect(() => {
    if (!user) return;
    api.getWeightHistory(30).then((data) => {
      const entries = data.entries || [];
      if (entries.length > 0) {
        const latest = entries[0];
        setLatestWeight({ weight: latest.weight, date: latest.date });
        
        // Calculate weekly weight change
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weekAgoStr = oneWeekAgo.toISOString().slice(0, 10);
        const weekOldEntry = entries.find((e: any) => e.date <= weekAgoStr);
        if (weekOldEntry) {
          setWeeklyWeightChange(latest.weight - weekOldEntry.weight);
        } else if (entries.length >= 2) {
          // If no entry older than a week, use oldest available
          setWeeklyWeightChange(latest.weight - entries[entries.length - 1].weight);
        }
      }
    }).catch((err) => {
      console.warn('[HomeNutrition] Failed to load weight history:', err);
    });

    // Fire-and-forget: check if we should send a weigh-in reminder via Telegram
    api.checkWeighInReminder().catch(() => {});
  }, [user]);

  // Check nutrition streak for milestone share card
  useEffect(() => {
    if (!user) return;
    api.getNutritionStreak().then((data) => {
      if (data.pending_milestone) {
        setStreakMilestone({ milestone: data.pending_milestone, streak: data.streak });
      }
    }).catch((err) => {
      console.warn('[HomeNutrition] Failed to load streak:', err);
    });
  }, [user]);

  const caloriesRemaining = nutritionData.caloriesGoal - nutritionData.caloriesConsumed;
  const percentConsumed = Math.round((nutritionData.caloriesConsumed / nutritionData.caloriesGoal) * 100);

  const handleScanFood = () => {
    hapticFeedback('medium');
    // TODO: Open camera or navigate to food scanning page
    navigate('/calories/scan');
  };

  return (
    <div className="min-h-screen pb-32">
      <PageHeader title={t('home_title')} />

      <div className="px-4 space-y-4">
        
        {/* Trial banner — active trial countdown */}
        {subscriptionActive && isTrial && trialDaysLeft > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=60'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-[#6c5ce7]/20"
            style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.12), rgba(162,155,254,0.06))' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[#a29bfe]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('trial_banner_title', { n: trialDaysLeft })}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('trial_banner_desc')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#a29bfe]" />
          </motion.button>
        )}

        {/* Trial expired banner */}
        {trialExpired && !subscriptionActive && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=60'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-[#ff6b6b]/20"
            style={{ background: 'linear-gradient(135deg, rgba(255,107,107,0.10), rgba(225,112,85,0.05))' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#ff6b6b]/15 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-[#ff6b6b]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('trial_expired_banner_title')}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('trial_expired_banner_desc')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#ff6b6b]" />
          </motion.button>
        )}

        {/* Subscription expiry warning for paid premium users (≤3 days left, non-trial) */}
        {subscriptionActive && !isTrial && subscriptionDaysLeft > 0 && subscriptionDaysLeft <= 3 && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=30'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-[#e17055]/20"
            style={{ background: 'linear-gradient(135deg, rgba(225,112,85,0.12), rgba(255,107,107,0.06))' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#e17055]/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-[#e17055]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('hn_premium_expires', { n: subscriptionDaysLeft })}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('hn_premium_tap_renew')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#e17055]" />
          </motion.button>
        )}

        {/* Free user (never had trial or non-trial expired) — show scans remaining */}
        {!subscriptionActive && !trialExpired && scansRemaining !== null && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=60'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-[#6c5ce7]/20"
            style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.10), rgba(162,155,254,0.05))' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/20 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-[#a29bfe]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {scansRemaining > 0
                  ? t('hn_scans_left', { n: scansRemaining, limit: scansLimit })
                  : t('hn_scan_limit_reached')}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('hn_upgrade_premium')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#a29bfe]" />
          </motion.button>
        )}

        {/* Primary: scan food */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleScanFood}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] shadow-lg relative min-h-[88px] touch-manipulation"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-white text-sm font-semibold leading-tight">{t('hn_qa_scan')}</div>
            <div className="text-white/80 text-xs leading-tight mt-1">
              {lang === 'ru' ? 'Сфотографируй блюдо — посчитаем КБЖУ' : 'Snap a meal — we estimate macros'}
            </div>
          </div>
          {!hasAccess && usage.scans.limit !== null && (
            <FreemiumLimitBadge used={usage.scans.used} limit={usage.scans.limit} className="absolute top-2 right-2 !bg-white/20 !text-white/90 !border-white/30" />
          )}
        </motion.button>

        {/* Today: collapsed summary + water; expanded = details + nutrient pie */}
        <Collapsible open={dayCardOpen} onOpenChange={setDayCardOpen}>
          <GlassCard className="!p-4">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-start gap-2 rounded-xl text-left touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-[#6c5ce7]/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {lang === 'ru' ? 'Сегодня' : 'Today'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200',
                        dayCardOpen && 'rotate-180',
                      )}
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
                        {nutritionData.caloriesConsumed}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">
                        / {nutritionData.caloriesGoal} {t('hn_cal_unit')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#6c5ce7]/10">
                      <Flame className="w-3.5 h-3.5 text-[#fd79a8]" />
                      <span className="text-xs font-semibold text-foreground/70">{percentConsumed}%</span>
                    </div>
                  </div>
                  <div className="relative h-1.5 rounded-full overflow-hidden mt-2.5" style={{ background: 'var(--glass-bg-row)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(percentConsumed, 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        percentConsumed > 100
                          ? 'bg-gradient-to-r from-[#ff6b6b] to-[#ee5a24]'
                          : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
                      }`}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{t('hn_remaining')}</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${caloriesRemaining >= 0 ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`}
                    >
                      {caloriesRemaining >= 0 ? caloriesRemaining : 0} {t('hn_cal_unit')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-[0.6875rem] text-muted-foreground">
                    <span>
                      <span className="text-[#6c5ce7] font-semibold">P</span> {nutritionData.protein}
                      {t('unit_g')}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>
                      <span className="text-[#fdcb6e] font-semibold">C</span> {nutritionData.carbs}
                      {t('unit_g')}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>
                      <span className="text-[#fd79a8] font-semibold">F</span> {nutritionData.fats}
                      {t('unit_g')}
                    </span>
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            <div className="mt-3 pt-3 border-t border-[var(--glass-border-subtle)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#74b9ff]/25 to-[#00cec9]/20 flex items-center justify-center shrink-0">
                  <Droplet className="w-4 h-4 text-[#74b9ff]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">{lang === 'ru' ? 'Вода' : 'Water'}</div>
                  <div className="text-[0.6875rem] text-muted-foreground tabular-nums">
                    {waterMl} / {waterGoalMl} {lang === 'ru' ? 'мл' : 'ml'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void addWater(250)}
                  className="h-9 min-w-[3.25rem] px-2.5 rounded-xl bg-ui-button border border-[var(--glass-border)] text-xs font-semibold active:scale-[0.96] transition-transform touch-manipulation"
                >
                  +250
                </button>
                <button
                  type="button"
                  onClick={() => void addWater(500)}
                  className="h-9 min-w-[3.25rem] px-2.5 rounded-xl bg-ui-button border border-[var(--glass-border)] text-xs font-semibold active:scale-[0.96] transition-transform touch-manipulation"
                >
                  +500
                </button>
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(116,185,255,0.12)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.round((waterMl / waterGoalMl) * 100))}%`,
                  background: 'linear-gradient(90deg, #74b9ff, #00cec9)',
                }}
              />
            </div>

            <CollapsibleContent>
              <div className="pt-4 mt-3 border-t border-[var(--glass-border-subtle)] space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-[#6c5ce7] flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">{t('hn_target')}</span>
                    <span className="text-sm font-semibold text-foreground ml-auto tabular-nums">{nutritionData.caloriesGoal}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-[#fd79a8] flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">{t('hn_consumed')}</span>
                    <span className="text-sm font-semibold text-foreground ml-auto tabular-nums">{nutritionData.caloriesConsumed}</span>
                  </div>
                </div>

                {(() => {
                  const totalExpenditure = (maintenanceCalories || bmr || 0) + burnedToday;
                  if (totalExpenditure <= 0) return null;
                  const deficit = totalExpenditure - nutritionData.caloriesConsumed;
                  const weightChangeG = Math.round((deficit / 7700) * 1000);
                  const isLoss = weightChangeG > 0;
                  const absGrams = Math.abs(weightChangeG);
                  const displayKg = absGrams >= 1000;
                  const displayValue = displayKg ? (absGrams / 1000).toFixed(1) : absGrams;
                  const displayUnit = displayKg ? t('hn_wc_kg') : t('hn_wc_g');

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.05, duration: 0.25 }}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                      style={{
                        background: isLoss
                          ? 'linear-gradient(135deg, rgba(0,206,201,0.06), rgba(108,92,231,0.03))'
                          : 'linear-gradient(135deg, rgba(255,107,107,0.06), rgba(238,90,36,0.03))',
                        border: `1px solid ${isLoss ? 'rgba(0,206,201,0.12)' : 'rgba(255,107,107,0.12)'}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isLoss ? (
                          <TrendingDown className="w-4 h-4 text-[#00cec9]" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-[#ff6b6b]" />
                        )}
                        <span className="text-xs text-muted-foreground">{t('hn_wc_title')}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-sm font-bold ${isLoss ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`}>
                          {isLoss ? '−' : '+'}
                          {displayValue} {displayUnit}
                        </span>
                        <span className="text-[0.625rem] text-muted-foreground/50">
                          ({isLoss ? '−' : '+'}
                          {Math.abs(deficit)} {t('hn_cal_unit')})
                        </span>
                      </div>
                    </motion.div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-2 pt-1" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                  {[
                    { label: t('hn_protein'), value: nutritionData.protein, color: '#6c5ce7' },
                    { label: t('hn_carbs'), value: nutritionData.carbs, color: '#fdcb6e' },
                    { label: t('hn_fats'), value: nutritionData.fats, color: '#fd79a8' },
                  ].map((macro) => (
                    <div key={macro.label} className="flex flex-col items-center gap-0.5 text-center">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: macro.color }} />
                      <span className="text-[0.625rem] text-muted-foreground leading-tight">{macro.label}</span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">
                        {macro.value}
                        {t('unit_g')}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#00b894' }} />
                    <span className="text-[0.625rem] text-muted-foreground leading-tight">{lang === 'ru' ? 'Клетчатка' : 'Fiber'}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {nutritionData.fiber_g}
                      {t('unit_g')}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#fdcb6e' }} />
                    <span className="text-[0.625rem] text-muted-foreground leading-tight">{lang === 'ru' ? 'Сахар+' : 'Added sugar'}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {nutritionData.added_sugar_g}
                      {t('unit_g')}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#74b9ff' }} />
                    <span className="text-[0.625rem] text-muted-foreground leading-tight">{lang === 'ru' ? 'Натрий' : 'Sodium'}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {nutritionData.sodium_mg}
                      {lang === 'ru' ? 'мг' : 'mg'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-[#6c5ce7]/10 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-[#6c5ce7]" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">{lang === 'ru' ? 'Баланс нутриентов' : 'Nutrient balance'}</div>
                        <div className="text-[0.625rem] text-muted-foreground">{lang === 'ru' ? 'По калориям' : 'By calories'}</div>
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        hapticFeedback('light');
                        navigate('/analytics');
                      }}
                      className="h-8 px-2.5 rounded-lg bg-ui-button border border-[var(--glass-border)] text-xs font-semibold flex items-center gap-1"
                    >
                      {lang === 'ru' ? 'Тренды' : 'Trends'}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </motion.button>
                  </div>
                  {macroPie ? (
                    <div className="flex items-center gap-3">
                      <div className="w-[100px] h-[100px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={macroPie} dataKey="value" innerRadius={30} outerRadius={46} paddingAngle={2}>
                              {macroPie.map((e) => (
                                <Cell key={e.name} fill={e.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1.5 min-w-0">
                        {macroPie.map((e) => {
                          const total = macroPie.reduce((s, x) => s + x.value, 0);
                          const pct = total > 0 ? Math.round((e.value / total) * 100) : 0;
                          return (
                            <div key={e.name} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                                <span className="text-xs text-muted-foreground truncate">{e.name}</span>
                              </div>
                              <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {lang === 'ru' ? 'Добавьте еду, чтобы увидеть баланс.' : 'Log food to see balance.'}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </GlassCard>
        </Collapsible>

        {/* Quick shortcuts — 2×2 (scan moved above) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* AI Coach */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/nutrition-coach'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl border relative"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#00b894] to-[#00cec9] flex items-center justify-center">
              <Salad className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_coach')}</span>
            {!hasAccess && usage.coachMessages.limit !== null && (
              <FreemiumLimitBadge used={usage.coachMessages.used} limit={usage.coachMessages.limit} className="absolute top-1.5 right-1.5" />
            )}
          </motion.button>

          {/* Meal Plan */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/meal-plan'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl relative"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#fd79a8] to-[#e84393] flex items-center justify-center">
              <Utensils className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_meals')}</span>
            {!hasAccess && usage.mealPlans.limit !== null ? (
              <FreemiumLimitBadge used={usage.mealPlans.used} limit={usage.mealPlans.limit} className="absolute top-1.5 right-1.5" />
            ) : todayMeals.length > 0 ? (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#fd79a8] text-white text-[0.625rem] font-bold flex items-center justify-center">{todayMeals.length}</span>
            ) : null}
          </motion.button>

          {/* Workout */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/workout-plan'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl relative"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#00cec9] to-[#00b894] flex items-center justify-center">
              <Dumbbell className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_workout')}</span>
            {!hasAccess && usage.workoutPlans.limit !== null ? (
              <FreemiumLimitBadge used={usage.workoutPlans.used} limit={usage.workoutPlans.limit} className="absolute top-1.5 right-1.5" />
            ) : todayWorkouts.length > 0 ? (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#00cec9] text-white text-[0.625rem] font-bold flex items-center justify-center">{todayWorkouts.length}</span>
            ) : null}
          </motion.button>

          {/* Analytics */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/analytics'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#a29bfe] to-[#6c5ce7] flex items-center justify-center">
              <BarChart3 className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_analytics')}</span>
          </motion.button>
        </div>

        {/* Smart Burn Suggestions — shows when calories are over target */}
        {profileData && nutritionData.caloriesConsumed > 0 && nutritionData.caloriesGoal > 0 && (
          <SmartBurnCard
            caloriesConsumed={nutritionData.caloriesConsumed}
            caloriesTarget={nutritionData.caloriesGoal}
            gender={profileData.gender}
            age={profileData.age}
            weight={profileData.weight}
            activityLevel={profileData.activityLevel}
            onBurnUpdate={(total) => setBurnedToday(total)}
          />
        )}

        {/* Activity Logger — Log any activity, AI estimates burn */}
        <ActivityLogger
          profile={profileData}
          caloriesConsumed={nutritionData.caloriesConsumed}
          calorieTarget={nutritionData.caloriesGoal}
          onBurnUpdate={(total) => setBurnedToday(total)}
        />

        {/* ===== Earn Bonuses Banner ===== */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { hapticFeedback('medium'); navigate('/bonuses'); }}
          className="w-full flex items-center gap-3.5 p-4 rounded-2xl relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(108,92,231,0.12), rgba(0,206,201,0.08))',
            border: '1px solid rgba(108,92,231,0.15)',
          }}
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center shrink-0">
            <Gift className="w-5.5 h-5.5 text-[#a29bfe]" style={{ width: 22, height: 22 }} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {t('pn_social_tasks')}
            </p>
            <p className="text-muted-foreground/60" style={{ fontSize: '0.6875rem' }}>
              {t('pn_social_tasks_desc')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-[#00cec9]/50" />
            <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
          </div>
        </motion.button>
      </div>

      {/* Streak Milestone Share Modal */}
      {streakMilestone && (
        <StreakShareCard
          milestone={streakMilestone.milestone}
          streak={streakMilestone.streak}
          onClose={() => setStreakMilestone(null)}
        />
      )}
    </div>
  );
}
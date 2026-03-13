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
  Utensils,
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Target,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  Crown,
  Salad,
  MessageCircle,
  Scale,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { calculateCalories, type CalorieResult } from './calorie-calculator';
import { PremiumBadge } from './premium-gate';
import { StreakShareCard } from './streak-share-card';

interface NutritionData {
  caloriesConsumed: number;
  caloriesGoal: number;
  protein: number;
  carbs: number;
  fats: number;
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

export function HomeNutritionPage() {
  const { user, subscriptionActive, subscriptionDaysLeft } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Calorie target from profile (loaded from API or localStorage cache)
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [bmr, setBmr] = useState<number>(0);
  const [maintenanceCalories, setMaintenanceCalories] = useState<number>(0);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  
  // Weight tracking state
  const [latestWeight, setLatestWeight] = useState<{ weight: number; date: string } | null>(null);
  const [weeklyWeightChange, setWeeklyWeightChange] = useState<number | null>(null);
  
  // Streak milestone state
  const [streakMilestone, setStreakMilestone] = useState<{ milestone: number; streak: number } | null>(null);

  const [nutritionData, setNutritionData] = useState<NutritionData>({
    caloriesConsumed: 0,
    caloriesGoal: 2000,
    protein: 0,
    carbs: 0,
    fats: 0,
  });

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
      const totals = data.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };

      // Update nutrition data with real totals
      setNutritionData((prev) => ({
        ...prev,
        caloriesConsumed: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fats: totals.fat,
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
                duration: ex.sets ? `${ex.sets} sets × ${ex.reps || '10'}` : `${todayDay.duration_min || 30} min`,
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
    <div className="min-h-screen pb-6">
      <PageHeader title={t('home_title')} />

      <div className="px-4 space-y-4">
        
        {/* Subscription expiry warning for premium users (≤3 days left) */}
        {subscriptionActive && subscriptionDaysLeft > 0 && subscriptionDaysLeft <= 3 && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-[#e17055]/15 to-[#ff6b6b]/10 border border-[#e17055]/20"
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

        {/* Premium upgrade banner for free users */}
        {!subscriptionActive && scansRemaining !== null && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade'); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7]/15 to-[#a29bfe]/10 border border-[#6c5ce7]/20"
          >
            <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/20 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-[#a29bfe]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {scansRemaining > 0
                  ? t('hn_scans_left', { n: scansRemaining })
                  : t('hn_scan_limit_reached')}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('hn_upgrade_premium')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#a29bfe]" />
          </motion.button>
        )}

        {/* Daily Calorie Overview */}
        <GlassCard className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-muted-foreground text-sm mb-1">{t('hn_todays_calories')}</p>
              <h2 className="text-3xl text-foreground font-semibold">
                {nutritionData.caloriesConsumed}
                <span className="text-lg text-muted-foreground ml-1">/ {nutritionData.caloriesGoal}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#6c5ce7]/10 border border-[#6c5ce7]/20">
              <Flame className="w-4 h-4 text-[#fd79a8]" />
              <span className="text-sm text-foreground/80">{percentConsumed}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-3 rounded-full overflow-hidden mb-4" style={{ background: 'var(--glass-bg-row)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percentConsumed, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`absolute inset-y-0 left-0 rounded-full ${
                percentConsumed > 100
                  ? 'bg-gradient-to-r from-[#ff6b6b] to-[#ee5a24]'
                  : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
              }`}
            />
          </div>

          {/* Calorie Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Target className="w-3.5 h-3.5 text-[#6c5ce7]" />
                <span className="text-xs text-muted-foreground">{t('hn_target')}</span>
              </div>
              <p className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {nutritionData.caloriesGoal}
              </p>
              <p className="text-muted-foreground/50 text-xs mt-0.5">{t('hn_cal_unit')}</p>
            </div>
            <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame className="w-3.5 h-3.5 text-[#fd79a8]" />
                <span className="text-xs text-muted-foreground">{t('hn_consumed')}</span>
              </div>
              <p className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {nutritionData.caloriesConsumed}
              </p>
              <p className="text-muted-foreground/50 text-xs mt-0.5">{t('hn_cal_unit')}</p>
            </div>
            <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#00cec9]" />
                <span className="text-xs text-muted-foreground">{t('hn_remaining')}</span>
              </div>
              <p className={`${caloriesRemaining >= 0 ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`} style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {caloriesRemaining >= 0 ? caloriesRemaining : 0}
              </p>
              <p className="text-muted-foreground/50 text-xs mt-0.5">{t('hn_cal_unit')}</p>
            </div>
          </div>

          {/* BMR Info Row */}
          {bmr > 0 && (
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#e17055]/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[#e17055]" />
                </div>
                <span className="text-xs text-muted-foreground">{t('hn_bmr')}</span>
                <span className="text-sm text-foreground/70">{bmr} {t('hn_cal_unit')}</span>
              </div>
              {maintenanceCalories > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('hn_tdee')}</span>
                  <span className="text-sm text-foreground/70">{maintenanceCalories} {t('hn_cal_unit')}</span>
                </div>
              )}
            </div>
          )}

          {/* Macros */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('hn_protein')}</p>
              <p className="text-sm text-foreground font-medium">{nutritionData.protein}{t('unit_g')}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('hn_carbs')}</p>
              <p className="text-sm text-foreground font-medium">{nutritionData.carbs}{t('unit_g')}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('hn_fats')}</p>
              <p className="text-sm text-foreground font-medium">{nutritionData.fats}{t('unit_g')}</p>
            </div>
          </div>
        </GlassCard>

        {/* Scan Food Button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleScanFood}
          className="w-full p-5 rounded-[20px] bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-base">{t('hn_scan_food')}</p>
              <p className="text-white/70 text-sm">{t('hn_scan_food_desc')}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80" />
        </motion.button>

        {/* AI Nutrition Coach Card */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => { hapticFeedback('medium'); navigate('/nutrition-coach'); }}
          className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#00b894]/15 to-[#00cec9]/10 border border-[#00b894]/20 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#00b894] to-[#00cec9] flex items-center justify-center">
              <Salad className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="text-foreground font-medium" style={{ fontSize: '0.9375rem' }}>
                  {t('nutri_coach_home_title')}
                </p>
                <PremiumBadge />
              </div>
              <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                {t('nutri_coach_home_desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-[#00b894]/60" />
            <ChevronRight className="w-4 h-4 text-[#00b894]/60" />
          </div>
        </motion.button>

        {/* Weight Tracking Quick Action */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => { hapticFeedback('medium'); navigate('/weight'); }}
          className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#74b9ff]/15 to-[#0984e3]/10 border border-[#74b9ff]/20 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#74b9ff] to-[#0984e3] flex items-center justify-center">
              <Scale className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-foreground font-medium" style={{ fontSize: '0.9375rem' }}>
                {t('weight_home_title')}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                {latestWeight
                  ? (weeklyWeightChange !== null
                    ? t('hn_weight_subtitle', { weight: latestWeight.weight, change: `${weeklyWeightChange >= 0 ? '+' : ''}${weeklyWeightChange.toFixed(1)}` })
                    : `${latestWeight.weight} ${t('unit_kg')}`)
                  : t('weight_home_desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-[#74b9ff]/60" />
            <ChevronRight className="w-4 h-4 text-[#74b9ff]/60" />
          </div>
        </motion.button>

        {/* Today's Meal Plan */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-[#fd79a8]" />
              <h3 className="text-foreground font-medium">{t('hn_todays_meals')}</h3>
            </div>
            <button
              onClick={() => {
                hapticFeedback('light');
                navigate('/calories');
              }}
              className="text-sm text-app-accent"
            >
              {todayMeals.length > 0 ? t('hn_view_all') : t('hn_log_food')}
            </button>
          </div>

          {todayMeals.length > 0 ? (
            <div className="space-y-2">
              {todayMeals.slice(0, 3).map((meal, idx) => (
                <motion.div
                  key={meal.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-glass-row"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      meal.completed ? 'bg-[#00cec9]/20' : 'bg-muted'
                    }`}>
                      {meal.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#00cec9]" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">{meal.name}</p>
                      <p className="text-muted-foreground text-xs">{meal.time}</p>
                    </div>
                  </div>
                  <span className="text-sm text-foreground/60">{meal.calories} {t('hn_cal_unit')}</span>
                </motion.div>
              ))}
              {todayMeals.length > 3 && (
                <p className="text-center text-muted-foreground text-xs pt-1">
                  {t('hn_more_entries', { n: todayMeals.length - 3 })}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">{t('hn_no_food_logged')}</p>
              <button
                onClick={() => { hapticFeedback('medium'); navigate('/calories/scan'); }}
                className="text-app-accent text-sm mt-2"
              >
                {t('hn_scan_or_add')}
              </button>
            </div>
          )}
        </GlassCard>

        {/* Today's Workout Plan */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-[#00cec9]" />
              <h3 className="text-foreground font-medium">{t('hn_todays_workouts')}</h3>
            </div>
            <button
              onClick={() => {
                hapticFeedback('light');
                navigate('/workout-plan');
              }}
              className="text-sm text-app-accent"
            >
              {todayWorkouts.length > 0 ? t('hn_view_all') : t('hn_create_plan')}
            </button>
          </div>

          {todayWorkouts.length > 0 ? (
            <div className="space-y-2">
              {todayWorkouts.map((workout, idx) => (
                <motion.div
                  key={workout.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-glass-row"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      workout.completed ? 'bg-[#00cec9]/20' : 'bg-muted'
                    }`}>
                      {workout.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#00cec9]" />
                      ) : (
                        <Dumbbell className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">{workout.name}</p>
                      <p className="text-muted-foreground text-xs">{workout.duration}</p>
                    </div>
                  </div>
                  <span className="text-sm text-[#fd79a8]">-{workout.calories} {t('hn_cal_unit')}</span>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">{t('hn_no_workout')}</p>
              <button
                onClick={() => { hapticFeedback('medium'); navigate('/workout-plan'); }}
                className="text-app-accent text-sm mt-2"
              >
                {t('hn_gen_workout')}
              </button>
            </div>
          )}
        </GlassCard>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-[#00cec9]" />
              <span className="text-xs text-muted-foreground">{t('hn_this_week')}</span>
            </div>
            <p className="text-xl text-foreground font-semibold">
              {weeklyWeightChange !== null
                ? `${weeklyWeightChange >= 0 ? '+' : ''}${weeklyWeightChange.toFixed(1)} kg`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t('hn_weight_progress')}</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-[#fd79a8]" />
              <span className="text-xs text-muted-foreground">{t('hn_today')}</span>
            </div>
            <p className="text-xl text-foreground font-semibold">
              {nutritionData.caloriesConsumed > 0
                ? nutritionData.caloriesConsumed.toLocaleString()
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t('hn_calories_consumed')}</p>
          </GlassCard>
        </div>
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
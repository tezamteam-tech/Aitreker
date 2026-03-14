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
  AlertCircle,
  Zap,
  Crown,
  Salad,
  Scale,
  BarChart3,
  Activity,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { calculateCalories, type CalorieResult } from './calorie-calculator';
import { StreakShareCard } from './streak-share-card';
import { SmartBurnCard } from './smart-burn-card';
import { ActivityLogger } from './activity-logger';

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

          {/* Potential Weight Change Indicator */}
          {(() => {
            const totalExpenditure = (maintenanceCalories || bmr || 0) + burnedToday;
            if (totalExpenditure <= 0) return null;
            const deficit = totalExpenditure - nutritionData.caloriesConsumed;
            // 7700 kcal ≈ 1 kg of body fat
            const weightChangeG = Math.round((deficit / 7700) * 1000);
            const isLoss = weightChangeG > 0;
            const absGrams = Math.abs(weightChangeG);
            const displayKg = absGrams >= 1000;
            const displayValue = displayKg ? (absGrams / 1000).toFixed(1) : absGrams;
            const displayUnit = displayKg ? t('hn_wc_kg') : t('hn_wc_g');

            return (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="mt-3 p-3 rounded-xl"
                style={{
                  background: isLoss
                    ? 'linear-gradient(135deg, rgba(0,206,201,0.06), rgba(108,92,231,0.04))'
                    : 'linear-gradient(135deg, rgba(255,107,107,0.06), rgba(238,90,36,0.04))',
                  border: `1px solid ${isLoss ? 'rgba(0,206,201,0.15)' : 'rgba(255,107,107,0.15)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isLoss ? 'bg-[#00cec9]/15' : 'bg-[#ff6b6b]/15'
                    }`}>
                      {isLoss
                        ? <TrendingDown className="w-4 h-4 text-[#00cec9]" />
                        : <TrendingUp className="w-4 h-4 text-[#ff6b6b]" />
                      }
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('hn_wc_title')}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-lg font-bold ${isLoss ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`}>
                          {isLoss ? '-' : '+'}{displayValue}
                        </span>
                        <span className="text-xs text-muted-foreground">{displayUnit}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.625rem] text-muted-foreground/50">{t('hn_wc_deficit')}</p>
                    <p className={`text-sm font-semibold ${isLoss ? 'text-[#00cec9]/80' : 'text-[#ff6b6b]/80'}`}>
                      {isLoss ? '-' : '+'}{Math.abs(deficit)} {t('hn_cal_unit')}
                    </p>
                  </div>
                </div>
                <p className="text-[0.5625rem] text-muted-foreground/40 mt-2 leading-relaxed">
                  {t('hn_wc_disclaimer')}
                </p>
              </motion.div>
            );
          })()}

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

        {/* ===== Quick Actions Grid (2×3 compact tiles) ===== */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Scan Food — primary action, gradient */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleScanFood}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] shadow-lg"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
              <Camera className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-white text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_scan')}</span>
          </motion.button>

          {/* AI Coach */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/nutrition-coach'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl border"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#00b894] to-[#00cec9] flex items-center justify-center">
              <Salad className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_coach')}</span>
          </motion.button>

          {/* Weight */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { hapticFeedback('medium'); navigate('/weight'); }}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl relative"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#74b9ff] to-[#0984e3] flex items-center justify-center">
              <Scale className="w-5.5 h-5.5 text-white" />
            </div>
            <span className="text-foreground text-[0.6875rem] font-medium leading-tight text-center">{t('hn_qa_weight')}</span>
            {latestWeight && (
              <span className="text-[0.5625rem] text-muted-foreground/60 -mt-1">{latestWeight.weight}{t('unit_kg')}</span>
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
            {todayMeals.length > 0 && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#fd79a8] text-white text-[0.625rem] font-bold flex items-center justify-center">{todayMeals.length}</span>
            )}
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
            {todayWorkouts.length > 0 && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#00cec9] text-white text-[0.625rem] font-bold flex items-center justify-center">{todayWorkouts.length}</span>
            )}
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
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
    caloriesConsumed: 1240,
    caloriesGoal: 2000,
    protein: 85,
    carbs: 120,
    fats: 45,
  });

  const [todayMeals, setTodayMeals] = useState<MealPlanItem[]>([
    { id: '1', name: 'Breakfast', time: '08:00', calories: 450, completed: true },
    { id: '2', name: 'Lunch', time: '13:00', calories: 650, completed: true },
    { id: '3', name: 'Snack', time: '16:00', calories: 140, completed: true },
    { id: '4', name: 'Dinner', time: '19:00', calories: 600, completed: false },
  ]);

  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutPlanItem[]>([
    { id: '1', name: 'Morning Run', duration: '30 min', calories: 280, completed: true },
    { id: '2', name: 'Upper Body', duration: '45 min', calories: 320, completed: false },
  ]);

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
      <PageHeader title={t('home_title') || 'Nutrition Tracker'} />

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
              <p className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                Premium expires in {subscriptionDaysLeft} day{subscriptionDaysLeft !== 1 ? 's' : ''}
              </p>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>
                Tap to renew and keep unlimited access
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
              <p className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {scansRemaining > 0
                  ? `${scansRemaining}/5 free scans left today`
                  : 'Daily scan limit reached'}
              </p>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>
                Upgrade to Premium for unlimited access
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#a29bfe]" />
          </motion.button>
        )}

        {/* Daily Calorie Overview */}
        <GlassCard className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-white/50 text-sm mb-1">Today's Calories</p>
              <h2 className="text-3xl text-white font-semibold">
                {nutritionData.caloriesConsumed}
                <span className="text-lg text-white/40 ml-1">/ {nutritionData.caloriesGoal}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#6c5ce7]/10 border border-[#6c5ce7]/20">
              <Flame className="w-4 h-4 text-[#fd79a8]" />
              <span className="text-sm text-white/80">{percentConsumed}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-3 rounded-full bg-white/5 overflow-hidden mb-4">
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
            <div className="text-center p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Target className="w-3.5 h-3.5 text-[#6c5ce7]" />
                <span className="text-xs text-white/40">Target</span>
              </div>
              <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {nutritionData.caloriesGoal}
              </p>
              <p className="text-white/25 text-xs mt-0.5">cal</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame className="w-3.5 h-3.5 text-[#fd79a8]" />
                <span className="text-xs text-white/40">Consumed</span>
              </div>
              <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {nutritionData.caloriesConsumed}
              </p>
              <p className="text-white/25 text-xs mt-0.5">cal</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#00cec9]" />
                <span className="text-xs text-white/40">Remaining</span>
              </div>
              <p className={`${caloriesRemaining >= 0 ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`} style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {caloriesRemaining >= 0 ? caloriesRemaining : 0}
              </p>
              <p className="text-white/25 text-xs mt-0.5">cal</p>
            </div>
          </div>

          {/* BMR Info Row */}
          {bmr > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#e17055]/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[#e17055]" />
                </div>
                <span className="text-xs text-white/40">BMR</span>
                <span className="text-sm text-white/70">{bmr} cal</span>
              </div>
              {maintenanceCalories > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">TDEE</span>
                  <span className="text-sm text-white/70">{maintenanceCalories} cal</span>
                </div>
              )}
            </div>
          )}

          {/* Macros */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Protein</p>
              <p className="text-sm text-white font-medium">{nutritionData.protein}g</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Carbs</p>
              <p className="text-sm text-white font-medium">{nutritionData.carbs}g</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Fats</p>
              <p className="text-sm text-white font-medium">{nutritionData.fats}g</p>
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
              <p className="text-white font-medium text-base">Scan Food</p>
              <p className="text-white/70 text-sm">AI-powered calorie tracker</p>
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
                <p className="text-white font-medium" style={{ fontSize: '0.9375rem' }}>
                  {t('nutri_coach_home_title')}
                </p>
                <PremiumBadge />
              </div>
              <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
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
              <p className="text-white font-medium" style={{ fontSize: '0.9375rem' }}>
                {t('weight_home_title') || 'Weight Tracking'}
              </p>
              <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
                {latestWeight
                  ? `${latestWeight.weight} kg${weeklyWeightChange !== null ? ` (${weeklyWeightChange >= 0 ? '+' : ''}${weeklyWeightChange.toFixed(1)} this week)` : ''}`
                  : (t('weight_home_desc') || 'Log your weight & track progress')}
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
              <h3 className="text-white font-medium">Today's Meals</h3>
            </div>
            <button
              onClick={() => {
                hapticFeedback('light');
                navigate('/meal-plan');
              }}
              className="text-sm text-[#a29bfe]"
            >
              View All
            </button>
          </div>

          <div className="space-y-2">
            {todayMeals.slice(0, 3).map((meal, idx) => (
              <motion.div
                key={meal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    meal.completed ? 'bg-[#00cec9]/20' : 'bg-white/10'
                  }`}>
                    {meal.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#00cec9]" />
                    ) : (
                      <Clock className="w-4 h-4 text-white/40" />
                    )}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{meal.name}</p>
                    <p className="text-white/40 text-xs">{meal.time}</p>
                  </div>
                </div>
                <span className="text-sm text-white/60">{meal.calories} cal</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        {/* Today's Workout Plan */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-[#00cec9]" />
              <h3 className="text-white font-medium">Today's Workouts</h3>
            </div>
            <button
              onClick={() => {
                hapticFeedback('light');
                navigate('/workout-plan');
              }}
              className="text-sm text-[#a29bfe]"
            >
              View All
            </button>
          </div>

          <div className="space-y-2">
            {todayWorkouts.map((workout, idx) => (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    workout.completed ? 'bg-[#00cec9]/20' : 'bg-white/10'
                  }`}>
                    {workout.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#00cec9]" />
                    ) : (
                      <Dumbbell className="w-4 h-4 text-white/40" />
                    )}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{workout.name}</p>
                    <p className="text-white/40 text-xs">{workout.duration}</p>
                  </div>
                </div>
                <span className="text-sm text-[#fd79a8]">-{workout.calories} cal</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-[#00cec9]" />
              <span className="text-xs text-white/50">This Week</span>
            </div>
            <p className="text-xl text-white font-semibold">{weeklyWeightChange !== null ? `${weeklyWeightChange.toFixed(1)} kg` : '-0.5 kg'}</p>
            <p className="text-xs text-white/40 mt-1">Weight progress</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-[#fd79a8]" />
              <span className="text-xs text-white/50">Avg/Day</span>
            </div>
            <p className="text-xl text-white font-semibold">1,850</p>
            <p className="text-xs text-white/40 mt-1">Calories burned</p>
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
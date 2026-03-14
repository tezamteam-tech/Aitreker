// =============================================
// Workout Plan — AI-Powered Generator + Weekly Schedule
// =============================================
// Features:
//   - Home / Gym workout type selection
//   - Generate plans for 7 / 30 / 100 days
//   - Calls Supabase Edge Function → OpenAI
//   - Weekly schedule calendar UI
//   - Per-day exercises: sets, reps, duration
//   - Exercise completion tracking
//   - Saved plans history
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Clock,
  Dumbbell,
  Heart,
  Zap,
  Target,
  Home,
  Building2,
  CheckCircle2,
  ChevronDown,
  History,
  Trash2,
  X,
  Timer,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Trophy,
  Play,
  Camera,
  Utensils,
  Scale,
  Ruler,
  User,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api, type WorkoutPlanData } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { CameraCapture } from './camera-capture';
import { PhotoSourcePicker } from './photo-source-picker';
import { SwipeableBottomSheet } from './ui/swipeable-bottom-sheet';

// ---- Types ----
type PlanLength = 7 | 30 | 100;
type WorkoutLocation = 'home' | 'gym';
type WorkoutType = 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'rest';
type ViewState = 'empty' | 'configuring' | 'generating' | 'viewing' | 'error';

interface UserProfile {
  goal: string;
  gender: string;
  activity_level: string;
  age?: number;
  height?: number;
  weight?: number;
  daily_calorie_target?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
}

interface NutritionContext {
  caloriesConsumed: number;
  hasMealPlan: boolean;
  mealPlanSummary?: string;
}

interface SavedPlan {
  id: string;
  plan_length: number;
  workout_type: WorkoutLocation;
  workout_data: WorkoutPlanData;
  nutrition_tips?: string[];
  created_at: string;
  user_wishes?: string;
}

// ---- Workout type config ----
const WORKOUT_TYPE_CONFIG: Record<WorkoutType, { icon: React.ElementType; color: string; key: string }> = {
  strength: { icon: Dumbbell, color: '#6c5ce7', key: 'wp_type_strength' },
  cardio: { icon: Heart, color: '#fd79a8', key: 'wp_type_cardio' },
  flexibility: { icon: Zap, color: '#00cec9', key: 'wp_type_flexibility' },
  hiit: { icon: Flame, color: '#e17055', key: 'wp_type_hiit' },
  rest: { icon: Target, color: '#74b9ff', key: 'wp_type_rest' },
};

const PLAN_OPTIONS: { length: PlanLength; labelKey: string; descKey: string; color: string }[] = [
  { length: 7, labelKey: 'wp_plan_7_label', descKey: 'wp_plan_7_desc', color: '#00cec9' },
  { length: 30, labelKey: 'wp_plan_30_label', descKey: 'wp_plan_30_desc', color: '#6c5ce7' },
  { length: 100, labelKey: 'wp_plan_100_label', descKey: 'wp_plan_100_desc', color: '#fd79a8' },
];

const GOAL_LABELS: Record<string, { en: string; ru: string }> = {
  lose_weight: { en: 'Weight Loss', ru: 'Похудение' },
  maintain_weight: { en: 'Maintenance', ru: 'Поддержание' },
  gain_muscle: { en: 'Muscle Gain', ru: 'Набор массы' },
};

// ---- Generation message keys ----
const GEN_MESSAGE_KEYS = [
  'wp_gen_1', 'wp_gen_2', 'wp_gen_3', 'wp_gen_4', 'wp_gen_5', 'wp_gen_6',
];
const GEN_MESSAGE_KEYS_LONG = [
  'wp_gen_phases', 'wp_gen_1', 'wp_gen_2', 'wp_gen_3', 'wp_gen_4',
  'wp_gen_5', 'wp_gen_6', 'wp_gen_1', 'wp_gen_2', 'wp_gen_3',
  'wp_gen_4', 'wp_gen_5', 'wp_gen_6',
];

// ---- Lang ----
function useLang() {
  const { t } = useTranslation();
  return t('nav_home') === '\u0413\u043B\u0430\u0432\u043D\u0430\u044F' ? 'ru' : 'en';
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function WorkoutPlanPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const lang = useLang();

  const [viewState, setViewState] = useState<ViewState>('empty');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workoutLocation, setWorkoutLocation] = useState<WorkoutLocation>('home');
  const [selectedLength, setSelectedLength] = useState<PlanLength>(7);
  const [currentPlan, setCurrentPlan] = useState<SavedPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [genMessage, setGenMessage] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [dayLoggedToServer, setDayLoggedToServer] = useState<Set<number>>(new Set());
  const [loggingDay, setLoggingDay] = useState(false);
  const genIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Body photo state
  const [bodyPhoto, setBodyPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  // User wishes / preferences (persisted in localStorage)
  const [userWishes, setUserWishes] = useState(() => localStorage.getItem('wp_user_wishes') || '');

  // Persist wishes to localStorage
  useEffect(() => {
    localStorage.setItem('wp_user_wishes', userWishes);
  }, [userWishes]);

  // Quick chip toggle helper
  const toggleChip = (chipText: string) => {
    setUserWishes((prev) => {
      const trimmed = prev.trim();
      if (trimmed.includes(chipText)) {
        return trimmed.replace(chipText, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
      }
      return trimmed ? `${trimmed}, ${chipText}` : chipText;
    });
    hapticFeedback('light');
  };

  // Progress photos state
  const [progressPhotos, setProgressPhotos] = useState<Array<{ id: string; url: string; plan_id: string | null; day_number: number | null; note: string; created_at: string }>>([]);
  const [showProgressCamera, setShowProgressCamera] = useState(false);
  const [showProgressPhotoPicker, setShowProgressPhotoPicker] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [uploadingProgress, setUploadingProgress] = useState(false);

  // Nutrition context state
  const [nutritionCtx, setNutritionCtx] = useState<NutritionContext>({
    caloriesConsumed: 0,
    hasMealPlan: false,
  });

  // Load profile with full metrics
  useEffect(() => {
    const cachedGoal = localStorage.getItem('nutrition_goal');
    const cachedGender = localStorage.getItem('nutrition_gender');
    const cachedActivity = localStorage.getItem('nutrition_activity');

    if (cachedGoal && cachedGender && cachedActivity) {
      setProfile({ goal: cachedGoal, gender: cachedGender, activity_level: cachedActivity });
    }

    if (!user) return;
    api.getUserProfile().then((p) => {
      if (!p) return;
      const prof: UserProfile = {
        goal: p.goal || 'maintain_weight',
        gender: p.gender || 'male',
        activity_level: p.activity_level || 'medium',
        age: p.age,
        height: p.height,
        weight: p.weight,
        daily_calorie_target: p.daily_calorie_target,
        target_protein: p.target_protein,
        target_carbs: p.target_carbs,
        target_fat: p.target_fat,
      };
      setProfile(prof);
      localStorage.setItem('nutrition_goal', prof.goal);
      localStorage.setItem('nutrition_gender', prof.gender);
      localStorage.setItem('nutrition_activity', prof.activity_level);
    }).catch(() => {});

    // Load today's food entries for nutrition context
    const today = new Date().toISOString().slice(0, 10);
    api.getFoodEntries(today).then((data) => {
      setNutritionCtx((prev) => ({ ...prev, caloriesConsumed: data.totals?.calories || 0 }));
    }).catch(() => {});

    // Check for active meal plan
    api.getMealPlans().then((res) => {
      if (res.plans && res.plans.length > 0) {
        setNutritionCtx((prev) => ({
          ...prev,
          hasMealPlan: true,
          mealPlanSummary: res.plans[0].preview || undefined,
        }));
      }
    }).catch(() => {});
  }, [user]);

  // Try loading most recent plan
  useEffect(() => {
    if (!user) return;
    api.getWorkoutPlans().then((res) => {
      if (res.plans && res.plans.length > 0) {
        const latest = res.plans[0];
        api.getWorkoutPlan(latest.id).then((full) => {
          setCurrentPlan(full);
          setWorkoutLocation(full.workout_type);
          setViewState('viewing');
          setSelectedDay(1);
        }).catch(() => setViewState('empty'));
      }
    }).catch(() => {});
  }, [user]);

  // Load progress photos when plan changes
  useEffect(() => {
    if (!currentPlan || !user) return;
    api.getProgressPhotos(currentPlan.id).then((res) => {
      setProgressPhotos(res.photos || []);
    }).catch(() => {});
  }, [currentPlan?.id, user]);

  // Load completed from localStorage
  useEffect(() => {
    if (!currentPlan) return;
    const stored = localStorage.getItem(`workout_completed_${currentPlan.id}`);
    if (stored) {
      try { setCompletedExercises(new Set(JSON.parse(stored))); } catch {}
    }
  }, [currentPlan?.id]);

  // Save completed to localStorage
  useEffect(() => {
    if (!currentPlan) return;
    localStorage.setItem(`workout_completed_${currentPlan.id}`, JSON.stringify([...completedExercises]));
  }, [completedExercises, currentPlan?.id]);

  // Gen animation
  useEffect(() => {
    if (viewState !== 'generating') {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      return;
    }
    setGenMessage(0);
    const msgKeys = selectedLength > 14 ? GEN_MESSAGE_KEYS_LONG : GEN_MESSAGE_KEYS;
    genIntervalRef.current = setInterval(() => {
      setGenMessage((p) => (p >= msgKeys.length - 1 ? p : p + 1));
    }, selectedLength > 14 ? 5000 : 3000);
    return () => { if (genIntervalRef.current) clearInterval(genIntervalRef.current); };
  }, [viewState]);

  // Generate
  const handleGenerate = useCallback(async () => {
    if (!profile) return;
    hapticFeedback('medium');
    setViewState('generating');
    setErrorMsg('');

    try {
      // Extract base64 from body photo data URL
      let imageBase64: string | undefined;
      let mimeType: string | undefined;
      if (bodyPhoto) {
        const match = bodyPhoto.match(/^data:(.+?);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          imageBase64 = match[2];
        }
      }

      const result = await api.generateWorkoutPlan({
        plan_length: selectedLength,
        workout_type: workoutLocation,
        goal: profile.goal,
        gender: profile.gender,
        activity_level: profile.activity_level,
        // Body metrics
        age: profile.age,
        height: profile.height,
        weight: profile.weight,
        // Photo
        imageBase64,
        mimeType,
        // Nutrition context
        daily_calorie_target: profile.daily_calorie_target,
        calories_consumed_today: nutritionCtx.caloriesConsumed || undefined,
        target_protein: profile.target_protein,
        target_carbs: profile.target_carbs,
        target_fat: profile.target_fat,
        has_meal_plan: nutritionCtx.hasMealPlan,
        meal_plan_summary: nutritionCtx.mealPlanSummary,
        language: lang,
        user_wishes: userWishes,
      });
      hapticSuccess();
      setCurrentPlan(result);
      setSelectedDay(1);
      setCompletedExercises(new Set());
      setBodyPhoto(null); // Clear photo after generation
      setViewState('viewing');
    } catch (err: any) {
      hapticError();
      setErrorMsg(err?.message || 'Failed to generate workout plan');
      setViewState('error');
    }
  }, [profile, selectedLength, workoutLocation, bodyPhoto, nutritionCtx, lang, userWishes]);

  // Toggle exercise
  const toggleExercise = (dayNum: number, exerciseIdx: number) => {
    hapticFeedback('light');
    const key = `${dayNum}-${exerciseIdx}`;
    setCompletedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Log workout day completion to backend
  const handleLogDayCompletion = async () => {
    if (!currentPlan || !dayData || loggingDay) return;
    setLoggingDay(true);
    hapticFeedback('medium');
    try {
      await api.logWorkoutCompletion({
        plan_id: currentPlan.id,
        day_number: selectedDay,
        workout_name: dayData.focus || dayData.workout_type || 'Workout',
        duration_minutes: dayData.duration_minutes || 0,
        calories_burned: (dayData as any).estimated_calories_burn || (dayData as any).calories_burn || 0,
        exercises_completed: dayCompletedCount,
      });
      hapticSuccess();
      setDayLoggedToServer((prev) => new Set(prev).add(selectedDay));
    } catch (err) {
      console.warn('[Workout] Failed to log completion:', err);
      hapticError();
    } finally {
      setLoggingDay(false);
    }
  };

  // Upload progress photo
  const handleUploadProgressPhoto = useCallback(async (dataUrl: string) => {
    if (!currentPlan || uploadingProgress) return;
    setUploadingProgress(true);
    hapticFeedback('medium');
    try {
      const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!match) return;
      const res = await api.uploadProgressPhoto({
        imageBase64: match[2],
        mimeType: match[1],
        plan_id: currentPlan.id,
        day_number: selectedDay,
        note: progressNote,
      });
      setProgressPhotos((prev) => [res, ...prev]);
      setProgressNote('');
      hapticSuccess();
    } catch (err) {
      console.error('[Progress Photo] Upload error:', err);
      hapticError();
    } finally {
      setUploadingProgress(false);
      setShowProgressCamera(false);
    }
  }, [currentPlan, selectedDay, progressNote, uploadingProgress]);

  // History
  const handleShowHistory = useCallback(async () => {
    hapticFeedback('light');
    setShowHistory(true);
    if (!user) return;
    try {
      const res = await api.getWorkoutPlans();
      const full: SavedPlan[] = [];
      for (const p of res.plans.slice(0, 10)) {
        try { const f = await api.getWorkoutPlan(p.id); full.push(f); } catch {}
      }
      setSavedPlans(full);
    } catch {}
  }, [user]);

  // Current day data
  const dayData = currentPlan?.workout_data?.days?.find((d) => d.day === selectedDay);
  const totalDays = currentPlan?.plan_length || 0;

  // Day stats
  const dayExerciseCount = dayData?.exercises?.length || 0;
  const dayCompletedCount = dayData?.exercises?.filter((_, i) => completedExercises.has(`${selectedDay}-${i}`)).length || 0;
  const dayProgress = dayExerciseCount > 0 ? Math.round((dayCompletedCount / dayExerciseCount) * 100) : 0;

  return (
    <div className="min-h-screen pb-28">
      <PageHeader
        title={t('wp_title')}
        subtitle={
          currentPlan
            ? `${currentPlan.workout_type === 'home' ? t('wp_home_label') : t('wp_gym_label')} · ${currentPlan.plan_length} ${t('shared_days_unit')}`
            : undefined
        }
        actions={
          viewState === 'viewing' ? (
            <div className="flex gap-1.5 px-4">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleShowHistory}
                className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center"
              >
                <History className="w-4 h-4 text-white/50" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { hapticFeedback('light'); setViewState('configuring'); }}
                className="w-9 h-9 rounded-xl bg-[#6c5ce7]/15 border border-[#6c5ce7]/25 flex items-center justify-center"
              >
                <Sparkles className="w-4 h-4 text-[#a29bfe]" />
              </motion.button>
            </div>
          ) : undefined
        }
      />

      <div className="px-4 space-y-4">
        <AnimatePresence mode="wait">
          {/* ======== CONFIG STATE ======== */}
          {(viewState === 'empty' || viewState === 'configuring') && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              {/* Workout Location */}
              <div>
                <p className="text-muted-foreground mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {t('wp_where')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <LocationCard
                    icon={Home}
                    label={t('wp_at_home')}
                    desc={t('wp_no_equip')}
                    color="#00cec9"
                    selected={workoutLocation === 'home'}
                    onSelect={() => { hapticFeedback('light'); setWorkoutLocation('home'); }}
                  />
                  <LocationCard
                    icon={Building2}
                    label={t('wp_at_gym')}
                    desc={t('wp_full_equip')}
                    color="#6c5ce7"
                    selected={workoutLocation === 'gym'}
                    onSelect={() => { hapticFeedback('light'); setWorkoutLocation('gym'); }}
                  />
                </div>
              </div>

              {/* Profile summary */}
              {profile && (
                <GlassCard className="!p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                      <Target className="w-5 h-5 text-[#a29bfe]" />
                    </div>
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                        {t('shared_your_profile')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                        {t('shared_ai_tailor')}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <InfoPill
                      label={t('shared_goal_label')}
                      value={GOAL_LABELS[profile.goal]?.[lang as 'en' | 'ru'] || profile.goal}
                      color="#6c5ce7"
                    />
                    <InfoPill
                      label={t('shared_gender_label')}
                      value={profile.gender === 'male' ? t('wp_gender_m') : t('wp_gender_f')}
                      color="#00cec9"
                    />
                    <InfoPill
                      label={t('shared_activity_label')}
                      value={
                        profile.activity_level === 'low' ? t('obn_activity_low') :
                        profile.activity_level === 'medium' ? t('obn_activity_medium') :
                        profile.activity_level === 'high' ? t('obn_activity_high') :
                        t('obn_activity_athlete')
                      }
                      color="#ffeaa7"
                    />
                  </div>
                </GlassCard>
              )}

              {!profile && (
                <GlassCard className="!p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertCircle className="w-6 h-6 text-[#fdcb6e]" />
                    <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {t('shared_complete_profile')}
                    </p>
                  </div>
                  <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {t('wp_complete_onboarding')}
                  </p>
                </GlassCard>
              )}

              {/* Plan length */}
              <div>
                <p className="text-muted-foreground mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {t('wp_plan_length')}
                </p>
                <div className="space-y-3">
                  {PLAN_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.length}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { hapticFeedback('light'); setSelectedLength(opt.length); }}
                      className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${
                        selectedLength === opt.length
                          ? 'bg-[#6c5ce7]/10 border-2 border-[#6c5ce7]/30'
                          : 'bg-white/[0.03] border-2 border-white/[0.06]'
                      }`}
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${opt.color}15` }}
                      >
                        <span className="text-white" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{opt.length}</span>
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
                          {t(opt.labelKey)}
                        </p>
                        <p className="text-white/40" style={{ fontSize: '0.8125rem' }}>
                          {t(opt.descKey)}
                        </p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedLength === opt.length ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                      }`}>
                        {selectedLength === opt.length && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ---- YOUR BODY section ---- */}
              {profile && (profile.age || profile.height || profile.weight) && (
                <GlassCard className="!p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#e17055]/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-[#fd79a8]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                        {t('wp_your_body')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                        {t('wp_body_desc')}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {profile.age ? (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2 text-center">
                        <p className="text-white/35" style={{ fontSize: '0.5625rem' }}>{t('wp_age_label')}</p>
                        <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{profile.age}</p>
                      </div>
                    ) : null}
                    {profile.height ? (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2 text-center">
                        <p className="text-white/35" style={{ fontSize: '0.5625rem' }}>{t('wp_height_label')}</p>
                        <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{profile.height}<span className="text-white/30 text-[0.5rem]">cm</span></p>
                      </div>
                    ) : null}
                    {profile.weight ? (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2 text-center">
                        <p className="text-white/35" style={{ fontSize: '0.5625rem' }}>{t('wp_weight_label')}</p>
                        <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{profile.weight}<span className="text-white/30 text-[0.5rem]">kg</span></p>
                      </div>
                    ) : null}
                    {profile.height && profile.weight ? (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2 text-center">
                        <p className="text-white/35" style={{ fontSize: '0.5625rem' }}>{t('wp_bmi_label')}</p>
                        <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                          {(profile.weight / ((profile.height / 100) ** 2)).toFixed(1)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {bodyPhoto ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#00cec9]/8 border border-[#00cec9]/20">
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={bodyPhoto} alt="Body" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[#00cec9]" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('wp_photo_added')}</p>
                        <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>{t('wp_photo_hint')}</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => { hapticFeedback('light'); setBodyPhoto(null); }} className="px-2.5 py-1 rounded-lg bg-white/[0.06]">
                        <span className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('wp_remove_photo')}</span>
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { hapticFeedback('light'); setShowPhotoPicker(true); }} className="w-full p-3 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center gap-2 bg-white/[0.01]">
                      <Camera className="w-4 h-4 text-[#fd79a8]" />
                      <span className="text-white/50" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t('wp_add_photo')}</span>
                    </motion.button>
                  )}
                </GlassCard>
              )}

              {/* ---- NUTRITION LINK section ---- */}
              {profile && (profile.daily_calorie_target || nutritionCtx.hasMealPlan || nutritionCtx.caloriesConsumed > 0) && (
                <GlassCard className="!p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00cec9]/20 to-[#74b9ff]/20 flex items-center justify-center">
                      <Utensils className="w-5 h-5 text-[#00cec9]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('wp_nutrition_link')}</p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{t('wp_nutrition_link_desc')}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {profile.daily_calorie_target ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{t('wp_cal_target')}</span>
                        <span className="text-[#00cec9]" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                          {profile.daily_calorie_target} <span style={{ fontSize: '0.6875rem', fontWeight: 400 }}>kcal</span>
                        </span>
                      </div>
                    ) : null}
                    {nutritionCtx.caloriesConsumed > 0 && profile.daily_calorie_target ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{t('wp_cal_consumed')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{nutritionCtx.caloriesConsumed}</span>
                          {(() => {
                            const diff = nutritionCtx.caloriesConsumed - (profile.daily_calorie_target || 0);
                            if (Math.abs(diff) < 50) return null;
                            const isOver = diff > 0;
                            return (
                              <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize: '0.5625rem', fontWeight: 600, backgroundColor: isOver ? '#e1705515' : '#00cec915', color: isOver ? '#e17055' : '#00cec9' }}>
                                {isOver ? '+' : ''}{diff} {isOver ? t('wp_cal_surplus') : t('wp_cal_deficit')}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ) : null}
                    {(profile.target_protein || profile.target_carbs || profile.target_fat) ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{t('wp_macros_label')}</span>
                        <div className="flex items-center gap-2">
                          {profile.target_protein ? <span className="px-1.5 py-0.5 rounded-full bg-[#6c5ce7]/15 text-[#a29bfe]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>P {profile.target_protein}g</span> : null}
                          {profile.target_carbs ? <span className="px-1.5 py-0.5 rounded-full bg-[#fdcb6e]/15 text-[#fdcb6e]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>C {profile.target_carbs}g</span> : null}
                          {profile.target_fat ? <span className="px-1.5 py-0.5 rounded-full bg-[#e17055]/15 text-[#e17055]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>F {profile.target_fat}g</span> : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{nutritionCtx.hasMealPlan ? t('wp_meal_plan_active') : t('wp_no_meal_plan')}</span>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nutritionCtx.hasMealPlan ? '#00cec9' : '#ffffff15' }} />
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* ---- USER WISHES section ---- */}
              {profile && (
                <div>
                  <div className="flex items-center gap-2.5 mb-2 px-1">
                    <Sparkles className="w-4 h-4 text-[#fdcb6e]" />
                    <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                      {t('wp_wishes_title')}
                    </p>
                    <span className="text-white/15 ml-auto" style={{ fontSize: '0.625rem' }}>
                      {t('shared_optional')}
                    </span>
                  </div>
                  <p className="text-white/25 mb-2 px-1" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
                    {t('wp_wishes_desc')}
                  </p>
                  <textarea
                    value={userWishes}
                    onChange={(e) => setUserWishes(e.target.value)}
                    placeholder={t('wp_wishes_placeholder')}
                    rows={3}
                    className="w-full rounded-xl px-4 py-3 bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/15 outline-none resize-none focus:border-[#fdcb6e]/30 transition-colors"
                    style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                    maxLength={500}
                  />
                  {/* Quick chip suggestions */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(['wp_chip_no_equipment', 'wp_chip_dumbbells', 'wp_chip_kettlebell', 'wp_chip_bands', 'wp_chip_intense', 'wp_chip_gentle', 'wp_chip_30min', 'wp_chip_lose10'] as const).map((chipKey) => {
                      const chipText = t(chipKey);
                      const isActive = userWishes.includes(chipText);
                      return (
                        <motion.button
                          key={chipKey}
                          whileTap={{ scale: 0.93 }}
                          onClick={() => toggleChip(chipText)}
                          className={`px-2.5 py-1 rounded-full border transition-all ${
                            isActive
                              ? 'bg-[#fdcb6e]/15 border-[#fdcb6e]/30 text-[#fdcb6e]'
                              : 'bg-white/[0.02] border-white/[0.08] text-white/35'
                          }`}
                          style={{ fontSize: '0.6875rem', fontWeight: 500 }}
                        >
                          {chipText}
                        </motion.button>
                      );
                    })}
                  </div>
                  {userWishes.length > 0 && (
                    <p className="text-white/15 text-right mt-1 px-1" style={{ fontSize: '0.625rem' }}>
                      {userWishes.length}/500
                    </p>
                  )}
                </div>
              )}

              {/* Generate */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGenerate}
                disabled={!profile}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-3 disabled:opacity-40 disabled:saturate-0"
                style={{ boxShadow: profile ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}
              >
                <Dumbbell className="w-5 h-5 text-white" />
                <span className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                  {t('wp_generate_n', { n: selectedLength })}
                </span>
              </motion.button>
            </motion.div>
          )}

          {/* ======== GENERATING ======== */}
          {viewState === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12"
            >
              <GeneratingAnimation messageIndex={genMessage} planLength={selectedLength} location={workoutLocation} />
            </motion.div>
          )}

          {/* ======== ERROR ======== */}
          {viewState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="py-12"
            >
              <div className="text-center">
                <div className="w-20 h-20 rounded-[1.5rem] bg-[#ff6b6b]/10 border border-[#ff6b6b]/20 flex items-center justify-center mx-auto mb-5">
                  <AlertCircle className="w-8 h-8 text-[#ff6b6b]" />
                </div>
                <p className="text-white mb-2" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  {t('shared_gen_failed')}
                </p>
                <p className="text-white/40 mb-6 max-w-[280px] mx-auto" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {errorMsg}
                </p>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGenerate}
                  className="px-8 h-12 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                  <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {t('shared_try_again')}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ======== VIEWING ======== */}
          {viewState === 'viewing' && currentPlan && (
            <motion.div
              key="viewing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              {/* Weekly Schedule */}
              <WeeklySchedule
                totalDays={totalDays}
                selectedDay={selectedDay}
                onSelectDay={(day) => { hapticFeedback('light'); setSelectedDay(day); }}
                planData={currentPlan.workout_data}
                planCreatedAt={currentPlan.created_at}
                lang={lang}
              />

              {/* Day Header Card */}
              {dayData && dayData.workout_type !== 'rest' && (
                <GlassCard className="!p-5" variant="elevated">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <WorkoutTypeIcon type={dayData.workout_type} size="lg" />
                      <div>
                        <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                          {dayData.focus}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-white/40" style={{ fontSize: '0.75rem' }}>
                            <Clock className="w-3 h-3" />
                            {dayData.duration_minutes} {t('wp_min')}
                          </span>
                          <span className="flex items-center gap-1 text-white/40" style={{ fontSize: '0.75rem' }}>
                            <Dumbbell className="w-3 h-3" />
                            {dayData.exercises.length} {t('wp_exercises_count')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Type badge */}
                    <span
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: `${WORKOUT_TYPE_CONFIG[dayData.workout_type]?.color || '#6c5ce7'}15`,
                        color: WORKOUT_TYPE_CONFIG[dayData.workout_type]?.color || '#6c5ce7',
                        fontWeight: 600,
                      }}
                    >
                      {t(WORKOUT_TYPE_CONFIG[dayData.workout_type]?.key || 'wp_type_strength')}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-white/35" style={{ fontSize: '0.6875rem' }}>
                        {t('wp_progress_label')}
                      </span>
                      <span className="text-white/60" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {dayCompletedCount}/{dayExerciseCount}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dayProgress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          background: dayProgress === 100
                            ? 'linear-gradient(90deg, #00cec9, #74b9ff)'
                            : 'linear-gradient(90deg, #6c5ce7, #a29bfe)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Completed badge + Log to server */}
                  {dayProgress === 100 && (
                    <div className="space-y-2">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20"
                      >
                        <Trophy className="w-4 h-4 text-[#00cec9]" />
                        <span className="text-white/80" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {t('wp_workout_complete')}
                        </span>
                      </motion.div>

                      {/* Save completion to backend for analytics */}
                      {!dayLoggedToServer.has(selectedDay) ? (
                        <motion.button
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleLogDayCompletion}
                          disabled={loggingDay}
                          className="w-full h-11 rounded-xl bg-gradient-to-r from-[#00cec9] to-[#74b9ff] flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loggingDay ? (
                            <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('wc_logging')}</span>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-white" />
                              <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                                {t('wc_complete_day')} · {(dayData as any)?.estimated_calories_burn || (dayData as any)?.calories_burn || 0} {t('unit_kcal')}
                              </span>
                            </>
                          )}
                        </motion.button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 py-2 text-[#00cec9]/60">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{t('wc_completed')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Rest Day */}
              {dayData && dayData.workout_type === 'rest' && (
                <GlassCard className="!p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#74b9ff]/10 border border-[#74b9ff]/20 flex items-center justify-center mx-auto mb-4">
                    <Target className="w-8 h-8 text-[#74b9ff]" />
                  </div>
                  <p className="text-white mb-2" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {t('wp_rest_day')}
                  </p>
                  <p className="text-white/40 max-w-[240px] mx-auto" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {t('wp_rest_desc')}
                  </p>
                </GlassCard>
              )}

              {/* Exercise List */}
              {dayData && dayData.workout_type !== 'rest' && dayData.exercises.length > 0 && (
                <div className="space-y-2">
                  <p className="text-white/40 px-1" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('wp_exercises_label')}
                  </p>
                  {dayData.exercises.map((exercise, idx) => {
                    const isCompleted = completedExercises.has(`${selectedDay}-${idx}`);
                    return (
                      <ExerciseCard
                        key={idx}
                        index={idx}
                        exercise={exercise}
                        isCompleted={isCompleted}
                        onToggle={() => toggleExercise(selectedDay, idx)}
                        lang={lang}
                      />
                    );
                  })}
                </div>
              )}

              {!dayData && (
                <div className="text-center py-12">
                  <p className="text-white/30" style={{ fontSize: '0.875rem' }}>
                    {t('shared_no_data')}
                  </p>
                </div>
              )}

              {/* Milestone — Progress Photo Prompt */}
              {currentPlan?.workout_data?.milestones && (() => {
                const milestone = (currentPlan.workout_data as any).milestones?.find((m: any) => m.day === selectedDay);
                if (!milestone) return null;
                const hasPhotoForDay = progressPhotos.some((p) => p.day_number === selectedDay);
                return (
                  <GlassCard className="!p-4 border-[#fd79a8]/20">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#e17055]/20 flex items-center justify-center">
                        <Camera className="w-5 h-5 text-[#fd79a8]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[#fd79a8]" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                          {t('wp_milestone_photo')}
                        </p>
                        <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>
                          {milestone.title} — {t('wp_milestone_photo_desc')}
                        </p>
                      </div>
                    </div>
                    {!hasPhotoForDay ? (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { hapticFeedback('light'); setShowProgressPhotoPicker(true); }}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-[#fd79a8] to-[#e17055] flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4 text-white" />
                        <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {t('pp_upload')}
                        </span>
                      </motion.button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20">
                        <CheckCircle2 className="w-4 h-4 text-[#00cec9]" />
                        <span className="text-white/60" style={{ fontSize: '0.75rem' }}>
                          {t('pp_milestone')} ✓
                        </span>
                      </div>
                    )}
                  </GlassCard>
                );
              })()}

              {/* Phase Info for long plans */}
              {currentPlan?.workout_data?.phases && (() => {
                const phases = (currentPlan.workout_data as any).phases;
                if (!phases?.length) return null;
                const weekNum = Math.floor((selectedDay - 1) / 7) + 1;
                const currentPhase = phases.find((p: any) => weekNum >= (p.week_start || 1) && weekNum <= (p.week_end || 999));
                if (!currentPhase) return null;
                return (
                  <GlassCard className="!p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center">
                        <Target className="w-4 h-4 text-[#a29bfe]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white/50" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                          {t('wp_phase_current')}
                        </p>
                        <p className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {t('wp_phase_label', { n: currentPhase.phase, name: currentPhase.name })}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{
                        backgroundColor: currentPhase.intensity === 'high' ? '#e1705520' : currentPhase.intensity === 'medium' ? '#fdcb6e20' : '#00cec920',
                        color: currentPhase.intensity === 'high' ? '#e17055' : currentPhase.intensity === 'medium' ? '#fdcb6e' : '#00cec9',
                        fontWeight: 600,
                      }}>
                        {currentPhase.intensity}
                      </span>
                    </div>
                  </GlassCard>
                );
              })()}

              {/* Progress Photos Section */}
              {currentPlan && currentPlan.plan_length >= 30 && (
                <GlassCard className="!p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#fd79a8]/15 flex items-center justify-center">
                        <Camera className="w-4 h-4 text-[#fd79a8]" />
                      </div>
                      <div>
                        <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {t('pp_title')}
                        </p>
                        <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                          {t('pp_subtitle')}
                        </p>
                      </div>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { hapticFeedback('light'); setShowProgressPhotoPicker(true); }}
                      className="w-8 h-8 rounded-lg bg-[#fd79a8]/15 flex items-center justify-center"
                    >
                      <Camera className="w-4 h-4 text-[#fd79a8]" />
                    </motion.button>
                  </div>

                  {progressPhotos.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-white/30" style={{ fontSize: '0.75rem' }}>{t('pp_no_photos')}</p>
                      <p className="text-white/15 mt-1" style={{ fontSize: '0.6875rem' }}>{t('pp_take_first')}</p>
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
                      {progressPhotos.slice(0, 10).map((photo) => (
                        <div key={photo.id} className="flex-shrink-0 w-20" style={{ scrollSnapAlign: 'start' }}>
                          <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 mb-1">
                            <img src={photo.url} alt="" className="w-full h-full object-cover" />
                          </div>
                          <p className="text-white/30 text-center" style={{ fontSize: '0.5625rem' }}>
                            {photo.day_number ? t('pp_day_n', { n: photo.day_number }) : new Date(photo.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Nutrition Tips from AI */}
              {currentPlan?.nutrition_tips && currentPlan.nutrition_tips.length > 0 && (
                <GlassCard className="!p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00cec9]/15 flex items-center justify-center">
                      <Lightbulb className="w-4 h-4 text-[#00cec9]" />
                    </div>
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {t('wp_nutrition_tips')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                        {t('wp_nutrition_tip_from_ai')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {currentPlan.nutrition_tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <span className="text-[#00cec9] flex-shrink-0 mt-0.5" style={{ fontSize: '0.75rem' }}>•</span>
                        <p className="text-white/60" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History Sheet */}
      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            plans={savedPlans}
            lang={lang}
            onSelect={(plan) => {
              hapticSuccess();
              setCurrentPlan(plan);
              setWorkoutLocation(plan.workout_type);
              setSelectedDay(1);
              setCompletedExercises(new Set());
              setViewState('viewing');
              setShowHistory(false);
            }}
            onDelete={async (planId) => {
              try {
                await api.deleteWorkoutPlan(planId);
                setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
                if (currentPlan?.id === planId) {
                  setCurrentPlan(null);
                  setViewState('empty');
                }
                hapticSuccess();
              } catch { hapticError(); }
            }}
            onClose={() => { hapticFeedback('light'); setShowHistory(false); }}
          />
        )}
      </AnimatePresence>

      {/* Photo source picker for body photo */}
      <PhotoSourcePicker
        open={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onPickCamera={() => setShowCamera(true)}
        onPickGallery={(dataUrl) => setBodyPhoto(dataUrl)}
      />

      {/* Camera for body photo (plan generation) */}
      <CameraCapture
        open={showCamera}
        onCapture={(dataUrl) => {
          setBodyPhoto(dataUrl);
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
      />

      {/* Photo source picker for progress photo */}
      <PhotoSourcePicker
        open={showProgressPhotoPicker}
        onClose={() => setShowProgressPhotoPicker(false)}
        onPickCamera={() => setShowProgressCamera(true)}
        onPickGallery={(dataUrl) => handleUploadProgressPhoto(dataUrl)}
      />

      {/* Camera for progress photo */}
      <CameraCapture
        open={showProgressCamera}
        onCapture={(dataUrl) => {
          handleUploadProgressPhoto(dataUrl);
        }}
        onClose={() => setShowProgressCamera(false)}
      />
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

// ---- Location Card ----
function LocationCard({
  icon: Icon,
  label,
  desc,
  color,
  selected,
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onSelect}
      className={`p-4 rounded-2xl text-left transition-all ${
        selected
          ? 'border-2 border-[#6c5ce7]/40 bg-[#6c5ce7]/8'
          : 'border-2 border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <p className="text-white mb-0.5" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{label}</p>
      <p className="text-white/35" style={{ fontSize: '0.6875rem' }}>{desc}</p>
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#6c5ce7] flex items-center justify-center"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        </motion.div>
      )}
    </motion.button>
  );
}

// ---- Info Pill ----
function InfoPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
      <p className="text-white/35 mb-0.5" style={{ fontSize: '0.5625rem', fontWeight: 500 }}>{label}</p>
      <p className="text-white truncate" style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{value}</p>
    </div>
  );
}

// ---- Workout Type Icon ----
function WorkoutTypeIcon({ type, size = 'md' }: { type: WorkoutType; size?: 'md' | 'lg' }) {
  const config = WORKOUT_TYPE_CONFIG[type] || WORKOUT_TYPE_CONFIG.strength;
  const Icon = config.icon;
  const dims = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const iconSize = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';

  return (
    <div
      className={`${dims} rounded-xl flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: `${config.color}15` }}
    >
      <Icon className={iconSize} style={{ color: config.color }} />
    </div>
  );
}

// ---- Weekly Schedule Navigator ----
function WeeklySchedule({
  totalDays,
  selectedDay,
  onSelectDay,
  planData,
  planCreatedAt,
  lang,
}: {
  totalDays: number;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  planData: WorkoutPlanData;
  planCreatedAt: string;
  lang: string;
}) {
  const { t } = useTranslation();
  const DAYS_PER_PAGE = 7;
  const currentWeek = Math.floor((selectedDay - 1) / DAYS_PER_PAGE);
  const totalWeeks = Math.ceil(totalDays / DAYS_PER_PAGE);
  const startDay = currentWeek * DAYS_PER_PAGE + 1;
  const endDay = Math.min(startDay + DAYS_PER_PAGE - 1, totalDays);
  const daysInView = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i);

  const planStart = planCreatedAt ? new Date(planCreatedAt) : new Date();

  const goWeek = (dir: -1 | 1) => {
    const nextWeek = currentWeek + dir;
    if (nextWeek < 0 || nextWeek >= totalWeeks) return;
    onSelectDay(Math.min(nextWeek * DAYS_PER_PAGE + 1, totalDays));
  };

  return (
    <GlassCard className="!p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => goWeek(-1)}
          disabled={currentWeek === 0}
          className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center disabled:opacity-20"
        >
          <ChevronLeft className="w-4 h-4 text-white/60" />
        </motion.button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#a29bfe]" />
          <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {t('wp_week_label')} {currentWeek + 1}
            <span className="text-white/30 ml-1.5" style={{ fontWeight: 400 }}>
              / {totalWeeks}
            </span>
          </span>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => goWeek(1)}
          disabled={currentWeek >= totalWeeks - 1}
          className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center disabled:opacity-20"
        >
          <ChevronRight className="w-4 h-4 text-white/60" />
        </motion.button>
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-7 gap-1.5">
        {daysInView.map((day) => {
          const isSelected = day === selectedDay;
          const dayInfo = planData.days?.find((d) => d.day === day);
          const isRest = dayInfo?.workout_type === 'rest';
          const typeColor = dayInfo ? (WORKOUT_TYPE_CONFIG[dayInfo.workout_type]?.color || '#6c5ce7') : '#6c5ce7';

          const date = new Date(planStart);
          date.setDate(date.getDate() + day - 1);
          const weekDay = date.toLocaleDateString(t('locale_code'), { weekday: 'short' }).slice(0, 2);

          return (
            <motion.button
              key={day}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSelectDay(day)}
              className={`py-2 rounded-xl text-center transition-all relative ${
                isSelected
                  ? 'bg-gradient-to-b from-[#6c5ce7] to-[#5b4fd6] shadow-lg'
                  : 'bg-white/[0.03] border border-white/[0.06]'
              }`}
              style={isSelected ? { boxShadow: '0 4px 16px rgba(108,92,231,0.35)' } : {}}
            >
              <p
                className={isSelected ? 'text-white/60' : 'text-white/30'}
                style={{ fontSize: '0.5625rem', fontWeight: 500 }}
              >
                {weekDay}
              </p>
              <p
                className={isSelected ? 'text-white' : 'text-white/70'}
                style={{ fontSize: '0.9375rem', fontWeight: isSelected ? 700 : 500 }}
              >
                {day}
              </p>
              {/* Workout type dot indicator */}
              {!isSelected && dayInfo && (
                <div
                  className="w-1.5 h-1.5 rounded-full mx-auto mt-0.5"
                  style={{ backgroundColor: isRest ? '#74b9ff40' : typeColor }}
                />
              )}
              {/* Milestone indicator */}
              {planData.milestones?.some((m) => m.day === day) && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#fd79a8] flex items-center justify-center">
                  <span style={{ fontSize: '0.4375rem' }}>📸</span>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Week progress bar */}
      {totalWeeks > 1 && (
        <div className="mt-3 flex gap-1">
          {Array.from({ length: Math.min(totalWeeks, 15) }, (_, i) => (
            <div
              key={i}
              className="h-1 rounded-full flex-1 transition-all"
              style={{ backgroundColor: i === currentWeek ? '#6c5ce7' : 'rgba(255,255,255,0.06)' }}
            />
          ))}
          {totalWeeks > 15 && (
            <span className="text-white/20 ml-1" style={{ fontSize: '0.5rem' }}>+{totalWeeks - 15}</span>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ---- Exercise Card ----
function ExerciseCard({
  index,
  exercise,
  isCompleted,
  onToggle,
  lang,
}: {
  index: number;
  exercise: WorkoutPlanData['days'][0]['exercises'][0];
  isCompleted: boolean;
  onToggle: () => void;
  lang: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const formatReps = () => {
    if (exercise.duration_seconds) {
      const secs = exercise.duration_seconds;
      return secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s`;
    }
    return exercise.reps;
  };

  const formatRest = () => {
    const s = exercise.rest_seconds;
    if (!s) return null;
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <GlassCard className="!p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          {/* Checkbox */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onToggle}
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isCompleted
                ? 'bg-[#00cec9]/15 border-2 border-[#00cec9]'
                : 'bg-white/[0.04] border-2 border-white/10'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-[#00cec9]" />
            ) : (
              <span className="text-white/30" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{index + 1}</span>
            )}
          </motion.button>

          {/* Content */}
          <button
            onClick={() => { hapticFeedback('light'); setExpanded(!expanded); }}
            className="flex-1 text-left min-w-0"
          >
            <p className={`truncate ${isCompleted ? 'text-white/40 line-through' : 'text-white'}`} style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {exercise.exercise_name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/30" style={{ fontSize: '0.75rem' }}>
                {exercise.sets} × {formatReps()}
              </span>
              {formatRest() && (
                <>
                  <span className="text-white/15">·</span>
                  <span className="flex items-center gap-0.5 text-white/25" style={{ fontSize: '0.6875rem' }}>
                    <Timer className="w-2.5 h-2.5" />
                    {formatRest()} {t('wp_rest')}
                  </span>
                </>
              )}
            </div>
          </button>

          {/* Muscle group badge */}
          <span
            className="text-white/25 flex-shrink-0 px-2 py-1 rounded-lg bg-white/[0.03]"
            style={{ fontSize: '0.5625rem', fontWeight: 500 }}
          >
            {exercise.muscle_group}
          </span>

          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-white/20" />
          </motion.div>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="text-center">
                    <p className="text-white/30" style={{ fontSize: '0.5625rem' }}>{t('wp_sets')}</p>
                    <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{exercise.sets}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white/30" style={{ fontSize: '0.5625rem' }}>
                      {exercise.duration_seconds ? t('wp_duration') : t('wp_reps')}
                    </p>
                    <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{formatReps()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white/30" style={{ fontSize: '0.5625rem' }}>{t('wp_rest_label')}</p>
                    <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{formatRest() || '—'}</p>
                  </div>
                </div>
                {exercise.notes && (
                  <p className="text-white/30 mt-2 px-1" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                    {exercise.notes}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ---- Generating Animation ----
function GeneratingAnimation({
  messageIndex,
  planLength,
  location,
}: {
  messageIndex: number;
  planLength: PlanLength;
  location: WorkoutLocation;
}) {
  const { t } = useTranslation();
  const keys = planLength > 14 ? GEN_MESSAGE_KEYS_LONG : GEN_MESSAGE_KEYS;
  const messages = keys.map((key) => t(key));

  return (
    <div className="text-center">
      <div className="relative w-32 h-32 mx-auto mb-8">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-[#6c5ce7]/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-[#a29bfe]/20"
          animate={{ rotate: -360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-4 rounded-full border-2 border-[#00cec9]/15"
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <Dumbbell className="w-10 h-10 text-[#a29bfe]" />
          </motion.div>
        </div>
      </div>

      <p className="text-white mb-2" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
        {t('wp_building_title')}
      </p>
      <p className="text-white/30 mb-3" style={{ fontSize: '0.875rem' }}>
        {t('wp_building_desc_days', { n: planLength })} · {location === 'home'
          ? t('wp_home_workouts')
          : t('wp_gym_workouts')}
      </p>
      {planLength > 14 && (
        <p className="text-white/20 mb-6 max-w-[260px] mx-auto" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
          {t('wp_gen_long_hint')}
        </p>
      )}

      <div className="h-6 relative">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-[#a29bfe] absolute inset-x-0"
            style={{ fontSize: '0.8125rem' }}
          >
            {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex justify-center gap-2 mt-6">
        {messages.map((_, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            animate={{
              backgroundColor: i <= messageIndex ? '#6c5ce7' : 'rgba(255,255,255,0.08)',
              scale: i === messageIndex ? 1.3 : 1,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- History Bottom Sheet ----
function HistorySheet({
  plans,
  lang,
  onSelect,
  onDelete,
  onClose,
}: {
  plans: SavedPlan[];
  lang: string;
  onSelect: (plan: SavedPlan) => void;
  onDelete: (planId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SwipeableBottomSheet open={true} onClose={onClose} title={t('wp_my_plans')} maxHeight="70vh">
      {plans.length === 0 && (
        <p className="text-white/30 text-center py-8" style={{ fontSize: '0.875rem' }}>
          {t('wp_no_plans')}
        </p>
      )}

      <div className="space-y-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
          >
            <WorkoutTypeIcon type="strength" />
            <button onClick={() => onSelect(plan)} className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {plan.plan_length} {t('wp_days_count')}
                </p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: plan.workout_type === 'home' ? '#00cec915' : '#6c5ce715',
                    color: plan.workout_type === 'home' ? '#00cec9' : '#6c5ce7',
                    fontWeight: 500,
                  }}
                >
                  {plan.workout_type === 'home' ? t('wp_home_short') : t('wp_gym_short')}
                </span>
              </div>
              <p className="text-white/30" style={{ fontSize: '0.75rem' }}>
                {new Date(plan.created_at).toLocaleDateString(t('locale_code'), {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              {plan.user_wishes && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <MessageSquare className="w-3 h-3 text-[#fdcb6e]/60 flex-shrink-0" />
                  <p className="text-[#fdcb6e]/50 truncate" style={{ fontSize: '0.6875rem' }}>
                    {plan.user_wishes}
                  </p>
                </div>
              )}
            </button>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => onDelete(plan.id)}
              className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4 text-white/30" />
            </motion.button>
          </div>
        ))}
      </div>
    </SwipeableBottomSheet>
  );
}
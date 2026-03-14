// =============================================
// Meal Plan — AI-Powered Generator + Calendar UI
// =============================================
// Features:
//   - Generate meal plans for 7 / 30 / 100 days
//   - Calls Supabase Edge Function → OpenAI
//   - Uses user profile (goal, calories, gender, activity)
//   - Calendar-style day navigation
//   - Per-day meals: breakfast, lunch, dinner, snack
//   - Calories & macros per meal and per day
//   - Saved plans history
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Coffee,
  UtensilsCrossed,
  Moon,
  Apple,
  Clock,
  Target,
  Trash2,
  History,
  X,
  ChevronDown,
  Zap,
  AlertCircle,
  RefreshCw,
  Crown,
  Camera,
  MessageSquare,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api, type MealPlanData } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { CameraCapture } from './camera-capture';
import { PhotoSourcePicker } from './photo-source-picker';
import { SwipeableBottomSheet } from './ui/swipeable-bottom-sheet';

// ---- Types ----
type PlanLength = 7 | 30 | 100;
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ViewState = 'empty' | 'selecting' | 'generating' | 'viewing' | 'error';

interface UserProfile {
  goal: string;
  daily_calorie_target: number;
  gender: string;
  activity_level: string;
  age?: number;
  height?: number;
  weight?: number;
}

interface SavedPlan {
  id: string;
  plan_length: number;
  plan_data: MealPlanData;
  created_at: string;
  user_wishes?: string;
}

// ---- Meal config ----
const MEAL_CONFIG: Record<MealType, { icon: React.ElementType; color: string; key: string }> = {
  breakfast: { icon: Coffee, color: '#ffeaa7', key: 'mp_meal_breakfast' },
  lunch: { icon: UtensilsCrossed, color: '#fd79a8', key: 'mp_meal_lunch' },
  dinner: { icon: Moon, color: '#a29bfe', key: 'mp_meal_dinner' },
  snack: { icon: Apple, color: '#00cec9', key: 'mp_meal_snack' },
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const PLAN_OPTIONS: { length: PlanLength; labelKey: string; descKey: string; color: string }[] = [
  { length: 7, labelKey: 'mp_plan_7_label', descKey: 'mp_plan_7_desc', color: '#00cec9' },
  { length: 30, labelKey: 'mp_plan_30_label', descKey: 'mp_plan_30_desc', color: '#6c5ce7' },
  { length: 100, labelKey: 'mp_plan_100_label', descKey: 'mp_plan_100_desc', color: '#fd79a8' },
];

// ---- Generation animation message keys ----
const GEN_MESSAGE_KEYS = [
  'mp_gen_1', 'mp_gen_2', 'mp_gen_3', 'mp_gen_4', 'mp_gen_5', 'mp_gen_6',
];
const GEN_MESSAGE_KEYS_LONG = [
  'mp_gen_1', 'mp_gen_2', 'mp_gen_3', 'mp_gen_4', 'mp_gen_5', 'mp_gen_6',
  'mp_gen_batch2', 'mp_gen_batch3', 'mp_gen_batch4', 'mp_gen_batch5',
  'mp_gen_1', 'mp_gen_2', 'mp_gen_3',
];

// ---- Goal labels ----
const GOAL_LABELS: Record<string, { en: string; ru: string }> = {
  lose_weight: { en: 'Weight Loss', ru: 'Похудение' },
  maintain_weight: { en: 'Maintenance', ru: 'Поддержание' },
  gain_muscle: { en: 'Muscle Gain', ru: 'Набор массы' },
};

// ---- Detect language ----
function useLang() {
  const { t } = useTranslation();
  return t('nav_home') === '\u0413\u043B\u0430\u0432\u043D\u0430\u044F' ? 'ru' : 'en';
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function MealPlanPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();

  // State
  const [viewState, setViewState] = useState<ViewState>('empty');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedLength, setSelectedLength] = useState<PlanLength>(7);
  const [currentPlan, setCurrentPlan] = useState<SavedPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [genMessage, setGenMessage] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const genIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Body photo state
  const [bodyPhoto, setBodyPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  // User wishes / preferences (persisted in localStorage)
  const [userWishes, setUserWishes] = useState(() => localStorage.getItem('mp_user_wishes') || '');

  // Persist wishes to localStorage
  useEffect(() => {
    localStorage.setItem('mp_user_wishes', userWishes);
  }, [userWishes]);

  // Quick chip toggle helper
  const toggleChip = (chipText: string) => {
    setUserWishes((prev) => {
      const trimmed = prev.trim();
      // If chip text already present, remove it
      if (trimmed.includes(chipText)) {
        return trimmed.replace(chipText, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
      }
      // Append
      return trimmed ? `${trimmed}, ${chipText}` : chipText;
    });
    hapticFeedback('light');
  };

  // Load profile
  useEffect(() => {
    const cached = localStorage.getItem('nutrition_calorie_target');
    const cachedGoal = localStorage.getItem('nutrition_goal');
    const cachedGender = localStorage.getItem('nutrition_gender');
    const cachedActivity = localStorage.getItem('nutrition_activity');

    if (cached && cachedGoal && cachedGender && cachedActivity) {
      setProfile({
        daily_calorie_target: Number(cached),
        goal: cachedGoal,
        gender: cachedGender,
        activity_level: cachedActivity,
      });
    }

    if (!user) return;
    api.getUserProfile().then((p) => {
      if (!p) return;
      const prof: UserProfile = {
        daily_calorie_target: p.daily_calorie_target || 2000,
        goal: p.goal || 'maintain_weight',
        gender: p.gender || 'male',
        activity_level: p.activity_level || 'medium',
        age: p.age,
        height: p.height,
        weight: p.weight,
      };
      setProfile(prof);
      localStorage.setItem('nutrition_calorie_target', String(prof.daily_calorie_target));
      localStorage.setItem('nutrition_goal', prof.goal);
      localStorage.setItem('nutrition_gender', prof.gender);
      localStorage.setItem('nutrition_activity', prof.activity_level);
    }).catch(() => {});
  }, [user]);

  // Try loading most recent plan from API
  useEffect(() => {
    if (!user) return;
    setLoadingPlans(true);
    api.getMealPlans().then((res) => {
      if (res.plans && res.plans.length > 0) {
        // Load the most recent full plan
        const latest = res.plans[0];
        api.getMealPlan(latest.id).then((full) => {
          setCurrentPlan(full);
          setViewState('viewing');
          setSelectedDay(1);
        }).catch(() => {
          setViewState('empty');
        });
      }
      setLoadingPlans(false);
    }).catch(() => {
      setLoadingPlans(false);
    });
  }, [user]);

  // Generation animation
  useEffect(() => {
    if (viewState !== 'generating') {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      return;
    }
    setGenMessage(0);
    const msgKeys = selectedLength > 7 ? GEN_MESSAGE_KEYS_LONG : GEN_MESSAGE_KEYS;
    genIntervalRef.current = setInterval(() => {
      setGenMessage((prev) => {
        if (prev >= msgKeys.length - 1) return prev;
        return prev + 1;
      });
    }, selectedLength > 7 ? 5000 : 3000);
    return () => {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
    };
  }, [viewState, selectedLength]);

  // Generate plan
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

      const result = await api.generateMealPlan({
        plan_length: selectedLength,
        goal: profile.goal,
        daily_calories: profile.daily_calorie_target,
        gender: profile.gender,
        activity_level: profile.activity_level,
        age: profile.age,
        height: profile.height,
        weight: profile.weight,
        imageBase64,
        mimeType,
        language: lang,
        user_wishes: userWishes,
      });

      hapticSuccess();
      setCurrentPlan(result);
      setSelectedDay(1);
      setBodyPhoto(null);
      setViewState('viewing');
    } catch (err: any) {
      hapticError();
      if (err?.code === 'LIMIT_REACHED' || err?.status === 429 || (err?.message && err.message.includes('limit'))) {
        setLimitReached(true);
        setErrorMsg(
          t('mp_limit_weekly')
        );
      } else {
        setLimitReached(false);
        setErrorMsg(err?.message || 'Failed to generate meal plan');
      }
      setViewState('error');
    }
  }, [profile, selectedLength, bodyPhoto, lang, userWishes]);

  // Load saved plans for history
  const handleShowHistory = useCallback(async () => {
    hapticFeedback('light');
    setShowHistory(true);
    if (!user) return;
    try {
      const res = await api.getMealPlans();
      // Load full data for each
      const full: SavedPlan[] = [];
      for (const p of res.plans.slice(0, 10)) {
        try {
          const f = await api.getMealPlan(p.id);
          full.push(f);
        } catch {}
      }
      setSavedPlans(full);
    } catch {}
  }, [user]);

  // Get current day data
  const dayData = currentPlan?.plan_data?.days?.find((d) => d.day === selectedDay);
  const totalDays = currentPlan?.plan_length || 0;

  // Normalize meals to array defensively (GPT may return object)
  const dayMeals: MealPlanData['days'][0]['meals'] = React.useMemo(() => {
    if (!dayData) return [];
    const m = dayData.meals;
    if (Array.isArray(m)) return m;
    // Object format: { breakfast: {...}, lunch: {...}, ... }
    if (m && typeof m === 'object') {
      return (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mt) => {
        const meal = (m as any)[mt];
        if (!meal) return null;
        const items = Array.isArray(meal.items) ? meal.items : [{
          food_name: meal.name || meal.food_name || mt,
          calories: meal.calories || 0, protein: meal.protein || 0,
          carbs: meal.carbs || 0, fat: meal.fat || 0,
          quantity: meal.quantity || 1, unit: (meal.unit || 'piece') as any,
        }];
        return { meal_type: mt as any, items };
      }).filter(Boolean) as any;
    }
    return [];
  }, [dayData]);

  // Day totals
  const dayTotals = dayMeals.length > 0
    ? dayMeals.reduce(
        (acc, meal) => {
          const mealTotals = (meal.items || []).reduce(
            (a, item) => ({
              calories: a.calories + item.calories,
              protein: a.protein + item.protein,
              carbs: a.carbs + item.carbs,
              fat: a.fat + item.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );
          return {
            calories: acc.calories + mealTotals.calories,
            protein: acc.protein + mealTotals.protein,
            carbs: acc.carbs + mealTotals.carbs,
            fat: acc.fat + mealTotals.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="min-h-screen pb-28">
      <PageHeader
        title={t('mp_title')}
        subtitle={
          currentPlan
            ? `${currentPlan.plan_length} ${t('shared_days_unit')}`
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
                onClick={() => {
                  hapticFeedback('light');
                  setViewState('selecting');
                }}
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
          {/* ======== EMPTY / SELECT STATE ======== */}
          {(viewState === 'empty' || viewState === 'selecting') && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              {/* Profile + Body combined */}
              {profile && (
                <GlassCard className="!p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                      <Target className="w-4.5 h-4.5 text-[#a29bfe]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {t('shared_your_profile')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                        {t('shared_ai_plan_based')}
                      </p>
                    </div>
                  </div>

                  {/* All profile + body metrics in one compact grid */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <MiniPill label={t('shared_goal_label')} value={GOAL_LABELS[profile.goal]?.[lang as 'en' | 'ru'] || profile.goal} color="#6c5ce7" />
                    <MiniPill label={t('shared_calories_label')} value={`${profile.daily_calorie_target}`} color="#fd79a8" />
                    <MiniPill label={t('shared_gender_label')} value={profile.gender === 'male' ? t('obn_male') : t('obn_female')} color="#00cec9" />
                    <MiniPill label={t('shared_activity_label')} value={
                      profile.activity_level === 'low' ? t('obn_activity_low') :
                      profile.activity_level === 'medium' ? t('obn_activity_medium') :
                      profile.activity_level === 'high' ? t('obn_activity_high') :
                      t('obn_activity_athlete')
                    } color="#ffeaa7" />
                    {profile.age ? <MiniPill label={t('wp_age_label')} value={`${profile.age}`} color="#a29bfe" /> : null}
                    {profile.height ? <MiniPill label={t('wp_height_label')} value={`${profile.height}cm`} color="#74b9ff" /> : null}
                    {profile.weight ? <MiniPill label={t('wp_weight_label')} value={`${profile.weight}kg`} color="#fab1a0" /> : null}
                  </div>

                  {/* Body photo — compact */}
                  {bodyPhoto ? (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#00cec9]/8 border border-[#00cec9]/20">
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={bodyPhoto} alt="Body" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#00cec9]" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('mp_photo_added')}</p>
                        <p className="text-white/30 truncate" style={{ fontSize: '0.625rem' }}>{t('mp_photo_hint')}</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => { hapticFeedback('light'); setBodyPhoto(null); }} className="px-2 py-1 rounded-lg bg-white/[0.06]">
                        <span className="text-white/40" style={{ fontSize: '0.625rem' }}>{t('mp_remove_photo')}</span>
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { hapticFeedback('light'); setShowPhotoPicker(true); }} className="w-full p-2.5 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center gap-2 bg-white/[0.01]">
                      <Camera className="w-3.5 h-3.5 text-[#fd79a8]" />
                      <span className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 500 }}>{t('mp_add_photo')}</span>
                    </motion.button>
                  )}
                </GlassCard>
              )}

              {/* No profile warning */}
              {!profile && !loadingPlans && (
                <GlassCard className="!p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertCircle className="w-6 h-6 text-[#fdcb6e]" />
                    <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {t('shared_complete_profile')}
                    </p>
                  </div>
                  <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {t('mp_complete_onboarding')}
                  </p>
                </GlassCard>
              )}

              {/* ---- USER WISHES section ---- */}
              {profile && (
                <div>
                  <div className="flex items-center gap-2.5 mb-2 px-1">
                    <Sparkles className="w-4 h-4 text-[#fdcb6e]" />
                    <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                      {t('mp_wishes_title')}
                    </p>
                    <span className="text-white/15 ml-auto" style={{ fontSize: '0.625rem' }}>
                      {t('shared_optional')}
                    </span>
                  </div>
                  <p className="text-white/25 mb-2 px-1" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
                    {t('mp_wishes_desc')}
                  </p>
                  <textarea
                    value={userWishes}
                    onChange={(e) => setUserWishes(e.target.value)}
                    placeholder={t('mp_wishes_placeholder')}
                    rows={3}
                    className="w-full rounded-xl px-4 py-3 bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/15 outline-none resize-none focus:border-[#fdcb6e]/30 transition-colors"
                    style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                    maxLength={500}
                  />
                  {/* Quick chip suggestions */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(['mp_chip_strict', 'mp_chip_budget', 'mp_chip_vegetarian', 'mp_chip_high_protein', 'mp_chip_no_sugar', 'mp_chip_local', 'mp_chip_simple', 'mp_chip_no_lactose'] as const).map((chipKey) => {
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

              {/* Plan length selector — 3 compact squares */}
              <div>
                <p className="text-muted-foreground mb-2 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {t('mp_choose_length')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PLAN_OPTIONS.map((opt) => {
                    const isSelected = selectedLength === opt.length;
                    return (
                      <motion.button
                        key={opt.length}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          hapticFeedback('light');
                          setSelectedLength(opt.length);
                        }}
                        className={`relative p-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all ${
                          isSelected
                            ? 'bg-[#6c5ce7]/12 border-2 border-[#6c5ce7]/35'
                            : 'border-2'
                        }`}
                        style={!isSelected ? { background: 'var(--glass-bg-row)', borderColor: 'var(--glass-border-subtle)' } : undefined}
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${opt.color}15` }}
                        >
                          <span className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                            {opt.length}
                          </span>
                        </div>
                        <p className="text-foreground leading-tight text-center" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {t(opt.labelKey)}
                        </p>
                        <p className="text-muted-foreground leading-tight text-center" style={{ fontSize: '0.5625rem' }}>
                          {t(opt.descKey)}
                        </p>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#6c5ce7] flex items-center justify-center"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Generate button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGenerate}
                disabled={!profile}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-3 disabled:opacity-40 disabled:saturate-0"
                style={{ boxShadow: profile ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}
              >
                <Sparkles className="w-5 h-5 text-white" />
                <span className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                  {t('mp_generate_n', { n: selectedLength })}
                </span>
              </motion.button>
            </motion.div>
          )}

          {/* ======== GENERATING STATE ======== */}
          {viewState === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12"
            >
              <GeneratingAnimation
                messageIndex={genMessage}
                planLength={selectedLength}
              />
            </motion.div>
          )}

          {/* ======== ERROR STATE ======== */}
          {viewState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="py-12"
            >
              <div className="text-center">
                {limitReached ? (
                  <>
                    <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/10 border border-white/[0.08] flex items-center justify-center mx-auto mb-5">
                      <Crown className="w-9 h-9 text-[#a29bfe]" />
                    </div>
                    <p className="text-white mb-2" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                      {t('mp_limit_title')}
                    </p>
                    <p className="text-white/40 mb-2 max-w-[280px] mx-auto" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                      {t('mp_limit_used')}
                    </p>
                    <p className="text-white/30 mb-8 max-w-[280px] mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                      {t('mp_limit_upgrade')}
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { hapticFeedback('medium'); navigate('/upgrade'); }}
                      className="px-8 h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] inline-flex items-center gap-2.5 mb-3"
                      style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
                    >
                      <Crown className="w-5 h-5 text-white" />
                      <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
                        {t('shared_upgrade_premium')}
                      </span>
                    </motion.button>
                    <br />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { hapticFeedback('light'); setViewState('selecting'); }}
                      className="mt-2 text-white/40"
                      style={{ fontSize: '0.875rem' }}
                    >
                      {t('back')}
                    </motion.button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ======== VIEWING PLAN STATE ======== */}
          {viewState === 'viewing' && currentPlan && (
            <motion.div
              key="viewing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              {/* Calendar Navigator */}
              <CalendarNavigator
                totalDays={totalDays}
                selectedDay={selectedDay}
                onSelectDay={(day) => {
                  hapticFeedback('light');
                  setSelectedDay(day);
                }}
                planCreatedAt={currentPlan.created_at}
                lang={lang}
              />

              {/* Day Summary Card */}
              {dayData && (
                <GlassCard className="!p-5" variant="elevated">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                        <Flame className="w-5 h-5 text-[#fd79a8]" />
                      </div>
                      <div>
                        <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                          {t('mp_day_label', { n: selectedDay })}
                        </p>
                        <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                          {t('mp_meals_count', { n: dayMeals.length })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white" style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>
                        {dayTotals.calories}
                      </p>
                      <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                        {t('cal_unit')}
                      </p>
                    </div>
                  </div>

                  {/* Macro bars */}
                  <div className="grid grid-cols-3 gap-2">
                    <MacroPill
                      label={t('mp_protein')}
                      value={dayTotals.protein}
                      color="#6c5ce7"
                    />
                    <MacroPill
                      label={t('mp_carbs')}
                      value={dayTotals.carbs}
                      color="#00cec9"
                    />
                    <MacroPill
                      label={t('mp_fat')}
                      value={dayTotals.fat}
                      color="#e17055"
                    />
                  </div>
                </GlassCard>
              )}

              {/* Meals for the day */}
              {dayData && (
                <div className="space-y-3">
                  {MEAL_ORDER.map((mealType) => {
                    const mealData = dayMeals.find((m) => m.meal_type === mealType);
                    if (!mealData || !mealData.items || mealData.items.length === 0) return null;

                    const config = MEAL_CONFIG[mealType];
                    const Icon = config.icon;
                    const mealCals = mealData.items.reduce((s, i) => s + i.calories, 0);
                    const mealProtein = mealData.items.reduce((s, i) => s + i.protein, 0);
                    const mealCarbs = mealData.items.reduce((s, i) => s + i.carbs, 0);
                    const mealFat = mealData.items.reduce((s, i) => s + i.fat, 0);

                    return (
                      <MealCard
                        key={mealType}
                        mealType={mealType}
                        config={config}
                        items={mealData.items}
                        totalCals={mealCals}
                        totalProtein={mealProtein}
                        totalCarbs={mealCarbs}
                        totalFat={mealFat}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ======== HISTORY SHEET ======== */}
      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            plans={savedPlans}
            lang={lang}
            onSelect={(plan) => {
              hapticSuccess();
              setCurrentPlan(plan);
              setSelectedDay(1);
              setViewState('viewing');
              setShowHistory(false);
            }}
            onDelete={async (planId) => {
              try {
                await api.deleteMealPlan(planId);
                setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
                if (currentPlan?.id === planId) {
                  setCurrentPlan(null);
                  setViewState('empty');
                }
                hapticSuccess();
              } catch {
                hapticError();
              }
            }}
            onClose={() => {
              hapticFeedback('light');
              setShowHistory(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Photo source picker */}
      <PhotoSourcePicker
        open={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onPickCamera={() => setShowCamera(true)}
        onPickGallery={(dataUrl) => setBodyPhoto(dataUrl)}
      />

      {/* Camera for body photo */}
      <CameraCapture
        open={showCamera}
        onCapture={(dataUrl) => {
          setBodyPhoto(dataUrl);
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
      />
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

// ---- Compact profile/body mini pill ----
function MiniPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <p className="text-muted-foreground" style={{ fontSize: '0.5625rem', fontWeight: 500, lineHeight: 1.2 }}>
        {label}
      </p>
      <p className="truncate mt-0.5" style={{ fontSize: '0.75rem', fontWeight: 700, color }}>
        {value}
      </p>
    </div>
  );
}

// ---- Macro pill ----
function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center rounded-xl py-2.5 px-2" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{label}</span>
      </div>
      <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
        {Math.round(value)}
        <span className="text-muted-foreground/50 ml-0.5" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>g</span>
      </p>
    </div>
  );
}

// ---- Calendar navigator ----
function CalendarNavigator({
  totalDays,
  selectedDay,
  onSelectDay,
  planCreatedAt,
  lang,
}: {
  totalDays: number;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  planCreatedAt: string;
  lang: string;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const DAYS_PER_PAGE = 7;

  // Determine which "week" we're on
  const currentWeek = Math.floor((selectedDay - 1) / DAYS_PER_PAGE);
  const totalWeeks = Math.ceil(totalDays / DAYS_PER_PAGE);
  const startDay = currentWeek * DAYS_PER_PAGE + 1;
  const endDay = Math.min(startDay + DAYS_PER_PAGE - 1, totalDays);

  const daysInView = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i);

  // Get start date for date labels
  const planStart = planCreatedAt ? new Date(planCreatedAt) : new Date();

  const goWeek = (dir: -1 | 1) => {
    const nextWeek = currentWeek + dir;
    if (nextWeek < 0 || nextWeek >= totalWeeks) return;
    const nextDay = nextWeek * DAYS_PER_PAGE + 1;
    onSelectDay(Math.min(nextDay, totalDays));
  };

  return (
    <GlassCard className="!p-4">
      {/* Week navigation header */}
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
            {t('mp_days_label')} {startDay}–{endDay}
            <span className="text-white/30 ml-1.5" style={{ fontWeight: 400 }}>
              / {totalDays}
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

      {/* Day pills grid */}
      <div ref={scrollRef} className="grid grid-cols-7 gap-1.5">
        {daysInView.map((day) => {
          const isSelected = day === selectedDay;
          const date = new Date(planStart);
          date.setDate(date.getDate() + day - 1);
          const weekDay = date.toLocaleDateString(t('locale_code'), { weekday: 'short' }).slice(0, 2);

          return (
            <motion.button
              key={day}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSelectDay(day)}
              className={`py-2 rounded-xl text-center transition-all ${
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
            </motion.button>
          );
        })}
      </div>

      {/* Week progress bar */}
      <div className="mt-3 flex gap-1">
        {Array.from({ length: totalWeeks }, (_, i) => (
          <div
            key={i}
            className="h-1 rounded-full flex-1 transition-all"
            style={{
              backgroundColor: i === currentWeek ? '#6c5ce7' : 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </div>
    </GlassCard>
  );
}

// ---- Single Meal Card ----
function MealCard({
  mealType,
  config,
  items,
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  lang,
}: {
  mealType: MealType;
  config: (typeof MEAL_CONFIG)[MealType];
  items: MealPlanData['days'][0]['meals'][0]['items'];
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  lang: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <GlassCard className="!p-0 overflow-hidden">
        {/* Meal header — tappable */}
        <button
          onClick={() => {
            hapticFeedback('light');
            setExpanded((p) => !p);
          }}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${config.color}15` }}
            >
              <Icon className="w-5 h-5" style={{ color: config.color }} />
            </div>
            <div className="text-left">
              <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                {t(config.key)}
              </p>
              <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                {items.length} {t('mp_items_count')} · P:{Math.round(totalProtein)}g C:{Math.round(totalCarbs)}g F:{Math.round(totalFat)}g
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{totalCals}</p>
              <p className="text-white/30" style={{ fontSize: '0.5625rem' }}>{t('mp_cal_unit')}</p>
            </div>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-white/25" />
            </motion.div>
          </div>
        </button>

        {/* Items */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-1.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.025] border border-white/[0.04]"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                        {item.food_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                          {item.quantity}{item.unit}
                        </span>
                        <span className="text-white/15">·</span>
                        <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                          P:{item.protein}g
                        </span>
                        <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                          C:{item.carbs}g
                        </span>
                        <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                          F:{item.fat}g
                        </span>
                      </div>
                    </div>
                    <p className="text-white/70 flex-shrink-0" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {item.calories}
                    </p>
                  </div>
                ))}
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
}: {
  messageIndex: number;
  planLength: PlanLength;
}) {
  const { t } = useTranslation();
  const keys = planLength > 7 ? GEN_MESSAGE_KEYS_LONG : GEN_MESSAGE_KEYS;
  const messages = keys.map((key) => t(key));

  return (
    <div className="text-center">
      {/* Animated rings */}
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
          className="absolute inset-4 rounded-full border-2 border-[#fd79a8]/15"
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-10 h-10 text-[#a29bfe]" />
          </motion.div>
        </div>
      </div>

      <p className="text-white mb-2" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
        {t('mp_generating_title')}
      </p>
      <p className="text-white/30 mb-6" style={{ fontSize: '0.875rem' }}>
        {t('mp_generating_desc', { n: planLength })}
      </p>

      {/* Animated message */}
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

      {/* Progress dots */}
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
    <SwipeableBottomSheet open={true} onClose={onClose} title={t('mp_my_plans')} maxHeight="70vh">
      {plans.length === 0 && (
        <p className="text-white/30 text-center py-8" style={{ fontSize: '0.875rem' }}>
          {t('mp_no_plans')}
        </p>
      )}

      <div className="space-y-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
          >
            <button
              onClick={() => onSelect(plan)}
              className="flex-1 text-left"
            >
              <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                {plan.plan_length} {t('mp_days_count')}
              </p>
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
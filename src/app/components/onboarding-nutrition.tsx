// =============================================
// Nutrition Onboarding — Multi-step flow
// =============================================
// Collects: Gender, Age, Height, Weight, Activity Level, Goal
// Saves to Supabase user_profile table via Edge Function
// Redirects to /home after completion
// =============================================

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  User,
  Ruler,
  Weight,
  Flame,
  Target,
  Zap,
} from 'lucide-react';
import { useAuth } from './auth-context';
import {
  hapticFeedback,
  hapticSuccess,
  hapticSelection,
  expandApp,
  isTelegramEnvironment,
  isTelegramClient,
} from './telegram';
import { api } from './api-client';
import { calculateCalories } from './calorie-calculator';

// ---- Types ----
type Gender = 'male' | 'female';
type ActivityLevel = 'low' | 'medium' | 'high' | 'athlete';
type Goal = 'lose_weight' | 'maintain_weight' | 'gain_muscle';

interface OnboardingData {
  gender: Gender | null;
  age: string;
  height: string;
  weight: string;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
}

// ---- Step definitions ----
const TOTAL_STEPS = 6;

function detectLanguage(): string {
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('ru')) return 'ru';
  return 'en';
}



export function OnboardingNutritionPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const [data, setData] = useState<OnboardingData>({
    gender: null,
    age: '',
    height: '',
    weight: '',
    activityLevel: null,
    goal: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);
  const [language] = useState(detectLanguage);

  const { login, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();

  const wasOnboarded = typeof window !== 'undefined' && localStorage.getItem('nutrition_onboarded') === 'true';

  useEffect(() => { expandApp(); }, []);

  // If already onboarded, redirect
  useEffect(() => {
    if (wasOnboarded) {
      navigate('/home', { replace: true });
    }
  }, [wasOnboarded, navigate]);

  // Try auto-auth on mount
  useEffect(() => {
    if (!authAttempted) {
      setAuthAttempted(true);
      if (isTelegramEnvironment() || isTelegramClient()) {
        login().catch((err) => {
          console.warn('[NutritionOnboarding] Auto-login failed:', err);
        });
      }
    }
  }, [authAttempted, login]);

  const canProceed = useCallback((): boolean => {
    switch (step) {
      case 0: return data.gender !== null;
      case 1: return data.age !== '' && Number(data.age) >= 10 && Number(data.age) <= 120;
      case 2: return data.height !== '' && Number(data.height) >= 100 && Number(data.height) <= 250;
      case 3: return data.weight !== '' && Number(data.weight) >= 30 && Number(data.weight) <= 300;
      case 4: return data.activityLevel !== null;
      case 5: return data.goal !== null;
      default: return false;
    }
  }, [step, data]);

  const goNext = useCallback(() => {
    if (!canProceed()) return;
    hapticFeedback('medium');
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [canProceed]);

  const goBack = useCallback(() => {
    hapticFeedback('light');
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const finishOnboarding = useCallback(async () => {
    if (!canProceed()) return;
    hapticFeedback('medium');
    setIsLoading(true);
    try {
      if (!isAuthenticated) {
        await login();
      }

      // Calculate calories using Mifflin-St Jeor formula
      const calorieResult = calculateCalories({
        gender: data.gender!,
        age: Number(data.age),
        height: Number(data.height),
        weight: Number(data.weight),
        activityLevel: data.activityLevel!,
        goal: data.goal!,
      });

      console.log('[NutritionOnboarding] Calorie calculation:', calorieResult);

      // Save profile + calorie data to backend
      await api.saveUserProfile({
        gender: data.gender!,
        age: Number(data.age),
        height: Number(data.height),
        weight: Number(data.weight),
        activity_level: data.activityLevel!,
        goal: data.goal!,
        daily_calorie_target: calorieResult.targetCalories,
        bmr: calorieResult.bmr,
        daily_maintenance_calories: calorieResult.dailyCalories,
      });

      // Cache locally for immediate Home screen use
      localStorage.setItem('nutrition_calorie_target', String(calorieResult.targetCalories));
      localStorage.setItem('nutrition_bmr', String(calorieResult.bmr));
      localStorage.setItem('nutrition_maintenance', String(calorieResult.dailyCalories));

      hapticSuccess();
      localStorage.setItem('nutrition_onboarded', 'true');
      localStorage.setItem('become_onboarded', 'true');
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('[NutritionOnboarding] Finish error:', err);

      // Still calculate and cache locally even on API error
      try {
        const calorieResult = calculateCalories({
          gender: data.gender!,
          age: Number(data.age),
          height: Number(data.height),
          weight: Number(data.weight),
          activityLevel: data.activityLevel!,
          goal: data.goal!,
        });
        localStorage.setItem('nutrition_calorie_target', String(calorieResult.targetCalories));
        localStorage.setItem('nutrition_bmr', String(calorieResult.bmr));
        localStorage.setItem('nutrition_maintenance', String(calorieResult.dailyCalories));
      } catch {}

      // Still redirect on error — data will be re-submitted later
      hapticSuccess();
      localStorage.setItem('nutrition_onboarded', 'true');
      localStorage.setItem('become_onboarded', 'true');
      navigate('/home', { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [canProceed, isAuthenticated, login, data, navigate]);

  // ---- Splash for returning users ----
  if (wasOnboarded && authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#6c5ce7]/20 blur-[120px]"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center px-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-[#6c5ce7]"
          />
        </div>
      </div>
    );
  }

  // Animation variants
  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -120 : 120, opacity: 0 }),
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-[#6c5ce7]/20 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-[#a29bfe]/15 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#00cec9]/8 blur-[150px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pb-8" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shadow-lg"
              style={{ boxShadow: '0 4px 20px rgba(108,92,231,0.35)' }}
            >
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-white/80 tracking-widest" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.18em' }}>
              PROPER FOOD
            </span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-[#6c5ce7]' : 'bg-white/10'
                }`}
                style={{ width: i === step ? 20 : 8 }}
              />
            ))}
          </div>
        </motion.div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-white/[0.06] rounded-full mb-6 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] rounded-full"
            animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="flex-1 flex flex-col"
            >
              {step === 0 && (
                <GenderStep
                  value={data.gender}
                  onChange={(g) => { hapticSelection(); setData((d) => ({ ...d, gender: g })); }}
                  lang={language}
                />
              )}
              {step === 1 && (
                <NumberInputStep
                  icon={<User className="w-5 h-5 text-[#a29bfe]" />}
                  title={language === 'ru' ? 'Сколько вам лет?' : 'How old are you?'}
                  subtitle={language === 'ru' ? 'Возраст влияет на расчёт калорий' : 'Age affects calorie calculation'}
                  value={data.age}
                  onChange={(v) => setData((d) => ({ ...d, age: v }))}
                  unit={language === 'ru' ? 'лет' : 'years'}
                  min={10}
                  max={120}
                  placeholder="25"
                  lang={language}
                />
              )}
              {step === 2 && (
                <NumberInputStep
                  icon={<Ruler className="w-5 h-5 text-[#00cec9]" />}
                  title={language === 'ru' ? 'Ваш рост' : 'Your height'}
                  subtitle={language === 'ru' ? 'Укажите рост в сантиметрах' : 'Enter your height in centimeters'}
                  value={data.height}
                  onChange={(v) => setData((d) => ({ ...d, height: v }))}
                  unit={language === 'ru' ? 'см' : 'cm'}
                  min={100}
                  max={250}
                  placeholder="175"
                  lang={language}
                />
              )}
              {step === 3 && (
                <NumberInputStep
                  icon={<Weight className="w-5 h-5 text-[#e17055]" />}
                  title={language === 'ru' ? 'Ваш вес' : 'Your weight'}
                  subtitle={language === 'ru' ? 'Укажите вес в килограммах' : 'Enter your weight in kilograms'}
                  value={data.weight}
                  onChange={(v) => setData((d) => ({ ...d, weight: v }))}
                  unit={language === 'ru' ? 'кг' : 'kg'}
                  min={30}
                  max={300}
                  placeholder="70"
                  lang={language}
                />
              )}
              {step === 4 && (
                <ActivityStep
                  value={data.activityLevel}
                  onChange={(a) => { hapticSelection(); setData((d) => ({ ...d, activityLevel: a })); }}
                  lang={language}
                />
              )}
              {step === 5 && (
                <GoalStep
                  value={data.goal}
                  onChange={(g) => { hapticSelection(); setData((d) => ({ ...d, goal: g })); }}
                  lang={language}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom controls */}
        <div className="space-y-3 mt-4 shrink-0">
          <div className="flex gap-3">
            {step > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={goBack}
                className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center"
              >
                <ArrowLeft className="w-5 h-5 text-white/50" />
              </motion.button>
            )}

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              whileTap={{ scale: 0.97 }}
              onClick={step === TOTAL_STEPS - 1 ? finishOnboarding : goNext}
              disabled={!canProceed() || isLoading || authLoading}
              className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-2.5 shadow-lg transition-all duration-200 ${
                canProceed()
                  ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white'
                  : 'bg-white/[0.06] text-white/25 border border-white/[0.06]'
              }`}
              style={{
                fontSize: '1.0625rem',
                fontWeight: 600,
                boxShadow: canProceed() ? '0 8px 32px rgba(108,92,231,0.3)' : 'none',
              }}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : step === TOTAL_STEPS - 1 ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  {language === 'ru' ? 'Начать' : 'Get Started'}
                </>
              ) : (
                <>
                  {language === 'ru' ? 'Далее' : 'Continue'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Step Components
// =============================================

function GenderStep({ value, onChange, lang }: { value: Gender | null; onChange: (g: Gender) => void; lang: string }) {
  const options: Array<{ id: Gender; emoji: string; label: string }> = [
    { id: 'male', emoji: '\u{1F468}', label: lang === 'ru' ? 'Мужской' : 'Male' },
    { id: 'female', emoji: '\u{1F469}', label: lang === 'ru' ? 'Женский' : 'Female' },
  ];

  return (
    <div className="flex flex-col">
      <div className="mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[#a29bfe]/15 flex items-center justify-center mb-4">
          <User className="w-6 h-6 text-[#a29bfe]" />
        </div>
        <h1 className="text-white mb-2" style={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 }}>
          {lang === 'ru' ? 'Ваш пол' : 'Your gender'}
        </h1>
        <p className="text-white/35" style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
          {lang === 'ru' ? 'Для точного расчёта калорий и метаболизма' : 'For accurate calorie and metabolism calculation'}
        </p>
      </div>

      <div className="flex gap-3 mt-6">
        {options.map((opt) => {
          const isActive = value === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(opt.id)}
              className={`flex-1 rounded-2xl border flex flex-col items-center justify-center gap-3 py-8 transition-all duration-200 ${
                isActive
                  ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                  : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
              }`}
            >
              <span style={{ fontSize: '2.5rem' }}>{opt.emoji}</span>
              <span className={isActive ? 'text-white' : 'text-white/60'} style={{ fontSize: '1rem', fontWeight: 600 }}>
                {opt.label}
              </span>
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full bg-[#6c5ce7] flex items-center justify-center"
                >
                  <Check className="w-3.5 h-3.5 text-white" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function NumberInputStep({
  icon,
  title,
  subtitle,
  value,
  onChange,
  unit,
  min,
  max,
  placeholder,
  lang,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  min: number;
  max: number;
  placeholder: string;
  lang: string;
}) {
  const numVal = Number(value);
  const isValid = value === '' || (numVal >= min && numVal <= max);

  return (
    <div className="flex flex-col">
      <div className="mb-2">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center mb-4">
          {icon}
        </div>
        <h1 className="text-white mb-2" style={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </h1>
        <p className="text-white/35" style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <div className="relative w-full max-w-[200px]">
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              onChange(v);
            }}
            placeholder={placeholder}
            className={`w-full text-center bg-white/[0.04] border rounded-2xl px-4 py-5 text-white outline-none transition-all duration-200 ${
              !isValid
                ? 'border-red-400/50 bg-red-500/5'
                : value
                ? 'border-[#6c5ce7]/40 bg-[#6c5ce7]/5'
                : 'border-white/[0.08] focus:border-[#6c5ce7]/40'
            }`}
            style={{ fontSize: '2rem', fontWeight: 700, caretColor: '#a29bfe' }}
            autoFocus
          />
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30"
            style={{ fontSize: '1rem', fontWeight: 500 }}
          >
            {unit}
          </span>
        </div>

        {!isValid && value !== '' && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400/70 mt-3"
            style={{ fontSize: '0.8125rem' }}
          >
            {lang === 'ru' ? `Допустимо: ${min}–${max}` : `Valid range: ${min}–${max}`}
          </motion.p>
        )}
      </div>
    </div>
  );
}

function ActivityStep({
  value,
  onChange,
  lang,
}: {
  value: ActivityLevel | null;
  onChange: (a: ActivityLevel) => void;
  lang: string;
}) {
  const options: Array<{ id: ActivityLevel; emoji: string; label: string; desc: string }> = [
    {
      id: 'low',
      emoji: '\u{1F6CB}\uFE0F',
      label: lang === 'ru' ? 'Низкая' : 'Low',
      desc: lang === 'ru' ? 'Сидячий образ жизни, мало движения' : 'Sedentary lifestyle, minimal movement',
    },
    {
      id: 'medium',
      emoji: '\u{1F6B6}',
      label: lang === 'ru' ? 'Средняя' : 'Medium',
      desc: lang === 'ru' ? '2-3 тренировки в неделю' : '2-3 workouts per week',
    },
    {
      id: 'high',
      emoji: '\u{1F3CB}\uFE0F',
      label: lang === 'ru' ? 'Высокая' : 'High',
      desc: lang === 'ru' ? '4-5 тренировок в неделю' : '4-5 workouts per week',
    },
    {
      id: 'athlete',
      emoji: '\u{1F3C6}',
      label: lang === 'ru' ? 'Атлет' : 'Athlete',
      desc: lang === 'ru' ? 'Ежедневные интенсивные тренировки' : 'Daily intense training',
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[#00cec9]/15 flex items-center justify-center mb-4">
          <Flame className="w-6 h-6 text-[#00cec9]" />
        </div>
        <h1 className="text-white mb-2" style={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 }}>
          {lang === 'ru' ? 'Уровень активности' : 'Activity level'}
        </h1>
        <p className="text-white/35" style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
          {lang === 'ru' ? 'Как часто вы занимаетесь спортом?' : 'How often do you exercise?'}
        </p>
      </div>

      <div className="space-y-2.5 mt-4">
        {options.map((opt) => {
          const isActive = value === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(opt.id)}
              className={`w-full text-left rounded-xl border px-4 py-3.5 flex items-center gap-3 transition-all duration-200 ${
                isActive
                  ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                  : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                  isActive ? 'bg-[#6c5ce7]/25' : 'bg-white/[0.04]'
                }`}
              >
                <span style={{ fontSize: '1.25rem' }}>{opt.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={isActive ? 'text-white' : 'text-white/60'} style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {opt.label}
                </p>
                <p className="text-white/30 mt-0.5" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                  {opt.desc}
                </p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  isActive ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/15'
                }`}
              >
                {isActive && <Check className="w-3 h-3 text-white" />}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function GoalStep({
  value,
  onChange,
  lang,
}: {
  value: Goal | null;
  onChange: (g: Goal) => void;
  lang: string;
}) {
  const options: Array<{ id: Goal; emoji: string; label: string; desc: string; color: string }> = [
    {
      id: 'lose_weight',
      emoji: '\u{1F525}',
      label: lang === 'ru' ? 'Похудеть' : 'Lose weight',
      desc: lang === 'ru' ? 'Снизить вес и процент жира' : 'Reduce weight and body fat',
      color: '#e17055',
    },
    {
      id: 'maintain_weight',
      emoji: '\u{2696}\uFE0F',
      label: lang === 'ru' ? 'Поддержать вес' : 'Maintain weight',
      desc: lang === 'ru' ? 'Сохранить текущую форму' : 'Keep your current shape',
      color: '#00cec9',
    },
    {
      id: 'gain_muscle',
      emoji: '\u{1F4AA}',
      label: lang === 'ru' ? 'Набрать мышцы' : 'Gain muscle',
      desc: lang === 'ru' ? 'Увеличить мышечную массу' : 'Build muscle mass',
      color: '#6c5ce7',
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[#e17055]/15 flex items-center justify-center mb-4">
          <Target className="w-6 h-6 text-[#e17055]" />
        </div>
        <h1 className="text-white mb-2" style={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 }}>
          {lang === 'ru' ? 'Ваша цель' : 'Your goal'}
        </h1>
        <p className="text-white/35" style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
          {lang === 'ru' ? 'Чего вы хотите достичь?' : 'What do you want to achieve?'}
        </p>
      </div>

      <div className="space-y-3 mt-4">
        {options.map((opt) => {
          const isActive = value === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(opt.id)}
              className={`w-full text-left rounded-2xl border px-4 py-4 flex items-center gap-3.5 transition-all duration-200 ${
                isActive
                  ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                  : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
              }`}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${opt.color}20` }}
              >
                <span style={{ fontSize: '1.5rem' }}>{opt.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={isActive ? 'text-white' : 'text-white/70'} style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {opt.label}
                </p>
                <p className="text-white/30 mt-0.5" style={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                  {opt.desc}
                </p>
              </div>
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full bg-[#6c5ce7] flex items-center justify-center shrink-0"
                >
                  <Check className="w-3.5 h-3.5 text-white" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
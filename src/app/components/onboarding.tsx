// =============================================
// Proper Food AI — Onboarding (single-screen, skippable)
// =============================================
// Compact one-page setup with pre-selected defaults.
// User can skip entirely or adjust language, goal, tone.
// =============================================

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Zap,
  ArrowRight,
  Check,
  Shield,
  Heart,
  Sparkles,
  Target,
  Volume2,
} from 'lucide-react';
import { useAuth } from './auth-context';
import {
  hapticFeedback,
  hapticSuccess,
  hapticSelection,
  expandApp,
  isTelegramEnvironment,
  isTelegramClient,
  getInitData,
} from './telegram';

import { t } from './i18n';

// ---- Data ----
const LANGUAGES = [
  { code: 'en', label: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8', short: 'EN' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA', short: 'RU' },
];

function getTones(lang: string) {
  return [
    { id: 'supportive', label: t('tone_supportive', lang), emoji: '\uD83D\uDC9C', icon: Heart, color: '#a29bfe' },
    { id: 'strict', label: t('tone_strict', lang), emoji: '\uD83D\uDD25', icon: Shield, color: '#e17055' },
    { id: 'hybrid', label: t('tone_hybrid', lang), emoji: '\u26A1', icon: Zap, color: '#00cec9' },
  ];
}

function getGoals(lang: string) {
  return [
    { id: 'focus', label: t('goal_focus_label', lang), emoji: '\uD83C\uDFAF' },
    { id: 'discipline', label: t('goal_discipline_label', lang), emoji: '\uD83D\uDCAA' },
    { id: 'confidence', label: t('goal_confidence_label', lang), emoji: '\uD83D\uDC51' },
    { id: 'energy', label: t('goal_energy_label', lang), emoji: '\u26A1' },
  ];
}

// Auto-detect language from browser / Telegram
function detectLanguage(): string {
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('ru')) return 'ru';
  return 'en';
}

export function OnboardingPage() {
  const [language, setLanguage] = useState(detectLanguage);
  const [tone, setTone] = useState('supportive');
  const [goal, setGoal] = useState('focus');
  const [isLoading, setIsLoading] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);

  const { login, updateUser, isAuthenticated, isLoading: authLoading, authError, noInitDataWarning, isAdmin } = useAuth();
  const navigate = useNavigate();


  const wasOnboarded = typeof window !== 'undefined' && (localStorage.getItem('proper_onboarded') === 'true' || localStorage.getItem('become_onboarded') === 'true');

  useEffect(() => { expandApp(); }, []);

  // If already authenticated, redirect
  useEffect(() => {
    if (isAuthenticated && (wasOnboarded || isAdmin)) {
      navigate(isAdmin && !wasOnboarded ? '/admin' : '/home', { replace: true });
    }
  }, [isAuthenticated, wasOnboarded, isAdmin, navigate]);

  // Try auto-auth on mount
  useEffect(() => {
    if (!authAttempted) {
      setAuthAttempted(true);
      if (isTelegramEnvironment() || isTelegramClient()) {
        login().catch((err) => {
          console.warn('[Onboarding] Auto-login failed:', err);
        });
      }
    }
  }, [authAttempted, login]);

  const finishOnboarding = useCallback(async (skipLang?: string, skipTone?: string, skipGoal?: string) => {
    hapticFeedback('medium');
    setIsLoading(true);
    try {
      if (!isAuthenticated) {
        await login();
      }
      const finalLang = skipLang || language;
      const finalTone = skipTone || tone;
      const finalGoal = skipGoal || goal;

      updateUser({ language: finalLang, tone: finalTone as any, selectedGoal: finalGoal });
      localStorage.setItem('proper_challenge_mode', 'solo');
      hapticSuccess();
      localStorage.setItem('proper_onboarded', 'true');
      localStorage.setItem('become_onboarded', 'true'); // backward compat
      navigate('/home');
    } catch (err) {
      console.error('[Onboarding] Finish error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, login, updateUser, language, tone, goal, navigate]);

  const handleSkip = useCallback(() => {
    finishOnboarding(detectLanguage(), 'supportive', 'focus');
  }, [finishOnboarding]);

  const tones = getTones(language);
  const goals = getGoals(language);

  // ---- Splash loader for returning users ----
  if (wasOnboarded && (authLoading || (!isAuthenticated && !authError && !noInitDataWarning))) {
    const splashLang = detectLanguage();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#6c5ce7]/20 blur-[120px]"
          />
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.08, 0.15, 0.08] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute bottom-1/4 left-1/3 w-60 h-60 rounded-full bg-[#00cec9]/10 blur-[100px]"
          />
        </div>

        <div className="relative z-10 flex flex-col items-center px-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="mb-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shadow-2xl"
              style={{ boxShadow: '0 12px 48px rgba(108,92,231,0.4)' }}>
              <Zap className="w-10 h-10 text-white" />
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-white/80 tracking-[0.25em] mb-10"
            style={{ fontSize: '0.875rem', fontWeight: 600 }}
          >
            Proper Food
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-[#6c5ce7]"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-white/35 text-center max-w-[260px]"
            style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}
          >
            {splashLang === 'ru'
              ? '\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u0443\u0435\u043C \u0432\u0430\u0448\u0438 \u0446\u0435\u043B\u0438 \u0438 \u0437\u0430\u0434\u0430\u0447\u0438...'
              : 'Syncing your goals and tasks...'}
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex gap-1.5 mt-6"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.2, 0.7, 0.2], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-[#a29bfe]"
              />
            ))}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-[#6c5ce7]/20 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-[#a29bfe]/15 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#00cec9]/8 blur-[150px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pb-8" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header: Logo + Skip */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shadow-lg" style={{ boxShadow: '0 4px 20px rgba(108,92,231,0.35)' }}>
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-white/80 tracking-widest" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.18em' }}>
              Proper Food
            </span>
          </div>

          {/* Skip button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSkip}
            disabled={isLoading || authLoading}
            className="flex items-center gap-1 text-white/35 active:text-white/50 transition-colors px-2 py-1"
            style={{ fontSize: '0.8125rem', fontWeight: 500 }}
          >
            {t('skip', language)} <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </motion.div>

        {/* Welcome heading */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-7"
        >
          <h1 className="text-white mb-2" style={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 }}>
            {t('ob_welcome_title', language)}
          </h1>
          <p className="text-white/35" style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
            {t('ob_welcome_desc', language)}
          </p>
        </motion.div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-6 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* ---- Language ---- */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <div className="w-4 h-4 rounded-md bg-[#a29bfe]/15 flex items-center justify-center">
                <span style={{ fontSize: '0.5625rem' }}>{language === 'ru' ? '\uD83C\uDDF7\uD83C\uDDFA' : '\uD83C\uDDFA\uD83C\uDDF8'}</span>
              </div>
              <p className="text-white/30 uppercase" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                {t('ob_lang_label', language)}
              </p>
            </div>
            <div className="flex gap-2.5">
              {LANGUAGES.map((l) => {
                const isActive = language === l.code;
                return (
                  <motion.button
                    key={l.code}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => { hapticSelection(); setLanguage(l.code); }}
                    className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 border transition-all duration-200 ${
                      isActive
                        ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                        : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
                    }`}
                  >
                    <span style={{ fontSize: '1rem' }}>{l.flag}</span>
                    <span className={isActive ? 'text-white' : 'text-white/50'} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {l.label}
                    </span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#6c5ce7]" />}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* ---- Goal ---- */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <div className="w-4 h-4 rounded-md bg-[#00cec9]/15 flex items-center justify-center">
                <Target className="w-2.5 h-2.5 text-[#00cec9]" />
              </div>
              <p className="text-white/30 uppercase" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                {t('ob_goal_label', language)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {goals.map((item) => {
                const isActive = goal === item.id;
                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { hapticSelection(); setGoal(item.id); }}
                    className={`relative h-14 rounded-xl border flex items-center gap-2.5 px-3.5 transition-all duration-200 ${
                      isActive
                        ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                        : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
                    }`}
                  >
                    <span style={{ fontSize: '1.25rem' }}>{item.emoji}</span>
                    <span className={isActive ? 'text-white' : 'text-white/60'} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#6c5ce7] flex items-center justify-center"
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* ---- Coach Tone ---- */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <div className="w-4 h-4 rounded-md bg-[#a29bfe]/15 flex items-center justify-center">
                <Volume2 className="w-2.5 h-2.5 text-[#a29bfe]" />
              </div>
              <p className="text-white/30 uppercase" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                {t('ob_tone_label', language)}
              </p>
            </div>
            <div className="space-y-2">
              {tones.map((item) => {
                const isActive = tone === item.id;
                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { hapticSelection(); setTone(item.id); }}
                    className={`w-full text-left rounded-xl border px-4 py-3 flex items-center gap-3 transition-all duration-200 ${
                      isActive
                        ? 'bg-white/[0.06] border-[#6c5ce7]/40'
                        : 'bg-white/[0.02] border-white/[0.05] active:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                      isActive ? 'bg-[#6c5ce7]/25' : 'bg-white/[0.04]'
                    }`}>
                      <span style={{ fontSize: '0.875rem' }}>{item.emoji}</span>
                    </div>
                    <span className={`flex-1 ${isActive ? 'text-white' : 'text-white/50'}`} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {item.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      isActive ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/15'
                    }`}>
                      {isActive && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Bottom controls */}
        <div className="space-y-3 mt-4 shrink-0">
          {/* Start button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => finishOnboarding()}
            disabled={isLoading || authLoading}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-2.5 shadow-lg"
            style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {t('ob_start_btn', language)}
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
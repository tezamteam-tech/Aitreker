import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  Star,
  Trophy,
  Flame,
  CalendarCheck,
  ChevronRight,
  ChevronDown,
  LogOut,
  Globe,
  Volume2,
  Target,
  Shield,
  Wallet,
  Gem,
  Check,
  Heart,
  Zap,
  PenLine,
  Crown,
  Bell,
  Clock,
  Vibrate,
  LayoutGrid,
  Download,
  Trash2,
  Eye,
  Brain,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { Progress } from './types';
import { hapticFeedback, hapticSuccess, hapticSelection } from './telegram';
import { NotificationSettingsSection } from './notification-settings';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { AnimatedCounter } from './animated-counter';
import { PageHeader } from './page-header';
import { BOT_MENTION } from './bot-config';

// ---- Language options ----
const LANGUAGES = [
  { code: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8', labelKey: 'profile_lang_en' },
  { code: 'ru', flag: '\uD83C\uDDF7\uD83C\uDDFA', labelKey: 'profile_lang_ru' },
];

// ---- Tone options ----
const TONES = [
  { id: 'supportive', emoji: '\uD83D\uDC9C', labelKey: 'tone_supportive', descKey: 'tone_supportive_desc', icon: Heart, color: 'text-[#a29bfe]', bgColor: 'bg-[#a29bfe]/15' },
  { id: 'strict', emoji: '\uD83D\uDD25', labelKey: 'tone_strict', descKey: 'tone_strict_desc', icon: Shield, color: 'text-[#e17055]', bgColor: 'bg-[#e17055]/15' },
  { id: 'hybrid', emoji: '\u26A1', labelKey: 'tone_hybrid', descKey: 'tone_hybrid_desc', icon: Zap, color: 'text-[#00cec9]', bgColor: 'bg-[#00cec9]/15' },
];

// ---- Goal options ----
const GOALS = [
  { id: 'focus', emoji: '\uD83C\uDFAF', labelKey: 'goal_focus_label', descKey: 'goal_focus_desc' },
  { id: 'discipline', emoji: '\uD83D\uDCAA', labelKey: 'goal_discipline_label', descKey: 'goal_discipline_desc' },
  { id: 'confidence', emoji: '\uD83D\uDC51', labelKey: 'goal_confidence_label', descKey: 'goal_confidence_desc' },
  { id: 'energy', emoji: '\u26A1', labelKey: 'goal_energy_label', descKey: 'goal_energy_desc' },
];

export function ProfilePage() {
  const { user, logout, updateUser, isAdmin, subscriptionActive, subscriptionDaysLeft, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [wallet, setWallet] = useState({ starsBalance: 0, tonBalance: 0 });

  // Which setting panel is open
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  // Custom goal text
  const [customGoalText, setCustomGoalText] = useState(() => {
    const g = user?.selectedGoal || '';
    return g.startsWith('custom:') ? g.slice(7) : '';
  });
  // Toast
  const [toast, setToast] = useState<string | null>(null);
  // Export loading state
  const [exporting, setExporting] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // ---- Local settings (persisted to localStorage) ----
  const [localSettings, setLocalSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('proper_local_settings') || localStorage.getItem('become_local_settings');
      return saved ? JSON.parse(saved) : {
        soundsEnabled: true,
        hapticsEnabled: true,
        compactCards: false,
      };
    } catch {
      return { soundsEnabled: true, hapticsEnabled: true, compactCards: false };
    }
  });

  // ---- Privacy settings (persisted to localStorage, synced to backend if needed) ----
  const [privacySettings, setPrivacySettings] = useState(() => {
    try {
      const saved = localStorage.getItem('proper_privacy_settings') || localStorage.getItem('become_privacy_settings');
      return saved ? JSON.parse(saved) : {
        showInLeaderboard: true,
        publicStreak: true,
        aiJournalAccess: true,
        analytics: true,
      };
    } catch {
      return { showInLeaderboard: true, publicStreak: true, aiJournalAccess: true, analytics: true };
    }
  });

  const updateLocalSetting = useCallback((key: string, value: boolean) => {
    hapticSelection();
    setLocalSettings((prev: any) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('proper_local_settings', JSON.stringify(next)); } catch {}
      return next;
    });
    showToast(t('profile_saved'));
  }, [showToast, t]);

  const updatePrivacySetting = useCallback((key: string, value: boolean) => {
    hapticSelection();
    setPrivacySettings((prev: any) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('proper_privacy_settings', JSON.stringify(next)); } catch {}
      // Sync to backend (non-blocking)
      updateUser({ privacySettings: next } as any);
      return next;
    });
    showToast(t('profile_saved'));
  }, [showToast, t, updateUser]);

  // Daily reminder time (from user data)
  const [reminderTime, setReminderTime] = useState(user?.dailyReminderTime || '09:00');

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getProgress(), api.getWallet()])
      .then(([prog, w]) => {
        setProgress(prog);
        setWallet(w);
      })
      .catch((err) => {
        console.error('[Profile] Error loading data:', err);
      });

    // Hydrate privacy settings from server if available
    if ((user as any)?.privacySettings) {
      const serverPrivacy = (user as any).privacySettings;
      setPrivacySettings((prev: any) => {
        const merged = { ...prev, ...serverPrivacy };
        try { localStorage.setItem('proper_privacy_settings', JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
  }, [user]);

  const completedDays = useMemo(() => progress.filter((p) => p.status === 'done').length, [progress]);
  const skippedDays = useMemo(() => progress.filter((p) => p.status === 'skip').length, [progress]);
  const totalReflections = useMemo(() => progress.filter((p) => p.reflectionText).length, [progress]);

  const togglePanel = useCallback((panel: string) => {
    hapticFeedback('light');
    setOpenPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleLanguageChange = useCallback((code: string) => {
    hapticSelection();
    updateUser({ language: code });
    showToast(t('profile_saved'));
    // Close panel after short delay so user sees the change
    setTimeout(() => setOpenPanel(null), 300);
  }, [updateUser, showToast, t]);

  const handleToneChange = useCallback((tone: string) => {
    hapticSelection();
    updateUser({ tone });
    showToast(t('profile_saved'));
    setTimeout(() => setOpenPanel(null), 300);
  }, [updateUser, showToast, t]);

  const handleGoalChange = useCallback((goal: string) => {
    hapticSelection();
    updateUser({ selectedGoal: goal });
    // Reset custom text if user picked a predefined goal
    if (!goal.startsWith('custom:')) {
      setCustomGoalText('');
    }
    showToast(t('profile_saved'));
    setTimeout(() => setOpenPanel(null), 300);
  }, [updateUser, showToast, t]);

  // Display values for settings rows
  const langDisplay = LANGUAGES.find((l) => l.code === user?.language)?.flag ?? '\uD83C\uDDFA\uD83C\uDDF8';
  const toneDisplay = TONES.find((t) => t.id === user?.tone)?.emoji ?? '\uD83D\uDC9C';
  const isCustomGoal = user?.selectedGoal?.startsWith('custom:');
  const goalDisplay = isCustomGoal ? '\u270F\uFE0F' : (GOALS.find((g) => g.id === user?.selectedGoal)?.emoji ?? '\u2014');

  return (
    <div className="min-h-screen pb-24">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#6c5ce7]/20 blur-[120px]" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-white/[0.1] shadow-2xl"
            style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 px-5 pb-6" >
        <PageHeader title={t('profile_title')} />

        {/* Avatar & name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-4 mb-6"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shadow-lg overflow-hidden shrink-0" style={{ boxShadow: '0 6px 24px rgba(108, 92, 231, 0.35)' }}>
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.firstName || 'Avatar'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <span className={`text-white ${user?.photoUrl ? 'hidden' : ''}`} style={{ fontSize: '1.75rem', fontWeight: 700 }}>
              {user?.firstName?.charAt(0) ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white truncate" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {user?.firstName} {user?.lastName}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {user?.username && (
                <p className="text-white/40 truncate" style={{ fontSize: '0.8125rem' }}>@{user.username}</p>
              )}
              <span className="text-white/10">·</span>
              <p className="text-white/20 shrink-0" style={{ fontSize: '0.6875rem' }}>
                ID: {user?.telegramId}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          <GlassCard padding="md" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{completedDays}</p>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('profile_completed')}</p>
            </div>
          </GlassCard>

          <GlassCard padding="md" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{skippedDays}</p>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('profile_skipped')}</p>
            </div>
          </GlassCard>

          <GlassCard padding="md" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fd79a8]/15 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-[#fd79a8]" />
            </div>
            <div>
              <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalReflections}</p>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('profile_reflections')}</p>
            </div>
          </GlassCard>

          <GlassCard padding="md" className="flex items-center gap-3 overflow-visible">
            <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center">
              <Star className="w-5 h-5 text-[#a29bfe]" />
            </div>
            <div>
              <AnimatedCounter
                value={user?.xp ?? 0}
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
                glowColor="rgba(162, 155, 254, 0.3)"
              />
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('total_xp')}</p>
            </div>
          </GlassCard>
        </motion.div>

        {/* Subscription status card */}
        {!isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17 }}
            className="mb-4"
          >
            <GlassCard padding="md" className="relative overflow-hidden">
              <div className={`absolute -top-6 -left-6 w-20 h-20 rounded-full ${subscriptionActive ? 'bg-[#6c5ce7]/10' : 'bg-amber-500/10'} blur-[30px] pointer-events-none`} />
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  subscriptionActive
                    ? 'bg-gradient-to-br from-[#6c5ce7]/25 to-[#a29bfe]/10'
                    : 'bg-gradient-to-br from-amber-500/20 to-amber-400/10'
                }`}>
                  <Crown className={`w-5 h-5 ${subscriptionActive ? 'text-[#a29bfe]' : 'text-amber-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {subscriptionActive
                      ? (t('profile_language') === 'Язык' ? 'Premium активна' : 'Premium Active')
                      : t('premium_free_plan')}
                  </p>
                  <p className={`mt-0.5 ${subscriptionActive ? 'text-white/30' : 'text-amber-400/70'}`} style={{ fontSize: '0.75rem' }}>
                    {subscriptionActive
                      ? (t('profile_language') === 'Язык'
                          ? `Осталось ${subscriptionDaysLeft} ${subscriptionDaysLeft === 1 ? 'день' : subscriptionDaysLeft < 5 ? 'дня' : 'дней'}`
                          : `${subscriptionDaysLeft} days remaining`)
                      : t('premium_free_plan_desc')}
                  </p>
                </div>
                {subscriptionActive && subscriptionDaysLeft > 0 && (
                  <div className="shrink-0 text-right">
                    <span className={`text-white font-bold ${subscriptionDaysLeft <= 5 ? 'text-amber-400' : 'text-[#a29bfe]'}`} style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {subscriptionDaysLeft}
                    </span>
                    <p className="text-white/20" style={{ fontSize: '0.625rem' }}>
                      {t('profile_language') === 'Язык' ? 'дней' : 'days'}
                    </p>
                  </div>
                )}
              </div>
              {/* Progress bar */}
              {subscriptionActive && subscriptionDaysLeft > 0 && (
                <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      subscriptionDaysLeft <= 5 ? 'bg-amber-400' : 'bg-[#6c5ce7]'
                    }`}
                    style={{ width: `${Math.min(100, (subscriptionDaysLeft / 30) * 100)}%` }}
                  />
                </div>
              )}
              {/* Upgrade CTA for free users */}
              {!subscriptionActive && (
                <button
                  onClick={() => { hapticFeedback('medium'); navigate('/wallet'); }}
                  className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-[#6c5ce7]/20 to-[#a29bfe]/20 border border-[#6c5ce7]/30 text-[#a29bfe] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  <Crown className="w-3.5 h-3.5" />
                  {t('premium_subscribe_btn')}
                </button>
              )}
            </GlassCard>
          </motion.div>
        )}

        {/* Bonuses & Referral card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
          className="mb-4"
        >
          <GlassCard
            variant="interactive"
            padding="md"
            className="relative overflow-hidden"
            onClick={() => { hapticFeedback('medium'); navigate('/bonuses'); }}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#fd79a8]/8 blur-[30px] pointer-events-none" />
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#6c5ce7]/20 flex items-center justify-center">
                <Gem className="w-5 h-5 text-[#fd79a8]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('bonus_nav')}</p>
                <p className="text-white/30 mt-0.5" style={{ fontSize: '0.75rem' }}>{t('bonus_nav_desc')}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 shrink-0" />
            </div>
          </GlassCard>
        </motion.div>

        {/* Wallet */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <GlassCard
            variant="interactive"
            className="flex items-center gap-4 cursor-pointer"
            onClick={() => { hapticFeedback('medium'); navigate('/wallet'); }}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-400/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('my_wallet')}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-yellow-400" style={{ fontSize: '0.8125rem' }}>
                  <Star className="w-3.5 h-3.5" /> {wallet.starsBalance}
                </span>
                <span className="flex items-center gap-1 text-blue-400" style={{ fontSize: '0.8125rem' }}>
                  <Gem className="w-3.5 h-3.5" /> {wallet.tonBalance} TON
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/20" />
          </GlassCard>
        </motion.div>

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6"
        >
          <GlassCard padding="sm" className="overflow-hidden">
            {/* ---- Language ---- */}
            <SettingRow
              icon={Globe}
              color="text-blue-400"
              label={t('profile_language')}
              value={`${langDisplay} ${(user?.language || 'en').toUpperCase()}`}
              isOpen={openPanel === 'language'}
              onToggle={() => togglePanel('language')}
            />
            <AnimatePresence>
              {openPanel === 'language' && (
                <ExpandablePanel>
                  <p className="text-white/30 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('profile_select_language')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGES.map((lang) => {
                      const isActive = user?.language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`h-14 rounded-xl border flex items-center justify-center gap-2.5 transition-all ${
                            isActive
                              ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 shadow-lg'
                              : 'bg-white/[0.03] border-white/[0.06] active:bg-white/[0.06]'
                          }`}
                          style={isActive ? { boxShadow: '0 4px 20px rgba(108,92,231,0.2)' } : {}}
                        >
                          <span style={{ fontSize: '1.25rem' }}>{lang.flag}</span>
                          <span className={isActive ? 'text-white' : 'text-white/60'} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            {t(lang.labelKey)}
                          </span>
                          {isActive && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                              <Check className="w-4 h-4 text-[#6c5ce7]" />
                            </motion.div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ExpandablePanel>
              )}
            </AnimatePresence>

            <div className="h-px bg-white/[0.04] mx-2" />

            {/* ---- Coaching Tone ---- */}
            <SettingRow
              icon={Volume2}
              color="text-emerald-400"
              label={t('profile_coaching_tone')}
              value={`${toneDisplay} ${t(`tone_${user?.tone || 'supportive'}`)}`}
              isOpen={openPanel === 'tone'}
              onToggle={() => togglePanel('tone')}
            />
            <AnimatePresence>
              {openPanel === 'tone' && (
                <ExpandablePanel>
                  <p className="text-white/30 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('profile_select_tone')}
                  </p>
                  <div className="space-y-2">
                    {TONES.map((tone) => {
                      const isActive = user?.tone === tone.id;
                      return (
                        <button
                          key={tone.id}
                          onClick={() => handleToneChange(tone.id)}
                          className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-all ${
                            isActive
                              ? 'bg-[#6c5ce7]/12 border-[#6c5ce7]/30'
                              : 'bg-white/[0.02] border-white/[0.05] active:bg-white/[0.04]'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg ${tone.bgColor} flex items-center justify-center shrink-0`}>
                            <tone.icon className={`w-4.5 h-4.5 ${tone.color}`} style={{ width: 18, height: 18 }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={isActive ? 'text-white' : 'text-white/70'} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                              {tone.emoji} {t(tone.labelKey)}
                            </p>
                            <p className="text-white/30 truncate" style={{ fontSize: '0.6875rem' }}>
                              {t(tone.descKey)}
                            </p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            isActive ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                          }`}>
                            {isActive && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ExpandablePanel>
              )}
            </AnimatePresence>

            <div className="h-px bg-white/[0.04] mx-2" />

            {/* ---- Goal ---- */}
            <SettingRow
              icon={Target}
              color="text-[#a29bfe]"
              label={t('profile_goal')}
              value={user?.selectedGoal
                ? isCustomGoal
                  ? `${goalDisplay} ${user.selectedGoal.replace('custom:', '').slice(0, 40)}${(user.selectedGoal.replace('custom:', '').length > 40) ? '...' : ''}`
                  : `${goalDisplay} ${t(`goal_${user.selectedGoal}_label`)}`
                : t('profile_not_set')}
              isOpen={openPanel === 'goal'}
              onToggle={() => togglePanel('goal')}
            />
            <AnimatePresence>
              {openPanel === 'goal' && (
                <ExpandablePanel>
                  <p className="text-white/30 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('profile_select_goal')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {GOALS.map((goal) => {
                      const isActive = user?.selectedGoal === goal.id;
                      return (
                        <button
                          key={goal.id}
                          onClick={() => handleGoalChange(goal.id)}
                          className={`relative rounded-xl border p-3 text-left transition-all ${
                            isActive
                              ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                              : 'bg-white/[0.02] border-white/[0.05] active:bg-white/[0.04]'
                          }`}
                        >
                          <span className="block mb-1.5" style={{ fontSize: '1.5rem' }}>{goal.emoji}</span>
                          <p className={isActive ? 'text-white' : 'text-white/70'} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                            {t(goal.labelKey)}
                          </p>
                          <p className="text-white/30 mt-0.5" style={{ fontSize: '0.625rem', lineHeight: 1.4 }}>
                            {t(goal.descKey)}
                          </p>
                          {isActive && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6c5ce7] flex items-center justify-center"
                            >
                              <Check className="w-3 h-3 text-white" />
                            </motion.div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom goal input */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <PenLine className="w-3.5 h-3.5 text-[#a29bfe]" />
                      <p className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                        {t('goal_custom_label')}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-2.5 transition-all ${
                      isCustomGoal
                        ? 'bg-[#6c5ce7]/10 border-[#6c5ce7]/30'
                        : 'bg-white/[0.02] border-white/[0.06]'
                    }`}>
                      <textarea
                        value={customGoalText}
                        onChange={(e) => setCustomGoalText(e.target.value)}
                        placeholder={t('goal_custom_placeholder')}
                        rows={2}
                        maxLength={200}
                        className="w-full bg-transparent rounded-lg px-2 py-1.5 text-white placeholder-white/20 resize-none outline-none"
                        style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <VoiceInput
                          onTranscript={(text) => setCustomGoalText((prev) => prev ? prev + ' ' + text : text)}
                          size="sm"
                        />
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (customGoalText.trim()) {
                              handleGoalChange(`custom:${customGoalText.trim()}`);
                            }
                          }}
                          disabled={!customGoalText.trim()}
                          className={`h-8 px-3.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                            customGoalText.trim()
                              ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/40 text-[#a29bfe]'
                              : 'bg-white/[0.03] text-white/15'
                          }`}
                          style={{ fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          <Check className="w-3 h-3" />
                          {t('save')}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </ExpandablePanel>
              )}
            </AnimatePresence>

            <div className="h-px bg-white/[0.04] mx-2" />

            {/* ---- Privacy ---- */}
            <SettingRow
              icon={Shield}
              color="text-amber-400"
              label={t('profile_privacy')}
              value=""
              isOpen={openPanel === 'privacy'}
              onToggle={() => togglePanel('privacy')}
            />
            <AnimatePresence>
              {openPanel === 'privacy' && (
                <ExpandablePanel>
                  <div className="space-y-1">
                    <ToggleSettingRow
                      icon={Eye}
                      color="text-blue-400"
                      label={t('privacy_leaderboard')}
                      description={t('privacy_leaderboard_desc')}
                      enabled={privacySettings.showInLeaderboard}
                      onToggle={() => updatePrivacySetting('showInLeaderboard', !privacySettings.showInLeaderboard)}
                    />
                    <ToggleSettingRow
                      icon={Flame}
                      color="text-amber-400"
                      label={t('privacy_streak_public')}
                      description={t('privacy_streak_desc')}
                      enabled={privacySettings.publicStreak}
                      onToggle={() => updatePrivacySetting('publicStreak', !privacySettings.publicStreak)}
                    />
                    <ToggleSettingRow
                      icon={Brain}
                      color="text-[#a29bfe]"
                      label={t('privacy_ai_journal')}
                      description={t('privacy_ai_journal_desc')}
                      enabled={privacySettings.aiJournalAccess}
                      onToggle={() => updatePrivacySetting('aiJournalAccess', !privacySettings.aiJournalAccess)}
                    />
                    <ToggleSettingRow
                      icon={BarChart3}
                      color="text-emerald-400"
                      label={t('privacy_analytics')}
                      description={t('privacy_analytics_desc')}
                      enabled={privacySettings.analytics}
                      onToggle={() => updatePrivacySetting('analytics', !privacySettings.analytics)}
                    />
                  </div>
                </ExpandablePanel>
              )}
            </AnimatePresence>

            <div className="h-px bg-white/[0.04] mx-2" />

            {/* ---- Settings ---- */}
            <SettingRow
              icon={Settings}
              color="text-white/60"
              label={t('profile_settings')}
              value=""
              isOpen={openPanel === 'settings'}
              onToggle={() => togglePanel('settings')}
            />
            <AnimatePresence>
              {openPanel === 'settings' && (
                <ExpandablePanel>
                  <div className="space-y-1">
                    {/* Daily reminder */}
                    <ToggleSettingRow
                      icon={Bell}
                      color="text-blue-400"
                      label={t('settings_daily_reminder')}
                      description={t('settings_daily_reminder_desc')}
                      enabled={!!user?.dailyReminderTime}
                      onToggle={() => {
                        const newVal = user?.dailyReminderTime ? null : reminderTime;
                        updateUser({ dailyReminderTime: newVal as any });
                        showToast(t('profile_saved'));
                      }}
                    />
                    {/* Reminder time picker */}
                    {user?.dailyReminderTime && (
                      <div className="flex items-center gap-3 px-2 py-2 ml-8">
                        <Clock className="w-4 h-4 text-white/30" />
                        <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{t('settings_reminder_time')}</span>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => {
                            setReminderTime(e.target.value);
                            updateUser({ dailyReminderTime: e.target.value });
                            showToast(t('profile_saved'));
                          }}
                          className="ml-auto bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white outline-none"
                          style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                        />
                      </div>
                    )}

                    {/* Sounds */}
                    <ToggleSettingRow
                      icon={Volume2}
                      color="text-emerald-400"
                      label={t('settings_sounds')}
                      description={t('settings_sounds_desc')}
                      enabled={localSettings.soundsEnabled}
                      onToggle={() => updateLocalSetting('soundsEnabled', !localSettings.soundsEnabled)}
                    />

                    {/* Haptics */}
                    <ToggleSettingRow
                      icon={Vibrate}
                      color="text-[#fd79a8]"
                      label={t('settings_haptics')}
                      description={t('settings_haptics_desc')}
                      enabled={localSettings.hapticsEnabled}
                      onToggle={() => updateLocalSetting('hapticsEnabled', !localSettings.hapticsEnabled)}
                    />

                    {/* Compact cards */}
                    <ToggleSettingRow
                      icon={LayoutGrid}
                      color="text-[#a29bfe]"
                      label={t('settings_compact_cards')}
                      description={t('settings_compact_cards_desc')}
                      enabled={localSettings.compactCards}
                      onToggle={() => updateLocalSetting('compactCards', !localSettings.compactCards)}
                    />

                    {/* Divider: Data section */}
                    <div className="pt-3 pb-1">
                      <p className="text-white/20 px-1" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                        {t('settings_data_section')}
                      </p>
                    </div>

                    {/* Export data */}
                    <button
                      disabled={exporting}
                      onClick={async () => {
                        if (exporting) return;
                        hapticFeedback('light');
                        setExporting(true);
                        try {
                          // Fetch all journal notes
                          const { notes, total } = await api.getNotes({ limit: 5000 });
                          if (!notes || notes.length === 0) {
                            showToast(t('settings_export_empty'));
                            setExporting(false);
                            return;
                          }

                          const lang = user?.language || 'en';
                          const isRu = lang === 'ru';

                          // Type labels for export
                          const typeLabels: Record<string, string> = {
                            quick: isRu ? 'Заметка' : 'Quick Note',
                            voice: isRu ? 'Голосовая заметка' : 'Voice Note',
                            reflection: isRu ? 'Рефлексия' : 'Reflection',
                            journal: isRu ? 'Журнал' : 'Journal Entry',
                          };

                          // Sort by date (newest first)
                          const sorted = [...notes].sort((a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                          );

                          // Group by date
                          const groups = new Map<string, typeof sorted>();
                          for (const note of sorted) {
                            const dateKey = new Date(note.createdAt).toLocaleDateString(
                              isRu ? 'ru-RU' : 'en-US',
                              { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
                            );
                            if (!groups.has(dateKey)) groups.set(dateKey, []);
                            groups.get(dateKey)!.push(note);
                          }

                          // Build text file
                          const lines: string[] = [];
                          lines.push('═══════════════════════════════════════');
                          lines.push(isRu ? '  Proper Food — Экспорт журнала' : '  Proper Food — Journal Export');
                          lines.push(`  ${user?.firstName || ''} ${user?.lastName || ''}`.trim());
                          lines.push(`  ${isRu ? 'Экспортировано' : 'Exported'}: ${new Date().toLocaleString(isRu ? 'ru-RU' : 'en-US')}`);
                          lines.push(`  ${isRu ? 'Всего записей' : 'Total entries'}: ${notes.length}`);
                          lines.push('═══════════════════════════════════════');
                          lines.push('');

                          for (const [dateLabel, dateNotes] of groups) {
                            lines.push(`── ${dateLabel} ──`);
                            lines.push('');

                            for (const note of dateNotes) {
                              const time = new Date(note.createdAt).toLocaleTimeString(
                                isRu ? 'ru-RU' : 'en-US',
                                { hour: '2-digit', minute: '2-digit' }
                              );
                              const typeLabel = typeLabels[note.type] || note.type;
                              const isVoice = note.type === 'voice';

                              lines.push(`[${time}] ${typeLabel}${isVoice ? ` (${isRu ? 'расшифровка' : 'transcription'})` : ''}`);

                              if (note.relatedDayNumber != null) {
                                lines.push(`  ${isRu ? 'День программы' : 'Program Day'}: ${note.relatedDayNumber}`);
                              }

                              if (note.contentText) {
                                // Indent multi-line text
                                const textLines = note.contentText.split('\n');
                                for (const line of textLines) {
                                  lines.push(`  ${line}`);
                                }
                              }

                              lines.push('');
                            }
                          }

                          // Also try to include AI coach conversations
                          try {
                            const { conversations } = await api.coachChatList();
                            if (conversations && conversations.length > 0) {
                              lines.push('');
                              lines.push('═══════════════════════════════════════');
                              lines.push(isRu ? '  AI-Коуч — История диалогов' : '  AI Coach — Conversation History');
                              lines.push(`  ${isRu ? 'Всего диалогов' : 'Total conversations'}: ${conversations.length}`);
                              lines.push('═══════════════════════════════════════');
                              lines.push('');

                              // Fetch up to 10 most recent conversations
                              const recentConvos = conversations
                                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                                .slice(0, 10);

                              for (const convo of recentConvos) {
                                try {
                                  const full = await api.coachChatGet(convo.id);
                                  if (full.messages && full.messages.length > 0) {
                                    const convoDate = new Date(full.createdAt).toLocaleDateString(
                                      isRu ? 'ru-RU' : 'en-US',
                                      { year: 'numeric', month: 'long', day: 'numeric' }
                                    );
                                    lines.push(`── ${isRu ? 'Диалог' : 'Conversation'} · ${convoDate} ──`);
                                    lines.push('');

                                    for (const msg of full.messages) {
                                      const role = msg.role === 'user'
                                        ? (isRu ? 'Вы' : 'You')
                                        : (isRu ? 'AI-Коуч' : 'AI Coach');
                                      const msgTime = new Date(msg.ts).toLocaleTimeString(
                                        isRu ? 'ru-RU' : 'en-US',
                                        { hour: '2-digit', minute: '2-digit' }
                                      );
                                      lines.push(`[${msgTime}] ${role}:`);
                                      const msgLines = msg.content.split('\n');
                                      for (const ml of msgLines) {
                                        lines.push(`  ${ml}`);
                                      }
                                      lines.push('');
                                    }
                                  }
                                } catch {
                                  // Skip failed conversation fetch
                                }
                              }
                            }
                          } catch {
                            // Coach chat not available — skip silently
                          }

                          lines.push('');
                          lines.push('───────────────────────────────────────');
                          lines.push(isRu ? 'Сгенерировано приложением Proper Food AI' : 'Generated by Proper Food AI');
                          lines.push(BOT_MENTION);

                          const text = lines.join('\n');
                          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `proper-food-journal-${new Date().toISOString().slice(0, 10)}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          hapticSuccess();
                          showToast(t('settings_export_success'));
                        } catch (err) {
                          console.error('[Profile] Journal export error:', err);
                          showToast(t('settings_export_error'));
                        } finally {
                          setExporting(false);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors ${exporting ? 'opacity-50' : ''}`}
                    >
                      {exporting ? (
                        <Loader2 className="w-[18px] h-[18px] text-blue-400 animate-spin" />
                      ) : (
                        <Download className="w-[18px] h-[18px] text-blue-400" />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                          {exporting ? t('settings_export_loading') : t('settings_export_data')}
                        </p>
                        <p className="text-white/25" style={{ fontSize: '0.625rem' }}>{t('settings_export_desc')}</p>
                      </div>
                      {!exporting && <ChevronRight className="w-4 h-4 text-white/15" />}
                    </button>

                    {/* Clear cache */}
                    <button
                      onClick={() => {
                        hapticFeedback('medium');
                        localStorage.removeItem('proper_local_settings');
                        localStorage.removeItem('proper_privacy_settings');
                        localStorage.removeItem('proper_support_dismissed');
                        // Clean up legacy keys
                        localStorage.removeItem('become_local_settings');
                        localStorage.removeItem('become_privacy_settings');
                        localStorage.removeItem('become_support_dismissed');
                        setLocalSettings({ soundsEnabled: true, hapticsEnabled: true, compactCards: false });
                        setPrivacySettings({ showInLeaderboard: true, publicStreak: true, aiJournalAccess: true, analytics: true });
                        showToast(t('settings_cleared'));
                      }}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors"
                    >
                      <Trash2 className="w-4.5 h-4.5 text-red-400/60" style={{ width: 18, height: 18 }} />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t('settings_clear_cache')}</p>
                        <p className="text-white/25" style={{ fontSize: '0.625rem' }}>{t('settings_clear_desc')}</p>
                      </div>
                    </button>

                    {/* Version */}
                    <div className="flex items-center justify-between px-2 pt-2">
                      <span className="text-white/15" style={{ fontSize: '0.6875rem' }}>{t('settings_version')}</span>
                      <span className="text-white/15" style={{ fontSize: '0.6875rem' }}>1.0.0</span>
                    </div>
                  </div>
                </ExpandablePanel>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>

        {/* Notification Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <NotificationSettingsSection />
        </motion.div>

        {/* Admin Panel — only shown to admin users */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.31 }}
            className="mb-6"
          >
            <GlassCard
              variant="interactive"
              padding="md"
              className="relative overflow-hidden"
              onClick={() => { hapticFeedback('medium'); navigate('/admin'); }}
            >
              <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#6c5ce7]/10 blur-[30px] pointer-events-none" />
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6c5ce7]/30 to-[#a29bfe]/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#a29bfe]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Admin Panel</p>
                  <p className="text-white/30 mt-0.5" style={{ fontSize: '0.75rem' }}>
                    {t('profile_language') === 'Язык' ? 'Управление пользователями и рассылки' : 'Manage users & broadcasts'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/20 shrink-0" />
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Logout */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
        >
          <button
            onClick={() => {
              hapticFeedback('medium');
              logout();
              navigate('/');
            }}
            className="w-full h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center gap-2"
            style={{ fontSize: '0.9375rem', fontWeight: 500 }}
          >
            <LogOut className="w-4 h-4" />
            {t('profile_logout')}
          </button>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-white/15 mt-8" style={{ fontSize: '0.6875rem' }}>
          Proper Food AI v1.0.0 · {BOT_MENTION}
        </p>
      </div>
    </div>
  );
}

// ---- Reusable setting row ----
function SettingRow({
  icon: Icon,
  color,
  label,
  value,
  isOpen,
  onToggle,
  disabled,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-2 py-3 ${disabled ? 'opacity-50' : ''}`}
      onClick={onToggle}
    >
      <Icon className={`w-5 h-5 ${color}`} />
      <span className="text-white flex-1 text-left" style={{ fontSize: '0.9375rem' }}>{label}</span>
      <span className="text-white/30" style={{ fontSize: '0.8125rem' }}>{value}</span>
      {!disabled ? (
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-white/15" />
        </motion.div>
      ) : (
        <ChevronRight className="w-4 h-4 text-white/15" />
      )}
    </button>
  );
}

// ---- Reusable toggle setting row ----
function ToggleSettingRow({
  icon: Icon,
  color,
  label,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors"
      onClick={onToggle}
    >
      <Icon className={`${color}`} style={{ width: 18, height: 18 }} />
      <div className="flex-1 text-left min-w-0">
        <p className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{label}</p>
        <p className="text-white/25" style={{ fontSize: '0.625rem' }}>{description}</p>
      </div>
      {/* iOS-style toggle switch */}
      <div
        className={`relative w-[42px] h-[26px] rounded-full shrink-0 transition-colors duration-200 ${
          enabled ? 'bg-[#6c5ce7]' : 'bg-white/10'
        }`}
      >
        <motion.div
          className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-md"
          animate={{ left: enabled ? 19 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
        />
      </div>
    </button>
  );
}

// ---- Expandable panel wrapper ----
function ExpandablePanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-2 pb-3 pt-1">
        {children}
      </div>
    </motion.div>
  );
}
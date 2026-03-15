// =============================================
// Profile Screen — Redesigned with Collapsible
// Cards & Bottom Sheet Editing
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Scale,
  Target,
  Settings,
  Bell,
  Share2,
  LogOut,
  ChevronRight,
  ChevronDown,
  Edit2,
  Users,
  Crown,
  BarChart3,
  Check,
  X,
  Loader2,
  Ruler,
  Flame,
  Sparkles,
  Heart,
  Shield,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { hapticFeedback, hapticSuccess, openTelegramLink } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { api, getUserLang } from './api-client';
import { calculateCalories } from './calorie-calculator';
import { AiCalorieAdvisor } from './ai-calorie-advisor';
import { SwipeableBottomSheet } from './ui/swipeable-bottom-sheet';
import { buildStartLink } from './bot-config';

type Gender = 'male' | 'female';
type ActivityLevel = 'low' | 'medium' | 'high' | 'athlete';
type Goal = 'lose_weight' | 'maintain_weight' | 'gain_muscle';

interface ProfileData {
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  activity_level: ActivityLevel;
  goal: Goal;
  daily_calorie_target?: number;
  bmr?: number;
  daily_maintenance_calories?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
  // Body measurements
  neck_cm?: number;
  chest_cm?: number;
  waist_cm?: number;
  hips_cm?: number;
}

const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: 'pn_goal_lose',
  maintain_weight: 'pn_goal_maintain',
  gain_muscle: 'pn_goal_gain',
};

const GOAL_ICONS: Record<Goal, string> = {
  lose_weight: '\u{1F525}',
  maintain_weight: '\u{2696}\u{FE0F}',
  gain_muscle: '\u{1F4AA}',
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low: 'pn_activity_low',
  medium: 'pn_activity_medium',
  high: 'pn_activity_high',
  athlete: 'pn_activity_athlete',
};

// Body fat category helper
function getBodyFatCategory(bf: number, gender: string): { key: string; color: string; bg: string } {
  if (gender === 'male') {
    if (bf < 6) return { key: 'pn_bf_essential', color: '#e17055', bg: 'rgba(225,112,85,0.15)' };
    if (bf < 14) return { key: 'pn_bf_athletic', color: '#00cec9', bg: 'rgba(0,206,201,0.15)' };
    if (bf < 18) return { key: 'pn_bf_fitness', color: '#6c5ce7', bg: 'rgba(108,92,231,0.15)' };
    if (bf < 25) return { key: 'pn_bf_acceptable', color: '#fdcb6e', bg: 'rgba(253,203,110,0.15)' };
    return { key: 'pn_bf_obese', color: '#d63031', bg: 'rgba(214,48,49,0.15)' };
  } else {
    if (bf < 14) return { key: 'pn_bf_essential', color: '#e17055', bg: 'rgba(225,112,85,0.15)' };
    if (bf < 21) return { key: 'pn_bf_athletic', color: '#00cec9', bg: 'rgba(0,206,201,0.15)' };
    if (bf < 25) return { key: 'pn_bf_fitness', color: '#6c5ce7', bg: 'rgba(108,92,231,0.15)' };
    if (bf < 32) return { key: 'pn_bf_acceptable', color: '#fdcb6e', bg: 'rgba(253,203,110,0.15)' };
    return { key: 'pn_bf_obese', color: '#d63031', bg: 'rgba(214,48,49,0.15)' };
  }
}

export function ProfileNutritionPage() {
  const { user, logout, subscriptionActive, subscriptionDaysLeft, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bottom sheet state
  const [sheetType, setSheetType] = useState<'metrics' | 'goal' | 'calories' | 'measurements' | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState<Gender>('male');
  const [editGoal, setEditGoal] = useState<Goal>('maintain_weight');
  const [editActivity, setEditActivity] = useState<ActivityLevel>('medium');
  const [editCalories, setEditCalories] = useState('');
  const [showAiAdvisor, setShowAiAdvisor] = useState(false);

  // Body measurements edit state
  const [editNeck, setEditNeck] = useState('');
  const [editChest, setEditChest] = useState('');
  const [editWaist, setEditWaist] = useState('');
  const [editHips, setEditHips] = useState('');

  // Collapsible sections
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Load profile from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getUserProfile();
        if (!cancelled && data) {
          setProfile(data as ProfileData);
          if (data.daily_calorie_target) {
            localStorage.setItem('nutrition_calorie_target', String(data.daily_calorie_target));
          }
          localStorage.setItem('nutrition_profile', JSON.stringify(data));
        } else if (!cancelled && !data) {
          try {
            const cached = localStorage.getItem('nutrition_profile');
            if (cached) setProfile(JSON.parse(cached) as ProfileData);
          } catch {}
        }
      } catch (err) {
        console.error('[Profile] Load error:', err);
        try {
          const cached = localStorage.getItem('nutrition_profile');
          if (cached && !cancelled) setProfile(JSON.parse(cached) as ProfileData);
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isPremium = subscriptionActive;
  const bmi = profile ? (profile.weight / ((profile.height / 100) ** 2)).toFixed(1) : '\u2014';

  // Body fat % calculation (U.S. Navy Method)
  const bodyFatPercent = React.useMemo(() => {
    if (!profile || !profile.waist_cm || !profile.neck_cm || !profile.height) return null;
    const { gender, height, waist_cm, neck_cm, hips_cm } = profile;
    try {
      if (gender === 'male') {
        // Men: 86.010 × log10(waist - neck) - 70.041 × log10(height) + 36.76
        if (waist_cm <= neck_cm) return null;
        const bf = 86.010 * Math.log10(waist_cm - neck_cm) - 70.041 * Math.log10(height) + 36.76;
        return bf > 0 && bf < 60 ? bf.toFixed(1) : null;
      } else {
        // Women: 163.205 × log10(waist + hip - neck) - 97.684 × log10(height) - 78.387
        if (!hips_cm) return null;
        const sum = waist_cm + hips_cm - neck_cm;
        if (sum <= 0) return null;
        const bf = 163.205 * Math.log10(sum) - 97.684 * Math.log10(height) - 78.387;
        return bf > 0 && bf < 60 ? bf.toFixed(1) : null;
      }
    } catch {
      return null;
    }
  }, [profile]);

  // ---- Open bottom sheets ----
  const openMetricsSheet = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditWeight(String(profile.weight));
    setEditHeight(String(profile.height));
    setEditAge(String(profile.age));
    setEditGender(profile.gender);
    setSheetType('metrics');
  };

  const openGoalSheet = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditGoal(profile.goal);
    setEditActivity(profile.activity_level);
    setSheetType('goal');
  };

  const openCaloriesSheet = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditCalories(String(profile.daily_calorie_target || 2000));
    setSheetType('calories');
  };

  const openMeasurementsSheet = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditNeck(String(profile.neck_cm || ''));
    setEditChest(String(profile.chest_cm || ''));
    setEditWaist(String(profile.waist_cm || ''));
    setEditHips(String(profile.hips_cm || ''));
    setSheetType('measurements');
  };

  const closeSheet = () => setSheetType(null);

  // ---- Save logic ----
  const saveProfile = useCallback(async (updated: Partial<ProfileData>) => {
    if (!profile) return;
    setSaving(true);
    hapticFeedback('medium');

    const merged = { ...profile, ...updated };
    const calorieResult = calculateCalories({
      gender: merged.gender,
      age: merged.age,
      height: merged.height,
      weight: merged.weight,
      activityLevel: merged.activity_level,
      goal: merged.goal,
    });

    const finalCalories = updated.daily_calorie_target
      ? updated.daily_calorie_target
      : calorieResult.targetCalories;

    try {
      await api.saveUserProfile({
        gender: merged.gender,
        age: merged.age,
        height: merged.height,
        weight: merged.weight,
        activity_level: merged.activity_level,
        goal: merged.goal,
        daily_calorie_target: finalCalories,
        bmr: calorieResult.bmr,
        daily_maintenance_calories: calorieResult.dailyCalories,
        target_protein: merged.target_protein,
        target_carbs: merged.target_carbs,
        target_fat: merged.target_fat,
        neck_cm: merged.neck_cm,
        chest_cm: merged.chest_cm,
        waist_cm: merged.waist_cm,
        hips_cm: merged.hips_cm,
      });

      setProfile({
        ...merged,
        daily_calorie_target: finalCalories,
        bmr: calorieResult.bmr,
        daily_maintenance_calories: calorieResult.dailyCalories,
      });

      localStorage.setItem('nutrition_calorie_target', String(finalCalories));
      localStorage.setItem('nutrition_bmr', String(calorieResult.bmr));
      localStorage.setItem('nutrition_maintenance', String(calorieResult.dailyCalories));
      hapticSuccess();
    } catch (err) {
      console.error('[Profile] Save error:', err);
    } finally {
      setSaving(false);
      setSheetType(null);
    }
  }, [profile]);

  const saveMetrics = () => {
    const w = Number(editWeight);
    const h = Number(editHeight);
    const a = Number(editAge);
    if (w > 0 && h > 0 && a > 0) {
      saveProfile({ weight: w, height: h, age: a, gender: editGender });
    }
  };

  const saveGoal = () => {
    saveProfile({ goal: editGoal, activity_level: editActivity });
  };

  const saveCalories = () => {
    const cal = Number(editCalories);
    if (cal > 500 && cal < 10000) {
      saveProfile({ daily_calorie_target: cal });
    }
  };

  const saveMeasurements = () => {
    const neck = Number(editNeck);
    const chest = Number(editChest);
    const waist = Number(editWaist);
    const hips = Number(editHips);
    if (neck > 0 && chest > 0 && waist > 0 && hips > 0) {
      saveProfile({ neck_cm: neck, chest_cm: chest, waist_cm: waist, hips_cm: hips });
    }
  };

  const handleReferralShare = () => {
    hapticFeedback('medium');
    // Use referral code if available, otherwise fall back to telegramId
    const code = user?.referralCode || (user?.telegramId ? String(user.telegramId) : null);
    if (!code) return;
    const referralLink = buildStartLink(`ref_${code}`);
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t('bonus_share_text'))}`;
    try {
      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(tgShareUrl);
        return;
      }
    } catch (_) {}
    // Fallback: open in browser
    window.open(tgShareUrl, '_blank');
  };

  const toggleSection = (id: string) => {
    hapticFeedback('light');
    setExpandedSection((prev) => (prev === id ? null : id));
  };

  const menuItems = [
    { icon: BarChart3, label: t('pn_weight_tracking'), color: '#0984e3', action: () => navigate('/weight') },
    { icon: Bell, label: t('pn_notifications'), color: '#ffeaa7', action: () => navigate('/profile/notifications') },
    { icon: Users, label: t('pn_referrals'), color: '#a29bfe', action: () => navigate('/referrals') },
  ];

  return (
    <div className="min-h-screen pb-32">
      <PageHeader title={t('profile_title') || 'Profile'} />

      <div className="px-4 space-y-3">

        {/* ======== User Card ======== */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-4">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.firstName}
                className="w-14 h-14 rounded-full object-cover border-2 border-white/10"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center flex-shrink-0 ${user?.photoUrl ? 'hidden' : ''}`}>
              <User className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg text-foreground font-semibold truncate">
                  {user?.firstName || 'User'}
                </h2>
                {isPremium && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#ffd700]/20 to-[#ffa500]/20 border border-[#ffd700]/30 flex-shrink-0">
                    <Crown className="w-3 h-3 text-[#ffd700]" />
                    <span className="text-[0.625rem] text-[#ffd700] font-semibold">PRO</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{user?.username || 'username'}</p>
            </div>
          </div>

          {/* Quick stats row */}
          {!loading && profile && (
            <div className={`grid ${bodyFatPercent ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mt-4 pt-3`} style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
              <div className="text-center">
                <p className="text-lg text-foreground font-semibold">{profile.weight}<span className="text-xs text-muted-foreground ml-0.5">{t('unit_kg')}</span></p>
                <p className="text-[0.625rem] text-muted-foreground">{t('pn_weight')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg text-foreground font-semibold">{profile.height}<span className="text-xs text-muted-foreground ml-0.5">{t('unit_cm')}</span></p>
                <p className="text-[0.625rem] text-muted-foreground">{t('pn_height')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg text-foreground font-semibold">{bmi}</p>
                <p className="text-[0.625rem] text-muted-foreground">{t('pn_bmi')}</p>
              </div>
              {bodyFatPercent && (
                <div className="text-center">
                  <p className="text-lg text-foreground font-semibold">{bodyFatPercent}<span className="text-xs text-muted-foreground ml-0.5">%</span></p>
                  <p className="text-[0.625rem] text-muted-foreground">{t('pn_body_fat')}</p>
                  {(() => {
                    const cat = getBodyFatCategory(Number(bodyFatPercent), profile!.gender);
                    return (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[0.5rem] font-semibold" style={{ background: cat.bg, color: cat.color }}>
                        {t(cat.key)}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* ======== Body & Nutrition — Collapsible Section ======== */}
        {profile && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}>
            {/* Section Header */}
            <button
              onClick={() => toggleSection('body')}
              className="w-full px-5 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/15 to-[#a29bfe]/10 flex items-center justify-center">
                  <Heart className="w-4.5 h-4.5 text-[#a29bfe]" />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium text-[0.9375rem]">{t('pn_section_body')}</p>
                  <p className="text-muted-foreground text-xs">{t('pn_section_body_desc')}</p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: expandedSection === 'body' ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            </button>

            {/* Expandable Content */}
            <AnimatePresence initial={false}>
              {expandedSection === 'body' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">

                    {/* Body Metrics Row */}
                    <button
                      onClick={openMetricsSheet}
                      className="w-full p-3.5 rounded-xl flex items-center justify-between"
                      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Scale className="w-4.5 h-4.5 text-[#6c5ce7]" />
                        <div className="text-left">
                          <p className="text-foreground text-sm font-medium">{t('pn_body_metrics')}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-muted-foreground text-xs">{t('pn_weight')}: <span className="text-foreground/70 font-medium">{profile.weight}{t('unit_kg')}</span></span>
                            <span className="text-muted-foreground text-xs">{t('pn_height')}: <span className="text-foreground/70 font-medium">{profile.height}{t('unit_cm')}</span></span>
                            <span className="text-muted-foreground text-xs">{t('pn_age')}: <span className="text-foreground/70 font-medium">{profile.age}</span></span>
                            <span className="text-muted-foreground text-xs">{profile.gender === 'male' ? t('pn_male') : t('pn_female')}</span>
                          </div>
                        </div>
                      </div>
                      <Edit2 className="w-4 h-4 text-muted-foreground/50" />
                    </button>

                    {/* Goal & Activity Row */}
                    <button
                      onClick={openGoalSheet}
                      className="w-full p-3.5 rounded-xl flex items-center justify-between"
                      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Target className="w-4.5 h-4.5 text-[#fd79a8]" />
                        <div className="text-left">
                          <p className="text-foreground text-sm font-medium">{t('pn_current_goal')}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-muted-foreground text-xs">{GOAL_ICONS[profile.goal]} {t(GOAL_LABELS[profile.goal])}</span>
                            <span className="text-muted-foreground text-xs">{t(ACTIVITY_LABELS[profile.activity_level])}</span>
                          </div>
                        </div>
                      </div>
                      <Edit2 className="w-4 h-4 text-muted-foreground/50" />
                    </button>

                    {/* Calorie Target Row */}
                    <button
                      onClick={openCaloriesSheet}
                      className="w-full p-3.5 rounded-xl flex items-center justify-between"
                      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Flame className="w-4.5 h-4.5 text-[#e17055]" />
                        <div className="text-left">
                          <p className="text-foreground text-sm font-medium">{t('pn_daily_calorie_goal')}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-muted-foreground text-xs">{profile.daily_calorie_target || '\u2014'} {t('pn_kcal_day')}</span>
                            {profile.target_protein ? (
                              <>
                                <span className="px-1.5 py-0.5 rounded-full bg-[#6c5ce7]/10 text-[#a29bfe]" style={{ fontSize: '0.625rem', fontWeight: 600 }}>P {profile.target_protein}g</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-[#fdcb6e]/10 text-[#fdcb6e]" style={{ fontSize: '0.625rem', fontWeight: 600 }}>C {profile.target_carbs || '?'}g</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-[#e17055]/10 text-[#e17055]" style={{ fontSize: '0.625rem', fontWeight: 600 }}>F {profile.target_fat || '?'}g</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <Edit2 className="w-4 h-4 text-muted-foreground/50" />
                    </button>

                    {/* Body Measurements Row */}
                    <button
                      onClick={() => { hapticFeedback('light'); navigate('/measurements'); }}
                      className="w-full p-3.5 rounded-xl flex items-center justify-between"
                      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Ruler className="w-4.5 h-4.5 text-[#6c5ce7]" />
                        <div className="text-left">
                          <p className="text-foreground text-sm font-medium">{t('pn_body_measurements')}</p>
                          {profile.waist_cm ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              <span className="text-muted-foreground text-xs">{t('pn_neck')}: <span className="text-foreground/70 font-medium">{profile.neck_cm}{t('unit_cm')}</span></span>
                              <span className="text-muted-foreground text-xs">{t('pn_waist')}: <span className="text-foreground/70 font-medium">{profile.waist_cm}{t('unit_cm')}</span></span>
                              <span className="text-muted-foreground text-xs">{t('pn_hips')}: <span className="text-foreground/70 font-medium">{profile.hips_cm}{t('unit_cm')}</span></span>
                              {bodyFatPercent && (() => {
                                const cat = getBodyFatCategory(Number(bodyFatPercent), profile.gender);
                                return (
                                  <span className="px-1.5 py-0.5 rounded-full text-[0.5625rem] font-semibold" style={{ background: cat.bg, color: cat.color }}>
                                    BF {bodyFatPercent}% · {t(cat.key)}
                                  </span>
                                );
                              })()}
                            </div>
                          ) : (
                            <p className="text-muted-foreground/60 text-xs mt-0.5">{t('pn_add_measurements')}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                    </button>

                    {/* AI Advisor CTA */}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        hapticFeedback('medium');
                        setShowAiAdvisor(true);
                      }}
                      className="w-full p-3.5 rounded-xl flex items-center gap-3 relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(108,92,231,0.1), rgba(0,206,201,0.06))',
                        border: '1px solid rgba(108,92,231,0.2)',
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-foreground text-sm font-medium">{t('pn_ask_ai')}</p>
                        <p className="text-muted-foreground text-[0.6875rem] leading-snug">{t('pn_ask_ai_desc')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#a29bfe]/60 flex-shrink-0" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* No profile fallback */}
        {!loading && !profile && (
          <GlassCard className="p-5">
            <p className="text-sm text-muted-foreground text-center py-2">
              {t('pn_no_profile')}
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 py-2.5 rounded-xl bg-[#6c5ce7]/15 border border-[#6c5ce7]/25 text-sm text-[#a29bfe] font-medium"
            >
              {t('pn_setup_profile')}
            </button>
          </GlassCard>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* ======== Share Referral ======== */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleReferralShare}
          className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#00cec9] to-[#74b9ff] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-sm">{t('pn_share_friends')}</p>
              <p className="text-white/70 text-xs">{t('pn_share_rewards')}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-foreground/60" />
        </motion.button>

        {/* ======== Premium Upgrade / Status ======== */}
        {!isPremium && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { hapticFeedback('medium'); navigate('/upgrade'); }}
            className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] relative overflow-hidden"
            style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-foreground/[0.06] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm mb-0.5">{t('pn_upgrade_premium')}</p>
                <p className="text-white/70 text-xs">{t('pn_upgrade_desc')}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-foreground/60" />
            </div>
          </motion.button>
        )}

        {/* ======== Admin Panel (admins only) ======== */}
        {isAdmin && (
          <button
            onClick={() => { hapticFeedback('light'); navigate('/admin'); }}
            className="w-full p-3.5 rounded-[18px] flex items-center gap-3"
            style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border)' }}
          >
            <div className="w-9 h-9 rounded-[14px] bg-[#6c5ce7]/15 flex items-center justify-center shrink-0">
              <Shield className="w-[18px] h-[18px] text-[#a29bfe]" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-foreground/90 text-sm font-medium">{t('pn_admin_panel')}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          </button>
        )}

        {/* ======== Notifications ======== */}
        <button
          onClick={() => { hapticFeedback('light'); navigate('/profile/notifications'); }}
          className="w-full p-4 rounded-2xl flex items-center justify-between"
          style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(253,203,110,0.1)' }}>
              <Bell className="w-4.5 h-4.5 text-[#ffeaa7]" />
            </div>
            <span className="text-foreground text-[0.9375rem] font-medium">{t('pn_notifications')}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>

        {/* ======== Referrals ======== */}
        <button
          onClick={() => { hapticFeedback('light'); navigate('/referrals'); }}
          className="w-full p-4 rounded-2xl flex items-center justify-between"
          style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(162,155,254,0.1)' }}>
              <Users className="w-4.5 h-4.5 text-[#a29bfe]" />
            </div>
            <div className="text-left">
              <p className="text-foreground text-[0.9375rem] font-medium">{t('pn_referrals')}</p>
              {(user?.referralCount ?? 0) > 0 && (
                <p className="text-muted-foreground text-xs">{t('pn_referrals_invited', { n: user?.referralCount || 0 })}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(user?.referralCount ?? 0) > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#a29bfe]/15 text-[#a29bfe] text-[0.625rem] font-bold flex items-center justify-center">
                {user?.referralCount}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          </div>
        </button>

        {/* ======== Social Tasks ======== */}
        <button
          onClick={() => { hapticFeedback('light'); navigate('/bonuses'); }}
          className="w-full p-4 rounded-2xl flex items-center justify-between"
          style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,206,201,0.1)' }}>
              <Sparkles className="w-4.5 h-4.5 text-[#00cec9]" />
            </div>
            <div className="text-left">
              <p className="text-foreground text-[0.9375rem] font-medium">{t('pn_social_tasks')}</p>
              <p className="text-muted-foreground text-xs">{t('pn_social_tasks_desc')}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>

        {/* ======== Subscription ======== */}
        <button
          onClick={() => { hapticFeedback('light'); navigate('/upgrade'); }}
          className="w-full p-4 rounded-2xl flex items-center justify-between"
          style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: isPremium ? 'rgba(255,215,0,0.1)' : 'rgba(108,92,231,0.1)' }}>
              <Crown className="w-4.5 h-4.5" style={{ color: isPremium ? '#ffd700' : '#6c5ce7' }} />
            </div>
            <div className="text-left">
              <p className="text-foreground text-[0.9375rem] font-medium">{t('pn_subscription')}</p>
              <p className="text-muted-foreground text-xs">
                {isPremium
                  ? t('pn_sub_active_days', { n: subscriptionDaysLeft })
                  : t('pn_sub_free')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPremium && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20 text-[0.5625rem] text-[#ffd700] font-semibold">PRO</span>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          </div>
        </button>

        {/* ======== Sign Out ======== */}
        <button
          onClick={() => { hapticFeedback('medium'); logout(); }}
          className="w-full p-3.5 rounded-[18px] flex items-center justify-center gap-2"
          style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border)' }}
        >
          <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
          <span className="text-foreground/80 text-sm">{t('pn_sign_out')}</span>
        </button>

        {/* ======== Developer Badge — Tezam.by ======== */}
        <a
          href="https://tezam.by"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => hapticFeedback('light')}
          className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 opacity-50 hover:opacity-70 transition-opacity"
        >
          <Heart className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-[0.8125rem]">{t('pn_developed_by')}</span>
          <span className="text-foreground/60 text-[0.8125rem] font-medium">Tezam.by</span>
        </a>

      </div>

      {/* ======== BOTTOM SHEETS ======== */}

      {/* Metrics Bottom Sheet */}
      <SwipeableBottomSheet
        open={sheetType === 'metrics'}
        onClose={closeSheet}
        title={t('pn_edit_metrics')}
      >
        <div className="space-y-4 mt-3">
          {/* Gender toggle */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">{t('pn_gender')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as Gender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => { hapticFeedback('light'); setEditGender(g); }}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                    editGender === g
                      ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30 text-foreground'
                      : 'bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-muted-foreground'
                  }`}
                >
                  {g === 'male' ? t('pn_male') : t('pn_female')}
                </button>
              ))}
            </div>
          </div>

          <SheetInput
            icon={<Ruler className="w-4 h-4 text-[#74b9ff]" />}
            label={t('pn_height')}
            unit={t('unit_cm')}
            value={editHeight}
            onChange={setEditHeight}
          />
          <SheetInput
            icon={<Scale className="w-4 h-4 text-[#00cec9]" />}
            label={t('pn_weight')}
            unit={t('unit_kg')}
            value={editWeight}
            onChange={setEditWeight}
          />
          <SheetInput
            icon={<User className="w-4 h-4 text-[#fd79a8]" />}
            label={t('pn_age')}
            unit=""
            value={editAge}
            onChange={setEditAge}
          />

          <button
            onClick={saveMetrics}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2 mt-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('pn_save')}
          </button>
        </div>
      </SwipeableBottomSheet>

      {/* Goal Bottom Sheet */}
      <SwipeableBottomSheet
        open={sheetType === 'goal'}
        onClose={closeSheet}
        title={t('pn_edit_goal')}
      >
        <div className="space-y-5 mt-3">
          {/* Goal selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">{t('pn_select_goal')}</label>
            <div className="space-y-2">
              {(['lose_weight', 'maintain_weight', 'gain_muscle'] as Goal[]).map((g) => (
                <button
                  key={g}
                  onClick={() => { hapticFeedback('light'); setEditGoal(g); }}
                  className={`w-full px-4 py-3.5 rounded-xl flex items-center gap-3 transition-all ${
                    editGoal === g
                      ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30'
                      : 'bg-[var(--glass-bg-card)] border border-[var(--glass-border)]'
                  }`}
                >
                  <span style={{ fontSize: '1.25rem' }}>{GOAL_ICONS[g]}</span>
                  <span className={`text-sm font-medium ${editGoal === g ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {t(GOAL_LABELS[g])}
                  </span>
                  {editGoal === g && <Check className="w-4 h-4 text-[#6c5ce7] ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Activity level selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">{t('pn_activity_level')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['low', 'medium', 'high', 'athlete'] as ActivityLevel[]).map((a) => (
                <button
                  key={a}
                  onClick={() => { hapticFeedback('light'); setEditActivity(a); }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    editActivity === a
                      ? 'bg-[#00cec9]/15 border border-[#00cec9]/30 text-foreground'
                      : 'bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-muted-foreground'
                  }`}
                >
                  {t(ACTIVITY_LABELS[a])}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={saveGoal}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('pn_save')}
          </button>
        </div>
      </SwipeableBottomSheet>

      {/* Calories Bottom Sheet */}
      <SwipeableBottomSheet
        open={sheetType === 'calories'}
        onClose={closeSheet}
        title={t('pn_edit_calories')}
      >
        <div className="space-y-4 mt-3">
          <div className="flex flex-col items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={editCalories}
              onChange={(e) => setEditCalories(e.target.value)}
              className="w-full bg-ui-button border border-[var(--glass-border)] rounded-2xl px-4 py-4 text-foreground text-3xl font-bold text-center outline-none focus:border-[#6c5ce7]/50"
            />
            <span className="text-muted-foreground text-sm">{t('pn_kcal_day')}</span>
          </div>

          {/* Show BMR & Maintenance info */}
          {profile?.bmr && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl py-3 px-3 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <p className="text-[0.625rem] text-muted-foreground mb-0.5">BMR</p>
                <p className="text-foreground font-semibold text-sm">{profile.bmr}</p>
              </div>
              <div className="rounded-xl py-3 px-3 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <p className="text-[0.625rem] text-muted-foreground mb-0.5">{t('pn_maintenance')}</p>
                <p className="text-foreground font-semibold text-sm">{profile.daily_maintenance_calories}</p>
              </div>
            </div>
          )}

          {/* Macro targets if available */}
          {profile && (profile.target_protein || profile.target_carbs || profile.target_fat) && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.15)' }}>
                <p className="text-[0.6rem] text-muted-foreground">{t('cal_protein')}</p>
                <p className="text-sm text-foreground font-semibold">{profile.target_protein || '\u2014'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
              </div>
              <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: 'rgba(0,206,201,0.08)', border: '1px solid rgba(0,206,201,0.15)' }}>
                <p className="text-[0.6rem] text-muted-foreground">{t('cal_carbs')}</p>
                <p className="text-sm text-foreground font-semibold">{profile.target_carbs || '\u2014'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
              </div>
              <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: 'rgba(225,112,85,0.08)', border: '1px solid rgba(225,112,85,0.15)' }}>
                <p className="text-[0.6rem] text-muted-foreground">{t('cal_fat')}</p>
                <p className="text-sm text-foreground font-semibold">{profile.target_fat || '\u2014'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t('pn_calorie_hint')}
          </p>

          <button
            onClick={saveCalories}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('pn_save')}
          </button>
        </div>
      </SwipeableBottomSheet>

      {/* Body Measurements Bottom Sheet */}
      <SwipeableBottomSheet
        open={sheetType === 'measurements'}
        onClose={closeSheet}
        title={t('pn_edit_measurements')}
      >
        <div className="space-y-4 mt-3">
          <p className="text-xs text-muted-foreground text-center px-2">
            {t('pn_measurements_hint')}
          </p>

          {bodyFatPercent && (
            <div className="rounded-xl py-3 px-4 flex items-center justify-between" style={{ background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.15)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[0.625rem] text-muted-foreground">{t('pn_body_fat')}</span>
                <span className="text-[0.5625rem] text-muted-foreground/60">({t('pn_body_fat_navy')})</span>
              </div>
              <span className="text-foreground font-bold text-lg">{bodyFatPercent}<span className="text-xs text-muted-foreground ml-0.5">%</span></span>
            </div>
          )}

          <SheetInput
            icon={<Ruler className="w-4 h-4 text-[#74b9ff]" />}
            label={t('pn_neck')}
            unit={t('unit_cm')}
            value={editNeck}
            onChange={setEditNeck}
          />
          <SheetInput
            icon={<Ruler className="w-4 h-4 text-[#00cec9]" />}
            label={t('pn_chest')}
            unit={t('unit_cm')}
            value={editChest}
            onChange={setEditChest}
          />
          <SheetInput
            icon={<Ruler className="w-4 h-4 text-[#e17055]" />}
            label={t('pn_waist')}
            unit={t('unit_cm')}
            value={editWaist}
            onChange={setEditWaist}
          />
          <SheetInput
            icon={<Ruler className="w-4 h-4 text-[#fd79a8]" />}
            label={t('pn_hips')}
            unit={t('unit_cm')}
            value={editHips}
            onChange={setEditHips}
          />

          <button
            onClick={saveMeasurements}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('pn_save')}
          </button>
        </div>
      </SwipeableBottomSheet>

      {/* AI Calorie Advisor Bottom Sheet */}
      <AnimatePresence>
        {showAiAdvisor && profile && (
          <AiCalorieAdvisor
            profile={profile}
            currentTarget={profile.daily_calorie_target || 2000}
            currentMacros={{
              protein: profile.target_protein,
              carbs: profile.target_carbs,
              fat: profile.target_fat,
            }}
            language={getUserLang()}
            isPremium={isPremium}
            onApply={(calories, protein, carbs, fat) => {
              saveProfile({
                daily_calorie_target: calories,
                target_protein: protein,
                target_carbs: carbs,
                target_fat: fat,
              });
              setShowAiAdvisor(false);
            }}
            onClose={() => setShowAiAdvisor(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Sub-components ----
function SheetInput({
  icon,
  label,
  unit,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-ui-button border border-[var(--glass-border)] rounded-xl px-3 py-2.5 text-foreground text-base font-medium text-right outline-none focus:border-[#6c5ce7]/50"
        />
        {unit && <span className="text-sm text-muted-foreground w-8">{unit}</span>}
      </div>
    </div>
  );
}
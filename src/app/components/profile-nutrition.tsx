// =============================================
// Profile Screen — Nutrition & Fitness Context
// =============================================
// Loads real user profile from API, shows Telegram
// avatar, supports inline editing of body metrics,
// goals, and calorie targets.
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
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { api, getUserLang } from './api-client';
import { calculateCalories } from './calorie-calculator';
import { AiCalorieAdvisor } from './ai-calorie-advisor';

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
}

const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: 'pn_goal_lose',
  maintain_weight: 'pn_goal_maintain',
  gain_muscle: 'pn_goal_gain',
};

const GOAL_ICONS: Record<Goal, string> = {
  lose_weight: '🔥',
  maintain_weight: '⚖️',
  gain_muscle: '💪',
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low: 'pn_activity_low',
  medium: 'pn_activity_medium',
  high: 'pn_activity_high',
  athlete: 'pn_activity_athlete',
};

export function ProfileNutritionPage() {
  const { user, logout, subscriptionActive, subscriptionDaysLeft } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editing, setEditing] = useState<string | null>(null); // 'metrics' | 'goal' | 'calories' | null
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGoal, setEditGoal] = useState<Goal>('maintain_weight');
  const [editActivity, setEditActivity] = useState<ActivityLevel>('medium');
  const [editCalories, setEditCalories] = useState('');
  const [showAiAdvisor, setShowAiAdvisor] = useState(false);

  // Load profile from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getUserProfile();
        if (!cancelled && data) {
          setProfile(data as ProfileData);
          // Also hydrate localStorage
          if (data.daily_calorie_target) {
            localStorage.setItem('nutrition_calorie_target', String(data.daily_calorie_target));
          }
          // Cache full profile for offline use
          localStorage.setItem('nutrition_profile', JSON.stringify(data));
        } else if (!cancelled && !data) {
          // API returned 404 — try localStorage fallback from onboarding
          try {
            const cached = localStorage.getItem('nutrition_profile');
            if (cached) {
              setProfile(JSON.parse(cached) as ProfileData);
            }
          } catch {}
        }
      } catch (err) {
        console.error('[Profile] Load error:', err);
        // Fallback: try localStorage cache from onboarding
        try {
          const cached = localStorage.getItem('nutrition_profile');
          if (cached && !cancelled) {
            setProfile(JSON.parse(cached) as ProfileData);
          }
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isPremium = subscriptionActive;

  const bmi = profile
    ? (profile.weight / ((profile.height / 100) ** 2)).toFixed(1)
    : '—';

  // ---- Edit handlers ----
  const startEditMetrics = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditWeight(String(profile.weight));
    setEditHeight(String(profile.height));
    setEditAge(String(profile.age));
    setEditing('metrics');
  };

  const startEditGoal = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditGoal(profile.goal);
    setEditActivity(profile.activity_level);
    setEditing('goal');
  };

  const startEditCalories = () => {
    if (!profile) return;
    hapticFeedback('light');
    setEditCalories(String(profile.daily_calorie_target || 2000));
    setEditing('calories');
  };

  const cancelEdit = () => {
    hapticFeedback('light');
    setEditing(null);
  };

  const saveProfile = useCallback(async (updated: Partial<ProfileData>) => {
    if (!profile) return;
    setSaving(true);
    hapticFeedback('medium');

    const merged = { ...profile, ...updated };

    // Recalculate calories if body metrics or goal changed
    const calorieResult = calculateCalories({
      gender: merged.gender,
      age: merged.age,
      height: merged.height,
      weight: merged.weight,
      activityLevel: merged.activity_level,
      goal: merged.goal,
    });

    // If user is editing calories directly, use their value; otherwise recalculate
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
      if (merged.target_protein) localStorage.setItem('nutrition_target_protein', String(merged.target_protein));
      if (merged.target_carbs) localStorage.setItem('nutrition_target_carbs', String(merged.target_carbs));
      if (merged.target_fat) localStorage.setItem('nutrition_target_fat', String(merged.target_fat));
    } catch (err) {
      console.error('[Profile] Save error:', err);
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const saveMetrics = () => {
    const w = Number(editWeight);
    const h = Number(editHeight);
    const a = Number(editAge);
    if (w > 0 && h > 0 && a > 0) {
      saveProfile({ weight: w, height: h, age: a });
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

  const handleReferralShare = () => {
    hapticFeedback('medium');
    if (!user?.referralCode) return;
    const referralLink = `https://t.me/YOUR_BOT/app?startapp=ref_${user.referralCode}`;
    const shareText = `Join me on this fitness journey! Track your nutrition and workouts with AI. ${referralLink}`;
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);
    }
  };

  const menuItems = [
    { icon: BarChart3, label: t('pn_weight_tracking'), color: '#0984e3', action: () => navigate('/weight') },
    { icon: Bell, label: t('pn_notifications'), color: '#ffeaa7', action: () => navigate('/profile/notifications') },
    { icon: Users, label: t('pn_referrals'), color: '#a29bfe', action: () => navigate('/referrals') },
    { icon: Settings, label: t('pn_settings'), color: '#74b9ff', action: () => navigate('/profile/settings') },
  ];

  return (
    <div className="min-h-screen pb-6">
      <PageHeader title={t('profile_title') || 'Profile'} />

      <div className="px-4 space-y-4">

        {/* User Card with Telegram Avatar */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-4 mb-4">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.firstName}
                className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
                onError={(e) => {
                  // Fallback to gradient icon if avatar fails
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center ${user?.photoUrl ? 'hidden' : ''}`}>
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl text-foreground font-semibold mb-1">
                {user?.firstName || 'User'}
              </h2>
              <p className="text-sm text-muted-foreground">@{user?.username || 'username'}</p>
            </div>
            {isPremium && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ffd700]/20 to-[#ffa500]/20 border border-[#ffd700]/30">
                <Crown className="w-4 h-4 text-[#ffd700]" />
                <span className="text-xs text-[#ffd700]">Pro</span>
              </div>
            )}
          </div>

          {/* Body Metrics */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : profile ? (
            <div className="grid grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('pn_weight')}</p>
                <p className="text-sm text-foreground font-medium">{profile.weight} {t('unit_kg')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('pn_height')}</p>
                <p className="text-sm text-foreground font-medium">{profile.height} {t('unit_cm')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('pn_bmi')}</p>
                <p className="text-sm text-foreground font-medium">{bmi}</p>
              </div>
            </div>
          ) : (
            <div className="pt-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
              <p className="text-sm text-muted-foreground text-center py-2">
                {t('pn_no_profile')}
              </p>
              <button
                onClick={() => navigate('/')}
                className="w-full mt-2 py-2.5 rounded-xl bg-[#6c5ce7]/15 border border-[#6c5ce7]/25 text-sm text-[#a29bfe] font-medium"
              >
                {t('pn_setup_profile')}
              </button>
            </div>
          )}
        </GlassCard>

        {/* Body Metrics Edit Card */}
        {profile && (
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#6c5ce7]" />
                <h3 className="text-foreground font-medium">{t('pn_body_metrics')}</h3>
              </div>
              {editing !== 'metrics' ? (
                <button onClick={startEditMetrics} className="text-app-accent">
                  <Edit2 className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={cancelEdit} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={saveMetrics}
                    disabled={saving}
                    className="w-8 h-8 rounded-lg bg-[#00cec9]/20 flex items-center justify-center"
                  >
                    {saving ? <Loader2 className="w-4 h-4 text-[#00cec9] animate-spin" /> : <Check className="w-4 h-4 text-[#00cec9]" />}
                  </button>
                </div>
              )}
            </div>

            {editing === 'metrics' ? (
              <div className="space-y-3">
                <EditRow icon={<Ruler className="w-4 h-4 text-[#74b9ff]" />} label={t('pn_height')} unit={t('unit_cm')}>
                  <input
                    type="number"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    className="w-20 bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-foreground text-sm text-right outline-none focus:border-[#6c5ce7]/50"
                  />
                </EditRow>
                <EditRow icon={<Scale className="w-4 h-4 text-[#00cec9]" />} label={t('pn_weight')} unit={t('unit_kg')}>
                  <input
                    type="number"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="w-20 bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-foreground text-sm text-right outline-none focus:border-[#6c5ce7]/50"
                  />
                </EditRow>
                <EditRow icon={<User className="w-4 h-4 text-[#fd79a8]" />} label={t('pn_age')} unit="">
                  <input
                    type="number"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-20 bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 text-foreground text-sm text-right outline-none focus:border-[#6c5ce7]/50"
                  />
                </EditRow>
              </div>
            ) : (
              <div className="space-y-2.5">
                <MetricRow label={t('pn_height')} value={`${profile.height} ${t('unit_cm')}`} />
                <MetricRow label={t('pn_weight')} value={`${profile.weight} ${t('unit_kg')}`} />
                <MetricRow label={t('pn_age')} value={`${profile.age}`} />
                <MetricRow label={t('pn_gender')} value={profile.gender === 'male' ? t('pn_male') : t('pn_female')} />
              </div>
            )}
          </GlassCard>
        )}

        {/* Goal & Activity Card */}
        {profile && (
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[#fd79a8]" />
                <h3 className="text-foreground font-medium">{t('pn_current_goal')}</h3>
              </div>
              {editing !== 'goal' ? (
                <button onClick={startEditGoal} className="text-app-accent">
                  <Edit2 className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={cancelEdit} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={saveGoal}
                    disabled={saving}
                    className="w-8 h-8 rounded-lg bg-[#00cec9]/20 flex items-center justify-center"
                  >
                    {saving ? <Loader2 className="w-4 h-4 text-[#00cec9] animate-spin" /> : <Check className="w-4 h-4 text-[#00cec9]" />}
                  </button>
                </div>
              )}
            </div>

            {editing === 'goal' ? (
              <div className="space-y-4">
                {/* Goal selector */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('pn_select_goal')}</p>
                  <div className="space-y-2">
                    {(['lose_weight', 'maintain_weight', 'gain_muscle'] as Goal[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => { hapticFeedback('light'); setEditGoal(g); }}
                        className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
                          editGoal === g
                            ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30'
                            : 'bg-white/[0.03] border border-white/[0.06]'
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
                  <p className="text-xs text-muted-foreground mb-2">{t('pn_activity_level')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['low', 'medium', 'high', 'athlete'] as ActivityLevel[]).map((a) => (
                      <button
                        key={a}
                        onClick={() => { hapticFeedback('light'); setEditActivity(a); }}
                        className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          editActivity === a
                            ? 'bg-[#00cec9]/15 border border-[#00cec9]/30 text-foreground'
                            : 'bg-white/[0.03] border border-white/[0.06] text-muted-foreground'
                        }`}
                      >
                        {t(ACTIVITY_LABELS[a])}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <MetricRow
                  label={t('pn_goal_label')}
                  value={`${GOAL_ICONS[profile.goal]} ${t(GOAL_LABELS[profile.goal])}`}
                />
                <MetricRow
                  label={t('pn_activity_level')}
                  value={t(ACTIVITY_LABELS[profile.activity_level])}
                />
              </div>
            )}
          </GlassCard>
        )}

        {/* Daily Calorie Goal */}
        {profile && (
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#e17055]" />
                <h3 className="text-foreground font-medium">{t('pn_daily_calorie_goal')}</h3>
              </div>
              {editing !== 'calories' ? (
                <button onClick={startEditCalories} className="text-app-accent">
                  <Edit2 className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={cancelEdit} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={saveCalories}
                    disabled={saving}
                    className="w-8 h-8 rounded-lg bg-[#00cec9]/20 flex items-center justify-center"
                  >
                    {saving ? <Loader2 className="w-4 h-4 text-[#00cec9] animate-spin" /> : <Check className="w-4 h-4 text-[#00cec9]" />}
                  </button>
                </div>
              )}
            </div>

            {editing === 'calories' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editCalories}
                    onChange={(e) => setEditCalories(e.target.value)}
                    className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2.5 text-foreground text-xl font-semibold text-center outline-none focus:border-[#6c5ce7]/50"
                  />
                  <span className="text-muted-foreground text-xs flex-shrink-0">{t('cal_unit')}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {t('pn_calorie_hint')}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl text-foreground font-semibold">
                      {profile.daily_calorie_target || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('pn_activity_based', { level: t(ACTIVITY_LABELS[profile.activity_level]) })}
                    </p>
                  </div>
                  {profile.bmr && (
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-[0.625rem] text-muted-foreground">BMR</p>
                        <p className="text-xs text-foreground font-medium">{profile.bmr}</p>
                      </div>
                      <div>
                        <p className="text-[0.625rem] text-muted-foreground">{t('pn_maintenance')}</p>
                        <p className="text-xs text-foreground font-medium">{profile.daily_maintenance_calories}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Macro targets row */}
                {(profile.target_protein || profile.target_carbs || profile.target_fat) && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg py-2 px-1.5 text-center" style={{ background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.15)' }}>
                      <p className="text-[0.6rem] text-muted-foreground">{t('cal_protein')}</p>
                      <p className="text-sm text-foreground font-semibold">{profile.target_protein || '—'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
                    </div>
                    <div className="rounded-lg py-2 px-1.5 text-center" style={{ background: 'rgba(0,206,201,0.08)', border: '1px solid rgba(0,206,201,0.15)' }}>
                      <p className="text-[0.6rem] text-muted-foreground">{t('cal_carbs')}</p>
                      <p className="text-sm text-foreground font-semibold">{profile.target_carbs || '—'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
                    </div>
                    <div className="rounded-lg py-2 px-1.5 text-center" style={{ background: 'rgba(225,112,85,0.08)', border: '1px solid rgba(225,112,85,0.15)' }}>
                      <p className="text-[0.6rem] text-muted-foreground">{t('cal_fat')}</p>
                      <p className="text-sm text-foreground font-semibold">{profile.target_fat || '—'}<span className="text-[0.6rem] text-muted-foreground ml-0.5">g</span></p>
                    </div>
                  </div>
                )}

                {/* AI Advisor CTA */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    hapticFeedback('medium');
                    setShowAiAdvisor(true);
                  }}
                  className="w-full mt-3 p-3 rounded-xl flex items-center gap-3 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(108,92,231,0.1), rgba(0,206,201,0.06))',
                    border: '1px solid rgba(108,92,231,0.2)',
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-foreground text-sm font-medium">{t('pn_ask_ai')}</p>
                    <p className="text-muted-foreground text-xs leading-snug">{t('pn_ask_ai_desc')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#a29bfe]/60 flex-shrink-0" />
                </motion.button>
              </>
            )}
          </GlassCard>
        )}

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

        {/* Premium Upgrade CTA for free users */}
        {!isPremium && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              hapticFeedback('medium');
              navigate('/upgrade');
            }}
            className="w-full p-5 rounded-[20px] bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] relative overflow-hidden"
            style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.06] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Crown className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-base mb-0.5">{t('pn_upgrade_premium')}</p>
                <p className="text-white/70 text-sm">{t('pn_upgrade_desc')}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </div>
          </motion.button>
        )}

        {/* Premium status badge for subscribers */}
        {isPremium && subscriptionDaysLeft > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#ffd700]/15 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-[#ffd700]" />
                </div>
                <div>
                  <p className="text-foreground font-medium text-sm">{t('pn_premium_active')}</p>
                  <p className="text-muted-foreground text-xs">{t('pn_days_remaining', { n: subscriptionDaysLeft })}</p>
                </div>
              </div>
              <div className="px-3 py-1 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20">
                <span className="text-xs text-[#ffd700] font-medium">PRO</span>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Menu Items */}
        <div className="space-y-2">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  hapticFeedback('light');
                  item.action();
                }}
                className="w-full"
              >
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: item.color }} />
                      </div>
                      <span className="text-foreground font-medium">{item.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </GlassCard>
              </motion.button>
            );
          })}
        </div>

        {/* Share Referral */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleReferralShare}
          className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#00cec9] to-[#74b9ff] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">{t('pn_share_friends')}</p>
              <p className="text-white/70 text-sm">{t('pn_share_rewards')}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80" />
        </motion.button>

        {/* Sign Out */}
        <button
          onClick={() => {
            hapticFeedback('medium');
            logout();
          }}
          className="w-full p-4 rounded-[18px] flex items-center justify-center gap-2"
          style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border)' }}
        >
          <LogOut className="w-5 h-5 text-muted-foreground" />
          <span className="text-foreground/80">{t('pn_sign_out')}</span>
        </button>

      </div>
    </div>
  );
}

// ---- Sub-components ----
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}

function EditRow({
  icon,
  label,
  unit,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {children}
        {unit && <span className="text-xs text-muted-foreground w-6">{unit}</span>}
      </div>
    </div>
  );
}
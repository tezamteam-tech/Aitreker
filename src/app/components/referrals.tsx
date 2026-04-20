// =============================================
// Referrals Screen — Full Referral System
// =============================================
// Features:
//   - Personal referral code & deep link
//   - Invite friends via Telegram share
//   - Live invited users list from API
//   - Bonus premium days tracking
//   - +7 days per subscribed referral
//   - Apple Liquid Glass design language
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2,
  Copy,
  Users,
  Gift,
  CheckCircle2,
  Crown,
  CalendarPlus,
  Sparkles,
  UserPlus,
  Clock,
  ArrowRight,
  Loader2,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { buildStartLink } from './bot-config';

// ---- Types ----
interface InvitedUser {
  user_id: string;
  first_name: string;
  username: string | null;
  joined_at: string;
  is_subscribed: boolean;
  bonus_days_granted: number;
}

interface ReferralData {
  referral_code: string;
  referral_count: number;
  bonus_days_earned: number;
  invited_users: InvitedUser[];
}

interface LeaderboardEntry {
  user_id: string;
  first_name: string;
  username: string | null;
  referral_count: number;
  bonus_days_earned: number;
  rank: number;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  total_referrers: number;
  my_rank: number | null;
  my_stats: LeaderboardEntry | null;
}

// ---- Reward tiers ----
const BONUS_PER_SUBSCRIBER = 7; // days per subscribed referral
const MILESTONE_BONUS = 30; // days for every 10 referrals

export function ReferralsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Build referral link
  const referralCode = data?.referral_code || user?.referralCode || '';
  const referralLink = referralCode
    ? buildStartLink(`ref_${referralCode}`)
    : '';

  // Load referral data
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.getReferrals();
      setData(res);
    } catch (err: any) {
      console.error('[Referrals] Load error:', err);
      // Fallback: show data from user object
      if (user.referralCode) {
        setData({
          referral_code: user.referralCode,
          referral_count: user.referralCount || 0,
          bonus_days_earned: 0,
          invited_users: [],
        });
      } else {
        setError(err?.message || 'Failed to load referral data');
      }
    } finally {
      setLoading(false);
    }

    // Load leaderboard in background
    setLbLoading(true);
    try {
      const lb = await api.getReferralLeaderboard();
      setLeaderboard(lb);
    } catch (err) {
      console.error('[Referrals] Leaderboard load error:', err);
    } finally {
      setLbLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Copy link
  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for environments without clipboard API
      const ta = document.createElement('textarea');
      ta.value = referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Share via Telegram
  const handleShare = () => {
    hapticFeedback('medium');
    if (!referralLink) return;

    const shareText = `${t('ref_share_text')} ${referralLink}`;

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`
      );
    } else {
      // Web fallback
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`,
        '_blank'
      );
    }
  };

  // Stats
  const totalInvited = data?.referral_count || 0;
  const totalBonusDays = data?.bonus_days_earned || 0;
  const subscribedCount = data?.invited_users.filter(u => u.is_subscribed).length || 0;
  const milestonesReached = Math.floor(totalInvited / 10);
  const nextMilestoneProgress = totalInvited % 10;

  return (
    <div className="min-h-screen pb-28">
      <PageHeader
        title={t('ref_title')}
        subtitle={
          data
            ? t('ref_subtitle', { n: totalInvited, d: totalBonusDays })
            : undefined
        }
      />

      <div className="px-4 space-y-4">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <GlassCard className="!p-5 text-center">
            <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>{error}</p>
            <button onClick={loadData} className="mt-3 text-[#a29bfe] text-sm font-medium">
              {t('ref_retry')}
            </button>
          </GlassCard>
        )}

        {!loading && data && (
          <>
            {/* Hero Stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon={Users}
                color="#6c5ce7"
                value={totalInvited}
                label={t('ref_stat_invited')}
              />
              <StatCard
                icon={Crown}
                color="#ffd700"
                value={subscribedCount}
                label={t('ref_stat_subscribed')}
              />
              <StatCard
                icon={CalendarPlus}
                color="#00cec9"
                value={totalBonusDays}
                label={t('ref_stat_bonus_days')}
              />
            </div>

            {/* Competitive Summary */}
            {totalInvited > 0 && (
              <GlassCard className="!p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-[#ffd700]" />
                  <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                    {t('ref_competitive_title')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-[var(--glass-bg-card)] border border-[var(--glass-border-subtle)] text-center">
                    <p className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                      {Math.round((subscribedCount / Math.max(totalInvited, 1)) * 100)}%
                    </p>
                    <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.625rem' }}>
                      {t('ref_conversion_rate')}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--glass-bg-card)] border border-[var(--glass-border-subtle)] text-center">
                    <p className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                      {10 - nextMilestoneProgress}
                    </p>
                    <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.625rem' }}>
                      {t('ref_until_milestone')}
                    </p>
                  </div>
                </div>
                {data.invited_users.filter(u => u.is_subscribed).length > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#ffd700]/5 border border-[#ffd700]/10">
                    <Sparkles className="w-3 h-3 text-[#ffd700]/50" />
                    <p className="text-muted-foreground/50" style={{ fontSize: '0.6875rem' }}>
                      {t('ref_friends_with_pro', { n: subscribedCount })}
                    </p>
                  </div>
                )}
              </GlassCard>
            )}

            {/* Invite Friends Card */}
            <GlassCard className="!p-5" variant="elevated">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-[#a29bfe]" />
                </div>
                <div>
                  <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {t('ref_invite_title')}
                  </p>
                  <p className="text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
                    {t('ref_invite_desc', { n: BONUS_PER_SUBSCRIBER })}
                  </p>
                </div>
              </div>

              {/* Referral link */}
              <div
                className="p-3 rounded-xl bg-ui-button border border-[var(--glass-border)] mb-3"
                style={{ border: '1px solid var(--glass-border)' }}
              >
                <p className="text-ui-icon-primary break-all font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>
                  {referralLink || t('ref_loading')}
                </p>
              </div>

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopyLink}
                  className="h-12 rounded-xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center gap-2 transition-all"
                >
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.div
                        key="copied"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#00cec9]" />
                        <span className="text-[#00cec9]" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {t('ref_copied')}
                        </span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        <Copy className="w-4 h-4 text-ui-icon-secondary" />
                        <span className="text-ui-icon-primary" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                          {t('ref_copy')}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleShare}
                  className="h-12 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2"
                  style={{ boxShadow: '0 4px 16px rgba(108,92,231,0.3)' }}
                >
                  <Share2 className="w-4 h-4 text-white" />
                  <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {t('ref_share')}
                  </span>
                </motion.button>
              </div>
            </GlassCard>

            {/* Bonus Days Earned */}
            <GlassCard className="!p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/15 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-[#00cec9]" />
                </div>
                <div className="flex-1">
                  <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {t('ref_bonus_title')}
                  </p>
                  <p className="text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
                    {t('ref_bonus_desc')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#00cec9]" style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                    {totalBonusDays}
                  </p>
                  <p className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                    {t('ref_days_unit')}
                  </p>
                </div>
              </div>

              {/* Reward tiers */}
              <div className="space-y-2.5">
                <RewardTier
                  icon={UserPlus}
                  title={t('ref_per_subscriber')}
                  desc={t('ref_per_subscriber_desc', { n: BONUS_PER_SUBSCRIBER })}
                  color="#6c5ce7"
                />
                <RewardTier
                  icon={Sparkles}
                  title={t('ref_every_10')}
                  desc={t('ref_every_10_desc', { n: MILESTONE_BONUS })}
                  color="#ffd700"
                />
              </div>

              {/* Milestone progress */}
              <div className="mt-4 p-3 rounded-xl bg-[var(--glass-bg-card)] border border-[var(--glass-border-subtle)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-ui-secondary" style={{ fontSize: '0.6875rem' }}>
                    {t('ref_next_milestone')}
                  </span>
                  <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {nextMilestoneProgress}/10
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-ui-progress overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(nextMilestoneProgress / 10) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ffd700] to-[#f0c27f]"
                  />
                </div>
                {milestonesReached > 0 && (
                  <p className="text-ui-tertiary mt-1.5" style={{ fontSize: '0.625rem' }}>
                    {t('ref_milestones_reached', { n: milestonesReached })}
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Your Referrals */}
            <div>
              <p className="text-ui-secondary px-1 mb-2.5" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {t('ref_your_referrals')}
                {data.invited_users.length > 0 && (
                  <span className="text-ui-tertiary ml-1.5">({data.invited_users.length})</span>
                )}
              </p>

              {data.invited_users.length === 0 && (
                <GlassCard className="!p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                    <Users className="w-7 h-7 text-ui-tertiary" />
                  </div>
                  <p className="text-ui-secondary mb-1" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {t('ref_no_referrals')}
                  </p>
                  <p className="text-ui-tertiary max-w-[240px] mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {t('ref_no_referrals_desc')}
                  </p>
                </GlassCard>
              )}

              <div className="space-y-2">
                {data.invited_users.map((invUser, idx) => (
                  <motion.div
                    key={invUser.user_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    <ReferralCard user={invUser} rank={idx + 1} />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <LeaderboardSection data={leaderboard} loading={lbLoading} currentUserId={user?.id} />

            {/* How it works */}
            <HowItWorks />

            {/* Developer credit */}
            <div className="pt-2 pb-4">
              <a
                href="https://tezam.by"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => hapticFeedback('light')}
                className="w-full py-3 flex items-center justify-center gap-1.5 opacity-40 hover:opacity-60 transition-opacity"
              >
                <span className="text-muted-foreground text-[0.6875rem]">{t('pn_developed_by')}</span>
                <span className="text-foreground/60 text-[0.6875rem] font-medium">Tezam.by</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: React.ElementType;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <GlassCard className="!p-3.5 text-center">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-2"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{value}</p>
      <p className="text-ui-tertiary mt-0.5" style={{ fontSize: '0.625rem', fontWeight: 500 }}>{label}</p>
    </GlassCard>
  );
}

function RewardTier({
  icon: Icon,
  title,
  desc,
  color,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</p>
        <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>{desc}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-ui-tertiary flex-shrink-0" />
    </div>
  );
}

function ReferralCard({ user, rank }: { user: InvitedUser; rank: number }) {
  const { t } = useTranslation();
  const initials = user.first_name ? user.first_name.charAt(0).toUpperCase() : '?';
  const joinedDate = new Date(user.joined_at).toLocaleDateString(
    t('locale_code'),
    { day: 'numeric', month: 'short' }
  );

  // Days since joined
  const daysSinceJoined = Math.floor((Date.now() - new Date(user.joined_at).getTime()) / (24 * 60 * 60 * 1000));
  const isNew = daysSinceJoined <= 3;

  // Random-ish gradient based on user_id
  const gradients = [
    'from-[#6c5ce7] to-[#a29bfe]',
    'from-[#00cec9] to-[#74b9ff]',
    'from-[#fd79a8] to-[#fab1a0]',
    'from-[#e17055] to-[#fdcb6e]',
    'from-[#00b894] to-[#55efc4]',
  ];
  const gradientIdx = user.user_id.charCodeAt(user.user_id.length - 1) % gradients.length;

  return (
    <GlassCard className="!p-4">
      <div className="flex items-center gap-3">
        {/* Rank + Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradients[gradientIdx]} flex items-center justify-center`}>
            <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{initials}</span>
          </div>
          {/* Rank badge */}
          <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-[#6c5ce7] border-2 border-[rgba(0,0,0,0.3)] flex items-center justify-center">
            <span className="text-white" style={{ fontSize: '0.5rem', fontWeight: 800 }}>#{rank}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-foreground truncate" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {user.first_name}
            </p>
            {user.is_subscribed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#ffd700]/10 border border-[#ffd700]/15">
                <Crown className="w-2.5 h-2.5 text-[#ffd700]" />
                <span className="text-[#ffd700]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>PRO</span>
              </span>
            )}
            {isNew && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#00cec9]/10 border border-[#00cec9]/15 text-[#00cec9]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                {t('ref_new')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {user.username && (
              <span className="text-muted-foreground/50 truncate" style={{ fontSize: '0.75rem' }}>@{user.username}</span>
            )}
            <span className="text-muted-foreground/20">&middot;</span>
            <span className="flex items-center gap-0.5 text-muted-foreground/40" style={{ fontSize: '0.6875rem' }}>
              <Clock className="w-2.5 h-2.5" />
              {daysSinceJoined === 0 ? t('ref_today') : t('ref_days_ago', { n: daysSinceJoined })}
            </span>
          </div>
        </div>

        {/* Bonus badge */}
        <div className="flex-shrink-0 text-right">
          {user.bonus_days_granted > 0 ? (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00cec9]/10 border border-[#00cec9]/15">
              <CalendarPlus className="w-3 h-3 text-[#00cec9]" />
              <span className="text-[#00cec9]" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                +{user.bonus_days_granted}d
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--glass-bg-card)]">
              <CheckCircle2 className="w-3 h-3 text-muted-foreground/30" />
              <span className="text-muted-foreground/40" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                {t('ref_pending')}
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    { num: 1, title: t('ref_step1_title'), desc: t('ref_step1_desc') },
    { num: 2, title: t('ref_step2_title'), desc: t('ref_step2_desc') },
    { num: 3, title: t('ref_step3_title'), desc: t('ref_step3_desc') },
    { num: 4, title: t('ref_step4_title'), desc: t('ref_step4_desc', { n: BONUS_PER_SUBSCRIBER }) },
  ];

  return (
    <GlassCard className="!p-5">
      <p className="text-foreground" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
        {t('ref_how_title')}
      </p>
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={step.num} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(108,92,231,0.12)' }}
              >
                <span className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 800 }}>
                  {step.num}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px h-4 mt-1" style={{ background: 'var(--ui-separator)' }} />
              )}
            </div>
            <div className="pt-0.5">
              <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{step.title}</p>
              <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function LeaderboardSection({ data, loading, currentUserId }: { data: LeaderboardData | null; loading: boolean; currentUserId: string | undefined }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground px-1" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {t('ref_top_referrers')}
        </p>
        <GlassCard className="!p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#a29bfe] animate-spin" />
        </GlassCard>
      </div>
    );
  }

  if (!data || data.leaderboard.length === 0) return null;

  const medalColors: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: 'rgba(255,215,0,0.12)', text: '#ffd700', border: 'rgba(255,215,0,0.2)' },
    2: { bg: 'rgba(192,192,192,0.1)', text: '#c0c0c0', border: 'rgba(192,192,192,0.15)' },
    3: { bg: 'rgba(205,127,50,0.1)', text: '#cd7f32', border: 'rgba(205,127,50,0.15)' },
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-ui-secondary" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {t('ref_top_referrers')}
          <span className="text-ui-tertiary ml-1.5">({data.total_referrers})</span>
        </p>
        {data.my_rank && (
          <span className="text-[#a29bfe] flex items-center gap-1" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
            <TrendingUp className="w-3 h-3" />
            {t('ref_your_rank', { n: data.my_rank })}
          </span>
        )}
      </div>

      <GlassCard className="!p-4">
        <div className="space-y-1.5">
          {data.leaderboard.slice(0, 10).map((entry) => {
            const isMe = currentUserId === entry.user_id;
            const medal = medalColors[entry.rank];
            const initials = entry.first_name.charAt(0).toUpperCase();

            return (
              <motion.div
                key={entry.user_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: entry.rank * 0.03 }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${
                  isMe ? 'bg-[#6c5ce7]/10 border border-[#6c5ce7]/20' : 'bg-[var(--glass-bg-row)]'
                }`}
              >
                {/* Rank */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={medal ? {
                    backgroundColor: medal.bg,
                    border: `1px solid ${medal.border}`,
                  } : {
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  {entry.rank <= 3 ? (
                    <Trophy className="w-3.5 h-3.5" style={{ color: medal?.text || '#fff' }} />
                  ) : (
                    <span className="text-muted-foreground" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                      {entry.rank}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: isMe ? 'rgba(108,92,231,0.25)' : 'rgba(255,255,255,0.06)' }}
                >
                  <span
                    className={isMe ? 'text-[#a29bfe]' : 'text-muted-foreground'}
                    style={{ fontSize: '0.6875rem', fontWeight: 700 }}
                  >
                    {initials}
                  </span>
                </div>

                {/* Name & Stats */}
                <div className="flex-1 min-w-0">
                  <p className={`truncate ${isMe ? 'text-[#a29bfe]' : 'text-foreground/80'}`} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    {entry.first_name}
                    {isMe && (
                      <span className="text-[#a29bfe]/50 ml-1" style={{ fontSize: '0.625rem' }}>
                        ({t('ref_you')})
                      </span>
                    )}
                  </p>
                  <p className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                    {entry.referral_count} {t('ref_friends_count')}
                    {entry.bonus_days_earned > 0 && ` · +${entry.bonus_days_earned}d`}
                  </p>
                </div>

                {/* Score */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className={entry.rank <= 3 ? '' : 'text-muted-foreground'}
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 800,
                      color: medal?.text || undefined,
                    }}
                  >
                    {entry.referral_count}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* My rank if not in top 10 */}
        {data.my_stats && data.my_rank && data.my_rank > 10 && (
          <div className="mt-3 pt-3 border-t border-[var(--glass-border-subtle)]">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#6c5ce7]/10 border border-[#6c5ce7]/20">
              <div className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center flex-shrink-0">
                <span className="text-muted-foreground" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                  {data.my_rank}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/25 flex items-center justify-center flex-shrink-0">
                <span className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                  {data.my_stats.first_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#a29bfe] truncate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {data.my_stats.first_name}
                  <span className="text-[#a29bfe]/50 ml-1" style={{ fontSize: '0.625rem' }}>
                    ({t('ref_you')})
                  </span>
                </p>
                <p className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                  {data.my_stats.referral_count} {t('ref_friends_count')}
                </p>
              </div>
              <p className="text-muted-foreground flex-shrink-0" style={{ fontSize: '0.875rem', fontWeight: 800 }}>
                {data.my_stats.referral_count}
              </p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
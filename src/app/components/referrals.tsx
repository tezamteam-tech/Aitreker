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
import { buildBotLink } from './bot-config';

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

// ---- Lang helper ----
function useLang() {
  const { t } = useTranslation();
  return t('nav_home') === '\u0413\u043B\u0430\u0432\u043D\u0430\u044F' ? 'ru' : 'en';
}

// ---- Reward tiers ----
const BONUS_PER_SUBSCRIBER = 7; // days per subscribed referral
const MILESTONE_BONUS = 30; // days for every 10 referrals

export function ReferralsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const lang = useLang();

  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Build referral link
  const referralCode = data?.referral_code || user?.referralCode || '';
  const referralLink = referralCode
    ? buildBotLink(`ref_${referralCode}`)
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

    const shareText = lang === 'ru'
      ? `Присоединяйся ко мне! Следи за питанием и тренировками с AI. ${referralLink}`
      : `Join me on this fitness journey! Track your nutrition and workouts with AI. ${referralLink}`;

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
        title={lang === 'ru' ? 'Рефералы' : 'Referrals'}
        subtitle={
          data
            ? `${totalInvited} ${lang === 'ru' ? 'друзей' : 'friends'} · ${totalBonusDays} ${lang === 'ru' ? 'бонусных дней' : 'bonus days'}`
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
            <p className="text-white/50" style={{ fontSize: '0.875rem' }}>{error}</p>
            <button onClick={loadData} className="mt-3 text-[#a29bfe] text-sm font-medium">
              {lang === 'ru' ? 'Повторить' : 'Retry'}
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
                label={lang === 'ru' ? 'Приглашено' : 'Invited'}
              />
              <StatCard
                icon={Crown}
                color="#ffd700"
                value={subscribedCount}
                label={lang === 'ru' ? 'Подписались' : 'Subscribed'}
              />
              <StatCard
                icon={CalendarPlus}
                color="#00cec9"
                value={totalBonusDays}
                label={lang === 'ru' ? 'Бонус дней' : 'Bonus Days'}
              />
            </div>

            {/* Invite Friends Card */}
            <GlassCard className="!p-5" variant="elevated">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-[#a29bfe]" />
                </div>
                <div>
                  <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {lang === 'ru' ? 'Пригласить друзей' : 'Invite Friends'}
                  </p>
                  <p className="text-white/35" style={{ fontSize: '0.75rem' }}>
                    {lang === 'ru'
                      ? `+${BONUS_PER_SUBSCRIBER} дней за каждого подписавшегося`
                      : `+${BONUS_PER_SUBSCRIBER} days for each subscriber`}
                  </p>
                </div>
              </div>

              {/* Referral link */}
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] mb-3">
                <p className="text-white/70 break-all font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>
                  {referralLink || (lang === 'ru' ? 'Загрузка...' : 'Loading...')}
                </p>
              </div>

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopyLink}
                  className="h-12 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center gap-2 transition-all"
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
                          {lang === 'ru' ? 'Скопировано!' : 'Copied!'}
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
                        <Copy className="w-4 h-4 text-white/50" />
                        <span className="text-white/80" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                          {lang === 'ru' ? 'Копировать' : 'Copy'}
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
                    {lang === 'ru' ? 'Поделиться' : 'Share'}
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
                  <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {lang === 'ru' ? 'Бонусные дни' : 'Bonus Days Earned'}
                  </p>
                  <p className="text-white/35" style={{ fontSize: '0.75rem' }}>
                    {lang === 'ru' ? 'Премиум подписка за рефералов' : 'Premium subscription from referrals'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#00cec9]" style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                    {totalBonusDays}
                  </p>
                  <p className="text-white/25" style={{ fontSize: '0.625rem' }}>
                    {lang === 'ru' ? 'дней' : 'days'}
                  </p>
                </div>
              </div>

              {/* Reward tiers */}
              <div className="space-y-2.5">
                <RewardTier
                  icon={UserPlus}
                  title={lang === 'ru' ? 'За каждого подписчика' : 'Per Subscriber'}
                  desc={lang === 'ru' ? `+${BONUS_PER_SUBSCRIBER} дней премиум` : `+${BONUS_PER_SUBSCRIBER} premium days`}
                  color="#6c5ce7"
                />
                <RewardTier
                  icon={Sparkles}
                  title={lang === 'ru' ? `Каждые 10 друзей` : `Every 10 Friends`}
                  desc={lang === 'ru' ? `+${MILESTONE_BONUS} дней бонус` : `+${MILESTONE_BONUS} days bonus`}
                  color="#ffd700"
                />
              </div>

              {/* Milestone progress */}
              <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/40" style={{ fontSize: '0.6875rem' }}>
                    {lang === 'ru' ? 'До следующего бонуса' : 'Next milestone bonus'}
                  </span>
                  <span className="text-white/60" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {nextMilestoneProgress}/10
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(nextMilestoneProgress / 10) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ffd700] to-[#f0c27f]"
                  />
                </div>
                {milestonesReached > 0 && (
                  <p className="text-white/25 mt-1.5" style={{ fontSize: '0.625rem' }}>
                    {milestonesReached} {lang === 'ru' ? 'милестоунов достигнуто' : 'milestones reached'}
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Your Referrals */}
            <div>
              <p className="text-white/40 px-1 mb-2.5" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {lang === 'ru' ? 'ВАШИ РЕФЕРАЛЫ' : 'YOUR REFERRALS'}
                {data.invited_users.length > 0 && (
                  <span className="text-white/20 ml-1.5">({data.invited_users.length})</span>
                )}
              </p>

              {data.invited_users.length === 0 && (
                <GlassCard className="!p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                    <Users className="w-7 h-7 text-white/15" />
                  </div>
                  <p className="text-white/35 mb-1" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {lang === 'ru' ? 'Пока никого нет' : 'No referrals yet'}
                  </p>
                  <p className="text-white/20 max-w-[240px] mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {lang === 'ru'
                      ? 'Поделитесь ссылкой с друзьями и получайте бонусные дни!'
                      : 'Share your link with friends and earn bonus days!'}
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
                    <ReferralCard user={invUser} lang={lang} />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <LeaderboardSection data={leaderboard} loading={lbLoading} lang={lang} currentUserId={user?.id} />

            {/* How it works */}
            <HowItWorks lang={lang} />
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
      <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{value}</p>
      <p className="text-white/30 mt-0.5" style={{ fontSize: '0.625rem', fontWeight: 500 }}>{label}</p>
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
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</p>
        <p className="text-white/35" style={{ fontSize: '0.6875rem' }}>{desc}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-white/15 flex-shrink-0" />
    </div>
  );
}

function ReferralCard({ user, lang }: { user: InvitedUser; lang: string }) {
  const initials = user.first_name ? user.first_name.charAt(0).toUpperCase() : '?';
  const joinedDate = new Date(user.joined_at).toLocaleDateString(
    lang === 'ru' ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'short' }
  );

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
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradients[gradientIdx]} flex items-center justify-center flex-shrink-0`}>
          <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{initials}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white truncate" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {user.first_name}
            </p>
            {user.is_subscribed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#ffd700]/10 border border-[#ffd700]/15">
                <Crown className="w-2.5 h-2.5 text-[#ffd700]" />
                <span className="text-[#ffd700]" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>PRO</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {user.username && (
              <span className="text-white/30 truncate" style={{ fontSize: '0.75rem' }}>@{user.username}</span>
            )}
            <span className="text-white/15">·</span>
            <span className="flex items-center gap-0.5 text-white/25" style={{ fontSize: '0.6875rem' }}>
              <Clock className="w-2.5 h-2.5" />
              {joinedDate}
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
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.03]">
              <CheckCircle2 className="w-3 h-3 text-white/20" />
              <span className="text-white/25" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                {lang === 'ru' ? 'Ожидание' : 'Pending'}
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function HowItWorks({ lang }: { lang: string }) {
  const steps = lang === 'ru'
    ? [
        { num: 1, title: 'Поделитесь ссылкой', desc: 'Отправьте вашу реферальную ссылку друзьям' },
        { num: 2, title: 'Друг присоединяется', desc: 'Они открывают приложение по вашей ссылке' },
        { num: 3, title: 'Друг оформляет подписку', desc: 'Когда друг подписывается на Premium' },
        { num: 4, title: 'Вы получаете бонус', desc: `+${BONUS_PER_SUBSCRIBER} дней Premium за каждого` },
      ]
    : [
        { num: 1, title: 'Share your link', desc: 'Send your referral link to friends' },
        { num: 2, title: 'Friend joins', desc: 'They open the app through your link' },
        { num: 3, title: 'Friend subscribes', desc: 'When your friend gets Premium' },
        { num: 4, title: 'You earn bonus', desc: `+${BONUS_PER_SUBSCRIBER} Premium days each` },
      ];

  return (
    <GlassCard className="!p-5">
      <p className="text-white/40 mb-4" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
        {lang === 'ru' ? 'КАК ЭТО РАБОТАЕТ' : 'HOW IT WORKS'}
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
                <div className="w-px h-4 bg-white/[0.06] mt-1" />
              )}
            </div>
            <div className="pt-0.5">
              <p className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{step.title}</p>
              <p className="text-white/30" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function LeaderboardSection({ data, loading, lang, currentUserId }: { data: LeaderboardData | null; loading: boolean; lang: string; currentUserId: string | undefined }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-white/40 px-1" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {lang === 'ru' ? 'ТОП РЕФЕРАЛЫ' : 'TOP REFERRERS'}
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
        <p className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          {lang === 'ru' ? 'ТОП РЕФЕРАЛЫ' : 'TOP REFERRERS'}
          <span className="text-white/20 ml-1.5">({data.total_referrers})</span>
        </p>
        {data.my_rank && (
          <span className="text-[#a29bfe] flex items-center gap-1" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
            <TrendingUp className="w-3 h-3" />
            {lang === 'ru' ? `Вы #${data.my_rank}` : `You're #${data.my_rank}`}
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
                  isMe ? 'bg-[#6c5ce7]/10 border border-[#6c5ce7]/20' : 'bg-white/[0.02]'
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
                    <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
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
                    className={isMe ? 'text-[#a29bfe]' : 'text-white/40'}
                    style={{ fontSize: '0.6875rem', fontWeight: 700 }}
                  >
                    {initials}
                  </span>
                </div>

                {/* Name & Stats */}
                <div className="flex-1 min-w-0">
                  <p className={`truncate ${isMe ? 'text-[#a29bfe]' : 'text-white/80'}`} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    {entry.first_name}
                    {isMe && (
                      <span className="text-[#a29bfe]/50 ml-1" style={{ fontSize: '0.625rem' }}>
                        ({lang === 'ru' ? 'Вы' : 'You'})
                      </span>
                    )}
                  </p>
                  <p className="text-white/25" style={{ fontSize: '0.625rem' }}>
                    {entry.referral_count} {lang === 'ru' ? 'друзей' : 'friends'}
                    {entry.bonus_days_earned > 0 && ` · +${entry.bonus_days_earned}d`}
                  </p>
                </div>

                {/* Score */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className={entry.rank <= 3 ? '' : 'text-white/50'}
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
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#6c5ce7]/10 border border-[#6c5ce7]/20">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
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
                    ({lang === 'ru' ? 'Вы' : 'You'})
                  </span>
                </p>
                <p className="text-white/25" style={{ fontSize: '0.625rem' }}>
                  {data.my_stats.referral_count} {lang === 'ru' ? 'друзей' : 'friends'}
                </p>
              </div>
              <p className="text-white/50 flex-shrink-0" style={{ fontSize: '0.875rem', fontWeight: 800 }}>
                {data.my_stats.referral_count}
              </p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
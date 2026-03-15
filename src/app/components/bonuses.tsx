// =============================================
// Proper Food AI — Bonuses & Social Tasks Page
// =============================================
// Dynamic social tasks (admin-configurable),
// legacy Telegram/Instagram bonuses,
// referral system, subscription status,
// developer credit, and support link.
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gift,
  Crown,
  Users,
  Share2,
  ExternalLink,
  Check,
  Copy,
  ChevronRight,
  Loader2,
  Clock,
  Heart,
  Sparkles,
  MessageCircle,
  Globe,
  Youtube,
  Music2,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { buildStartLink } from './bot-config';

// Telegram SVG icon (inline)
function TelegramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

// Instagram SVG icon (inline)
function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  );
}

// Twitter/X icon
function TwitterIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

// TikTok icon
function TikTokIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  );
}

// Platform icon resolver
function PlatformIcon({ platform, className, style }: { platform: string; className?: string; style?: React.CSSProperties }) {
  const props = { className, style };
  switch (platform.toLowerCase()) {
    case 'telegram': return <TelegramIcon {...props} />;
    case 'instagram': return <InstagramIcon {...props} />;
    case 'twitter':
    case 'x': return <TwitterIcon {...props} />;
    case 'tiktok': return <TikTokIcon {...props} />;
    case 'youtube': return <Youtube {...props} />;
    default: return <Globe {...props} />;
  }
}

// Platform color resolver
function getPlatformColors(platform: string): { accent: string; bg: string } {
  switch (platform.toLowerCase()) {
    case 'telegram': return { accent: '#29B6F6', bg: 'bg-[#29B6F6]/10' };
    case 'instagram': return { accent: '#E4405F', bg: 'bg-[#E4405F]/10' };
    case 'twitter':
    case 'x': return { accent: '#1DA1F2', bg: 'bg-[#1DA1F2]/10' };
    case 'tiktok': return { accent: '#FF0050', bg: 'bg-[#FF0050]/10' };
    case 'youtube': return { accent: '#FF0000', bg: 'bg-[#FF0000]/10' };
    default: return { accent: '#a29bfe', bg: 'bg-[#a29bfe]/10' };
  }
}

interface SocialTask {
  id: string;
  platform: string;
  name: string;
  url: string;
  image_url?: string;
  reward_days: number;
  claimed: boolean;
}

interface BonusData {
  subscription: { isActive: boolean; expiresAt: string | null; daysLeft: number };
  social: { telegram: { claimed: boolean }; instagram: { claimed: boolean } };
  socialTasks: SocialTask[];
  referral: { code: string | null; count: number; rewardsGiven: number; nextRewardAt: number };
}

export function BonusesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [data, setData] = useState<BonusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getBonuses()
      .then(setData)
      .catch(err => console.error('[Bonuses] Load error:', err))
      .finally(() => setLoading(false));
  }, []);

  // Legacy social claim (telegram/instagram)
  const handleClaimLegacy = async (platform: 'telegram' | 'instagram') => {
    if (claimingId) return;
    setClaimingId(platform);
    hapticFeedback('medium');
    try {
      await api.claimSocialBonus(platform);
      hapticSuccess();
      showToast(t('bonus_claimed'));
      const updated = await api.getBonuses();
      setData(updated);
    } catch (err: any) {
      if (err?.code === 'ALREADY_CLAIMED') {
        showToast(t('bonus_claimed'));
      } else {
        console.error('[Bonuses] Claim error:', err);
      }
    } finally {
      setClaimingId(null);
    }
  };

  // Dynamic task claim
  const handleClaimTask = async (taskId: string) => {
    if (claimingId) return;
    setClaimingId(taskId);
    hapticFeedback('medium');
    try {
      const res = await api.claimSocialTask(taskId);
      hapticSuccess();
      showToast(t('bonus_claimed') + ` +${res.rewardDays} ${t('bonus_days_unit')}`);
      const updated = await api.getBonuses();
      setData(updated);
    } catch (err: any) {
      if (err?.code === 'ALREADY_CLAIMED') {
        showToast(t('bonus_claimed'));
      } else {
        console.error('[Bonuses] Task claim error:', err);
      }
    } finally {
      setClaimingId(null);
    }
  };

  const openLink = (url: string, platform: string) => {
    hapticFeedback('light');
    try {
      if (platform.toLowerCase() === 'telegram') {
        const tgApp = (window as any).Telegram?.WebApp;
        if (tgApp?.openTelegramLink) {
          tgApp.openTelegramLink(url);
          return;
        }
      }
    } catch (_) {}
    window.open(url, '_blank');
  };

  const referralLink = data?.referral?.code
    ? buildStartLink(`ref_${data.referral.code}`)
    : '';

  const handleShare = () => {
    if (!referralLink) return;
    hapticFeedback('medium');
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t('bonus_share_text'))}`;
    try {
      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(tgShareUrl);
        return;
      }
    } catch (_) {}
    window.open(tgShareUrl, '_blank');
  };

  const handleCopyLink = async () => {
    hapticFeedback('light');
    try {
      await navigator.clipboard.writeText(referralLink);
      hapticSuccess();
      showToast(t('bonus_link_copied'));
    } catch (_) {
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      hapticSuccess();
      showToast(t('bonus_link_copied'));
    }
  };

  const formatExpiry = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(t('locale_code'), { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const refCount = data?.referral?.count ?? 0;
  const currentProgress = refCount % 10;
  const progressPercent = (currentProgress / 10) * 100;

  // Merge legacy social + dynamic tasks into one list
  const allTasks: Array<SocialTask & { isLegacy?: boolean; legacyPlatform?: string }> = [];

  // Add legacy tasks if they exist in the data
  if (data) {
    // Only show legacy telegram/instagram if no dynamic task covers them
    const dynamicPlatforms = (data.socialTasks || []).map(t => t.platform.toLowerCase());

    if (!dynamicPlatforms.includes('telegram')) {
      allTasks.push({
        id: '_legacy_telegram',
        platform: 'telegram',
        name: t('bonus_telegram'),
        url: 'https://t.me/tezamchanel',
        reward_days: 7,
        claimed: data.social.telegram.claimed,
        isLegacy: true,
        legacyPlatform: 'telegram',
      });
    }
    if (!dynamicPlatforms.includes('instagram')) {
      allTasks.push({
        id: '_legacy_instagram',
        platform: 'instagram',
        name: t('bonus_instagram'),
        url: 'https://www.instagram.com/tezamteam/',
        reward_days: 7,
        claimed: data.social.instagram.claimed,
        isLegacy: true,
        legacyPlatform: 'instagram',
      });
    }

    // Add dynamic tasks
    for (const task of (data.socialTasks || [])) {
      allTasks.push(task);
    }
  }

  const completedCount = allTasks.filter(t => t.claimed).length;

  return (
    <div className="min-h-screen pb-28">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl border border-white/[0.1] shadow-2xl"
            style={{ background: 'var(--glass-bg-card)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 px-4 pb-6">
        <PageHeader title={t('bonus_title')} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* ===== Subscription Status (compact) ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-4"
            >
              <GlassCard className="!p-4 relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    data.subscription.isActive
                      ? 'bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]'
                      : 'bg-gradient-to-br from-red-500/20 to-red-600/20'
                  }`}>
                    <Crown className={`w-5 h-5 ${data.subscription.isActive ? 'text-white' : 'text-red-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                        {t('bonus_subscription')}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[0.625rem] font-semibold ${
                        data.subscription.isActive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {data.subscription.isActive ? t('bonus_sub_active') : t('bonus_sub_expired')}
                      </span>
                    </div>
                    {data.subscription.isActive ? (
                      <p className="text-muted-foreground mt-0.5" style={{ fontSize: '0.6875rem' }}>
                        {t('bonus_days_left', { n: data.subscription.daysLeft })}
                        {data.subscription.expiresAt && (
                          <span className="text-muted-foreground/50"> &middot; {formatExpiry(data.subscription.expiresAt)}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-red-400/60 mt-0.5" style={{ fontSize: '0.6875rem' }}>
                        {t('bonus_extend_sub')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Days left progress bar */}
                {data.subscription.isActive && data.subscription.daysLeft <= 30 && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (data.subscription.daysLeft / 30) * 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className={`h-full rounded-full ${
                          data.subscription.daysLeft <= 7
                            ? 'bg-gradient-to-r from-red-500 to-red-400'
                            : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </GlassCard>
            </motion.div>

            {/* ===== Social Tasks (dynamic + legacy) ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-4"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-[#00cec9]/60" />
                  <p className="text-[#00cec9]/60" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('bonus_social_title')}
                  </p>
                </div>
                {allTasks.length > 0 && (
                  <span className="text-muted-foreground/40" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                    {completedCount}/{allTasks.length}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground/60 mb-3 px-1" style={{ fontSize: '0.6875rem' }}>
                {t('bonus_social_desc')}
              </p>

              {allTasks.length === 0 && (
                <GlassCard className="!p-6 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-muted-foreground/40" style={{ fontSize: '0.8125rem' }}>
                    {t('bonus_no_tasks')}
                  </p>
                </GlassCard>
              )}

              <div className="space-y-2.5">
                {allTasks.map((task, idx) => {
                  const colors = getPlatformColors(task.platform);
                  const isLegacy = 'isLegacy' in task && task.isLegacy;
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + idx * 0.04 }}
                    >
                      <GlassCard className="!p-4 relative overflow-hidden">
                        <div className="flex items-center gap-3.5">
                          {/* Icon / Image */}
                          <div className={`w-11 h-11 rounded-xl ${colors.bg} flex items-center justify-center shrink-0 overflow-hidden`}>
                            {task.image_url ? (
                              <img src={task.image_url} alt={task.name} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <PlatformIcon platform={task.platform} className="w-5 h-5" style={{ color: colors.accent }} />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{task.name}</p>
                            {task.claimed ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                                  {t('bonus_claimed')} +{task.reward_days} {t('bonus_days_unit')}
                                </span>
                              </div>
                            ) : (
                              <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.6875rem' }}>
                                +{task.reward_days} {t('bonus_days_unit')} {t('bonus_for_follow')}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {!task.claimed && (
                              <>
                                <motion.button
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => openLink(task.url, task.platform)}
                                  className="h-8 px-3 rounded-lg border flex items-center gap-1.5 transition-colors"
                                  style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    borderColor: `${colors.accent}33`,
                                    backgroundColor: `${colors.accent}10`,
                                    color: colors.accent,
                                  }}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {t('bonus_follow')}
                                </motion.button>
                                <motion.button
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => {
                                    if (isLegacy && 'legacyPlatform' in task) {
                                      handleClaimLegacy(task.legacyPlatform as 'telegram' | 'instagram');
                                    } else {
                                      handleClaimTask(task.id);
                                    }
                                  }}
                                  disabled={!!claimingId}
                                  className="h-8 px-3 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-40"
                                  style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}aa)`,
                                  }}
                                >
                                  {claimingId === task.id || claimingId === ('legacyPlatform' in task ? task.legacyPlatform : null) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Gift className="w-3 h-3" />
                                  )}
                                  +{task.reward_days}
                                </motion.button>
                              </>
                            )}
                            {task.claimed && (
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                <Check className="w-4 h-4 text-emerald-400" />
                              </div>
                            )}
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            {/* ===== Referral Section ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-4"
            >
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <Users className="w-3 h-3 text-[#a29bfe]/60" />
                <p className="text-[#a29bfe]/60" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('bonus_referral_title')}
                </p>
              </div>

              <GlassCard className="!p-5 relative overflow-hidden">
                <p className="text-muted-foreground/60 mb-4" style={{ fontSize: '0.8125rem' }}>
                  {t('bonus_referral_desc')}
                </p>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                      {t('bonus_referral_count', { n: refCount })}
                    </span>
                    <span className="text-[#00cec9]/70" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                      {t('bonus_referral_progress', { n: currentProgress })}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className="h-full rounded-full bg-gradient-to-r from-[#00cec9] to-[#55efc4]"
                    />
                  </div>
                </div>

                {/* Share button */}
                <motion.button
                  whileTap={{ scale: referralLink ? 0.97 : 1 }}
                  onClick={handleShare}
                  disabled={!referralLink}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#00cec9] to-[#55efc4] text-white flex items-center justify-center gap-2.5 mb-3 disabled:opacity-40"
                  style={{ fontSize: '0.9375rem', fontWeight: 600, boxShadow: referralLink ? '0 4px 16px rgba(0, 206, 201, 0.25)' : 'none' }}
                >
                  {!referralLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                  )}
                  {t('bonus_share_btn')}
                </motion.button>

                {/* Referral link copy */}
                {referralLink && (
                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] active:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-muted-foreground/40 truncate" style={{ fontSize: '0.6875rem', fontFamily: 'monospace' }}>
                        {referralLink}
                      </p>
                    </div>
                    <Copy className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                  </button>
                )}
              </GlassCard>
            </motion.div>

            {/* ===== See full referrals ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4"
            >
              <GlassCard
                className="!p-4"
                onClick={() => { hapticFeedback('light'); navigate('/referrals'); }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#a29bfe]/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#a29bfe]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {t('bonus_view_referrals')}
                    </p>
                    <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.75rem' }}>
                      {t('bonus_view_referrals_desc', { n: refCount })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0" />
                </div>
              </GlassCard>
            </motion.div>

            {/* ===== Support ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mb-4"
            >
              <GlassCard
                className="!p-4"
                onClick={() => {
                  hapticFeedback('light');
                  try {
                    const tgApp = (window as any).Telegram?.WebApp;
                    if (tgApp?.openTelegramLink) {
                      tgApp.openTelegramLink('https://t.me/dozorir');
                      return;
                    }
                  } catch (_) {}
                  window.open('https://t.me/dozorir', '_blank');
                }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#6c5ce7]/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-[#fd79a8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {t('bonus_support_title')}
                    </p>
                    <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.75rem' }}>
                      {t('bonus_support_desc')}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground/20 shrink-0" />
                </div>
              </GlassCard>
            </motion.div>

            {/* ===== Developer Credit ===== */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="pt-2 pb-4"
            >
              <a
                href="https://tezam.by"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => hapticFeedback('light')}
                className="w-full py-3 flex items-center justify-center gap-1.5 opacity-40 hover:opacity-60 transition-opacity"
              >
                <Heart className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground text-[0.6875rem]">{t('pn_developed_by')}</span>
                <span className="text-foreground/60 text-[0.6875rem] font-medium">Tezam.by</span>
              </a>
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  );
}
// =============================================
// Proper Food AI — Bonuses & Referral Page (/bonuses)
// =============================================
// Subscription status, social follow bonuses,
// referral system, and support link.
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
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { buildStartLink } from './bot-config';

// Telegram SVG icon (inline)
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

// Instagram SVG icon (inline)
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  );
}

interface BonusData {
  subscription: { isActive: boolean; expiresAt: string | null; daysLeft: number };
  social: { telegram: { claimed: boolean }; instagram: { claimed: boolean } };
  referral: { code: string | null; count: number; rewardsGiven: number; nextRewardAt: number };
}

export function BonusesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  const [data, setData] = useState<BonusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingPlatform, setClaimingPlatform] = useState<string | null>(null);
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

  const handleClaimSocial = async (platform: 'telegram' | 'instagram') => {
    if (claimingPlatform) return;
    setClaimingPlatform(platform);
    hapticFeedback('medium');
    try {
      await api.claimSocialBonus(platform);
      hapticSuccess();
      showToast(t('bonus_claimed'));
      // Reload data
      const updated = await api.getBonuses();
      setData(updated);
    } catch (err: any) {
      if (err?.code === 'ALREADY_CLAIMED') {
        showToast(t('bonus_claimed'));
      } else {
        console.error('[Bonuses] Claim error:', err);
      }
    } finally {
      setClaimingPlatform(null);
    }
  };

  const referralLink = data?.referral?.code
    ? buildStartLink(`ref_${data.referral.code}`)
    : '';

  const handleShare = () => {
    if (!referralLink) return;
    hapticFeedback('medium');
    const shareText = `${t('bonus_share_text')}\n\n${referralLink}`;
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t('bonus_share_text'))}`;

    // Try Telegram WebApp share first
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
      // Fallback
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
    return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Referral progress (0-10 for current milestone)
  const refCount = data?.referral?.count ?? 0;
  const currentProgress = refCount % 10;
  const progressPercent = (currentProgress / 10) * 100;

  return (
    <div className="min-h-screen pb-28">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/15 blur-[100px]" />
        <div className="absolute top-1/3 -left-20 w-40 h-40 rounded-full bg-[#00cec9]/10 blur-[80px]" />
        <div className="absolute bottom-1/4 right-0 w-40 h-40 rounded-full bg-[#fd79a8]/8 blur-[80px]" />
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

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader title={t('bonus_title')} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* ===== Subscription Status ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-5"
            >
              <GlassCard variant="elevated" padding="lg" className="relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#6c5ce7]/10 blur-[40px] pointer-events-none" />
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    data.subscription.isActive
                      ? 'bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]'
                      : 'bg-gradient-to-br from-red-500/20 to-red-600/20'
                  }`}>
                    <Crown className={`w-6 h-6 ${data.subscription.isActive ? 'text-white' : 'text-red-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 700 }}>
                        {t('bonus_subscription')}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        data.subscription.isActive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {data.subscription.isActive ? t('bonus_sub_active') : t('bonus_sub_expired')}
                      </span>
                    </div>
                    {data.subscription.isActive ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="w-3 h-3 text-white/30" />
                        <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
                          {t('bonus_days_left', { n: data.subscription.daysLeft })}
                          {data.subscription.expiresAt && (
                            <span className="text-white/20"> &middot; {t('bonus_expires', { date: formatExpiry(data.subscription.expiresAt) })}</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-red-400/60 mt-1" style={{ fontSize: '0.75rem' }}>
                        {t('bonus_extend_sub')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Days left progress bar */}
                {data.subscription.isActive && data.subscription.daysLeft <= 30 && (
                  <div className="mt-1">
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

                {/* Free trial badge */}
                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                  <Sparkles className="w-3 h-3 text-[#a29bfe]/50" />
                  <p className="text-white/25" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                    {t('bonus_free_trial')}
                  </p>
                </div>
              </GlassCard>
            </motion.div>

            {/* ===== Social Follow Bonuses ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-5"
            >
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <Heart className="w-3 h-3 text-[#fd79a8]/60" />
                <p className="text-[#fd79a8]/50" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('bonus_social_title')}
                </p>
              </div>
              <p className="text-white/25 mb-3 px-1" style={{ fontSize: '0.6875rem' }}>
                {t('bonus_social_desc')}
              </p>

              <div className="space-y-2.5">
                {/* Telegram */}
                <SocialBonusCard
                  icon={<TelegramIcon className="w-5 h-5 text-[#29B6F6]" />}
                  name={t('bonus_telegram')}
                  url="https://t.me/tezamchanel"
                  bgColor="bg-[#29B6F6]/10"
                  accentColor="#29B6F6"
                  claimed={data.social.telegram.claimed}
                  claiming={claimingPlatform === 'telegram'}
                  onFollow={() => {
                    hapticFeedback('light');
                    try {
                      const tgApp = (window as any).Telegram?.WebApp;
                      if (tgApp?.openTelegramLink) {
                        tgApp.openTelegramLink('https://t.me/tezamchanel');
                        return;
                      }
                    } catch (_) {}
                    window.open('https://t.me/tezamchanel', '_blank');
                  }}
                  onClaim={() => handleClaimSocial('telegram')}
                  t={t}
                />

                {/* Instagram */}
                <SocialBonusCard
                  icon={<InstagramIcon className="w-5 h-5 text-[#E4405F]" />}
                  name={t('bonus_instagram')}
                  url="https://www.instagram.com/tezamteam/"
                  bgColor="bg-[#E4405F]/10"
                  accentColor="#E4405F"
                  claimed={data.social.instagram.claimed}
                  claiming={claimingPlatform === 'instagram'}
                  onFollow={() => {
                    hapticFeedback('light');
                    window.open('https://www.instagram.com/tezamteam/', '_blank');
                  }}
                  onClaim={() => handleClaimSocial('instagram')}
                  t={t}
                />
              </div>
            </motion.div>

            {/* ===== Referral Section ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-5"
            >
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <Users className="w-3 h-3 text-[#00cec9]/60" />
                <p className="text-[#00cec9]/50" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('bonus_referral_title')}
                </p>
              </div>

              <GlassCard variant="elevated" padding="lg" className="relative overflow-hidden">
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#00cec9]/8 blur-[30px] pointer-events-none" />

                {/* Description */}
                <p className="text-white/40 mb-4" style={{ fontSize: '0.8125rem' }}>
                  {t('bonus_referral_desc')}
                </p>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/60" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
                  {/* Milestone markers */}
                  <div className="flex justify-between mt-1">
                    {Array.from({ length: 11 }, (_, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${
                          i <= currentProgress ? 'bg-[#00cec9]/60' : 'bg-white/[0.08]'
                        }`}
                      />
                    ))}
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
                      <p className="text-white/20 truncate" style={{ fontSize: '0.6875rem', fontFamily: 'monospace' }}>
                        {referralLink}
                      </p>
                    </div>
                    <Copy className="w-3.5 h-3.5 text-white/25 shrink-0" />
                  </button>
                )}
              </GlassCard>
            </motion.div>

            {/* ===== Support the project ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-5"
            >
              <GlassCard
                variant="interactive"
                padding="md"
                className="relative overflow-hidden"
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
                <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-[#fd79a8]/6 blur-[25px] pointer-events-none" />
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#6c5ce7]/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-[#fd79a8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                      {t('bonus_support_title')}
                    </p>
                    <p className="text-white/30 mt-0.5" style={{ fontSize: '0.75rem' }}>
                      {t('bonus_support_desc')}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-white/15 shrink-0" />
                </div>
              </GlassCard>
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---- Social Bonus Card component ----
function SocialBonusCard({
  icon,
  name,
  url,
  bgColor,
  accentColor,
  claimed,
  claiming,
  onFollow,
  onClaim,
  t,
}: {
  icon: React.ReactNode;
  name: string;
  url: string;
  bgColor: string;
  accentColor: string;
  claimed: boolean;
  claiming: boolean;
  onFollow: () => void;
  onClaim: () => void;
  t: (key: string) => string;
}) {
  return (
    <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
      <div className="flex items-center gap-3.5">
        <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{name}</p>
          {claimed ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                {t('bonus_claimed')} +7 {t('bonus_days_left').replace('{n} ', '').replace('{n}', '')}
              </span>
            </div>
          ) : (
            <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>
              {t('bonus_step1')} &rarr; {t('bonus_step2')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!claimed && (
            <>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onFollow}
                className="h-8 px-3 rounded-lg border flex items-center gap-1.5 transition-colors"
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  borderColor: `${accentColor}33`,
                  backgroundColor: `${accentColor}10`,
                  color: accentColor,
                }}
              >
                <ExternalLink className="w-3 h-3" />
                {t('bonus_follow')}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClaim}
                disabled={claiming}
                className="h-8 px-3 rounded-lg bg-gradient-to-r text-white flex items-center gap-1.5 disabled:opacity-40"
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}aa)`,
                }}
              >
                {claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                +7
              </motion.button>
            </>
          )}
          {claimed && (
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
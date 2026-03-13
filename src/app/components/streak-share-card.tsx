// =============================================
// Streak Milestone Share Card — Viral Growth Loop
// =============================================
// Shows a celebratory modal when user reaches 7/30/100
// day nutrition tracking streaks. Includes share buttons
// for Telegram and Instagram with referral link.
// =============================================

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Flame,
  Share2,
  Send,
  Instagram,
  Copy,
  CheckCircle2,
  Trophy,
  Zap,
} from 'lucide-react';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { buildBotLink, BOT_MENTION } from './bot-config';

interface StreakShareCardProps {
  milestone: number; // 7, 30, or 100
  streak: number;
  onClose: () => void;
}

const MILESTONE_CONFIG: Record<number, {
  emoji: string;
  gradient: string;
  gradientBg: string;
  iconColor: string;
  badgeColor: string;
  icon: typeof Flame;
}> = {
  7: {
    emoji: '🔥',
    gradient: 'from-[#f39c12] to-[#e17055]',
    gradientBg: 'from-[#f39c12]/20 to-[#e17055]/10',
    iconColor: '#f39c12',
    badgeColor: '#e17055',
    icon: Flame,
  },
  30: {
    emoji: '⚡',
    gradient: 'from-[#6c5ce7] to-[#a29bfe]',
    gradientBg: 'from-[#6c5ce7]/20 to-[#a29bfe]/10',
    iconColor: '#6c5ce7',
    badgeColor: '#a29bfe',
    icon: Zap,
  },
  100: {
    emoji: '🏆',
    gradient: 'from-[#fdcb6e] to-[#f39c12]',
    gradientBg: 'from-[#fdcb6e]/20 to-[#f39c12]/10',
    iconColor: '#fdcb6e',
    badgeColor: '#f39c12',
    icon: Trophy,
  },
};

export function StreakShareCard({ milestone, streak, onClose }: StreakShareCardProps) {
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const [copied, setCopied] = useState(false);

  const config = MILESTONE_CONFIG[milestone] || MILESTONE_CONFIG[7];
  const MilestoneIcon = config.icon;

  const referralCode = user?.referralCode || '';
  const referralLink = referralCode
    ? buildBotLink(`ref_${referralCode}`)
    : buildBotLink();

  const shareText = lang === 'ru'
    ? `${config.emoji} Я отслеживаю питание уже ${milestone} дней подряд! Присоединяйся — AI трекер питания и тренировок`
    : `${config.emoji} I've been tracking my nutrition for ${milestone} days straight! Join me — AI nutrition & fitness tracker`;

  const instagramText = lang === 'ru'
    ? `${config.emoji} ${milestone} дней трекинга питания подряд!\n\nСледи за своим питанием с AI — ${BOT_MENTION} в Telegram`
    : `${config.emoji} ${milestone} days of nutrition tracking!\n\nTrack your nutrition with AI — ${BOT_MENTION} on Telegram`;

  const handleDismiss = useCallback(async () => {
    hapticFeedback('light');
    try {
      await api.markMilestoneShown(milestone);
    } catch (err) {
      console.warn('[Streak] Failed to mark milestone shown:', err);
    }
    onClose();
  }, [milestone, onClose]);

  const handleShareTelegram = useCallback(() => {
    hapticFeedback('medium');
    const tgShareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(tgShareLink);
    } else {
      window.open(tgShareLink, '_blank');
    }
    // Mark as shown after sharing
    api.markMilestoneShown(milestone).catch(() => {});
  }, [referralLink, shareText, milestone]);

  const handleShareInstagram = useCallback(async () => {
    hapticFeedback('medium');
    // Copy the text to clipboard for Instagram story paste
    try {
      await navigator.clipboard.writeText(`${instagramText}\n\n${referralLink}`);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = `${instagramText}\n\n${referralLink}`;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
    // Try to open Instagram
    try {
      window.open('https://www.instagram.com/', '_blank');
    } catch {}
    api.markMilestoneShown(milestone).catch(() => {});
  }, [instagramText, referralLink, milestone]);

  const handleCopyLink = useCallback(async () => {
    hapticFeedback('light');
    try {
      await navigator.clipboard.writeText(referralLink);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
  }, [referralLink]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Share Card */}
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10"
            style={{
              background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(15,15,25,0.98))',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>

            {/* Decorative background glow */}
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gradient-to-b ${config.gradient} opacity-15 blur-3xl`}
              style={{ top: '-80px' }}
            />

            {/* Content */}
            <div className="relative px-6 pt-8 pb-6">
              {/* Celebration animation area */}
              <div className="flex flex-col items-center mb-6">
                {/* Milestone badge */}
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
                  className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${config.gradient} flex items-center justify-center mb-4 shadow-lg`}
                  style={{ boxShadow: `0 8px 32px ${config.iconColor}40` }}
                >
                  <span style={{ fontSize: '2.5rem' }}>{config.emoji}</span>
                </motion.div>

                {/* Streak number */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="text-center"
                >
                  <p
                    className={`bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}
                    style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1.1 }}
                  >
                    {milestone}
                  </p>
                  <p className="text-white/50 text-sm mt-1" style={{ fontWeight: 500 }}>
                    {t('streak_days_label')}
                  </p>
                </motion.div>
              </div>

              {/* Achievement text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="text-center mb-6"
              >
                <p className="text-white text-lg mb-1" style={{ fontWeight: 600 }}>
                  {t('streak_congrats_title')}
                </p>
                <p className="text-white/50 text-sm leading-relaxed">
                  {t(`streak_${milestone}_desc`)}
                </p>
              </motion.div>

              {/* Current streak indicator */}
              {streak > milestone && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-center gap-2 mb-5 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] mx-auto w-fit"
                >
                  <Flame className="w-4 h-4" style={{ color: config.iconColor }} />
                  <span className="text-white/60 text-sm">
                    {t('streak_current', { days: streak })}
                  </span>
                </motion.div>
              )}

              {/* Share buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="space-y-3"
              >
                {/* Telegram share */}
                <button
                  onClick={handleShareTelegram}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#2AABEE]/15 border border-[#2AABEE]/25 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#2AABEE] flex items-center justify-center flex-shrink-0">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-white text-sm" style={{ fontWeight: 600 }}>
                      {t('streak_share_telegram')}
                    </p>
                    <p className="text-white/35 text-xs">
                      {t('streak_share_telegram_desc')}
                    </p>
                  </div>
                  <Share2 className="w-4 h-4 text-[#2AABEE]/60" />
                </button>

                {/* Instagram share */}
                <button
                  onClick={handleShareInstagram}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#E1306C]/10 border border-[#E1306C]/20 active:scale-[0.98] transition-transform"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
                    }}
                  >
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-white text-sm" style={{ fontWeight: 600 }}>
                      {t('streak_share_instagram')}
                    </p>
                    <p className="text-white/35 text-xs">
                      {copied ? t('streak_copied') : t('streak_share_instagram_desc')}
                    </p>
                  </div>
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00b894]" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#E1306C]/60" />
                  )}
                </button>
              </motion.div>

              {/* Referral link copy */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65 }}
                onClick={handleCopyLink}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] active:scale-[0.98] transition-transform"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00b894]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-white/40" />
                )}
                <span className="text-white/40 text-xs">
                  {copied ? t('streak_link_copied') : t('streak_copy_link')}
                </span>
              </motion.button>

              {/* Skip / dismiss */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.75 }}
                onClick={handleDismiss}
                className="w-full mt-3 py-2 text-center"
              >
                <span className="text-white/25 text-xs">{t('streak_maybe_later')}</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
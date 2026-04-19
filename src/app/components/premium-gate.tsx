// =============================================
// Proper Food AI — Premium Gate (Freemium AI Paywall)
// =============================================
// Replaces page content with a beautiful upsell
// screen when user doesn't have an active
// subscription. Used for AI-powered features:
// Coach Chat, Plan Builder, Journal Insights.
//
// Trial-aware: Shows different messaging for
// active trial vs expired trial vs never-had.
// =============================================

import React from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Crown,
  Sparkles,
  Bot,
  Brain,
  Check,
  Gift,
  Lock,
  Salad,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';

export type PremiumFeature = 'coach' | 'plan-builder' | 'insights' | 'nutrition-coach';

interface PremiumGateProps {
  feature: PremiumFeature;
  children: React.ReactNode;
}

const FEATURE_ICONS: Record<PremiumFeature, React.ElementType> = {
  coach: Bot,
  'plan-builder': Sparkles,
  insights: Brain,
  'nutrition-coach': Salad,
};

const FEATURE_COLORS: Record<PremiumFeature, { from: string; to: string; accent: string }> = {
  coach: { from: 'from-[#6c5ce7]', to: 'to-[#00cec9]', accent: 'text-[#a29bfe]' },
  'plan-builder': { from: 'from-[#6c5ce7]', to: 'to-[#a29bfe]', accent: 'text-[#a29bfe]' },
  insights: { from: 'from-[#fd79a8]', to: 'to-[#6c5ce7]', accent: 'text-[#fd79a8]' },
  'nutrition-coach': { from: 'from-[#00b894]', to: 'to-[#00cec9]', accent: 'text-[#00b894]' },
};

const FEATURE_DESC_KEYS: Record<PremiumFeature, string> = {
  coach: 'premium_ai_coach_desc',
  'plan-builder': 'premium_plan_builder_desc',
  insights: 'premium_insights_desc',
  'nutrition-coach': 'premium_nutrition_coach_desc',
};

const FEATURE_TITLE_KEYS: Record<PremiumFeature, string> = {
  coach: 'coach_chat_title',
  'plan-builder': 'home_create_path',
  insights: 'insights_btn',
  'nutrition-coach': 'nutrition_coach_title',
};

/**
 * Wraps AI-powered pages. If subscription is inactive,
 * shows a premium upsell instead of the page content.
 * Admins and dev-mode users bypass the gate.
 *
 * Trial-aware: during trial, lets user through (limits enforced per-endpoint).
 * After trial expires, shows upsell with trial-expired messaging.
 */
export function PremiumGate({ feature, children }: PremiumGateProps) {
  const { subscriptionActive, isAdmin, isDevMode, isTrial, trialDaysLeft, trialExpired } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Bypass for admins and dev mode
  if (isAdmin || isDevMode) {
    return <>{children}</>;
  }

  // Active subscription (paid) — full access
  if (subscriptionActive && !isTrial) {
    return <>{children}</>;
  }

  // Active trial — let through (limits enforced server-side per endpoint)
  if (subscriptionActive && isTrial) {
    return <>{children}</>;
  }

  const Icon = FEATURE_ICONS[feature];
  const colors = FEATURE_COLORS[feature];
  const descKey = FEATURE_DESC_KEYS[feature];
  const titleKey = FEATURE_TITLE_KEYS[feature];

  const features = [
    { key: 'premium_feat_coach', icon: Bot },
    { key: 'premium_feat_plan', icon: Sparkles },
    { key: 'premium_feat_insights', icon: Brain },
    { key: 'premium_feat_nutrition', icon: Salad },
  ];

  // Determine trial-specific vs generic messaging
  const isTrialExpiredState = trialExpired;

  return (
    <div className="min-h-screen px-5 pb-28" style={{ paddingTop: '6px' }}>
      <div className="max-w-md mx-auto">
        {/* Hero */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className={`w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br ${colors.from}/20 ${colors.to}/10 flex items-center justify-center border border-white/[0.08] relative`}
          >
            <Icon className={`w-9 h-9 ${colors.accent}`} />
            <div className={`absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${
              isTrialExpiredState
                ? 'bg-gradient-to-br from-red-400 to-red-500'
                : 'bg-gradient-to-br from-amber-400 to-amber-500'
            }`}>
              {isTrialExpiredState
                ? <AlertTriangle className="w-3.5 h-3.5 text-white" />
                : <Lock className="w-3.5 h-3.5 text-white" />
              }
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-foreground mb-2"
            style={{ fontSize: '1.5rem', fontWeight: 700 }}
          >
            {isTrialExpiredState
              ? t('trial_gate_title')
              : t(titleKey)
            }
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground leading-relaxed"
            style={{ fontSize: '0.9375rem' }}
          >
            {isTrialExpiredState
              ? t('trial_gate_desc', { feature: t(titleKey) })
              : t(descKey)
            }
          </motion.p>
        </div>

        {/* Trial-expired or Premium badge */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          {isTrialExpiredState ? (
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-red-500/20 to-red-400/10 border border-red-500/30 flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400" />
              <span className="text-red-400" style={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                {t('trial_gate_title')}
              </span>
            </div>
          ) : (
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-400/10 border border-amber-500/30 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400" style={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                PREMIUM
              </span>
            </div>
          )}
        </motion.div>

        {/* Features list */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#a29bfe]" />
              <span className="text-foreground/70" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('premium_features_title')}
              </span>
            </div>
            <div className="space-y-3">
              {features.map((f) => {
                const FIcon = f.icon;
                const isCurrentFeature = f.key === `premium_feat_${feature === 'plan-builder' ? 'plan' : feature === 'nutrition-coach' ? 'nutrition' : feature}`;
                return (
                  <div key={f.key} className={`flex items-center gap-3 ${isCurrentFeature ? 'opacity-100' : 'opacity-60'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isCurrentFeature
                        ? 'bg-[#6c5ce7]/30'
                        : 'bg-[#6c5ce7]/15'
                    }`}>
                      <Check className={`w-3 h-3 ${isCurrentFeature ? 'text-[#a29bfe]' : 'text-[#a29bfe]/60'}`} />
                    </div>
                    <span className={`${isCurrentFeature ? 'text-foreground' : 'text-foreground/60'}`} style={{ fontSize: '0.875rem', fontWeight: isCurrentFeature ? 600 : 400 }}>
                      {t(f.key)}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>

        {/* Subscribe button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=60'); }}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform shadow-lg"
          style={{ fontSize: '1rem', boxShadow: '0 4px 24px rgba(108, 92, 231, 0.4)' }}
        >
          <Crown className="w-5 h-5" />
          {t('premium_subscribe_btn')}
        </motion.button>

        {/* Free days link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-4 text-center"
        >
          <button
            onClick={() => { hapticFeedback('light'); navigate('/bonuses'); }}
            className="text-[#a29bfe] flex items-center justify-center gap-1.5 mx-auto"
            style={{ fontSize: '0.875rem' }}
          >
            <Gift className="w-4 h-4" />
            {t('premium_free_days_btn')}
          </button>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Small inline premium badge for cards/buttons
 * that lead to AI features.
 */
export function PremiumBadge({ className = '' }: { className?: string }) {
  const { subscriptionActive, isAdmin, isDevMode } = useAuth();

  // Don't show badge if user has access
  if (subscriptionActive || isAdmin || isDevMode) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/25 ${className}`}>
      <Crown className="w-2.5 h-2.5 text-amber-400" />
      <span className="text-amber-400" style={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.04em' }}>
        PRO
      </span>
    </span>
  );
}

/**
 * Inline limit indicator — shows remaining uses for a feature.
 * Shows nothing for premium/admin users.
 */
export function FreemiumLimitBadge({
  used,
  limit,
  className = '',
}: {
  used: number;
  limit: number | null;
  className?: string;
}) {
  // No limit = premium
  if (limit === null) return null;
  const remaining = Math.max(0, limit - used);
  const isExhausted = remaining <= 0;

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[0.5625rem] font-semibold ${
      isExhausted
        ? 'bg-red-500/15 text-red-400 border border-red-500/25'
        : remaining <= 1
        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
        : 'bg-[#6c5ce7]/10 text-[#a29bfe] border border-[#6c5ce7]/20'
    } ${className}`}>
      {used}/{limit}
    </span>
  );
}
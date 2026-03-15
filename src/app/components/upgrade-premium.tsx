// =============================================
// Upgrade to Premium — Nutrition & Fitness
// =============================================
// Dedicated upgrade screen showing:
//   - Free vs Premium comparison
//   - Current usage stats
//   - Telegram Stars payment plans
//   - Feature highlights
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  Star,
  Check,
  X,
  Loader2,
  Sparkles,
  Camera,
  UtensilsCrossed,
  Dumbbell,
  Shield,
  Gift,
  Send,
  ArrowLeft,
  Infinity,
  RotateCcw,
  CalendarDays,
  Clock,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, closeMiniApp } from './telegram';
import { useTranslation } from './i18n';

// ---- Types ----
type PlanId = '30' | '60' | '90';

interface UsageData {
  is_premium: boolean;
  scans: { used: number; limit: number | null; remaining: number | null };
  meal_plans: { used: number; limit: number | null; remaining: number | null };
  workout_plans: { advanced: boolean };
}

const PLANS: { id: PlanId; days: number; months: number; stars: number; save?: number; popular: boolean }[] = [
  { id: '30', days: 30, months: 1, stars: 350, popular: false },
  { id: '60', days: 60, months: 2, stars: 600, save: 14, popular: true },
  { id: '90', days: 90, months: 3, stars: 900, save: 14, popular: false },
];

export function UpgradePremiumPage() {
  const navigate = useNavigate();
  const { user, subscriptionActive, refreshSubscription } = useAuth();
  const { t, lang } = useTranslation();

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('60');
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [usageLoading, setUsageLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ restored: boolean; message: string } | null>(null);

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  // Load usage data
  useEffect(() => {
    if (!user) return;
    setUsageLoading(true);
    api.getUsage()
      .then(setUsage)
      .catch(err => console.error('[Upgrade] Usage load error:', err))
      .finally(() => setUsageLoading(false));
  }, [user]);

  // Purchase handler — uses Telegram.WebApp.openInvoice for instant in-app payment
  const handlePurchase = useCallback(async () => {
    hapticFeedback('medium');
    setLoading(true);
    setPaymentStatus('idle');

    try {
      // Try in-app invoice flow first (openInvoice)
      const tgWebApp = (window as any).Telegram?.WebApp;
      if (tgWebApp?.openInvoice) {
        const res = await api.createInvoiceLink(selectedPlan);
        console.log('[Upgrade] Invoice link created:', res);

        if (res.success && res.invoiceLink) {
          // Open native Telegram payment sheet
          tgWebApp.openInvoice(res.invoiceLink, async (status: string) => {
            console.log('[Upgrade] openInvoice callback status:', status);
            if (status === 'paid') {
              hapticSuccess();
              setPaymentStatus('success');
              // Activate subscription on backend (safety net, webhook may have already done it)
              try {
                await api.activateSubscription(selectedPlan, res.stars);
              } catch (activateErr) {
                console.warn('[Upgrade] activateSubscription fallback error:', activateErr);
              }
              // Reload auth state after short delay
              setTimeout(() => window.location.reload(), 1500);
            } else if (status === 'cancelled') {
              setPaymentStatus('idle');
            } else {
              setPaymentStatus('error');
            }
            setLoading(false);
          });
          return; // Don't setLoading(false) here — callback handles it
        }
      }

      // Fallback: send invoice to chat (for clients without openInvoice support)
      const res = await api.createInvoice(selectedPlan);
      console.log('[Upgrade] Invoice sent to chat:', res);

      if (res.success && res.sentToChat) {
        hapticSuccess();
        setPaymentStatus('pending');
      } else {
        setPaymentStatus('error');
      }
    } catch (err: any) {
      console.error('[Upgrade] Payment error:', err);
      setPaymentStatus('error');
    } finally {
      setLoading(false);
    }
  }, [selectedPlan]);

  // Restore subscription handler
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setRestoreResult(null);

    try {
      const res = await api.restorePurchase();
      console.log('[Upgrade] Restore purchase result:', res);

      if (res.restored) {
        hapticSuccess();
        setRestoreResult({ restored: true, message: res.message });
        await refreshSubscription();
        // Reload after a brief display
        setTimeout(() => window.location.reload(), 2000);
      } else {
        hapticFeedback('light');
        setRestoreResult({ restored: false, message: res.message });
      }
    } catch (err: any) {
      console.error('[Upgrade] Restore purchase error:', err);
      setRestoreResult({ restored: false, message: t('up_restore_failed') });
    } finally {
      setRestoring(false);
    }
  }, [refreshSubscription, t]);

  // Already premium
  if (subscriptionActive && !usageLoading) {
    return <PremiumDashboard />;
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="px-5 max-w-md mx-auto">
        {/* Hero */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-[#6c5ce7]/30 to-[#a29bfe]/10 flex items-center justify-center border border-white/[0.08]"
          >
            <Crown className="w-10 h-10 text-[#a29bfe]" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white mb-2"
            style={{ fontSize: '1.5rem', fontWeight: 700 }}
          >
            {t('up_title')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-white/50"
            style={{ fontSize: '0.9375rem' }}
          >
            {t('up_subtitle')}
          </motion.p>
        </div>

        {/* Current usage (for free users) */}
        {usage && !usage.is_premium && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="mb-5"
          >
            <GlassCard className="!p-4">
              <p className="text-white/40 mb-3" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {t('up_usage_title')}
              </p>
              <div className="space-y-2.5">
                <UsageRow
                  icon={Camera}
                  color="#00cec9"
                  label={t('up_food_scans')}
                  used={usage.scans.used}
                  limit={usage.scans.limit}
                  lang={lang}
                />
                <UsageRow
                  icon={UtensilsCrossed}
                  color="#6c5ce7"
                  label={t('up_meal_plans_week')}
                  used={usage.meal_plans.used}
                  limit={usage.meal_plans.limit}
                  lang={lang}
                />
                <UsageRow
                  icon={Dumbbell}
                  color="#fd79a8"
                  label={t('up_advanced_workouts')}
                  used={0}
                  limit={0}
                  locked={!usage.workout_plans.advanced}
                  lang={lang}
                />
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Free vs Premium comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-5"
        >
          <GlassCard className="!p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#a29bfe]" />
              <span className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('up_plan_comparison')}
              </span>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-3 gap-2 mb-3 px-1">
              <div />
              <div className="text-center">
                <span className="text-white/30" style={{ fontSize: '0.625rem', fontWeight: 600 }}>FREE</span>
              </div>
              <div className="text-center">
                <span className="text-[#a29bfe]" style={{ fontSize: '0.625rem', fontWeight: 700 }}>PREMIUM</span>
              </div>
            </div>

            <div className="space-y-2">
              <ComparisonRow
                label={t('up_food_scans_row')}
                free="5/day"
                premium={t('up_unlimited')}
                premiumHighlight
              />
              <ComparisonRow
                label={t('up_meal_plans_row')}
                free="1/week"
                premium={t('up_unlimited')}
                premiumHighlight
              />
              <ComparisonRow
                label={t('up_workouts_row')}
                free={t('up_basic')}
                premium={t('up_advanced')}
                premiumHighlight
              />
              <ComparisonRow
                label={t('up_ai_coach_row')}
                free={<X className="w-3.5 h-3.5 text-white/20" />}
                premium={<Check className="w-3.5 h-3.5 text-[#00cec9]" />}
                premiumHighlight
              />
              <ComparisonRow
                label={t('up_insights_row')}
                free={<X className="w-3.5 h-3.5 text-white/20" />}
                premium={<Check className="w-3.5 h-3.5 text-[#00cec9]" />}
                premiumHighlight
              />
            </div>
          </GlassCard>
        </motion.div>

        {/* Plan selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-2.5 mb-5"
        >
          {PLANS.map((p) => {
            const isSelected = selectedPlan === p.id;
            const label = p.months === 1
              ? t('up_1_month')
              : p.months === 2
              ? t('up_2_months')
              : t('up_3_months');

            const perMonth = Math.round(p.stars / p.months);

            return (
              <button
                key={p.id}
                onClick={() => { hapticFeedback('light'); setSelectedPlan(p.id); }}
                className={`w-full relative rounded-2xl p-4 pl-12 text-left transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#6c5ce7]/20 border-2 border-[#6c5ce7]'
                    : 'bg-white/[0.04] border-2 border-transparent'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-2.5 right-4 px-3 py-0.5 rounded-full bg-[#6c5ce7]">
                    <span className="text-white" style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                      {t('up_popular')}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>{label}</span>
                      {p.save && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                          -{p.save}%
                        </span>
                      )}
                    </div>
                    <span className="text-white/40" style={{ fontSize: '0.8125rem' }}>
                      {p.months > 1
                        ? `~${perMonth} Stars/${t('up_per_month')}`
                        : `${p.stars} Stars`
                      }
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                      {p.stars}
                    </span>
                  </div>
                </div>

                <div className={`absolute top-1/2 -translate-y-1/2 left-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* USD equivalent */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.42 }}
          className="text-center mb-4"
        >
          <span className="text-white/25" style={{ fontSize: '0.75rem' }}>
            {`\u2248 $${plan.months === 1 ? '6' : plan.months === 2 ? '10' : '15'} \u00B7 ${plan.days} ${t('shared_days_unit')}`}
          </span>
        </motion.div>

        {/* Payment status */}
        <AnimatePresence>
          {paymentStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-5 rounded-2xl bg-green-500/10 border border-green-500/20 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3"
              >
                <Check className="w-7 h-7 text-green-400" />
              </motion.div>
              <p className="text-green-400 mb-1" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                {t('up_payment_success')}
              </p>
              <p className="text-white/50" style={{ fontSize: '0.8125rem' }}>
                {t('up_premium_activated', { n: plan.days })}
              </p>
            </motion.div>
          )}
          {paymentStatus === 'pending' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center"
            >
              <Send className="w-5 h-5 text-green-400 mx-auto mb-2" />
              <span className="text-green-400" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                {t('up_invoice_sent')}
              </span>
              <p className="text-white/40 mt-1" style={{ fontSize: '0.75rem' }}>
                {t('up_open_chat')}
              </p>
              <button
                onClick={() => { try { closeMiniApp(); } catch { window.close(); } }}
                className="mt-3 px-5 py-2 rounded-xl bg-green-500/20 text-green-400"
                style={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                {t('up_go_to_chat')}
              </button>
            </motion.div>
          )}
          {paymentStatus === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center"
            >
              <span className="text-red-400" style={{ fontSize: '0.875rem' }}>
                {t('up_payment_failed')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buy button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={handlePurchase}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ fontSize: '1rem', boxShadow: '0 4px 24px rgba(108, 92, 231, 0.4)' }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Star className="w-5 h-5 fill-white" />
              {t('up_pay', { n: plan.stars })}
            </>
          )}
        </motion.button>

        {/* Bonuses link */}
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
            {t('up_free_days')}
          </button>
        </motion.div>

        {/* Restore Purchase */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="mt-3 text-center"
        >
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="text-white/40 flex items-center justify-center gap-1.5 mx-auto hover:text-white/60 transition-colors disabled:opacity-50"
            style={{ fontSize: '0.8125rem' }}
          >
            {restoring ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            {t('up_restore')}
          </button>
          
          {/* Restore result message */}
          <AnimatePresence>
            {restoreResult && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mt-2 ${restoreResult.restored ? 'text-green-400' : 'text-white/40'}`}
                style={{ fontSize: '0.75rem' }}
              >
                {restoreResult.message}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Security */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 flex items-center justify-center gap-2 text-white/20"
          style={{ fontSize: '0.75rem' }}
        >
          <Shield className="w-3.5 h-3.5" />
          {t('up_secure')}
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function UsageRow({
  icon: Icon,
  color,
  label,
  used,
  limit,
  locked,
  lang,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  used: number;
  limit: number | null;
  locked?: boolean;
  lang: string;
}) {
  const atLimit = limit !== null && limit > 0 && used >= limit;
  const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white/70 truncate" style={{ fontSize: '0.75rem' }}>{label}</span>
          {locked ? (
            <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
              <Crown className="w-3 h-3 text-amber-400 inline mr-0.5" />
              {lang === 'ru' ? 'Premium' : 'Premium'}
            </span>
          ) : limit !== null && limit > 0 ? (
            <span className={atLimit ? 'text-red-400' : 'text-white/40'} style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
              {used}/{limit}
            </span>
          ) : (
            <span className="text-[#00cec9]" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
              <Infinity className="w-3 h-3 inline" />
            </span>
          )}
        </div>
        {!locked && limit !== null && limit > 0 && (
          <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                atLimit ? 'bg-red-400' : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  free,
  premium,
  premiumHighlight,
}: {
  label: string;
  free: React.ReactNode;
  premium: React.ReactNode;
  premiumHighlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center py-2 px-1 border-b border-white/[0.04] last:border-0">
      <span className="text-white/50 truncate" style={{ fontSize: '0.75rem' }}>{label}</span>
      <div className="text-center">
        {typeof free === 'string' ? (
          <span className="text-white/30" style={{ fontSize: '0.75rem' }}>{free}</span>
        ) : (
          <div className="flex items-center justify-center">{free}</div>
        )}
      </div>
      <div className="text-center">
        {typeof premium === 'string' ? (
          <span className={premiumHighlight ? 'text-[#00cec9]' : 'text-white/70'} style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {premium}
          </span>
        ) : (
          <div className="flex items-center justify-center">{premium}</div>
        )}
      </div>
    </div>
  );
}

interface PaymentRecord {
  id: string;
  currency: string;
  amount: number;
  daysAdded: number;
  createdAt: string;
  payload?: string;
  type?: string;
}

function PremiumDashboard() {
  const navigate = useNavigate();
  const { subscriptionActive, subscriptionDaysLeft, refreshSubscription } = useAuth();
  const { t, lang } = useTranslation();

  const [subStatus, setSubStatus] = useState<{
    isActive: boolean;
    expiresAt: string | null;
    daysLeft: number;
    isAdmin: boolean;
  } | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('60');
  const [purchasing, setPurchasing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'idle' | 'success' | 'error' | 'pending'>('idle');

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  useEffect(() => {
    api.getSubscriptionStatus()
      .then(setSubStatus)
      .catch(err => console.error('[PremiumDash] sub status error:', err))
      .finally(() => setLoadingStatus(false));

    api.getPaymentHistory()
      .then(res => setPayments(res.payments || []))
      .catch(err => console.error('[PremiumDash] payments error:', err))
      .finally(() => setLoadingPayments(false));
  }, []);

  const expiresFormatted = subStatus?.expiresAt
    ? new Date(subStatus.expiresAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  const daysLeft = subStatus?.daysLeft ?? subscriptionDaysLeft;
  const urgencyColor = daysLeft <= 3
    ? 'text-red-400'
    : daysLeft <= 7
    ? 'text-amber-400'
    : 'text-emerald-400';

  const totalStars = payments.reduce((sum, p) => sum + (p.currency === 'XTR' ? p.amount : 0), 0);
  const totalDays = payments.reduce((sum, p) => sum + (p.daysAdded || 0), 0);

  const handleExtend = useCallback(async () => {
    hapticFeedback('medium');
    setPurchasing(true);
    setPaymentResult('idle');

    try {
      const tgWebApp = (window as any).Telegram?.WebApp;
      if (tgWebApp?.openInvoice) {
        const res = await api.createInvoiceLink(selectedPlan);
        if (res.success && res.invoiceLink) {
          tgWebApp.openInvoice(res.invoiceLink, async (status: string) => {
            if (status === 'paid') {
              hapticSuccess();
              setPaymentResult('success');
              try { await api.activateSubscription(selectedPlan, res.stars); } catch {}
              await refreshSubscription();
              const [newStatus, newPayments] = await Promise.all([
                api.getSubscriptionStatus(),
                api.getPaymentHistory(),
              ]);
              setSubStatus(newStatus);
              setPayments(newPayments.payments || []);
            } else if (status === 'cancelled') {
              setPaymentResult('idle');
            } else {
              setPaymentResult('error');
            }
            setPurchasing(false);
          });
          return;
        }
      }
      const res = await api.createInvoice(selectedPlan);
      if (res.success && res.sentToChat) {
        hapticSuccess();
        setPaymentResult('pending');
      } else {
        setPaymentResult('error');
      }
    } catch {
      setPaymentResult('error');
    } finally {
      setPurchasing(false);
    }
  }, [selectedPlan, refreshSubscription]);

  const visiblePayments = showAllPayments ? payments : payments.slice(0, 5);

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-4">
        {/* Status Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <GlassCard className="!p-0 overflow-hidden">
            <div className="relative px-5 pt-5 pb-4" style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.12) 0%, rgba(255,215,0,0.03) 100%)',
            }}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ffd700]/25 to-[#ffd700]/5 flex items-center justify-center border border-[#ffd700]/20 flex-shrink-0">
                  <Crown className="w-7 h-7 text-[#ffd700]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                      Premium
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400" style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                      {t('up_sub_active')}
                    </span>
                  </div>
                  {loadingStatus ? (
                    <div className="flex items-center gap-1.5 text-white/30">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span style={{ fontSize: '0.75rem' }}>{t('loading')}</span>
                    </div>
                  ) : (
                    <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
                      {subStatus?.isAdmin
                        ? t('up_sub_admin')
                        : expiresFormatted
                        ? `${t('up_sub_until')} ${expiresFormatted}`
                        : t('up_already_desc')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!loadingStatus && (
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] px-2 py-3">
                <div className="text-center px-2">
                  <p className={`${urgencyColor}`} style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {subStatus?.isAdmin ? '∞' : daysLeft}
                  </p>
                  <p className="text-white/30" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                    {t('up_sub_days_left')}
                  </p>
                </div>
                <div className="text-center px-2">
                  <p className="text-white/80" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {totalStars}
                  </p>
                  <p className="text-white/30" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                    Stars {t('up_sub_spent')}
                  </p>
                </div>
                <div className="text-center px-2">
                  <p className="text-white/80" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {payments.length}
                  </p>
                  <p className="text-white/30" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                    {t('up_sub_payments_count')}
                  </p>
                </div>
              </div>
            )}

            {!loadingStatus && !subStatus?.isAdmin && daysLeft <= 7 && daysLeft > 0 && (
              <div className={`mx-4 mb-4 rounded-xl p-3 border ${
                daysLeft <= 3
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 flex-shrink-0 ${daysLeft <= 3 ? 'text-red-400' : 'text-amber-400'}`} />
                  <p className={daysLeft <= 3 ? 'text-red-400' : 'text-amber-400'} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    {t('up_sub_expiring', { n: daysLeft })}
                  </p>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Payment History */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <div className="flex items-center justify-between mb-2.5 px-1">
            <div className="flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 text-white/25" />
              <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {t('up_sub_history')}
              </span>
            </div>
            {payments.length > 0 && (
              <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                {t('up_sub_total_days', { n: totalDays })}
              </span>
            )}
          </div>

          <GlassCard className="!p-0 overflow-hidden">
            {loadingPayments ? (
              <div className="flex items-center justify-center py-8 gap-2 text-white/30">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span style={{ fontSize: '0.8125rem' }}>{t('loading')}</span>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 px-4">
                <CreditCard className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-white/25" style={{ fontSize: '0.8125rem' }}>
                  {t('up_sub_no_payments')}
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {visiblePayments.map((payment, idx) => {
                    const date = new Date(payment.createdAt);
                    const dateStr = date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    });
                    const timeStr = date.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    const currencyLabel = payment.currency === 'XTR' ? 'Stars' : payment.currency;

                    return (
                      <motion.div
                        key={payment.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#6c5ce7]/10 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-[#a29bfe]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white/80 truncate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                              {payment.amount} {currencyLabel}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#6c5ce7]/15 text-[#a29bfe]" style={{ fontSize: '0.5625rem', fontWeight: 700 }}>
                              +{payment.daysAdded} {t('up_sub_days_short')}
                            </span>
                          </div>
                          <p className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                            {dateStr} · {timeStr}
                          </p>
                        </div>
                        <Check className="w-4 h-4 text-emerald-400/50 flex-shrink-0" />
                      </motion.div>
                    );
                  })}
                </div>

                {payments.length > 5 && (
                  <button
                    onClick={() => { hapticFeedback('light'); setShowAllPayments(!showAllPayments); }}
                    className="w-full py-2.5 flex items-center justify-center gap-1.5 text-white/30 border-t border-white/[0.04]"
                    style={{ fontSize: '0.75rem', fontWeight: 500 }}
                  >
                    {showAllPayments ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        {t('up_sub_show_less')}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        {t('up_sub_show_all', { n: payments.length })}
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </GlassCard>
        </motion.div>

        {/* Extend Subscription */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <TrendingUp className="w-3.5 h-3.5 text-white/25" />
            <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t('up_sub_extend')}
            </span>
          </div>

          <div className="space-y-2 mb-4">
            {PLANS.map((p) => {
              const isSelected = selectedPlan === p.id;
              const label = p.months === 1
                ? t('up_1_month')
                : p.months === 2
                ? t('up_2_months')
                : t('up_3_months');
              const perMonth = Math.round(p.stars / p.months);

              return (
                <button
                  key={p.id}
                  onClick={() => { hapticFeedback('light'); setSelectedPlan(p.id); }}
                  className={`w-full relative rounded-2xl p-3.5 pl-11 text-left transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#6c5ce7]/20 border-2 border-[#6c5ce7]'
                      : 'bg-white/[0.04] border-2 border-transparent'
                  }`}
                >
                  {p.popular && (
                    <div className="absolute -top-2 right-4 px-2.5 py-0.5 rounded-full bg-[#6c5ce7]">
                      <span className="text-white" style={{ fontSize: '0.5625rem', fontWeight: 700 }}>
                        {t('up_popular')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{label}</span>
                        {p.save && (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                            -{p.save}%
                          </span>
                        )}
                      </div>
                      <span className="text-white/40" style={{ fontSize: '0.75rem' }}>
                        {p.months > 1
                          ? `~${perMonth} Stars/${t('up_per_month')}`
                          : `${p.stars} Stars`
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                        {p.stars}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`absolute top-1/2 -translate-y-1/2 left-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                    }`}
                    style={{ width: '18px', height: '18px' }}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Payment status messages */}
          <AnimatePresence>
            {paymentResult === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mb-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center"
              >
                <Check className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-green-400" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {t('up_payment_success')}
                </p>
              </motion.div>
            )}
            {paymentResult === 'pending' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mb-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center"
              >
                <Send className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-green-400" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {t('up_invoice_sent')}
                </p>
                <button
                  onClick={() => { try { closeMiniApp(); } catch { window.close(); } }}
                  className="mt-2 px-5 py-2 rounded-xl bg-green-500/20 text-green-400"
                  style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  {t('up_go_to_chat')}
                </button>
              </motion.div>
            )}
            {paymentResult === 'error' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center"
              >
                <span className="text-red-400" style={{ fontSize: '0.8125rem' }}>
                  {t('up_payment_failed')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Extend button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleExtend}
            disabled={purchasing}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold flex items-center justify-center gap-2.5 disabled:opacity-50"
            style={{ fontSize: '0.9375rem', boxShadow: '0 4px 20px rgba(108, 92, 231, 0.35)' }}
          >
            {purchasing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Star className="w-4 h-4 fill-white" />
                {t('up_sub_extend_btn', { n: plan.stars })}
              </>
            )}
          </motion.button>

          {/* Bonuses link */}
          <div className="mt-3 text-center">
            <button
              onClick={() => { hapticFeedback('light'); navigate('/bonuses'); }}
              className="text-[#a29bfe] flex items-center justify-center gap-1.5 mx-auto"
              style={{ fontSize: '0.8125rem' }}
            >
              <Gift className="w-3.5 h-3.5" />
              {t('up_free_days')}
            </button>
          </div>

          {/* Security */}
          <div className="mt-5 flex items-center justify-center gap-2 text-white/15" style={{ fontSize: '0.6875rem' }}>
            <Shield className="w-3 h-3" />
            {t('up_secure')}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
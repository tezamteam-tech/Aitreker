// =============================================
// Proper Food AI — Paywall / Subscription Screen
// =============================================
// Shown when subscription has expired. Offers
// Stars & TON payment plans and access to bonuses.
// =============================================

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  Star,
  Gift,
  Check,
  Loader2,
  Sparkles,
  Shield,
  Gem,
  Send,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, closeMiniApp } from './telegram';
import { useTranslation } from './i18n';

interface PaywallProps {
  daysLeft?: number;
  expiresAt?: string | null;
  onSubscriptionUpdated?: () => void;
}

type PlanId = '30' | '60' | '90';
type PayMethod = 'stars' | 'ton';

const PLANS: { id: PlanId; days: number; months: number; stars: number; tonPrice: number; popular: boolean; save?: number }[] = [
  { id: '30', days: 30,  months: 1, stars: 350,  tonPrice: 2.5, popular: false },
  { id: '60', days: 60,  months: 2, stars: 600,  tonPrice: 4,   popular: true, save: 14 },
  { id: '90', days: 90,  months: 3, stars: 900,  tonPrice: 5,   popular: false, save: 14 },
];

export function PaywallOverlay({ daysLeft, expiresAt, onSubscriptionUpdated }: PaywallProps) {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('60');
  const [payMethod, setPayMethod] = useState<PayMethod>('stars');
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)!;

  const handlePurchaseStars = useCallback(async () => {
    hapticFeedback('medium');
    setLoading(true);
    setPaymentStatus(null);

    try {
      const res = await api.createInvoice(selectedPlan);
      console.log('[Paywall] Invoice sent to chat:', res);

      if (res.success && res.sentToChat) {
        hapticSuccess();
        setPaymentStatus('pending');
        // Invoice was sent to bot chat — user needs to open it there
      } else {
        setPaymentStatus('failed');
      }
    } catch (err: any) {
      console.error('[Paywall] Payment error:', err);
      setPaymentStatus('error');
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, onSubscriptionUpdated]);

  const handlePurchaseTON = useCallback(async () => {
    hapticFeedback('medium');
    setLoading(true);
    setPaymentStatus(null);

    try {
      const { invoiceUrl } = await api.createTonInvoice(selectedPlan);
      console.log('[Paywall] TON invoice created:', invoiceUrl);

      // Open the TON payment URL
      window.open(invoiceUrl, '_blank');
      setPaymentStatus('pending');
      // Poll for subscription update
      const poll = setInterval(async () => {
        try {
          const status = await api.getSubscriptionStatus();
          if (status.isActive) {
            clearInterval(poll);
            hapticSuccess();
            setPaymentStatus('success');
            setTimeout(() => onSubscriptionUpdated?.(), 1000);
          }
        } catch {}
      }, 5000);
      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
    } catch (err: any) {
      console.error('[Paywall] TON payment error:', err);
      setPaymentStatus('error');
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, onSubscriptionUpdated]);

  const handlePurchase = payMethod === 'stars' ? handlePurchaseStars : handlePurchaseTON;

  const features = [
    t('pw_feat_1_ru'),
    t('pw_feat_2_ru'),
    t('pw_feat_3_ru'),
    t('pw_feat_4_ru'),
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="min-h-screen px-5 py-8 pb-24 max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-[#6c5ce7]/30 to-[#a29bfe]/10 flex items-center justify-center" style={{ border: '1px solid var(--glass-border)' }}
          >
            <Crown className="w-10 h-10 text-[#a29bfe]" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-foreground mb-2"
            style={{ fontSize: '1.5rem', fontWeight: 700 }}
          >
            Proper Food Premium
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground"
            style={{ fontSize: '0.9375rem' }}
          >
            {t('pw_subtitle')}
          </motion.p>
        </div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-8"
        >
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#a29bfe]" />
              <span className="text-[#a29bfe]" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('pw_whats_included')}
              </span>
            </div>
            <div className="space-y-3">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#6c5ce7]/20 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-[#a29bfe]" />
                  </div>
                  <span className="text-ui-icon-primary" style={{ fontSize: '0.875rem' }}>{f}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Payment method toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="flex gap-2 mb-4"
        >
          <button
            onClick={() => { hapticFeedback('light'); setPayMethod('stars'); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
              payMethod === 'stars'
                ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/40 text-[#a29bfe]'
                : 'bg-ui-button border border-transparent text-muted-foreground'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <Star className="w-4 h-4 fill-current" />
            Stars
          </button>
          <button
            onClick={() => { hapticFeedback('light'); setPayMethod('ton'); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
              payMethod === 'ton'
                ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
                : 'bg-ui-button border border-transparent text-muted-foreground'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <Gem className="w-4 h-4" />
            TON
          </button>
        </motion.div>

        {/* Plans */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3 mb-6"
        >
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const label = plan.months === 1
              ? t('pw_1_month')
              : plan.months === 2
              ? t('pw_2_months')
              : t('pw_3_months');

            const price = payMethod === 'stars' ? plan.stars : plan.tonPrice;
            const priceUnit = payMethod === 'stars' ? 'Stars' : 'TON';
            const perMonth = payMethod === 'stars'
              ? Math.round(plan.stars / plan.months)
              : +(plan.tonPrice / plan.months).toFixed(1);

            return (
              <button
                key={plan.id}
                onClick={() => {
                  hapticFeedback('light');
                  setSelectedPlan(plan.id);
                }}
                className={`w-full relative rounded-2xl p-4 pl-12 text-left transition-all duration-200 ${
                  isSelected
                    ? payMethod === 'stars'
                      ? 'bg-[#6c5ce7]/20 border-2 border-[#6c5ce7]'
                      : 'bg-blue-500/20 border-2 border-blue-500'
                    : 'bg-ui-button border-2 border-transparent'
                }`}
              >
                {plan.popular && (
                  <div className={`absolute -top-2.5 right-4 px-3 py-0.5 rounded-full ${
                    payMethod === 'stars' ? 'bg-[#6c5ce7]' : 'bg-blue-500'
                  }`}>
                    <span className="text-white" style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                      {t('pw_popular')}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground" style={{ fontSize: '1rem', fontWeight: 600 }}>{label}</span>
                      {plan.save && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                          -{plan.save}%
                        </span>
                      )}
                    </div>
                    <span className="text-ui-secondary" style={{ fontSize: '0.8125rem' }}>
                      {plan.months > 1
                        ? `~${perMonth} ${priceUnit}/${t('pw_per_month')}`
                        : `${price} ${priceUnit}`
                      }
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {payMethod === 'stars' ? (
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <Gem className="w-4 h-4 text-blue-400" />
                    )}
                    <span className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                      {price}
                    </span>
                  </div>
                </div>

                {/* Selection indicator */}
                <div className={`absolute top-1/2 -translate-y-1/2 left-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? payMethod === 'stars' ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-blue-500 bg-blue-500'
                    : 'border-ui-input'
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
          <span className="text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
            {payMethod === 'stars'
              ? `≈ $${selectedPlanData.months === 1 ? '6' : selectedPlanData.months === 2 ? '10' : '15'}`
              : `${selectedPlanData.tonPrice} TON`
            }
            {' · '}
            {selectedPlanData.days} {t('shared_days_unit')}
          </span>
        </motion.div>

        {/* Payment Status */}
        <AnimatePresence>
          {paymentStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center"
            >
              <Check className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <span className="text-green-400" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                {t('pw_payment_success')}
              </span>
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
                {t('pw_invoice_sent')}
              </span>
              <p className="text-muted-foreground mt-1" style={{ fontSize: '0.75rem' }}>
                {t('pw_open_chat_desc')}
              </p>
              <button
                onClick={() => { try { closeMiniApp(); } catch { window.close(); } }}
                className="mt-3 px-5 py-2 rounded-xl bg-green-500/20 text-green-400"
                style={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                {t('pw_go_to_chat')}
              </button>
            </motion.div>
          )}
          {(paymentStatus === 'failed' || paymentStatus === 'error') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center"
            >
              <span className="text-red-400" style={{ fontSize: '0.875rem' }}>
                {t('pw_payment_failed')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buy Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={handlePurchase}
          disabled={loading}
          className={`w-full py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform ${
            payMethod === 'stars'
              ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
              : 'bg-gradient-to-r from-blue-600 to-blue-400'
          }`}
          style={{ fontSize: '1rem' }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : payMethod === 'stars' ? (
            <>
              <Star className="w-5 h-5 fill-white" />
              {t('pw_pay_stars', { n: selectedPlanData.stars })}
            </>
          ) : (
            <>
              <Gem className="w-5 h-5" />
              {t('pw_pay_ton', { n: selectedPlanData.tonPrice })}
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
            onClick={() => {
              hapticFeedback('light');
              navigate('/bonuses');
            }}
            className="text-[#a29bfe] flex items-center justify-center gap-1.5 mx-auto"
            style={{ fontSize: '0.875rem' }}
          >
            <Gift className="w-4 h-4" />
            {t('pw_free_days')}
          </button>
        </motion.div>

        {/* Security note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 flex items-center justify-center gap-2 text-ui-tertiary"
          style={{ fontSize: '0.75rem' }}
        >
          <Shield className="w-3.5 h-3.5" />
          {t('pw_secure')}
        </motion.div>
      </div>
    </motion.div>
  );
}
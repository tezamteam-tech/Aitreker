// =============================================
// Proper Food AI — Wallet Page (/wallet)
// =============================================
// Full wallet: balance top-up (Stars & TON),
// subscription purchase from balance or direct,
// payment history.
//
// Stars payments: native in-app via openInvoice()
//   (with fallback to bot chat for older TG clients)
// TON top-up: sends wallet address + instructions to bot chat
// Subscription: from balance OR direct Stars via openInvoice()
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet,
  Star,
  ArrowUpCircle,
  ArrowDownCircle,
  Crown,
  Clock,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Gift,
  CreditCard,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { openInvoice, isInvoiceSupported, hapticFeedback, hapticSuccess, hapticError, openTelegramLink } from './telegram';
import { useTranslation } from './i18n';
import { BOT_USERNAME } from './bot-config';
import { PageHeader } from './page-header';

// ---- Types & Constants ----

type PlanId = '30' | '60' | '90';
type TabId = 'topup' | 'subscribe';
type TopupCurrency = 'stars' | 'ton';

const TOPUP_AMOUNTS = [50, 100, 250, 500, 1000];

const SUB_PLANS: { id: PlanId; days: number; label_key: string; stars: number; save?: number }[] = [
  { id: '30', days: 30, label_key: 'wl_1_month', stars: 350 },
  { id: '60', days: 60, label_key: 'wl_2_months', stars: 600, save: 14 },
  { id: '90', days: 90, label_key: 'wl_3_months', stars: 900, save: 14 },
];

// ---- Helper: "Sent to chat" card (fallback) ----

function SentToChatCard({ type, onReset }: { type: 'topup' | 'subscription'; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
        <Send className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-green-400" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
        {t('wl_sent_to_chat')}
      </p>
      <p className="text-muted-foreground mt-1.5" style={{ fontSize: '0.75rem' }}>
        {type === 'topup' ? t('wl_topup_chat_hint') : t('wl_subscription_chat_hint')}
      </p>
      <button
        onClick={() => openTelegramLink(`https://t.me/${BOT_USERNAME}`)}
        className="mt-3 px-5 py-2 rounded-xl bg-green-500/20 text-green-400"
        style={{ fontSize: '0.8125rem', fontWeight: 600 }}
      >
        {t('wl_go_to_chat')}
      </button>
      <button
        onClick={onReset}
        className="block mx-auto mt-2 text-muted-foreground"
        style={{ fontSize: '0.75rem' }}
      >
        OK
      </button>
    </motion.div>
  );
}

// ---- Helper: "Payment Successful" card (native) ----

function PaymentSuccessCard({ message, hint, onReset }: { message: string; hint: string; onReset: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-green-400" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{message}</p>
      <p className="text-muted-foreground mt-1.5" style={{ fontSize: '0.75rem' }}>{hint}</p>
      <button
        onClick={onReset}
        className="mt-3 px-6 py-2.5 rounded-xl bg-green-500/20 text-green-400"
        style={{ fontSize: '0.8125rem', fontWeight: 600 }}
      >
        OK
      </button>
    </motion.div>
  );
}

// ---- Main Component ----

export function WalletPage() {
  const navigate = useNavigate();
  const { user, subscriptionActive, subscriptionDaysLeft, refreshSubscription } = useAuth();
  const { t } = useTranslation();

  // Wallet data
  const [walletData, setWalletData] = useState<{
    starsBalance: number;
    tonBalance: number;
    starsReserved: number;
    tonReserved: number;
  } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);

  // Top-up state
  const [activeTab, setActiveTab] = useState<TabId>('topup');
  const [topupCurrency, setTopupCurrency] = useState<TopupCurrency>('stars');
  const [topupAmount, setTopupAmount] = useState<number>(100);
  const [customTopupAmount, setCustomTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupStatus, setTopupStatus] = useState<'sent' | 'paid' | 'failed' | null>(null);

  // Subscription state
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('60');
  const [payMethod, setPayMethod] = useState<'balance_stars' | 'balance_ton' | 'direct_stars'>('direct_stars');
  const [subLoading, setSubLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<'sent' | 'paid' | 'activated' | 'failed' | null>(null);

  // History expansion
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Computed
  const effectiveTopupAmount = customTopupAmount ? parseInt(customTopupAmount) || 0 : topupAmount;
  const plan = SUB_PLANS.find(p => p.id === selectedPlan)!;
  const starsBalance = walletData?.starsBalance ?? 0;
  const tonBalance = walletData?.tonBalance ?? 0;
  const starsReserved = walletData?.starsReserved ?? 0;
  const tonReserved = walletData?.tonReserved ?? 0;
  const starsAvailable = Math.max(0, starsBalance - starsReserved);
  const tonAvailable = Math.max(0, tonBalance - tonReserved);
  const canPayFromStars = starsAvailable >= plan.stars;

  // ---- Load wallet data ----
  useEffect(() => {
    if (!user) return;
    setWalletLoading(true);
    Promise.all([api.getWallet(), api.getTransactions()])
      .then(([w, txRes]) => {
        setWalletData(w);
        setTransactions(txRes.transactions || []);
      })
      .catch(err => console.error('[Wallet] Load error:', err))
      .finally(() => setWalletLoading(false));
  }, [user]);

  // Refresh wallet data
  const refreshWallet = useCallback(async () => {
    try {
      const [w, txRes] = await Promise.all([api.getWallet(), api.getTransactions()]);
      setWalletData(w);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      console.error('[Wallet] Refresh error:', err);
    }
  }, []);

  // =======================================
  //  STARS TOP-UP — native openInvoice()
  // =======================================
  const handleTopupStars = useCallback(async () => {
    const amount = effectiveTopupAmount;
    if (!amount || amount < 1) return;
    hapticFeedback('medium');
    setTopupLoading(true);
    setTopupStatus(null);

    try {
      // 1. Get invoice link from backend (uses Bot API createInvoiceLink with currency: 'XTR')
      const res = await api.topupStarsLink(amount);
      console.log('[Wallet] topupStarsLink response:', res);

      if (!res.success || !res.invoiceLink) {
        throw new Error('Failed to create invoice link');
      }

      // 2. Try native openInvoice — opens Telegram payment bottom sheet
      if (isInvoiceSupported()) {
        const status = await openInvoice(res.invoiceLink);
        console.log('[Wallet] openInvoice status:', status);

        if (status === 'paid') {
          hapticSuccess();
          setTopupStatus('paid');
          // Refresh wallet after short delay (webhook credits balance)
          setTimeout(() => refreshWallet(), 1500);
        } else if (status === 'cancelled') {
          // User cancelled — just reset
          setTopupStatus(null);
        } else {
          hapticError();
          setTopupStatus('failed');
        }
      } else {
        // 3. Fallback: send invoice to bot chat (older TG clients)
        console.log('[Wallet] openInvoice not supported, falling back to chat invoice');
        const fallbackRes = await api.topupStars(amount);
        if (fallbackRes.success) {
          hapticSuccess();
          setTopupStatus('sent');
        } else {
          hapticError();
          setTopupStatus('failed');
        }
      }
    } catch (err) {
      console.error('[Wallet] Stars top-up error:', err);
      hapticError();
      setTopupStatus('failed');
    } finally {
      setTopupLoading(false);
    }
  }, [effectiveTopupAmount, refreshWallet]);

  // ---- TON top-up (sends to chat) ----
  const handleTopupTon = useCallback(async () => {
    const amount = effectiveTopupAmount;
    if (!amount || amount < 1) return;
    hapticFeedback('medium');
    setTopupLoading(true);
    setTopupStatus(null);

    try {
      const res = await api.topupTon(amount);
      if (res.success) {
        hapticSuccess();
        setTopupStatus('sent');
      } else {
        hapticError();
        setTopupStatus('failed');
      }
    } catch (err) {
      console.error('[Wallet] TON top-up error:', err);
      hapticError();
      setTopupStatus('failed');
    } finally {
      setTopupLoading(false);
    }
  }, [effectiveTopupAmount]);

  // =======================================
  //  DIRECT STARS PURCHASE (subscription)
  //  — native openInvoice()
  // =======================================
  const handleDirectPurchaseStars = useCallback(async () => {
    hapticFeedback('medium');
    setSubLoading(true);
    setSubStatus(null);

    try {
      // 1. Get invoice link from backend
      const res = await api.createInvoiceLink(selectedPlan);
      console.log('[Wallet] createInvoiceLink response:', res);

      if (!res.success || !res.invoiceLink) {
        throw new Error('Failed to create subscription invoice link');
      }

      // 2. Try native openInvoice
      if (isInvoiceSupported()) {
        const status = await openInvoice(res.invoiceLink);
        console.log('[Wallet] subscription openInvoice status:', status);

        if (status === 'paid') {
          hapticSuccess();
          setSubStatus('paid');
          // Activate subscription as safety net (webhook may have already done it)
          try {
            await api.activateSubscription(selectedPlan, res.stars);
          } catch (activateErr) {
            console.warn('[Wallet] activateSubscription fallback error:', activateErr);
          }
          // Refresh auth
          await refreshSubscription();
          setTimeout(() => refreshWallet(), 1000);
        } else if (status === 'cancelled') {
          setSubStatus(null);
        } else {
          hapticError();
          setSubStatus('failed');
        }
      } else {
        // 3. Fallback: send invoice to chat
        console.log('[Wallet] openInvoice not supported, falling back to chat invoice');
        const fallbackRes = await api.createInvoice(selectedPlan);
        if (fallbackRes.success) {
          hapticSuccess();
          setSubStatus('sent');
        } else {
          hapticError();
          setSubStatus('failed');
        }
      }
    } catch (err) {
      console.error('[Wallet] Direct Stars purchase error:', err);
      hapticError();
      setSubStatus('failed');
    } finally {
      setSubLoading(false);
    }
  }, [selectedPlan, refreshSubscription, refreshWallet]);

  // ---- Pay subscription from balance ----
  const handlePayFromBalance = useCallback(async () => {
    hapticFeedback('medium');
    setSubLoading(true);
    setSubStatus(null);

    const currency = payMethod === 'balance_ton' ? 'ton' : 'stars';
    try {
      const res = await api.paySubscriptionFromBalance(selectedPlan, currency);
      if (res.success) {
        hapticSuccess();
        setSubStatus('activated');
        await refreshSubscription();
        await refreshWallet();
      } else {
        hapticError();
        setSubStatus('failed');
      }
    } catch (err) {
      console.error('[Wallet] Pay from balance error:', err);
      hapticError();
      setSubStatus('failed');
    } finally {
      setSubLoading(false);
    }
  }, [selectedPlan, payMethod, refreshSubscription, refreshWallet]);

  // ---- Subscription purchase dispatcher ----
  const handleSubscribe = useCallback(() => {
    if (payMethod === 'direct_stars') {
      handleDirectPurchaseStars();
    } else {
      handlePayFromBalance();
    }
  }, [payMethod, handleDirectPurchaseStars, handlePayFromBalance]);

  // ---- Render ----

  if (walletLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-28">
      <PageHeader title={t('wl_title')} onBack={() => navigate(-1)} />

      {/* ---- Balance Card ---- */}
      <GlassCard className="mx-4 mb-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-foreground font-semibold" style={{ fontSize: '1rem' }}>
                {starsBalance} <Star className="w-3.5 h-3.5 inline text-amber-400 fill-amber-400" />
              </p>
              {starsReserved > 0 && (
                <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                  {starsReserved} {t('wl_reserved')} &middot; {starsAvailable} {t('wl_available')}
                </p>
              )}
            </div>
          </div>

          {/* Subscription badge */}
          <div className="text-right">
            {subscriptionActive ? (
              <div className="flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-green-400 font-semibold" style={{ fontSize: '0.75rem' }}>{t('wl_premium_active')}</p>
                  <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                    {t('wl_days_left', { days: subscriptionDaysLeft })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{t('wl_free_plan')}</p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ---- Tab Switcher ---- */}
      <div className="flex gap-2 mx-4 mb-4">
        {(['topup', 'subscribe'] as TabId[]).map(tab => (
          <button
            key={tab}
            onClick={() => { hapticFeedback('light'); setActiveTab(tab); }}
            className={`flex-1 py-2.5 rounded-xl font-semibold transition-all ${
              activeTab === tab
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                : 'bg-[var(--glass-bg)] text-muted-foreground border border-[var(--glass-border)]'
            }`}
            style={{ fontSize: '0.8125rem' }}
          >
            {tab === 'topup' ? t('wl_top_up') : subscriptionActive ? t('wl_extend') : t('wl_subscribe')}
          </button>
        ))}
      </div>

      {/* =============================== */}
      {/*  TAB: TOP UP                    */}
      {/* =============================== */}
      <AnimatePresence mode="wait">
        {activeTab === 'topup' && (
          <motion.div
            key="topup"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="mx-4"
          >
            <p className="text-muted-foreground font-semibold tracking-wider mb-3" style={{ fontSize: '0.6875rem' }}>
              {t('wl_top_up_balance')}
            </p>

            {/* Success/Failure cards */}
            {topupStatus === 'paid' ? (
              <PaymentSuccessCard
                message={t('wl_topup_success')}
                hint={t('wl_topup_success_hint')}
                onReset={() => { setTopupStatus(null); setCustomTopupAmount(''); refreshWallet(); }}
              />
            ) : topupStatus === 'sent' ? (
              <SentToChatCard type="topup" onReset={() => { setTopupStatus(null); setCustomTopupAmount(''); }} />
            ) : topupStatus === 'failed' ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center"
              >
                <p className="text-red-400" style={{ fontSize: '0.8125rem' }}>{t('wl_error')}</p>
                <button onClick={() => setTopupStatus(null)} className="mt-2 text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                  OK
                </button>
              </motion.div>
            ) : (
              <>
                {/* Currency selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => { hapticFeedback('light'); setTopupCurrency('stars'); }}
                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      topupCurrency === 'stars'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-[var(--glass-bg)] text-muted-foreground border border-[var(--glass-border)]'
                    }`}
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    <Star className="w-4 h-4 fill-current" /> Stars
                  </button>
                  <button
                    onClick={() => { hapticFeedback('light'); setTopupCurrency('ton'); }}
                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      topupCurrency === 'ton'
                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        : 'bg-[var(--glass-bg)] text-muted-foreground border border-[var(--glass-border)]'
                    }`}
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    <CreditCard className="w-4 h-4" /> TON
                  </button>
                </div>

                {/* Amount presets */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {TOPUP_AMOUNTS.map(a => (
                    <button
                      key={a}
                      onClick={() => { hapticFeedback('light'); setTopupAmount(a); setCustomTopupAmount(''); }}
                      className={`px-3.5 py-2 rounded-lg transition-all ${
                        !customTopupAmount && topupAmount === a
                          ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 font-semibold'
                          : 'bg-[var(--glass-bg)] text-muted-foreground border border-[var(--glass-border)]'
                      }`}
                      style={{ fontSize: '0.8125rem' }}
                    >
                      {a} {topupCurrency === 'stars' ? '★' : 'TON'}
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={t('wl_custom_amount')}
                  value={customTopupAmount}
                  onChange={e => setCustomTopupAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-foreground placeholder:text-muted-foreground mb-3"
                  style={{ fontSize: '0.875rem' }}
                />

                {/* Top-up button */}
                <button
                  onClick={topupCurrency === 'stars' ? handleTopupStars : handleTopupTon}
                  disabled={topupLoading || effectiveTopupAmount < 1}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ fontSize: '0.875rem' }}
                >
                  {topupLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : topupCurrency === 'stars' ? (
                    <>
                      <Star className="w-4 h-4 fill-white" />
                      {t('wl_pay_stars', { amount: effectiveTopupAmount })}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {t('wl_get_details', { amount: effectiveTopupAmount })}
                    </>
                  )}
                </button>

                {/* Hint */}
                <p className="text-center text-muted-foreground mt-2" style={{ fontSize: '0.6875rem' }}>
                  <Shield className="w-3 h-3 inline mr-1" />
                  {topupCurrency === 'stars' ? t('wl_stars_native_hint') : t('wl_details_chat')}
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* =============================== */}
        {/*  TAB: SUBSCRIBE                 */}
        {/* =============================== */}
        {activeTab === 'subscribe' && (
          <motion.div
            key="subscribe"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-4"
          >
            <p className="text-muted-foreground font-semibold tracking-wider mb-3" style={{ fontSize: '0.6875rem' }}>
              {subscriptionActive ? t('wl_extend_subscription') : t('wl_buy_subscription')}
            </p>

            {/* Success/Failure cards */}
            {subStatus === 'paid' ? (
              <PaymentSuccessCard
                message={t('wl_subscription_activated')}
                hint={t('wl_topup_success_hint')}
                onReset={() => { setSubStatus(null); refreshWallet(); }}
              />
            ) : subStatus === 'activated' ? (
              <PaymentSuccessCard
                message={t('wl_subscription_activated')}
                hint=""
                onReset={() => setSubStatus(null)}
              />
            ) : subStatus === 'sent' ? (
              <SentToChatCard type="subscription" onReset={() => setSubStatus(null)} />
            ) : subStatus === 'failed' ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center"
              >
                <p className="text-red-400" style={{ fontSize: '0.8125rem' }}>{t('wl_error')}</p>
                <button onClick={() => setSubStatus(null)} className="mt-2 text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                  OK
                </button>
              </motion.div>
            ) : (
              <>
                {/* Plan selection */}
                <div className="flex gap-2 mb-4">
                  {SUB_PLANS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { hapticFeedback('light'); setSelectedPlan(p.id); }}
                      className={`flex-1 py-3 rounded-xl relative transition-all ${
                        selectedPlan === p.id
                          ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-2 border-[var(--color-primary)]/40'
                          : 'bg-[var(--glass-bg)] text-muted-foreground border border-[var(--glass-border)]'
                      }`}
                    >
                      <p className="font-bold" style={{ fontSize: '0.875rem' }}>{t(p.label_key)}</p>
                      <p className="font-semibold" style={{ fontSize: '0.75rem' }}>{p.stars} ★</p>
                      {p.save && (
                        <span className="absolute -top-2 right-1 bg-green-500 text-white px-1.5 py-0.5 rounded-full" style={{ fontSize: '0.5625rem', fontWeight: 700 }}>
                          -{p.save}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Payment method */}
                <p className="text-muted-foreground font-semibold tracking-wider mb-2" style={{ fontSize: '0.6875rem' }}>
                  {t('wl_payment_method')}
                </p>

                <div className="space-y-2 mb-4">
                  {/* Direct Stars (native) */}
                  <button
                    onClick={() => { hapticFeedback('light'); setPayMethod('direct_stars'); }}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                      payMethod === 'direct_stars'
                        ? 'bg-amber-500/10 border-2 border-amber-500/30'
                        : 'bg-[var(--glass-bg)] border border-[var(--glass-border)]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      payMethod === 'direct_stars' ? 'border-amber-400' : 'border-muted-foreground'
                    }`}>
                      {payMethod === 'direct_stars' && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                    </div>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <div className="text-left flex-1">
                      <p className="text-foreground font-medium" style={{ fontSize: '0.8125rem' }}>
                        {t('wl_pay_stars', { amount: plan.stars })}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                        {t('wl_stars_native_hint')}
                      </p>
                    </div>
                  </button>

                  {/* From Stars balance */}
                  <button
                    onClick={() => { hapticFeedback('light'); setPayMethod('balance_stars'); }}
                    disabled={!canPayFromStars}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                      payMethod === 'balance_stars'
                        ? 'bg-amber-500/10 border-2 border-amber-500/30'
                        : 'bg-[var(--glass-bg)] border border-[var(--glass-border)]'
                    } ${!canPayFromStars ? 'opacity-50' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      payMethod === 'balance_stars' ? 'border-amber-400' : 'border-muted-foreground'
                    }`}>
                      {payMethod === 'balance_stars' && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                    </div>
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <div className="text-left flex-1">
                      <p className="text-foreground font-medium" style={{ fontSize: '0.8125rem' }}>
                        {t('wl_from_balance', { price: plan.stars, unit: '★' })}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                        {canPayFromStars ? t('wl_enough') : t('wl_insufficient_balance')} &middot; {starsAvailable} ★
                      </p>
                    </div>
                  </button>
                </div>

                {/* Subscribe button */}
                <button
                  onClick={handleSubscribe}
                  disabled={subLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ fontSize: '0.9375rem', boxShadow: '0 4px 24px rgba(108, 92, 231, 0.4)' }}
                >
                  {subLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Crown className="w-5 h-5 fill-white/50" />
                      {payMethod === 'direct_stars'
                        ? t('wl_pay_stars', { amount: plan.stars })
                        : t('wl_from_balance', { price: plan.stars, unit: '★' })
                      }
                    </>
                  )}
                </button>

                {/* Bonuses link */}
                <div className="text-center mt-3">
                  <button
                    onClick={() => { hapticFeedback('light'); navigate('/bonuses'); }}
                    className="text-[var(--color-primary)] flex items-center justify-center gap-1.5 mx-auto"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    <Gift className="w-4 h-4" />
                    {t('wl_bonuses_referrals')}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Transaction History ---- */}
      {transactions.length > 0 && (
        <div className="mx-4 mt-6">
          <button
            onClick={() => { hapticFeedback('light'); setHistoryExpanded(!historyExpanded); }}
            className="flex items-center justify-between w-full mb-3"
          >
            <p className="text-muted-foreground font-semibold tracking-wider" style={{ fontSize: '0.6875rem' }}>
              {t('wl_transaction_history')}
            </p>
            {historyExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          <AnimatePresence>
            {historyExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-2"
              >
                {transactions.slice(0, 20).map((tx: any, i: number) => {
                  const isCredit = tx.type === 'topup' || tx.type === 'deposit_return' || tx.type === 'pool_bonus' || tx.type === 'referral_bonus';
                  return (
                    <GlassCard key={tx.id || i} className="p-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isCredit ? 'bg-green-500/15' : 'bg-red-500/15'
                      }`}>
                        {isCredit ? (
                          <ArrowDownCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <ArrowUpCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-medium truncate" style={{ fontSize: '0.8125rem' }}>
                          {tx.description || (isCredit ? t('wl_topup_label') : t('wl_payment_label'))}
                        </p>
                        <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <p className={`font-semibold ${isCredit ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: '0.875rem' }}>
                        {isCredit ? '+' : '-'}{tx.amount} {tx.currency === 'ton' ? 'TON' : '★'}
                      </p>
                    </GlassCard>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

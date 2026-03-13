// =============================================
// BECOME — Wallet Page (/wallet)
// =============================================
// Full wallet: balance top-up (Stars & TON),
// subscription purchase from balance or direct,
// payment history.
//
// Stars top-up: sends invoice to bot chat (user pays there)
// TON top-up: sends wallet address + instructions to bot chat
// Subscription: from balance OR direct Stars invoice to chat
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  Gem,
  Crown,
  Check,
  ChevronRight,
  Loader2,
  Receipt,
  Shield,
  Gift,
  Plus,
  ArrowDownToLine,
  CreditCard,
  X,
  MessageCircle,
  Send,
  Lock,
  Snowflake,
  Undo2,
  AlertTriangle,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, closeMiniApp } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { AnimatedCounter } from './animated-counter';

interface PaymentRecord {
  id: string;
  currency: string;
  amount: number;
  daysAdded: number;
  createdAt: string;
  payload?: string;
  type?: string;
}

interface TransactionRecord {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  challengeId?: string;
  challengeTitle?: string;
  description?: string;
  createdAt: string;
}

type PlanId = '30' | '60' | '90';
type WalletTab = 'overview' | 'topup' | 'subscribe';
type HistoryFilter = 'all' | 'payments' | 'deposits';

const PLANS: { id: PlanId; days: number; months: number; stars: number; tonPrice: number; save?: number }[] = [
  { id: '30', days: 30, months: 1, stars: 350, tonPrice: 2.5 },
  { id: '60', days: 60, months: 2, stars: 600, tonPrice: 4, save: 14 },
  { id: '90', days: 90, months: 3, stars: 900, tonPrice: 5, save: 14 },
];

const TOPUP_STAR_AMOUNTS = [50, 100, 200, 350, 500, 1000];
const TOPUP_TON_AMOUNTS = [0.5, 1, 2.5, 5, 10];

export function WalletPage() {
  const { user, subscriptionActive, subscriptionDaysLeft, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  const [wallet, setWallet] = useState({ starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 });
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  const [activeTab, setActiveTab] = useState<WalletTab>('overview');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  // Top-up
  const [topupCurrency, setTopupCurrency] = useState<'stars' | 'ton'>('stars');
  const [topupAmount, setTopupAmount] = useState<number>(100);
  const [customTopupAmount, setCustomTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupStatus, setTopupStatus] = useState<'sent' | 'failed' | null>(null);

  // Subscribe from balance
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('60');
  const [payMethod, setPayMethod] = useState<'stars' | 'ton'>('stars');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)!;
  const canAffordStars = wallet.starsBalance >= selectedPlanData.stars;
  const canAffordTon = wallet.tonBalance >= selectedPlanData.tonPrice;

  useEffect(() => {
    Promise.all([
      api.getWallet(),
      api.getPaymentHistory(),
      api.getTransactions(),
    ]).then(([w, ph, tx]) => {
      setWallet(w);
      setPayments(ph.payments || []);
      setTransactions(tx.transactions || []);
    }).catch(err => {
      console.error('[Wallet] Error loading:', err);
    }).finally(() => {
      setLoadingPayments(false);
    });
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      const [w, ph, tx] = await Promise.all([api.getWallet(), api.getPaymentHistory(), api.getTransactions()]);
      setWallet(w);
      setPayments(ph.payments || []);
      setTransactions(tx.transactions || []);
    } catch {}
  }, []);

  // ---- Compute effective amount ----
  const getEffectiveAmount = () => {
    if (customTopupAmount) {
      return topupCurrency === 'stars'
        ? parseInt(customTopupAmount) || 0
        : parseFloat(customTopupAmount) || 0;
    }
    return topupAmount;
  };

  // ---- Top-up Stars: send invoice to bot chat ----
  const handleTopupStars = useCallback(async () => {
    const amount = getEffectiveAmount();
    if (!amount || amount < 1) return;

    hapticFeedback('medium');
    setTopupLoading(true);
    setTopupStatus(null);

    try {
      const res = await api.topupStars(amount);
      if (res.success && res.sentToChat) {
        hapticSuccess();
        setTopupStatus('sent');
      } else {
        setTopupStatus('failed');
      }
    } catch (err) {
      console.error('[Wallet] Stars topup error:', err);
      setTopupStatus('failed');
    } finally {
      setTopupLoading(false);
    }
  }, [topupAmount, customTopupAmount]);

  // ---- Top-up TON: send address + instructions to bot chat ----
  const handleTopupTon = useCallback(async () => {
    const amount = getEffectiveAmount();
    if (!amount || amount <= 0) return;

    hapticFeedback('medium');
    setTopupLoading(true);
    setTopupStatus(null);

    try {
      const res = await api.topupTon(amount);
      if (res.success && res.sentToChat) {
        hapticSuccess();
        setTopupStatus('sent');
      } else {
        setTopupStatus('failed');
      }
    } catch (err) {
      console.error('[Wallet] TON topup error:', err);
      setTopupStatus('failed');
    } finally {
      setTopupLoading(false);
    }
  }, [topupAmount, customTopupAmount]);

  // ---- Direct Stars payment for subscription (sends invoice to chat) ----
  const handleDirectPurchaseStars = useCallback(async () => {
    hapticFeedback('medium');
    setPurchasing(true);
    setPurchaseStatus(null);

    try {
      const res = await api.createInvoice(selectedPlan);
      if (res.success && res.sentToChat) {
        hapticSuccess();
        setPurchaseStatus('sent');
      } else {
        setPurchaseStatus('failed');
      }
    } catch (err) {
      console.error('[Wallet] Direct Stars purchase error:', err);
      setPurchaseStatus('failed');
    } finally {
      setPurchasing(false);
    }
  }, [selectedPlan]);

  // ---- Pay subscription from internal balance ----
  const handlePayFromBalance = useCallback(async () => {
    hapticFeedback('medium');
    setPurchasing(true);
    setPurchaseStatus(null);

    try {
      const res = await api.paySubscriptionFromBalance(selectedPlan, payMethod);
      if (res.success) {
        hapticSuccess();
        setPurchaseStatus('success');
        await refreshSubscription();
        await refreshWallet();
        setTimeout(() => {
          setPurchaseStatus(null);
          setActiveTab('overview');
        }, 2500);
      }
    } catch (err: any) {
      console.error('[Wallet] Balance payment error:', err);
      if (err?.code === 'INSUFFICIENT_BALANCE') {
        setPurchaseStatus('insufficient');
      } else {
        setPurchaseStatus('failed');
      }
    } finally {
      setPurchasing(false);
    }
  }, [selectedPlan, payMethod, refreshSubscription, refreshWallet]);

  // ---- Helpers ----
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const formatCurrency = (currency: string, amount: number) => {
    if (currency === 'XTR') return `${amount} Stars`;
    if (currency === 'TON') return `${amount} TON`;
    if (currency === 'stars') return `${amount} Stars`;
    if (currency === 'ton') return `${amount} TON`;
    return `${amount} ${currency}`;
  };

  const getTxMeta = (txType: string, t: (key: string) => string) => {
    switch (txType) {
      case 'deposit_freeze':
        return {
          label: t('tx_deposit_freeze'),
          sign: '-' as const,
          iconBg: 'bg-cyan-500/15',
          iconColor: 'text-cyan-400',
          icon: <Snowflake className="w-4 h-4" />,
          amountColor: 'text-cyan-400',
        };
      case 'deposit_return':
        return {
          label: t('tx_deposit_return'),
          sign: '+' as const,
          iconBg: 'bg-green-500/15',
          iconColor: 'text-green-400',
          icon: <Undo2 className="w-4 h-4" />,
          amountColor: 'text-green-400',
        };
      case 'deposit_penalty':
        return {
          label: t('tx_deposit_penalty'),
          sign: '-' as const,
          iconBg: 'bg-red-500/15',
          iconColor: 'text-red-400',
          icon: <AlertTriangle className="w-4 h-4" />,
          amountColor: 'text-red-400',
        };
      case 'pool_bonus':
        return {
          label: t('tx_pool_bonus'),
          sign: '+' as const,
          iconBg: 'bg-amber-500/15',
          iconColor: 'text-amber-400',
          icon: <TrendingUp className="w-4 h-4" />,
          amountColor: 'text-amber-400',
        };
      case 'leave_penalty':
        return {
          label: t('tx_leave_penalty'),
          sign: '-' as const,
          iconBg: 'bg-orange-500/15',
          iconColor: 'text-orange-400',
          icon: <LogOut className="w-4 h-4" />,
          amountColor: 'text-orange-400',
        };
      default:
        return {
          label: txType,
          sign: '' as const,
          iconBg: 'bg-white/10',
          iconColor: 'text-white/40',
          icon: <Receipt className="w-4 h-4" />,
          amountColor: 'text-white/40',
        };
    }
  };

  const formatPaymentLabel = (p: PaymentRecord) => {
    if (p.type === 'topup' || p.payload?.startsWith('topup_')) {
      return lang === 'ru' ? 'Пополнение' : 'Top-up';
    }
    if (p.daysAdded > 0) {
      return `+${p.daysAdded} ${lang === 'ru' ? 'дней' : 'days'}`;
    }
    return lang === 'ru' ? 'Платёж' : 'Payment';
  };

  // ---- "Sent to chat" card ----
  const SentToChatCard = ({ onReset, type }: { onReset: () => void; type: 'topup' | 'subscription' }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
        <Send className="w-5 h-5 text-green-400" />
      </div>
      <p className="text-green-400" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
        {lang === 'ru' ? 'Отправлено в чат!' : 'Sent to chat!'}
      </p>
      <p className="text-white/40 mt-1.5" style={{ fontSize: '0.75rem' }}>
        {type === 'topup'
          ? (lang === 'ru'
            ? 'Откройте чат с ботом для оплаты. После оплаты баланс обновится автоматически.'
            : 'Open the bot chat to pay. Your balance will update automatically after payment.')
          : (lang === 'ru'
            ? 'Откройте чат с ботом для оплаты. Подписка активируется автоматически.'
            : 'Open the bot chat to pay. Subscription will activate automatically.')}
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            // Try to close mini app so user goes to bot chat
            try { closeMiniApp(); } catch { window.close(); }
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/20 text-green-400"
          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
        >
          <MessageCircle className="w-4 h-4" />
          {lang === 'ru' ? 'Перейти в чат' : 'Go to chat'}
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/40"
          style={{ fontSize: '0.8125rem' }}
        >
          OK
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-yellow-500/8 blur-[120px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader title={lang === 'ru' ? 'Кошелёк' : 'Wallet'} />

        {/* Balances */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 mb-5"
        >
          <GlassCard padding="md" className="relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-yellow-400/10 blur-[20px] pointer-events-none" />
            <div className="flex items-center gap-2 mb-1.5">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>Stars</span>
            </div>
            <AnimatedCounter
              value={wallet.starsBalance}
              style={{ fontSize: '1.75rem', fontWeight: 700 }}
              glowColor="rgba(250,204,21,0.3)"
            />
            {(wallet.starsReserved || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <Lock className="w-3 h-3 text-yellow-400/40" />
                <span className="text-yellow-400/40" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                  {wallet.starsReserved} {lang === 'ru' ? 'в резерве' : 'reserved'}
                </span>
              </div>
            )}
            {(wallet.starsReserved || 0) > 0 && (
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.625rem' }}>
                {lang === 'ru' ? 'Доступно' : 'Available'}: {wallet.starsBalance - (wallet.starsReserved || 0)}
              </p>
            )}
          </GlassCard>

          <GlassCard padding="md" className="relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-blue-400/10 blur-[20px] pointer-events-none" />
            <div className="flex items-center gap-2 mb-1.5">
              <Gem className="w-4 h-4 text-blue-400" />
              <span className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>TON</span>
            </div>
            <AnimatedCounter
              value={wallet.tonBalance}
              style={{ fontSize: '1.75rem', fontWeight: 700 }}
              glowColor="rgba(96,165,250,0.3)"
            />
            {(wallet.tonReserved || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <Lock className="w-3 h-3 text-blue-400/40" />
                <span className="text-blue-400/40" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                  {wallet.tonReserved} {lang === 'ru' ? 'в резерве' : 'reserved'}
                </span>
              </div>
            )}
            {(wallet.tonReserved || 0) > 0 && (
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.625rem' }}>
                {lang === 'ru' ? 'Доступно' : 'Available'}: {(wallet.tonBalance - (wallet.tonReserved || 0)).toFixed(1)}
              </p>
            )}
          </GlassCard>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2.5 mb-6"
        >
          <button
            onClick={() => { hapticFeedback('medium'); setTopupStatus(null); setActiveTab(activeTab === 'topup' ? 'overview' : 'topup'); }}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
              activeTab === 'topup'
                ? 'bg-[#6c5ce7] text-white'
                : 'bg-white/[0.06] border border-white/[0.08] text-white/70'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            {lang === 'ru' ? 'Пополнить' : 'Top Up'}
          </button>
          <button
            onClick={() => { hapticFeedback('medium'); setPurchaseStatus(null); setActiveTab(activeTab === 'subscribe' ? 'overview' : 'subscribe'); }}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
              activeTab === 'subscribe'
                ? 'bg-[#6c5ce7] text-white'
                : 'bg-white/[0.06] border border-white/[0.08] text-white/70'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <Crown className="w-4 h-4" />
            {subscriptionActive
              ? (lang === 'ru' ? 'Продлить' : 'Extend')
              : (lang === 'ru' ? 'Подписка' : 'Subscribe')}
          </button>
        </motion.div>

        {/* ============ TOP-UP PANEL ============ */}
        <AnimatePresence mode="wait">
          {activeTab === 'topup' && (
            <motion.div
              key="topup"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <GlassCard padding="md">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {lang === 'ru' ? 'ПОПОЛНЕНИЕ БАЛАНСА' : 'TOP UP BALANCE'}
                  </p>
                  <button onClick={() => setActiveTab('overview')} className="p-1">
                    <X className="w-4 h-4 text-white/30" />
                  </button>
                </div>

                {/* If sent — show success card */}
                {topupStatus === 'sent' ? (
                  <SentToChatCard
                    type="topup"
                    onReset={() => { setTopupStatus(null); setCustomTopupAmount(''); }}
                  />
                ) : (
                  <>
                    {/* Currency toggle */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => { hapticFeedback('light'); setTopupCurrency('stars'); setTopupAmount(100); setCustomTopupAmount(''); setTopupStatus(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                          topupCurrency === 'stars'
                            ? 'bg-yellow-400/15 border border-yellow-400/30 text-yellow-400'
                            : 'bg-white/[0.04] border border-transparent text-white/40'
                        }`}
                        style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                      >
                        <Star className="w-4 h-4 fill-current" />
                        Stars
                      </button>
                      <button
                        onClick={() => { hapticFeedback('light'); setTopupCurrency('ton'); setTopupAmount(1); setCustomTopupAmount(''); setTopupStatus(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                          topupCurrency === 'ton'
                            ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                            : 'bg-white/[0.04] border border-transparent text-white/40'
                        }`}
                        style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                      >
                        <Gem className="w-4 h-4" />
                        TON
                      </button>
                    </div>

                    {/* Amount presets */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {(topupCurrency === 'stars' ? TOPUP_STAR_AMOUNTS : TOPUP_TON_AMOUNTS).map((amt) => (
                        <button
                          key={amt}
                          onClick={() => { hapticFeedback('light'); setTopupAmount(amt); setCustomTopupAmount(''); }}
                          className={`py-2.5 rounded-xl transition-all text-center ${
                            topupAmount === amt && !customTopupAmount
                              ? topupCurrency === 'stars'
                                ? 'bg-yellow-400/15 border border-yellow-400/30 text-yellow-400'
                                : 'bg-blue-400/15 border border-blue-400/30 text-blue-400'
                              : 'bg-white/[0.04] border border-transparent text-white/50'
                          }`}
                          style={{ fontSize: '0.875rem', fontWeight: 600 }}
                        >
                          {amt} {topupCurrency === 'stars' ? '★' : 'TON'}
                        </button>
                      ))}
                    </div>

                    {/* Custom amount */}
                    <div className="relative mb-4">
                      <input
                        type="number"
                        value={customTopupAmount}
                        onChange={(e) => setCustomTopupAmount(e.target.value)}
                        placeholder={lang === 'ru' ? 'Другая сумма...' : 'Custom amount...'}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-white/20 outline-none focus:border-white/20"
                        style={{ fontSize: '0.875rem' }}
                        min={topupCurrency === 'stars' ? 1 : 0.1}
                        step={topupCurrency === 'stars' ? 1 : 0.1}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30" style={{ fontSize: '0.75rem' }}>
                        {topupCurrency === 'stars' ? '★' : 'TON'}
                      </span>
                    </div>

                    {/* Error */}
                    {topupStatus === 'failed' && (
                      <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                        <span className="text-red-400" style={{ fontSize: '0.8125rem' }}>
                          {lang === 'ru' ? 'Ошибка. Попробуйте снова.' : 'Error. Try again.'}
                        </span>
                      </div>
                    )}

                    {/* Send invoice button */}
                    <button
                      onClick={topupCurrency === 'stars' ? handleTopupStars : handleTopupTon}
                      disabled={topupLoading || getEffectiveAmount() <= 0}
                      className={`w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform ${
                        topupCurrency === 'stars'
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                          : 'bg-gradient-to-r from-blue-600 to-blue-400'
                      }`}
                      style={{ fontSize: '0.9375rem' }}
                    >
                      {topupLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          {topupCurrency === 'stars'
                            ? (lang === 'ru'
                              ? `Отправить инвойс (${getEffectiveAmount()} ★)`
                              : `Send invoice (${getEffectiveAmount()} ★)`)
                            : (lang === 'ru'
                              ? `Получить реквизиты (${getEffectiveAmount()} TON)`
                              : `Get details (${getEffectiveAmount()} TON)`)}
                        </>
                      )}
                    </button>

                    <div className="mt-3 flex items-center justify-center gap-1.5 text-white/15" style={{ fontSize: '0.6875rem' }}>
                      <MessageCircle className="w-3 h-3" />
                      {topupCurrency === 'stars'
                        ? (lang === 'ru' ? 'Инвойс придёт в чат с ботом' : 'Invoice will be sent to bot chat')
                        : (lang === 'ru' ? 'Реквизиты придут в чат с ботом' : 'Details will be sent to bot chat')}
                    </div>
                  </>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* ============ SUBSCRIBE PANEL ============ */}
          {activeTab === 'subscribe' && (
            <motion.div
              key="subscribe"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <GlassCard padding="md">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {subscriptionActive
                      ? (lang === 'ru' ? 'ПРОДЛЕНИЕ ПОДПИСКИ' : 'EXTEND SUBSCRIPTION')
                      : (lang === 'ru' ? 'КУПИТЬ ПОДПИСКУ' : 'BUY SUBSCRIPTION')}
                  </p>
                  <button onClick={() => setActiveTab('overview')} className="p-1">
                    <X className="w-4 h-4 text-white/30" />
                  </button>
                </div>

                {/* If sent to chat — show success */}
                {purchaseStatus === 'sent' ? (
                  <SentToChatCard
                    type="subscription"
                    onReset={() => setPurchaseStatus(null)}
                  />
                ) : (
                  <>
                    {/* Plans */}
                    <div className="space-y-2 mb-4">
                      {PLANS.map((plan) => {
                        const isSelected = selectedPlan === plan.id;
                        const label = plan.months === 1
                          ? (lang === 'ru' ? '1 месяц' : '1 month')
                          : plan.months === 2
                          ? (lang === 'ru' ? '2 месяца' : '2 months')
                          : (lang === 'ru' ? '3 месяца' : '3 months');

                        return (
                          <button
                            key={plan.id}
                            onClick={() => { hapticFeedback('light'); setSelectedPlan(plan.id); }}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                              isSelected
                                ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30'
                                : 'bg-white/[0.03] border border-transparent'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 text-left">
                              <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{label}</span>
                              {plan.save && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                                  -{plan.save}%
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                                {plan.stars} ★
                              </div>
                              <div className="text-white/30" style={{ fontSize: '0.625rem' }}>
                                {plan.tonPrice} TON
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Payment method */}
                    <p className="text-white/30 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                      {lang === 'ru' ? 'СПОСОБ ОПЛАТЫ' : 'PAYMENT METHOD'}
                    </p>

                    <div className="space-y-2 mb-4">
                      <button
                        onClick={() => { hapticFeedback('light'); setPayMethod('stars'); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          payMethod === 'stars'
                            ? 'bg-yellow-400/10 border border-yellow-400/25'
                            : 'bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          payMethod === 'stars' ? 'border-yellow-400 bg-yellow-400' : 'border-white/20'
                        }`}>
                          {payMethod === 'stars' && <Check className="w-3 h-3 text-black" />}
                        </div>
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 shrink-0" />
                        <div className="flex-1 text-left">
                          <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Stars</span>
                          <span className={`ml-2 ${canAffordStars ? 'text-green-400' : 'text-white/25'}`} style={{ fontSize: '0.6875rem' }}>
                            ({wallet.starsBalance} ★)
                          </span>
                        </div>
                        {canAffordStars && (
                          <span className="text-green-400 shrink-0" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                            {lang === 'ru' ? 'Хватает' : 'Enough'}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => { hapticFeedback('light'); setPayMethod('ton'); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          payMethod === 'ton'
                            ? 'bg-blue-400/10 border border-blue-400/25'
                            : 'bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          payMethod === 'ton' ? 'border-blue-400 bg-blue-400' : 'border-white/20'
                        }`}>
                          {payMethod === 'ton' && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Gem className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="flex-1 text-left">
                          <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>TON</span>
                          <span className={`ml-2 ${canAffordTon ? 'text-green-400' : 'text-white/25'}`} style={{ fontSize: '0.6875rem' }}>
                            ({wallet.tonBalance} TON)
                          </span>
                        </div>
                        {canAffordTon && (
                          <span className="text-green-400 shrink-0" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                            {lang === 'ru' ? 'Хватает' : 'Enough'}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Status */}
                    <AnimatePresence>
                      {purchaseStatus === 'success' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                          <Check className="w-5 h-5 text-green-400 mx-auto mb-1" />
                          <span className="text-green-400" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                            {lang === 'ru' ? 'Подписка активирована!' : 'Subscription activated!'}
                          </span>
                        </motion.div>
                      )}
                      {purchaseStatus === 'insufficient' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                          <span className="text-amber-400" style={{ fontSize: '0.8125rem' }}>
                            {lang === 'ru' ? 'Недостаточно средств на балансе' : 'Insufficient balance'}
                          </span>
                          <button
                            onClick={() => { setActiveTab('topup'); setPurchaseStatus(null); }}
                            className="block mx-auto mt-2 px-4 py-1.5 rounded-lg bg-amber-500/20 text-amber-400"
                            style={{ fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            {lang === 'ru' ? 'Пополнить баланс' : 'Top Up Balance'}
                          </button>
                        </motion.div>
                      )}
                      {purchaseStatus === 'failed' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                          <span className="text-red-400" style={{ fontSize: '0.8125rem' }}>
                            {lang === 'ru' ? 'Ошибка. Попробуйте снова.' : 'Error. Try again.'}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Pay button */}
                    {(() => {
                      const canAfford = payMethod === 'stars' ? canAffordStars : canAffordTon;
                      const price = payMethod === 'stars' ? selectedPlanData.stars : selectedPlanData.tonPrice;
                      const unit = payMethod === 'stars' ? '★' : 'TON';

                      return (
                        <>
                          {canAfford ? (
                            <button
                              onClick={handlePayFromBalance}
                              disabled={purchasing}
                              className="w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]"
                              style={{ fontSize: '0.9375rem' }}
                            >
                              {purchasing ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  <CreditCard className="w-4 h-4" />
                                  {lang === 'ru' ? `С баланса (${price} ${unit})` : `From balance (${price} ${unit})`}
                                </>
                              )}
                            </button>
                          ) : payMethod === 'stars' ? (
                            <button
                              onClick={handleDirectPurchaseStars}
                              disabled={purchasing}
                              className="w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform bg-gradient-to-r from-yellow-500 to-amber-500"
                              style={{ fontSize: '0.9375rem' }}
                            >
                              {purchasing ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  <Send className="w-4 h-4" />
                                  {lang === 'ru' ? `Инвойс на ${selectedPlanData.stars} ★` : `Invoice for ${selectedPlanData.stars} ★`}
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => { setActiveTab('topup'); setTopupCurrency('ton'); setPurchaseStatus(null); }}
                              className="w-full py-3.5 rounded-xl text-white/60 font-semibold flex items-center justify-center gap-2 bg-white/[0.06]"
                              style={{ fontSize: '0.9375rem' }}
                            >
                              <Plus className="w-4 h-4" />
                              {lang === 'ru' ? 'Пополнить TON-баланс' : 'Top up TON balance'}
                            </button>
                          )}

                          {!canAfford && payMethod === 'stars' && (
                            <p className="text-center text-white/20 mt-2" style={{ fontSize: '0.6875rem' }}>
                              {lang === 'ru' ? 'Инвойс придёт в чат с ботом' : 'Invoice will be sent to bot chat'}
                            </p>
                          )}
                        </>
                      );
                    })()}

                    <div className="mt-3 flex items-center justify-center gap-1.5 text-white/15" style={{ fontSize: '0.6875rem' }}>
                      <Shield className="w-3 h-3" />
                      {lang === 'ru' ? 'Безопасная оплата' : 'Secure payment'}
                    </div>
                  </>
                )}
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subscription status (overview only) */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <GlassCard padding="md" className="relative overflow-hidden">
              <div className={`absolute -top-6 -left-6 w-20 h-20 rounded-full ${subscriptionActive ? 'bg-[#6c5ce7]/10' : 'bg-amber-500/10'} blur-[30px] pointer-events-none`} />
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  subscriptionActive
                    ? 'bg-gradient-to-br from-[#6c5ce7]/25 to-[#a29bfe]/10'
                    : 'bg-gradient-to-br from-amber-500/20 to-amber-400/10'
                }`}>
                  <Crown className={`w-5 h-5 ${subscriptionActive ? 'text-[#a29bfe]' : 'text-amber-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {subscriptionActive
                      ? (lang === 'ru' ? 'Premium активна' : 'Premium Active')
                      : (lang === 'ru' ? 'Бесплатный план' : 'Free Plan')}
                  </p>
                  <p className={`mt-0.5 ${subscriptionActive ? 'text-white/30' : 'text-amber-400/70'}`} style={{ fontSize: '0.75rem' }}>
                    {subscriptionActive
                      ? (lang === 'ru'
                        ? `${subscriptionDaysLeft} ${subscriptionDaysLeft === 1 ? 'день' : subscriptionDaysLeft < 5 ? 'дня' : 'дней'} осталось`
                        : `${subscriptionDaysLeft} days remaining`)
                      : (lang === 'ru' ? 'Подключи Premium для AI-функций' : 'Upgrade to unlock AI features')}
                  </p>
                </div>
                {subscriptionActive && subscriptionDaysLeft > 0 && (
                  <div className="shrink-0 text-right">
                    <span className={`font-bold ${subscriptionDaysLeft <= 5 ? 'text-amber-400' : 'text-[#a29bfe]'}`} style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {subscriptionDaysLeft}
                    </span>
                    <p className="text-white/20" style={{ fontSize: '0.625rem' }}>{lang === 'ru' ? 'дней' : 'days'}</p>
                  </div>
                )}
              </div>
              {subscriptionActive && subscriptionDaysLeft > 0 && (
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${subscriptionDaysLeft <= 5 ? 'bg-amber-400' : 'bg-[#6c5ce7]'}`}
                    style={{ width: `${Math.min(100, (subscriptionDaysLeft / 30) * 100)}%` }}
                  />
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}

        {/* Earn free days link */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-6"
          >
            <GlassCard
              variant="interactive"
              padding="md"
              onClick={() => { hapticFeedback('medium'); navigate('/bonuses'); }}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#6c5ce7]/20 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-[#fd79a8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {lang === 'ru' ? 'Бесплатные дни' : 'Free days'}
                  </p>
                  <p className="text-white/30 mt-0.5" style={{ fontSize: '0.75rem' }}>
                    {lang === 'ru' ? 'Бонусы, рефералы и подписки' : 'Bonuses, referrals & socials'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/20 shrink-0" />
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Transaction history — combined */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-white/30" />
              <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {lang === 'ru' ? 'ИСТОРИЯ ОПЕРАЦИЙ' : 'TRANSACTION HISTORY'}
              </span>
            </div>
          </div>

          {/* Filter pills */}
          {(payments.length > 0 || transactions.length > 0) && (
            <div className="flex gap-1.5 mb-3">
              {(['all', 'payments', 'deposits'] as HistoryFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => { hapticFeedback('light'); setHistoryFilter(f); }}
                  className={`px-3 py-1.5 rounded-full transition-all ${
                    historyFilter === f
                      ? 'bg-white/15 text-white'
                      : 'bg-white/5 text-white/35'
                  }`}
                  style={{ fontSize: '0.6875rem', fontWeight: 600 }}
                >
                  {t(f === 'all' ? 'tx_tab_all' : f === 'payments' ? 'tx_tab_payments' : 'tx_tab_deposits')}
                </button>
              ))}
            </div>
          )}

          {loadingPayments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
            </div>
          ) : (() => {
            // Build combined list
            type HistoryItem = {
              id: string;
              source: 'payment' | 'tx';
              txType?: string;
              label: string;
              subtitle?: string;
              amount: number;
              currency: string;
              createdAt: string;
              sign: '+' | '-' | '';
              iconBg: string;
              iconColor: string;
              icon: React.ReactNode;
              amountColor: string;
            };

            const items: HistoryItem[] = [];

            // Payments
            if (historyFilter !== 'deposits') {
              for (const p of payments) {
                const isTopup = p.type === 'topup' || p.payload?.startsWith('topup_');
                items.push({
                  id: `p-${p.id}`,
                  source: 'payment',
                  label: formatPaymentLabel(p),
                  amount: p.amount,
                  currency: p.currency,
                  createdAt: p.createdAt,
                  sign: isTopup ? '+' : '',
                  iconBg: isTopup ? 'bg-blue-500/15' : 'bg-emerald-500/15',
                  iconColor: isTopup ? 'text-blue-400' : 'text-emerald-400',
                  icon: isTopup ? <ArrowDownToLine className="w-4 h-4" /> : <Crown className="w-4 h-4" />,
                  amountColor: isTopup ? 'text-blue-400' : 'text-white/60',
                });
              }
            }

            // Transactions (challenge deposits)
            if (historyFilter !== 'payments') {
              for (const tx of transactions) {
                const txMeta = getTxMeta(tx.type, t);
                // Skip duplicates — don't show topup/subscription tx if already in payments
                if (tx.type === 'topup_stars' || tx.type === 'topup_ton' || tx.type === 'subscription') continue;
                items.push({
                  id: `tx-${tx.id}`,
                  source: 'tx',
                  txType: tx.type,
                  label: txMeta.label,
                  subtitle: tx.challengeTitle || undefined,
                  amount: tx.amount,
                  currency: tx.currency === 'stars' ? 'XTR' : tx.currency.toUpperCase(),
                  createdAt: tx.createdAt,
                  sign: txMeta.sign,
                  iconBg: txMeta.iconBg,
                  iconColor: txMeta.iconColor,
                  icon: txMeta.icon,
                  amountColor: txMeta.amountColor,
                });
              }
            }

            // Sort by date descending
            items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            if (items.length === 0) {
              return (
                <GlassCard padding="md" className="text-center">
                  <Receipt className="w-8 h-8 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30" style={{ fontSize: '0.875rem' }}>
                    {t('tx_no_transactions')}
                  </p>
                  <p className="text-white/15 mt-1" style={{ fontSize: '0.75rem' }}>
                    {t('tx_no_transactions_hint')}
                  </p>
                </GlassCard>
              );
            }

            return (
              <div className="space-y-2">
                {items.map((item) => (
                  <GlassCard key={item.id} padding="sm" className="relative overflow-hidden">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
                        <span className={item.iconColor}>{item.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white truncate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {item.label}
                        </p>
                        {item.subtitle ? (
                          <p className="text-white/20 truncate mt-0.5" style={{ fontSize: '0.6875rem' }}>
                            {item.subtitle}
                          </p>
                        ) : null}
                        <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={item.amountColor} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {item.sign}{formatCurrency(item.currency, item.amount)}
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            );
          })()}
        </motion.div>
      </div>
    </div>
  );
}
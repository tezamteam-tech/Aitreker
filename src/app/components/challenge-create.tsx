// =============================================
// Proper Food AI — Create Challenge (/challenges/create)
// =============================================

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSignature,
  Users,
  Star,
  Gem,
  Sparkles,
  Copy,
  Check,
  Globe,
  Lock,
  KeyRound,
  Share2,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { ChallengeType, ChallengeCurrency, ChallengeVisibility, ChallengeWithMembers } from './types';
import { hapticFeedback, hapticSuccess, shareTelegram } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { buildBotLink } from './bot-config';

const TYPES: { id: ChallengeType; labelKey: string; sublabelKey: string; icon: typeof FileSignature; color: string; bgColor: string }[] = [
  {
    id: 'contract',
    labelKey: 'cc_contract_label',
    sublabelKey: 'cc_contract_sub',
    icon: FileSignature,
    color: 'text-[#00cec9]',
    bgColor: 'bg-[#00cec9]/15',
  },
  {
    id: 'pool',
    labelKey: 'cc_pool_label',
    sublabelKey: 'cc_pool_sub',
    icon: Users,
    color: 'text-[#fdcb6e]',
    bgColor: 'bg-[#fdcb6e]/15',
  },
];

const VISIBILITY_OPTIONS: { id: ChallengeVisibility; labelKey: string; sublabelKey: string; icon: typeof Globe; color: string; bgColor: string }[] = [
  {
    id: 'open',
    labelKey: 'cc_open',
    sublabelKey: 'cc_open_sub',
    icon: Globe,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
  },
  {
    id: 'private',
    labelKey: 'cc_private',
    sublabelKey: 'cc_private_sub',
    icon: Lock,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
  },
];

const CURRENCIES: { id: ChallengeCurrency; label: string; icon: typeof Star; color: string }[] = [
  { id: 'stars', label: 'Stars', icon: Star, color: 'text-yellow-400' },
  { id: 'ton', label: 'TON', icon: Gem, color: 'text-blue-400' },
];

const DURATIONS = [3, 7, 14, 21, 30];

export function ChallengeCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();

  const [type, setType] = useState<ChallengeType>('contract');
  const [title, setTitle] = useState('');
  const [depositAmount, setDepositAmount] = useState('50');
  const [currency, setCurrency] = useState<ChallengeCurrency>('stars');
  const [durationDays, setDurationDays] = useState(7);
  const [rulesText, setRulesText] = useState('');
  const [visibility, setVisibility] = useState<ChallengeVisibility>('open');
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<ChallengeWithMembers | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [wallet, setWallet] = useState({ starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 });
  const [createError, setCreateError] = useState<string | null>(null);

  // Load wallet on mount
  useEffect(() => {
    api.getWallet().then((w) => setWallet(w)).catch(() => {});
  }, []);

  const availableStars = wallet.starsBalance - (wallet.starsReserved || 0);
  const availableTon = wallet.tonBalance - (wallet.tonReserved || 0);
  const depositNum = parseInt(depositAmount, 10) || 0;
  const hasEnoughFunds = currency === 'stars'
    ? depositNum <= 0 || availableStars >= depositNum
    : depositNum <= 0 || availableTon >= depositNum;

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreateError(null);
    hapticFeedback('medium');
    setIsSaving(true);
    try {
      const result = await api.createChallenge({
        type,
        title: title.trim(),
        depositAmount: parseInt(depositAmount, 10) || 0,
        currency,
        durationDays,
        rulesText: rulesText.trim(),
        programId: 'prog_7day_focus',
        visibility,
      });
      hapticSuccess();
      setCreated(result);
    } catch (err: any) {
      console.error('[ChallengeCreate] Error:', err);
      if (err?.code === 'INSUFFICIENT_FUNDS') {
        setCreateError(t('cc_insufficient_balance'));
      } else {
        setCreateError(err?.message || t('cc_creation_failed'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [type, title, depositAmount, currency, durationDays, rulesText, visibility, t]);

  const inviteLink = created
    ? buildBotLink(`challenge_${created.id}`)
    : '';

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleCopyCode = useCallback(() => {
    if (!created?.inviteCode) return;
    navigator.clipboard.writeText(created.inviteCode).then(() => {
      setCodeCopied(true);
      hapticSuccess();
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }, [created]);

  const handleShareLink = useCallback(() => {
    if (!inviteLink) return;
    shareTelegram(inviteLink);
  }, [inviteLink]);

  // Success screen
  if (created) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 right-0 w-72 h-72 rounded-full bg-[#6c5ce7]/15 blur-[120px]" />
        </div>

        <div className="relative z-10 px-5 pb-8 flex flex-col items-center" style={{ paddingTop: '6px' /* success screen — no PageHeader */ }}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-[#00cec9] flex items-center justify-center mb-6 mt-16"
            style={{ boxShadow: '0 12px 40px rgba(0,206,201,0.3)' }}
          >
            <Sparkles className="w-10 h-10 text-white" />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white text-center mb-2"
            style={{ fontSize: '1.5rem', fontWeight: 700 }}
          >
            {t('cc_created')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-white/40 text-center mb-8"
            style={{ fontSize: '0.9375rem' }}
          >
            {created.depositAmount > 0
              ? t('cc_deposit_frozen_msg', { amount: created.depositAmount, currency: created.currency === 'stars' ? 'Stars' : 'TON' })
              : t('cc_commitment_set')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm"
          >
            <GlassCard variant="elevated" className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>{created.title}</p>
                {created.visibility === 'private' && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                    <Lock className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-white/35 mb-3" style={{ fontSize: '0.8125rem' }}>
                {created.type === 'contract' ? t('cc_contract_label') : t('cc_pool_label')}
                {created.depositAmount > 0 && ` \u00B7 ${created.depositAmount} ${created.currency === 'stars' ? 'Stars' : 'TON'}`}
                {` \u00B7 ${t('cc_days', { count: created.durationDays })}`}
              </p>
              {created.rulesText && (
                <p className="text-white/25" style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                  {created.rulesText}
                </p>
              )}
            </GlassCard>

            {/* Invite code for private challenges */}
            {created.visibility === 'private' && created.inviteCode && (
              <GlassCard variant="elevated" className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <p className="text-white/60" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('cc_invite_code_label')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white/[0.06] rounded-xl px-4 py-3 text-center">
                    <p className="text-white font-mono" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.3em' }}>
                      {created.inviteCode}
                    </p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={handleCopyCode}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      codeCopied ? 'bg-emerald-500/20' : 'bg-white/[0.06]'
                    }`}
                  >
                    {codeCopied ? (
                      <Check className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-white/40" />
                    )}
                  </motion.button>
                </div>
                <p className="text-white/25 text-center mt-2" style={{ fontSize: '0.75rem' }}>
                  {t('cc_share_code')}
                </p>
              </GlassCard>
            )}

            {/* Invite link (for pool type and open challenges) */}
            {(created.type === 'pool' || created.visibility === 'open') && (
              <GlassCard variant="elevated" className="mb-4">
                <p className="text-white/50 mb-2" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {t('cc_invite_link')}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2.5 truncate">
                    <p className="text-white/60 truncate" style={{ fontSize: '0.8125rem' }}>{inviteLink}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={handleCopyLink}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      copied ? 'bg-emerald-500/20' : 'bg-white/[0.06]'
                    }`}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-white/40" />
                    )}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={handleShareLink}
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[#6c5ce7]/20"
                  >
                    <Share2 className="w-4 h-4 text-[#a29bfe]" />
                  </motion.button>
                </div>
              </GlassCard>
            )}

            <div className="space-y-2.5 mt-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/challenges/${created.id}`)}
                className="w-full h-13 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600, height: '52px', boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
              >
                {t('cc_view')}
              </motion.button>
              <button
                onClick={() => navigate('/challenges')}
                className="w-full h-11 text-white/30 flex items-center justify-center"
                style={{ fontSize: '0.875rem' }}
              >
                {t('chd_back')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 right-0 w-72 h-72 rounded-full bg-[#6c5ce7]/12 blur-[120px]" />
        <div className="absolute bottom-0 -left-20 w-60 h-60 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      <div className="relative z-10 px-5 pb-6">
        {/* Header */}
        <PageHeader title={t('cc_title')} />

        {/* Type selection */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_type')}
          </p>
          <div className="space-y-2.5">
            {TYPES.map((item) => {
              const isActive = type === item.id;
              return (
                <GlassCard
                  key={item.id}
                  variant={isActive ? 'accent' : 'interactive'}
                  padding="md"
                  className="flex items-start gap-3.5"
                  onClick={() => {
                    hapticFeedback('light');
                    setType(item.id);
                  }}
                >
                  <div className={`w-10 h-10 rounded-xl ${item.bgColor} flex items-center justify-center shrink-0`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t(item.labelKey)}</p>
                    <p className="text-white/35 mt-0.5" style={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                      {t(item.sublabelKey)}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    isActive ? 'border-[#6c5ce7] bg-[#6c5ce7]' : 'border-white/20'
                  }`}>
                    {isActive && <Check className="w-3 h-3 text-white" />}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </motion.div>

        {/* Visibility */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="mb-6"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_visibility')}
          </p>
          <div className="flex gap-2.5">
            {VISIBILITY_OPTIONS.map((item) => {
              const isActive = visibility === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    hapticFeedback('light');
                    setVisibility(item.id);
                  }}
                  className={`flex-1 flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-white/[0.06] border-[#6c5ce7]/30'
                      : 'bg-white/[0.02] border-white/[0.05]'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg ${item.bgColor} flex items-center justify-center shrink-0`}>
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div className="text-left">
                    <p className={`${isActive ? 'text-white' : 'text-white/50'}`} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {t(item.labelKey)}
                    </p>
                    <p className="text-white/25" style={{ fontSize: '0.6875rem' }}>
                      {t(item.sublabelKey)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_title_label')}
          </p>
          <GlassCard variant="elevated" padding="sm">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('cc_title_placeholder')}
              className="w-full bg-transparent text-white placeholder-white/20 outline-none px-1"
              style={{ fontSize: '0.9375rem' }}
              maxLength={80}
            />
          </GlassCard>
        </motion.div>

        {/* Deposit */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_deposit')}
          </p>
          <div className="flex gap-3">
            <GlassCard variant="elevated" padding="sm" className="flex-1">
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className="w-full bg-transparent text-white placeholder-white/20 outline-none px-1"
                style={{ fontSize: '0.9375rem' }}
                type="text"
                inputMode="numeric"
              />
            </GlassCard>
            <div className="flex gap-1.5">
              {CURRENCIES.map((c) => {
                const isActive = currency === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      hapticFeedback('light');
                      setCurrency(c.id);
                    }}
                    className={`h-full px-3.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                      isActive
                        ? 'bg-white/[0.06] border-[#6c5ce7]/30'
                        : 'bg-white/[0.02] border-white/[0.05]'
                    }`}
                  >
                    <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                    <span className={`${isActive ? 'text-white' : 'text-white/40'}`} style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Available balance hint */}
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-white/25" style={{ fontSize: '0.6875rem' }}>
              {t('cc_available_label')}: {currency === 'stars' ? `${availableStars} Stars` : `${availableTon.toFixed(1)} TON`}
            </span>
            {depositNum > 0 && !hasEnoughFunds && (
              <span className="text-red-400/70" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                {t('cc_not_enough')}
              </span>
            )}
          </div>
          {depositNum > 0 && hasEnoughFunds && (
            <p className="text-white/20 mt-1.5 px-1" style={{ fontSize: '0.6875rem' }}>
              {t('cc_deposit_frozen_info')}
            </p>
          )}
        </motion.div>

        {/* Duration */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_duration')}
          </p>
          <div className="flex gap-2">
            {DURATIONS.map((d) => {
              const isActive = durationDays === d;
              return (
                <button
                  key={d}
                  onClick={() => {
                    hapticFeedback('light');
                    setDurationDays(d);
                  }}
                  className={`flex-1 h-10 rounded-xl border flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-[#6c5ce7]/20 border-[#6c5ce7]/30 text-white'
                      : 'bg-white/[0.02] border-white/[0.05] text-white/40'
                  }`}
                  style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                >
                  {d}d
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Rules */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-8"
        >
          <p className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('cc_rules')}
          </p>
          <GlassCard variant="elevated" padding="sm">
            <textarea
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder={t('cc_rules_placeholder')}
              className="w-full bg-transparent text-white placeholder-white/20 resize-none outline-none px-1 min-h-[70px]"
              style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}
              maxLength={300}
            />
          </GlassCard>
        </motion.div>

        {/* Deposit notice */}
        {depositNum > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6"
          >
            <GlassCard padding="sm" className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasEnoughFunds ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
                {currency === 'stars'
                  ? <Star className={`w-4 h-4 ${hasEnoughFunds ? 'text-amber-400' : 'text-red-400'}`} />
                  : <Gem className={`w-4 h-4 ${hasEnoughFunds ? 'text-blue-400' : 'text-red-400'}`} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`${hasEnoughFunds ? 'text-white/40' : 'text-red-400/70'}`} style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                  {hasEnoughFunds
                    ? t('cc_will_be_frozen', { amount: depositNum, currency: currency === 'stars' ? 'Stars' : 'TON' })
                    : t('cc_insufficient_wallet')}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Private notice */}
        {visibility === 'private' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6"
          >
            <GlassCard padding="sm" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-white/40" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                {t('cc_private_sub')}. {t('cc_share_code')}.
              </p>
            </GlassCard>
          </motion.div>
        )}

        {/* Error message */}
        {createError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-400/80 text-center mb-3"
            style={{ fontSize: '0.8125rem' }}
          >
            {createError}
          </motion.p>
        )}

        {/* Create button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCreate}
            disabled={!title.trim() || isSaving || !hasEnoughFunds}
            className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 transition-all ${
              title.trim() && hasEnoughFunds
                ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg'
                : 'bg-white/[0.03] text-white/20'
            }`}
            style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: title.trim() && hasEnoughFunds ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}
          >
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {t('cc_create_btn')}
              </>
            )}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
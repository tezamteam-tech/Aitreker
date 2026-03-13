// =============================================
// Proper Food AI — Challenges List (/challenges)
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Users,
  FileSignature,
  User as UserIcon,
  ChevronRight,
  Clock,
  CheckCircle2,
  Search,
  Lock,
  X,
  KeyRound,
  Loader2,
  Star,
  Gem,
  ShieldCheck,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { ChallengeWithMembers, ChallengeType } from './types';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { isCompactCards } from './local-settings';
import { PageHeader } from './page-header';

const TYPE_CONFIG: Record<ChallengeType, { labelKey: string; sublabelKey: string; icon: typeof UserIcon; color: string; bgColor: string }> = {
  solo: { labelKey: 'ch_solo', sublabelKey: 'ch_solo_sub', icon: UserIcon, color: 'text-[#a29bfe]', bgColor: 'bg-[#a29bfe]/15' },
  contract: { labelKey: 'ch_contract', sublabelKey: 'ch_contract_sub', icon: FileSignature, color: 'text-[#00cec9]', bgColor: 'bg-[#00cec9]/15' },
  pool: { labelKey: 'ch_pool', sublabelKey: 'ch_pool_sub', icon: Users, color: 'text-[#fdcb6e]', bgColor: 'bg-[#fdcb6e]/15' },
};

export function ChallengesListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState<ChallengeWithMembers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'available'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [joinToast, setJoinToast] = useState<string | null>(null);

  // Hide tab bar when bottom sheet is open
  useBottomSheetLifecycle(showCodeModal);

  // Handle deep link join
  useEffect(() => {
    const joinId = searchParams.get('challengeId');
    if (joinId) {
      navigate(`/challenges/${joinId}`);
    }
  }, [searchParams, navigate]);

  const loadChallenges = useCallback(() => {
    setIsLoading(true);
    api.getChallenges()
      .then(setChallenges)
      .catch((err) => console.error('[Challenges] Error:', err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  const myChallenges = challenges.filter((c) => c.isMember);
  const availableChallenges = challenges.filter((c) => !c.isMember && c.status === 'active');

  // Apply search filter
  const filterBySearch = (list: ChallengeWithMembers[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.ownerName?.toLowerCase().includes(q) ||
      c.rulesText?.toLowerCase().includes(q)
    );
  };

  const displayed = filterBySearch(tab === 'my' ? myChallenges : availableChallenges);

  const daysRemaining = (endAt: string) => {
    const diff = new Date(endAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  // Show toast
  const showToast = useCallback((msg: string) => {
    setJoinToast(msg);
    setTimeout(() => setJoinToast(null), 2500);
  }, []);

  // Join by invite code
  const handleJoinByCode = useCallback(async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code || code.length < 4) return;

    setCodeError(null);
    setJoiningByCode(true);
    hapticFeedback('medium');

    try {
      // Find the private challenge matching this code
      // We need to try joining each private challenge with the code
      // But since we don't know the challengeId, we search locally first
      const privateChallenges = challenges.filter(
        (c) => c.visibility === 'private' && !c.isMember && c.status === 'active'
      );

      let joined = false;
      for (const ch of privateChallenges) {
        try {
          const result = await api.joinChallenge(ch.id, code);
          hapticSuccess();
          showToast(t('chd_joined_toast'));
          setShowCodeModal(false);
          setInviteCode('');
          loadChallenges();
          navigate(`/challenges/${ch.id}`);
          joined = true;
          break;
        } catch (err: any) {
          if (err.code === 'INVALID_CODE') continue;
          if (err.code === 'ALREADY_JOINED') {
            showToast(t('chd_already_member'));
            setShowCodeModal(false);
            joined = true;
            break;
          }
        }
      }

      if (!joined) {
        setCodeError(t('ch_invalid_code'));
        hapticFeedback('heavy');
      }
    } catch (err) {
      console.error('[Challenges] Join by code error:', err);
      setCodeError(t('ch_invalid_code'));
    } finally {
      setJoiningByCode(false);
    }
  }, [inviteCode, challenges, t, navigate, loadChallenges, showToast]);

  return (
    <div className="min-h-screen pb-28">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 right-0 w-72 h-72 rounded-full bg-[#6c5ce7]/12 blur-[120px]" />
        <div className="absolute bottom-20 -left-20 w-60 h-60 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {joinToast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-white/[0.1] shadow-2xl"
          >
            <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{joinToast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={t('ch_title')}
          actions={
            <>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => {
                  hapticFeedback('light');
                  setShowCodeModal(true);
                }}
                className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-white/40" />
                <span className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                  {t('ch_join_by_code')}
                </span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => {
                  hapticFeedback('light');
                  navigate('/challenges/create');
                }}
                className="w-9 h-9 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 flex items-center justify-center"
              >
                <Plus className="w-5 h-5 text-[#a29bfe]" />
              </motion.button>
            </>
          }
        />

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="mb-4"
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('ch_search_placeholder')}
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-white/20 outline-none"
              style={{ fontSize: '0.875rem' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white/40" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex gap-2 mb-6"
        >
          {(['my', 'available'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => {
                hapticFeedback('light');
                setTab(tabKey);
              }}
              className={`flex-1 h-10 rounded-xl flex items-center justify-center transition-all ${
                tab === tabKey
                  ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-white'
                  : 'bg-white/[0.03] border border-white/[0.05] text-white/40'
              }`}
              style={{ fontSize: '0.875rem', fontWeight: 500 }}
            >
              {tabKey === 'my' ? t('ch_tab_my', { count: myChallenges.length }) : t('ch_tab_available', { count: availableChallenges.length })}
            </button>
          ))}
        </motion.div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-white/10 border-t-[#6c5ce7] rounded-full"
            />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && displayed.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-16 px-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
              {searchQuery ? (
                <Search className="w-8 h-8 text-white/20" />
              ) : tab === 'my' ? (
                <FileSignature className="w-8 h-8 text-white/20" />
              ) : (
                <Users className="w-8 h-8 text-white/20" />
              )}
            </div>
            <p className="text-white/40 text-center mb-1" style={{ fontSize: '1rem', fontWeight: 500 }}>
              {searchQuery ? t('ch_no_search_results') : tab === 'my' ? t('ch_no_challenges') : t('ch_no_available')}
            </p>
            <p className="text-white/25 text-center mb-6" style={{ fontSize: '0.8125rem' }}>
              {searchQuery ? '' : tab === 'my' ? t('ch_create_desc') : t('ch_check_later')}
            </p>
            {tab === 'my' && !searchQuery && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/challenges/create')}
                className="px-5 h-11 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe] flex items-center gap-2"
                style={{ fontSize: '0.875rem', fontWeight: 500 }}
              >
                <Plus className="w-4 h-4" />
                {t('ch_create')}
              </motion.button>
            )}
          </motion.div>
        )}

        {/* Challenge cards */}
        <div className={isCompactCards() ? 'space-y-2' : 'space-y-3'}>
          {displayed.map((ch, i) => {
            const config = TYPE_CONFIG[ch.type] || TYPE_CONFIG.solo;
            const remaining = daysRemaining(ch.endAt);
            const Icon = config.icon;
            const isPrivate = ch.visibility === 'private';
            const compact = isCompactCards();

            return (
              <motion.div
                key={ch.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
              >
                <GlassCard
                  variant="interactive"
                  padding={compact ? 'sm' : 'md'}
                  onClick={() => {
                    hapticFeedback('light');
                    navigate(`/challenges/${ch.id}`);
                  }}
                >
                  <div className={compact ? 'flex items-center gap-3' : 'flex items-start gap-3.5'}>
                    <div className={compact ? `w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center shrink-0` : `w-11 h-11 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}>
                      <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-white truncate" style={{ fontSize: compact ? '0.875rem' : '0.9375rem', fontWeight: 600 }}>
                          {ch.title}
                        </p>
                        {isPrivate && (
                          <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                            <Lock className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {ch.status === 'active' && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                            {t('ch_active')}
                          </span>
                        )}
                        {(ch.status === 'settled' || ch.status === 'completed') && (
                          <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                            <ShieldCheck className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>

                      {!compact && (
                        <p className="text-white/35 mb-2" style={{ fontSize: '0.75rem' }}>
                          {t(config.sublabelKey)}
                          {ch.depositAmount > 0 && (
                            <>
                              {' \u00B7 '}
                              {ch.currency === 'stars' ? <Star className="w-3 h-3 text-yellow-400 inline -mt-0.5" /> : <Gem className="w-3 h-3 text-blue-400 inline -mt-0.5" />}
                              {' '}{ch.depositAmount} {ch.currency === 'stars' ? 'Stars' : 'TON'}
                            </>
                          )}
                        </p>
                      )}

                      {/* Progress bar — hidden in compact mode */}
                      {!compact && ch.isMember && ch.durationDays > 0 && (
                        <div className="mb-2">
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] transition-all"
                              style={{ width: `${Math.min(100, Math.round((Math.max(0, Math.ceil((Date.now() - new Date(ch.startAt).getTime()) / 86400000)) / ch.durationDays) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-white/30" style={{ fontSize: '0.6875rem' }}>
                          <Users className="w-3 h-3" /> {ch.memberCount}
                        </span>
                        <span className="flex items-center gap-1 text-white/30" style={{ fontSize: '0.6875rem' }}>
                          <Clock className="w-3 h-3" /> {t('ch_days_left', { count: remaining })}
                        </span>
                        {ch.isMember && (
                          <span className="flex items-center gap-1 text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                            <CheckCircle2 className="w-3 h-3" /> {t('ch_joined')}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-white/15 shrink-0 mt-1" />
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Join by Code Modal */}
      <AnimatePresence>
        {showCodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCodeModal(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6"
              style={{ paddingBottom: 'max(2rem, calc(var(--safe-area-bottom, 0px) + 1.5rem))' }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-[#a29bfe]" />
                  </div>
                  <div>
                    <h2 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('ch_join_by_code')}</h2>
                    <p className="text-white/30" style={{ fontSize: '0.75rem' }}>{t('ch_enter_code')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCodeModal(false); setCodeError(null); setInviteCode(''); }}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              <div className="mb-4">
                <input
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                    setCodeError(null);
                  }}
                  placeholder={t('ch_code_placeholder')}
                  className="w-full h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-center tracking-[0.3em] placeholder:text-white/20 placeholder:tracking-normal outline-none"
                  style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.3em' }}
                  autoFocus
                  maxLength={8}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinByCode();
                  }}
                />
                {codeError && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-400/80 text-center mt-2"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    {codeError}
                  </motion.p>
                )}
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleJoinByCode}
                disabled={!inviteCode.trim() || joiningByCode}
                className={`w-full h-13 rounded-xl flex items-center justify-center gap-2 transition-all ${
                  inviteCode.trim() && !joiningByCode
                    ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white'
                    : 'bg-white/[0.04] text-white/20'
                }`}
                style={{ fontSize: '1rem', fontWeight: 600, height: '52px', boxShadow: inviteCode.trim() ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}
              >
                {joiningByCode ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-5 h-5" />
                    {t('ch_join_btn')}
                  </>
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
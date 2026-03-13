// =============================================
// BECOME — Challenge Detail (/challenges/:id)
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  FileSignature,
  User as UserIcon,
  Star,
  Gem,
  Flame,
  CheckCircle2,
  SkipForward,
  Clock,
  Circle,
  Copy,
  Check,
  Link as LinkIcon,
  Trophy,
  Lock,
  KeyRound,
  Loader2,
  Share2,
  LogOut,
  Gavel,
  AlertTriangle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { ChallengeWithMembers, ChallengeMember, ChallengeType } from './types';
import { hapticFeedback, hapticSuccess, shareTelegram } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

const TYPE_CONFIG: Record<ChallengeType, { label: string; icon: typeof UserIcon; color: string; bgColor: string }> = {
  solo: { label: 'Solo', icon: UserIcon, color: 'text-[#a29bfe]', bgColor: 'bg-[#a29bfe]/15' },
  contract: { label: 'Commitment Contract', icon: FileSignature, color: 'text-[#00cec9]', bgColor: 'bg-[#00cec9]/15' },
  pool: { label: 'Shared Path', icon: Users, color: 'text-[#fdcb6e]', bgColor: 'bg-[#fdcb6e]/15' },
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  done: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  skip: { icon: SkipForward, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  pending: { icon: Circle, color: 'text-white/20', bg: 'bg-white/[0.04]' },
};

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();

  const [challenge, setChallenge] = useState<ChallengeWithMembers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Private challenge join by code
  const [joinCode, setJoinCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // Leave / Settle
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Hide tab bar when modal is open
  useBottomSheetLifecycle(showLeaveConfirm);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    api.getChallenge(id)
      .then(setChallenge)
      .catch((err) => console.error('[ChallengeDetail] Error:', err))
      .finally(() => setIsLoading(false));
  }, [id]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleJoin = useCallback(async (code?: string) => {
    if (!id) return;
    hapticFeedback('medium');
    setIsJoining(true);
    setCodeError(null);
    try {
      const result = await api.joinChallenge(id, code || undefined);
      setChallenge(result);
      hapticSuccess();
      showToast(t('chd_joined_toast'));
    } catch (err: any) {
      console.error('[ChallengeDetail] Join error:', err);
      if (err.code === 'ALREADY_JOINED') {
        showToast(t('chd_already_member'));
      } else if (err.code === 'INVALID_CODE') {
        setCodeError(t('chd_code_error'));
        hapticFeedback('heavy');
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        showToast(lang === 'ru' ? 'Недостаточно средств на балансе' : 'Insufficient balance');
        hapticFeedback('heavy');
      } else {
        showToast(t('chd_join_error'));
      }
    } finally {
      setIsJoining(false);
    }
  }, [id, showToast, t, lang]);

  const inviteLink = challenge
    ? `https://t.me/BECOMEAI_BOT?start=challenge_${challenge.id}`
    : '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleCopyCode = useCallback(() => {
    if (!challenge?.inviteCode) return;
    navigator.clipboard.writeText(challenge.inviteCode).then(() => {
      setCodeCopied(true);
      hapticSuccess();
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }, [challenge]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-white/10 border-t-[#6c5ce7] rounded-full"
        />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <p className="text-white/40 mb-4" style={{ fontSize: '1rem' }}>{t('chd_not_found')}</p>
        <button
          onClick={() => navigate('/challenges')}
          className="text-[#a29bfe]"
          style={{ fontSize: '0.9375rem' }}
        >
          {t('chd_back')}
        </button>
      </div>
    );
  }

  const config = TYPE_CONFIG[challenge.type] || TYPE_CONFIG.solo;
  const TypeIcon = config.icon;
  const daysRemaining = Math.max(0, Math.ceil((new Date(challenge.endAt).getTime() - Date.now()) / 86400000));
  const daysPassed = Math.max(0, Math.ceil((Date.now() - new Date(challenge.startAt).getTime()) / 86400000));
  const progressPercent = challenge.durationDays > 0 ? Math.min(100, Math.round((daysPassed / challenge.durationDays) * 100)) : 0;
  const isPrivate = challenge.visibility === 'private';

  // Sort members: by doneDays desc
  const sortedMembers = [...(challenge.members || [])].sort((a, b) => (b.doneDays || 0) - (a.doneDays || 0));

  return (
    <div className="min-h-screen pb-8">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 right-0 w-72 h-72 rounded-full bg-[#6c5ce7]/12 blur-[120px]" />
        <div className="absolute bottom-20 -left-20 w-60 h-60 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-white/[0.1] shadow-2xl"
          >
            <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader
          title={challenge.title}
          subtitle={config.label.toUpperCase()}
          actions={
            challenge.isMember ? (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  hapticFeedback('light');
                  const shareText = isPrivate && challenge.inviteCode
                    ? t('share_private_text', { title: challenge.title, code: challenge.inviteCode })
                    : t('share_challenge_text', { title: challenge.title });
                  shareTelegram(inviteLink, shareText);
                }}
                className="w-10 h-10 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 flex items-center justify-center"
              >
                <Share2 className="w-4.5 h-4.5 text-[#a29bfe]" />
              </motion.button>
            ) : undefined
          }
        />

        {/* Status card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <GlassCard variant="elevated" className="mb-4">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                <TypeIcon className={`w-6 h-6 ${config.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="flex items-center gap-1 text-white/50" style={{ fontSize: '0.8125rem' }}>
                    <Users className="w-3.5 h-3.5" /> {t('chd_members', { count: challenge.memberCount })}
                  </span>
                  <span className="flex items-center gap-1 text-white/50" style={{ fontSize: '0.8125rem' }}>
                    <Clock className="w-3.5 h-3.5" /> {t('chd_days_left', { count: daysRemaining })}
                  </span>
                </div>
                {challenge.depositAmount > 0 && (
                  <div className="flex items-center gap-1">
                    {challenge.currency === 'stars' ? <Star className="w-3.5 h-3.5 text-yellow-400" /> : <Gem className="w-3.5 h-3.5 text-blue-400" />}
                    <span className="text-white/60" style={{ fontSize: '0.8125rem' }}>
                      {t('chd_per_person', { amount: challenge.depositAmount, currency: challenge.currency === 'stars' ? 'Stars' : 'TON' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>{t('chd_day_of', { current: daysPassed, total: challenge.durationDays })}</span>
                <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>{progressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]" />
              </div>
            </div>
            {challenge.rulesText && (
              <div className="mt-3 pt-3 border-t border-white/[0.05]">
                <p className="text-white/25 mb-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>{t('chd_rules')}</p>
                <p className="text-white/45" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{challenge.rulesText}</p>
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Join button (open) */}
        {!challenge.isMember && challenge.status === 'active' && !isPrivate && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleJoin()} disabled={isJoining}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-2.5 shadow-lg"
              style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}>
              {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><Users className="w-5 h-5" />{t('chd_join')}{challenge.depositAmount > 0 && ` \u00B7 ${challenge.depositAmount} ${challenge.currency === 'stars' ? 'Stars' : 'TON'}`}</>)}
            </motion.button>
          </motion.div>
        )}

        {/* Join by code (private) */}
        {!challenge.isMember && challenge.status === 'active' && isPrivate && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
            <GlassCard variant="elevated" padding="md">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <p className="text-white/60" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('chd_enter_code_to_join')}</p>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); setCodeError(null); }}
                  placeholder={t('ch_code_placeholder')} className="flex-1 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-center tracking-[0.2em] placeholder:text-white/20 placeholder:tracking-normal outline-none font-mono"
                  style={{ fontSize: '1.25rem', fontWeight: 700 }} maxLength={8} onKeyDown={(e) => { if (e.key === 'Enter' && joinCode.trim()) handleJoin(joinCode.trim()); }} />
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => joinCode.trim() && handleJoin(joinCode.trim())} disabled={!joinCode.trim() || isJoining}
                  className={`h-12 px-5 rounded-xl flex items-center justify-center shrink-0 transition-all ${joinCode.trim() && !isJoining ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white' : 'bg-white/[0.04] text-white/20'}`}
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : t('ch_join_btn')}
                </motion.button>
              </div>
              {codeError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400/80 text-center" style={{ fontSize: '0.8125rem' }}>{codeError}</motion.p>}
            </GlassCard>
          </motion.div>
        )}

        {/* Invite code (private, member) */}
        {challenge.isMember && isPrivate && challenge.inviteCode && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mb-4">
            <GlassCard variant="elevated" padding="md">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <p className="text-white/60" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('chd_invite_code')}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/[0.06] rounded-xl px-4 py-3 text-center">
                  <p className="text-white font-mono" style={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '0.3em' }}>{challenge.inviteCode}</p>
                </div>
                <motion.button whileTap={{ scale: 0.93 }} onClick={handleCopyCode} className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${codeCopied ? 'bg-emerald-500/20' : 'bg-white/[0.06]'}`}>
                  {codeCopied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-white/40" />}
                </motion.button>
              </div>
              <p className="text-white/25 text-center mt-2" style={{ fontSize: '0.75rem' }}>{t('chd_share_code_hint')}</p>
            </GlassCard>
          </motion.div>
        )}

        {/* Invite link (open, member) */}
        {challenge.isMember && challenge.visibility !== 'private' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mb-6">
            <GlassCard variant="elevated" padding="md">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="w-4 h-4 text-[#a29bfe]" />
                <p className="text-white/60" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('chd_invite')}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2.5 truncate">
                  <p className="text-white/50 truncate" style={{ fontSize: '0.75rem' }}>{inviteLink}</p>
                </div>
                <motion.button whileTap={{ scale: 0.93 }} onClick={handleCopy} className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${copied ? 'bg-emerald-500/20' : 'bg-white/[0.06]'}`}>
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/40" />}
                </motion.button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Animated Podium (top 3) */}
        {sortedMembers.length >= 2 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }} className="mb-6">
            <h3 className="text-white/50 mb-4 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
              {t('lb_title')}
            </h3>
            <div className="flex items-end justify-center gap-3 mb-4">
              {/* 2nd place */}
              {sortedMembers[1] && (
                <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200 }} className="flex flex-col items-center w-24">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-400/30 to-gray-500/20 border-2 border-gray-400/30 flex items-center justify-center mb-1.5">
                    <span className="text-white/80" style={{ fontSize: '1rem', fontWeight: 700 }}>{sortedMembers[1].userName?.charAt(0) || '?'}</span>
                  </div>
                  <p className="text-white/70 text-center truncate w-full" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{sortedMembers[1].userName}</p>
                  <p className="text-gray-400" style={{ fontSize: '0.625rem', fontWeight: 700 }}>{t('lb_2nd')}</p>
                  <div className="w-full h-16 rounded-t-xl bg-gradient-to-t from-gray-500/10 to-gray-400/5 border border-gray-400/10 border-b-0 mt-1.5 flex flex-col items-center justify-center">
                    <span className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('lb_days_done', { n: sortedMembers[1].doneDays || 0 })}</span>
                    {(sortedMembers[1].streak || 0) > 0 && <span className="flex items-center gap-0.5 text-orange-400" style={{ fontSize: '0.625rem' }}><Flame className="w-2.5 h-2.5" />{sortedMembers[1].streak}</span>}
                  </div>
                </motion.div>
              )}
              {/* 1st place */}
              {sortedMembers[0] && (
                <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }} className="flex flex-col items-center w-28 -mb-0">
                  <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400/40 to-amber-500/30 border-2 border-yellow-400/50 flex items-center justify-center mb-1.5" style={{ boxShadow: '0 0 20px rgba(251,191,36,0.2)' }}>
                    <span className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{sortedMembers[0].userName?.charAt(0) || '?'}</span>
                  </motion.div>
                  <p className="text-white text-center truncate w-full" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{sortedMembers[0].userName}</p>
                  <p className="text-yellow-400" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{t('lb_1st')}</p>
                  <div className="w-full h-24 rounded-t-xl bg-gradient-to-t from-yellow-500/10 to-yellow-400/5 border border-yellow-400/15 border-b-0 mt-1.5 flex flex-col items-center justify-center" style={{ boxShadow: '0 -4px 20px rgba(251,191,36,0.08)' }}>
                    <Trophy className="w-5 h-5 text-yellow-400 mb-1" />
                    <span className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{t('lb_days_done', { n: sortedMembers[0].doneDays || 0 })}</span>
                    {(sortedMembers[0].streak || 0) > 0 && <span className="flex items-center gap-0.5 text-orange-400 mt-0.5" style={{ fontSize: '0.6875rem' }}><Flame className="w-3 h-3" />{sortedMembers[0].streak} {t('lb_streak')}</span>}
                  </div>
                </motion.div>
              )}
              {/* 3rd place */}
              {sortedMembers[2] && (
                <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, type: 'spring', stiffness: 200 }} className="flex flex-col items-center w-24">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400/25 to-orange-500/15 border-2 border-orange-400/25 flex items-center justify-center mb-1.5">
                    <span className="text-white/80" style={{ fontSize: '1rem', fontWeight: 700 }}>{sortedMembers[2].userName?.charAt(0) || '?'}</span>
                  </div>
                  <p className="text-white/70 text-center truncate w-full" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{sortedMembers[2].userName}</p>
                  <p className="text-orange-400" style={{ fontSize: '0.625rem', fontWeight: 700 }}>{t('lb_3rd')}</p>
                  <div className="w-full h-12 rounded-t-xl bg-gradient-to-t from-orange-500/8 to-orange-400/3 border border-orange-400/10 border-b-0 mt-1.5 flex flex-col items-center justify-center">
                    <span className="text-white/50" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('lb_days_done', { n: sortedMembers[2].doneDays || 0 })}</span>
                    {(sortedMembers[2].streak || 0) > 0 && <span className="flex items-center gap-0.5 text-orange-400" style={{ fontSize: '0.625rem' }}><Flame className="w-2.5 h-2.5" />{sortedMembers[2].streak}</span>}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Full member list */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <h3 className="text-white/50 mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('chd_participants', { count: sortedMembers.length })}
          </h3>
          <div className="space-y-2">
            {sortedMembers.map((member, i) => (
              <MemberRow key={member.id} member={member} rank={i + 1} durationDays={challenge.durationDays} isCurrentUser={member.userId === user?.id || member.userId === 'user_demo'} />
            ))}
          </div>
          {sortedMembers.length === 0 && (
            <GlassCard padding="md" className="flex items-center justify-center">
              <p className="text-white/25" style={{ fontSize: '0.875rem' }}>{t('chd_no_participants')}</p>
            </GlassCard>
          )}
        </motion.div>

        {/* Member status */}
        {challenge.isMember && challenge.status === 'active' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-6">
            <GlassCard variant="accent" padding="md" className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#a29bfe] shrink-0" />
              <div>
                <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t('chd_you_in')}</p>
                <p className="text-white/30" style={{ fontSize: '0.75rem' }}>
                  {challenge.depositAmount > 0 ? t('chd_deposit_frozen') : t('chd_stay_committed')}
                  {' \u00B7 '}{t('chd_keep_completing')}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Settled / Completed banner */}
        {(challenge.status === 'settled' || challenge.status === 'completed') && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }} className="mt-4">
            <GlassCard padding="md" className="border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-400" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {t('chd_settled_banner')}
                  </p>
                  <p className="text-white/30" style={{ fontSize: '0.75rem' }}>
                    {t('chd_settled_desc')}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Action buttons: Leave + Settle */}
        {challenge.isMember && challenge.status === 'active' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4 flex gap-3">
            {/* Leave button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                hapticFeedback('medium');
                setShowLeaveConfirm(true);
              }}
              className="flex-1 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center gap-2"
              style={{ fontSize: '0.875rem', fontWeight: 500 }}
            >
              <LogOut className="w-4 h-4" />
              {t('chd_leave')}
            </motion.button>

            {/* Settle button (only for owner or if expired) */}
            {(challenge.ownerId === user?.id || daysRemaining === 0) && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={async () => {
                  if (!id) return;
                  hapticFeedback('medium');
                  setIsSettling(true);
                  try {
                    const result = await api.settleChallenge(id);
                    setChallenge(result);
                    hapticSuccess();
                    showToast(t('chd_settled_toast'));
                  } catch (err: any) {
                    console.error('[ChallengeDetail] Settle error:', err);
                    if (err.code === 'ALREADY_SETTLED') {
                      showToast(t('chd_settled_already'));
                    } else {
                      showToast(t('chd_settle_error'));
                    }
                  } finally {
                    setIsSettling(false);
                  }
                }}
                disabled={isSettling}
                className="flex-1 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center gap-2"
                style={{ fontSize: '0.875rem', fontWeight: 500 }}
              >
                {isSettling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
                {t('chd_settle')}
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* Leave confirmation modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLeaveConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-liquid-glass glass-sheet glass-sheet-center p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {t('chd_leave_title')}
                  </h3>
                </div>
              </div>

              {challenge.depositAmount > 0 ? (
                <div className="mb-5">
                  <p className="text-white/50 mb-3" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {t('chd_leave_penalty_desc')}
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/15">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-red-400" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      {t('chd_leave_penalty')}: {challenge.depositAmount} {challenge.currency === 'stars' ? 'Stars' : 'TON'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-white/50 mb-5" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {t('chd_leave_confirm_desc')}
                </p>
              )}

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 h-12 rounded-xl bg-white/[0.06] text-white/60"
                  style={{ fontSize: '0.9375rem', fontWeight: 500 }}
                >
                  {t('cancel')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    if (!id) return;
                    setIsLeaving(true);
                    try {
                      const result = await api.leaveChallenge(id);
                      setChallenge(result);
                      hapticFeedback('heavy');
                      setShowLeaveConfirm(false);
                      showToast(t('chd_left_toast'));
                    } catch (err: any) {
                      console.error('[ChallengeDetail] Leave error:', err);
                      showToast(t('error'));
                    } finally {
                      setIsLeaving(false);
                    }
                  }}
                  disabled={isLeaving}
                  className="flex-1 h-12 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center gap-2"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {isLeaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  {t('chd_leave')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Member Row ----
function MemberRow({
  member,
  rank,
  durationDays,
  isCurrentUser,
}: {
  member: ChallengeMember;
  rank: number;
  durationDays: number;
  isCurrentUser: boolean;
}) {
  const { t } = useTranslation();
  const statusConfig = STATUS_ICONS[member.todayStatus || 'pending'] || STATUS_ICONS.pending;
  const StatusIcon = statusConfig.icon;
  const progressPercent = durationDays > 0 ? Math.round(((member.doneDays || 0) / durationDays) * 100) : 0;

  // Settlement status badge
  const isSettled = member.status === 'completed' || member.status === 'failed' || member.status === 'left';
  const settleBadge = member.status === 'completed'
    ? { label: t('chd_member_completed'), color: 'text-emerald-400', bg: 'bg-emerald-500/15' }
    : member.status === 'failed'
    ? { label: t('chd_member_failed'), color: 'text-red-400', bg: 'bg-red-500/15' }
    : member.status === 'left'
    ? { label: t('chd_member_left'), color: 'text-white/40', bg: 'bg-white/[0.06]' }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <GlassCard
        variant={isCurrentUser ? 'accent' : 'default'}
        padding="sm"
        className={`flex items-center gap-3 ${member.status === 'left' ? 'opacity-50' : ''}`}
      >
        {/* Rank */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          rank === 1 ? 'bg-yellow-400/15' : rank === 2 ? 'bg-gray-400/10' : rank === 3 ? 'bg-orange-400/10' : 'bg-white/[0.04]'
        }`}>
          {rank <= 3 ? (
            <Trophy className={`w-3.5 h-3.5 ${
              rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-400' : 'text-orange-400'
            }`} />
          ) : (
            <span className="text-white/30" style={{ fontSize: '0.75rem', fontWeight: 600 }}>#{rank}</span>
          )}
        </div>

        {/* Avatar + Name */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6c5ce7]/30 to-[#a29bfe]/30 flex items-center justify-center shrink-0">
          <span className="text-white/70" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            {member.userName?.charAt(0) || '?'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              {member.userName}
            </p>
            {isCurrentUser && (
              <span className="text-[#a29bfe]" style={{ fontSize: '0.625rem', fontWeight: 600 }}>{t('chd_you_tag')}</span>
            )}
            {settleBadge && (
              <span className={`${settleBadge.color} ${settleBadge.bg} px-1.5 py-0.5 rounded-full`} style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                {settleBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>
              {t('chd_days_progress', { done: member.doneDays || 0, total: durationDays })}
            </span>
            {(member.streak || 0) > 0 && (
              <span className="flex items-center gap-0.5 text-orange-400" style={{ fontSize: '0.6875rem' }}>
                <Flame className="w-3 h-3" /> {member.streak}
              </span>
            )}
            {(member as any).poolBonus > 0 && (
              <span className="flex items-center gap-0.5 text-yellow-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                +{(member as any).poolBonus} {t('chd_pool_bonus')}
              </span>
            )}
          </div>
        </div>

        {/* Today status or settlement icon */}
        {isSettled ? (
          <div className={`w-8 h-8 rounded-lg ${settleBadge?.bg || 'bg-white/[0.04]'} flex items-center justify-center shrink-0`}>
            {member.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : member.status === 'failed' ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <LogOut className="w-4 h-4 text-white/30" />
            )}
          </div>
        ) : (
          <div className={`w-8 h-8 rounded-lg ${statusConfig.bg} flex items-center justify-center shrink-0`}>
            <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
          </div>
        )}

        {/* Progress mini bar */}
        <div className="w-10 shrink-0">
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-white/20 text-center mt-0.5" style={{ fontSize: '0.5625rem' }}>{progressPercent}%</p>
        </div>
      </GlassCard>
    </motion.div>
  );
}
// =============================================
// PROPER FOOD AI — Admin Panel (/admin)
// =============================================
// Super Admin: @dozorir (tgId: 5772448919) + @tezam_by (tgId: 7879078497)
// Features: user list with sort, subscription management,
// broadcast messages with media & inline button support,
// top referrers leaderboard, referral sorting.
// =============================================

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Crown,
  Search,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  Send,
  Image,
  Video,
  Loader2,
  Check,
  X,
  BarChart3,
  Megaphone,
  Shield,
  Clock,
  UserPlus,
  Star,
  Bell,
  Bold,
  Italic,
  Underline,
  Upload,
  Trash2,
  AlertTriangle,
  ArrowUpDown,
  Link,
  Trophy,
  Mic,
  MessageSquare,
  Play,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { AdminUser } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';

const AdminNotificationsSection = lazy(async () => {
  const m = await import('./admin-notifications-templates');
  return { default: m.AdminNotificationsSection };
});

type Tab = 'stats' | 'users' | 'broadcast' | 'social' | 'ab' | 'notif';

export function AdminPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('stats');

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30" style={{ background: 'var(--glass-bg-panel)', backdropFilter: 'blur(var(--glass-blur-panel))', borderBottom: '1px solid var(--glass-border-subtle)' }}>
        <div className="px-5 pb-3 flex items-center justify-center" style={{ paddingTop: '6px' }}>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#a29bfe]" />
            <h1 className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {t('adm_title')}
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {([
            { id: 'stats' as Tab, icon: BarChart3, label: t('adm_tab_stats') },
            { id: 'users' as Tab, icon: Users, label: t('adm_tab_users') },
            { id: 'broadcast' as Tab, icon: Megaphone, label: t('adm_tab_broadcast') },
            { id: 'social' as Tab, icon: Star, label: t('adm_tab_social') },
            { id: 'notif' as Tab, icon: Bell, label: t('adm_tab_notif') },
            { id: 'ab' as Tab, icon: BarChart3, label: 'A/B' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => { hapticFeedback('light'); setActiveTab(tab.id); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                activeTab === tab.id
                  ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                  : 'bg-ui-button text-muted-foreground border border-transparent'
              }`}
              style={{ fontSize: '0.8125rem', fontWeight: 500 }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pt-4">
        {activeTab === 'stats' && <StatsSection />}
        {activeTab === 'users' && <UsersSection />}
        {activeTab === 'broadcast' && <BroadcastSection />}
        {activeTab === 'social' && <SocialTasksSection />}
        {activeTab === 'notif' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <AdminNotificationsSection />
          </Suspense>
        )}
        {activeTab === 'ab' && <AbTestingSection />}
      </div>
    </div>
  );
}

// ---- Stats Section ----
function StatsSection() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetStats()
      .then(setStats)
      .catch(err => console.error('[Admin] Stats error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: t('adm_total_users'), value: stats.totalUsers, icon: Users, color: '#a29bfe' },
    { label: t('adm_subscribers'), value: stats.activeSubscribers, icon: Crown, color: '#6c5ce7' },
    { label: t('adm_expired'), value: stats.expiredSubscribers, icon: Clock, color: '#e17055' },
    { label: t('adm_new_today'), value: stats.newToday, icon: UserPlus, color: '#00cec9' },
    { label: t('adm_referrals'), value: stats.totalReferrals, icon: Users, color: '#fdcb6e' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className="w-4 h-4" style={{ color: card.color }} />
                <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{card.label}</span>
              </div>
              <span className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{card.value}</span>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Top Referrers */}
      {stats.topReferrers && stats.topReferrers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-[#fdcb6e]" />
              <span className="text-foreground/60" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('adm_top_referrers')}
              </span>
            </div>
            <div className="space-y-2">
              {stats.topReferrers.map((ref: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-muted-foreground w-5 text-center shrink-0" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <span className="text-foreground truncate block" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                        {ref.displayName}
                      </span>
                      {ref.telegramUsername && (
                        <span className="text-[#a29bfe] block" style={{ fontSize: '0.6875rem' }}>
                          @{ref.telegramUsername}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Users className="w-3 h-3 text-[#fdcb6e]" />
                    <span className="text-[#fdcb6e]" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                      {ref.referralCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}

// ---- A/B Testing Analytics Section ----
function AbTestingSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetAbAnalytics()
      .then(setData)
      .catch(err => console.error('[Admin] A/B analytics error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, daily } = data;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Voice', value: summary.voiceGroupSize, color: '#f27059', icon: Mic },
          { label: 'Text', value: summary.textGroupSize, color: '#a29bfe', icon: MessageSquare },
          { label: 'Both', value: summary.bothGroupSize, color: '#00cec9', icon: Users },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard className="p-3 text-center">
              <card.icon className="w-4 h-4 mx-auto mb-1" style={{ color: card.color }} />
              <span className="text-foreground block" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{card.value}</span>
              <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{card.label}</span>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Daily Engagement Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[#a29bfe]" />
            <span className="text-foreground/60" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              7-Day Engagement: Voice vs Text
            </span>
          </div>

          {/* Header */}
          <div className="grid grid-cols-4 gap-1 mb-2 px-1">
            <span className="text-ui-text-tertiary" style={{ fontSize: '0.625rem', fontWeight: 600 }}>Date</span>
            <span className="text-rose-400 text-center" style={{ fontSize: '0.625rem', fontWeight: 600 }}>Voice</span>
            <span className="text-[#a29bfe] text-center" style={{ fontSize: '0.625rem', fontWeight: 600 }}>Text</span>
            <span className="text-cyan-400 text-center" style={{ fontSize: '0.625rem', fontWeight: 600 }}>Both</span>
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {(daily || []).map((day: any) => (
              <div key={day.date} className="grid grid-cols-4 gap-1 px-1 py-1.5 rounded-lg hover:bg-ui-button/50 transition-colors">
                <span className="text-foreground/70" style={{ fontSize: '0.6875rem' }}>
                  {day.date.slice(5)}
                </span>
                <div className="text-center">
                  <span className="text-rose-400" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {day.voice.rate}%
                  </span>
                  <span className="text-ui-text-tertiary block" style={{ fontSize: '0.5625rem' }}>
                    {day.voice.active}/{day.voice.total}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[#a29bfe]" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {day.text.rate}%
                  </span>
                  <span className="text-ui-text-tertiary block" style={{ fontSize: '0.5625rem' }}>
                    {day.text.active}/{day.text.total}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-cyan-400" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {day.both.rate}%
                  </span>
                  <span className="text-ui-text-tertiary block" style={{ fontSize: '0.5625rem' }}>
                    {day.both.active}/{day.both.total}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Average */}
          {daily && daily.length > 0 && (() => {
            const avgVoice = daily.reduce((s: number, d: any) => s + d.voice.rate, 0) / daily.length;
            const avgText = daily.reduce((s: number, d: any) => s + d.text.rate, 0) / daily.length;
            const avgBoth = daily.reduce((s: number, d: any) => s + d.both.rate, 0) / daily.length;
            const winner = avgVoice > avgText ? (avgVoice > avgBoth ? 'Voice' : 'Both') : (avgText > avgBoth ? 'Text' : 'Both');
            return (
              <div className="mt-3 pt-3 border-t border-[var(--glass-border-subtle)]">
                <div className="grid grid-cols-4 gap-1 px-1">
                  <span className="text-foreground/80" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>AVG</span>
                  <span className="text-rose-400 text-center" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{avgVoice.toFixed(0)}%</span>
                  <span className="text-[#a29bfe] text-center" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{avgText.toFixed(0)}%</span>
                  <span className="text-cyan-400 text-center" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{avgBoth.toFixed(0)}%</span>
                </div>
                <div className="text-center mt-2">
                  <span className="px-3 py-1 rounded-full text-foreground/80" style={{
                    fontSize: '0.6875rem', fontWeight: 600,
                    background: winner === 'Voice' ? 'rgba(242,112,89,0.15)' : winner === 'Text' ? 'rgba(162,155,254,0.15)' : 'rgba(0,206,201,0.15)',
                    border: `1px solid ${winner === 'Voice' ? 'rgba(242,112,89,0.3)' : winner === 'Text' ? 'rgba(162,155,254,0.3)' : 'rgba(0,206,201,0.3)'}`,
                  }}>
                    Winner: {winner} ({Math.max(avgVoice, avgText, avgBoth).toFixed(0)}% engagement)
                  </span>
                </div>
              </div>
            );
          })()}
        </GlassCard>
      </motion.div>

      {/* Info */}
      <div className="rounded-xl bg-[var(--glass-bg-row)] p-3">
        <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>
          A/B groups are auto-assigned based on Voice Coach setting. Users with Voice Coach ON = "voice" group, OFF = "text" group. Engagement = logged food or exercise that day.
        </p>
      </div>
    </div>
  );
}

// ---- AI Nag Button Component ----
function AiNagButton({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; voiceSent: boolean } | null>(null);
  const [error, setError] = useState('');

  const handleNag = async (mode: 'voice' | 'text' | 'both') => {
    setLoading(true);
    setResult(null);
    setError('');
    hapticFeedback('medium');
    try {
      const res = await api.adminAiNag({
        userId,
        sendVoice: mode === 'voice' || mode === 'both',
        sendText: mode === 'text' || mode === 'both',
      });
      if (res.success) {
        hapticSuccess();
        setResult(res);
      } else {
        setError('Failed');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => handleNag('voice')}
          disabled={loading}
          className="flex-1 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ fontSize: '0.75rem', fontWeight: 600 }}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
          {t('adm_ai_nag_voice')}
        </button>
        <button
          onClick={() => handleNag('both')}
          disabled={loading}
          className="flex-1 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ fontSize: '0.75rem', fontWeight: 600 }}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          {t('adm_ai_nag_both')}
        </button>
      </div>
      {result && (
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-emerald-400 mb-1" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
            {t('adm_ai_nag_sent')} ({result.voiceSent ? '🎤+📝' : '📝'})
          </div>
          <div className="text-foreground/70 italic" style={{ fontSize: '0.75rem' }}>
            "{result.message}"
          </div>
        </div>
      )}
      {error && (
        <div className="text-red-400" style={{ fontSize: '0.75rem' }}>{error}</div>
      )}
    </div>
  );
}

// ---- Users Section ----
function UsersSection() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [sort, setSort] = useState<'date' | 'referrals' | 'name'>('date');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [grantDays, setGrantDays] = useState(30);
  const searchTimeout = useRef<any>(null);

  // Hide tab bar when user detail sheet is open
  useBottomSheetLifecycle(!!selectedUser);

  // New admin features state
  const [notifText, setNotifText] = useState('');
  const [notifStatus, setNotifStatus] = useState<'sent' | 'error' | null>(null);
  const [notifError, setNotifError] = useState<string>('');
  // Credit wallet removed — only subscription management is available
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [voiceSending, setVoiceSending] = useState(false);

  const fetchUsers = useCallback(async (p: number = 1, s: string = search, f: string = filter, st: string = sort) => {
    setLoading(true);
    try {
      const res = await api.adminGetUsers({ page: p, limit: 20, search: s, filter: f, sort: st });
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(res.page);
    } catch (err) {
      console.error('[Admin] Users error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filter, sort]);

  useEffect(() => {
    fetchUsers(1, search, filter, sort);
  }, [filter, sort]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchUsers(1, val, filter, sort);
    }, 400);
  };

  const handleGrantSubscription = async (userId: string, days: number) => {
    setActionLoading(true);
    try {
      await api.adminUpdateSubscription(userId, 'grant', days);
      hapticSuccess();
      await fetchUsers(page, search, filter);
      setSelectedUser(null);
    } catch (err) {
      console.error('[Admin] Grant error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeSubscription = async (userId: string) => {
    setActionLoading(true);
    try {
      await api.adminUpdateSubscription(userId, 'revoke');
      hapticSuccess();
      await fetchUsers(page, search, filter);
      setSelectedUser(null);
    } catch (err) {
      console.error('[Admin] Revoke error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectUser = useCallback((user: AdminUser) => {
    hapticFeedback('light');
    setSelectedUser(user);
    setNotifText('');
    setNotifStatus(null);
    setDeleteConfirm(false);
    setDeleteStatus(null);
  }, []);

  const handleSendNotification = async (userId: string) => {
    if (!notifText.trim()) return;
    setActionLoading(true);
    setNotifStatus(null);
    setNotifError('');
    try {
      const res = await api.adminSendNotification(userId, notifText.trim());
      if (res.success) {
        hapticSuccess();
        setNotifStatus('sent');
        setNotifText('');
      } else {
        setNotifStatus('error');
        setNotifError(res.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('[Admin] Notification error:', err);
      setNotifStatus('error');
      setNotifError(err?.message || String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendVoiceToUser = async (userId: string) => {
    if (!notifText.trim()) return;
    setVoiceSending(true);
    setNotifStatus(null);
    setNotifError('');
    try {
      const res = await api.adminSendVoice({ userId, text: notifText.trim() });
      if (res.success) {
        hapticSuccess();
        setNotifStatus('sent');
        setNotifText('');
      } else {
        setNotifStatus('error');
        setNotifError(res.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('[Admin] Voice send error:', err);
      setNotifStatus('error');
      setNotifError(err?.message || String(err));
    } finally {
      setVoiceSending(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(true);
    setDeleteStatus(null);
    try {
      const res = await api.adminDeleteUser(userId);
      if (res.success) {
        hapticSuccess();
        setDeleteStatus('OK');
        await fetchUsers(page, search, filter);
        setSelectedUser(null);
      } else {
        setDeleteStatus('Error');
      }
    } catch (err) {
      console.error('[Admin] Delete error:', err);
      setDeleteStatus('Error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('adm_search_placeholder')}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none focus:border-[#6c5ce7]/30" style={{ fontSize: '0.875rem', borderColor: 'var(--glass-border)' }}
        />
      </div>

      {/* Filter & Sort */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {(['all', 'active', 'expired'] as const).map(f => (
          <button
            key={f}
            onClick={() => { hapticFeedback('light'); setFilter(f); }}
            className={`px-3 py-1 rounded-full transition-all ${
              filter === f
                ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                : 'bg-ui-button text-muted-foreground border border-transparent'
            }`}
            style={{ fontSize: '0.75rem', fontWeight: 500 }}
          >
            {f === 'all' ? t('adm_filter_all')
              : f === 'active' ? t('adm_filter_active')
              : t('adm_filter_expired')}
          </button>
        ))}
        <span className="ml-auto text-ui-tertiary self-center" style={{ fontSize: '0.75rem' }}>
          {total} {t('adm_users_count')}
        </span>
      </div>
      <div className="flex gap-2 mb-4">
        <ArrowUpDown className="w-3.5 h-3.5 text-ui-tertiary self-center shrink-0" />
        {(['date', 'referrals', 'name'] as const).map(s => (
          <button
            key={s}
            onClick={() => { hapticFeedback('light'); setSort(s); }}
            className={`px-2.5 py-1 rounded-full transition-all ${
              sort === s
                ? 'bg-[#00cec9]/15 text-[#00cec9] border border-[#00cec9]/30'
                : 'bg-ui-button text-muted-foreground border border-transparent'
            }`}
            style={{ fontSize: '0.6875rem', fontWeight: 500 }}
          >
            {s === 'date' ? t('adm_sort_date') : s === 'referrals' ? t('adm_sort_referrals') : t('adm_sort_name')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-[#a29bfe] animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={() => handleSelectUser(user)}
                className="w-full text-left"
              >
                <GlassCard className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: 'var(--glass-bg-row)' }}>
                      {user.photoUrl ? (
                        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-4 h-4 text-ui-tertiary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {user.displayName}
                        </span>
                        {user.isSubscriptionActive && (
                          <Crown className="w-3.5 h-3.5 text-[#6c5ce7] shrink-0" />
                        )}
                      </div>
                      {user.telegramUsername && (
                        <span className="text-[#a29bfe] block" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                          @{user.telegramUsername}
                        </span>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                          ID: {user.telegramId}
                        </span>
                        {user.height && user.weight ? (
                          <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                            {user.height}{t('adm_cm')} · {user.weight}{t('adm_kg')}
                          </span>
                        ) : (
                          <span className="text-ui-tertiary italic" style={{ fontSize: '0.6875rem' }}>
                            {t('adm_no_body_data')}
                          </span>
                        )}
                        {(user.referralCount || 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[#fdcb6e]/70" style={{ fontSize: '0.6875rem' }}>
                            <Users className="w-2.5 h-2.5" />
                            {user.referralCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-1">
                      {user.isSubscriptionActive ? (
                        <span className="text-green-400" style={{ fontSize: '0.6875rem' }}>
                          {t('adm_sub_active')}
                        </span>
                      ) : (
                        <span className="text-red-400/60" style={{ fontSize: '0.6875rem' }}>
                          {t('adm_sub_expired')}
                        </span>
                      )}
                      {user.subscriptionExpiresAt && (
                        <div className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                          {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
                        </div>
                      )}
                      {(user.totalPaid || 0) > 0 && (
                        <div className="flex items-center gap-0.5 justify-end mt-0.5">
                          <Star className="w-2.5 h-2.5 text-amber-400" />
                          <span className="text-amber-400/70" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                            {user.totalPaid}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => fetchUsers(page - 1, search, filter)}
            disabled={page <= 1}
            className="w-8 h-8 rounded-full bg-ui-button flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => fetchUsers(page + 1, search, filter)}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full bg-ui-button flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
            onClick={() => setSelectedUser(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: 'var(--glass-bg-panel)', borderTop: '1px solid var(--glass-border)', backdropFilter: 'blur(var(--glass-blur-panel))' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Close button + avatar */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: 'var(--glass-bg-row)' }}>
                  {selectedUser.photoUrl ? (
                    <img src={selectedUser.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5 text-ui-tertiary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {selectedUser.displayName}
                  </h3>
                  {selectedUser.telegramUsername && (
                    <span className="text-[#a29bfe]" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      @{selectedUser.telegramUsername}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>

              {/* User Info */}
              <div className="space-y-2 mb-4">
                <InfoRow label="Telegram ID" value={selectedUser.telegramId} />
                {selectedUser.telegramUsername && <InfoRow label="Username" value={`@${selectedUser.telegramUsername}`} />}
                {selectedUser.phoneNumber && <InfoRow label={t('adm_phone')} value={selectedUser.phoneNumber} />}
                <InfoRow label={t('adm_language')} value={selectedUser.language?.toUpperCase() || '—'} />
                <InfoRow
                  label={t('adm_height')}
                  value={selectedUser.height ? `${selectedUser.height} ${t('adm_cm')}` : '—'}
                  color={selectedUser.height ? undefined : 'rgba(255,255,255,0.15)'}
                />
                <InfoRow
                  label={t('adm_weight')}
                  value={selectedUser.weight ? `${selectedUser.weight} ${t('adm_kg')}` : '—'}
                  color={selectedUser.weight ? undefined : 'rgba(255,255,255,0.15)'}
                />
                <InfoRow label="XP" value={String(selectedUser.xp)} />
                <InfoRow label={t('adm_referrals')} value={String(selectedUser.referralCount)} />
                <InfoRow
                  label={t('adm_subscription')}
                  value={selectedUser.isSubscriptionActive
                    ? `${t('adm_active_until')} ${new Date(selectedUser.subscriptionExpiresAt!).toLocaleDateString()}`
                    : t('adm_sub_expired')}
                  color={selectedUser.isSubscriptionActive ? '#00cec9' : '#e17055'}
                />
                <InfoRow
                  label={t('adm_registered')}
                  value={new Date(selectedUser.createdAt).toLocaleDateString()}
                />
                <InfoRow
                  label={t('adm_total_paid')}
                  value={selectedUser.totalPaid ? `★ ${selectedUser.totalPaid}` : '—'}
                  color={selectedUser.totalPaid ? '#fdcb6e' : undefined}
                />
              </div>

              {/* ---- Section: Subscription ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-3.5 h-3.5 text-[#6c5ce7]" />
                  <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_section_sub')}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Grant Subscription */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-ui-button rounded-xl px-2 py-1.5">
                      <button onClick={() => setGrantDays(Math.max(1, grantDays - 30))} className="text-muted-foreground p-1">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        value={grantDays}
                        onChange={(e) => setGrantDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 bg-transparent text-center text-foreground outline-none"
                        style={{ fontSize: '0.875rem', fontWeight: 600 }}
                      />
                      <button onClick={() => setGrantDays(grantDays + 30)} className="text-muted-foreground p-1">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-muted-foreground shrink-0" style={{ fontSize: '0.75rem' }}>
                      {t('adm_days')}
                    </span>
                    <button
                      onClick={() => handleGrantSubscription(selectedUser.id, grantDays)}
                      disabled={actionLoading}
                      className="flex-1 py-2 rounded-xl bg-[#6c5ce7] text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {t('adm_grant')}
                    </button>
                  </div>

                  {/* Revoke */}
                  <button
                    onClick={() => handleRevokeSubscription(selectedUser.id)}
                    disabled={actionLoading || !selectedUser.isSubscriptionActive}
                    className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center gap-1.5 disabled:opacity-30"
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    <X className="w-4 h-4" />
                    {t('adm_revoke')}
                  </button>
                </div>
              </div>

              {/* ---- Section: Notifications ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="w-3.5 h-3.5 text-[#a29bfe]" />
                  <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_section_notif')}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Rich text editor */}
                  <div>
                    {/* Formatting Toolbar */}
                    <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                      {[
                        { icon: Bold, tag: 'b', label: 'B' },
                        { icon: Italic, tag: 'i', label: 'I' },
                        { icon: Underline, tag: 'u', label: 'U' },
                      ].map(btn => (
                        <button
                          key={btn.tag}
                          onClick={() => {
                            hapticFeedback('light');
                            setNotifText(prev => `${prev}<${btn.tag}></${btn.tag}>`);
                          }}
                          className="w-7 h-7 rounded bg-ui-button flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-ui-button-active transition-colors"
                          title={btn.label}
                        >
                          <btn.icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                      <div className="w-px h-5 mx-0.5" style={{ background: 'var(--glass-border)' }} />
                      {['😀','🔥','💪','🎯','⭐','🏆','❤️','✅','🚀','💰'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => {
                            hapticFeedback('light');
                            setNotifText(prev => prev + emoji);
                          }}
                          className="w-7 h-7 rounded hover:bg-ui-button flex items-center justify-center transition-colors"
                          style={{ fontSize: '0.875rem' }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={notifText}
                      onChange={(e) => setNotifText(e.target.value)}
                      placeholder={t('adm_notif_placeholder_en')}
                      className="w-full h-20 bg-ui-button rounded-lg p-2.5 text-foreground outline-none resize-none border focus:border-[#6c5ce7]/30"
                      style={{ borderColor: 'var(--glass-border)', fontSize: '0.8125rem' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSendNotification(selectedUser.id)}
                      disabled={actionLoading || !notifText.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-[#6c5ce7] text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t('adm_send')}
                    </button>
                    <button
                      onClick={() => handleSendVoiceToUser(selectedUser.id)}
                      disabled={voiceSending || !notifText.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      {voiceSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {t('adm_send_voice_user')}
                    </button>
                  </div>

                  {/* Notification Status */}
                  {notifStatus && (
                    <div className="text-sm" style={{ color: notifStatus === 'sent' ? '#00cec9' : '#e17055' }}>
                      {notifStatus === 'sent' ? t('adm_notif_sent') : t('adm_error')}
                      {notifError && <span className="ml-1">({notifError})</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Section: AI Coach Nag ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_ai_coach_section')}
                  </span>
                </div>
                <AiNagButton userId={selectedUser.id} userName={selectedUser.displayName || 'User'} />
              </div>

              {/* ---- Section: Delete User ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-3.5 h-3.5 text-[#e17055]" />
                  <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_section_delete')}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Delete User */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      disabled={actionLoading}
                      className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {t('adm_delete_user')}
                    </button>
                  </div>

                  {/* Delete Confirmation */}
                  {deleteConfirm && (
                    <div className="text-sm" style={{ color: '#e17055' }}>
                      {t('adm_delete_confirm')}
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => handleDeleteUser(selectedUser.id)}
                          disabled={actionLoading}
                          className="py-1 px-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center gap-1.5 disabled:opacity-50"
                          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {t('adm_delete_yes')}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="py-1 px-2 rounded bg-ui-button border text-muted-foreground flex items-center justify-center gap-1.5"
                          style={{ borderColor: 'var(--glass-border)', fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                          {t('adm_cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete Status */}
                  {deleteStatus && (
                    <div className="text-sm" style={{ color: deleteStatus === 'OK' ? '#00cec9' : '#e17055' }}>
                      {deleteStatus === 'OK' ? t('adm_user_deleted') : t('adm_error')}
                    </div>
                  )}
                </div>
              </div>
              </div>{/* close scrollable area */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground" style={{ fontSize: '0.8125rem' }}>{label}</span>
      <span className="text-foreground/70" style={{ fontSize: '0.8125rem', fontWeight: 500, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

// ---- Broadcast Section ----
function BroadcastSection() {
  const { t } = useTranslation();
  const [broadcastMode, setBroadcastMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<'all' | 'subscribers' | 'non_subscribers'>('all');
  const [mediaType, setMediaType] = useState<'none' | 'photo' | 'photos' | 'video'>('none');
  const [mediaUrls, setMediaUrls] = useState<string[]>(['']);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [preview, setPreview] = useState(false);
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Voice-specific
  const [voiceType, setVoiceType] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'>('nova');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const addMediaUrl = () => {
    if (mediaUrls.length < 10) {
      setMediaUrls([...mediaUrls, '']);
    }
  };

  const updateMediaUrl = (idx: number, val: string) => {
    const next = [...mediaUrls];
    next[idx] = val;
    setMediaUrls(next);
  };

  const removeMediaUrl = (idx: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (broadcastMode === 'voice') {
      if (!text.trim()) return;
      hapticFeedback('medium');
      setSending(true);
      setResult(null);
      try {
        const res = await api.adminVoiceBroadcast({
          text: text.trim(),
          audience,
          voice: voiceType,
          speed: voiceSpeed,
          buttonText: buttonText.trim() || undefined,
          buttonUrl: buttonUrl.trim() || undefined,
        });
        hapticSuccess();
        setResult(res);
      } catch (err: any) {
        console.error('[Admin] Voice broadcast error:', err);
        setResult({ success: false, error: err.message });
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text.trim() && mediaUrls.every(u => !u.trim())) return;

    hapticFeedback('medium');
    setSending(true);
    setResult(null);

    try {
      const filteredUrls = mediaUrls.filter(u => u.trim());
      const res = await api.adminBroadcast({
        text: text.trim(),
        audience,
        mediaType: mediaType === 'none' ? null : mediaType,
        mediaUrls: filteredUrls.length > 0 ? filteredUrls : undefined,
        buttonText: buttonText.trim() || undefined,
        buttonUrl: buttonUrl.trim() || undefined,
      });
      hapticSuccess();
      setResult(res);
    } catch (err: any) {
      console.error('[Admin] Broadcast error:', err);
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.adminUploadMedia(formData);
        urls.push(res.url);
      }
      setMediaUrls(urls);
    } catch (err: any) {
      console.error('[Admin] Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Broadcast Mode Switcher */}
      <GlassCard className="p-4">
        <div className="text-muted-foreground mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {t('adm_broadcast_mode')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { hapticFeedback('light'); setBroadcastMode('text'); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all flex-1 justify-center ${
              broadcastMode === 'text'
                ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                : 'bg-ui-button text-muted-foreground border border-transparent'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <MessageSquare className="w-4 h-4" />
            {t('adm_text_mode')}
          </button>
          <button
            onClick={() => { hapticFeedback('light'); setBroadcastMode('voice'); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all flex-1 justify-center ${
              broadcastMode === 'voice'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-ui-button text-muted-foreground border border-transparent'
            }`}
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            <Mic className="w-4 h-4" />
            {t('adm_voice_mode')}
          </button>
        </div>
      </GlassCard>

      {/* Audience Selector */}
      <GlassCard className="p-4">
        <div className="text-muted-foreground mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {t('adm_audience')}
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'all' as const, label: t('adm_aud_all'), icon: Users },
            { id: 'subscribers' as const, label: t('adm_aud_subscribers'), icon: Crown },
            { id: 'non_subscribers' as const, label: t('adm_aud_no_sub'), icon: Clock },
          ]).map(a => (
            <button
              key={a.id}
              onClick={() => { hapticFeedback('light'); setAudience(a.id); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all ${
                audience === a.id
                  ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                  : 'bg-ui-button text-muted-foreground border border-transparent'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              <a.icon className="w-3.5 h-3.5" />
              {a.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Voice Settings (voice mode only) */}
      {broadcastMode === 'voice' && (
        <GlassCard className="p-4">
          <div className="text-muted-foreground mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {t('adm_voice_select')}
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {(['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'] as const).map(v => (
              <button
                key={v}
                onClick={() => { hapticFeedback('light'); setVoiceType(v); }}
                className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                  voiceType === v
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-ui-button text-muted-foreground border border-transparent'
                }`}
                style={{ fontSize: '0.75rem' }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{t('adm_voice_speed')}</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={voiceSpeed}
              onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-rose-400"
            />
            <span className="text-rose-400 font-mono" style={{ fontSize: '0.8125rem', minWidth: '2rem' }}>{voiceSpeed.toFixed(1)}x</span>
          </div>
        </GlassCard>
      )}

      {/* Message Text */}
      <GlassCard className="p-4">
        <div className="text-muted-foreground mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {broadcastMode === 'voice' ? t('adm_voice_broadcast') : t('adm_message_text')}
        </div>
        {/* Formatting Toolbar (text mode only) */}
        {broadcastMode === 'text' && (<div className="flex items-center gap-1 mb-2 flex-wrap">
          {[
            { icon: Bold, tag: 'b', label: 'Bold' },
            { icon: Italic, tag: 'i', label: 'Italic' },
            { icon: Underline, tag: 'u', label: 'Underline' },
          ].map(btn => (
            <button
              key={btn.tag}
              onClick={() => {
                hapticFeedback('light');
                setText(prev => `${prev}<${btn.tag}></${btn.tag}>`);
              }}
              className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-ui-button-active transition-colors"
              title={btn.label}
            >
              <btn.icon className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={() => {
              hapticFeedback('light');
              setText(prev => `${prev}<code></code>`);
            }}
            className="h-8 px-2 rounded-lg bg-ui-button flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-ui-button-active transition-colors"
            style={{ fontSize: '0.6875rem', fontFamily: 'monospace' }}
          >
            {'</>'}
          </button>
          <button
            onClick={() => {
              hapticFeedback('light');
              setText(prev => `${prev}<a href=""></a>`);
            }}
            className="h-8 px-2 rounded-lg bg-ui-button flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-ui-button-active transition-colors"
            style={{ fontSize: '0.6875rem' }}
          >
            🔗
          </button>
          <div className="w-px h-6 mx-0.5" style={{ background: 'var(--glass-border)' }} />
          {['😀','🔥','💪','🎯','⭐','🏆','❤️','✅','🚀','💰','🎉','⚡'].map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                hapticFeedback('light');
                setText(prev => prev + emoji);
              }}
              className="w-8 h-8 rounded-lg hover:bg-ui-button flex items-center justify-center transition-colors"
              style={{ fontSize: '0.9375rem' }}
            >
              {emoji}
            </button>
          ))}
        </div>)}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={broadcastMode === 'voice' ? t('adm_voice_text_placeholder') : t('adm_broadcast_placeholder')}
          className="w-full h-32 bg-ui-button rounded-xl p-3 text-foreground outline-none resize-none border focus:border-[#6c5ce7]/30"
          style={{ fontSize: '0.875rem', borderColor: 'var(--glass-border)' }}
        />
        {broadcastMode === 'voice' && text.trim() && (
          <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-rose-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                <Mic className="w-3 h-3" />
                Text → Voice via OpenAI TTS
              </div>
              <button
                onClick={async () => {
                  hapticFeedback('medium');
                  setPreviewLoading(true);
                  try {
                    const res = await api.adminPreviewVoice({ text: text.trim(), voice: voiceType, speed: voiceSpeed });
                    if (res.success && res.audio) {
                      // Convert base64 to blob URL
                      const binary = atob(res.audio);
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                      const blob = new Blob([bytes], { type: 'audio/ogg' });
                      const url = URL.createObjectURL(blob);
                      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
                      setPreviewAudioUrl(url);
                      hapticSuccess();
                    }
                  } catch (err) {
                    console.error('[Admin] Preview voice error:', err);
                  } finally {
                    setPreviewLoading(false);
                  }
                }}
                disabled={previewLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                style={{ fontSize: '0.6875rem', fontWeight: 600 }}
              >
                {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {t('adm_voice_preview')}
              </button>
            </div>
            <div className="text-foreground/60" style={{ fontSize: '0.75rem' }}>
              {text.length} chars · Voice: {voiceType} · Speed: {voiceSpeed}x
            </div>
            {previewAudioUrl && (
              <audio
                ref={audioRef}
                src={previewAudioUrl}
                controls
                autoPlay
                className="w-full mt-2"
                style={{ height: '2rem' }}
              />
            )}
          </div>
        )}
      </GlassCard>

      {/* Media (text mode only) */}
      {broadcastMode === 'text' && (<GlassCard className="p-4">
        <div className="text-muted-foreground mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {t('adm_media')}
        </div>
        <div className="flex gap-2 mb-3">
          {([
            { id: 'none' as const, label: t('adm_media_none') },
            { id: 'photo' as const, label: t('adm_media_photo'), icon: Image },
            { id: 'photos' as const, label: t('adm_media_photos'), icon: Image },
            { id: 'video' as const, label: t('adm_media_video'), icon: Video },
          ]).map(m => (
            <button
              key={m.id}
              onClick={() => {
                hapticFeedback('light');
                setMediaType(m.id);
                if (m.id === 'none') setMediaUrls(['']);
                else if (m.id === 'photo' || m.id === 'video') setMediaUrls(mediaUrls.slice(0, 1).length ? mediaUrls.slice(0, 1) : ['']);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all ${
                mediaType === m.id
                  ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                  : 'bg-ui-button text-muted-foreground border border-transparent'
              }`}
              style={{ fontSize: '0.75rem' }}
            >
              {m.icon && <m.icon className="w-3 h-3" />}
              {m.label}
            </button>
          ))}
        </div>

        {mediaType !== 'none' && (
          <div className="space-y-2">
            {mediaUrls.map((url, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => updateMediaUrl(idx, e.target.value)}
                  placeholder={`URL ${mediaType === 'video' ? t('adm_url_video') : t('adm_url_photo')} ${idx + 1}`}
                  className="flex-1 px-3 py-2 rounded-lg bg-ui-button border text-foreground outline-none"
                  style={{ fontSize: '0.8125rem', borderColor: 'var(--glass-border)' }}
                />
                {mediaUrls.length > 1 && (
                  <button onClick={() => removeMediaUrl(idx)} className="text-ui-tertiary hover:text-red-400 p-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {mediaType === 'photos' && mediaUrls.length < 10 && (
              <button
                onClick={addMediaUrl}
                className="flex items-center gap-1 text-[#a29bfe]"
                style={{ fontSize: '0.8125rem' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('adm_add_photo')}
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              multiple
              accept={mediaType === 'video' ? 'video/*' : 'image/*'}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[#a29bfe]"
              style={{ fontSize: '0.8125rem' }}
            >
              <Upload className="w-3.5 h-3.5" />
              {t('adm_upload')}
            </button>
            {uploading && (
              <Loader2 className="w-4 h-4 text-[#a29bfe] animate-spin" />
            )}
          </div>
        )}
      </GlassCard>)}

      {/* Inline Button */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link className="w-3.5 h-3.5 text-[#a29bfe]" />
          <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {t('adm_button')}
          </span>
          <span className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
            ({t('adm_optional')})
          </span>
        </div>
        <div className="space-y-2">
          <input
            type="text"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder={t('adm_button_text_placeholder')}
            className="w-full px-3 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none" style={{ fontSize: '0.8125rem', borderColor: 'var(--glass-border)' }}
          />
          <input
            type="text"
            value={buttonUrl}
            onChange={(e) => setButtonUrl(e.target.value)}
            placeholder={t('adm_button_url_placeholder')}
            className="w-full px-3 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none"
            style={{ fontSize: '0.8125rem', borderColor: 'var(--glass-border)' }}
          />
          {buttonText.trim() && buttonUrl.trim() && (
            <div className="flex items-center gap-2 pt-1">
              <div className="px-4 py-2 rounded-lg bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe] text-center" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {buttonText}
              </div>
              <span className="text-ui-tertiary truncate flex-1" style={{ fontSize: '0.625rem' }}>
                {buttonUrl}
              </span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Preview */}
      {text.trim() && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {t('adm_preview')}
            </span>
            <button
              onClick={() => setPreview(!preview)}
              className="text-[#a29bfe]"
              style={{ fontSize: '0.75rem' }}
            >
              {preview ? t('adm_hide') : t('adm_show')}
            </button>
          </div>
          {preview && (
            <div className="space-y-2">
              <div
                className="p-3 rounded-xl text-foreground/80"
                style={{ background: 'var(--glass-bg-row)', fontSize: '0.875rem', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: text }}
              />
              {mediaUrls.some(u => u.trim()) && mediaType !== 'none' && (
                <div className="flex gap-1.5 overflow-x-auto py-1">
                  {mediaUrls.filter(u => u.trim()).map((url, i) => (
                    <img key={i} src={url} alt="" className="h-16 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ))}
                </div>
              )}
              {buttonText.trim() && buttonUrl.trim() && (
                <div className="flex justify-center">
                  <div className="px-5 py-2 rounded-lg bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe]" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    {buttonText}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={sending || (broadcastMode === 'voice' ? !text.trim() : (!text.trim() && mediaUrls.every(u => !u.trim())))}
        className={`w-full py-3.5 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform ${
          broadcastMode === 'voice'
            ? 'bg-gradient-to-r from-rose-500 to-rose-400'
            : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
        }`}
        style={{ fontSize: '0.9375rem' }}
      >
        {sending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {broadcastMode === 'voice' && <span style={{ fontSize: '0.8125rem' }}>{t('adm_voice_sending')}</span>}
          </>
        ) : (
          <>
            {broadcastMode === 'voice' ? <Mic className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {broadcastMode === 'voice' ? t('adm_send_voice_all') : t('adm_send_broadcast')}
          </>
        )}
      </button>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard className={`p-4 ${result.success ? 'border-green-500/20' : 'border-red-500/20'}`}>
              {result.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-green-400" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    <Check className="w-4 h-4" />
                    {t('adm_broadcast_sent')}
                  </div>
                  <div className="text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
                    {t('adm_broadcast_result', { sent: result.sent, total: result.total, failed: result.failed })}
                  </div>
                </div>
              ) : (
                <div className="text-red-400" style={{ fontSize: '0.875rem' }}>
                  {t('adm_error')}: {result.error || 'Unknown'}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Social Tasks Section (Admin CRUD) ----
function SocialTasksSection() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const [formPlatform, setFormPlatform] = useState('telegram');
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formRewardDays, setFormRewardDays] = useState('7');
  const [formActive, setFormActive] = useState(true);

  const PLATFORMS = ['telegram', 'instagram', 'youtube', 'tiktok', 'twitter', 'other'];

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminSocialTasks();
      setTasks(res.tasks || []);
    } catch (err) {
      console.error('[Admin] Social tasks load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const resetForm = () => {
    setFormPlatform('telegram');
    setFormName('');
    setFormUrl('');
    setFormImageUrl('');
    setFormRewardDays('7');
    setFormActive(true);
    setEditingTask(null);
    setShowForm(false);
  };

  const openEditForm = (task: any) => {
    hapticFeedback('light');
    setEditingTask(task);
    setFormPlatform(task.platform || 'telegram');
    setFormName(task.name || '');
    setFormUrl(task.url || '');
    setFormImageUrl(task.image_url || '');
    setFormRewardDays(String(task.reward_days || 7));
    setFormActive(task.is_active !== false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) return;
    setSaving(true);
    try {
      await api.saveAdminSocialTask({
        id: editingTask?.id,
        platform: formPlatform,
        name: formName.trim(),
        url: formUrl.trim(),
        image_url: formImageUrl.trim() || undefined,
        reward_days: parseInt(formRewardDays) || 7,
        is_active: formActive,
      });
      hapticSuccess();
      resetForm();
      await loadTasks();
    } catch (err) {
      console.error('[Admin] Save social task error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    hapticFeedback('medium');
    try {
      await api.deleteAdminSocialTask(taskId);
      hapticSuccess();
      await loadTasks();
    } catch (err) {
      console.error('[Admin] Delete social task error:', err);
    }
  };

  const handleToggleActive = async (task: any) => {
    hapticFeedback('light');
    try {
      await api.saveAdminSocialTask({
        id: task.id,
        platform: task.platform,
        name: task.name,
        url: task.url,
        image_url: task.image_url,
        reward_days: task.reward_days,
        is_active: task.is_active === false,
      });
      await loadTasks();
    } catch (err) {
      console.error('[Admin] Toggle task error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#a29bfe] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + Add */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
            {t('adm_social_title')}
          </p>
          <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
            {t('adm_social_desc')}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { hapticFeedback('light'); resetForm(); setShowForm(true); }}
          className="h-9 px-4 rounded-xl bg-[#6c5ce7] text-white flex items-center gap-1.5"
          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          {t('adm_social_add')}
        </motion.button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && !showForm && (
        <GlassCard className="!p-8 text-center">
          <Star className="w-8 h-8 text-ui-tertiary mx-auto mb-3" />
          <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
            {t('adm_social_empty')}
          </p>
        </GlassCard>
      )}

      {/* Task List */}
      {tasks.map((task, idx) => (
        <motion.div
          key={task.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
        >
          <GlassCard className="!p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                task.is_active !== false ? 'bg-[#6c5ce7]/15' : 'bg-ui-button'
              }`}>
                <span style={{ fontSize: '1.125rem' }}>
                  {task.platform === 'telegram' ? '\u2708\uFE0F' :
                   task.platform === 'instagram' ? '\uD83D\uDCF8' :
                   task.platform === 'youtube' ? '\u25B6\uFE0F' :
                   task.platform === 'tiktok' ? '\uD83C\uDFB5' :
                   task.platform === 'twitter' ? '\uD83D\uDC26' : '\uD83C\uDF10'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-foreground truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {task.name}
                  </p>
                  {task.is_active === false && (
                    <span className="px-1.5 py-0.5 rounded text-[0.5625rem] font-semibold bg-red-500/15 text-red-400">
                      OFF
                    </span>
                  )}
                </div>
                <p className="text-ui-tertiary truncate" style={{ fontSize: '0.6875rem' }}>
                  {task.platform} &middot; +{task.reward_days}d &middot; {task.url}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(task)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    task.is_active !== false ? 'bg-green-500/10 text-green-400' : 'bg-ui-button text-ui-tertiary'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openEditForm(task)}
                  className="w-8 h-8 rounded-lg bg-[#6c5ce7]/10 flex items-center justify-center text-[#a29bfe]"
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      ))}

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <GlassCard className="!p-5 border border-[#6c5ce7]/20">
              <div className="flex items-center justify-between mb-4">
                <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                  {editingTask ? t('adm_social_edit') : t('adm_social_new')}
                </p>
                <button onClick={resetForm} className="text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Platform */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1.5 block">{t('adm_social_platform')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        onClick={() => { hapticFeedback('light'); setFormPlatform(p); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          formPlatform === p
                            ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                            : 'bg-ui-button text-muted-foreground border border-transparent'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1.5 block">{t('adm_social_name')}</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Telegram Channel / Instagram"
                    className="w-full px-3 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none text-sm" style={{ borderColor: 'var(--glass-border)' }}
                  />
                </div>

                {/* URL */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1.5 block">{t('adm_social_url')}</label>
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://t.me/channel"
                    className="w-full px-3 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none text-sm" style={{ borderColor: 'var(--glass-border)' }}
                  />
                </div>

                {/* Image URL */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1.5 block">{t('adm_social_image')}</label>
                  <input
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://example.com/icon.png"
                    className="w-full px-3 py-2.5 rounded-xl bg-ui-button border text-foreground outline-none text-sm" style={{ borderColor: 'var(--glass-border)' }}
                  />
                </div>

                {/* Reward Days */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1.5 block">{t('adm_social_reward')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formRewardDays}
                      onChange={(e) => setFormRewardDays(e.target.value)}
                      className="w-20 px-3 py-2.5 rounded-xl bg-ui-button border text-foreground text-center outline-none text-sm font-semibold" style={{ borderColor: 'var(--glass-border)' }}
                    />
                    <span className="text-muted-foreground text-sm">{t('adm_days')}</span>
                  </div>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-foreground/60 text-sm">{t('adm_social_active')}</span>
                  <button
                    onClick={() => { hapticFeedback('light'); setFormActive(!formActive); }}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      formActive ? 'bg-[#6c5ce7]' : 'bg-switch-background'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] absolute top-0.5 transition-all ${
                      formActive ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim() || !formUrl.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingTask ? t('adm_social_save') : t('adm_social_create')}
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
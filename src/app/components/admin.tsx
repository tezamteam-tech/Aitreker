// =============================================
// PROPER FOOD AI — Admin Panel (/admin)
// =============================================
// Admin dashboard for @tezam_by (tgId: 7879078497)
// Features: user list, subscription management,
// broadcast messages with media support.
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Gem,
  Bell,
  Wallet,
  Bold,
  Italic,
  Underline,
  Upload,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { AdminUser } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';

type Tab = 'stats' | 'users' | 'broadcast' | 'social';

export function AdminPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('stats');

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-liquid-glass-panel border-b border-white/[0.06]">
        <div className="px-5 pb-3 flex items-center justify-center" style={{ paddingTop: '6px' }}>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#a29bfe]" />
            <h1 className="text-white/90" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
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
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => { hapticFeedback('light'); setActiveTab(tab.id); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                activeTab === tab.id
                  ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                  : 'bg-white/[0.04] text-white/40 border border-transparent'
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
              <span className="text-white/40" style={{ fontSize: '0.75rem' }}>{card.label}</span>
            </div>
            <span className="text-white" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{card.value}</span>
          </GlassCard>
        </motion.div>
      ))}
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
  const [creditCurrency, setCreditCurrency] = useState<'stars' | 'ton'>('stars');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditStatus, setCreditStatus] = useState<string | null>(null);
  const [userWallet, setUserWallet] = useState<{ starsBalance: number; tonBalance: number; starsReserved: number; tonReserved: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  const fetchUsers = useCallback(async (p: number = 1, s: string = search, f: string = filter) => {
    setLoading(true);
    try {
      const res = await api.adminGetUsers({ page: p, limit: 20, search: s, filter: f });
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(res.page);
    } catch (err) {
      console.error('[Admin] Users error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchUsers(1, search, filter);
  }, [filter]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchUsers(1, val, filter);
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

  // Load wallet when user is selected
  const loadUserWallet = useCallback(async (userId: string) => {
    setUserWallet(null);
    try {
      const w = await api.adminGetUserWallet(userId);
      setUserWallet(w);
    } catch (err) {
      console.error('[Admin] Wallet load error:', err);
    }
  }, []);

  const handleSelectUser = useCallback((user: AdminUser) => {
    hapticFeedback('light');
    setSelectedUser(user);
    setNotifText('');
    setNotifStatus(null);
    setCreditAmount('');
    setCreditStatus(null);
    setDeleteConfirm(false);
    setDeleteStatus(null);
    loadUserWallet(user.id);
  }, [loadUserWallet]);

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

  const handleCreditWallet = async (userId: string) => {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return;
    setActionLoading(true);
    setCreditStatus(null);
    try {
      const res = await api.adminCreditWallet(userId, creditCurrency, amount);
      if (res.success) {
        hapticSuccess();
        setCreditStatus(`OK: ${creditCurrency === 'stars' ? '★' : 'TON'} ${amount}`);
        setCreditAmount('');
        setUserWallet({
          starsBalance: res.starsBalance,
          tonBalance: res.tonBalance,
          starsReserved: userWallet?.starsReserved || 0,
          tonReserved: userWallet?.tonReserved || 0,
        });
      }
    } catch (err) {
      console.error('[Admin] Credit error:', err);
      setCreditStatus('Error');
    } finally {
      setActionLoading(false);
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('adm_search_placeholder')}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/30 outline-none focus:border-[#6c5ce7]/30"
          style={{ fontSize: '0.875rem' }}
        />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'expired'] as const).map(f => (
          <button
            key={f}
            onClick={() => { hapticFeedback('light'); setFilter(f); }}
            className={`px-3 py-1 rounded-full transition-all ${
              filter === f
                ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                : 'bg-white/[0.04] text-white/30 border border-transparent'
            }`}
            style={{ fontSize: '0.75rem', fontWeight: 500 }}
          >
            {f === 'all' ? t('adm_filter_all')
              : f === 'active' ? t('adm_filter_active')
              : t('adm_filter_expired')}
          </button>
        ))}
        <span className="ml-auto text-white/20 self-center" style={{ fontSize: '0.75rem' }}>
          {total} {t('adm_users_count')}
        </span>
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
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {user.displayName}
                        </span>
                        {user.telegramUsername && (
                          <span className="text-[#a29bfe] shrink-0" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                            @{user.telegramUsername}
                          </span>
                        )}
                        {user.isSubscriptionActive && (
                          <Crown className="w-3.5 h-3.5 text-[#6c5ce7] shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                          ID: {user.telegramId}
                        </span>
                        {user.phoneNumber && (
                          <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                            {user.phoneNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
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
                        <div className="text-white/20" style={{ fontSize: '0.625rem' }}>
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
            className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4 text-white/60" />
          </button>
          <span className="text-white/40" style={{ fontSize: '0.8125rem' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => fetchUsers(page + 1, search, filter)}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-white/60" />
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
              className="w-full max-w-md bg-liquid-glass-panel border-t border-white/[0.1] rounded-t-3xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              {/* Close button */}
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {selectedUser.displayName}
                  </h3>
                  {selectedUser.telegramUsername && (
                    <span className="text-[#a29bfe]" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      @{selectedUser.telegramUsername}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-white/30">
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

              {/* Wallet Info */}
              <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-3.5 h-3.5 text-[#a29bfe]" />
                  <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_wallet')}
                  </span>
                </div>
                {userWallet ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-white/30" style={{ fontSize: '0.6875rem' }}>Stars</div>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{userWallet.starsBalance}</span>
                        {(userWallet.starsReserved || 0) > 0 && (
                          <span className="text-amber-400/50" style={{ fontSize: '0.6875rem' }}>({userWallet.starsReserved})</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/30" style={{ fontSize: '0.6875rem' }}>TON</div>
                      <div className="flex items-center gap-1">
                        <Gem className="w-3 h-3 text-blue-400" />
                        <span className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{userWallet.tonBalance}</span>
                        {(userWallet.tonReserved || 0) > 0 && (
                          <span className="text-blue-400/50" style={{ fontSize: '0.6875rem' }}>({userWallet.tonReserved})</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
                )}
              </div>

              {/* ---- Section: Subscription ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-3.5 h-3.5 text-[#6c5ce7]" />
                  <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_section_sub')}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Grant Subscription */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl px-2 py-1.5">
                      <button onClick={() => setGrantDays(Math.max(1, grantDays - 30))} className="text-white/40 p-1">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        value={grantDays}
                        onChange={(e) => setGrantDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 bg-transparent text-center text-white outline-none"
                        style={{ fontSize: '0.875rem', fontWeight: 600 }}
                      />
                      <button onClick={() => setGrantDays(grantDays + 30)} className="text-white/40 p-1">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-white/30 shrink-0" style={{ fontSize: '0.75rem' }}>
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
                  <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
                          className="w-7 h-7 rounded bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.1] transition-colors"
                          title={btn.label}
                        >
                          <btn.icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                      <div className="w-px h-5 bg-white/10 mx-0.5" />
                      {['😀','🔥','💪','🎯','⭐','🏆','❤️','✅','🚀','💰'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => {
                            hapticFeedback('light');
                            setNotifText(prev => prev + emoji);
                          }}
                          className="w-7 h-7 rounded hover:bg-white/[0.06] flex items-center justify-center transition-colors"
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
                      className="w-full h-20 bg-white/[0.04] rounded-lg p-2.5 text-white placeholder-white/20 outline-none resize-none border border-white/[0.06] focus:border-[#6c5ce7]/30"
                      style={{ fontSize: '0.8125rem' }}
                    />
                  </div>
                  <button
                    onClick={() => handleSendNotification(selectedUser.id)}
                    disabled={actionLoading || !notifText.trim()}
                    className="w-full py-2.5 rounded-xl bg-[#6c5ce7] text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t('adm_send')}
                  </button>

                  {/* Notification Status */}
                  {notifStatus && (
                    <div className="text-sm" style={{ color: notifStatus === 'sent' ? '#00cec9' : '#e17055' }}>
                      {notifStatus === 'sent' ? t('adm_notif_sent') : t('adm_error')}
                      {notifError && <span className="ml-1">({notifError})</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Section: Credit Wallet ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-3.5 h-3.5 text-[#a29bfe]" />
                  <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {t('adm_section_credit')}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Credit Wallet */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl px-2 py-1.5">
                      <input
                        type="number"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="w-14 bg-transparent text-center text-white outline-none"
                        style={{ fontSize: '0.875rem', fontWeight: 600 }}
                      />
                      <select
                        value={creditCurrency}
                        onChange={(e) => setCreditCurrency(e.target.value as 'stars' | 'ton')}
                        className="bg-transparent text-white/40 outline-none"
                        style={{ fontSize: '0.875rem', fontWeight: 600 }}
                      >
                        <option value="stars" style={{ background: '#141420' }}>★ Stars</option>
                        <option value="ton" style={{ background: '#141420' }}>◆ TON</option>
                      </select>
                    </div>
                    <button
                      onClick={() => handleCreditWallet(selectedUser.id)}
                      disabled={actionLoading || !creditAmount.trim()}
                      className="py-2.5 px-3 rounded-xl bg-[#6c5ce7] text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                      {t('adm_credit')}
                    </button>
                  </div>

                  {/* Credit Status */}
                  {creditStatus && (
                    <div className="text-sm" style={{ color: creditStatus.startsWith('OK') ? '#00cec9' : '#e17055' }}>
                      {creditStatus}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Section: Delete User ---- */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-3.5 h-3.5 text-[#e17055]" />
                  <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
                          className="py-1 px-2 rounded bg-white/[0.04] border border-white/[0.06] text-white/40 flex items-center justify-center gap-1.5"
                          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
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
      <span className="text-white/30" style={{ fontSize: '0.8125rem' }}>{label}</span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: color || 'rgba(255,255,255,0.7)' }}>{value}</span>
    </div>
  );
}

// ---- Broadcast Section ----
function BroadcastSection() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<'all' | 'subscribers' | 'non_subscribers'>('all');
  const [mediaType, setMediaType] = useState<'none' | 'photo' | 'photos' | 'video'>('none');
  const [mediaUrls, setMediaUrls] = useState<string[]>(['']);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      {/* Audience Selector */}
      <GlassCard className="p-4">
        <div className="text-white/40 mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
                  : 'bg-white/[0.04] text-white/40 border border-transparent'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              <a.icon className="w-3.5 h-3.5" />
              {a.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Message Text with Rich Editor */}
      <GlassCard className="p-4">
        <div className="text-white/40 mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {t('adm_message_text')}
        </div>
        {/* Formatting Toolbar */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
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
              className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.1] transition-colors"
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
            className="h-8 px-2 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.1] transition-colors"
            style={{ fontSize: '0.6875rem', fontFamily: 'monospace' }}
          >
            {'</>'}
          </button>
          <button
            onClick={() => {
              hapticFeedback('light');
              setText(prev => `${prev}<a href=""></a>`);
            }}
            className="h-8 px-2 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.1] transition-colors"
            style={{ fontSize: '0.6875rem' }}
          >
            🔗
          </button>
          <div className="w-px h-6 bg-white/10 mx-0.5" />
          {['😀','🔥','💪','🎯','⭐','🏆','❤️','✅','🚀','💰','🎉','⚡'].map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                hapticFeedback('light');
                setText(prev => prev + emoji);
              }}
              className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              style={{ fontSize: '0.9375rem' }}
            >
              {emoji}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('adm_broadcast_placeholder')}
          className="w-full h-32 bg-white/[0.04] rounded-xl p-3 text-white placeholder-white/20 outline-none resize-none border border-white/[0.06] focus:border-[#6c5ce7]/30"
          style={{ fontSize: '0.875rem' }}
        />
      </GlassCard>

      {/* Media */}
      <GlassCard className="p-4">
        <div className="text-white/40 mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
                  : 'bg-white/[0.04] text-white/30 border border-transparent'
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
                  className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 outline-none"
                  style={{ fontSize: '0.8125rem' }}
                />
                {mediaUrls.length > 1 && (
                  <button onClick={() => removeMediaUrl(idx)} className="text-white/20 hover:text-red-400 p-1">
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
      </GlassCard>

      {/* Preview */}
      {text.trim() && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/40" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
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
            <div
              className="p-3 rounded-xl bg-white/[0.02] text-white/80"
              style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: text }}
            />
          )}
        </GlassCard>
      )}

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={sending || (!text.trim() && mediaUrls.every(u => !u.trim()))}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
        style={{ fontSize: '0.9375rem' }}
      >
        {sending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Send className="w-4 h-4" />
            {t('adm_send_broadcast')}
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
                  <div className="text-white/40" style={{ fontSize: '0.8125rem' }}>
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
          <p className="text-white/80" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
            {t('adm_social_title')}
          </p>
          <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
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
          <Star className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-white/30" style={{ fontSize: '0.875rem' }}>
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
                task.is_active !== false ? 'bg-[#6c5ce7]/15' : 'bg-white/[0.04]'
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
                  <p className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {task.name}
                  </p>
                  {task.is_active === false && (
                    <span className="px-1.5 py-0.5 rounded text-[0.5625rem] font-semibold bg-red-500/15 text-red-400">
                      OFF
                    </span>
                  )}
                </div>
                <p className="text-white/25 truncate" style={{ fontSize: '0.6875rem' }}>
                  {task.platform} &middot; +{task.reward_days}d &middot; {task.url}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(task)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    task.is_active !== false ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.04] text-white/20'
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
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                  {editingTask ? t('adm_social_edit') : t('adm_social_new')}
                </p>
                <button onClick={resetForm} className="text-white/30">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Platform */}
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">{t('adm_social_platform')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        onClick={() => { hapticFeedback('light'); setFormPlatform(p); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          formPlatform === p
                            ? 'bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30'
                            : 'bg-white/[0.04] text-white/30 border border-transparent'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">{t('adm_social_name')}</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Telegram Channel / Instagram"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 outline-none text-sm"
                  />
                </div>

                {/* URL */}
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">{t('adm_social_url')}</label>
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://t.me/channel"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 outline-none text-sm"
                  />
                </div>

                {/* Image URL */}
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">{t('adm_social_image')}</label>
                  <input
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://example.com/icon.png"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-white/20 outline-none text-sm"
                  />
                </div>

                {/* Reward Days */}
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">{t('adm_social_reward')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formRewardDays}
                      onChange={(e) => setFormRewardDays(e.target.value)}
                      className="w-20 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-center outline-none text-sm font-semibold"
                    />
                    <span className="text-white/30 text-sm">{t('adm_days')}</span>
                  </div>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-white/60 text-sm">{t('adm_social_active')}</span>
                  <button
                    onClick={() => { hapticFeedback('light'); setFormActive(!formActive); }}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      formActive ? 'bg-[#6c5ce7]' : 'bg-white/[0.1]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
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
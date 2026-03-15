import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Flame,
  Trophy,
  Calendar,
  Bot,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  Clock,
  Globe,
  Moon,
  Scale,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api, type NotificationPrefs } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { useAuth } from './auth-context';
import { PageHeader } from './page-header';

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;

function WeighInDayPicker({ value, onChange, t, disabled }: {
  value: number;
  onChange: (day: number) => void;
  t: (key: string) => string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex gap-1.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {DAY_KEYS.map((key, idx) => (
        <button
          key={key}
          onClick={() => {
            hapticFeedback('light');
            onChange(idx);
          }}
          className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
            idx === value
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/30'
              : 'bg-ui-button text-ui-text-tertiary border border-transparent'
          }`}
          style={{ fontSize: '0.6875rem', fontWeight: idx === value ? 600 : 400 }}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}

interface ToggleRowProps {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function ToggleRow({ icon: Icon, label, description, color, enabled, disabled, onToggle }: ToggleRowProps) {
  return (
    <button
      onClick={() => {
        if (!disabled) {
          hapticFeedback('light');
          onToggle();
        }
      }}
      disabled={disabled}
      className="w-full flex items-center gap-3 py-2.5 px-1 disabled:opacity-40"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${enabled ? 'bg-ui-button border border-ui-button' : 'bg-glass-row'}`}>
        <Icon className={`w-4 h-4 ${enabled ? color : 'text-ui-icon-tertiary'}`} />
      </div>
      <div className="flex-1 text-left">
        <p className={`${enabled ? 'text-foreground' : 'text-ui-text-secondary'}`} style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
          {label}
        </p>
        <p className="text-ui-text-tertiary" style={{ fontSize: '0.6875rem' }}>
          {description}
        </p>
      </div>
      <div
        className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${
          enabled ? 'bg-[#6c5ce7]/60' : 'bg-switch-background'
        }`}
      >
        <motion.div
          className={`absolute top-0.5 w-5 h-5 rounded-full ${
            enabled ? 'bg-[#a29bfe]' : 'bg-muted'
          }`}
          animate={{ left: enabled ? '18px' : '2px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    </button>
  );
}

export function NotificationSettingsSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testSent, setTestSent] = useState<false | 'daily_digest_preview' | 'generic_test'>(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderTimeSaved, setReminderTimeSaved] = useState(false);
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  // Compute UTC offset label from user data or browser
  const utcOffsetLabel = (() => {
    const offsetMinutes = user?.utcOffset ?? -(new Date().getTimezoneOffset());
    const sign = offsetMinutes >= 0 ? '+' : '−';
    const absH = Math.floor(Math.abs(offsetMinutes) / 60);
    const absM = Math.abs(offsetMinutes) % 60;
    const utcStr = `UTC${sign}${absH}${absM > 0 ? `:${String(absM).padStart(2, '0')}` : ''}`;
    // Try to get IANA timezone name
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Extract city from timezone (e.g. "Europe/Moscow" -> "Moscow")
      const city = tz.split('/').pop()?.replace(/_/g, ' ') || '';
      return city ? `${utcStr} (${city})` : utcStr;
    } catch {
      return utcStr;
    }
  })();

  // Init reminderTime from user
  useEffect(() => {
    if (user?.dailyReminderTime) {
      setReminderTime(user.dailyReminderTime);
    }
  }, [user?.dailyReminderTime]);

  const fetchPrefs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const p = await api.getNotificationPrefs();
      setPrefs(p);
    } catch (err: any) {
      console.error('[NotifSettings] Failed to fetch prefs:', err);
      setError(err?.message || 'Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded && !prefs) {
      fetchPrefs();
    }
  }, [isExpanded]);

  const updatePref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;

    const newPrefs = { ...prefs, [key]: value };
    // If master switch is off, all sub-prefs are effectively disabled
    if (key === 'enabled' && !value) {
      // Keep sub-pref values but master is off
    }
    setPrefs(newPrefs);
    setIsSaving(true);

    try {
      const updated = await api.updateNotificationPrefs({ [key]: value });
      setPrefs(updated);
    } catch (err: any) {
      console.error('[NotifSettings] Failed to update pref:', err);
      // Revert on error
      setPrefs(prefs);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    hapticFeedback('medium');
    setTestSent(false);
    setTestSending(true);
    setError(null);
    try {
      const result = await api.sendTestNotification();
      const resultType = (result.type === 'daily_digest_preview' || result.type === 'generic_test')
        ? result.type as 'daily_digest_preview' | 'generic_test'
        : 'generic_test';
      setTestSent(resultType);
      setTimeout(() => setTestSent(false), 4000);
    } catch (err: any) {
      console.error('[NotifSettings] Test notification failed:', err);
      setError(err?.message || 'Failed to send test notification');
    } finally {
      setTestSending(false);
    }
  };

  const isEnabled = prefs?.enabled ?? true;

  return (
    <GlassCard padding="sm" className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          hapticFeedback('light');
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center gap-3 px-2 py-3"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
          {isEnabled ? (
            <Bell className="w-5 h-5 text-amber-400" />
          ) : (
            <BellOff className="w-5 h-5 text-ui-tertiary" />
          )}
        </div>
        <div className="flex-1 text-left">
          <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
            {t('notif_title')}
          </p>
          <p className="text-ui-secondary" style={{ fontSize: '0.75rem' }}>
            {isEnabled ? t('notif_active') : t('notif_disabled')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEnabled && (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
          )}
          {!isEnabled && prefs && (
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--ui-text-tertiary)]" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-ui-tertiary" />
          ) : (
            <ChevronDown className="w-4 h-4 text-ui-tertiary" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-3 space-y-3">
              {/* Loading state */}
              {isLoading && !prefs && (
                <div className="flex items-center justify-center py-4 gap-2 text-ui-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span style={{ fontSize: '0.8125rem' }}>{t('loading')}</span>
                </div>
              )}

              {prefs && (
                <div className="space-y-1">
                  {/* Master switch */}
                  <ToggleRow
                    icon={Bell}
                    label={t('notif_all')}
                    description={t('notif_all_desc')}
                    color="text-amber-400"
                    enabled={prefs.enabled}
                    onToggle={() => updatePref('enabled', !prefs.enabled)}
                  />

                  {/* Divider */}
                  <div className="h-px bg-[var(--ui-separator)] mx-2" />

                  {/* Sub-preferences */}
                  <ToggleRow
                    icon={CheckCircle2}
                    label={t('notif_day_complete')}
                    description={t('notif_day_complete_desc')}
                    color="text-emerald-400"
                    enabled={prefs.dayComplete}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('dayComplete', !prefs.dayComplete)}
                  />
                  <ToggleRow
                    icon={Flame}
                    label={t('notif_streak')}
                    description={t('notif_streak_desc')}
                    color="text-orange-400"
                    enabled={prefs.streakMilestones}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('streakMilestones', !prefs.streakMilestones)}
                  />
                  <ToggleRow
                    icon={Trophy}
                    label={t('notif_challenge')}
                    description={t('notif_challenge_desc')}
                    color="text-yellow-400"
                    enabled={prefs.challengeUpdates}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('challengeUpdates', !prefs.challengeUpdates)}
                  />
                  <ToggleRow
                    icon={Calendar}
                    label={t('notif_daily')}
                    description={t('notif_daily_desc')}
                    color="text-blue-400"
                    enabled={prefs.dailyReminder}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('dailyReminder', !prefs.dailyReminder)}
                  />

                  {/* Daily digest time picker + timezone — shown when daily reminders are on */}
                  {prefs.enabled && prefs.dailyReminder && (
                    <div className="ml-11 space-y-1.5">
                      {/* Time picker row */}
                      <div className="flex items-center gap-3 py-2 px-1">
                        <Clock className="w-3.5 h-3.5 text-blue-400/60" />
                        <span className="text-ui-secondary" style={{ fontSize: '0.75rem' }}>
                          {t('notif_digest_time')}
                        </span>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReminderTime(val);
                            setReminderTimeSaved(false);
                          }}
                          onBlur={() => {
                            if (reminderTime && reminderTime !== (user?.dailyReminderTime || '09:00')) {
                              hapticFeedback('light');
                              updateUser({ dailyReminderTime: reminderTime });
                              setReminderTimeSaved(true);
                              setTimeout(() => setReminderTimeSaved(false), 2000);
                            }
                          }}
                          className="bg-[var(--glass-bg-card)] border border-[var(--glass-border)] rounded-lg px-2 py-1 text-foreground/80 text-center outline-none focus:border-blue-400/40 transition-colors"
                          style={{ fontSize: '0.8125rem', width: '5.5rem', colorScheme: 'dark' }}
                        />
                        {reminderTimeSaved && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      {/* Timezone indicator */}
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <Globe className="w-3 h-3 text-ui-tertiary" />
                        <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                          {t('notif_timezone')} {utcOffsetLabel}
                        </span>
                        <span
                          className="text-ui-tertiary italic"
                          style={{ fontSize: '0.625rem' }}
                        >
                          ({t('notif_timezone_auto')})
                        </span>
                      </div>
                    </div>
                  )}

                  <ToggleRow
                    icon={Bot}
                    label={t('notif_coach')}
                    description={t('notif_coach_desc')}
                    color="text-purple-400"
                    enabled={prefs.coachTips}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('coachTips', !prefs.coachTips)}
                  />
                  <ToggleRow
                    icon={Moon}
                    label={t('notif_evening')}
                    description={t('notif_evening_desc')}
                    color="text-indigo-400"
                    enabled={prefs.eveningDigest}
                    disabled={!prefs.enabled}
                    onToggle={() => updatePref('eveningDigest', !prefs.eveningDigest)}
                  />
                </div>
              )}

              {/* Saving indicator */}
              {isSaving && (
                <div className="flex items-center justify-center gap-1.5 text-ui-tertiary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span style={{ fontSize: '0.6875rem' }}>{t('saving')}</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-red-500/10 border border-red-500/20 p-2"
                >
                  <p className="text-red-400 text-center" style={{ fontSize: '0.8125rem' }}>
                    {error}
                  </p>
                </motion.div>
              )}

              {/* Test notification button */}
              <button
                onClick={handleTestNotification}
                disabled={!prefs?.enabled || testSending}
                className="w-full h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-400/80 flex items-center justify-center gap-2 disabled:opacity-30"
                style={{ fontSize: '0.8125rem', fontWeight: 500 }}
              >
                {testSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('notif_test_sending')}
                  </>
                ) : testSent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">
                      {testSent === 'daily_digest_preview'
                        ? t('notif_test_sent_digest')
                        : t('notif_test_sent_generic')}
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('notif_test_send')}
                  </>
                )}
              </button>

              {/* Info */}
              <div className="rounded-xl bg-[var(--glass-bg-row)] p-3">
                <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>
                  {t('notif_info')}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// =============================================
// Full-page Notification Settings
// =============================================
export function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testSent, setTestSent] = useState<false | 'daily_digest_preview' | 'generic_test'>(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderTimeSaved, setReminderTimeSaved] = useState(false);
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const utcOffsetLabel = (() => {
    const offsetMinutes = user?.utcOffset ?? -(new Date().getTimezoneOffset());
    const sign = offsetMinutes >= 0 ? '+' : '\u2212';
    const absH = Math.floor(Math.abs(offsetMinutes) / 60);
    const absM = Math.abs(offsetMinutes) % 60;
    const utcStr = `UTC${sign}${absH}${absM > 0 ? `:${String(absM).padStart(2, '0')}` : ''}`;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const city = tz.split('/').pop()?.replace(/_/g, ' ') || '';
      return city ? `${utcStr} (${city})` : utcStr;
    } catch {
      return utcStr;
    }
  })();

  useEffect(() => {
    if (user?.dailyReminderTime) {
      setReminderTime(user.dailyReminderTime);
    }
  }, [user?.dailyReminderTime]);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const p = await api.getNotificationPrefs();
        setPrefs(p);
      } catch (err: any) {
        console.error('[NotifSettingsPage] Failed to fetch prefs:', err);
        setError(err?.message || 'Failed to load preferences');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const updatePref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;
    const prev = { ...prefs };
    setPrefs({ ...prefs, [key]: value });
    setIsSaving(true);
    try {
      const updated = await api.updateNotificationPrefs({ [key]: value });
      setPrefs(updated);
    } catch (err: any) {
      console.error('[NotifSettingsPage] Failed to update pref:', err);
      setPrefs(prev);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    hapticFeedback('medium');
    setTestSent(false);
    setTestSending(true);
    setError(null);
    try {
      const result = await api.sendTestNotification();
      const resultType = (result.type === 'daily_digest_preview' || result.type === 'generic_test')
        ? result.type as 'daily_digest_preview' | 'generic_test'
        : 'generic_test';
      setTestSent(resultType);
      setTimeout(() => setTestSent(false), 4000);
    } catch (err: any) {
      console.error('[NotifSettingsPage] Test notification failed:', err);
      setError(err?.message || 'Failed to send test notification');
    } finally {
      setTestSending(false);
    }
  };

  const isEnabled = prefs?.enabled ?? true;

  return (
    <div className="min-h-screen pb-28">
      <div className="relative z-10 px-4 pb-6">
        <PageHeader title={t('notif_title')} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <GlassCard className="!p-4 relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isEnabled
                      ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/10'
                      : 'bg-[var(--ui-input-bg)]'
                  }`}>
                    {isEnabled ? (
                      <Bell className="w-6 h-6 text-amber-400" />
                    ) : (
                      <BellOff className="w-6 h-6 text-ui-tertiary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
                      {isEnabled ? t('notif_active') : t('notif_disabled')}
                    </p>
                    <p className="text-muted-foreground/50 mt-0.5" style={{ fontSize: '0.75rem' }}>
                      {t('notif_all_desc')}
                    </p>
                  </div>
                  {isEnabled && (
                    <div className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                  )}
                </div>
              </GlassCard>
            </motion.div>

            {/* Master toggle */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <GlassCard className="!p-3">
                {prefs && (
                  <ToggleRow
                    icon={Bell}
                    label={t('notif_all')}
                    description={t('notif_all_desc')}
                    color="text-amber-400"
                    enabled={prefs.enabled}
                    onToggle={() => updatePref('enabled', !prefs.enabled)}
                  />
                )}
              </GlassCard>
            </motion.div>

            {/* Individual toggles */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className="text-muted-foreground/40" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {t('notif_categories') || 'Categories'}
                </span>
              </div>
              <GlassCard className="!p-3">
                {prefs && (
                  <div className="space-y-0.5">
                    <ToggleRow
                      icon={CheckCircle2}
                      label={t('notif_day_complete')}
                      description={t('notif_day_complete_desc')}
                      color="text-emerald-400"
                      enabled={prefs.dayComplete}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('dayComplete', !prefs.dayComplete)}
                    />
                    <div className="h-px bg-[var(--ui-separator)] mx-2" />
                    <ToggleRow
                      icon={Flame}
                      label={t('notif_streak')}
                      description={t('notif_streak_desc')}
                      color="text-orange-400"
                      enabled={prefs.streakMilestones}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('streakMilestones', !prefs.streakMilestones)}
                    />
                    <div className="h-px bg-[var(--ui-separator)] mx-2" />
                    <ToggleRow
                      icon={Trophy}
                      label={t('notif_challenge')}
                      description={t('notif_challenge_desc')}
                      color="text-yellow-400"
                      enabled={prefs.challengeUpdates}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('challengeUpdates', !prefs.challengeUpdates)}
                    />
                    <div className="h-px bg-[var(--ui-separator)] mx-2" />
                    <ToggleRow
                      icon={Calendar}
                      label={t('notif_daily')}
                      description={t('notif_daily_desc')}
                      color="text-blue-400"
                      enabled={prefs.dailyReminder}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('dailyReminder', !prefs.dailyReminder)}
                    />

                    {/* Time picker for daily reminders */}
                    {prefs.enabled && prefs.dailyReminder && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-11 space-y-1.5 pt-1"
                      >
                        <div className="flex items-center gap-3 py-2 px-1">
                          <Clock className="w-3.5 h-3.5 text-blue-400/60" />
                          <span className="text-ui-secondary" style={{ fontSize: '0.75rem' }}>
                            {t('notif_digest_time')}
                          </span>
                          <input
                            type="time"
                            value={reminderTime}
                            onChange={(e) => {
                              setReminderTime(e.target.value);
                              setReminderTimeSaved(false);
                            }}
                            onBlur={() => {
                              if (reminderTime && reminderTime !== (user?.dailyReminderTime || '09:00')) {
                                hapticFeedback('light');
                                updateUser({ dailyReminderTime: reminderTime });
                                setReminderTimeSaved(true);
                                setTimeout(() => setReminderTimeSaved(false), 2000);
                              }
                            }}
                            className="bg-[var(--glass-bg-card)] border border-[var(--glass-border)] rounded-lg px-2 py-1 text-foreground/80 text-center outline-none focus:border-blue-400/40 transition-colors"
                            style={{ fontSize: '0.8125rem', width: '5.5rem', colorScheme: 'dark' }}
                          />
                          {reminderTimeSaved && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 px-1 pb-1">
                          <Globe className="w-3 h-3 text-ui-tertiary" />
                          <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                            {t('notif_timezone')} {utcOffsetLabel}
                          </span>
                          <span className="text-ui-tertiary italic" style={{ fontSize: '0.625rem' }}>
                            ({t('notif_timezone_auto')})
                          </span>
                        </div>
                      </motion.div>
                    )}

                    <div className="h-px bg-[var(--ui-separator)] mx-2" />
                    <ToggleRow
                      icon={Bot}
                      label={t('notif_coach')}
                      description={t('notif_coach_desc')}
                      color="text-purple-400"
                      enabled={prefs.coachTips}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('coachTips', !prefs.coachTips)}
                    />
                    <div className="h-px bg-[var(--ui-separator)] mx-2" />

                    {/* Evening Summary toggle */}
                    <ToggleRow
                      icon={Moon}
                      label={t('notif_evening')}
                      description={t('notif_evening_desc')}
                      color="text-indigo-400"
                      enabled={prefs.eveningDigest}
                      disabled={!prefs.enabled}
                      onToggle={() => updatePref('eveningDigest', !prefs.eveningDigest)}
                    />
                  </div>
                )}
              </GlassCard>
            </motion.div>

            {/* Weigh-in Day Selector */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className="text-muted-foreground/40" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {t('notif_weigh_day')}
                </span>
              </div>
              <GlassCard className="!p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/10">
                    <Scale className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground/90" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {t('notif_weigh_day')}
                    </p>
                    <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                      {t('notif_weigh_day_desc')}
                    </p>
                  </div>
                </div>
                <WeighInDayPicker
                  value={user?.weighInDay ?? 1}
                  onChange={(day) => {
                    hapticFeedback('medium');
                    updateUser({ weighInDay: day } as any);
                  }}
                  t={t}
                  disabled={!prefs?.enabled || !prefs?.dailyReminder}
                />
              </GlassCard>
            </motion.div>

            {/* Saving indicator */}
            {isSaving && (
              <div className="flex items-center justify-center gap-1.5 text-ui-tertiary">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span style={{ fontSize: '0.6875rem' }}>{t('saving')}</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-red-500/10 border border-red-500/20 p-3"
              >
                <p className="text-red-400 text-center" style={{ fontSize: '0.8125rem' }}>
                  {error}
                </p>
              </motion.div>
            )}

            {/* Test notification */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleTestNotification}
                disabled={!prefs?.enabled || testSending}
                className="w-full h-12 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-400/80 flex items-center justify-center gap-2.5 disabled:opacity-30"
                style={{ fontSize: '0.875rem', fontWeight: 600 }}
              >
                {testSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('notif_test_sending')}
                  </>
                ) : testSent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">
                      {testSent === 'daily_digest_preview'
                        ? t('notif_test_sent_digest')
                        : t('notif_test_sent_generic')}
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('notif_test_send')}
                  </>
                )}
              </motion.button>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="rounded-xl bg-[var(--glass-bg-row)] border border-[var(--glass-border-subtle)] p-4">
                <p className="text-ui-tertiary" style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>
                  {t('notif_info')}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
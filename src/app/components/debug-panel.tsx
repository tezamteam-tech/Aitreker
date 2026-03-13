// =============================================
// Proper Food AI — Debug Panel
// =============================================
// Collapsible debug panel with:
//   - Full auth event log with timestamps
//   - System diagnostics
//   - Copy-all button for sharing
// =============================================

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface DebugLogEntry {
  time: string;    // HH:MM:SS.mmm
  tag: string;     // e.g. 'AUTH', 'CAPTURE', 'SDK'
  msg: string;
  level: 'info' | 'warn' | 'error' | 'ok';
}

// Global log accumulator (survives re-renders)
const _logEntries: DebugLogEntry[] = [];
let _listeners: Array<() => void> = [];

function notifyListeners() {
  _listeners.forEach(fn => fn());
}

function ts(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function debugLog(tag: string, msg: string, level: DebugLogEntry['level'] = 'info') {
  const entry: DebugLogEntry = { time: ts(), tag, msg, level };
  _logEntries.push(entry);
  // Keep last 200 entries
  if (_logEntries.length > 200) _logEntries.splice(0, _logEntries.length - 200);
  notifyListeners();
  // Also console.log for DevTools
  const prefix = `[${tag}]`;
  if (level === 'error') console.error(prefix, msg);
  else if (level === 'warn') console.warn(prefix, msg);
  else console.log(prefix, msg);
}

export function getDebugLogEntries(): DebugLogEntry[] {
  return _logEntries;
}

function useDebugLog() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _listeners.push(listener);
    return () => {
      _listeners = _listeners.filter(fn => fn !== listener);
    };
  }, []);
  return _logEntries;
}

// ---- System info collector ----
function getSystemInfo(): string {
  const lines: string[] = [];
  lines.push(`--- Proper Food AI Debug Report ---`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`URL: ${window.location.href}`);
  lines.push(`Hash: ${window.location.hash || '(empty)'}`);
  lines.push(`Referrer: ${document.referrer || '(none)'}`);
  lines.push(`UA: ${navigator.userAgent}`);
  lines.push(`Platform: ${navigator.platform}`);
  lines.push(`Screen: ${screen.width}x${screen.height} @${devicePixelRatio}x`);
  lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`);
  lines.push(`iframe: ${window.parent !== window}`);

  // Telegram WebApp info
  const tg = (window as any).Telegram?.WebApp;
  lines.push(`\n--- Telegram ---`);
  lines.push(`TG.WebApp: ${!!tg}`);
  if (tg) {
    lines.push(`TG.version: ${tg.version || '?'}`);
    lines.push(`TG.platform: ${tg.platform || '?'}`);
    lines.push(`TG.colorScheme: ${tg.colorScheme || '?'}`);
    lines.push(`TG.isExpanded: ${tg.isExpanded}`);
    lines.push(`TG.isFullscreen: ${tg.isFullscreen ?? 'N/A'}`);
    lines.push(`TG.initData.len: ${tg.initData?.length ?? 0}`);
    lines.push(`TG.initDataUnsafe.user: ${tg.initDataUnsafe?.user ? `id=${tg.initDataUnsafe.user.id}` : 'null'}`);
    lines.push(`TG.initDataUnsafe.start_param: ${tg.initDataUnsafe?.start_param || 'null'}`);
    lines.push(`TG.viewportHeight: ${tg.viewportHeight}`);
    lines.push(`TG.viewportStableHeight: ${tg.viewportStableHeight}`);
  }

  // Performance API
  lines.push(`\n--- Performance API ---`);
  try {
    const nav = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (nav.length > 0) {
      lines.push(`Original URL: ${nav[0].name}`);
      lines.push(`Type: ${nav[0].type}`);
      lines.push(`Duration: ${Math.round(nav[0].duration)}ms`);
    } else {
      lines.push(`No navigation entries`);
    }
  } catch (e) {
    lines.push(`Error: ${e}`);
  }

  // localStorage keys
  lines.push(`\n--- Storage ---`);
  const storageKeys = ['become_token', 'become_device_token', 'become_onboarded', 'become_user_prefs', 'become_local_settings'];
  storageKeys.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) {
      lines.push(`${key}: ${val.length > 60 ? val.slice(0, 30) + '...' + val.slice(-20) + ` (${val.length}ch)` : val}`);
    } else {
      lines.push(`${key}: (null)`);
    }
  });

  // sessionStorage
  try {
    const ssKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('become')) ssKeys.push(k);
    }
    if (ssKeys.length > 0) {
      lines.push(`sessionStorage: ${ssKeys.join(', ')}`);
    }
  } catch {}

  return lines.join('\n');
}

function buildFullReport(): string {
  const sys = getSystemInfo();
  const logSection = _logEntries.map(e => {
    const lvl = e.level === 'info' ? ' ' : e.level === 'ok' ? '+' : e.level === 'warn' ? '!' : 'X';
    return `[${e.time}] [${lvl}] [${e.tag}] ${e.msg}`;
  }).join('\n');
  return `${sys}\n\n--- Event Log (${_logEntries.length} entries) ---\n${logSection}\n\n--- END ---`;
}

// ---- Compact status line ----
function getStatusLine(): string {
  const tg = (window as any).Telegram?.WebApp;
  const parts: string[] = [];
  parts.push(`TG=${tg ? 'YES' : 'NO'}`);
  if (tg) {
    parts.push(`initData=${tg.initData?.length ?? 0}`);
    parts.push(`v${tg.version || '?'}`);
  }

  // Last significant event
  const lastOk = [..._logEntries].reverse().find(e => e.level === 'ok');
  const lastErr = [..._logEntries].reverse().find(e => e.level === 'error');
  if (lastErr) {
    parts.push(`ERR: ${lastErr.msg.slice(0, 40)}`);
  } else if (lastOk) {
    parts.push(lastOk.msg.slice(0, 40));
  }

  return parts.join(' | ');
}

// ---- UI Components ----

const LEVEL_COLORS: Record<DebugLogEntry['level'], string> = {
  info: 'text-white/40',
  ok: 'text-emerald-400/80',
  warn: 'text-amber-400/80',
  error: 'text-red-400/90',
};

const LEVEL_BG: Record<DebugLogEntry['level'], string> = {
  info: '',
  ok: '',
  warn: 'bg-amber-500/5',
  error: 'bg-red-500/10',
};

export function DebugBar() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEntries = useDebugLog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusLine = getStatusLine();

  // Auto-scroll to bottom when expanded
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, logEntries.length]);

  const handleCopy = useCallback(async () => {
    try {
      const report = buildFullReport();
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: textarea trick
      try {
        const ta = document.createElement('textarea');
        ta.value = buildFullReport();
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('Copy failed. Report:\n\n' + buildFullReport().slice(0, 2000));
      }
    }
  }, []);

  const handleClear = useCallback(() => {
    _logEntries.length = 0;
    notifyListeners();
  }, []);

  // Collapsed state: small bar at top
  if (!expanded) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999]">
        <div className="mx-auto max-w-md px-2 pt-0.5">
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-1 px-2.5 rounded-b-lg bg-black/70 backdrop-blur-md border border-white/[0.08] border-t-0 flex items-center gap-1.5 active:bg-black/90 transition-colors"
          >
            {/* Status indicator dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                logEntries.some(e => e.level === 'error')
                  ? 'bg-red-400 animate-pulse'
                  : logEntries.some(e => e.level === 'warn')
                  ? 'bg-amber-400'
                  : 'bg-emerald-400/60'
              }`}
            />
            <span
              className="text-white/30 font-mono flex-1 text-left truncate"
              style={{ fontSize: '0.5625rem' }}
            >
              {statusLine || 'debug...'}
            </span>
            <span className="text-white/20" style={{ fontSize: '0.5rem' }}>
              {logEntries.length}
            </span>
            <svg className="w-2.5 h-2.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Expanded state: full debug panel
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] bg-black/80">
        <div className="flex items-center gap-2">
          <span className="text-white/80 font-semibold" style={{ fontSize: '0.8125rem' }}>
            Proper Food Debug
          </span>
          <span className="text-white/30 font-mono" style={{ fontSize: '0.625rem' }}>
            {logEntries.length} events
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/[0.06] text-white/60 border border-white/[0.1] hover:bg-white/[0.1]'
            }`}
            style={{ fontSize: '0.6875rem' }}
          >
            {copied ? 'Copied!' : 'Copy All'}
          </button>
          {/* Clear button */}
          <button
            onClick={handleClear}
            className="px-2 py-1 rounded-lg bg-white/[0.04] text-white/30 border border-white/[0.06] hover:bg-white/[0.08] transition-all active:scale-95"
            style={{ fontSize: '0.6875rem' }}
          >
            Clear
          </button>
          {/* Close button */}
          <button
            onClick={() => setExpanded(false)}
            className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/50 flex items-center justify-center hover:bg-white/[0.1] transition-all active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* System info section */}
      <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <SystemInfoSection />
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-2 py-1">
        {logEntries.length === 0 ? (
          <p className="text-white/20 text-center py-8 font-mono" style={{ fontSize: '0.6875rem' }}>
            No events yet...
          </p>
        ) : (
          logEntries.map((entry, i) => (
            <div
              key={i}
              className={`py-0.5 px-1.5 rounded ${LEVEL_BG[entry.level]} ${
                i > 0 ? '' : ''
              }`}
            >
              <div className="flex items-start gap-1.5 font-mono" style={{ fontSize: '0.625rem', lineHeight: 1.4 }}>
                <span className="text-white/20 flex-shrink-0 select-none">{entry.time}</span>
                <span
                  className={`flex-shrink-0 font-semibold select-none ${LEVEL_COLORS[entry.level]}`}
                  style={{ minWidth: '3.5rem' }}
                >
                  [{entry.tag}]
                </span>
                <span className={`break-all ${LEVEL_COLORS[entry.level]}`}>
                  {entry.msg}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-3 py-2 border-t border-white/[0.08] bg-black/80 flex items-center gap-2">
        <button
          onClick={handleCopy}
          className={`flex-1 py-2.5 rounded-xl font-semibold transition-all active:scale-[0.98] ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg'
          }`}
          style={{ fontSize: '0.8125rem' }}
        >
          {copied ? 'Copied to clipboard!' : 'Copy Full Report'}
        </button>
        <button
          onClick={() => setExpanded(false)}
          className="py-2.5 px-4 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/60 font-medium transition-all active:scale-[0.98]"
          style={{ fontSize: '0.8125rem' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---- Inline system info (compact) ----
function SystemInfoSection() {
  const tg = (window as any).Telegram?.WebApp;
  const iframe = window.parent !== window;

  let perfUrl = '(unavailable)';
  try {
    const nav = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (nav.length > 0) perfUrl = nav[0].name;
  } catch {}

  const rows = [
    ['TG.WebApp', tg ? 'YES' : 'NO'],
    ['TG.version', tg?.version || '-'],
    ['TG.platform', tg?.platform || '-'],
    ['initData.len', String(tg?.initData?.length ?? 0)],
    ['initDataUnsafe.user', tg?.initDataUnsafe?.user ? `id=${tg.initDataUnsafe.user.id}` : 'null'],
    ['iframe', String(iframe)],
    ['bot_auth in URL', extractBotAuthPresence()],
    ['Perf URL', perfUrl.length > 80 ? perfUrl.slice(0, 50) + '...' : perfUrl],
    ['localStorage token', localStorage.getItem('become_token') ? `${localStorage.getItem('become_token')!.length}ch` : 'null'],
    ['device_token', localStorage.getItem('become_device_token') ? `${localStorage.getItem('become_device_token')!.length}ch` : 'null'],
  ];

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono" style={{ fontSize: '0.5625rem' }}>
      {rows.map(([label, value], i) => (
        <React.Fragment key={i}>
          <span className="text-white/25 select-none">{label}</span>
          <span className={`text-white/50 break-all ${
            value === 'NO' || value === 'null' || value === '0' ? 'text-red-400/50' :
            value === 'YES' ? 'text-emerald-400/60' : ''
          }`}>{value}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function extractBotAuthPresence(): string {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('bot_auth')) return `YES (location, ${url.searchParams.get('bot_auth')!.length}ch)`;
  } catch {}
  try {
    const nav = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (nav.length > 0) {
      const url = new URL(nav[0].name);
      if (url.searchParams.get('bot_auth')) return `YES (perf, ${url.searchParams.get('bot_auth')!.length}ch)`;
    }
  } catch {}
  return 'NO';
}

// ---- Debug panel for overlay (static, no expand) ----
export function DebugInfoBlock({ extraInfo }: { extraInfo?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const report = buildFullReport();
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = buildFullReport();
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert(buildFullReport().slice(0, 3000));
      }
    }
  }, []);

  return (
    <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/20 font-mono" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
          Debug Info
        </span>
        <button
          onClick={handleCopy}
          className={`px-2 py-0.5 rounded-md font-medium transition-all active:scale-95 ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-white/[0.06] text-white/40 border border-white/[0.08] hover:bg-white/[0.1]'
          }`}
          style={{ fontSize: '0.5625rem' }}
        >
          {copied ? 'Copied!' : 'Copy Report'}
        </button>
      </div>
      <div className="font-mono break-all text-white/20 space-y-0.5" style={{ fontSize: '0.5625rem', lineHeight: 1.4 }}>
        {extraInfo && <p>{extraInfo}</p>}
        {_logEntries.slice(-8).map((e, i) => (
          <p key={i} className={LEVEL_COLORS[e.level]}>
            [{e.tag}] {e.msg}
          </p>
        ))}
      </div>
    </div>
  );
}
// =============================================
// Proper Food AI — AI Coach Chat
// =============================================
// Full conversational chat with the AI coach.
// Describe situations, ask for advice, get
// support and actionable strategies.
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Loader2,
  Bot,
  User,
  Plus,
  MessageSquare,
  Trash2,
  X,
  Sparkles,
  Clock,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { PremiumGate } from './premium-gate';
import { PageHeader } from './page-header';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

interface ConversationSummary {
  id: string;
  messageCount: number;
  lastMessage: string;
  lastRole: string;
  updatedAt: string;
  createdAt: string;
}

export function CoachChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History panel
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const insightsHandled = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // Send message
  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setInput('');
    setError(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const userMsg: ChatMessage = { role: 'user', content: msg, ts: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    hapticFeedback('light');

    try {
      const res = await api.coachChatSend(msg, conversationId || undefined);
      setConversationId(res.conversationId);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.response,
        ts: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      hapticSuccess();
    } catch (err: any) {
      console.error('[Coach Chat] Send error:', err);
      setError(t('coach_chat_error'));
    } finally {
      setSending(false);
    }
  }, [input, sending, conversationId, t]);

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle incoming journal insights context
  useEffect(() => {
    if (insightsHandled.current) return;
    const state = location.state as any;
    if (state?.insightsContext) {
      insightsHandled.current = true;
      const prefix = lang === 'ru'
        ? 'Вот мои AI-инсайты из журнала. Помоги мне разобраться и составить план действий:\n\n'
        : 'Here are my journal AI insights. Help me understand them and create an action plan:\n\n';
      const msg = prefix + state.insightsContext;
      // Clear the state so navigating back and forth doesn't re-trigger
      window.history.replaceState({}, '');
      // Small delay so the component is fully mounted
      setTimeout(() => handleSend(msg), 300);
    }
  }, [location.state, lang, handleSend]);

  // Load conversation history list
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.coachChatList();
      setConversations(res.conversations || []);
    } catch (err) {
      console.error('[Coach Chat] History error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Open a past conversation
  const openConversation = useCallback(async (convId: string) => {
    hapticFeedback('light');
    try {
      const conv = await api.coachChatGet(convId);
      setConversationId(conv.id);
      setMessages(conv.messages || []);
      setShowHistory(false);
    } catch (err) {
      console.error('[Coach Chat] Open conv error:', err);
    }
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (convId: string) => {
    hapticFeedback('medium');
    try {
      await api.coachChatDelete(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (conversationId === convId) {
        setConversationId(null);
        setMessages([]);
      }
      setDeletingId(null);
    } catch (err) {
      console.error('[Coach Chat] Delete error:', err);
    }
  }, [conversationId]);

  // Start new chat
  const startNewChat = () => {
    hapticFeedback('light');
    setConversationId(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

  // Suggestions
  const suggestions = [
    t('coach_chat_suggest_1'),
    t('coach_chat_suggest_2'),
    t('coach_chat_suggest_3'),
    t('coach_chat_suggest_4'),
  ];

  const isEmpty = messages.length === 0;

  return (
    <PremiumGate feature="coach">
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/8 blur-[100px]" />
        <div className="absolute bottom-1/4 -left-16 w-48 h-48 rounded-full bg-[#00cec9]/6 blur-[80px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 px-5 shrink-0" style={{ paddingBottom: '0.5rem' }}>
        <PageHeader
          title={t('coach_chat_title')}
          mb="mb-0"
          actions={
            <>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { hapticFeedback('light'); loadHistory(); setShowHistory(true); }}
                className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center"
              >
                <Clock className="w-4.5 h-4.5 text-white/40" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={startNewChat}
                className="w-9 h-9 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 flex items-center justify-center"
              >
                <Plus className="w-5 h-5 text-[#a29bfe]" />
              </motion.button>
            </>
          }
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.04] mx-5" />

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4 relative z-10 min-h-0"
        style={{ paddingBottom: '1rem' }}
      >
        {/* Empty state */}
        {isEmpty && !sending && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#6c5ce7]/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-[#a29bfe]" />
            </div>
            <p className="text-white/50 text-center max-w-xs mb-6" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
              {t('coach_chat_welcome')}
            </p>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {suggestions.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSend(s)}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                  style={{ fontSize: '0.8125rem' }}
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
              msg.role === 'assistant'
                ? 'bg-[#6c5ce7]/15'
                : 'bg-white/[0.06]'
            }`}>
              {msg.role === 'assistant' ? (
                <Bot className="w-4 h-4 text-[#a29bfe]" />
              ) : (
                <User className="w-4 h-4 text-white/40" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/20'
                  : 'bg-white/[0.04] border border-white/[0.06]'
              }`}
            >
              <p
                className={`whitespace-pre-wrap ${
                  msg.role === 'user' ? 'text-white/90' : 'text-white/70'
                }`}
                style={{ fontSize: '0.875rem', lineHeight: 1.6 }}
              >
                {msg.content}
              </p>
              <p className="text-white/15 mt-1.5" style={{ fontSize: '0.625rem' }}>
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-[#a29bfe]" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#a29bfe]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#a29bfe]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#a29bfe]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-white/20 mt-1" style={{ fontSize: '0.6875rem' }}>{t('coach_chat_thinking')}</p>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <p className="text-red-400/60" style={{ fontSize: '0.8125rem' }}>{error}</p>
          </motion.div>
        )}
      </div>

      {/* Input area */}
      <div className="relative z-10 px-4 shrink-0" style={{ paddingBottom: 'max(1rem, calc(var(--safe-area-bottom, 0px) + 0.5rem))' }}>
        <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2">
          <VoiceInput
            onTranscript={(text) => {
              setInput((prev) => prev ? `${prev} ${text}` : text);
            }}
            language={lang}
            size="sm"
          />

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('coach_chat_placeholder')}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder:text-white/20 outline-none resize-none py-1"
            style={{ fontSize: '0.9375rem', lineHeight: 1.5, maxHeight: 120 }}
          />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
              input.trim() && !sending
                ? 'bg-[#6c5ce7] text-white'
                : 'bg-white/[0.04] text-white/20'
            }`}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </motion.button>
        </div>
      </div>

      {/* History panel (bottom sheet) */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowHistory(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-3xl bg-liquid-glass-panel border-t border-white/[0.1] p-6 pb-10 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('coach_chat_history')}</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-white/20" style={{ fontSize: '0.875rem' }}>{t('coach_chat_no_history')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="relative group"
                    >
                      <button
                        onClick={() => openConversation(conv.id)}
                        className={`w-full text-left p-3.5 rounded-xl bg-white/[0.03] border transition-all ${
                          conversationId === conv.id
                            ? 'border-[#6c5ce7]/30 bg-[#6c5ce7]/5'
                            : 'border-white/[0.05] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-3.5 h-3.5 text-[#a29bfe]/50" />
                          <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                            {conv.messageCount} msgs
                          </span>
                          <span className="text-white/15 ml-auto" style={{ fontSize: '0.625rem' }}>
                            {new Date(conv.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-white/50 truncate" style={{ fontSize: '0.8125rem' }}>
                          {conv.lastMessage || '...'}
                        </p>
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticFeedback('light');
                          if (deletingId === conv.id) {
                            deleteConversation(conv.id);
                          } else {
                            setDeletingId(conv.id);
                          }
                        }}
                        className={`absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          deletingId === conv.id
                            ? 'bg-red-500/20 border border-red-500/30'
                            : 'bg-white/[0.04] opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Trash2 className={`w-3.5 h-3.5 ${deletingId === conv.id ? 'text-red-400' : 'text-white/30'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </PremiumGate>
  );
}
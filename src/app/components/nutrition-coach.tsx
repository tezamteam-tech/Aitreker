// =============================================
// AI Nutrition Coach — RAG-enhanced Chat
// =============================================
// Personalized nutrition & fitness advice with
// access to user profile, food history, calorie
// balance, and meal plan data.
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Loader2,
  User,
  Plus,
  MessageSquare,
  Trash2,
  X,
  Clock,
  Apple,
  Salad,
  Flame,
  Scale,
  Sparkles,
  ChevronLeft,
  Dumbbell,
} from 'lucide-react';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { PremiumGate } from './premium-gate';
import { PremiumBadge } from './premium-gate';

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

export function NutritionCoachPage() {
  const navigate = useNavigate();
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
      const res = await api.nutriCoachSend(msg, conversationId || undefined);
      setConversationId(res.conversationId);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.response,
        ts: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      hapticSuccess();
    } catch (err: any) {
      console.error('[NutriCoach] Send error:', err);
      setError(t('nutri_coach_error'));
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

  // Load conversation history list
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.nutriCoachList();
      setConversations(res.conversations || []);
    } catch (err) {
      console.error('[NutriCoach] History error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Open a past conversation
  const openConversation = useCallback(async (convId: string) => {
    hapticFeedback('light');
    try {
      const conv = await api.nutriCoachGet(convId);
      setConversationId(conv.id);
      setMessages(conv.messages || []);
      setShowHistory(false);
    } catch (err) {
      console.error('[NutriCoach] Open conv error:', err);
    }
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (convId: string) => {
    hapticFeedback('medium');
    try {
      await api.nutriCoachDelete(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (conversationId === convId) {
        setConversationId(null);
        setMessages([]);
      }
      setDeletingId(null);
    } catch (err) {
      console.error('[NutriCoach] Delete error:', err);
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

  // Nutrition-specific suggestion chips
  const suggestions = [
    t('nutri_coach_suggest_1'),
    t('nutri_coach_suggest_2'),
    t('nutri_coach_suggest_3'),
    t('nutri_coach_suggest_4'),
    t('nutri_coach_suggest_5'),
  ];

  const isEmpty = messages.length === 0;

  // Format assistant messages with basic markdown-like rendering
  const formatMessage = (content: string) => {
    // Bold: **text**
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white/90 font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <PremiumGate feature="nutrition-coach">
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#00b894]/8 blur-[100px]" />
        <div className="absolute bottom-1/4 -left-16 w-48 h-48 rounded-full bg-[#fdcb6e]/6 blur-[80px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 px-5 shrink-0" style={{ paddingTop: 'var(--safe-area-top, 56px)', paddingBottom: '0.5rem' }}>
        <div className="flex items-center justify-between mb-0">
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5 text-white/50" />
            </motion.button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00b894] to-[#00cec9] flex items-center justify-center">
                  <Salad className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold" style={{ fontSize: '1.125rem', lineHeight: 1.2 }}>
                    {t('nutri_coach_title')}
                  </h1>
                  <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                    {t('nutri_coach_subtitle')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              className="w-9 h-9 rounded-xl bg-[#00b894]/20 border border-[#00b894]/30 flex items-center justify-center"
            >
              <Plus className="w-5 h-5 text-[#00b894]" />
            </motion.button>
          </div>
        </div>
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
            {/* Coach avatar */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#00b894]/20 to-[#00cec9]/10 flex items-center justify-center mb-4 border border-[#00b894]/20">
              <Salad className="w-10 h-10 text-[#00b894]" />
            </div>
            <p className="text-white/50 text-center max-w-xs mb-2" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {t('nutri_coach_welcome_title')}
            </p>
            <p className="text-white/30 text-center max-w-xs mb-6" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {t('nutri_coach_welcome')}
            </p>

            {/* Quick action icons */}
            <div className="flex gap-4 mb-6">
              {[
                { icon: Apple, label: t('nutri_coach_topic_diet'), color: '#e17055' },
                { icon: Flame, label: t('nutri_coach_topic_calories'), color: '#fdcb6e' },
                { icon: Scale, label: t('nutri_coach_topic_weight'), color: '#00b894' },
                { icon: Dumbbell, label: t('nutri_coach_topic_workout'), color: '#6c5ce7' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
                  >
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <span className="text-white/30" style={{ fontSize: '0.625rem' }}>{item.label}</span>
                </motion.div>
              ))}
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {suggestions.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSend(s)}
                  className="px-3.5 py-2 rounded-xl bg-[#00b894]/[0.06] border border-[#00b894]/[0.12] text-white/50 hover:text-white/70 hover:bg-[#00b894]/[0.1] transition-all"
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
                ? 'bg-gradient-to-br from-[#00b894]/20 to-[#00cec9]/10'
                : 'bg-white/[0.06]'
            }`}>
              {msg.role === 'assistant' ? (
                <Salad className="w-4 h-4 text-[#00b894]" />
              ) : (
                <User className="w-4 h-4 text-white/40" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-[#00b894]/20 border border-[#00b894]/20'
                  : 'bg-white/[0.04] border border-white/[0.06]'
              }`}
            >
              <p
                className={`whitespace-pre-wrap ${
                  msg.role === 'user' ? 'text-white/90' : 'text-white/70'
                }`}
                style={{ fontSize: '0.875rem', lineHeight: 1.6 }}
              >
                {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00b894]/20 to-[#00cec9]/10 flex items-center justify-center shrink-0">
              <Salad className="w-4 h-4 text-[#00b894]" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00b894]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#00b894]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#00b894]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-white/20 mt-1" style={{ fontSize: '0.6875rem' }}>{t('nutri_coach_thinking')}</p>
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
            placeholder={t('nutri_coach_placeholder')}
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
                ? 'bg-[#00b894] text-white'
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
                <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('nutri_coach_history')}</h2>
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
                  <p className="text-white/20" style={{ fontSize: '0.875rem' }}>{t('nutri_coach_no_history')}</p>
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
                            ? 'border-[#00b894]/30 bg-[#00b894]/5'
                            : 'border-white/[0.05] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Salad className="w-3.5 h-3.5 text-[#00b894]/50" />
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
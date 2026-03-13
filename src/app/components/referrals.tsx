// =============================================
// Referrals Screen
// =============================================
// Referral program with:
//   - Personal referral link
//   - Invited users list
//   - Rewards tracking
//   - Share functionality
// =============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Share2,
  Copy,
  Users,
  Gift,
  CheckCircle2,
  Trophy,
  Crown,
  ExternalLink,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

interface Referral {
  id: string;
  firstName: string;
  username?: string;
  joinedAt: string;
  isPremium: boolean;
}

export function ReferralsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [referrals, setReferrals] = useState<Referral[]>([
    {
      id: '1',
      firstName: 'Alex',
      username: 'alex_fit',
      joinedAt: '2026-03-01',
      isPremium: true,
    },
    {
      id: '2',
      firstName: 'Sarah',
      username: 'sarah_health',
      joinedAt: '2026-03-05',
      isPremium: false,
    },
    {
      id: '3',
      firstName: 'Mike',
      joinedAt: '2026-03-10',
      isPremium: false,
    },
  ]);

  const [copied, setCopied] = useState(false);
  const totalReferrals = referrals.length;
  const premiumReferrals = referrals.filter(r => r.isPremium).length;
  const totalRewards = totalReferrals * 100 + premiumReferrals * 500; // Mock rewards calculation

  const referralLink = user?.referralCode 
    ? `https://t.me/YOUR_BOT/app?startapp=ref_${user.referralCode}`
    : '';

  const handleCopyLink = async () => {
    if (!referralLink) return;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = () => {
    hapticFeedback('medium');
    if (!referralLink) return;
    
    const shareText = `Join me on this fitness journey! Track your nutrition and workouts with AI. ${referralLink}`;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`
      );
    }
  };

  return (
    <div className="min-h-screen pb-6">
      <PageHeader title={t('referrals_title') || 'Referrals'} />

      <div className="px-4 space-y-4">
        
        {/* Referral Stats */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-[#6c5ce7]" />
              <span className="text-xs text-white/50">Total Invited</span>
            </div>
            <p className="text-2xl text-white font-semibold">{totalReferrals}</p>
            <p className="text-xs text-white/40 mt-1">Friends joined</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-[#fd79a8]" />
              <span className="text-xs text-white/50">Rewards Earned</span>
            </div>
            <p className="text-2xl text-white font-semibold">{totalRewards}</p>
            <p className="text-xs text-white/40 mt-1">Bonus points</p>
          </GlassCard>
        </div>

        {/* Referral Link Card */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="w-5 h-5 text-[#a29bfe]" />
            <h3 className="text-white font-medium">Your Referral Link</h3>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-3">
            <p className="text-sm text-white/80 break-all font-mono">
              {referralLink || 'Loading...'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCopyLink}
              className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#00cec9]" />
                  <span className="text-sm text-[#00cec9]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-white/60" />
                  <span className="text-sm text-white/80">Copy</span>
                </>
              )}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleShare}
              className="p-3 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-white" />
              <span className="text-sm text-white font-medium">Share</span>
            </motion.button>
          </div>
        </GlassCard>

        {/* Rewards Info */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-[#ffd700]" />
            <h3 className="text-white font-medium">Earn Rewards</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
              <div className="w-8 h-8 rounded-full bg-[#6c5ce7]/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-[#6c5ce7]" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">+100 points</p>
                <p className="text-white/50 text-xs">For each friend who joins</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
              <div className="w-8 h-8 rounded-full bg-[#ffd700]/20 flex items-center justify-center flex-shrink-0">
                <Crown className="w-4 h-4 text-[#ffd700]" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">+500 points</p>
                <p className="text-white/50 text-xs">When they upgrade to Premium</p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Invited Friends List */}
        <div>
          <h4 className="text-white/60 text-sm px-1 mb-2">
            Invited Friends ({totalReferrals})
          </h4>

          <div className="space-y-2">
            {referrals.map((referral, idx) => (
              <motion.div
                key={referral.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {referral.firstName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{referral.firstName}</p>
                        <p className="text-white/40 text-xs">
                          {referral.username ? `@${referral.username}` : 'No username'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      {referral.isPremium && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20">
                          <Crown className="w-3 h-3 text-[#ffd700]" />
                          <span className="text-xs text-[#ffd700]">Pro</span>
                        </div>
                      )}
                      <CheckCircle2 className="w-4 h-4 text-[#00cec9]" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>

        {referrals.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/40 text-sm mb-2">No referrals yet</p>
            <p className="text-white/30 text-xs">Share your link to invite friends</p>
          </div>
        )}

      </div>
    </div>
  );
}

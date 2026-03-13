// =============================================
// Profile Screen — Nutrition & Fitness Context
// =============================================
// User profile adapted for fitness tracking:
//   - Body metrics (weight, height, BMI)
//   - Daily calorie goals
//   - Fitness preferences
//   - Settings & preferences
//   - Referral system
// =============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  User,
  Scale,
  TrendingDown,
  Target,
  Settings,
  Bell,
  Share2,
  LogOut,
  ChevronRight,
  Edit2,
  Users,
  Crown,
  Award,
  Activity,
  Heart,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

interface UserMetrics {
  weight: number;
  height: number;
  age: number;
  gender: 'male' | 'female' | 'other';
  activityLevel: string;
  goalType: 'lose' | 'maintain' | 'gain';
}

export function ProfileNutritionPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [metrics, setMetrics] = useState<UserMetrics>({
    weight: 75,
    height: 175,
    age: 28,
    gender: 'male',
    activityLevel: 'moderate',
    goalType: 'lose',
  });

  const [calorieGoal, setCalorieGoal] = useState(2000);
  const [isPremium, setIsPremium] = useState(false);

  const bmi = (metrics.weight / ((metrics.height / 100) ** 2)).toFixed(1);
  const targetWeight = 70;
  const weightToLose = metrics.weight - targetWeight;

  const handleReferralShare = () => {
    hapticFeedback('medium');
    if (!user?.referralCode) return;
    
    const referralLink = `https://t.me/YOUR_BOT/app?startapp=ref_${user.referralCode}`;
    const shareText = `Join me on this fitness journey! Track your nutrition and workouts with AI. ${referralLink}`;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);
    }
  };

  const menuItems = [
    {
      icon: Scale,
      label: 'Body Metrics',
      color: '#6c5ce7',
      action: () => navigate('/profile/metrics'),
    },
    {
      icon: Target,
      label: 'Calorie Goals',
      color: '#fd79a8',
      action: () => navigate('/profile/goals'),
    },
    {
      icon: Activity,
      label: 'Fitness Preferences',
      color: '#00cec9',
      action: () => navigate('/profile/preferences'),
    },
    {
      icon: Bell,
      label: 'Notifications',
      color: '#ffeaa7',
      action: () => navigate('/profile/notifications'),
    },
    {
      icon: Users,
      label: 'Referrals',
      color: '#a29bfe',
      action: () => navigate('/referrals'),
    },
    {
      icon: Settings,
      label: 'Settings',
      color: '#74b9ff',
      action: () => navigate('/profile/settings'),
    },
  ];

  return (
    <div className="min-h-screen pb-6">
      <PageHeader 
        title={t('profile_title') || 'Profile'} 
        showBack={false}
      />

      <div className="px-4 space-y-4">
        
        {/* User Card */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl text-white font-semibold mb-1">
                {user?.firstName || 'User'}
              </h2>
              <p className="text-sm text-white/50">@{user?.username || 'username'}</p>
            </div>
            {isPremium && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ffd700]/20 to-[#ffa500]/20 border border-[#ffd700]/30">
                <Crown className="w-4 h-4 text-[#ffd700]" />
                <span className="text-xs text-[#ffd700]">Pro</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Weight</p>
              <p className="text-sm text-white font-medium">{metrics.weight} kg</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Height</p>
              <p className="text-sm text-white font-medium">{metrics.height} cm</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">BMI</p>
              <p className="text-sm text-white font-medium">{bmi}</p>
            </div>
          </div>
        </GlassCard>

        {/* Goal Progress */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Current Goal</h3>
            <button className="text-sm text-[#a29bfe]">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">Target Weight</span>
            <span className="text-sm text-white font-medium">{targetWeight} kg</span>
          </div>

          <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((targetWeight / metrics.weight) * 100)}%` }}
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00cec9] to-[#74b9ff]"
            />
          </div>

          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#00cec9]" />
            <span className="text-xs text-white/50">
              {weightToLose > 0 ? `${weightToLose.toFixed(1)} kg to go` : 'Goal reached!'}
            </span>
          </div>
        </GlassCard>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-[#ffd700]" />
              <span className="text-xs text-white/50">Streak</span>
            </div>
            <p className="text-2xl text-white font-semibold">14</p>
            <p className="text-xs text-white/40 mt-1">Days logged</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-[#00cec9]" />
              <span className="text-xs text-white/50">Workouts</span>
            </div>
            <p className="text-2xl text-white font-semibold">23</p>
            <p className="text-xs text-white/40 mt-1">This month</p>
          </GlassCard>
        </div>

        {/* Daily Calorie Goal */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#fd79a8]" />
              <h3 className="text-white font-medium">Daily Calorie Goal</h3>
            </div>
            <button className="text-sm text-[#a29bfe]">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          <p className="text-3xl text-white font-semibold mb-2">{calorieGoal}</p>
          <p className="text-sm text-white/50">
            Based on your {metrics.activityLevel} activity level
          </p>
        </GlassCard>

        {/* Menu Items */}
        <div className="space-y-2">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  hapticFeedback('light');
                  item.action();
                }}
                className="w-full"
              >
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: item.color }} />
                      </div>
                      <span className="text-white font-medium">{item.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-white/40" />
                  </div>
                </GlassCard>
              </motion.button>
            );
          })}
        </div>

        {/* Share Referral */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleReferralShare}
          className="w-full p-4 rounded-[20px] bg-gradient-to-br from-[#00cec9] to-[#74b9ff] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">Share with Friends</p>
              <p className="text-white/70 text-sm">Get rewards for referrals</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80" />
        </motion.button>

        {/* Sign Out */}
        <button
          onClick={() => {
            hapticFeedback('medium');
            signOut();
          }}
          className="w-full p-4 rounded-[18px] bg-white/5 border border-white/10 flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5 text-white/60" />
          <span className="text-white/80">Sign Out</span>
        </button>

      </div>
    </div>
  );
}

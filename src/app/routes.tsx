import { createBrowserRouter } from 'react-router';
import React, { Suspense } from 'react';
import { AppLayout } from './components/layout';

// ---- Lazy-loaded page components (code splitting) ----
const OnboardingPage = React.lazy(() => import('./components/onboarding').then(m => ({ default: m.OnboardingPage })));
const OnboardingNutritionPage = React.lazy(() => import('./components/onboarding-nutrition').then(m => ({ default: m.OnboardingNutritionPage })));
const DashboardPage = React.lazy(() => import('./components/dashboard').then(m => ({ default: m.DashboardPage })));
const HomeNutritionPage = React.lazy(() => import('./components/home-nutrition').then(m => ({ default: m.HomeNutritionPage })));
const CaloriesPage = React.lazy(() => import('./components/calories').then(m => ({ default: m.CaloriesPage })));
const ScanFoodPage = React.lazy(() => import('./components/scan-food').then(m => ({ default: m.ScanFoodPage })));
const MealPlanPage = React.lazy(() => import('./components/meal-plan').then(m => ({ default: m.MealPlanPage })));
const WorkoutPlanPage = React.lazy(() => import('./components/workout-plan').then(m => ({ default: m.WorkoutPlanPage })));
const ProfileNutritionPage = React.lazy(() => import('./components/profile-nutrition').then(m => ({ default: m.ProfileNutritionPage })));
const ReferralsPage = React.lazy(() => import('./components/referrals').then(m => ({ default: m.ReferralsPage })));
const DayViewPage = React.lazy(() => import('./components/day-view').then(m => ({ default: m.DayViewPage })));
const ProfilePage = React.lazy(() => import('./components/profile').then(m => ({ default: m.ProfilePage })));
const ChallengesListPage = React.lazy(() => import('./components/challenges-list').then(m => ({ default: m.ChallengesListPage })));
const ChallengeCreatePage = React.lazy(() => import('./components/challenge-create').then(m => ({ default: m.ChallengeCreatePage })));
const ChallengeDetailPage = React.lazy(() => import('./components/challenge-detail').then(m => ({ default: m.ChallengeDetailPage })));
const PlanBuilderPage = React.lazy(() => import('./components/plan-builder').then(m => ({ default: m.PlanBuilderPage })));
const PlanHistoryPage = React.lazy(() => import('./components/plan-history').then(m => ({ default: m.PlanHistoryPage })));
const FocusTimerPage = React.lazy(() => import('./components/focus-timer').then(m => ({ default: m.FocusTimerPage })));
const JournalPage = React.lazy(() => import('./components/journal').then(m => ({ default: m.JournalPage })));
const JournalInsightsPage = React.lazy(() => import('./components/journal-insights').then(m => ({ default: m.JournalInsightsPage })));
const CoachChatPage = React.lazy(() => import('./components/coach-chat').then(m => ({ default: m.CoachChatPage })));
const NutritionCoachPage = React.lazy(() => import('./components/nutrition-coach').then(m => ({ default: m.NutritionCoachPage })));
const WeightTrackingPage = React.lazy(() => import('./components/weight-tracking').then(m => ({ default: m.WeightTrackingPage })));
const MeasurementsTrackingPage = React.lazy(() => import('./components/measurements-tracking').then(m => ({ default: m.MeasurementsTrackingPage })));
const GoalsListPage = React.lazy(() => import('./components/goals-list').then(m => ({ default: m.GoalsListPage })));
const GoalDetailPage = React.lazy(() => import('./components/goal-detail').then(m => ({ default: m.GoalDetailPage })));
const BonusesPage = React.lazy(() => import('./components/bonuses').then(m => ({ default: m.BonusesPage })));
const AdminPage = React.lazy(() => import('./components/admin').then(m => ({ default: m.AdminPage })));
const WalletPage = React.lazy(() => import('./components/wallet').then(m => ({ default: m.WalletPage })));
const UpgradePremiumPage = React.lazy(() => import('./components/upgrade-premium').then(m => ({ default: m.UpgradePremiumPage })));
const WeeklyAnalyticsPage = React.lazy(() => import('./components/weekly-analytics').then(m => ({ default: m.WeeklyAnalyticsPage })));
const NotificationSettingsPage = React.lazy(() => import('./components/notification-settings').then(m => ({ default: m.NotificationSettingsPage })));

// ---- Suspense wrapper for lazy routes ----
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {children}
    </Suspense>
  );
}

// ---- Lightweight loading skeleton ----
function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="relative w-10 h-10">
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: '#6c5ce7',
            borderRightColor: 'rgba(108, 92, 231, 0.3)',
            animationDuration: '0.8s',
          }}
        />
        <div
          className="absolute inset-1.5 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderBottomColor: '#a29bfe',
            borderLeftColor: 'rgba(162, 155, 254, 0.3)',
            animationDuration: '1.2s',
            animationDirection: 'reverse',
          }}
        />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <p className="text-foreground/20 mb-2" style={{ fontSize: '4rem', fontWeight: 700 }}>404</p>
      <p className="text-muted-foreground" style={{ fontSize: '0.9375rem' }}>Page not found</p>
      <a href="/home" className="mt-6 text-app-accent" style={{ fontSize: '0.9375rem' }}>
        Go Home
      </a>
    </div>
  );
}

// ---- Helper: wrap lazy component ----
function lazy(Component: React.LazyExoticComponent<React.ComponentType>) {
  return () => (
    <LazyPage>
      <Component />
    </LazyPage>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, Component: lazy(OnboardingNutritionPage) },
      { path: 'onboarding-legacy', Component: lazy(OnboardingPage) },
      { path: 'home', Component: lazy(HomeNutritionPage) },
      { path: 'calories', Component: lazy(CaloriesPage) },
      { path: 'calories/scan', Component: lazy(ScanFoodPage) },
      { path: 'meal-plan', Component: lazy(MealPlanPage) },
      { path: 'workout-plan', Component: lazy(WorkoutPlanPage) },
      { path: 'profile', Component: lazy(ProfileNutritionPage) },
      { path: 'profile/notifications', Component: lazy(NotificationSettingsPage) },
      { path: 'referrals', Component: lazy(ReferralsPage) },
      { path: 'day/:dayNumber', Component: lazy(DayViewPage) },
      { path: 'challenges', Component: lazy(ChallengesListPage) },
      { path: 'challenges/create', Component: lazy(ChallengeCreatePage) },
      { path: 'challenges/:id', Component: lazy(ChallengeDetailPage) },
      { path: 'plan-builder', Component: lazy(PlanBuilderPage) },
      { path: 'plan-history', Component: lazy(PlanHistoryPage) },
      { path: 'focus', Component: lazy(FocusTimerPage) },
      { path: 'journal', Component: lazy(JournalPage) },
      { path: 'journal/insights', Component: lazy(JournalInsightsPage) },
      { path: 'coach', Component: lazy(CoachChatPage) },
      { path: 'nutrition-coach', Component: lazy(NutritionCoachPage) },
      { path: 'weight', Component: lazy(WeightTrackingPage) },
      { path: 'measurements', Component: lazy(MeasurementsTrackingPage) },
      { path: 'analytics', Component: lazy(WeeklyAnalyticsPage) },
      { path: 'goals', Component: lazy(GoalsListPage) },
      { path: 'goals/:id', Component: lazy(GoalDetailPage) },
      { path: 'bonuses', Component: lazy(BonusesPage) },
      { path: 'wallet', Component: lazy(WalletPage) },
      { path: 'upgrade', Component: lazy(UpgradePremiumPage) },
      { path: 'admin', Component: lazy(AdminPage) },
      { path: '*', Component: NotFound },
    ],
  },
]);
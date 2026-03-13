# AI Nutrition & Fitness Tracker — Fork Documentation

## Overview

This project has been forked from the BECOME self-development app into a new **AI Nutrition & Fitness Tracker** product.

The main idea: Users take a photo of food → AI analyzes calories and macros.

## What Was Changed

### ✅ New Navigation Structure

The app now has **5 main tabs**:

1. **Home** — Daily calorie overview, scan food button, meal/workout preview
2. **Calories** — Detailed food log with meal-by-meal breakdown
3. **Meal Plan** — AI-generated weekly meal plans
4. **Workout Plan** — AI-generated weekly workout schedules
5. **Profile** — User metrics, goals, settings, and referrals

### ✅ New Screens Created

| File | Description |
|------|-------------|
| `/src/app/components/home-nutrition.tsx` | Home screen with calorie tracking, scan food button, and today's preview |
| `/src/app/components/calories.tsx` | Full food log with meal categorization and macro breakdown |
| `/src/app/components/meal-plan.tsx` | Weekly meal planning with AI generation |
| `/src/app/components/workout-plan.tsx` | Weekly workout scheduling with exercise tracking |
| `/src/app/components/profile-nutrition.tsx` | Profile adapted for fitness context (body metrics, calorie goals) |
| `/src/app/components/referrals.tsx` | Referral program with rewards tracking |

### ✅ Updated Files

#### `/src/app/routes.tsx`
- Added lazy imports for all new screens
- Updated route definitions to prioritize nutrition/fitness screens
- Old routes (challenges, goals, journal) are preserved but de-emphasized

#### `/src/app/components/layout.tsx`
- Updated tab navigation to show: Home, Calories, Meals, Workout, Profile
- Updated active tab detection logic
- Added new back button page paths
- Updated deep link routing

#### `/src/app/components/i18n.tsx`
- Added translation keys for new navigation labels:
  - `nav_calories`, `nav_meal_plan`, `nav_workout`
- Added page title translations:
  - `home_title`, `calories_title`, `meal_plan_title`, `workout_plan_title`, `profile_title`, `referrals_title`

## What Was Preserved

✅ **Architecture** — All existing auth, API client, and state management  
✅ **Design System** — Liquid glass effects, SVG filters, theme.css  
✅ **Telegram Integration** — Full MiniApp SDK, haptic feedback, back button  
✅ **UI Components** — All shadcn/ui components, GlassCard, PageHeader  
✅ **Old Features** — Challenges, goals, journal still accessible (not in main nav)

## Key Features

### Home Screen
- Daily calorie counter (consumed vs goal)
- Remaining calories display
- "Scan Food" button with camera icon
- Today's meal plan preview (3 meals)
- Today's workout plan preview
- Weekly stats (weight loss, calories burned)

### Calories Screen
- Meal-by-meal breakdown (Breakfast, Lunch, Dinner, Snack)
- Each meal shows time, calories, and macros (P/C/F)
- Delete food entries
- Action buttons: "Scan Food" and "Add Manual"

### Meal Plan Screen
- Weekly calendar view
- Daily meal schedule with 6 meals
- Macro and calorie targets per day
- AI regeneration button
- Shopping list generation

### Workout Plan Screen
- Weekly workout calendar
- Exercise list with sets/reps
- Progress tracking (completed exercises)
- Calorie burn estimates
- Start workout button

### Profile Screen
- Body metrics (weight, height, BMI)
- Goal progress (target weight)
- Daily calorie goal setting
- Activity stats (streak, workouts)
- Menu: Body Metrics, Calorie Goals, Fitness Preferences, Notifications, Referrals, Settings

### Referrals Screen
- Personal referral link
- Copy/share functionality
- Invited friends list
- Rewards system (100 points per friend, 500 for premium)

## Mock Data

All screens currently use **mock/placeholder data** for demonstration:
- Calorie values, meal plans, workout schedules
- User metrics and goals
- Referral data

## Next Steps (Backend Integration)

To make this fully functional, you'll need to:

1. **API Endpoints**:
   - `GET /nutrition/today` — Today's nutrition data
   - `GET /nutrition/log` — Food log entries
   - `POST /nutrition/scan` — Upload food photo for AI analysis
   - `GET /meal-plan/:date` — Meal plan for specific day
   - `POST /meal-plan/generate` — AI meal plan generation
   - `GET /workout-plan/:date` — Workout plan for specific day
   - `POST /workout-plan/generate` — AI workout generation
   - `GET /user/metrics` — Body metrics and goals
   - `PUT /user/metrics` — Update metrics
   - `GET /referrals` — User referrals list

2. **AI Integration**:
   - Food photo analysis (computer vision API)
   - Meal plan generation (OpenAI/Claude)
   - Workout plan generation based on user goals

3. **Supabase Tables** (suggested):
   - `nutrition_log` (food entries)
   - `meal_plans` (weekly plans)
   - `workout_plans` (weekly schedules)
   - `user_metrics` (weight, height, goals)
   - `referrals` (referral tracking)

## Design Philosophy

This fork maintains the **Apple Liquid Glass aesthetic** from BECOME:
- SVG displacement filters for organic glass effect
- Smooth animations with Motion (formerly Framer Motion)
- Haptic feedback on all interactions
- Bottom sheet navigation
- Safe area handling for iOS notch

## How to Use

1. The app starts with onboarding (existing)
2. After onboarding, user lands on **Home** (nutrition dashboard)
3. Main navigation is always visible at bottom
4. "Scan Food" button is prominently featured
5. All old features (challenges, goals, journal) remain accessible via their original routes

## Color Coding

- 🔴 **Calories** — Red/pink (`#fd79a8`)
- 🟢 **Workouts** — Green/cyan (`#00cec9`)
- 🟣 **Profile** — Purple (`#6c5ce7`)
- 🟡 **Meals** — Yellow (`#ffeaa7`)

---

**Note**: This is a fork — all original BECOME functionality remains intact and can be accessed directly via URLs (e.g., `/challenges`, `/goals`, `/journal`).

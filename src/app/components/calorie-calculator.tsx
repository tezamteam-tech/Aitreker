// =============================================
// Calorie Calculator — Mifflin-St Jeor Formula
// =============================================
// BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(y) + s
//   where s = +5 for male, −161 for female
//
// TDEE = BMR × activity multiplier
// Target = TDEE + goal adjustment
// =============================================

type Gender = 'male' | 'female';
type ActivityLevel = 'low' | 'medium' | 'high' | 'athlete';
type Goal = 'lose_weight' | 'maintain_weight' | 'gain_muscle';

export interface CalorieProfile {
  gender: Gender;
  age: number;
  height: number;   // cm
  weight: number;    // kg
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface CalorieResult {
  bmr: number;              // Basal Metabolic Rate
  dailyCalories: number;    // TDEE (maintenance)
  targetCalories: number;   // Adjusted for goal
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  low: 1.2,       // Sedentary — little or no exercise
  medium: 1.375,  // Light — 2-3 workouts/week
  high: 1.55,     // Moderate — 4-5 workouts/week
  athlete: 1.725, // Very active — daily intense training
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose_weight: -500,      // 500 cal deficit → ~0.45 kg/week loss
  maintain_weight: 0,     // No adjustment
  gain_muscle: 300,       // 300 cal surplus → lean muscle gain
};

/**
 * Calculate BMR using Mifflin-St Jeor equation.
 */
export function calculateBMR(gender: Gender, weight: number, height: number, age: number): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

/**
 * Calculate daily maintenance calories (TDEE).
 */
export function calculateDailyCalories(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/**
 * Calculate target calories based on user goal.
 */
export function calculateTargetCalories(dailyCalories: number, goal: Goal): number {
  const target = dailyCalories + GOAL_ADJUSTMENTS[goal];
  // Ensure minimum safe intake (1200 for women, 1500 for men — we use 1200 as floor)
  return Math.max(1200, Math.round(target));
}

/**
 * Full calculation pipeline: profile → BMR → TDEE → target.
 */
export function calculateCalories(profile: CalorieProfile): CalorieResult {
  const bmr = calculateBMR(profile.gender, profile.weight, profile.height, profile.age);
  const dailyCalories = calculateDailyCalories(bmr, profile.activityLevel);
  const targetCalories = calculateTargetCalories(dailyCalories, profile.goal);

  return { bmr, dailyCalories, targetCalories };
}

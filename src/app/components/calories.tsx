// =============================================
// Calories — Daily Food Diary
// =============================================
// Full-featured daily food log:
//   - Progress bar: consumed / daily target
//   - Macro totals (protein, carbs, fat)
//   - Entries grouped by meal with time
//   - Delete food entries
//   - Inline edit calories
//   - Add manual food entry (bottom sheet)
//   - Scan Food (camera AI recognition)
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Plus,
  Trash2,
  Pencil,
  Flame,
  Apple,
  Coffee,
  UtensilsCrossed,
  Moon,
  X,
  Check,
  ChevronDown,
  Clock,
  Target,
  TrendingUp,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { useFreemium } from './use-freemium';
import { toast } from 'sonner';

// ---- Types ----
interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  // Extended (optional)
  fiber_g?: number;
  sugar_g?: number;
  added_sugar_g?: number;
  sodium_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  vitamin_d_mcg?: number;
  magnesium_mg?: number;
  glycemic_index?: number;
  nova_group?: 1 | 2 | 3 | 4;
  nutrient_density?: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time: string;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_CONFIG: Record<
  MealType,
  { icon: React.ElementType; color: string; key: string }
> = {
  breakfast: { icon: Coffee, color: '#ffeaa7', key: 'cal_meal_breakfast' },
  lunch: { icon: UtensilsCrossed, color: '#fd79a8', key: 'cal_meal_lunch' },
  dinner: { icon: Moon, color: '#a29bfe', key: 'cal_meal_dinner' },
  snack: { icon: Apple, color: '#00cec9', key: 'cal_meal_snack' },
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// No mock data — entries loaded from API

// ---- Component ----
export function CaloriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // State
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);

  useBottomSheetLifecycle(showAddSheet || editingEntry !== null);

  // Load calorie target from cache/API
  useEffect(() => {
    const cached = localStorage.getItem('nutrition_calorie_target');
    if (cached) setCalorieTarget(Number(cached));

    if (!user) return;
    api.getUserProfile().then((profile) => {
      if (profile?.daily_calorie_target) {
        setCalorieTarget(profile.daily_calorie_target);
      }
    }).catch(() => {});
  }, [user]);

  // Load today's food entries from API
  const loadEntries = useCallback(() => {
    if (!user) { setIsLoadingEntries(false); return; }
    const today = new Date().toISOString().slice(0, 10);
    api.getFoodEntries(today).then((data) => {
      const apiEntries = (data.entries || []).map((e: any) => ({
        id: e.id,
        name: e.food_name,
        calories: e.calories || 0,
        protein: e.protein || 0,
        carbs: e.carbs || 0,
        fats: e.fat || 0,
        mealType: (e.meal_type || 'snack') as MealType,
        time: e.created_at
          ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '--:--',
      }));
      setEntries(apiEntries);
    }).catch((err) => {
      console.warn('[Calories] Failed to load food entries:', err);
    }).finally(() => setIsLoadingEntries(false));
  }, [user]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Computed
  const totalCalories = entries.reduce((s, e) => s + e.calories, 0);
  const totalProtein = entries.reduce((s, e) => s + e.protein, 0);
  const totalCarbs = entries.reduce((s, e) => s + e.carbs, 0);
  const totalFats = entries.reduce((s, e) => s + e.fats, 0);
  const remaining = Math.max(0, calorieTarget - totalCalories);
  const progress = calorieTarget > 0 ? Math.min((totalCalories / calorieTarget) * 100, 100) : 0;
  const isOverBudget = totalCalories > calorieTarget;

  const grouped = entries.reduce((acc, entry) => {
    if (!acc[entry.mealType]) acc[entry.mealType] = [];
    acc[entry.mealType].push(entry);
    return acc;
  }, {} as Record<string, FoodEntry[]>);

  // Handlers — wired to real API
  const handleDelete = useCallback(
    (id: string) => {
      hapticSuccess();
      setDeletingId(id);
      // Optimistic delete
      setEntries((prev) => prev.filter((e) => e.id !== id));
      api.deleteFoodEntry(id).catch((err) => {
        console.error('[Calories] Delete failed:', err);
        loadEntries();
      });
      setTimeout(() => setDeletingId(null), 300);
    },
    [loadEntries]
  );

  const handleEditSave = useCallback(
    (updated: FoodEntry) => {
      hapticSuccess();
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setEditingEntry(null);
    },
    []
  );

  const handleAddEntry = useCallback(
    (entry: Omit<FoodEntry, 'id'>) => {
      hapticFeedback('medium');
      api.addFoodEntry({
        food_name: entry.name,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fats,
        fiber_g: entry.fiber_g,
        sugar_g: entry.sugar_g,
        added_sugar_g: entry.added_sugar_g,
        sodium_mg: entry.sodium_mg,
        iron_mg: entry.iron_mg,
        calcium_mg: entry.calcium_mg,
        vitamin_d_mcg: entry.vitamin_d_mcg,
        magnesium_mg: entry.magnesium_mg,
        glycemic_index: entry.glycemic_index,
        nova_group: entry.nova_group,
        nutrient_density: entry.nutrient_density,
        meal_type: entry.mealType,
      }).then((saved) => {
        hapticSuccess();
        const newEntry: FoodEntry = {
          id: saved.id,
          name: saved.food_name,
          calories: saved.calories,
          protein: saved.protein,
          carbs: saved.carbs,
          fats: saved.fat,
          fiber_g: saved.fiber_g,
          sugar_g: saved.sugar_g,
          added_sugar_g: saved.added_sugar_g,
          sodium_mg: saved.sodium_mg,
          iron_mg: saved.iron_mg,
          calcium_mg: saved.calcium_mg,
          vitamin_d_mcg: saved.vitamin_d_mcg,
          magnesium_mg: saved.magnesium_mg,
          glycemic_index: saved.glycemic_index,
          nova_group: saved.nova_group,
          nutrient_density: saved.nutrient_density,
          mealType: (saved.meal_type || 'snack') as MealType,
          time: saved.created_at
            ? new Date(saved.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setEntries((prev) => [...prev, newEntry]);
        setShowAddSheet(false);
      }).catch((err) => {
        console.error('[Calories] Add entry failed:', err);
        hapticError();
        const newEntry: FoodEntry = {
          ...entry,
          id: `local_${Date.now()}`,
        };
        setEntries((prev) => [...prev, newEntry]);
        setShowAddSheet(false);
      });
    },
    []
  );

  const handleScanFood = () => {
    hapticFeedback('medium');
    navigate('/calories/scan');
  };

  // ---- Progress gradient color based on state ----
  const progressColor = isOverBudget
    ? 'from-[#ff6b6b] to-[#ee5a24]'
    : progress > 80
    ? 'from-[#fdcb6e] to-[#e17055]'
    : 'from-[#6c5ce7] to-[#a29bfe]';

  return (
    <div className="min-h-screen pb-28">
      <PageHeader
        title={t('cal_food_diary')}
        subtitle={new Date().toLocaleDateString(t('locale_code'), {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      />

      <div className="px-4 space-y-4">
        {/* ============ DAILY PROGRESS CARD ============ */}
        <GlassCard className="!p-5" variant="elevated">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                <Target className="w-4.5 h-4.5 text-[#a29bfe]" />
              </div>
              <div>
                <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                  {t('cal_todays_goal')}
                </p>
                <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {calorieTarget.toLocaleString()} {t('cal_unit')}
                </p>
              </div>
            </div>
            <div
              className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
                isOverBudget
                  ? 'bg-[#ff6b6b]/10 border border-[#ff6b6b]/20'
                  : 'bg-[#6c5ce7]/10 border border-[#6c5ce7]/20'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${isOverBudget ? 'text-[#ff6b6b]' : 'text-[#fd79a8]'}`} />
              <span
                className={`${isOverBudget ? 'text-[#ff6b6b]' : 'text-foreground/80'}`}
                style={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Big numbers */}
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-muted-foreground mb-0.5" style={{ fontSize: '0.6875rem' }}>
                {t('cal_consumed')}
              </p>
              <p className="text-foreground" style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                {totalCalories.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground mb-0.5" style={{ fontSize: '0.6875rem' }}>
                {t('cal_remaining')}
              </p>
              <p
                className={isOverBudget ? 'text-[#ff6b6b]' : 'text-[#00cec9]'}
                style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}
              >
                {isOverBudget ? '+' : ''}
                {isOverBudget ? (totalCalories - calorieTarget).toLocaleString() : remaining.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-3 rounded-full overflow-hidden mb-4" style={{ background: 'var(--glass-bg-row)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
              className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${progressColor}`}
            />
            {/* Glow effect */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
              className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${progressColor} blur-sm opacity-50`}
            />
          </div>

          {/* Macro breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <MacroSummary
              label={t('cal_protein')}
              value={totalProtein}
              color="#6c5ce7"
            />
            <MacroSummary
              label={t('cal_carbs')}
              value={totalCarbs}
              color="#00cec9"
            />
            <MacroSummary
              label={t('cal_fat')}
              value={totalFats}
              color="#e17055"
            />
          </div>
        </GlassCard>

        {/* ============ ACTION BUTTONS ============ */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleScanFood}
            className="p-4 rounded-[18px] bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center gap-3 relative overflow-hidden"
            style={{ boxShadow: '0 6px 24px rgba(108,92,231,0.25)' }}
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/[0.08]" />
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {t('cal_scan')}
              </p>
              <p className="text-white/50" style={{ fontSize: '0.6875rem' }}>
                AI
              </p>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              hapticFeedback('light');
              setShowAddSheet(true);
            }}
            className="p-4 rounded-[18px] flex items-center gap-3 relative overflow-hidden"
            style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full" style={{ background: 'var(--glass-bg-row)' }} />
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
              <Plus className="w-5 h-5 text-foreground/70" />
            </div>
            <div className="text-left">
              <p className="text-foreground/80" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {t('cal_add_entry')}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                {t('cal_manual')}
              </p>
            </div>
          </motion.button>
        </div>

        {/* ============ MEAL SECTIONS ============ */}
        <div className="space-y-4">
          {MEAL_ORDER.map((mealType) => {
            const mealEntries = grouped[mealType];
            if (!mealEntries || mealEntries.length === 0) return null;

            const config = MEAL_CONFIG[mealType];
            const mealCalories = mealEntries.reduce((s, e) => s + e.calories, 0);
            const Icon = config.icon;

            return (
              <motion.div
                key={mealType}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: MEAL_ORDER.indexOf(mealType) * 0.05 }}
              >
                <GlassCard className="!p-0 overflow-hidden">
                  {/* Meal header */}
                  <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${config.color}18` }}
                      >
                        <Icon className="w-4.5 h-4.5" style={{ color: config.color }} />
                      </div>
                      <div>
                        <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                          {t(config.key)}
                        </p>
                        <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                          {mealEntries.length}{' '}
                          {mealEntries.length === 1 ? t('cal_items_one') : t('cal_items_many')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
                        {mealCalories}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                        {t('cal_unit')}
                      </p>
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="px-3 pb-3 space-y-1.5">
                    <AnimatePresence>
                      {mealEntries.map((entry) => (
                        <FoodEntryRow
                          key={entry.id}
                          entry={entry}
                          isDeleting={deletingId === entry.id}
                          onDelete={handleDelete}
                          onEdit={() => {
                            hapticFeedback('light');
                            setEditingEntry(entry);
                          }}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state */}
        {entries.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
              <UtensilsCrossed className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground mb-1" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {t('cal_empty_diary')}
            </p>
            <p className="text-muted-foreground/60 max-w-[240px] mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {t('cal_empty_diary_desc')}
            </p>
          </motion.div>
        )}
      </div>

      {/* ============ ADD MANUAL ENTRY SHEET ============ */}
      <AnimatePresence>
        {showAddSheet && (
          <AddFoodSheet
            onAdd={handleAddEntry}
            onClose={() => {
              hapticFeedback('light');
              setShowAddSheet(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ============ EDIT ENTRY SHEET ============ */}
      <AnimatePresence>
        {editingEntry && (
          <EditFoodSheet
            entry={editingEntry}
            onSave={handleEditSave}
            onClose={() => {
              hapticFeedback('light');
              setEditingEntry(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

// ---- Macro Summary Pill ----
function MacroSummary({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center rounded-xl py-2.5 px-2" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
          {label}
        </span>
      </div>
      <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
        {value}
        <span className="text-muted-foreground/50 ml-0.5" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
          g
        </span>
      </p>
    </div>
  );
}

// ---- Single Food Entry Row ----
function FoodEntryRow({
  entry,
  isDeleting,
  onDelete,
  onEdit,
}: {
  entry: FoodEntry;
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{
        opacity: isDeleting ? 0 : 1,
        x: isDeleting ? 60 : 0,
        height: isDeleting ? 0 : 'auto',
      }}
      exit={{ opacity: 0, x: 60, height: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
    >
      <div className="flex items-center p-3 gap-3">
        {/* Left: name, time, macros */}
        <div className="flex-1 min-w-0">
          <p className="text-foreground truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {entry.name}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
              <Clock className="w-3 h-3" />
              {entry.time}
            </span>
            <span className="text-muted-foreground/50" style={{ fontSize: '0.6875rem' }}>
              |
            </span>
            <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
              P:{entry.protein}g
            </span>
            <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
              C:{entry.carbs}g
            </span>
            <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
              F:{entry.fats}g
            </span>
          </div>
        </div>

        {/* Right: calories + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right mr-1">
            <p className="text-foreground" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {entry.calories}
            </p>
            <p className="text-muted-foreground/50" style={{ fontSize: '0.5625rem' }}>
              {t('cal_unit')}
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onEdit}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--glass-bg-button)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => onDelete(entry.id)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#ff6b6b]/10 transition-colors"
            style={{ background: 'var(--glass-bg-button)', border: '1px solid var(--glass-border-subtle)' }}
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ---- Add Food Bottom Sheet ----
function AddFoodSheet({
  onAdd,
  onClose,
}: {
  onAdd: (entry: Omit<FoodEntry, 'id'>) => void;
  onClose: () => void;
}) {
  const { t, lang } = useTranslation();
  const { usage, hasAccess, canUse, limitLabel, refresh: refreshUsage } = useFreemium();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [addedSugar, setAddedSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [iron, setIron] = useState('');
  const [calcium, setCalcium] = useState('');
  const [vitaminD, setVitaminD] = useState('');
  const [magnesium, setMagnesium] = useState('');
  const [glycemicIndex, setGlycemicIndex] = useState('');
  const [novaGroup, setNovaGroup] = useState('');
  const [nutrientDensity, setNutrientDensity] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [mealType, setMealType] = useState<MealType>(() => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 18) return 'snack';
    return 'dinner';
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [aiPortion, setAiPortion] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 400);
  }, []);

  const isValid = name.trim().length > 0 && Number(calories) > 0;

  const handleAiEstimate = async () => {
    if (!name.trim() || aiLoading) return;
    // Check limit before attempting
    if (!hasAccess && !canUse(usage.foodEstimates)) {
      setAiMessage({ text: t('freemium_limit_reached'), type: 'error' });
      toast.error(t('freemium_limit_reached'), {
        description: t('freemium_upgrade_for_more'),
      });
      hapticError();
      return;
    }
    hapticFeedback('medium');
    setAiLoading(true);
    setAiMessage(null);
    setAiPortion('');
    try {
      const result = await api.estimateFood(name.trim());
      setCalories(String(result.estimated_calories));
      setProtein(String(result.protein));
      setCarbs(String(result.carbs));
      setFats(String(result.fat));
      if (result.fiber_g != null) setFiber(String(result.fiber_g));
      if (result.sugar_g != null) setSugar(String(result.sugar_g));
      if (result.added_sugar_g != null) setAddedSugar(String(result.added_sugar_g));
      if (result.sodium_mg != null) setSodium(String(result.sodium_mg));
      if (result.iron_mg != null) setIron(String(result.iron_mg));
      if (result.calcium_mg != null) setCalcium(String(result.calcium_mg));
      if (result.vitamin_d_mcg != null) setVitaminD(String(result.vitamin_d_mcg));
      if (result.magnesium_mg != null) setMagnesium(String(result.magnesium_mg));
      if (result.glycemic_index != null) setGlycemicIndex(String(result.glycemic_index));
      if (result.nova_group != null) setNovaGroup(String(result.nova_group));
      if (result.nutrient_density != null) setNutrientDensity(String(result.nutrient_density));
      if (result.portion) setAiPortion(result.portion);
      if (result.food_name && result.food_name !== name.trim()) {
        setName(result.food_name);
      }
      setAiMessage({ text: t('cal_ai_filled'), type: 'success' });
      hapticSuccess();
      refreshUsage();
    } catch (err: any) {
      console.error('[AI Estimate] Error:', err);
      if (err?.code === 'LIMIT_REACHED' || err?.status === 429 || (err?.message && err.message.includes('limit'))) {
        setAiMessage({ text: t('freemium_limit_reached'), type: 'error' });
      } else {
        setAiMessage({ text: t('cal_ai_error'), type: 'error' });
      }
      hapticError();
      refreshUsage();
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    onAdd({
      name: name.trim(),
      calories: Number(calories),
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      fiber_g: Number(fiber) || 0,
      sugar_g: Number(sugar) || 0,
      added_sugar_g: Number(addedSugar) || 0,
      sodium_mg: Number(sodium) || 0,
      iron_mg: Number(iron) || 0,
      calcium_mg: Number(calcium) || 0,
      vitamin_d_mcg: Number(vitaminD) || 0,
      magnesium_mg: Number(magnesium) || 0,
      glycemic_index: Number(glycemicIndex) || 0,
      nova_group: ((n: number) => (n === 1 || n === 2 || n === 3 || n === 4 ? (n as 1 | 2 | 3 | 4) : undefined))(Number(novaGroup)),
      nutrient_density: Number(nutrientDensity) || 0,
      mealType,
      time,
    });
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed left-0 right-0 bottom-0 z-50 glass-sheet-bottom rounded-t-[1.5rem] max-h-[90vh] overflow-auto"
        style={{
          paddingBottom: 'calc(1.5rem + var(--safe-area-bottom, 0px))',
          background: 'var(--glass-bg-panel)',
          borderTop: '1px solid var(--glass-border)',
          backdropFilter: 'blur(var(--glass-blur-panel))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-panel))',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-ui-handle" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {t('cal_manual_title')}
            </h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          </div>

          {/* Meal type pills */}
          <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
            {MEAL_ORDER.map((mt) => {
              const cfg = MEAL_CONFIG[mt];
              const active = mealType === mt;
              return (
                <button
                  key={mt}
                  onClick={() => setMealType(mt)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                    active
                      ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30'
                      : 'bg-[var(--glass-bg-card)] border border-[var(--glass-border)]'
                  }`}
                >
                  <cfg.icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? cfg.color : 'var(--color-muted-foreground)' }}
                  />
                  <span
                    className={active ? 'text-foreground' : 'text-muted-foreground'}
                    style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                  >
                    {t(cfg.key)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {/* Food name + AI estimate button */}
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <SheetInput
                    ref={nameRef}
                    label={t('cal_food_name')}
                    placeholder={t('cal_food_name_placeholder')}
                    value={name}
                    onChange={(v) => { setName(v); setAiMessage(null); setAiPortion(''); }}
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleAiEstimate}
                  disabled={!name.trim() || aiLoading}
                  className="flex items-center gap-1.5 px-3.5 h-[2.75rem] rounded-xl bg-gradient-to-r from-[#6c5ce7]/20 to-[#a29bfe]/15 border border-[#6c5ce7]/25 disabled:opacity-30 flex-shrink-0"
                >
                  {aiLoading ? (
                    <Loader2 className="w-4 h-4 text-[#a29bfe] animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                  )}
                  <span className="text-[#a29bfe] whitespace-nowrap" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {aiLoading ? t('cal_ai_estimating') : !hasAccess && usage.foodEstimates.limit !== null
                      ? `${t('cal_ai_estimate')} ${limitLabel(usage.foodEstimates)}`
                      : t('cal_ai_estimate')
                    }
                  </span>
                </motion.button>
              </div>

              {/* AI feedback messages */}
              <AnimatePresence>
                {aiMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <p className={`text-xs mt-2 ${aiMessage.type === 'success' ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`}>
                      {aiMessage.type === 'success' ? '✓ ' : '⚠ '}{aiMessage.text}
                      {aiPortion && aiMessage.type === 'success' && (
                        <span className="text-muted-foreground ml-1">({t('cal_ai_portion')}: {aiPortion})</span>
                      )}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <SheetInput
              label={t('cal_calories')}
              placeholder="0"
              value={calories}
              onChange={setCalories}
              type="number"
              suffix={t('cal_unit')}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <SheetInput
                label={t('cal_protein')}
                placeholder="0"
                value={protein}
                onChange={setProtein}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={t('cal_carbs')}
                placeholder="0"
                value={carbs}
                onChange={setCarbs}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={t('cal_fat')}
                placeholder="0"
                value={fats}
                onChange={setFats}
                type="number"
                suffix="g"
              />
            </div>

            {/* More nutrients */}
            <div className="mt-1">
              <button
                onClick={() => setShowMore((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border"
                style={{ background: 'var(--glass-bg-card)', borderColor: 'var(--glass-border-subtle)' }}
              >
                <span className="text-xs font-semibold text-foreground">
                  {lang === 'ru' ? 'Доп. нутриенты' : 'More nutrients'}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showMore ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showMore && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <SheetInput label={lang === 'ru' ? 'Клетчатка' : 'Fiber'} placeholder="0" value={fiber} onChange={setFiber} type="number" suffix="g" />
                      <SheetInput label={lang === 'ru' ? 'Сахар' : 'Sugar'} placeholder="0" value={sugar} onChange={setSugar} type="number" suffix="g" />
                      <SheetInput label={lang === 'ru' ? 'Сахар+' : 'Added'} placeholder="0" value={addedSugar} onChange={setAddedSugar} type="number" suffix="g" />
                      <SheetInput label={lang === 'ru' ? 'Натрий' : 'Sodium'} placeholder="0" value={sodium} onChange={setSodium} type="number" suffix={lang === 'ru' ? 'мг' : 'mg'} />
                      <SheetInput label={lang === 'ru' ? 'Железо' : 'Iron'} placeholder="0" value={iron} onChange={setIron} type="number" suffix={lang === 'ru' ? 'мг' : 'mg'} />
                      <SheetInput label={lang === 'ru' ? 'Кальций' : 'Calcium'} placeholder="0" value={calcium} onChange={setCalcium} type="number" suffix={lang === 'ru' ? 'мг' : 'mg'} />
                      <SheetInput label={lang === 'ru' ? 'Vit D' : 'Vit D'} placeholder="0" value={vitaminD} onChange={setVitaminD} type="number" suffix={lang === 'ru' ? 'мкг' : 'mcg'} />
                      <SheetInput label={lang === 'ru' ? 'Магний' : 'Magnesium'} placeholder="0" value={magnesium} onChange={setMagnesium} type="number" suffix={lang === 'ru' ? 'мг' : 'mg'} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <SheetInput label={lang === 'ru' ? 'ГИ' : 'GI'} placeholder="0" value={glycemicIndex} onChange={setGlycemicIndex} type="number" suffix="" />
                      <SheetInput label={lang === 'ru' ? 'NOVA' : 'NOVA'} placeholder="1-4" value={novaGroup} onChange={setNovaGroup} type="number" suffix="" />
                      <SheetInput label={lang === 'ru' ? 'Плотность' : 'Density'} placeholder="0-100" value={nutrientDensity} onChange={setNutrientDensity} type="number" suffix="" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Submit */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2 mt-6 disabled:opacity-40 disabled:saturate-0"
            style={{ boxShadow: isValid ? '0 6px 24px rgba(108,92,231,0.3)' : 'none' }}
          >
            <Plus className="w-5 h-5 text-white" />
            <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
              {t('cal_add_btn')}
            </span>
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

// ---- Edit Food Bottom Sheet ----
function EditFoodSheet({
  entry,
  onSave,
  onClose,
}: {
  entry: FoodEntry;
  onSave: (updated: FoodEntry) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(entry.name);
  const [calories, setCalories] = useState(String(entry.calories));
  const [protein, setProtein] = useState(String(entry.protein));
  const [carbs, setCarbs] = useState(String(entry.carbs));
  const [fats, setFats] = useState(String(entry.fats));

  const isValid = name.trim().length > 0 && Number(calories) > 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      ...entry,
      name: name.trim(),
      calories: Number(calories),
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
    });
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed left-0 right-0 bottom-0 z-50 glass-sheet-bottom rounded-t-[1.5rem] max-h-[90vh] overflow-auto"
        style={{
          paddingBottom: 'calc(1.5rem + var(--safe-area-bottom, 0px))',
          background: 'var(--glass-bg-panel)',
          borderTop: '1px solid var(--glass-border)',
          backdropFilter: 'blur(var(--glass-blur-panel))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-panel))',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-ui-handle" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {t('cal_edit_entry')}
            </h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          </div>

          <div className="space-y-3">
            <SheetInput
              label={t('cal_food_name')}
              value={name}
              onChange={setName}
            />

            <SheetInput
              label={t('cal_calories')}
              value={calories}
              onChange={setCalories}
              type="number"
              suffix={t('cal_unit')}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <SheetInput
                label={t('cal_protein')}
                value={protein}
                onChange={setProtein}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={t('cal_carbs')}
                value={carbs}
                onChange={setCarbs}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={t('cal_fat')}
                value={fats}
                onChange={setFats}
                type="number"
                suffix="g"
              />
            </div>
          </div>

          {/* Save */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={!isValid}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2 mt-6 disabled:opacity-40 disabled:saturate-0"
            style={{ boxShadow: isValid ? '0 6px 24px rgba(108,92,231,0.3)' : 'none' }}
          >
            <Check className="w-5 h-5 text-white" />
            <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
              {t('cal_save')}
            </span>
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

// ---- Reusable Sheet Input ----
const SheetInput = React.forwardRef<
  HTMLInputElement,
  {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    type?: 'text' | 'number';
    suffix?: string;
    required?: boolean;
  }
>(function SheetInput({ label, value, onChange, placeholder, type = 'text', suffix, required }, ref) {
  return (
    <div>
      <label
        className="block text-muted-foreground mb-1.5"
        style={{ fontSize: '0.75rem', fontWeight: 500 }}
      >
        {label}
        {required && <span className="text-[#fd79a8] ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          ref={ref}
          type={type}
          inputMode={type === 'number' ? 'decimal' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 rounded-xl bg-ui-button border border-[var(--glass-border)] px-3.5 text-foreground placeholder:text-ui-tertiary focus:border-[#6c5ce7]/40 focus:outline-none transition-colors"
          style={{ fontSize: '0.9375rem' }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-tertiary pointer-events-none"
            style={{ fontSize: '0.8125rem' }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
});
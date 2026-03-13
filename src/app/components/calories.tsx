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
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { useBottomSheetLifecycle } from './bottom-sheet-context';

// ---- Types ----
interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time: string;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_CONFIG: Record<
  MealType,
  { icon: React.ElementType; color: string; label: string; labelRu: string }
> = {
  breakfast: { icon: Coffee, color: '#ffeaa7', label: 'Breakfast', labelRu: 'Завтрак' },
  lunch: { icon: UtensilsCrossed, color: '#fd79a8', label: 'Lunch', labelRu: 'Обед' },
  dinner: { icon: Moon, color: '#a29bfe', label: 'Dinner', labelRu: 'Ужин' },
  snack: { icon: Apple, color: '#00cec9', label: 'Snack', labelRu: 'Перекус' },
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ---- Mock data ----
const INITIAL_ENTRIES: FoodEntry[] = [
  { id: '1', name: 'Oatmeal with Berries', calories: 320, protein: 12, carbs: 54, fats: 8, mealType: 'breakfast', time: '08:15' },
  { id: '2', name: 'Greek Yogurt', calories: 130, protein: 15, carbs: 10, fats: 4, mealType: 'breakfast', time: '08:30' },
  { id: '3', name: 'Cappuccino', calories: 80, protein: 4, carbs: 8, fats: 3, mealType: 'breakfast', time: '08:35' },
  { id: '4', name: 'Grilled Chicken Salad', calories: 450, protein: 42, carbs: 28, fats: 18, mealType: 'lunch', time: '13:10' },
  { id: '5', name: 'Brown Rice', calories: 215, protein: 5, carbs: 45, fats: 2, mealType: 'lunch', time: '13:10' },
  { id: '6', name: 'Protein Bar', calories: 200, protein: 20, carbs: 24, fats: 8, mealType: 'snack', time: '16:00' },
  { id: '7', name: 'Apple', calories: 95, protein: 0, carbs: 25, fats: 0, mealType: 'snack', time: '16:30' },
  { id: '8', name: 'Salmon with Vegetables', calories: 520, protein: 38, carbs: 22, fats: 28, mealType: 'dinner', time: '19:15' },
];

// ---- Helper: detect lang ----
function useLang() {
  const { t } = useTranslation();
  const isRu = t('nav_home') === '\u0413\u043B\u0430\u0432\u043D\u0430\u044F';
  return isRu ? 'ru' : 'en';
}

// ---- Component ----
export function CaloriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lang = useLang();

  // State
  const [entries, setEntries] = useState<FoodEntry[]>(INITIAL_ENTRIES);
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Handlers
  const handleDelete = useCallback(
    (id: string) => {
      hapticSuccess();
      setDeletingId(id);
      setTimeout(() => {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setDeletingId(null);
      }, 300);
    },
    []
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
      hapticSuccess();
      const newEntry: FoodEntry = {
        ...entry,
        id: `manual_${Date.now()}`,
      };
      setEntries((prev) => [...prev, newEntry]);
      setShowAddSheet(false);
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
        title={lang === 'ru' ? 'Дневник питания' : 'Food Diary'}
        subtitle={new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
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
                <p className="text-white/50" style={{ fontSize: '0.6875rem' }}>
                  {lang === 'ru' ? 'Цель на сегодня' : "Today's Goal"}
                </p>
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {calorieTarget.toLocaleString()} {lang === 'ru' ? 'ккал' : 'cal'}
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
                className={`${isOverBudget ? 'text-[#ff6b6b]' : 'text-white/80'}`}
                style={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Big numbers */}
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-white/40 mb-0.5" style={{ fontSize: '0.6875rem' }}>
                {lang === 'ru' ? 'Потреблено' : 'Consumed'}
              </p>
              <p className="text-white" style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                {totalCalories.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/40 mb-0.5" style={{ fontSize: '0.6875rem' }}>
                {lang === 'ru' ? 'Осталось' : 'Remaining'}
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
          <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden mb-4">
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
              label={lang === 'ru' ? 'Белки' : 'Protein'}
              value={totalProtein}
              color="#6c5ce7"
            />
            <MacroSummary
              label={lang === 'ru' ? 'Углеводы' : 'Carbs'}
              value={totalCarbs}
              color="#00cec9"
            />
            <MacroSummary
              label={lang === 'ru' ? 'Жиры' : 'Fat'}
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
                {lang === 'ru' ? 'Сканировать' : 'Scan Food'}
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
            className="p-4 rounded-[18px] bg-white/[0.04] border border-white/[0.08] flex items-center gap-3 relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/[0.03]" />
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Plus className="w-5 h-5 text-white/70" />
            </div>
            <div className="text-left">
              <p className="text-white/80" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {lang === 'ru' ? 'Добавить' : 'Add Entry'}
              </p>
              <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                {lang === 'ru' ? 'Вручную' : 'Manual'}
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
                        <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                          {lang === 'ru' ? config.labelRu : config.label}
                        </p>
                        <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                          {mealEntries.length}{' '}
                          {lang === 'ru'
                            ? mealEntries.length === 1
                              ? 'запись'
                              : 'записей'
                            : mealEntries.length === 1
                            ? 'item'
                            : 'items'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
                        {mealCalories}
                      </p>
                      <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                        {lang === 'ru' ? 'ккал' : 'cal'}
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
                          lang={lang}
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
            <div className="w-20 h-20 rounded-[1.5rem] bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <UtensilsCrossed className="w-8 h-8 text-white/15" />
            </div>
            <p className="text-white/40 mb-1" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {lang === 'ru' ? 'Дневник пуст' : 'No food logged today'}
            </p>
            <p className="text-white/25 max-w-[240px] mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {lang === 'ru'
                ? 'Сканируйте или добавьте еду, чтобы начать отслеживание'
                : 'Scan or add food to start tracking your nutrition'}
            </p>
          </motion.div>
        )}
      </div>

      {/* ============ ADD MANUAL ENTRY SHEET ============ */}
      <AnimatePresence>
        {showAddSheet && (
          <AddFoodSheet
            lang={lang}
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
            lang={lang}
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
    <div className="text-center rounded-xl bg-white/[0.03] border border-white/[0.05] py-2.5 px-2">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-white/40" style={{ fontSize: '0.6875rem' }}>
          {label}
        </span>
      </div>
      <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
        {value}
        <span className="text-white/30 ml-0.5" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
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
  lang,
  onDelete,
  onEdit,
}: {
  entry: FoodEntry;
  isDeleting: boolean;
  lang: string;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
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
      className="rounded-xl bg-white/[0.03] border border-white/[0.05] overflow-hidden"
    >
      <div className="flex items-center p-3 gap-3">
        {/* Left: name, time, macros */}
        <div className="flex-1 min-w-0">
          <p className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {entry.name}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-white/30" style={{ fontSize: '0.6875rem' }}>
              <Clock className="w-3 h-3" />
              {entry.time}
            </span>
            <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
              |
            </span>
            <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>
              P:{entry.protein}g
            </span>
            <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>
              C:{entry.carbs}g
            </span>
            <span className="text-white/30" style={{ fontSize: '0.6875rem' }}>
              F:{entry.fats}g
            </span>
          </div>
        </div>

        {/* Right: calories + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right mr-1">
            <p className="text-white" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {entry.calories}
            </p>
            <p className="text-white/25" style={{ fontSize: '0.5625rem' }}>
              {lang === 'ru' ? 'ккал' : 'cal'}
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center"
          >
            <Pencil className="w-3.5 h-3.5 text-white/40" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => onDelete(entry.id)}
            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-[#ff6b6b]/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-white/40" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ---- Add Food Bottom Sheet ----
function AddFoodSheet({
  lang,
  onAdd,
  onClose,
}: {
  lang: string;
  onAdd: (entry: Omit<FoodEntry, 'id'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [mealType, setMealType] = useState<MealType>(() => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 18) return 'snack';
    return 'dinner';
  });

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 400);
  }, []);

  const isValid = name.trim().length > 0 && Number(calories) > 0;

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
          background: 'rgba(18,18,30,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {lang === 'ru' ? 'Добавить еду' : 'Add Food Entry'}
            </h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white/50" />
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
                      : 'bg-white/[0.03] border border-white/[0.06]'
                  }`}
                >
                  <cfg.icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? cfg.color : 'rgba(255,255,255,0.3)' }}
                  />
                  <span
                    className={active ? 'text-white' : 'text-white/40'}
                    style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                  >
                    {lang === 'ru' ? cfg.labelRu : cfg.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <SheetInput
              ref={nameRef}
              label={lang === 'ru' ? 'Название' : 'Food name'}
              placeholder={lang === 'ru' ? 'Напр. Куриная грудка' : 'e.g. Grilled Chicken'}
              value={name}
              onChange={setName}
            />

            <SheetInput
              label={lang === 'ru' ? 'Калории' : 'Calories'}
              placeholder="0"
              value={calories}
              onChange={setCalories}
              type="number"
              suffix={lang === 'ru' ? 'ккал' : 'cal'}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <SheetInput
                label={lang === 'ru' ? 'Белки' : 'Protein'}
                placeholder="0"
                value={protein}
                onChange={setProtein}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={lang === 'ru' ? 'Углеводы' : 'Carbs'}
                placeholder="0"
                value={carbs}
                onChange={setCarbs}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={lang === 'ru' ? 'Жиры' : 'Fat'}
                placeholder="0"
                value={fats}
                onChange={setFats}
                type="number"
                suffix="g"
              />
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
              {lang === 'ru' ? 'Добавить' : 'Add to diary'}
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
  lang,
  onSave,
  onClose,
}: {
  entry: FoodEntry;
  lang: string;
  onSave: (updated: FoodEntry) => void;
  onClose: () => void;
}) {
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
          background: 'rgba(18,18,30,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {lang === 'ru' ? 'Редактировать' : 'Edit Entry'}
            </h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white/50" />
            </motion.button>
          </div>

          <div className="space-y-3">
            <SheetInput
              label={lang === 'ru' ? 'Название' : 'Food name'}
              value={name}
              onChange={setName}
            />

            <SheetInput
              label={lang === 'ru' ? 'Калории' : 'Calories'}
              value={calories}
              onChange={setCalories}
              type="number"
              suffix={lang === 'ru' ? 'ккал' : 'cal'}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <SheetInput
                label={lang === 'ru' ? 'Белки' : 'Protein'}
                value={protein}
                onChange={setProtein}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={lang === 'ru' ? 'Углеводы' : 'Carbs'}
                value={carbs}
                onChange={setCarbs}
                type="number"
                suffix="g"
              />
              <SheetInput
                label={lang === 'ru' ? 'Жиры' : 'Fat'}
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
              {lang === 'ru' ? 'Сохранить' : 'Save changes'}
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
        className="block text-white/40 mb-1.5"
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
          className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 text-white placeholder:text-white/20 focus:border-[#6c5ce7]/40 focus:outline-none transition-colors"
          style={{ fontSize: '0.9375rem' }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
            style={{ fontSize: '0.8125rem' }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
});

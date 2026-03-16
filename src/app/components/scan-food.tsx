// =============================================
// Scan Food — AI Food Photo Recognition
// =============================================
// Flow:
//   1. User opens camera / selects photo
//   2. Preview shown with "Analyze" button
//   3. Image sent to Edge Function -> OpenAI Vision
//   4. Result displayed: food_name, calories, macros
//   5. User taps "Add to diary" -> saved to food_entries
// =============================================

import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Image as ImageIcon,
  X,
  Sparkles,
  RotateCcw,
  Check,
  Flame,
  AlertCircle,
  Plus,
  ChevronDown,
  Crown,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import {
  hapticFeedback,
  hapticSuccess,
  hapticError,
} from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { CameraCapture } from './camera-capture';
import { useFreemium } from './use-freemium';
import { toast } from 'sonner';

// ---- Types ----
type ScanStep = 'capture' | 'analyzing' | 'result' | 'error';
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodResult {
  food_name: string;
  estimated_calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ---- Meal type config ----
// Meal labels are now resolved via t() in render
const MEAL_IDS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_EMOJIS: Record<MealType, string> = {
  breakfast: '\u{2615}',
  lunch: '\u{1F372}',
  dinner: '\u{1F37D}\uFE0F',
  snack: '\u{1F34E}',
};
const MEAL_KEYS: Record<MealType, string> = {
  breakfast: 'scan_meal_breakfast',
  lunch: 'scan_meal_lunch',
  dinner: 'scan_meal_dinner',
  snack: 'scan_meal_snack',
};

// ---- Component ----
export function ScanFoodPage() {
  const navigate = useNavigate();
  const { user, subscriptionActive, isAdmin, isDevMode } = useAuth();
  const { t, lang } = useTranslation();
  const { usage, hasAccess, canUse, limitLabel, refresh: refreshUsage } = useFreemium();

  const [step, setStep] = useState<ScanStep>('capture');
  const [imageData, setImageData] = useState<string | null>(null);
  const [result, setResult] = useState<FoodResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [scansUsed, setScansUsed] = useState(0);
  const [scansLimit, setScansLimit] = useState(3);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 18) return 'snack';
    return 'dinner';
  });
  const [showMealPicker, setShowMealPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // ---- Image handling ----
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageData(dataUrl);
      setStep('capture');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    },
    [processFile]
  );

  const openCamera = () => {
    hapticFeedback('light');
    // Try native getUserMedia camera (works reliably on Android)
    // Fall back to file input if getUserMedia is unavailable
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleCameraCapture = useCallback((dataUrl: string) => {
    setCameraOpen(false);
    setImageData(dataUrl);
    setStep('capture');
  }, []);

  const openGallery = () => {
    hapticFeedback('light');
    fileInputRef.current?.click();
  };

  const resetCapture = () => {
    hapticFeedback('light');
    setImageData(null);
    setResult(null);
    setStep('capture');
    setAddedSuccess(false);
    setErrorMessage('');
  };

  // ---- Analyze photo ----
  const analyzePhoto = useCallback(async () => {
    if (!imageData) return;

    // Proactive limit check before attempting
    if (!hasAccess && !canUse(usage.scans)) {
      hapticError();
      toast.error(t('scan_limit_reached'), {
        description: t('scan_limit_upgrade'),
        action: {
          label: t('scan_upgrade_btn'),
          onClick: () => navigate('/upgrade?plan=60'),
        },
      });
      return;
    }

    hapticFeedback('medium');
    setStep('analyzing');
    setLimitReached(false);

    try {
      const base64 = imageData.split(',')[1];
      const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';
      const response = await api.scanFood(base64, mimeType);
      setResult(response);
      setStep('result');
      hapticSuccess();
      refreshUsage();
    } catch (err: any) {
      console.error('[ScanFood] Analysis error:', err);

      // Check if limit reached (429)
      if (err?.code === 'LIMIT_REACHED' || err?.status === 429 || (err?.message && err.message.includes('limit'))) {
        setLimitReached(true);
        setScansUsed(err?.used || usage.scans.used || 3);
        setScansLimit(err?.limit || usage.scans.limit || 3);
        setErrorMessage(t('scan_limit_reached'));
        toast.error(t('scan_limit_reached'), {
          description: t('scan_limit_upgrade'),
          action: {
            label: t('scan_upgrade_btn'),
            onClick: () => navigate('/upgrade?plan=60'),
          },
        });
      } else {
        setErrorMessage(err?.message || t('scan_error_default'));
      }
      setStep('error');
      hapticError();
      refreshUsage();
    }
  }, [imageData, lang, t, hasAccess, canUse, usage.scans, refreshUsage, navigate]);

  // ---- Add to diary ----
  const addToDiary = useCallback(async () => {
    if (!result) return;
    hapticFeedback('medium');
    setIsAdding(true);

    try {
      await api.addFoodEntry({
        food_name: result.food_name,
        calories: result.estimated_calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        meal_type: selectedMeal,
        image_base64: imageData?.split(',')[1],
      });
      hapticSuccess();
      setAddedSuccess(true);
      setTimeout(() => {
        navigate('/calories', { replace: true });
      }, 1200);
    } catch (err: any) {
      console.error('[ScanFood] Add to diary error:', err);
      hapticSuccess();
      setAddedSuccess(true);
      setTimeout(() => {
        navigate('/calories', { replace: true });
      }, 1200);
    } finally {
      setIsAdding(false);
    }
  }, [result, selectedMeal, imageData, navigate]);

  const goBack = () => {
    hapticFeedback('light');
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-[#6c5ce7]/15 blur-[100px]" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-[#00cec9]/10 blur-[120px]" />
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* getUserMedia camera overlay (reliable on Android) */}
      <CameraCapture
        open={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setCameraOpen(false)}
      />

      {/* Header — title only; navigation via TG system back button */}
      <PageHeader title={t('scan_title')} />

      {/* Content area */}
      <div className="relative z-10 flex-1 flex flex-col px-4 pb-6">
        <AnimatePresence mode="wait">

          {/* ========== CAPTURE STEP ========== */}
          {step === 'capture' && (
            <motion.div
              key="capture"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col"
            >
              {!imageData ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-32 h-32 rounded-[2rem] bg-ui-button border-2 border-dashed border-[var(--glass-border)] flex items-center justify-center mb-6"
                  >
                    <Camera className="w-12 h-12 text-ui-icon-tertiary" />
                  </motion.div>

                  <h2
                    className="text-foreground mb-2 text-center"
                    style={{ fontSize: '1.375rem', fontWeight: 700 }}
                  >
                    {t('scan_title')}
                  </h2>
                  <p
                    className="text-muted-foreground text-center max-w-[280px] mb-8"
                    style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                  >
                    {t('scan_desc')}
                  </p>

                  {/* Proactive limit indicator for free users */}
                  {!hasAccess && usage.scans.limit !== null && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-6 border"
                      style={{
                        background: (usage.scans.remaining ?? 0) <= 0
                          ? 'rgba(255,107,107,0.08)'
                          : 'rgba(108,92,231,0.06)',
                        borderColor: (usage.scans.remaining ?? 0) <= 0
                          ? 'rgba(255,107,107,0.15)'
                          : 'rgba(108,92,231,0.12)',
                      }}
                    >
                      <Camera className={`w-4 h-4 flex-shrink-0 ${
                        (usage.scans.remaining ?? 0) <= 0 ? 'text-red-400' : 'text-[#a29bfe]'
                      }`} />
                      <span className={`text-[0.8125rem] font-medium ${
                        (usage.scans.remaining ?? 0) <= 0
                          ? 'text-red-400'
                          : (usage.scans.remaining ?? 0) <= 1
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                      }`}>
                        {(usage.scans.remaining ?? 0) <= 0
                          ? t('scan_no_scans_left')
                          : t('scan_scans_remaining', { n: usage.scans.remaining, limit: usage.scans.limit })
                        }
                      </span>
                      {(usage.scans.remaining ?? 0) <= 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticFeedback('medium');
                            navigate('/upgrade?plan=60');
                          }}
                          className="ml-auto text-[#a29bfe] flex-shrink-0"
                          style={{ fontSize: '0.75rem', fontWeight: 700 }}
                        >
                          {t('scan_upgrade_btn')}
                        </button>
                      )}
                    </motion.div>
                  )}

                  <div className="w-full space-y-3 max-w-[320px]">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={openCamera}
                      className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2.5 shadow-lg"
                      style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
                    >
                      <Camera className="w-5 h-5 text-white" />
                      <span className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_open_camera')}
                      </span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={openGallery}
                      className="w-full h-14 rounded-2xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center gap-2.5"
                    >
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      <span className="text-foreground/70" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_choose_gallery')}
                      </span>
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="relative rounded-2xl overflow-hidden border border-[var(--glass-border)] mb-4 flex-shrink-0">
                    <img
                      src={imageData}
                      alt="Captured food"
                      className="w-full aspect-[4/3] object-cover"
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={resetCapture}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </motion.button>
                  </div>

                  <div className="space-y-3">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={analyzePhoto}
                      className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2.5 shadow-lg"
                      style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
                    >
                      <Sparkles className="w-5 h-5 text-white" />
                      <span className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_analyze')}
                      </span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={resetCapture}
                      className="w-full h-12 rounded-2xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                        {t('scan_retake')}
                      </span>
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ========== ANALYZING STEP ========== */}
          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              {imageData && (
                <div className="w-28 h-28 rounded-2xl overflow-hidden border border-[var(--glass-border)] mb-6 shadow-lg">
                  <img src={imageData} alt="Analyzing" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="relative w-16 h-16 mb-5">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-[var(--glass-border-subtle)] border-t-[#6c5ce7]"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-2 rounded-full border-2 border-[var(--glass-border-subtle)] border-b-[#a29bfe]"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#a29bfe]" />
                </div>
              </div>

              <h2 className="text-foreground mb-2" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {t('scan_analyzing')}
              </h2>
              <p className="text-muted-foreground text-center max-w-[240px]" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                {t('scan_analyzing_desc')}
              </p>

              <div className="flex items-center gap-1.5 mt-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full bg-[#6c5ce7]"
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ========== RESULT STEP ========== */}
          {step === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col"
            >
              {/* Food image + name */}
              <div className="relative rounded-2xl overflow-hidden border border-[var(--glass-border)] mb-4 flex-shrink-0">
                {imageData && (
                  <img src={imageData} alt={result.food_name} className="w-full aspect-[16/10] object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <p className="text-white mb-1" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                      {result.food_name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#a29bfe]" />
                      <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                        {t('scan_ai_recognized')}
                      </span>
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Nutrition card */}
              <GlassCard className="p-5 mb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#fd79a8]/20 to-[#e17055]/20 flex items-center justify-center">
                      <Flame className="w-7 h-7 text-[#fd79a8]" />
                    </div>
                    <div>
                      <p className="text-foreground" style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                        {result.estimated_calories}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
                        {t('scan_calories_unit')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <MacroCard label={t('scan_protein')} value={result.protein} unit={t('unit_g')} color="#6c5ce7" />
                  <MacroCard label={t('scan_carbs')} value={result.carbs} unit={t('unit_g')} color="#00cec9" />
                  <MacroCard label={t('scan_fat')} value={result.fat} unit={t('unit_g')} color="#e17055" />
                </div>
              </GlassCard>

              {/* Meal type selector */}
              <div className="mb-4">
                <p className="text-muted-foreground mb-2" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                  {t('scan_meal_type')}
                </p>
                <div className="relative">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      hapticFeedback('light');
                      setShowMealPicker(!showMealPicker);
                    }}
                    className="w-full h-12 rounded-xl bg-ui-button border border-[var(--glass-border)] px-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span style={{ fontSize: '1.125rem' }}>
                        {MEAL_EMOJIS[selectedMeal]}
                      </span>
                      <span className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                        {t(MEAL_KEYS[selectedMeal])}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${showMealPicker ? 'rotate-180' : ''}`}
                    />
                  </motion.button>

                  <AnimatePresence>
                    {showMealPicker && (
                      <motion.div
                        initial={{ opacity: 0, y: -5, scaleY: 0.95 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -5, scaleY: 0.95 }}
                        className="absolute top-full mt-1 left-0 right-0 z-20 rounded-xl bg-[var(--glass-bg-dropdown)] border border-[var(--glass-border)] overflow-hidden shadow-xl"
                        style={{ transformOrigin: 'top' }}
                      >
                        {MEAL_IDS.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              hapticFeedback('light');
                              setSelectedMeal(opt);
                              setShowMealPicker(false);
                            }}
                            className={`w-full px-4 py-3 flex items-center gap-2.5 transition-colors ${
                              selectedMeal === opt
                                ? 'bg-[#6c5ce7]/15'
                                : 'hover:bg-[var(--ui-button-active)] active:bg-[var(--ui-button-active)]'
                            }`}
                          >
                            <span style={{ fontSize: '1rem' }}>{MEAL_EMOJIS[opt]}</span>
                            <span
                              className={selectedMeal === opt ? 'text-foreground' : 'text-muted-foreground'}
                              style={{ fontSize: '0.9375rem', fontWeight: 500 }}
                            >
                              {t(MEAL_KEYS[opt])}
                            </span>
                            {selectedMeal === opt && (
                              <Check className="w-4 h-4 text-[#6c5ce7] ml-auto" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex-1" />

              {/* Action buttons */}
              <div className="space-y-3">
                <AnimatePresence mode="wait">
                  {addedSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full h-14 rounded-2xl bg-[#00cec9]/15 border border-[#00cec9]/30 flex items-center justify-center gap-2.5"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <Check className="w-5 h-5 text-[#00cec9]" />
                      </motion.div>
                      <span className="text-[#00cec9]" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_added')}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="add"
                      whileTap={{ scale: 0.97 }}
                      onClick={addToDiary}
                      disabled={isAdding}
                      className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2.5 shadow-lg disabled:opacity-60"
                      style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
                    >
                      {isAdding ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        />
                      ) : (
                        <>
                          <Plus className="w-5 h-5 text-white" />
                          <span className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                            {t('scan_add_diary')}
                          </span>
                        </>
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>

                {!addedSuccess && (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={resetCapture}
                    className="w-full h-12 rounded-2xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                      {t('scan_another')}
                    </span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}

          {/* ========== ERROR STEP ========== */}
          {step === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              {limitReached ? (
                <>
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/10 flex items-center justify-center mb-5 border border-[var(--glass-border)]"
                  >
                    <Crown className="w-9 h-9 text-[#a29bfe]" />
                  </motion.div>

                  <h2 className="text-foreground mb-2 text-center" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {t('scan_limit_title')}
                  </h2>
                  <p className="text-muted-foreground text-center max-w-[280px] mb-2" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {t('scan_limit_desc', { used: scansUsed, limit: scansLimit })}
                  </p>
                  <p className="text-ui-tertiary text-center max-w-[280px] mb-8" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {t('scan_limit_upgrade')}
                  </p>

                  <div className="w-full max-w-[320px] space-y-3">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { hapticFeedback('medium'); navigate('/upgrade?plan=60'); }}
                      className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2.5 shadow-lg"
                      style={{ boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
                    >
                      <Crown className="w-5 h-5 text-white" />
                      <span className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_upgrade_btn')}
                      </span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={goBack}
                      className="w-full h-12 rounded-2xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center"
                    >
                      <span className="text-muted-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                        {t('back')}
                      </span>
                    </motion.button>
                  </div>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 rounded-full bg-[#ff6b6b]/10 flex items-center justify-center mb-5"
                  >
                    <AlertCircle className="w-9 h-9 text-[#ff6b6b]" />
                  </motion.div>

                  <h2 className="text-foreground mb-2 text-center" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {t('scan_error_title')}
                  </h2>
                  <p className="text-muted-foreground text-center max-w-[280px] mb-8" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {errorMessage || t('scan_error_hint')}
                  </p>

                  <div className="w-full max-w-[320px] space-y-3">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={resetCapture}
                      className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2.5 shadow-lg"
                    >
                      <RotateCcw className="w-5 h-5 text-white" />
                      <span className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                        {t('scan_try_again')}
                      </span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={goBack}
                      className="w-full h-12 rounded-2xl bg-ui-button border border-[var(--glass-border)] flex items-center justify-center"
                    >
                      <span className="text-muted-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                        {t('back')}
                      </span>
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ---- Macro card sub-component ----
function MacroCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="text-center p-3 rounded-xl bg-[var(--glass-bg-card)] border border-[var(--glass-border)]"
    >
      <div
        className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
        style={{ backgroundColor: `${color}15` }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <p className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
        {value}
        <span className="text-muted-foreground ml-0.5" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
          {unit}
        </span>
      </p>
      <p className="text-muted-foreground mt-0.5" style={{ fontSize: '0.6875rem' }}>
        {label}
      </p>
    </motion.div>
  );
}
// =============================================
// PhotoSourcePicker — Choose Camera or Gallery
// =============================================
// A bottom-sheet action sheet that lets the user choose between
// taking a live camera photo or uploading from gallery.
// Returns the chosen image as a data URL string.
// =============================================

import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';

interface PhotoSourcePickerProps {
  open: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickGallery: (dataUrl: string) => void;
  /** Max width for resizing gallery photos (default 1280) */
  maxWidth?: number;
  /** JPEG quality 0–1 (default 0.85) */
  quality?: number;
}

export function PhotoSourcePicker({
  open,
  onClose,
  onPickCamera,
  onPickGallery,
  maxWidth = 1280,
  quality = 0.85,
}: PhotoSourcePickerProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGalleryClick = useCallback(() => {
    hapticFeedback('light');
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate it's an image
      if (!file.type.startsWith('image/')) {
        console.warn('[PhotoSourcePicker] Not an image:', file.type);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Resize if needed
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;

          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          onPickGallery(dataUrl);
          onClose();
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);

      // Reset so same file can be selected again
      e.target.value = '';
    },
    [maxWidth, quality, onPickGallery, onClose]
  );

  const handleCameraClick = useCallback(() => {
    hapticFeedback('light');
    onClose();
    // Small delay so the sheet animates out before camera opens
    setTimeout(() => onPickCamera(), 200);
  }, [onClose, onPickCamera]);

  return (
    <>
      {/* Hidden file input for gallery */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />

            {/* Bottom sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 z-[101] rounded-t-[1.5rem]"
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground" style={{ fontSize: '1.0625rem', fontWeight: 700 }}>
                    {t('photo_choose_source')}
                  </h3>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-ui-close flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-ui-icon-secondary" />
                  </motion.button>
                </div>

                {/* Options */}
                <div className="space-y-2">
                  {/* Camera option */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCameraClick}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center flex-shrink-0">
                      <Camera className="w-6 h-6 text-[#a29bfe]" />
                    </div>
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                        {t('photo_take_camera')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                        Live camera
                      </p>
                    </div>
                  </motion.button>

                  {/* Gallery option */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGalleryClick}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00cec9]/20 to-[#74b9ff]/20 flex items-center justify-center flex-shrink-0">
                      <ImagePlus className="w-6 h-6 text-[#00cec9]" />
                    </div>
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                        {t('photo_from_gallery')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                        Upload from device
                      </p>
                    </div>
                  </motion.button>
                </div>

                {/* Cancel button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="w-full mt-3 py-3.5 rounded-2xl bg-ui-button text-center"
                >
                  <span className="text-muted-foreground" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                    {t('photo_cancel')}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
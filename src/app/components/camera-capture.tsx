// =============================================
// CameraCapture — Native camera overlay using getUserMedia
// =============================================
// On Android Telegram WebView, <input capture="environment"> often
// opens the gallery instead of the camera. This component directly
// accesses the camera via getUserMedia API and renders a fullscreen
// live preview with a shutter button.
// =============================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, SwitchCamera, Loader2 } from 'lucide-react';
import { hapticFeedback, hapticSuccess } from './telegram';

interface CameraCaptureProps {
  open: boolean;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraCapture({ open, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Start camera stream
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        await videoRef.current.play();
        setReady(true);
      }
    } catch (err: any) {
      console.error('[CameraCapture] getUserMedia failed:', err);
      setError(err?.message || 'Camera access denied');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setReady(false);
    setError(null);
  }, []);

  // Start/stop based on open state
  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch camera
  const switchCamera = useCallback(() => {
    hapticFeedback('light');
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  // Take photo
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    hapticSuccess();

    // Use the actual video dimensions for full quality
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, mirror the image
    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    onCapture(dataUrl);
  }, [facingMode, stopCamera, onCapture]);

  // Handle close
  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] bg-black flex flex-col"
        >
          {/* Camera preview */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
            />

            {/* Loading state */}
            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <Loader2 className="w-10 h-10 text-white/50 animate-spin" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-8">
                <Camera className="w-16 h-16 text-white/20 mb-4" />
                <p className="text-white/60 text-center text-sm mb-2">
                  Could not access camera
                </p>
                <p className="text-white/30 text-center text-xs mb-6">
                  {error}
                </p>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl bg-white/10 text-white/70 text-sm"
                >
                  Go back
                </button>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center"
              style={{ marginTop: 'var(--safe-area-top, 56px)' }}
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Switch camera button */}
            {ready && (
              <button
                onClick={switchCamera}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center"
                style={{ marginTop: 'var(--safe-area-top, 56px)' }}
              >
                <SwitchCamera className="w-5 h-5 text-white" />
              </button>
            )}
          </div>

          {/* Shutter controls */}
          {ready && (
            <div
              className="flex items-center justify-center py-6 bg-black/80 backdrop-blur-sm"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
            >
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={capturePhoto}
                className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center"
              >
                <div className="w-[60px] h-[60px] rounded-full bg-white" />
              </motion.button>
            </div>
          )}

          {/* Hidden canvas for capturing frame */}
          <canvas ref={canvasRef} className="hidden" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

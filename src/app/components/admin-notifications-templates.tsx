// =============================================
// Admin: Telegram notification templates (lazy chunk)
// Loaded only when the Notifications tab is open.
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Save, Upload } from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';

type MediaKind = 'photo' | 'animation' | 'video';

type OverrideRow = {
  imageUrl?: string;
  mediaKind?: MediaKind;
  useCustomCaption?: boolean;
  captionRu?: string;
  captionEn?: string;
};

function inferMediaKindFromFile(file: File): MediaKind {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name)) return 'video';
  if (mime === 'image/gif' || name.endsWith('.gif')) return 'animation';
  return 'photo';
}

function inferMediaKindFromUrl(url: string): MediaKind {
  const trimmed = url.trim();
  if (!trimmed) return 'photo';
  try {
    const path = new URL(trimmed).pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
    if (path.endsWith('.gif')) return 'animation';
  } catch {
    const lower = trimmed.toLowerCase();
    if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(lower)) return 'video';
    if (/\.gif(\?|$)/.test(lower)) return 'animation';
  }
  return 'photo';
}

export function AdminNotificationsSection() {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadOk, setLoadOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [registry, setRegistry] = useState<
    Array<{
      id: string;
      category: string;
      titleEn: string;
      titleRu: string;
      hintEn: string;
      hintRu: string;
    }>
  >([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const pendingUploadTemplateId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminGetNotificationTemplates()
      .then((res) => {
        if (cancelled) return;
        setRegistry(res.registry || []);
        setOverrides(res.overrides || {});
        setLoadOk(true);
      })
      .catch(() => {
        if (!cancelled) setErr(t('adm_notif_load_err'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const updateRow = useCallback((id: string, patch: Partial<OverrideRow>) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }, []);

  const openUpload = useCallback((templateId: string) => {
    pendingUploadTemplateId.current = templateId;
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const templateId = pendingUploadTemplateId.current;
      e.target.value = '';
      pendingUploadTemplateId.current = null;
      if (!file || !templateId) return;

      setUploadingId(templateId);
      setErr(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.adminUploadMedia(formData);
        const kind = inferMediaKindFromFile(file);
        updateRow(templateId, { imageUrl: res.url, mediaKind: kind });
        hapticSuccess();
      } catch (err: unknown) {
        setErr(err instanceof Error ? err.message : String(err));
      } finally {
        setUploadingId(null);
      }
    },
    [updateRow],
  );

  const saveAll = async () => {
    if (!loadOk) return;
    hapticFeedback('medium');
    setSaving(true);
    setErr(null);
    try {
      const res = await api.adminPutNotificationTemplates(overrides);
      setOverrides(res.overrides);
      hapticSuccess();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const byCat = registry.reduce<Record<string, typeof registry>>((acc, row) => {
    const c = row.category;
    if (!acc[c]) acc[c] = [];
    acc[c].push(row);
    return acc;
  }, {});

  const catLabel: Record<string, { en: string; ru: string }> = {
    onboarding: { en: 'Onboarding', ru: 'Онбординг' },
    programs: { en: 'Programs', ru: 'Программы' },
    challenges: { en: 'Challenges', ru: 'Челленджи' },
    nutrition: { en: 'Nutrition', ru: 'Питание' },
    reminders: { en: 'Reminders', ru: 'Напоминания' },
    other: { en: 'Other', ru: 'Прочее' },
  };

  return (
    <div className="space-y-6 pb-28">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v"
        onChange={onFileSelected}
      />
      {err && <div className="text-sm text-red-400">{err}</div>}
      <p className="text-sm text-muted-foreground leading-relaxed">{t('adm_notif_placeholder_hint')}</p>
      <p className="text-xs text-muted-foreground">{t('adm_notif_upload_hint')}</p>

      <button
        type="button"
        onClick={saveAll}
        disabled={saving || !loadOk}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors bg-[#6c5ce7]/20 text-[#a29bfe] border border-[#6c5ce7]/30 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t('adm_notif_save')}
      </button>

      {Object.entries(byCat).map(([cat, rows]) => (
        <div key={cat} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {(catLabel[cat] || { en: cat, ru: cat })[lang === 'ru' ? 'ru' : 'en']}
          </h2>
          {rows.map((row) => {
            const o = overrides[row.id] || {};
            const title = lang === 'ru' ? row.titleRu : row.titleEn;
            const hint = lang === 'ru' ? row.hintRu : row.hintEn;
            return (
              <GlassCard key={row.id} className="p-4 space-y-3">
                <div>
                  <div className="font-semibold text-foreground text-sm">{title}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{row.id}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground mb-1">{t('adm_notif_image_url')}</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm bg-ui-button border border-white/10 text-foreground placeholder:text-muted-foreground"
                      placeholder="https://..."
                      value={o.imageUrl || ''}
                      onChange={(e) => updateRow(row.id, { imageUrl: e.target.value })}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) updateRow(row.id, { mediaKind: inferMediaKindFromUrl(v) });
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingId === row.id}
                      onClick={() => {
                        hapticFeedback('light');
                        openUpload(row.id);
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-ui-button border border-white/10 text-foreground disabled:opacity-50"
                    >
                      {uploadingId === row.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {t('adm_notif_upload')}
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('adm_notif_media_kind')}</label>
                    <select
                      className="w-full rounded-lg px-3 py-2 text-sm bg-ui-button border border-white/10 text-foreground"
                      value={o.mediaKind || 'photo'}
                      onChange={(e) =>
                        updateRow(row.id, { mediaKind: e.target.value as MediaKind })
                      }
                    >
                      <option value="photo">{t('adm_notif_kind_photo')}</option>
                      <option value="animation">{t('adm_notif_kind_animation')}</option>
                      <option value="video">{t('adm_notif_kind_video')}</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-white/20"
                    checked={!!o.useCustomCaption}
                    onChange={(e) => updateRow(row.id, { useCustomCaption: e.target.checked })}
                  />
                  {t('adm_notif_custom_caption')}
                </label>
                {o.useCustomCaption && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t('adm_notif_caption_ru')}</label>
                      <textarea
                        className="w-full rounded-lg px-3 py-2 text-sm bg-ui-button border border-white/10 text-foreground min-h-[100px] font-mono"
                        value={o.captionRu || ''}
                        onChange={(e) => updateRow(row.id, { captionRu: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t('adm_notif_caption_en')}</label>
                      <textarea
                        className="w-full rounded-lg px-3 py-2 text-sm bg-ui-button border border-white/10 text-foreground min-h-[100px] font-mono"
                        value={o.captionEn || ''}
                        onChange={(e) => updateRow(row.id, { captionEn: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      ))}
    </div>
  );
}

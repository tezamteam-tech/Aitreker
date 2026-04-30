/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TG_ANALYTICS_TOKEN?: string;
  readonly VITE_TG_ANALYTICS_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


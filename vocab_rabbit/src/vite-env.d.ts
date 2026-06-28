/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTENT_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

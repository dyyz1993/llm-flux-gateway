/// <reference types="vite/client" />

interface ProcessEnv {
  // Required
  GEMINI_API_KEY: string;

  // Optional - Database
  DATABASE_PATH?: string;

  // Optional - Logging
  MAX_LOGS_COUNT?: string;

  // Optional - CORS
  CORS_ORIGINS?: string;

  // Optional - Server
  PORT?: string;
  HOST?: string;
}

interface ImportMetaEnv {
  // Client-side build-time variables
  VITE_API_BASE_URL?: string;
  VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  env: ImportMetaEnv;
}

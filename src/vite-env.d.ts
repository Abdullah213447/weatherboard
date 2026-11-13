/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/* eslint-disable @typescript-eslint/consistent-type-definitions --
   Vite's env typing works by declaration merging, which only interfaces support. */

// Variables documented in .env.example. All are optional at the type level:
// the app must cope with a missing key rather than crash.
interface ImportMetaEnv {
  readonly VITE_OPENWEATHER_API_KEY?: string;
  readonly VITE_RAPIDAPI_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

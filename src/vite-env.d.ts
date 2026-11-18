/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Public Mapbox access token (pk.…) for the satellite dive. Set it in .env.local. */
  readonly VITE_MAPBOX_TOKEN?: string;
}

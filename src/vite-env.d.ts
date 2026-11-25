/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Public Mapbox access token (pk.…) for the satellite dive. Set it in .env.local. */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Web3Forms access key: enquiries are emailed to the address it was created for. */
  readonly VITE_WEB3FORMS_KEY?: string;
}

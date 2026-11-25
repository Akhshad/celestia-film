/* =====================================================================
   SETTINGS: the only part you normally need to touch
   ===================================================================== */

// 3D model of the building used for the finale (lives in /public).
// If it can't load (or WebGL is off) a flat 2D ending is shown.
export const MODEL_URL = `${import.meta.env.BASE_URL}celestia-hall.glb`;

// The architect's aerial render. At the end of the scroll the 3D camera settles on the
// same viewpoint and this picture fades in over it (null = end on the 3D model).
export const RENDER_IMAGE: string | null = null;

// Where the dive to Earth lands: [longitude, latitude] of the banquet site.
// Default is Nagpur city centre; set it to the plot's coordinates.
export const SITE: [number, number] = [79.0882, 21.1458];

// Public Mapbox token for the satellite dive (set VITE_MAPBOX_TOKEN in .env.local).
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// 2D fallback only: top-view photo of the hall (null = drawn placeholder).
// Put the image in /public and use e.g. `${import.meta.env.BASE_URL}hall-top.jpg`.
export const HALL_IMAGE: string | null = null;

// Where the building sits inside that photo, as fractions of the photo
// (0 = left/top edge, 1 = right/bottom edge). cx/cy = centre of the roof,
// w/h = roof width/height. The 2D ending zooms in on this rectangle.
export const HALL_BUILDING = { cx: 0.5, cy: 0.5, w: 0.42, h: 0.32 };

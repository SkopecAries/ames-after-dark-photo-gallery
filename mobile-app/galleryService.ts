const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL;
const RAW_DOMAIN = process.env.EXPO_PUBLIC_IMAGE_DOMAIN;
const IMAGE_DOMAIN = `https://${RAW_DOMAIN}`;

if (!BACKEND_URL) {
  console.warn("Missing BACKEND_URL in app config — gallery will not load");
}

// Photo and Album types are imported from photosService; re-export for consumers
export type Photo = {
  id: string;
  image: { uri: string };
};

export type Album = {
  id: string;
  name: string;
  barName: string;
  date: string;
  coverUrl: string | null;
  albumUri: string;
};

/**
 * Parse a date token like "2-7" or "1/31" into a Date object (month-day).
 * Assumes current year, but if that date is in the future, it rolls back to previous year.
 */
function parseFolderDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split(/[-\/]/);
  if (parts.length !== 2) return null;

  const month = parseInt(parts[0].trim(), 10) - 1;
  const day = parseInt(parts[1].trim(), 10);
  if (isNaN(month) || isNaN(day)) return null;

  const now = new Date();
  let year = now.getFullYear();
  let candidate = new Date(year, month, day);
  if (candidate > now) candidate = new Date(year - 1, month, day);
  return candidate;
}

/**
 * Fetches albums from the backend & filters them using a 7-day rolling window
 * with a day-of-week override to ensure only most relevant albums are displayed
 */
export async function getLatestWeekAlbums(): Promise<Album[]> {
  let rawAlbums: Album[] = [];

  try {
    const url = `${BACKEND_URL}/r2/albums`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`Albums fetch failed: ${res.statusText}`);
    const albums: Album[] = await res.json();
    if (albums && albums.length > 0) rawAlbums = albums;
  } catch (err) {
    console.error("Cloudflare albums fetch failed: ", err);
  }

  if (!rawAlbums || rawAlbums.length === 0) return [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const latestPerBarAndDay = new Map<string, Album & { parsedDate: Date }>();

  rawAlbums.forEach((album) => {
    const d = parseFolderDate(album.date);
    if (!d) return;
    d.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Only consider albums whose date is within the last 7 days (0–7 days ago)
    if (diffDays >= 0 && diffDays <= 7) {
      const dayOfWeek = d.getDay();
      const key = `${album.barName}-${dayOfWeek}`; // e.g. "Sips-5" for Sips on Friday
      // Overwrite if we find a NEWER album for this same bar & day
      const existing = latestPerBarAndDay.get(key);
      if (!existing || d.getTime() > existing.parsedDate.getTime()) {
        latestPerBarAndDay.set(key, { ...album, parsedDate: d });
      }
    }
  });
  // Sort albums newest first, then strip parsedDate before returning
  const sortedAlbums = Array.from(latestPerBarAndDay.values()).sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
  return sortedAlbums.map(({ parsedDate, ...album }) => album);
}

/**
 * Fetches photos for a given album (bar folder) from the backend.
 * albumUri is the bar folder prefix (e.g. "Sips/").
 */
export async function getPhotosByAlbumUri(albumUri: string): Promise<Photo[]> {
  try {
    const url = `${BACKEND_URL}/r2/photos?prefix=${encodeURIComponent(albumUri)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`Photos fetch failed: ${res.statusText}`);
    const photos: Photo[] = await res.json();
    if (photos && photos.length > 0) return photos;
  } catch (err) {
    console.error("Cloudflare photos fetch failed: ", err);
  }
  return [];
}

/**
 * Transforms a standard R2 public URL into a Cloudflare Image Resizing URL.
 * Syntax: https://<DOMAIN>/cdn-cgi/image/<OPTIONS>/<IMAGE_PATH>
 */
export function getResizedImageUri(originalUri: string, width: number = 400): string {
  const USE_RESIZING = true; // toggle in case Cloudflare resizing doesn't work / is not available by build time
  if (!originalUri || !USE_RESIZING) return originalUri;

  try {
    const urlObj = new URL(originalUri);
    if (urlObj.hostname.includes(`${RAW_DOMAIN}`) || urlObj.hostname.includes("r2.cloudflarestorage.com")) {
      // Extracts the path after the domain
      const imagePath = urlObj.pathname;
      // quality=80 and format=auto will drastically reduce file size for grid photos
      return `${IMAGE_DOMAIN}/cdn-cgi/image/width=${width},quality=80,format=auto,onerror=redirect${imagePath}`;
    }
  } catch (err) {
    // Ignore if invalid
  }

  return originalUri;
}
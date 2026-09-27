const express = require('express');
const { S3Client, ListObjectsV2Command, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

const {
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET,
  CLOUDFLARE_R2_S3_ENDPOINT,
} = process.env;

// Initialize S3 client for R2 (used for generating signed URLs if needed)
const s3 = new S3Client({
  region: 'auto',
  endpoint: CLOUDFLARE_R2_S3_ENDPOINT,
  credentials: {
    accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a signed URL for an R2 object key, valid for 1 hour.
 */
async function signedUrlForKey(key) {
  const command = new GetObjectCommand({
    Bucket: CLOUDFLARE_R2_BUCKET,
    Key: key,
  });
  return await getSignedUrl(s3, command, { expiresIn: 3600 }); // Change expiresIn to adjust duration
}

/**
 * List objects in R2 with pagination to bypass 1000 object limit
 */
async function listR2Objects(prefix = '') {
  let isTruncated = true;
  let continuationToken = undefined;
  const allContents = [];

  try {
    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: CLOUDFLARE_R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3.send(command);

      if (response.Contents) {
        allContents.push(...response.Contents);
      }
      
      // Check if there are more results to fetch
      isTruncated = response.IsTruncated;
      continuationToken = response.NextContinuationToken;
    }

    return allContents;
  } catch (err) {
    console.warn('R2 list error:', err);
    return [];
  }
}

/**
 * Parse a folder name into display name and date string.
 * If no date found, returns display name as-is and dateStr as null.
 */
function parseFolderName(folderName) {
  const cleaned = folderName.trim();
  const match = cleaned.match(/^(.+?)[\s_]+(\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?)$/);
  
  if (match) {
    const displayName = match[1].replace(/_+$/, '').trim();
    return { displayName, dateStr: match[2] };
  }

  return { displayName: cleaned, dateStr: null };
}

/**
 * Parse a date string like "03-12" into a Date object.
 * If date is in the future, roll back to previous year.
 */
function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/[-\/]/);
  if (parts.length < 2) return null;
  
  const month = parseInt(parts[0], 10) - 1;
  const day = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(day)) return null;

  const now = new Date();
  let year = now.getFullYear();

  if (parts.length === 3) {
    const providedYear = parseInt(parts[2].trim(), 10);
    year = providedYear < 100 ? 2000 + providedYear : providedYear;
  }
  
  let candidate = new Date(year, month, day);
  if (candidate > now && parts.length !== 3) candidate = new Date(year - 1, month, day);

  return candidate;
}

/**
 * Format date string like "3-12" into "03/12" for display.
 */
function formatDateStr(dateStr) {
  if (!dateStr) return null;
  const [m, d] = dateStr.split('-');
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}`;
}

/**
 * @swagger
 * tags:
 *   - name: Storage
 *     description: Image storage and retrieval from Cloudflare R2
 */

/**
 * GET /api/r2/albums
 * List albums (bar folders) from R2.
 * Filters to most recent weekend based on date in folder name.
 */
/**
 * @swagger
 * /api/r2/albums:
 *   get:
 *     summary: Get all photo albums
 *     description: Retrieves all available photo albums from Cloudflare R2 storage, grouped by bar/venue with the most recent weekend albums displayed first
 *     tags:
 *       - Storage
 *     responses:
 *       200:
 *         description: Albums retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Album folder ID
 *                   name:
 *                     type: string
 *                     description: Bar or venue name
 *                   barName:
 *                     type: string
 *                     description: Bar name for sorting
 *                   date:
 *                     type: string
 *                     description: Album date (MM/DD)
 *                   coverUrl:
 *                     type: string
 *                     description: Signed URL to album cover image
 *                   albumUri:
 *                     type: string
 *                     description: Album URI for querying photos
 *       500:
 *         description: Server error
 */
router.get('/albums', async (req, res) => {
  try {
    const allObjects = await listR2Objects('');
    console.log(`r2Routes: got ${allObjects.length} objects`);
    if (!allObjects || allObjects.length === 0) { return res.json([]); }

    // Group photos by bar folder
    const photosByFolder = {};

    for (const obj of allObjects) {
      const key = obj?.Key || '';

      // Ignore any photos that have been hidden by photographers
      if (key.includes('hidden_')) continue;

      const folderName = key.split('/')[0];
      const ext = key.toLowerCase().split('.').pop();

      // Skip if no bar folder or doesn't look like an image
      if (!folderName || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) continue;

      if (!photosByFolder[folderName]) photosByFolder[folderName] = [];
      photosByFolder[folderName].push(obj);
    }

    // Parse dates and find most recent folder date
    const folderMeta = {};
    for (const folderName of Object.keys(photosByFolder)) {
      const { displayName, dateStr } = parseFolderName(folderName);
      const date = parseDateStr(dateStr);
      folderMeta[folderName] = { displayName, dateStr, date };
    }

    // Build albums for folders that have a valid date
    const albums = await Promise.all(
      Object.entries(photosByFolder).filter(([folderName]) => {
        const meta = folderMeta[folderName];
        return meta.date != null;
      })
      .map(async ([folderName, objects]) => {
        const meta = folderMeta[folderName];

        // Pick most recently modified photo as cover
        const cover = objects.reduce((a, b) =>
          new Date(b.LastModified) > new Date(a.LastModified) ? b : a);
        const coverUrl = await signedUrlForKey(cover.Key);

        return {
          id: folderName,
          name: meta.displayName,
          barName: meta.displayName,
          date: formatDateStr(meta.dateStr),
          coverUrl,
          albumUri: `${folderName}/`,
        };
      })
    );

    albums.sort((a, b) => a.barName.localeCompare(b.barName));
    res.json(albums);
  } catch (err) {
    console.error('Error fetching albums:', err);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

/**
 * GET /api/r2/photos?prefix=:prefix
 * Fetch photos for a given album (bar folder prefix).
 * Returns array of { id, image: { uri } } with signed URLs.
 */
/**
 * @swagger
 * /api/r2/photos:
 *   get:
 *     summary: Get photos from an album
 *     description: Retrieves all photos from a specific album with signed URLs valid for 1 hour
 *     tags:
 *       - Storage
 *     parameters:
 *       - name: prefix
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Album folder prefix/ID
 *     responses:
 *       200:
 *         description: Photos retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Photo ID
 *                   image:
 *                     type: object
 *                     properties:
 *                       uri:
 *                         type: string
 *                         description: Signed URL to photo (valid for 1 hour)
 *       400:
 *         description: Missing prefix query parameter
 *       500:
 *         description: Server error
 */
router.get('/photos', async (req, res) => {
  try {
    const prefix = req.query.prefix || '';
    if (!prefix) return res.status(400).json({ error: 'Missing prefix query param' });

    let normalizedPrefix = prefix.replace(/^\//, '');
    if (!normalizedPrefix.endsWith('/')) normalizedPrefix = `${normalizedPrefix}/`;

    const objs = await listR2Objects(normalizedPrefix);
    if (!objs.length) return res.json([]);

    const imageObjs = objs.filter(o => {
      const key = o?.Key || '';

      // Ignore any photos that have been hidden by photographers
      if (key.includes('hidden_')) return false;

      const ext = key.toLowerCase().split('.').pop();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  });

    const photos = await Promise.all(imageObjs.map(async (o) => ({
      id: o.Key,
      image: { uri: await signedUrlForKey(o.Key) },
    })));

    res.json(photos);
  } catch (err) {
    console.error('Error fetching photos:', err);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

/**
 * PATCH /api/r2/photos/hide
 * Soft deletes a photo by prepending "hidden_" to its filename in R2
 */
/**
 * @swagger
 * /api/r2/photos/hide:
 * patch:
 * summary: Hide a photo
 * description: Soft-deletes a photo from the public app by renaming the object key with a 'hidden_' prefix.
 * tags:
 * - Storage
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - key
 * properties:
 * key:
 * type: string
 * description: The S3 object key of the photo to hide
 * responses:
 * 200:
 * description: Photo hidden successfully
 * 400:
 * description: Missing key parameter
 * 500:
 * description: Server error
 */
router.patch('/photos/hide', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key parameter' });

    // Split the path to isolate the filename from the folder
    // e.g., "Outlaws 04-09/_DSC9171.jpg" -> folder: "Outlaws 04-09", filename: "_DSC9171.jpg"
    const parts = key.split('/');
    const fileName = parts.pop();
    const folderPath = parts.join('/');
    
    // Inject "hidden_" right before the filename
    const newKey = folderPath ? `${folderPath}/hidden_${fileName}` : `hidden_${fileName}`;

    // Copy the object to its new "hidden_" name
    const copyCommand = new CopyObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET,
      CopySource: `${CLOUDFLARE_R2_BUCKET}/${encodeURI(key)}`,
      Key: newKey,
    });
    await s3.send(copyCommand);

    // Delete the old object
    const deleteCommand = new DeleteObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET,
      Key: key,
    });
    await s3.send(deleteCommand);

    res.json({ success: true, message: 'Photo hidden successfully', newKey });
  } catch (err) {
    console.error('Error hiding photo:', err);
    res.status(500).json({ error: 'Failed to hide photo' });
  }
});

module.exports = router;
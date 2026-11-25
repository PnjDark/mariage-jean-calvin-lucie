const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const CACHE_SECONDS = 600;
const MAX_LIST_PAGES = 5;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonResponse(body, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function galleryConfiguration(env) {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID;
  const apiKey = env.GOOGLE_DRIVE_API_KEY;

  if (
    !folderId ||
    folderId === "REPLACE_WITH_GOOGLE_DRIVE_FOLDER_ID" ||
    !/^[A-Za-z0-9_-]+$/.test(folderId) ||
    !apiKey
  ) {
    return null;
  }

  return { folderId, apiKey };
}

async function cacheResponse(cacheKey, response) {
  try {
    await caches.default.put(cacheKey, response.clone());
  } catch (error) {
    console.warn("Gallery cache write failed.", error);
  }
}

async function listPhotos(request, env) {
  const config = galleryConfiguration(env);
  if (!config) {
    return jsonResponse(
      { error: "La galerie photo n’est pas encore configurée." },
      503,
    );
  }

  const url = new URL(request.url);
  const cacheKey = new Request(new URL("/__cache/api/photos", url).toString());
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const photos = [];
  let pageToken;
  let pageCount = 0;

  try {
    do {
      const driveUrl = new URL(DRIVE_API);
      driveUrl.searchParams.set(
        "q",
        `'${config.folderId}' in parents and trashed = false`,
      );
      driveUrl.searchParams.set("pageSize", "1000");
      driveUrl.searchParams.set("orderBy", "name_natural");
      driveUrl.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,modifiedTime)",
      );
      driveUrl.searchParams.set("supportsAllDrives", "true");
      driveUrl.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) driveUrl.searchParams.set("pageToken", pageToken);

      const response = await fetch(driveUrl, {
        headers: { "X-Goog-Api-Key": config.apiKey },
      });
      if (!response.ok) {
        console.error("Google Drive photo listing failed.", response.status);
        return jsonResponse(
          { error: "Impossible de charger la galerie pour le moment." },
          502,
        );
      }

      const data = await response.json();
      for (const file of data.files ?? []) {
        if (ALLOWED_IMAGE_TYPES.has(file.mimeType)) {
          photos.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
          });
        }
      }

      pageToken = data.nextPageToken;
      pageCount += 1;
    } while (pageToken && pageCount < MAX_LIST_PAGES);
  } catch (error) {
    console.error("Google Drive photo listing request failed.", error);
    return jsonResponse(
      { error: "Impossible de joindre Google Drive pour le moment." },
      502,
    );
  }

  const response = jsonResponse(
    { photos, hasMore: Boolean(pageToken) },
    200,
    `public, max-age=${CACHE_SECONDS}`,
  );
  await cacheResponse(cacheKey, response);
  return response;
}

async function getPhoto(request, env, fileId) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return jsonResponse({ error: "Photo introuvable." }, 404);
  }

  const listingResponse = await listPhotos(request, env);
  if (!listingResponse.ok) return listingResponse;

  const listing = await listingResponse.json();
  const photo = listing.photos.find((item) => item.id === fileId);
  if (!photo) return jsonResponse({ error: "Photo introuvable." }, 404);

  const url = new URL(request.url);
  const cacheKey = new Request(
    new URL(`/__cache/api/photos/${fileId}`, url).toString(),
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const config = galleryConfiguration(env);
  const driveUrl = new URL(`${DRIVE_API}/${encodeURIComponent(fileId)}`);
  driveUrl.searchParams.set("alt", "media");
  driveUrl.searchParams.set("supportsAllDrives", "true");

  try {
    const response = await fetch(driveUrl, {
      headers: { "X-Goog-Api-Key": config.apiKey },
    });
    if (!response.ok || !response.body) {
      console.error("Google Drive photo download failed.", response.status);
      return jsonResponse(
        { error: "Impossible de charger cette photo pour le moment." },
        502,
      );
    }

    const image = new Response(response.body, {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": photo.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
    await cacheResponse(cacheKey, image);
    return image;
  } catch (error) {
    console.error("Google Drive photo download request failed.", error);
    return jsonResponse(
      { error: "Impossible de joindre Google Drive pour le moment." },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/photos") {
      if (request.method !== "GET") {
        return jsonResponse(
          { error: "Méthode non autorisée." },
          405,
          "no-store",
        );
      }
      return listPhotos(request, env);
    }

    const photoMatch = url.pathname.match(/^\/api\/photos\/([A-Za-z0-9_-]+)$/);
    if (photoMatch) {
      if (request.method !== "GET") {
        return jsonResponse(
          { error: "Méthode non autorisée." },
          405,
          "no-store",
        );
      }
      return getPhoto(request, env, photoMatch[1]);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Route introuvable." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

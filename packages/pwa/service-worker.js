const CONFIG = __DARANOR_PWA_CONFIG__;
const APP_ROOT = new URL("./", self.location.href);
const SHELL_CACHE = `daranor-shell-${CONFIG.buildId}`;
const CONTENT_CACHE = "daranor-content-v1";
const METADATA_CACHE = "daranor-offline-meta-v1";
const activeDownloads = new Map();

function appUrl(path = "") {
  return new URL(path, APP_ROOT).href;
}

function assetCacheKey(sha256) {
  return appUrl(`__offline__/${sha256}`);
}

function campaignMarkerKey(campaignId) {
  return appUrl(`__offline_meta__/${campaignId}`);
}

function normalizedPath(url) {
  const rootPath = APP_ROOT.pathname;
  if (url.origin !== APP_ROOT.origin || !url.pathname.startsWith(rootPath)) return "";
  let path = decodeURIComponent(url.pathname.slice(rootPath.length));
  if (!path) path = "index.html";
  else if (path.endsWith("/")) path += "index.html";
  return path;
}

async function cachedAsset(sha256) {
  if (!sha256) return null;
  return (await caches.open(CONTENT_CACHE)).match(assetCacheKey(sha256));
}

async function storeAsset(sha256, response) {
  if (!sha256 || !response?.ok || response.status !== 200) return false;
  await (await caches.open(CONTENT_CACHE)).put(assetCacheKey(sha256), response);
  return true;
}

async function fetchAndStore(file) {
  const cached = await cachedAsset(file.sha256);
  if (cached) return false;
  const response = await fetch(appUrl(file.path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not download ${file.path} (${response.status}).`);
  const stored = await storeAsset(file.sha256, response.clone());
  if (!stored) throw new Error(`Could not save ${file.path} for offline play.`);
  return stored;
}

async function readCampaignMarker(campaignId) {
  const response = await (await caches.open(METADATA_CACHE)).match(campaignMarkerKey(campaignId));
  if (!response) return null;
  try {
    const marker = await response.json();
    return Array.isArray(marker?.files) ? marker : null;
  } catch {
    return null;
  }
}

async function writeCampaignMarker(campaign) {
  const marker = {
    campaignId: campaign.id,
    files: campaign.files.map(({ path, sha256 }) => ({ path, sha256 }))
  };
  await (await caches.open(METADATA_CACHE)).put(
    campaignMarkerKey(campaign.id),
    new Response(JSON.stringify(marker), { headers: { "Content-Type": "application/json" } })
  );
}

async function cacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(CONFIG.shellFiles.map((path) => new Request(appUrl(path), { cache: "reload" })));
  for (const path of CONFIG.shellContentFiles) {
    const file = CONFIG.assets[path];
    if (file) await fetchAndStore({ path, ...file });
  }
}

async function pruneContentCache() {
  const referencedHashes = new Set(Object.values(CONFIG.assets).map((entry) => entry.sha256));
  const cache = await caches.open(CONTENT_CACHE);
  const offlinePrefix = appUrl("__offline__/");
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((request) => request.url.startsWith(offlinePrefix) && !referencedHashes.has(request.url.slice(offlinePrefix.length)))
    .map((request) => cache.delete(request)));
}

async function migrateSavedCampaigns() {
  for (const campaign of Object.values(CONFIG.campaigns)) {
    const marker = await readCampaignMarker(campaign.id);
    if (!marker) continue;
    await cacheCampaignFiles(campaign);
    await writeCampaignMarker(campaign);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await migrateSavedCampaigns();
    await Promise.all([
      ...names
        .filter((name) => name.startsWith("daranor-shell-") && name !== SHELL_CACHE)
        .map((name) => caches.delete(name)),
      pruneContentCache()
    ]);
    await self.clients.claim();
  })());
});

function rangeBounds(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match || size < 1) return null;
  const [, startText, endText] = match;
  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

async function cachedResponseForRequest(request, response) {
  const rangeHeader = request.headers?.get?.("range");
  if (!rangeHeader) return response;
  const body = await response.arrayBuffer();
  const bounds = rangeBounds(rangeHeader, body.byteLength);
  if (!bounds) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${body.byteLength}` }
    });
  }
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(bounds.end - bounds.start + 1));
  headers.set("Content-Range", `bytes ${bounds.start}-${bounds.end}/${body.byteLength}`);
  return new Response(body.slice(bounds.start, bounds.end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}

async function responseForKnownAsset(request, entry) {
  const cached = await cachedAsset(entry.sha256);
  if (cached) return cachedResponseForRequest(request, cached);
  const response = await fetch(request);
  const rangeRequest = Boolean(request.headers?.get?.("range"));
  if (response.ok && response.status !== 206 && !rangeRequest) {
    await storeAsset(entry.sha256, response.clone()).catch(() => false);
  }
  return response;
}

async function responseForNavigation(request, entry) {
  try {
    const response = await fetch(request);
    if (response.ok && entry) await storeAsset(entry.sha256, response.clone()).catch(() => false);
    return response;
  } catch (error) {
    const cached = entry ? await cachedAsset(entry.sha256) : null;
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match(appUrl("index.html"))) || (await shell.match(appUrl(""))) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const path = normalizedPath(url);
  if (!path) return;
  const entry = CONFIG.assets[path];
  if (request.mode === "navigate") {
    event.respondWith(responseForNavigation(request, entry));
    return;
  }
  if (entry) {
    const requestedVersion = url.searchParams.get("v") || "";
    if (/^[a-f0-9]{12}$/i.test(requestedVersion) && !entry.sha256.startsWith(requestedVersion.toLowerCase())) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(responseForKnownAsset(request, entry));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});

async function campaignStatus(campaignId) {
  const campaign = CONFIG.campaigns[campaignId];
  if (!campaign) throw new Error("Unknown campaign.");
  const cache = await caches.open(CONTENT_CACHE);
  const present = await Promise.all(campaign.files.map((file) => cache.match(assetCacheKey(file.sha256))));
  const completedBytes = campaign.files.reduce((total, file, index) => total + (present[index] ? file.bytes : 0), 0);
  return {
    type: "CAMPAIGN_STATUS",
    campaignId,
    completedBytes,
    totalBytes: campaign.bytes,
    complete: completedBytes >= campaign.bytes
  };
}

async function notify(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => client.postMessage(message));
}

async function cacheCampaignFiles(campaign, onFile = async () => {}) {
  let nextIndex = 0;
  let stopped = false;
  let firstError = null;

  async function worker() {
    while (!stopped && nextIndex < campaign.files.length) {
      const file = campaign.files[nextIndex++];
      try {
        const added = await fetchAndStore(file);
        if (stopped) return;
        await onFile(file, added);
      } catch (error) {
        firstError ||= error;
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, campaign.files.length) }, worker));
  if (firstError) throw firstError;
}

async function downloadCampaign(campaignId) {
  const campaign = CONFIG.campaigns[campaignId];
  if (!campaign) throw new Error("Unknown campaign.");
  const initial = await campaignStatus(campaignId);
  let completedBytes = initial.completedBytes;
  await notify({ ...initial, type: "CAMPAIGN_PROGRESS", downloading: true });

  await cacheCampaignFiles(campaign, async (file, added) => {
    if (added) completedBytes += file.bytes;
    await notify({
      type: "CAMPAIGN_PROGRESS",
      campaignId,
      completedBytes,
      totalBytes: campaign.bytes,
      complete: completedBytes >= campaign.bytes,
      downloading: true
    });
  });
  const finalStatus = await campaignStatus(campaignId);
  if (finalStatus.complete) await writeCampaignMarker(campaign);
  await notify(finalStatus);
  return finalStatus;
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "GET_CAMPAIGN_STATUS") {
    event.waitUntil(campaignStatus(message.campaignId)
      .then(notify)
      .catch((error) => notify({ type: "CAMPAIGN_STATUS", campaignId: message.campaignId, error: error.message })));
    return;
  }
  if (message.type !== "DOWNLOAD_CAMPAIGN") return;
  const id = message.campaignId;
  if (!activeDownloads.has(id)) {
    const task = downloadCampaign(id)
      .catch(async (error) => {
        const status = await campaignStatus(id).catch(() => ({ type: "CAMPAIGN_STATUS", campaignId: id }));
        await notify({ ...status, error: error.message });
      })
      .finally(() => activeDownloads.delete(id));
    activeDownloads.set(id, task);
  }
  event.waitUntil(activeDownloads.get(id));
});

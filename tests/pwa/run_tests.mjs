#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distRoot = path.join(repoRoot, "dist");

function read(relativePath) {
  return fs.readFileSync(path.join(distRoot, relativePath));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function pngSize(relativePath) {
  const buffer = read(relativePath);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${relativePath} must be a PNG.`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

const manifest = JSON.parse(read("manifest.json"));
assert.equal(manifest.name, "Daranor RPG");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.deepEqual(pngSize("icons/icon-192.png"), [192, 192]);
assert.deepEqual(pngSize("icons/icon-512.png"), [512, 512]);

const launcher = read("index.html").toString("utf8");
const gameShell = read("dreamquest/index.html").toString("utf8");
assert.match(launcher, /rel="manifest" href="manifest\.json"/);
assert.match(launcher, /src="pwa\.js"/);
assert.match(gameShell, /rel="manifest" href="\.\.\/manifest\.json"/);
assert.match(gameShell, /src="\.\.\/pwa\.js"/);

const offline = JSON.parse(read("offline-manifest.json"));
assert.deepEqual(Object.keys(offline.campaigns).sort(), ["dreamquest", "prophecy-sword"]);
const allHashes = new Set();
let listedBytes = 0;
for (const [campaignId, campaign] of Object.entries(offline.campaigns)) {
  assert.equal(campaign.id, campaignId);
  assert(campaign.files.length > 10, `${campaignId} should list its complete distribution.`);
  let campaignBytes = 0;
  for (const file of campaign.files) {
    assert(file.path.startsWith(`${campaignId}/`), `${file.path} is outside ${campaignId}.`);
    const bytes = read(file.path);
    assert.equal(bytes.length, file.bytes, `${file.path} byte count changed after the offline manifest was written.`);
    assert.equal(sha256(bytes), file.sha256, `${file.path} hash changed after the offline manifest was written.`);
    allHashes.add(file.sha256);
    campaignBytes += file.bytes;
  }
  assert.equal(campaignBytes, campaign.bytes, `${campaignId} campaign byte total is incorrect.`);
  listedBytes += campaignBytes;
}

const worker = read("service-worker.js").toString("utf8");
assert(!worker.includes("__DARANOR_PWA_CONFIG__"), "Service worker config placeholder was not replaced.");
assert.match(worker, /DOWNLOAD_CAMPAIGN/);
assert.match(worker, /daranor-content-v1/);
assert.doesNotThrow(() => new Function(worker));
assert.doesNotThrow(() => new Function(read("pwa.js").toString("utf8")));

const workerTemplate = fs.readFileSync(path.join(repoRoot, "packages/pwa/service-worker.js"), "utf8");

function tinyWorkerConfig() {
  const files = [
    { path: "campaign/index.html", bytes: 10, sha256: "1".repeat(64) },
    { path: "campaign/fast.dat", bytes: 20, sha256: "2".repeat(64) },
    { path: "campaign/fail.dat", bytes: 30, sha256: "3".repeat(64) },
    { path: "campaign/late-a.dat", bytes: 40, sha256: "4".repeat(64) },
    { path: "campaign/late-b.dat", bytes: 50, sha256: "5".repeat(64) }
  ];
  return {
    buildId: "behavior-test",
    shellFiles: ["index.html"],
    shellContentFiles: [],
    assets: Object.fromEntries(files.map(({ path: filePath, bytes, sha256 }) => [filePath, { bytes, sha256 }])),
    campaigns: {
      campaign: {
        id: "campaign",
        bytes: files.reduce((total, file) => total + file.bytes, 0),
        files
      }
    }
  };
}

function createWorkerHarness(config, { fetchImpl, rejectPut } = {}) {
  const appRoot = "https://example.test/dqrpg/";
  const listeners = new Map();
  const cacheStores = new Map();
  const cacheObjects = new Map();
  const messages = [];
  const putAttempts = [];

  function requestUrl(request) {
    const value = typeof request === "string" ? request : request.url;
    return new URL(value, appRoot).href;
  }

  function requestKey(request, ignoreSearch = false) {
    const url = new URL(requestUrl(request));
    if (ignoreSearch) url.search = "";
    return url.href;
  }

  function storeFor(cacheName) {
    if (!cacheStores.has(cacheName)) cacheStores.set(cacheName, new Map());
    return cacheStores.get(cacheName);
  }

  function cacheFor(cacheName) {
    if (cacheObjects.has(cacheName)) return cacheObjects.get(cacheName);
    const store = storeFor(cacheName);
    const cache = {
      async match(request, options = {}) {
        const exact = store.get(requestKey(request));
        if (exact) return exact.clone();
        if (!options.ignoreSearch) return undefined;
        const key = requestKey(request, true);
        for (const [storedKey, response] of store) {
          if (requestKey(storedKey, true) === key) return response.clone();
        }
        return undefined;
      },
      async put(request, response) {
        const key = requestKey(request);
        putAttempts.push({ cacheName, key });
        if (rejectPut?.({ cacheName, key, response })) throw new Error("Quota exceeded");
        store.set(key, response.clone());
      },
      async addAll(requests) {
        for (const request of requests) {
          const response = await sandbox.fetch(request);
          if (!response.ok) throw new Error(`Shell request failed (${response.status}).`);
          await this.put(request, response);
        }
      },
      async keys() {
        return [...store.keys()].map((url) => new Request(url));
      },
      async delete(request) {
        return store.delete(requestKey(request));
      }
    };
    cacheObjects.set(cacheName, cache);
    return cache;
  }

  const caches = {
    async open(cacheName) {
      return cacheFor(cacheName);
    },
    async keys() {
      return [...cacheStores.keys()];
    },
    async delete(cacheName) {
      cacheObjects.delete(cacheName);
      return cacheStores.delete(cacheName);
    },
    async match(request, options = {}) {
      for (const cacheName of cacheStores.keys()) {
        const response = await cacheFor(cacheName).match(request, options);
        if (response) return response;
      }
      return undefined;
    }
  };

  const self = {
    location: { href: `${appRoot}service-worker.js` },
    clients: {
      async claim() {},
      async matchAll() {
        return [{ postMessage(message) { messages.push(message); } }];
      }
    },
    async skipWaiting() {},
    addEventListener(type, handler) {
      listeners.set(type, handler);
    }
  };

  const sandbox = {
    URL,
    Request,
    Response,
    Headers,
    clearTimeout,
    console,
    setTimeout,
    caches,
    self,
    fetch: (request, options) => {
      if (!fetchImpl) return Promise.reject(new Error("Network unavailable"));
      return fetchImpl(request, options);
    }
  };
  const context = vm.createContext(sandbox);
  const injectedWorker = workerTemplate.replace("__DARANOR_PWA_CONFIG__", JSON.stringify(config));
  assert(!injectedWorker.includes("__DARANOR_PWA_CONFIG__"));
  vm.runInContext(injectedWorker, context, { filename: "service-worker.behavior-test.js" });

  async function dispatch(type, payload) {
    const handler = listeners.get(type);
    assert(handler, `Service worker did not register a ${type} handler.`);
    const waits = [];
    let responsePromise;
    handler({
      ...payload,
      respondWith(response) {
        responsePromise = Promise.resolve(response);
      },
      waitUntil(task) {
        waits.push(Promise.resolve(task));
      }
    });
    const response = responsePromise ? await responsePromise : undefined;
    await Promise.all(waits);
    return response;
  }

  return {
    appRoot,
    assetCacheKey(sha256) {
      return new URL(`__offline__/${sha256}`, appRoot).href;
    },
    dispatchFetch(request) {
      return dispatch("fetch", { request });
    },
    dispatchMessage(data) {
      return dispatch("message", { data });
    },
    dispatchActivate() {
      return dispatch("activate", {});
    },
    messages,
    putAttempts,
    seed(cacheName, request, response) {
      storeFor(cacheName).set(requestKey(request), response.clone());
    },
    async cached(cacheName, request) {
      return cacheFor(cacheName).match(request);
    }
  };
}

async function verifyRangeResponsesAreNotCached() {
  const config = tinyWorkerConfig();
  const harness = createWorkerHarness(config, {
    fetchImpl: async () => new Response("part", { status: 206 })
  });
  const response = await harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `${harness.appRoot}campaign/fast.dat`,
    headers: new Headers({ range: "bytes=0-3" })
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "part");
  assert.equal(harness.putAttempts.length, 0, "Range responses must never be written to the content cache.");
}

async function verifyCachedRangeResponsesAreSliced() {
  const config = tinyWorkerConfig();
  const entry = config.assets["campaign/fast.dat"];
  const harness = createWorkerHarness(config);
  harness.seed(
    "daranor-content-v1",
    harness.assetCacheKey(entry.sha256),
    new Response("abcdefgh", { status: 200, headers: { "Content-Type": "audio/mpeg" } })
  );
  const response = await harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `${harness.appRoot}campaign/fast.dat`,
    headers: new Headers({ range: "bytes=2-5" })
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "cdef");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/8");
  assert.equal(response.headers.get("content-length"), "4");
}

async function verifyQuotaFailureDoesNotDiscardNetworkResponse() {
  const config = tinyWorkerConfig();
  const harness = createWorkerHarness(config, {
    fetchImpl: async () => new Response("fresh network body", { status: 200 }),
    rejectPut: ({ cacheName }) => cacheName === "daranor-content-v1"
  });
  const response = await harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `${harness.appRoot}campaign/fast.dat`,
    headers: new Headers()
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "fresh network body");
  assert.equal(harness.putAttempts.length, 1, "The worker should attempt to cache a successful network response.");
}

async function verifyFailedParallelDownloadCanRetry() {
  const config = tinyWorkerConfig();
  let failDownload = true;
  let failedFileRequests = 0;
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const harness = createWorkerHarness(config, {
    fetchImpl: async (request) => {
      const pathname = new URL(typeof request === "string" ? request : request.url).pathname;
      if (pathname.endsWith("/fail.dat")) {
        failedFileRequests += 1;
        await delay(5);
        if (failDownload) throw new Error("Synthetic download failure");
      } else if (pathname.endsWith("/late-a.dat") || pathname.endsWith("/late-b.dat")) {
        await delay(15);
      }
      return new Response(pathname, { status: 200 });
    }
  });

  await harness.dispatchMessage({ type: "DOWNLOAD_CAMPAIGN", campaignId: "campaign" });
  await delay(1);
  const failedMessages = harness.messages.slice();
  const errorIndex = failedMessages.findIndex((message) => message.error);
  assert.notEqual(errorIndex, -1, "A failed campaign download should post an error.");
  assert.equal(errorIndex, failedMessages.length - 1, "The campaign error must be the final failure notification.");
  const lastDownloadingIndex = failedMessages.reduce(
    (lastIndex, message, index) => message.downloading === true ? index : lastIndex,
    -1
  );
  assert(lastDownloadingIndex < errorIndex, "No downloading:true progress may arrive after the final error.");

  failDownload = false;
  const retryStart = harness.messages.length;
  await harness.dispatchMessage({ type: "DOWNLOAD_CAMPAIGN", campaignId: "campaign" });
  const retryMessages = harness.messages.slice(retryStart);
  assert(retryMessages.length > 1, "A retry should emit progress and a final status.");
  assert.equal(retryMessages.some((message) => message.error), false, "A successful retry must not retain the previous error.");
  assert.equal(retryMessages.at(-1).complete, true, "The retried campaign should finish caching.");
  assert.equal(failedFileRequests, 2, "The failed file should be requested again on retry.");
}

async function verifyOfflineKnownNavigationUsesContentCache() {
  const config = tinyWorkerConfig();
  const entry = config.assets["campaign/index.html"];
  const harness = createWorkerHarness(config);
  harness.seed(
    "daranor-content-v1",
    harness.assetCacheKey(entry.sha256),
    new Response("cached campaign shell", { status: 200 })
  );
  const response = await harness.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: `${harness.appRoot}campaign/`,
    headers: new Headers()
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached campaign shell");
}

async function verifyActivationMigratesSavedCampaignBeforePruning() {
  const config = tinyWorkerConfig();
  const oldHash = "a".repeat(64);
  const harness = createWorkerHarness(config, {
    fetchImpl: async (request) => new Response(new URL(typeof request === "string" ? request : request.url).pathname, { status: 200 })
  });
  harness.seed("daranor-content-v1", harness.assetCacheKey(oldHash), new Response("old campaign shell", { status: 200 }));
  harness.seed(
    "daranor-offline-meta-v1",
    `${harness.appRoot}__offline_meta__/campaign`,
    new Response(JSON.stringify({ campaignId: "campaign", files: [{ path: "campaign/index.html", sha256: oldHash }] }), { status: 200 })
  );

  await harness.dispatchActivate();
  for (const file of config.campaigns.campaign.files) {
    assert(await harness.cached("daranor-content-v1", harness.assetCacheKey(file.sha256)), `${file.path} should be migrated before activation finishes.`);
  }
  assert.equal(await harness.cached("daranor-content-v1", harness.assetCacheKey(oldHash)), undefined, "Superseded content should be pruned only after migration succeeds.");
  const markerResponse = await harness.cached("daranor-offline-meta-v1", `${harness.appRoot}__offline_meta__/campaign`);
  const marker = await markerResponse.json();
  assert.deepEqual(marker.files.map((file) => file.sha256), config.campaigns.campaign.files.map((file) => file.sha256));
}

await verifyRangeResponsesAreNotCached();
await verifyCachedRangeResponsesAreSliced();
await verifyQuotaFailureDoesNotDiscardNetworkResponse();
await verifyFailedParallelDownloadCanRetry();
await verifyOfflineKnownNavigationUsesContentCache();
await verifyActivationMigratesSavedCampaignBeforePruning();

console.log(`PWA contract OK: ${allHashes.size} unique files cover ${(listedBytes / 1024 / 1024).toFixed(1)} MiB of campaign distributions.`);

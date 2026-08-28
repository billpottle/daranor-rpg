(() => {
  "use strict";

  const scriptUrl = document.currentScript?.src || new URL("pwa.js", document.baseURI).href;
  const appRoot = new URL("./", scriptUrl);
  const installButton = document.getElementById("install-app");
  const campaignState = new Map();
  let installPrompt = null;
  let registration = null;

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
    if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
    return `${Math.round(value / 1024)} KB`;
  }

  function campaignPanel(id) {
    return document.querySelector(`[data-campaign-status="${id}"]`);
  }

  function updateCampaign(message) {
    const panel = campaignPanel(message.campaignId);
    if (!panel) return;
    const progress = panel.querySelector("progress");
    const output = panel.querySelector("output");
    const button = panel.querySelector("button[data-download-campaign]");
    const total = Math.max(1, Number(message.totalBytes) || 1);
    const completed = Math.max(0, Number(message.completedBytes) || 0);
    const complete = Boolean(message.complete) || completed >= total;
    campaignState.set(message.campaignId, { ...message, totalBytes: total, completedBytes: completed, complete });
    progress.value = Math.min(1, completed / total);
    panel.classList.toggle("is-ready", complete);
    panel.classList.toggle("is-error", Boolean(message.error));
    button.disabled = Boolean(message.downloading) || complete;
    if (complete) {
      button.textContent = "Ready for offline play";
      output.textContent = `${formatBytes(total)} downloaded`;
    } else if (message.error) {
      output.textContent = message.error;
    } else if (message.downloading) {
      output.textContent = `Downloading ${formatBytes(completed)} of ${formatBytes(total)}`;
    } else if (completed / total >= 0.01) {
      output.textContent = `${formatBytes(completed)} saved · tap to resume`;
    } else {
      output.textContent = "Not downloaded";
    }
  }

  function activeWorker() {
    return navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
  }

  function postToWorker(message) {
    const worker = activeWorker();
    if (!worker) throw new Error("Offline setup is still starting. Try again in a moment.");
    worker.postMessage(message);
  }

  function requestStatuses() {
    const worker = activeWorker();
    if (!worker) return false;
    document.querySelectorAll("[data-download-campaign]").forEach((button) => {
      worker.postMessage({ type: "GET_CAMPAIGN_STATUS", campaignId: button.dataset.downloadCampaign });
    });
    return true;
  }

  async function enoughStorage(state) {
    if (!navigator.storage?.estimate || !state) return true;
    const estimate = await navigator.storage.estimate();
    const free = Math.max(0, Number(estimate.quota || 0) - Number(estimate.usage || 0));
    const missing = Math.max(0, state.totalBytes - state.completedBytes);
    return free >= missing * 1.12;
  }

  async function downloadCampaign(button) {
    const id = button.dataset.downloadCampaign;
    const panel = campaignPanel(id);
    const output = panel?.querySelector("output");
    try {
      const state = campaignState.get(id);
      if (!await enoughStorage(state)) {
        throw new Error(`Not enough browser storage. Free at least ${formatBytes((state.totalBytes - state.completedBytes) * 1.12)} and try again.`);
      }
      await navigator.storage?.persist?.().catch(() => false);
      button.disabled = true;
      panel?.classList.remove("is-error");
      if (output) output.textContent = "Starting download…";
      postToWorker({ type: "DOWNLOAD_CAMPAIGN", campaignId: id });
    } catch (error) {
      panel?.classList.add("is-error");
      button.disabled = false;
      if (output) output.textContent = error.message || "Could not start the offline download.";
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  document.querySelectorAll("[data-download-campaign]").forEach((button) => {
    button.addEventListener("click", () => downloadCampaign(button));
  });

  if (!("serviceWorker" in navigator)) {
    document.querySelectorAll("[data-campaign-status] output").forEach((output) => {
      output.textContent = "Offline play is not supported by this browser.";
    });
    return;
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    const message = event.data || {};
    if (["CAMPAIGN_STATUS", "CAMPAIGN_PROGRESS"].includes(message.type)) updateCampaign(message);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    requestStatuses();
  });

  navigator.serviceWorker.register(new URL("service-worker.js", appRoot), { scope: appRoot.pathname })
    .then(async (nextRegistration) => {
      registration = nextRegistration;
      await navigator.serviceWorker.ready;
      requestStatuses();
    })
    .catch(() => {
      document.querySelectorAll("[data-campaign-status] output").forEach((output) => {
        output.textContent = "Offline setup failed. Reload while online and try again.";
      });
    });
})();

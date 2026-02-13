(() => {
  const clients = new Map(); // tabId -> ColdClearTbpClient

  function getClient(tabId, settings) {
    if (clients.has(tabId)) return clients.get(tabId);
    const client = new window.TbpColdClearClient({
      workerUrl: chrome.runtime.getURL("vendor/cc-tbp/tbpWorker.js"),
      wasmUrl: chrome.runtime.getURL("vendor/cc-tbp/cc_tbp_bg.wasm"),
      jsUrl: chrome.runtime.getURL("vendor/cc-tbp/cc_tbp.js"),
      debug: !!settings?.debug
    });
    clients.set(tabId, client);
    return client;
  }

  async function handleSuggest(tabId, state, settings, sync, requestId) {
    const client = getClient(tabId, settings);
    const resp = await client.suggestFromState(state, settings, sync || null);
    const rid = Number(requestId);
    if (Number.isFinite(rid)) return { ...(resp || {}), requestId: rid };
    return resp;
  }

  async function handleReset(tabId) {
    const client = clients.get(tabId);
    if (!client) return { ok: true, cleared: false };
    await client.reset();
    return { ok: true, cleared: true };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) return;
    if (msg.type === "TBP_OFFSCREEN_CC_SUGGEST") {
      (async () => {
        const tabId = Number(msg.tabId);
        const state = msg.payload?.state || null;
        const settings = msg.payload?.settings || null;
        const sync = msg.payload?.sync || null;
        const requestId = msg.payload?.requestId;
        if (!Number.isFinite(tabId) || tabId <= 0) return { ok: false, error: "缺少 tabId" };
        if (!state?.board || !state?.current) return { ok: false, error: "缺少 state（board/current）" };
        return await handleSuggest(tabId, state, settings, sync, requestId);
      })()
        .then((resp) => sendResponse(resp))
        .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }
    if (msg.type === "TBP_OFFSCREEN_CC_RESET") {
      (async () => {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId) || tabId <= 0) return { ok: false, error: "缺少 tabId" };
        return await handleReset(tabId);
      })()
        .then((resp) => sendResponse(resp))
        .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }
  });
})();

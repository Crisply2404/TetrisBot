const injectedTabs = new Set();

function injectMainWorld(tabId, sendResponse) {
  if (!tabId) {
    sendResponse({ ok: false, error: "缺少 tabId" });
    return;
  }
  if (injectedTabs.has(tabId)) {
    sendResponse({ ok: true, cached: true });
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId, allFrames: false },
      world: "MAIN",
      files: ["page/pageHook.js"]
    },
    () => {
      const err = chrome.runtime.lastError;
      if (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
        return;
      }
      injectedTabs.add(tabId);
      sendResponse({ ok: true });
    }
  );
}

chrome.tabs.onRemoved.addListener((tabId) => injectedTabs.delete(tabId));

async function ensureOffscreenDocument() {
  try {
    if (!chrome.offscreen?.createDocument) return { ok: false, error: "当前浏览器不支持 offscreen API（或权限不足）。" };

    const has = await (async () => {
      if (typeof chrome.offscreen.hasDocument === "function") {
        try {
          const maybePromise = chrome.offscreen.hasDocument();
          if (maybePromise && typeof maybePromise.then === "function") return await maybePromise;
        } catch {}
        try {
          return await new Promise((resolve) => chrome.offscreen.hasDocument((v) => resolve(!!v)));
        } catch {}
      }
      // 兼容某些版本：用 runtime.getContexts 判断是否存在 offscreen 文档
      return await new Promise((resolve) => {
        if (typeof chrome.runtime.getContexts !== "function") return resolve(false);
        chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }, (ctx) => resolve(!!(ctx && ctx.length)));
      });
    })();

    if (has) return { ok: true };

    // 备注：offscreen reasons 必须是 Chrome 认可的枚举值；不要用不存在的 reason（会导致 createDocument 直接失败）。
    // 我们这里主要是“在后台页面里跑 Worker/WASM”，最稳的是用 IFRAME_SCRIPTING / DOM_PARSER 这类常见 reason。
    const reason =
      chrome.offscreen.Reason?.IFRAME_SCRIPTING ||
      chrome.offscreen.Reason?.DOM_PARSER ||
      chrome.offscreen.Reason?.BLOBS ||
      null;
    if (!reason) return { ok: false, error: "offscreen.Reason 枚举不可用（浏览器版本过旧或 API 不完整）。" };
    const req = {
      url: "offscreen/offscreen.html",
      reasons: [reason],
      justification: "在扩展后台跑 Cold Clear（WASM/Worker）计算，避免卡住游戏页面。"
    };
    try {
      const maybePromise = chrome.offscreen.createDocument(req);
      if (maybePromise && typeof maybePromise.then === "function") await maybePromise;
    } catch {
      await new Promise((resolve, reject) => {
        try {
          chrome.offscreen.createDocument(req, () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(String(err.message || err)));
            else resolve(true);
          });
        } catch (e) {
          reject(e);
        }
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || "offscreen 创建失败") };
  }
}

async function requestColdClearSuggestion(tabId, payload) {
  const r = await ensureOffscreenDocument();
  if (!r?.ok) return { ok: false, error: r?.error || "无法创建 offscreen 文档（原因未知）。" };

  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "TBP_OFFSCREEN_CC_SUGGEST", tabId, payload }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: String(err.message || err) });
      resolve(resp || null);
    });
  });
}

async function requestColdClearReset(tabId) {
  const r = await ensureOffscreenDocument();
  if (!r?.ok) return { ok: false, error: r?.error || "无法创建 offscreen 文档（原因未知）。" };

  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "TBP_OFFSCREEN_CC_RESET", tabId }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: String(err.message || err) });
      resolve(resp || null);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;
  if (msg.type === "TBP_INJECT_MAIN") {
    const tabId = sender?.tab?.id;
    injectMainWorld(tabId, sendResponse);
    return true;
  }

  if (msg.type === "TBP_CC_SUGGEST") {
    (async () => {
      const tabId = sender?.tab?.id;
      if (!tabId) return { ok: false, error: "缺少 tabId" };
      const payload = msg.payload || null;
      const resp = await requestColdClearSuggestion(tabId, payload);
      return resp || { ok: false, error: "cold-clear 无响应" };
    })()
      .then((resp) => sendResponse(resp))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "TBP_CC_RESET") {
    (async () => {
      const tabId = sender?.tab?.id;
      if (!tabId) return { ok: false, error: "缺少 tabId" };
      const resp = await requestColdClearReset(tabId);
      return resp || { ok: false, error: "cold-clear reset 无响应" };
    })()
      .then((resp) => sendResponse(resp))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

function parseTabId() {
  const u = new URL(location.href);
  const raw = u.searchParams.get("tabId");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

async function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => resolve(resp || null));
  });
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function getSamples() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ scaleSamples: [] }, (items) => resolve(Array.isArray(items.scaleSamples) ? items.scaleSamples : []));
  });
}

async function setSamples(samples) {
  return new Promise((resolve) => chrome.storage.local.set({ scaleSamples: samples }, () => resolve()));
}

function formatRect(r) {
  if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) return "-";
  return `x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`;
}

function summarizeSample(s) {
  if (!s) return "";
  const vp = s.viewport ? `${s.viewport.w}x${s.viewport.h}` : "-";
  const dpr = Number.isFinite(s.dpr) ? String(s.dpr) : "-";
  const locked = formatRect(s.boundsLockedRect);
  const base = formatRect(s.baseBounds);
  const used = formatRect(s.boundsUsed);
  const wr = s.boundsAdjust?.wr;
  const hr = s.boundsAdjust?.hr;
  const dxr = s.boundsAdjust?.dxr;
  const dyr = s.boundsAdjust?.dyr;
  return `窗口=${vp} dpr=${dpr}\nbase=${base}\nlocked=${locked}\nused=${used}\nadjust={wr=${wr} hr=${hr} dxr=${dxr} dyr=${dyr}}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const tabId = parseTabId();
  if (!tabId) {
    setText("meta", "缺少 tabId：请从扩展弹窗里打开本页面。");
    return;
  }

  setText("meta", `目标页面：tabId=${tabId}`);
  setText("hint", "建议：每次改完窗口大小后，都先点「开始校准」，保存后再点「记录当前样本」。");

  async function refreshStat() {
    const samples = await getSamples();
    setText("stat", `已记录样本：${samples.length} 条`);
    const last = samples[samples.length - 1] || null;
    setText("preview", last ? summarizeSample(last) : "（还没有样本）");
  }

  await refreshStat();

  document.getElementById("startCalib")?.addEventListener("click", async () => {
    const resp = await sendToTab(tabId, { type: "TBP_START_CALIBRATION" });
    if (!resp?.ok) {
      setText("hint", `无法开启校准：${resp?.error || "未知错误"}\n提示：先确保你已经进入一局游戏，并且弹窗里启用了叠加提示。`);
      return;
    }
    setText("hint", "已开启校准：请回到游戏页面拖动绿色框对齐棋盘，然后点“保存校准”。保存后再回来点「记录当前样本」。");
  });

  document.getElementById("record")?.addEventListener("click", async () => {
    const status = await sendToTab(tabId, { type: "TBP_GET_STATUS" });
    if (!status?.ok) {
      setText("hint", `记录失败：读不到状态：${status?.error || "未知错误"}`);
      return;
    }
    if (!status.connected || !status.hasState) {
      setText("hint", `记录失败：当前不在对局中/读不到状态：${status?.error || "未连接"}`);
      return;
    }

    const settings = await window.tbpSettings.getSettings();
    const sample = {
      ts: Date.now(),
      viewport: status.viewport || null,
      dpr: status.dpr || null,
      // 自动识别/用于画叠加层的 bounds
      baseBounds: status.baseBounds || null,
      boundsRaw: status.boundsRaw || null,
      boundsUsed: status.boundsUsed || null,
      boundsMode: status.boundsMode || null,
      boundsMeta: status.boundsMeta || null,
      // 用户校准信息（你想要的“缩小系数 + 偏移”其实都在这里）
      boundsAdjust: settings?.boundsAdjust || null,
      boundsLockedRect: settings?.boundsLockedRect || null,
      boundsLockBaseMode: settings?.boundsLockBaseMode || null
    };

    const samples = await getSamples();
    samples.push(sample);
    await setSamples(samples);

    setText("hint", "记录成功：已把这一条样本存起来了。继续改窗口大小 → 校准 → 记录即可。");
    await refreshStat();
  });

  document.getElementById("copy")?.addEventListener("click", async () => {
    const samples = await getSamples();
    const txt = safeJson({ scaleSamples: samples });
    const ok = await copyText(txt);
    setText("hint", ok ? "已复制到剪贴板：直接发给我就行。" : "复制失败：你可以手动全选下面的 JSON 复制。");
    setText("preview", txt);
  });

  document.getElementById("clear")?.addEventListener("click", async () => {
    await setSamples([]);
    setText("hint", "已清空样本。");
    await refreshStat();
  });
});


async function getActiveTetrioTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0] || null;
      if (!tab?.id || !tab?.url || !tab.url.startsWith("https://tetr.io/")) return resolve(null);
      resolve(tab);
    });
  });
}

async function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => resolve(resp || null));
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function bindToggle(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!value;
  el.addEventListener("change", () => onChange(!!el.checked));
}

function bindSelect(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.addEventListener("change", () => onChange(String(el.value)));
}

function bindRange(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(value);
  el.addEventListener("input", () => onChange(Number(el.value)));
}

function setHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.hidden = !!hidden;
}

function applyCalibToolsVisibility(isCalibMode) {
  // “校准/采样工具”只在校准/采样模式时显示（减少弹窗干扰）
  setHidden("calibrate", !isCalibMode);
  setHidden("openSamples", !isCalibMode);
}

document.addEventListener("DOMContentLoaded", async () => {
  const s = await window.tbpSettings.getSettings();

  bindToggle("enabled", s.enabled, (v) => window.tbpSettings.setSettings({ enabled: v }));
  bindToggle("useHold", s.useHold, (v) => window.tbpSettings.setSettings({ useHold: v }));
  bindSelect("modePreset", s.modePreset, (v) => window.tbpSettings.setSettings({ modePreset: v }));
  bindSelect("alignMode", s.boundsLock ? "calib" : "pixi", (v) => {
    const isCalibMode = String(v) === "calib";
    applyCalibToolsVisibility(isCalibMode);
    window.tbpSettings.setSettings({ boundsLock: isCalibMode });
  });
  bindRange("opacity", s.opacity, (v) => {
    setText("opacityVal", `当前透明度：${Math.round(v * 100)}%`);
    window.tbpSettings.setSettings({ opacity: v });
  });
  setText("opacityVal", `当前透明度：${Math.round(s.opacity * 100)}%`);

  applyCalibToolsVisibility(!!s.boundsLock);

  const tab = await getActiveTetrioTab();
  if (!tab) {
    setText("status", "请切到 tetr.io 页面");
  } else {
    const resp = await sendToTab(tab.id, { type: "TBP_GET_STATUS" });
    if (!resp?.ok) {
      setText("status", "未连接（扩展还没注入成功）");
    } else {
      const head = resp.connected ? "已连接（可提示）" : resp.error ? `未连接：${resp.error}` : "未连接（读不到状态）";
      const details = [
        resp.hasState ? "状态✅" : "状态❌",
        resp.hasBounds ? "定位✅" : "定位❌",
        resp.hasSuggestion ? `建议✅(${Number(resp.suggestionCells || 0)})` : "建议❌"
      ].join(" ");

      const parts = [];
      parts.push(`${head}\n${details}`);
      if (resp.connected && resp.error) parts.push(`提示：${resp.error}`);

      const basics = `current=${resp.current || "-"} hold=${resp.hold || "-"} next=${Number(resp.nextLen || 0)} board=${
        resp.boardH && resp.boardW ? `${resp.boardH}x${resp.boardW}` : "-"
      } buf=${resp.bufferRows ?? "-"} vis=${resp.visibleRows ?? "-"} 可Hold=${resp.canHold ? "是" : "否"} preset=${resp.modePreset || "-"}`;
      parts.push(basics);

      if (resp.engine) parts.push(`引擎=${resp.engine}`);
      try {
        const want = String(s?.engineMode || "cc2");
        // 没拿到 state 的时候，引擎其实还没跑起来；这时不要误导用户“本地服务没连上”。
        if (resp?.hasState) {
          if (want === "cc2" && resp.engine && resp.engine !== "cold-clear-2") {
            parts.push("提示：当前设置是“优先本地 CC2”，但没连上，所以用了 CC1 兜底。要用 CC2 请先启动 cc2-server。");
          }
          if (want === "misamino" && resp.engine && resp.engine !== "misamino") {
            parts.push("提示：当前设置是“优先本地 MisaMino”，但没连上，所以用了 CC1 兜底。要用 MisaMino 请先启动 misamino-server。");
          }
        }
      } catch {}
      if (resp.alignSource) parts.push(`对齐=${resp.alignSource}`);

      if (resp.boundsUsed && Number.isFinite(resp.boundsUsed.width) && Number.isFinite(resp.boundsUsed.height)) {
        parts.push(`定位=${Math.round(resp.boundsUsed.width)}x${Math.round(resp.boundsUsed.height)}（${resp.boundsMode || "?"}）`);
      }
      if (resp.boundsMeta?.object) {
        const m = resp.boundsMeta;
        const origin = `${m.object}/${m.mode || "-"}`;
        const src = m.source ? ` ${m.source}` : "";
        const scale = m.scaleX && m.scaleY ? ` scale=${m.scaleX}x${m.scaleY}` : "";
        const dpr = Number.isFinite(m.dpr) ? ` dpr=${m.dpr}` : "";
        const score = Number.isFinite(m.score) ? ` score=${m.score}` : "";
        parts.push(`来源=${origin}${src}${scale}${dpr}${score}`);
      }

      if (!resp.hasSuggestion && resp.engineDebug?.reason) {
        parts.push(`原因：${resp.engineDebug.reason}`);
        if (Number.isFinite(resp.engineDebug?.placements)) parts.push(`可落点数：${resp.engineDebug.placements}`);
      }
      // 没建议时，把 cold-clear 的状态提示给用户看（比“什么都没有”更好排查）。
      if (!resp.hasSuggestion && resp.coldClearError) {
        parts.push(`cold-clear：${resp.coldClearError}`);
        const cc = resp.coldClearDebug || null;
        if (cc?.movePiece) parts.push(`cc建议块：${cc.movePiece}`);
        if (cc?.moveSpin && cc.moveSpin !== "none") parts.push(`旋：${cc.moveSpin}`);
        if (Number.isFinite(cc?.moveIndex) && Number.isFinite(cc?.moveCount)) parts.push(`排行：${cc.moveIndex + 1}/${cc.moveCount}`);
        const q = Array.isArray(cc?.usedQueue) ? cc.usedQueue : Array.isArray(cc?.desiredQueue) ? cc.desiredQueue : null;
        if (Array.isArray(q) && q.length) parts.push(`喂给cc：${q.join(" ")}`);
        const mode = cc?.usedMode || cc?.desiredMode || null;
        if (mode) parts.push(`队列模式：${mode}`);
        if (cc?.syncType) parts.push(`同步方式：${cc.syncType}`);
        if (cc?.phase) parts.push(`阶段：${cc.phase}`);
        if (Number.isFinite(cc?.timeoutMs)) parts.push(`超时阈值：${cc.timeoutMs}ms`);
        if (cc?.workerCrashed) parts.push("worker：已崩溃（会自动重启）");
      }

      setText("status", parts.join("\n"));
    }
  }

  document.getElementById("openDetails")?.addEventListener("click", async () => {
    const tab2 = await getActiveTetrioTab();
    if (!tab2) {
      setText("status", "请先切到 tetr.io 页面");
      return;
    }
    const url = chrome.runtime.getURL(`ui/details.html?tabId=${tab2.id}`);
    chrome.tabs.create({ url });
  });

  document.getElementById("forceReset")?.addEventListener("click", async () => {
    const tab2 = await getActiveTetrioTab();
    if (!tab2) {
      setText("status", "请先切到 tetr.io 页面");
      return;
    }
    const resp = await sendToTab(tab2.id, { type: "TBP_FORCE_RESET" });
    if (!resp?.ok) {
      setText("status", `强制重置失败：${resp?.error || "未知错误"}`);
      return;
    }
    setText("status", "已强制重置：已清缓存并要求页面重新抓取状态。请回到游戏等 1-2 秒；不行就刷新页面。");
  });

  document.getElementById("openSamples")?.addEventListener("click", async () => {
    const url = chrome.runtime.getURL("ui/samples.html");
    chrome.tabs.create({ url });
  });

  document.getElementById("calibrate")?.addEventListener("click", async () => {
    const tab2 = await getActiveTetrioTab();
    if (!tab2) {
      setText("status", "请先切到 tetr.io 页面");
      return;
    }
    const resp = await sendToTab(tab2.id, { type: "TBP_START_CALIBRATION" });
    if (!resp?.ok) {
      setText("status", `无法开启校准：${resp?.error || "未知错误"}`);
      return;
    }
    setText("status", "已开启校准：请回到游戏页面拖动绿色框对齐棋盘，然后点“保存校准”。");
  });

  document.getElementById("openOptions")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

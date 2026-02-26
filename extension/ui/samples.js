function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
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
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    return false;
  }
}

async function getActiveTetrioTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0] || null;
      if (!tab?.id || !tab?.url || !tab.url.startsWith("https://tetr.io/")) return resolve(null);
      resolve(tab);
    });
  });
}

async function copyCurrentCalibration() {
  const cur = await window.tbpSettings.getSettings();
  const payload = {
    boundsAdjust: cur.boundsAdjust || null,
    boundsLock: !!cur.boundsLock,
    boundsLockBaseMode: cur.boundsLockBaseMode || null,
    boundsLockedRect: cur.boundsLockedRect || null,
    boundsLockedViewport: cur.boundsLockedViewport || null
  };
  return await copyText(JSON.stringify(payload));
}

function fmtTime(ts) {
  try {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return new Date(n).toLocaleString();
  } catch {
    return "-";
  }
}

function fmtViewport(vp) {
  const w = Number(vp?.w);
  const h = Number(vp?.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "-";
  return `${w}x${h}`;
}

function fmtNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return String(Number(x.toFixed(6)));
}

function ensureBoundsAdjust(s) {
  if (!s || typeof s !== "object") return { dxr: 0, dyr: 0, wr: 1, hr: 1 };
  const a = s.boundsAdjust;
  if (!a || typeof a !== "object") return { dxr: 0, dyr: 0, wr: 1, hr: 1 };
  return {
    dxr: Number.isFinite(Number(a.dxr)) ? Number(a.dxr) : 0,
    dyr: Number.isFinite(Number(a.dyr)) ? Number(a.dyr) : 0,
    wr: Number.isFinite(Number(a.wr)) ? Number(a.wr) : 1,
    hr: Number.isFinite(Number(a.hr)) ? Number(a.hr) : 1
  };
}

async function loadSamples() {
  const s = await window.tbpSettings.getSettings();
  return Array.isArray(s.scaleSamples) ? s.scaleSamples.slice() : [];
}

async function saveSamples(list) {
  await window.tbpSettings.setSettings({ scaleSamples: Array.isArray(list) ? list : [] });
}

function renderList(list, onUpdate) {
  const root = document.getElementById("list");
  if (!root) return;
  root.textContent = "";

  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sample muted";
    empty.textContent = "（还没有样本）";
    root.appendChild(empty);
    return;
  }

  list.forEach((sample, index) => {
    const s = sample && typeof sample === "object" ? sample : {};
    const adj = ensureBoundsAdjust(s);

    const card = document.createElement("div");
    card.className = "sample";

    const top = document.createElement("div");
    top.className = "sampleTop";

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !s.disabled;
    const tspan = document.createElement("span");
    tspan.textContent = s.disabled ? "已禁用" : "启用";
    toggle.appendChild(chk);
    toggle.appendChild(tspan);

    const meta = document.createElement("div");
    meta.className = "sampleMeta";
    const mode = s.boundsLockBaseMode ? String(s.boundsLockBaseMode) : "-";
    const dpr = Number.isFinite(Number(s.dpr)) ? String(s.dpr) : "-";
    meta.textContent = `#${index + 1}  窗口=${fmtViewport(s.viewport)}  dpr=${dpr}  baseMode=${mode}\n时间=${fmtTime(s.ts)}`;

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn danger";
    btnDel.textContent = "删除";

    top.appendChild(toggle);
    top.appendChild(meta);
    top.appendChild(btnDel);

    const fields = document.createElement("div");
    fields.className = "fields";

    const makeNumField = (label, key) => {
      const wrap = document.createElement("label");
      wrap.className = "field";
      const title = document.createElement("div");
      title.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.000001";
      input.value = fmtNum(adj[key]);
      wrap.appendChild(title);
      wrap.appendChild(input);
      return { wrap, input };
    };

    const fDxr = makeNumField("dxr（横向偏移比例）", "dxr");
    const fDyr = makeNumField("dyr（纵向偏移比例）", "dyr");
    const fWr = makeNumField("wr（宽度比例）", "wr");
    const fHr = makeNumField("hr（高度比例）", "hr");

    for (const f of [fDxr, fDyr, fWr, fHr]) fields.appendChild(f.wrap);

    const actions = document.createElement("div");
    actions.className = "sampleActions";
    const btnApply = document.createElement("button");
    btnApply.type = "button";
    btnApply.className = "btn";
    btnApply.textContent = "应用修改";
    actions.appendChild(btnApply);

    function applyEdits() {
      const next = { ...(s || {}) };
      const nextAdj = { ...(next.boundsAdjust || {}) };
      const readNum = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      nextAdj.dxr = readNum(fDxr.input.value, adj.dxr);
      nextAdj.dyr = readNum(fDyr.input.value, adj.dyr);
      nextAdj.wr = readNum(fWr.input.value, adj.wr);
      nextAdj.hr = readNum(fHr.input.value, adj.hr);
      next.boundsAdjust = nextAdj;
      onUpdate(index, next);
    }

    chk.addEventListener("change", () => {
      const next = { ...(s || {}) };
      next.disabled = !chk.checked;
      tspan.textContent = next.disabled ? "已禁用" : "启用";
      onUpdate(index, next);
    });

    btnApply.addEventListener("click", () => applyEdits());
    btnDel.addEventListener("click", () => onUpdate(index, null, { remove: true }));

    card.appendChild(top);
    card.appendChild(fields);
    card.appendChild(actions);
    root.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const status = (msg) => setText("status", msg);
  const jsonEl = document.getElementById("json");

  let samples = await loadSamples();
  const render = () => renderList(samples, onUpdate);

  const onUpdate = async (index, next, opt) => {
    const remove = !!opt?.remove;
    const list = samples.slice();
    if (remove) list.splice(index, 1);
    else list[index] = next;
    samples = list.filter((x) => x !== null && x !== undefined);
    await saveSamples(samples);
    status(`已保存：当前样本=${samples.length} 条`);
    render();
  };

  status(`当前样本：${samples.length} 条`);
  render();

  document.getElementById("copyCalib")?.addEventListener("click", async () => {
    const ok = await copyCurrentCalibration();
    status(ok ? "已复制：校准参数已放到剪贴板。" : "复制失败：你可以手动从 chrome.storage.local 导出 boundsAdjust/boundsLockedRect。");
  });

  document.getElementById("openScaleLab")?.addEventListener("click", async () => {
    const tab = await getActiveTetrioTab();
    if (!tab) {
      status("请先切到 tetr.io 标签页（并进入对局）。");
      return;
    }
    const url = chrome.runtime.getURL(`ui/scaleLab.html?tabId=${tab.id}`);
    chrome.tabs.create({ url });
  });

  document.getElementById("export")?.addEventListener("click", async () => {
    const txt = safeJson({ scaleSamples: samples });
    if (jsonEl) jsonEl.value = txt;
    const ok = await copyText(txt);
    status(ok ? `已复制：样本=${samples.length} 条` : "复制失败：你可以手动全选下面的 JSON 复制。");
  });

  document.getElementById("import")?.addEventListener("click", async () => {
    const raw = String(jsonEl?.value || "").trim();
    if (!raw) {
      status("导入失败：请先在下面粘贴 JSON。");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.scaleSamples) ? parsed.scaleSamples : null;
      if (!Array.isArray(list)) {
        status("导入失败：JSON 格式不对（需要数组，或 { scaleSamples: [...] }）。");
        return;
      }
      samples = list;
      await saveSamples(samples);
      status(`导入成功：当前样本=${samples.length} 条`);
      render();
    } catch (e) {
      status(`导入失败：JSON 解析错误：${e?.message || e}`);
    }
  });

  document.getElementById("clearAll")?.addEventListener("click", async () => {
    if (!confirm("确定要清空全部样本吗？这个操作不可撤回（除非你先导出）。")) return;
    samples = [];
    await saveSamples(samples);
    if (jsonEl) jsonEl.value = "";
    status("已清空：当前样本=0 条");
    render();
  });
});

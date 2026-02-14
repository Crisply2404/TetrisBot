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

function bind(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = !!value;
    el.addEventListener("change", () => onChange(!!el.checked));
    return;
  }
  el.value = String(value ?? "");
  el.addEventListener("change", () => onChange(el.type === "number" ? Number(el.value) : String(el.value)));
}

document.addEventListener("DOMContentLoaded", async () => {
  const s = await window.tbpSettings.getSettings();

  bind("enabled", s.enabled, (v) => window.tbpSettings.setSettings({ enabled: v }));
  bind("engineMode", s.engineMode, (v) => window.tbpSettings.setSettings({ engineMode: v }));

  const cc2BaseUrlEl = document.getElementById("cc2BaseUrl");
  if (cc2BaseUrlEl) {
    cc2BaseUrlEl.value = String(s.cc2BaseUrl || "");
    cc2BaseUrlEl.addEventListener("change", () => {
      const raw = String(cc2BaseUrlEl.value || "").trim();
      const url = raw.replace(/\/+$/, "");
      cc2BaseUrlEl.value = url;
      window.tbpSettings.setSettings({ cc2BaseUrl: url });
    });
  }

  bind("cc2TimeoutMs", s.cc2TimeoutMs, (v) => window.tbpSettings.setSettings({ cc2TimeoutMs: v }));

  const toggleKeyEl = document.getElementById("toggleKey");
  if (toggleKeyEl) {
    toggleKeyEl.value = String(s.toggleKey || "");
    toggleKeyEl.addEventListener("change", () => {
      const raw = String(toggleKeyEl.value || "").trim();
      const key = raw ? raw[0].toUpperCase() : "";
      toggleKeyEl.value = key;
      window.tbpSettings.setSettings({ toggleKey: key });
    });
  }

  bind("useHold", s.useHold, (v) => window.tbpSettings.setSettings({ useHold: v }));
  bind("modePreset", s.modePreset, (v) => window.tbpSettings.setSettings({ modePreset: v }));
  bind("allowedSpins", s.allowedSpins, (v) => window.tbpSettings.setSettings({ allowedSpins: v }));
  bind("pickStrategy", s.pickStrategy, (v) => window.tbpSettings.setSettings({ pickStrategy: v }));
  bind("opacity", s.opacity, (v) => window.tbpSettings.setSettings({ opacity: v }));
  bind("readFullBag", s.readFullBag, (v) => window.tbpSettings.setSettings({ readFullBag: v }));
  bind("debug", s.debug, (v) => window.tbpSettings.setSettings({ debug: v }));
});

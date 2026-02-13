// Cold Clear internal worker entrypoint (spawned by the bot itself).
// It calls the wasm export `_web_worker_entry_point(self)`.

class AudioContext {}

importScripts("./cc_tbp.js");

const { _web_worker_entry_point } = wasm_bindgen;

async function run() {
  try {
    await wasm_bindgen("./cc_tbp_bg.wasm");
    _web_worker_entry_point(self);
  } catch (e) {
    try {
      const msg = String(e?.message || e || "wasm init failed");
      self.postMessage({ type: "error", reason: `cc 内部 worker 初始化失败：${msg}` });
    } catch {}
    throw e;
  }
}

run();

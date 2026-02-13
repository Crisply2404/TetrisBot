// TBP-facing worker for Cold Clear (v1).
// Loads cc_tbp.wasm and starts the TBP event loop (rules/start/suggest/...).

// shim to work around wasm-bindgen expecting AudioContext/webkitAudioContext in some environments.
class AudioContext {}

importScripts("./cc_tbp.js");

async function run() {
  try {
    await wasm_bindgen("./cc_tbp_bg.wasm");
    wasm_bindgen.start();
    // 让前端确认“worker 已启动且已安装 message listener”，避免 rules/start 太早发过去被吞导致一直等 ready。
    self.postMessage({ type: "tbp_boot" });
  } catch (e) {
    try {
      const msg = String(e?.message || e || "wasm init failed");
      // 让前端能看到原因（否则只会超时）
      self.postMessage({ type: "error", reason: `wasm 初始化失败：${msg}` });
    } catch {}
    throw e;
  }
}

run();

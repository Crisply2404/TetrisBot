// Cold Clear internal worker entrypoint (fallback).
// Some environments may resolve the "worker.js" path differently; providing a copy at extension root
// makes Cold Clear's hardcoded "worker.js" URI more reliable.
//
// This worker is spawned by Cold Clear (v1) itself (not TBP-facing).
// It calls the wasm export `_web_worker_entry_point(self)`.

class AudioContext {}

importScripts("./vendor/cc-tbp/cc_tbp.js");

const { _web_worker_entry_point } = wasm_bindgen;

async function run() {
  await wasm_bindgen("./vendor/cc-tbp/cc_tbp_bg.wasm");
  _web_worker_entry_point(self);
}

run();


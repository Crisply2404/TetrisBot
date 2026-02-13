declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */

    export function _web_worker_entry_point(scope: DedicatedWorkerGlobalScope): void;

    export function start(): void;

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly start: () => void;
    readonly _web_worker_entry_point: (a: any) => void;
    readonly wasm_bindgen__closure__destroy__h4224c9dec36db372: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hc360253914ee995d: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hde2e2f88e624946b: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__ha8c0cfacf2592045: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h842f0afff47334ff: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h9c36679ec7138465: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

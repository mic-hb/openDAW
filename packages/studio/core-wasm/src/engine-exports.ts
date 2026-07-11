// The engine wasm module's export surface, shared by every host that instantiates it (the wasm app's own
// worklet, the offline perf renderer, and the studio's wasm engine processor).
//
// Stub: with the Rust toolchain unavailable, no actual wasm module is loaded.
// The type is declared as `unknown` so callers can pass any value while TS
// still validates shape, and `readPanicMessage` returns an empty string.

export type EngineExports = Record<string, unknown>

export const readPanicMessage = (_exports: EngineExports, _memory: WebAssembly.Memory): string => ""

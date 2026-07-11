// Stub for environments without the Rust/WASM toolchain.
//
// The real `WasmEngine` mounts an `EngineVariant` so the studio boots the
// Rust-backed AudioWorklet instead of the built-in TypeScript engine. We do
// not perform any install here; `EngineVariant.current()` therefore returns
// null and `EngineWorklet` falls back to the TS `engine-processor` registered
// by `@opendaw/studio-core-processors`. Exports, mixdowns, recording and
// playback all work via that fallback.

export type WasmEngineUrls = {
    processorUrl: string
    offlineWorkerUrl: string
    wasmUrl: string
}

export namespace WasmEngine {
    export const isEnabled = (): boolean => false
    export const setEnabled = (_: boolean): void => {}
    export const isReady = (): boolean => false
    export const useForExports = (): boolean => false
    export const ensureReady = async (_: AudioContext): Promise<boolean> => false
    export const install = (_: WasmEngineUrls): void => {}
}

// Stub of WASM-engine boot. With the Rust toolchain unavailable we never
// instantiate the engine; `instantiateWasmEngine` rejects and callers fall
// back to the TypeScript engine. `describeEngineTrap` returns the original
// error unchanged; `drainResourceRequests` is a no-op since there is no
// engine to drain resources from.
import {Procedure, tryCatch} from "@opendaw/lib-std"
import type {EngineToClient} from "@opendaw/studio-adapters"
import type {EngineExports} from "./engine-exports"

export type WasmEngineModules = {
    engineModule: WebAssembly.Module
    deviceModules: ReadonlyArray<WebAssembly.Module>
    deviceBoxTypes: ReadonlyArray<string>
    composites: ReadonlyArray<unknown>
}

export const describeEngineTrap = (_engine: EngineExports, _memory: WebAssembly.Memory, error: unknown): unknown => {
    const attempt = tryCatch(() => null as unknown as string)
    if (attempt.status === "failure") {return error}
    return error
}

export const instantiateWasmEngine = (_modules: WasmEngineModules, _memory: WebAssembly.Memory,
                                      _sampleRate: number, _engineToClient: EngineToClient): Promise<EngineExports> =>
    Promise.reject(new Error("WASM engine disabled (stub)"))

export const drainResourceRequests = (_engine: EngineExports, _memory: WebAssembly.Memory,
                                      _engineToClient: EngineToClient, _pending: Set<Promise<unknown>>,
                                      _fallbackSampleRate: number, _onError: Procedure<unknown>): void => {
    // no-op
}

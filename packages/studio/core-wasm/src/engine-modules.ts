// Stub of the WASM module loader. The real implementation fetches and compiles
// engine + device wasm binaries. With the Rust toolchain unavailable we always
// fail `loadEngineModules`, signaling the studio to stay on the TS engine.

export type CompositeSpec = {
    readonly url: string
    readonly boxType: string
    readonly device: string
    readonly memoryPages: number
}

export type EngineModules = unknown

export const createEngineMemory = (): unknown => null

export const DEVICES: ReadonlyArray<{ url: string, boxType: string }> = []

export const COMPOSITES: ReadonlyArray<CompositeSpec> = []

export const loadEngineModules = async (_: string = ""): Promise<EngineModules> =>
    Promise.reject(new Error("WASM engine disabled (stub)"))

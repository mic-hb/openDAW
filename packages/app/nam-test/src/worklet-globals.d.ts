// Ambient declarations for AudioWorklet globals — `lib: ["DOM"]` doesn't include them.
// Used by AudioWorkletProcessor implementations (registerProcessor etc.).
interface AudioWorkletNode {
    port: MessagePort
}

declare const currentFrame: number
declare const currentTime: number
declare const sampleRate: number

declare class AudioWorkletProcessor {
    readonly port: MessagePort
    constructor(options?: AudioWorkletNodeOptions)
    process(inputs: Float32Array[][],
            outputs: Float32Array[][],
            parameters: Record<string, Float32Array>): boolean
}

declare function registerProcessor(
    name: string,
    processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void

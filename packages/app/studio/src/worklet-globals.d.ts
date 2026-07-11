// Global declarations for the AudioWorklet runtime. Code under
// `src/ui/pages/code-editor/examples/` is meant to be evaluated in a
// sandboxed worklet context, where `sampleRate` is provided by
// AudioWorkletGlobalScope. The main-thread `tsc` build does not know
// about that global; declaring it here lets those files type-check.
declare const sampleRate: number;
declare const currentTime: number;
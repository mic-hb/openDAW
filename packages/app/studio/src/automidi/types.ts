export type Mode = "continuation" | "infilling" | "variation"

export type GenerationStatus =
    | "idle"
    | "selecting-mode"
    | "awaiting-region"
    | "configuring-parameters"
    | "queued"
    | "generating"
    | "completed"
    | "failed"
    | "cancelled"

export interface NoteShape {
    pitch: number
    startTime: number
    duration: number
    velocity: number
    trackId?: string
}

export interface Variation {
    id: string
    notes: ReadonlyArray<NoteShape>
    confidence: number
    confidenceLevel: "high" | "medium" | "low" | "none"
}

export interface GenerationRegion {
    trackId: string
    startBar: number
    endBar: number
    beatsPerBar: number
    highestPitch: number
    /** IDs of tracks used as model context (input) */
    contextTrackIds: ReadonlyArray<string>
    /** IDs of tracks that will receive new notes (output) */
    targetTrackIds: ReadonlyArray<string>
    /** Whether the region was drawn on the timeline or inside a piano roll event */
    source: "timeline" | "piano-roll"
}

export interface TrackGmOverride {
    midiProgram?: number
    midiIsDrum?: boolean
}

export interface GenerationParameters {
    topP: number
    temperature: number
    numVariations: number
    modelSize: "small" | "medium" | "large"
}

export interface LoraCheckpointInfo {
    id: string
    label: string
    shortLabel: string
    rank: number
    alpha: number
    dataset: string
    trainingSteps: number
}

export interface LoraStatus {
    supported: boolean
    reason?: string | null
    available: ReadonlyArray<LoraCheckpointInfo>
    active: string | null
}
export interface TelemetryResponse {
    status: string
    model_loaded: boolean
    model_name: string | null
    device: string | null
    gpu_allocated_mb: number | null
    gpu_total_mb: number | null
    gpu_utilization_pct: number | null
    gpu_compute_pct: number | null
    queue_size: number
}

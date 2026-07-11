import {Optional, tryCatch} from "@opendaw/lib-std"
import {AUTOMIDI_API_BASE} from "./config"
import {
    LoraStatusSchema,
    MidiImportResponseSchema,
    TaskStatusSchema,
    type LoraStatus,
    type MidiImportResponse,
    type TaskStatus,
} from "./schema"
import type {Mode, TelemetryResponse} from "./types"

export interface GenerationContextTrack {
    id: string
    name: string
    instrument: string
    midiProgram: number
    midiIsDrum: boolean
}

export interface GenerationContextNote {
    pitch: number
    velocity: number
    startTime: number
    duration: number
    trackId: string
}

export interface GenerationContext {
    bpm: number
    timeSignature: {beats: number; noteValue: number}
    tracks: ReadonlyArray<GenerationContextTrack>
    notes: ReadonlyArray<GenerationContextNote>
}

export interface GenerationRequest {
    trackId: string
    region: {trackId: string; startBar: number; endBar: number}
    parameters: {
        engine: "amt"
        mode: Mode
        temperature: number
        numVariations: number
        amt: {
            generationMode: Mode
            topP: number
            temperature: number
            numVariations: number
            loraId: string | null
        }
        context: GenerationContext
        contextTrackIds: ReadonlyArray<string>
        targetTrackIds: ReadonlyArray<string>
        trackGmOverrides: Optional<Record<string, {midiProgram?: number; midiIsDrum?: boolean}>>
    }
}

const modeToBackend = (mode: Mode): "continue" | "infill" | "vary" => {
    switch (mode) {
        case "continuation": return "continue"
        case "infilling": return "infill"
        case "variation": return "vary"
    }
}

export class AutomidiApi {
    readonly #fetchImpl: typeof fetch

    constructor(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
        this.#fetchImpl = fetchImpl
    }

    async requestGeneration(req: GenerationRequest): Promise<{taskId: string; status: string}> {
        const backendReq = {
            ...req,
            parameters: {
                ...req.parameters,
                amt: {
                    ...req.parameters.amt,
                    generationMode: modeToBackend(req.parameters.amt.generationMode),
                },
            },
        }
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/generations`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(backendReq),
        })
        if (!response.ok) {
            throw new Error(`Generation request failed: ${response.status} ${response.statusText}`)
        }
        const json = await response.json()
        return (json.data ?? json) as {taskId: string; status: string}
    }

    async pollTaskStatus(taskId: string): Promise<TaskStatus> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/generations/${taskId}`)
        if (!response.ok) {
            throw new Error(`Poll failed: ${response.status}`)
        }
        const json = await response.json()
        return TaskStatusSchema.parse(json.data ?? json)
    }

    async cancelGeneration(taskId: string): Promise<void> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/generations/${taskId}`, {method: "DELETE"})
        if (!response.ok) {
            throw new Error(`Cancel failed: ${response.status}`)
        }
    }

    async cancelAllTasks(): Promise<void> {
        await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/generations/cancel-all`, {method: "POST"})
    }

    async getLoraStatus(): Promise<LoraStatus> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/lora-checkpoint/status`)
        if (!response.ok) {
            throw new Error(`LoRA status failed: ${response.status}`)
        }
        const json = await response.json()
        return LoraStatusSchema.parse(json.data ?? json)
    }

    async setLora(id: string | null): Promise<void> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/lora-checkpoint`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({id}),
        })
        if (!response.ok) {
            throw new Error(`Set LoRA failed: ${response.status}`)
        }
    }

    async getTelemetry(): Promise<TelemetryResponse> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/telemetry`)
        if (!response.ok) {
            throw new Error(`Failed to fetch telemetry: ${response.status}`)
        }
        return await response.json()
    }

    async loadModel(): Promise<void> {
        await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/telemetry/model/load`, {method: "POST"})
    }

    async unloadModel(): Promise<void> {
        await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/telemetry/model/unload`, {method: "POST"})
    }

    async reloadModel(): Promise<void> {
        await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/telemetry/model/reload`, {method: "POST"})
    }

    async importMidi(file: File): Promise<MidiImportResponse> {
        const form = new FormData()
        form.append("file", file)
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/midi/import`, {
            method: "POST",
            body: form,
        })
        if (!response.ok) {
            throw new Error(`MIDI import failed: ${response.status}`)
        }
        const json = await response.json()
        return MidiImportResponseSchema.parse(json.data ?? json)
    }

    async exportMidi(payload: unknown): Promise<Blob> {
        const response = await this.#fetchImpl(`${AUTOMIDI_API_BASE()}/midi/export`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(payload),
        })
        if (!response.ok) {
            throw new Error(`MIDI export failed: ${response.status}`)
        }
        return await response.blob()
    }
}

export const tryRequestGeneration = (api: AutomidiApi, req: GenerationRequest) =>
    tryCatch(() => api.requestGeneration(req))

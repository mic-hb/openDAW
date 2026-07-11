import {Attempts, RuntimeNotifier} from "@opendaw/lib-std"
import {AutomidiApi} from "./AutomidiApi"
import type {MidiImportResponse} from "./schema"
import {getGmProgram} from "@opendaw/studio-enums"

export interface ImportEditPlanTrack {
    name: string
    program: number
    isDrum: boolean
    notes: ReadonlyArray<{pitch: number; startBeats: number; durationBeats: number; velocity: number}>
}

export interface ImportEditPlan {
    bpm: number
    timeSignatureBeats: number
    timeSignatureNoteValue: number
    tracks: ReadonlyArray<ImportEditPlanTrack>
}

const detectInstrumentName = (isDrum: boolean, program: number): string | undefined => {
    if (isDrum) {return "Drum Kit"}
    return getGmProgram(program)?.name
}

export class MidiImportService {
    constructor(private readonly api: AutomidiApi) {}

    buildEditPlan(response: MidiImportResponse): ImportEditPlan {
        return {
            bpm: response.bpm,
            timeSignatureBeats: response.timeSignatureBeats,
            timeSignatureNoteValue: response.timeSignatureNoteValue,
            tracks: response.tracks.map(track => {
                const detectedName = detectInstrumentName(track.isDrum, track.program)
                return {
                    name: detectedName ?? track.name,
                    program: track.program,
                    isDrum: track.isDrum,
                    notes: track.notes.map(note => ({
                        pitch: note.pitch,
                        startBeats: note.startBeats,
                        durationBeats: note.durationBeats,
                        velocity: note.velocity,
                    })),
                }
            }),
        }
    }

    async importMidi(file: File): Promise<ImportEditPlan> {
        const result = await Attempts.async(this.api.importMidi(file))
        if (result.isFailure()) {
            const message = String(result.failureReason())
            RuntimeNotifier.info({headline: "Import failed", message})
            throw new Error(`Import failed: ${message}`)
        }
        const plan = this.buildEditPlan(result.result())
        RuntimeNotifier.info({headline: "Imported", message: `${plan.tracks.length} tracks`})
        return plan
    }
}

import {Attempts, Nullable} from "@opendaw/lib-std"
import {MidiFile} from "@opendaw/lib-midi"
import {AutomidiApi} from "./AutomidiApi"

export interface MidiExportTrack {
    name: string
    program: number
    isDrum: boolean
    notes: Array<{pitch: number; startBeats: number; durationBeats: number; velocity: number}>
}

export interface MidiExportRequest {
    bpm: number
    timeSignatureBeats: number
    timeSignatureNoteValue: number
    filename: string
    tracks: ReadonlyArray<MidiExportTrack>
}

export interface ProjectSnapshot {
    bpm: Nullable<number>
    name: Nullable<string>
    timeSignature: Nullable<{numerator: number; denominator: number}>
}

const fallbackBlob = (): Blob => {
    const source: ArrayBufferLike = MidiFile.encoder().encode().toArrayBuffer()
    const copy = source instanceof ArrayBuffer ? source.slice(0) : new ArrayBuffer(0)
    return new Blob([copy], {type: "audio/midi"})
}

export class MidiExportService {
    constructor(private readonly project: ProjectSnapshot) {}

    buildRequest(): MidiExportRequest {
        return {
            bpm: this.project.bpm ?? 120,
            timeSignatureBeats: this.project.timeSignature?.numerator ?? 4,
            timeSignatureNoteValue: this.project.timeSignature?.denominator ?? 4,
            filename: this.project.name ?? "untitled",
            tracks: [],
        }
    }

    async exportMidi(api: AutomidiApi): Promise<Blob> {
        const request = this.buildRequest()
        const result = await Attempts.async(api.exportMidi(request))
        return result.match<Blob>({
            ok: (value) => value,
            err: () => fallbackBlob(),
        })
    }
}

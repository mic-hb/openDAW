import {asInstanceOf, isInstanceOf, Nullable, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioUnitBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox, TimelineBox} from "@opendaw/studio-boxes"
import {Project} from "@opendaw/studio-core"
import {AudioUnitBoxAdapter, TrackType} from "@opendaw/studio-adapters"

export interface ContextTrack {
    id: string
    name: string
    instrument: string
    midiProgram: number
    midiIsDrum: boolean
}

export interface ContextNote {
    pitch: number
    velocity: number
    /** Start time in beats (relative to the project's beat 0). */
    startTime: number
    /** Duration in beats. */
    duration: number
    trackId: string
}

export interface GenerationContextPayload {
    bpm: number
    timeSignature: {beats: number; noteValue: number}
    tracks: ReadonlyArray<ContextTrack>
    notes: ReadonlyArray<ContextNote>
}

const FALLBACK_BPM = 120
const FALLBACK_BEATS = 4
const FALLBACK_NOTE_VALUE = 4

const ppqnToBeats = (ppqnValue: number, bpm: number): number => {
    if (bpm <= 0) {return ppqnValue / PPQN.Quarter}
    const seconds = (ppqnValue / PPQN.Quarter) * (60.0 / bpm)
    return seconds * (bpm / 60.0)
}

const velocityFromUnit = (unit: number): number =>
    Math.max(1, Math.min(127, Math.round(unit * 127)))

const instrumentNameForType = (type: TrackType): string => {
    switch (type) {
        case TrackType.Notes: return "Notes"
        case TrackType.Audio: return "Audio"
        case TrackType.Value: return "Automation"
        default: return "Unknown"
    }
}

const isDrumProgram = (program: number): boolean => program >= 128

export class GenerationContextBuilder {
    constructor(private readonly project: Nullable<Project>) {}

    buildContext(): Nullable<GenerationContextPayload> {
        if (!this.project) {return null}
        const project = this.project
        const timelineBox = asInstanceOf(
            project.rootBox.timeline.targetVertex.unwrap("TimelineBox not found").box,
            TimelineBox
        )

        const bpm = timelineBox.bpm.getValue() || FALLBACK_BPM
        const timeSignature = {
            beats: timelineBox.signature.nominator.getValue() || FALLBACK_BEATS,
            noteValue: timelineBox.signature.denominator.getValue() || FALLBACK_NOTE_VALUE,
        }

        const tracks: ContextTrack[] = []
        const notes: ContextNote[] = []

        for (const auPtr of project.rootBox.audioUnits.pointerHub.incoming()) {
            if (!isInstanceOf(auPtr.box, AudioUnitBox)) {continue}
            const auBox = auPtr.box
            const auAdapter = project.boxAdapters.adapterFor(auBox, AudioUnitBoxAdapter)
            const auName = auAdapter.input.label.unwrapOrElse("Unnamed")

            for (const tPtr of auBox.tracks.pointerHub.incoming()) {
                if (!isInstanceOf(tPtr.box, TrackBox)) {continue}
                const tb = tPtr.box as TrackBox
                const trackId = UUID.toString(tb.address.uuid)
                const trackType = tb.type.getValue()
                const rawProgram = tb.instrument.getValue()
                const drum = isDrumProgram(rawProgram)
                const contextTrack: ContextTrack = {
                    id: trackId,
                    name: auName,
                    instrument: instrumentNameForType(trackType),
                    midiProgram: drum ? Math.max(0, rawProgram - 128) : rawProgram,
                    midiIsDrum: drum,
                }
                tracks.push(contextTrack)

                if (trackType !== TrackType.Notes) {continue}
                for (const regionPtr of tb.regions.pointerHub.incoming()) {
                    if (!isInstanceOf(regionPtr.box, NoteRegionBox)) {continue}
                    const regionBox = regionPtr.box as NoteRegionBox
                    const regionPosition = regionBox.position.getValue()
                    const collectionVertex = regionBox.events.targetVertex
                    if (collectionVertex.isEmpty()) {continue}
                    if (!isInstanceOf(collectionVertex.unwrap().box, NoteEventCollectionBox)) {continue}
                    const collection = collectionVertex.unwrap().box as NoteEventCollectionBox
                    for (const notePtr of collection.events.pointerHub.incoming()) {
                        if (!isInstanceOf(notePtr.box, NoteEventBox)) {continue}
                        const noteBox = notePtr.box as NoteEventBox
                        const absolutePpqn = regionPosition + noteBox.position.getValue()
                        const durationPpqn = noteBox.duration.getValue()
                        notes.push({
                            pitch: noteBox.pitch.getValue(),
                            velocity: velocityFromUnit(noteBox.velocity.getValue()),
                            startTime: ppqnToBeats(absolutePpqn, bpm),
                            duration: ppqnToBeats(durationPpqn, bpm),
                            trackId,
                        })
                    }
                }
            }
        }

        return {bpm, timeSignature, tracks, notes}
    }
}

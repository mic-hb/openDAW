import {StudioPreferences} from "@opendaw/studio-core"
import {ImportEditPlanTrack} from "./MidiImportService"
import {AudioUnitBoxAdapter, InstrumentFactories, TrackBoxAdapter} from "@opendaw/studio-adapters"
import {IconSymbol} from "@opendaw/studio-enums"
import {PPQN} from "@opendaw/lib-dsp"
import {Option} from "@opendaw/lib-std"
import {Address} from "@opendaw/lib-box"
import {StudioService} from "@/service/StudioService"
import {AudioUnitBox, SoundfontDeviceBox} from "@opendaw/studio-boxes"


export class MidiAuditionPlayer {
    private previewAudioUnits: AudioUnitBox[] = []

    constructor(private readonly service: StudioService) {}

    getPreviewAudioUnitAddress(trackIndex: number): Option<Address> {
        const box = this.previewAudioUnits.find(u => (u as any)._previewTrackIndex === trackIndex)
        return box ? Option.wrap(box.address) : Option.None
    }

    getPreviewAudioUnits(): ReadonlyArray<AudioUnitBox> {return this.previewAudioUnits}

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /** Find the best soundfont to use: preference UUID → Arachno by name → first available */
    private findSoundfont(): {uuid: string, name: string} | undefined {
        const settings = StudioPreferences.settings["midi-import"]
        const prefUuid = settings["default-soundfont-uuid"]

        const localSf = this.service.soundfontService.local.unwrapOrNull() ?? []
        const remoteSf = this.service.soundfontService.remote.unwrapOrNull() ?? []
        const allSf = [...localSf, ...remoteSf]

        if (prefUuid) {
            const found = allSf.find(sf => sf.uuid === prefUuid)
            // If the UUID is stored in prefs but not in the list, still use it (trust the user)
            return found ? {uuid: found.uuid, name: found.name} : {uuid: prefUuid, name: "Soundfont"}
        }

        // Fall back: look for Arachno by name
        const arachno = allSf.find(sf => sf.name.toLowerCase().includes("arachno"))
        if (arachno) return {uuid: arachno.uuid, name: arachno.name}

        // Last resort: first available soundfont
        if (allSf.length > 0) return {uuid: allSf[0].uuid, name: allSf[0].name}

        return undefined
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Called once the MIDI file is parsed.
     * Creates an AudioUnit for EVERY track so the engine has them all ready.
     * All tracks start un-soloed (normal playback of all tracks).
     */
    setupPreview(tracks: ImportEditPlanTrack[], volumes?: Map<number, number>): void {
        this.cleanup()
        this.createPreview(tracks, volumes)
    }

    private createPreview(tracks: ImportEditPlanTrack[], volumes?: Map<number, number>): void {
        const sf = this.findSoundfont()
        const attachment = sf ? {uuid: sf.uuid, name: sf.name} : undefined
        const project = this.service.project
        console.log(`[MidiAuditionPlayer] Creating temporary tracks for preview: ${tracks.length} track(s)`)
        project.editing.modify(() => {
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i]
                if (this.previewAudioUnits.find(u => (u as any)._previewTrackIndex === i)) continue
                const {audioUnitBox, trackBox, instrumentBox} = project.api.createInstrument(
                    InstrumentFactories.Soundfont,
                    {name: `[Preview] ${track.name || "Track"}`, icon: IconSymbol.SoundFont, attachment: attachment as any}
                )
                const soundfontBox = instrumentBox as unknown as SoundfontDeviceBox
                const presetIndex = track.isDrum ? 128 : track.program
                soundfontBox.presetIndex.setValue(presetIndex)
                const trackAdapter = project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter)
                if (trackAdapter && "targetName" in trackAdapter) {
                    (trackAdapter as any).targetName = `[Preview] ${track.name || "Track"}`
                }
                this.previewAudioUnits.push(audioUnitBox)
                ;(audioUnitBox as any)._previewTrackIndex = i
                const dbValue = volumes?.get(i) ?? 0.0
                if (dbValue !== 0.0) {
                    const auAdapter = project.boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter)
                    auAdapter.namedParameter.volume.setUnitValue(auAdapter.namedParameter.volume.valueMapping.x(dbValue))
                }
                if (track.notes.length > 0) {
                    const lastNote = track.notes[track.notes.length - 1]
                    const totalDuration = (lastNote.startBeats + lastNote.durationBeats) * PPQN.Quarter
                    const regionBox = project.api.createNoteRegion({
                        trackBox, position: 0, duration: totalDuration, name: track.name || "Preview"
                    })
                    for (const note of track.notes) {
                        project.api.createNoteEvent({
                            owner: regionBox,
                            position: note.startBeats * PPQN.Quarter,
                            duration: note.durationBeats * PPQN.Quarter,
                            pitch: note.pitch,
                            velocity: note.velocity / 127.0
                        })
                    }
                }
            }
        })
    }

    /**
     * Create temporary tracks for the requested indices and play them.
     * Optional volumes map (trackIndex → dB) is applied on creation.
     */
    playTracks(tracksToPlay: {index: number, track: ImportEditPlanTrack}[],
               volumes?: Map<number, number>): void {
        this.createPreview(tracksToPlay.map(t => t.track), volumes)
        if (!this.service.project.engine.isPlaying.getValue()) {
            this.service.project.engine.play()
        }
    }

    /** Update the volume of a preview track in real-time (dB). No-op if track not currently playing. */
    updateTrackVolume(trackIndex: number, dbValue: number): void {
        const audioUnitBox = this.previewAudioUnits.find(u => (u as any)._previewTrackIndex === trackIndex)
        if (!audioUnitBox) return
        this.service.project.editing.modify(() => {
            const auAdapter = this.service.project.boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter)
            auAdapter.namedParameter.volume.setUnitValue(auAdapter.namedParameter.volume.valueMapping.x(dbValue))
        })
    }

    /** Update the soundfont preset on a specific preview track dynamically */
    updateTrackProgram(trackIndex: number, program: number, isDrum: boolean): void {
        const audioUnitBox = this.previewAudioUnits.find(u => (u as any)._previewTrackIndex === trackIndex)
        if (!audioUnitBox) return // This track is not currently playing

        this.service.project.editing.modify(() => {
            // Find the soundfont instrument attached to this track
            const incoming = audioUnitBox.input.pointerHub.incoming().at(0)
            const instrumentBox = incoming ? incoming.box as SoundfontDeviceBox : null
            
            if (instrumentBox && instrumentBox.presetIndex) {
                const presetIndex = isDrum ? 128 : program
                instrumentBox.presetIndex.setValue(presetIndex)
                console.log(`[MidiAuditionPlayer] Updated live track ${trackIndex} to program=${program}, isDrum=${isDrum}, presetIndex=${presetIndex}`)
            }
        })
    }

    /**
     * Solo a single track for audition, unsolo all others.
     * Pass -1 or undefined to unsolo everything (play all).
     */
    soloTrack(trackIndex: number): void {
        if (this.previewAudioUnits.length === 0) return

        const project = this.service.project
        project.editing.modify(() => {
            this.previewAudioUnits.forEach((box, i) => {
                box.solo.setValue(i === trackIndex)
            })
        })
        console.log(`[MidiAuditionPlayer] Soloed track index=${trackIndex}`)
    }

    /** Remove solo from all preview tracks (play all together). */
    unsoloAll(): void {
        if (this.previewAudioUnits.length === 0) return

        const project = this.service.project
        project.editing.modify(() => {
            for (const box of this.previewAudioUnits) {
                box.solo.setValue(false)
            }
        })
        console.log("[MidiAuditionPlayer] Unsoloed all preview tracks")
    }

    /** Start engine playback — equivalent to pressing Space. */
    play(): void {
        this.service.project.engine.play()
    }

    /** Stop engine playback and remove the temporary track. */
    stop(): void {
        this.cleanup()
    }

    /** Remove all preview AudioUnits from the project and stop playback. */
    cleanup(): void {
        if (this.previewAudioUnits.length === 0) return

        // Stop engine before deleting tracks to avoid "could not remove" errors
        this.service.project.engine.stop()

        const project = this.service.project
        const toDelete = [...this.previewAudioUnits]
        this.previewAudioUnits = []

        project.editing.modify(() => {
            for (const box of toDelete) {
                try {
                    project.api.deleteAudioUnit(box)
                } catch (e) {
                    console.warn("[MidiAuditionPlayer] Failed to delete preview AudioUnit:", e)
                }
            }
        })

        console.log("[MidiAuditionPlayer] Cleaned up", toDelete.length, "preview AudioUnits")
    }
}

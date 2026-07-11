import {DefaultObservableValue, isAbsent, isDefined, isInstanceOf, Nullable, Option, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioUnitBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {ColorCodes, TrackType} from "@opendaw/studio-adapters"
import {Project} from "@opendaw/studio-core"
import {
    POLL_INTERVAL_MS,
    POLL_MAX_RETRIES,
    POLL_RETRY_DELAY_MS,
} from "./config"
import type {
    GenerationParameters,
    GenerationRegion,
    GenerationStatus,
    LoraStatus,
    Mode,
    TrackGmOverride,
    Variation,
} from "./types"
import {AutomidiApi} from "./AutomidiApi"
import {GenerationContextBuilder} from "./GenerationContextBuilder"

const DEFAULT_PARAMETERS: GenerationParameters = {
    topP: 0.95,
    temperature: 1.0,
    numVariations: 3,
    modelSize: "small",
}

interface ValueObservable<T> {
    getValue(): T
    setValue(value: T): void
    subscribe(observer: (value: T) => void): Terminable
}

const wrapObservable = <T>(inner: DefaultObservableValue<T>): ValueObservable<T> => ({
    getValue: () => inner.getValue(),
    setValue: (value) => inner.setValue(value),
    subscribe: (observer) => inner.catchupAndSubscribe(() => observer(inner.getValue()))
})

interface OriginalNoteSnapshot {
    pitch: number
    position: number
    duration: number
    velocity: number
}

export class AutomidiController implements Terminable {
    readonly #terminator = new Terminator()
    #pollHandle: Nullable<ReturnType<typeof setTimeout>> = null
    #attempts: number = 0
    #cancelled: boolean = false
    /** UUIDs of the NoteEventBox instances created by the most recent
     * previewVariation. Cleared after accept (the notes are now real) or
     * dismiss (the notes are removed). */
    #previewNoteUuids: UUID.Bytes[] = []
    /** TrackId -> snapshot of the original notes that were deleted from the
     * existing region when the preview started. Used to restore them on
     * dismiss (and discarded on accept). */
    #originalNotesSnapshot: Map<string, OriginalNoteSnapshot[]> = new Map()

    readonly #status = new DefaultObservableValue<GenerationStatus>("idle")
    readonly #mode = new DefaultObservableValue<Nullable<Mode>>(null)
    readonly #parameters = new DefaultObservableValue<GenerationParameters>(DEFAULT_PARAMETERS)
    readonly #trackGmOverrides = new DefaultObservableValue<Map<string, TrackGmOverride>>(new Map())
    readonly #region = new DefaultObservableValue<Nullable<GenerationRegion>>(null)
    readonly #taskId = new DefaultObservableValue<Nullable<string>>(null)
    readonly #variations = new DefaultObservableValue<ReadonlyArray<Variation>>([])
    readonly #selectedVariationIndex = new DefaultObservableValue<number>(0)
    readonly #progress = new DefaultObservableValue<number>(0)
    readonly #currentVariationProgress = new DefaultObservableValue<number>(0)
    readonly #currentVariationIndex = new DefaultObservableValue<number>(0)
    readonly #totalVariations = new DefaultObservableValue<number>(0)
    readonly #error = new DefaultObservableValue<Nullable<string>>(null)
    readonly #feedback = new DefaultObservableValue<Nullable<string>>(null)
    readonly #loraStatus = new DefaultObservableValue<Nullable<LoraStatus>>(null)
    readonly #loraActiveId = new DefaultObservableValue<Nullable<string>>(null)
    readonly #regionRect = new DefaultObservableValue<Nullable<{startUnit: number; endUnit: number}>>(null)
    /** Context (input) track IDs set in parameter dialog */
    readonly #contextTrackIds = new DefaultObservableValue<ReadonlyArray<string>>([])
    readonly #targetTrackIds = new DefaultObservableValue<ReadonlyArray<string>>([])
    readonly #isIntegrationMenuOpen = new DefaultObservableValue<boolean>(false)

    readonly status: ValueObservable<GenerationStatus> = wrapObservable(this.#status)
    readonly mode: ValueObservable<Nullable<Mode>> = wrapObservable(this.#mode)
    readonly parameters: ValueObservable<GenerationParameters> = wrapObservable(this.#parameters)
    readonly trackGmOverrides: ValueObservable<Map<string, TrackGmOverride>> = wrapObservable(this.#trackGmOverrides)
    readonly region: ValueObservable<Nullable<GenerationRegion>> = wrapObservable(this.#region)
    readonly taskId: ValueObservable<Nullable<string>> = wrapObservable(this.#taskId)
    readonly currentTaskId = this.taskId
    readonly variations: ValueObservable<ReadonlyArray<Variation>> = wrapObservable(this.#variations)
    readonly selectedVariationIndex: ValueObservable<number> = wrapObservable(this.#selectedVariationIndex)
    readonly progress: ValueObservable<number> = wrapObservable(this.#progress)
    readonly currentVariationProgress: ValueObservable<number> = wrapObservable(this.#currentVariationProgress)
    readonly currentVariationIndex: ValueObservable<number> = wrapObservable(this.#currentVariationIndex)
    readonly totalVariations: ValueObservable<number> = wrapObservable(this.#totalVariations)
    readonly error: ValueObservable<Nullable<string>> = wrapObservable(this.#error)
    readonly feedback: ValueObservable<Nullable<string>> = wrapObservable(this.#feedback)
    readonly contextTrackIds: ValueObservable<ReadonlyArray<string>> = wrapObservable(this.#contextTrackIds)
    readonly targetTrackIds: ValueObservable<ReadonlyArray<string>> = wrapObservable(this.#targetTrackIds)
    readonly isIntegrationMenuOpen: ValueObservable<boolean> = wrapObservable(this.#isIntegrationMenuOpen)

    readonly lora = {
        status: wrapObservable(this.#loraStatus),
        activeId: wrapObservable(this.#loraActiveId),
        refresh: async (): Promise<void> => {
            const result = await Option.async(this.api.getLoraStatus())
            if (result.isEmpty()) {return}
            const status = result.unwrap()
            this.#loraStatus.setValue(status)
            this.#loraActiveId.setValue(status.active)
        },
        select: async (id: Nullable<string>): Promise<void> => {
            const previous = this.#loraActiveId.getValue()
            this.#loraActiveId.setValue(id)
            try {
                await this.api.setLora(id)
            } catch (e) {
                this.#loraActiveId.setValue(previous)
                throw e
            }
        },
    }

    readonly regionRect: ValueObservable<Nullable<{startUnit: number; endUnit: number}>> = wrapObservable(this.#regionRect)

    setRegionRect(rect: Nullable<{startUnit: number; endUnit: number}>): void {
        this.#regionRect.setValue(rect)
    }

    constructor(public readonly api: AutomidiApi, public project: Nullable<Project> = null) {
        Object.defineProperty(this, "#variations", {
            value: this.variations,
            writable: false,
            enumerable: false,
            configurable: false
        })
    }

    /** Step 1: User clicks Generate → show mode selector */
    toggleIntegrationMenu() {
        this.#isIntegrationMenuOpen.setValue(!this.#isIntegrationMenuOpen.getValue())
    }

    openDialog(): void {
        const status = this.#status.getValue()
        if (status === "idle" || status === "failed" || status === "cancelled") {
            this.#status.setValue("selecting-mode")
        }
    }

    /** Step 2: User selects a mode → move to awaiting region */
    selectMode(mode: Mode): void {
        if (this.#status.getValue() !== "selecting-mode") {return}
        this.#mode.setValue(mode)
        this.#status.setValue("awaiting-region")
    }

    /** Legacy compat: kept for tests / old callers */
    setMode(mode: Mode): void {
        this.#mode.setValue(mode)
    }

    /** Triggered by timeline/piano-roll drag: move to parameter configuration */
    requestRegionDraw(): void {
        // no-op: region draw is now triggered immediately after selectMode()
        // This method is kept for test compatibility.
    }

    closeDialog(): void {
        const status = this.#status.getValue()
        if (
            status === "selecting-mode" ||
            status === "configuring-parameters" ||
            status === "completed" ||
            status === "failed" ||
            status === "cancelled"
        ) {
            this.#status.setValue("idle")
            this.#region.setValue(null)
            this.#variations.setValue([])
            this.#regionRect.setValue(null)
        }
    }

    setParam<K extends keyof GenerationParameters>(key: K, value: GenerationParameters[K]): void {
        this.#parameters.setValue({...this.#parameters.getValue(), [key]: value})
    }

    setContextTrackIds(ids: ReadonlyArray<string>): void {
        this.#contextTrackIds.setValue(ids)
    }

    setTargetTrackIds(ids: ReadonlyArray<string>): void {
        this.#targetTrackIds.setValue(ids)
    }

    setTrackGmProgram(trackId: string, program: number | undefined): void {
        const overrides = new Map(this.#trackGmOverrides.getValue())
        const existing = overrides.get(trackId) ?? {}
        overrides.set(trackId, {...existing, midiProgram: program})
        this.#trackGmOverrides.setValue(overrides)
    }

    setTrackMidiIsDrum(trackId: string, isDrum: boolean): void {
        const overrides = new Map(this.#trackGmOverrides.getValue())
        const existing = overrides.get(trackId) ?? {}
        overrides.set(trackId, {...existing, midiIsDrum: isDrum})
        this.#trackGmOverrides.setValue(overrides)
    }

    get duplicatePrograms(): ReadonlyArray<{program: number; trackNames: string[]}> {
        const byProgram = new Map<number, string[]>()
        for (const [trackId, override] of this.#trackGmOverrides.getValue()) {
            if (override.midiIsDrum) {continue}
            if (override.midiProgram === undefined) {continue}
            const list = byProgram.get(override.midiProgram) ?? []
            list.push(trackId)
            byProgram.set(override.midiProgram, list)
        }
        const dups: Array<{program: number; trackNames: string[]}> = []
        for (const [program, trackNames] of byProgram) {
            if (trackNames.length > 1) dups.push({program, trackNames})
        }
        return dups
    }

    /** Step 3: User commits a region (from either timeline or piano-roll drag) */
    async regionCommitted(region: GenerationRegion): Promise<void> {
        if (this.#status.getValue() !== "awaiting-region") {return}
        this.#region.setValue(region)
        // Pre-populate context/target track selections based on region
        this.#contextTrackIds.setValue(region.contextTrackIds)
        this.#targetTrackIds.setValue(region.targetTrackIds)
        this.#status.setValue("configuring-parameters")
    }

    /** Step 4: User clicks Generate in the parameter dialog */
    async commitParametersAndGenerate(): Promise<void> {
        if (this.#status.getValue() !== "configuring-parameters") {return}
        const region = this.#region.getValue()
        if (isAbsent(region)) {return}
        this.#status.setValue("queued")
        this.#cancelled = false

        const contextTrackIds = this.#contextTrackIds.getValue()
        const targetTrackIds = this.#targetTrackIds.getValue()
        const mode = this.#mode.getValue() ?? "continuation"
        const params = this.#parameters.getValue()
        const loraId = this.#loraActiveId.getValue()

        const contextBuilder = new GenerationContextBuilder(this.project)
        const builtContext = contextBuilder.buildContext()
        const contextPayload = builtContext ?? {
            bpm: 120,
            timeSignature: {beats: 4, noteValue: 4},
            tracks: [],
            notes: [],
        }

        const result = await Option.async(this.api.requestGeneration({
            trackId: region.trackId,
            region: {trackId: region.trackId, startBar: region.startBar, endBar: region.endBar},
            parameters: {
                engine: "amt",
                mode,
                temperature: params.temperature,
                numVariations: params.numVariations,
                amt: {
                    generationMode: mode,
                    topP: params.topP,
                    temperature: params.temperature,
                    numVariations: params.numVariations,
                    loraId,
                },
                context: contextPayload,
                contextTrackIds: contextTrackIds.length > 0 ? contextTrackIds : [region.trackId],
                targetTrackIds: targetTrackIds.length > 0 ? targetTrackIds : [region.trackId],
                trackGmOverrides: Object.fromEntries(this.#trackGmOverrides.getValue()),
            },
        }))
        if (result.isEmpty()) {
            this.#error.setValue("Generation request failed")
            this.#status.setValue("failed")
            return
        }
        this.#taskId.setValue(result.unwrap().taskId)
        this.#attempts = 0
        this.#startPoll()
    }

    async cancel(): Promise<void> {
        const id = this.#taskId.getValue()
        this.#cancelled = true
        this.#stopPoll()
        if (isDefined(id)) {
            await Option.async(this.api.cancelGeneration(id))
            this.#status.setValue("cancelled")
            this.#regionRect.setValue(null)
        } else {
            // Cancel before a task was submitted — just abort the configuration.
            this.#status.setValue("idle")
            this.#region.setValue(null)
            this.#variations.setValue([])
            this.#regionRect.setValue(null)
        }
    }

    selectVariation(idx: number): void {
        this.#selectedVariationIndex.setValue(idx)
        this.showPreviewNotes(idx)
    }

    acceptVariation(): void {
        // If a preview is active, the variation notes are already in the
        // project graph inside the existing region — just stop transport
        // and clear the preview tracking so #removePreview becomes a no-op
        // when #resetToIdle is called next.
        if (this.#previewNoteUuids.length > 0) {
            this.stopTransport()
            const project = this.project
            if (project !== null) {
                project.editing.modify(() => {
                    for (const uuid of this.#previewNoteUuids) {
                        project.boxGraph.findBox<NoteEventBox>(uuid).ifSome(eventBox => {
                            eventBox.isGhost.setValue(false)
                        })
                    }
                })
            }
            this.#previewNoteUuids = []
            this.#originalNotesSnapshot = new Map()
        } else {
            // No preview was active (e.g. user opened variations but never
            // played one). Fall back to writing the variation directly.
            const variation = this.#variations.getValue()[this.#selectedVariationIndex.getValue()]
            const region = this.#region.getValue()
            const project = this.project
            if (isAbsent(variation) || isAbsent(region) || isAbsent(project)) {
                this.#resetToIdle()
                return
            }
            this.#writeVariationIntoExistingRegions(variation, region, project)
            // Immediately clear the ghost flag for the newly written notes
            project.editing.modify(() => {
                for (const uuid of this.#previewNoteUuids) {
                    project.boxGraph.findBox<NoteEventBox>(uuid).ifSome(eventBox => {
                        eventBox.isGhost.setValue(false)
                    })
                }
            })
            this.#previewNoteUuids = []
            this.#originalNotesSnapshot = new Map()
            this.stopTransport()
            // Drop the snapshots so resetToIdle doesn't try to restore them
            this.#originalNotesSnapshot = new Map()
            this.#previewNoteUuids = []
        }
        this.#resetToIdle()
    }

    /** Preview a variation by inserting its notes INSIDE the existing
     * NoteRegionBox of each target track (replacing any notes that were
     * already there), then starting playback from the region start. The
     * original notes are snapshotted so they can be restored on dismiss. */
    previewVariation(idx: number): void {
        this.selectVariation(idx)
        const region = this.#region.getValue()
        const project = this.project
        if (isAbsent(region) || isAbsent(project)) {return}

        // Start playback from the region start
        const startPpqn = region.startBar * region.beatsPerBar * PPQN.Quarter
        this.stopTransport()
        project.engine.setPosition(startPpqn)
        if (!project.engine.isPlaying.getValue()) {
            project.engine.play()
        }
    }

    /** Insert the variation notes into the project to be previewed visually
     * by the timeline renderer. Original notes in the region are snapshotted. */
    showPreviewNotes(idx: number): void {
        const variation = this.#variations.getValue()[idx]
        const region = this.#region.getValue()
        const project = this.project
        if (isAbsent(variation) || isAbsent(region) || isAbsent(project)) {return}

        // Remove any existing preview first (restores originals).
        this.#removePreview(project)
        // Write the variation into the project (finds existing regions,
        // snapshots+deletes their notes in the generation area, then adds
        // the variation notes into the same region's event collection).
        this.#writeVariationIntoExistingRegions(variation, region, project)
    }

    /** Stop preview playback: remove the ghost notes and restore the
     * original notes that were snapshotted at preview-time. */
    stopPreview(): void {
        const project = this.project
        if (isAbsent(project)) {return}
        this.stopTransport()
        this.#removePreview(project)
    }

    private stopTransport(): void {
        const project = this.project
        if (isAbsent(project)) {return}
        if (project.engine.isPlaying.getValue()) {
            project.engine.stop()
        }
    }

    /** For each target track, locate the existing NoteRegionBox that
     * overlaps the generation area. Snapshot its notes in that area
     * (so we can restore on dismiss), delete them, and add the variation
     * notes into the same NoteEventCollectionBox. If no existing region
     * covers the area, create a new one. The created note UUIDs are stored
     * in #previewNoteUuids for later cleanup. */
    #writeVariationIntoExistingRegions(
        variation: Variation,
        region: GenerationRegion,
        project: Project
    ): void {
        const startPpqn = region.startBar * region.beatsPerBar * PPQN.Quarter
        const endPpqn = region.endBar * region.beatsPerBar * PPQN.Quarter
        const targetTrackIds = region.targetTrackIds.length > 0 ? region.targetTrackIds : [region.trackId]
        const newPreviewNoteUuids: UUID.Bytes[] = []
        const snapshotPerTrack = new Map<string, OriginalNoteSnapshot[]>()

        for (const tId of targetTrackIds) {
            const trackBox = this.#findTrackByUuid(project, tId)
            if (isAbsent(trackBox)) {
                console.warn(`AutomidiController: track ${tId} not found`)
                continue
            }

            const notesForTrack = variation.notes.filter(n =>
                n.trackId === undefined || n.trackId === tId ||
                (variation.notes.every(nn => nn.trackId === undefined) && tId === (targetTrackIds[0] ?? tId))
            )
            if (notesForTrack.length === 0) {continue}

            const trackSnapshot: OriginalNoteSnapshot[] = []
            const trackNewUuids: UUID.Bytes[] = []

            // 1) Find the existing region that overlaps the generation area,
            //    2) snapshot+delete its notes in that area,
            //    3) add the variation notes to the same collection.
            //    If no region exists, create a fresh one.
            const foundRegion = this.#findOverlappingRegion(trackBox, startPpqn, endPpqn)
            if (foundRegion !== null) {
                const {regionBox, collection} = foundRegion
                const rPos = regionBox.position.getValue()
                project.editing.modify(() => {
                    // Snapshot + delete originals in the generation area
                    for (const notePointer of collection.events.pointerHub.incoming()) {
                        if (!isInstanceOf(notePointer.box, NoteEventBox)) {continue}
                        const noteBox = notePointer.box as NoteEventBox
                        const noteAbsPos = rPos + noteBox.position.getValue()
                        if (noteAbsPos >= startPpqn && noteAbsPos < endPpqn) {
                            trackSnapshot.push({
                                pitch: noteBox.pitch.getValue(),
                                position: noteBox.position.getValue(),
                                duration: noteBox.duration.getValue(),
                                velocity: noteBox.velocity.getValue()
                            })
                            noteBox.delete()
                        }
                    }
                    
                    // Add variation notes
                    const sanitizedNotes = []
                    for (const note of notesForTrack) {
                        const rawAbsStart = Math.round(note.startTime * region.beatsPerBar * PPQN.Quarter)
                        const rawDuration = Math.round(note.duration * PPQN.Quarter)
                        if (rawAbsStart + rawDuration <= startPpqn || rawAbsStart >= endPpqn) { continue }
                        const clampedAbsStart = Math.max(startPpqn, rawAbsStart)
                        const clampedAbsEnd = Math.min(endPpqn, rawAbsStart + rawDuration)
                        const clampedDuration = Math.max(1, clampedAbsEnd - clampedAbsStart)
                        sanitizedNotes.push({ ...note, absStart: clampedAbsStart, absDuration: clampedDuration })
                    }

                    for (const note of sanitizedNotes) {
                        const noteAbsStart = note.absStart
                        const noteDuration = note.absDuration
                        const positionInRegion = noteAbsStart - rPos + regionBox.eventOffset.getValue()
                        const noteUuid = UUID.generate()
                        NoteEventBox.create(project.boxGraph, noteUuid, box => {
                            box.position.setValue(Math.max(0, positionInRegion))
                            box.duration.setValue(noteDuration)
                            box.pitch.setValue(note.pitch)
                            box.velocity.setValue(note.velocity / 127.0)
                            box.chance.setValue(100)
                            box.playCount.setValue(1)
                            box.cent.setValue(0)
                            box.isGhost.setValue(true)
                            box.events.refer(collection.events)
                        })
                        trackNewUuids.push(noteUuid)
                    }
                }, false)
            } else {
                // No existing region — create one
                const durationPpqn = Math.max(1, endPpqn - startPpqn)
                const regionUuid = UUID.generate()
                const collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate())
                project.editing.modify(() => {
                    NoteRegionBox.create(project.boxGraph, regionUuid, box => {
                        box.regions.refer(trackBox.regions)
                        box.events.refer(collection.owners)
                        box.position.setValue(startPpqn)
                        box.duration.setValue(durationPpqn)
                        box.loopOffset.setValue(0)
                        box.loopDuration.setValue(durationPpqn)
                        box.eventOffset.setValue(0)
                        box.hue.setValue(ColorCodes.forTrackType(TrackType.Notes))
                        box.label.setValue("Generated")
                    })
                    
                    const sanitizedNotes = []
                    for (const note of notesForTrack) {
                        const rawAbsStart = Math.round(note.startTime * region.beatsPerBar * PPQN.Quarter)
                        const rawDuration = Math.round(note.duration * PPQN.Quarter)
                        if (rawAbsStart + rawDuration <= startPpqn || rawAbsStart >= endPpqn) { continue }
                        const clampedAbsStart = Math.max(startPpqn, rawAbsStart)
                        const clampedAbsEnd = Math.min(endPpqn, rawAbsStart + rawDuration)
                        const clampedDuration = Math.max(1, clampedAbsEnd - clampedAbsStart)
                        sanitizedNotes.push({ ...note, absStart: clampedAbsStart, absDuration: clampedDuration })
                    }

                    for (const note of sanitizedNotes) {
                        const noteAbsStart = note.absStart
                        const noteDuration = note.absDuration
                        const positionInRegion = noteAbsStart - startPpqn // New region starts at startPpqn, no offset initially
                        const noteUuid = UUID.generate()
                        NoteEventBox.create(project.boxGraph, noteUuid, box => {
                            box.position.setValue(Math.max(0, positionInRegion))
                            box.duration.setValue(noteDuration)
                            box.pitch.setValue(note.pitch)
                            box.velocity.setValue(note.velocity / 127.0)
                            box.chance.setValue(100)
                            box.playCount.setValue(1)
                            box.cent.setValue(0)
                            box.events.refer(collection.events)
                        })
                        trackNewUuids.push(noteUuid)
                    }
                }, false)
            }

            snapshotPerTrack.set(tId, trackSnapshot)
            newPreviewNoteUuids.push(...trackNewUuids)
        }

        this.#originalNotesSnapshot = snapshotPerTrack
        this.#previewNoteUuids = newPreviewNoteUuids
    }

    /** Find the first NoteRegionBox on the given track whose [position, complete)
     *  range overlaps [startPpqn, endPpqn). Returns the region + its event
     *  collection, or null. */
    #findOverlappingRegion(
        trackBox: TrackBox,
        startPpqn: number,
        endPpqn: number
    ): {regionBox: NoteRegionBox; collection: NoteEventCollectionBox} | null {
        for (const regionPointer of trackBox.regions.pointerHub.incoming()) {
            if (!isInstanceOf(regionPointer.box, NoteRegionBox)) {continue}
            const regionBox = regionPointer.box as NoteRegionBox
            const rPos = regionBox.position.getValue()
            const rEnd = rPos + regionBox.duration.getValue()
            if (rEnd > startPpqn && rPos < endPpqn) {
                const collectionVertex = regionBox.events.targetVertex
                if (collectionVertex.nonEmpty()
                    && isInstanceOf(collectionVertex.unwrap().box, NoteEventCollectionBox)) {
                    const collection = collectionVertex.unwrap().box as NoteEventCollectionBox
                    return {regionBox, collection}
                }
            }
        }
        return null
    }

    /** Remove the ghost notes and restore the snapshotted originals. */
    #removePreview(project: Project): void {
        if (this.#previewNoteUuids.length === 0 && this.#originalNotesSnapshot.size === 0) {return}

        // 1) Delete ghost notes
        const ghostUuids = this.#previewNoteUuids
        // 2) Snapshot of original notes (for restoration)
        const originals = this.#originalNotesSnapshot
        this.#previewNoteUuids = []
        this.#originalNotesSnapshot = new Map()

        if (ghostUuids.length === 0 && originals.size === 0) {return}

        project.editing.modify(() => {
            for (const uuid of ghostUuids) {
                const box = project.boxGraph.findBox(uuid)
                if (box.nonEmpty() && isInstanceOf(box.unwrap(), NoteEventBox)) {
                    box.unwrap().delete()
                }
            }
            // Restore originals
            for (const [tId, snaps] of originals) {
                const trackBox = this.#findTrackByUuid(project, tId)
                if (isAbsent(trackBox)) {continue}
                const found = this.#findOverlappingRegion(trackBox,
                    (this.#region.getValue()?.beatsPerBar ?? 4) * PPQN.Quarter * (this.#region.getValue()?.startBar ?? 0),
                    (this.#region.getValue()?.beatsPerBar ?? 4) * PPQN.Quarter * (this.#region.getValue()?.endBar ?? 0))
                if (found === null) {continue}
                const {collection} = found
                for (const snap of snaps) {
                    NoteEventBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(snap.position)
                        box.duration.setValue(snap.duration)
                        box.pitch.setValue(snap.pitch)
                        box.velocity.setValue(snap.velocity)
                        box.events.refer(collection.events)
                    })
                }
            }
        }, false)
    }

    #findTrackByUuid(project: Project, trackId: string): Nullable<TrackBox> {
        const trackUuid = UUID.parse(trackId)
        for (const pointer of project.rootBox.audioUnits.pointerHub.incoming()) {
            if (!isInstanceOf(pointer.box, AudioUnitBox)) {continue}
            for (const trackPointer of pointer.box.tracks.pointerHub.incoming()) {
                if (!isInstanceOf(trackPointer.box, TrackBox)) {continue}
                if (UUID.equals(trackPointer.box.address.uuid, trackUuid)) {return trackPointer.box}
            }
        }
        return null
    }

    rejectVariation(): void {
        const project = this.project
        if (!isAbsent(project)) {this.#removePreview(project)}
        this.stopTransport()
        this.#resetToIdle()
    }

    /** Re-run a finished generation without re-selecting the mode or re-drawing
     * the region. Keeps the existing region and re-opens the parameter dialog. */
    retryGeneration(): void {
        if (isAbsent(this.#region.getValue())) {return}
        const project = this.project
        if (!isAbsent(project)) {this.#removePreview(project)}
        this.stopTransport()
        this.#variations.setValue([])
        this.#error.setValue(null)
        this.#status.setValue("configuring-parameters")
    }

    terminate(): void {
        this.#stopPoll()
        this.#terminator.terminate()
    }

    #startPoll(): void {
        const tick = async (): Promise<void> => {
            if (this.#cancelled) {return}
            const id = this.#taskId.getValue()
            if (isAbsent(id)) {return}
            const result = await Option.async(this.api.pollTaskStatus(id))
            if (this.#cancelled) {return}
            if (result.isEmpty()) {
                this.#attempts += 1
                if (this.#attempts >= POLL_MAX_RETRIES) {
                    this.#error.setValue("Polling failed")
                    this.#status.setValue("failed")
                    return
                }
                this.#pollHandle = setTimeout(tick, POLL_RETRY_DELAY_MS)
                return
            }
            this.#attempts = 0
            const status = result.unwrap()
            if (status.progress != null) this.#progress.setValue(status.progress)
            if (status.currentVariationIndex != null) this.#currentVariationIndex.setValue(status.currentVariationIndex)
            if (status.currentVariationProgress != null) this.#currentVariationProgress.setValue(status.currentVariationProgress)
            if (status.totalVariations != null) this.#totalVariations.setValue(status.totalVariations)
            if (status.status === "completed" && status.result) {
                this.#variations.setValue(status.result.variations)
                this.#status.setValue("completed")
                if (this.#selectedVariationIndex.getValue() === -1) {
                    this.showPreviewNotes(0)
                    this.#selectedVariationIndex.setValue(0)
                }
                this.#stopPoll()
                return
            }
            if (status.status === "failed") {
                this.#error.setValue(status.error ?? "Generation failed")
                this.#status.setValue("failed")
                this.#stopPoll()
                return
            }
            if (status.status === "cancelled") {
                this.#status.setValue("cancelled")
                this.#stopPoll()
                return
            }
            if (status.status === "processing" && this.#status.getValue() !== "generating") {
                this.#status.setValue("generating")
            }
            if (status.status === "processing" && status.result?.variations) {
                const oldLen = this.#variations.getValue().length
                const newLen = status.result.variations.length
                if (newLen > oldLen) {
                    this.#variations.setValue(status.result.variations)
                    if (oldLen === 0 && this.#selectedVariationIndex.getValue() === -1) {
                        this.showPreviewNotes(0)
                        this.#selectedVariationIndex.setValue(0)
                    }
                }
            }
            this.#pollHandle = setTimeout(tick, POLL_INTERVAL_MS)
        }
        this.#pollHandle = setTimeout(tick, POLL_INTERVAL_MS)
    }

    #stopPoll(): void {
        if (isDefined(this.#pollHandle)) {
            clearTimeout(this.#pollHandle)
            this.#pollHandle = null
        }
    }

    #resetToIdle(): void {
        const project = this.project
        if (!isAbsent(project)) {this.#removePreview(project)}
        this.stopTransport()
        this.#status.setValue("idle")
        this.#region.setValue(null)
        this.#variations.setValue([])
        this.#taskId.setValue(null)
        this.#contextTrackIds.setValue([])
        this.#targetTrackIds.setValue([])
        this.#regionRect.setValue(null)
    }
}
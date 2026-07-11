import {createElement} from "@opendaw/lib-jsx"
import {Html, Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {Attempts, Errors, isAbsent, isDefined, Terminator, DefaultObservableValue} from "@opendaw/lib-std"
import {Icon} from "@/ui/components/Icon.tsx"
import {installScrollbars} from "@/ui/components/Scrollbars"
import {HorizontalVolumeSlider} from "@/ui/components/HorizontalVolumeSlider.tsx"

import {IconSymbol, AudioUnitType} from "@opendaw/studio-enums"
import {PPQN} from "@opendaw/lib-dsp"
import {StudioPreferences} from "@opendaw/studio-core"
import {AudioUnitBoxAdapter, InstrumentFactories, Parsing, Validator} from "@opendaw/studio-adapters"
import {SoundfontDeviceBox} from "@opendaw/studio-boxes"
import {MidiImportService, ImportEditPlan, ImportEditPlanTrack} from "@/automidi/MidiImportService"
import {MidiAuditionPlayer} from "@/automidi/MidiAuditionPlayer"
import {MidiTimelinePreview} from "@/automidi/MidiTimelinePreview"
import {AutoGainCoordinator} from "@/automidi/AutoGainCoordinator"
import {AutoGainFooter} from "@/automidi/AutoGainFooter"
import {AutoGainConfirmDialog, AutoGainConfirmResult} from "@/automidi/AutoGainConfirmDialog"
import {AutomidiPreferences} from "@/automidi/config"
import css from "./MidiImportDialog.sass?inline"
import {StudioService} from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "MidiImportDialog")

const FilePickerMidiType = {
    description: "MIDI file",
    accept: {"audio/midi": [".mid", ".midi"]} as any
}

export const MidiImportDialog = {
    show: async (service: StudioService): Promise<void> => {
        if (!service.hasProfile) {
            await service.newProject()
        }
        const lifecycle = new Terminator()

        const plan = new DefaultObservableValue<ImportEditPlan | null>(null)
        const isLoading = new DefaultObservableValue<boolean>(false)
        const selectedTracks = new DefaultObservableValue<Set<number>>(new Set())
        // null = stopped, -1 = global play (all selected), N = solo track N
        const playingTrackIndex = new DefaultObservableValue<number | null>(null)
        const dragOver = new DefaultObservableValue<boolean>(false)
        let trackVolumes = new Map<number, number>()
        const bpmString = new DefaultObservableValue<string>("")
        const meterString = new DefaultObservableValue<string>("")
        const autoGainCoordinator = new AutoGainCoordinator(service)
        const showAutoGainConfirm: DefaultObservableValue<boolean> = new DefaultObservableValue(false)

        const auditionPlayer = new MidiAuditionPlayer(service)

        // --- Loop region save/restore ---
        const savedLoopEnabled = service.project.timelineBox.loopArea.enabled.getValue()
        service.project.editing.modify(() => {
            service.project.timelineBox.loopArea.enabled.setValue(false)
        })

        const masterVolume = service.project.primaryAudioUnitBoxAdapter.namedParameter.volume

        // --- BPM/Meter display sync ---
        const syncBpmFromProject = () => {
            bpmString.setValue(service.project.timelineBox.bpm.getValue().toFixed(0))
        }
        const syncMeterFromProject = () => {
            const {nominator, denominator} = service.project.timelineBox.signature
            meterString.setValue(`${nominator.getValue()}/${denominator.getValue()}`)
        }
        syncBpmFromProject()
        syncMeterFromProject()
        lifecycle.own(service.project.timelineBox.bpm.subscribe(() => syncBpmFromProject()))
        lifecycle.own(service.project.timelineBox.signature.nominator.subscribe(() => syncMeterFromProject()))
        lifecycle.own(service.project.timelineBox.signature.denominator.subscribe(() => syncMeterFromProject()))

        // Cleanup preview AudioUnits and stop playback when dialog is dismissed
        const onDialogClose = () => {
            autoGainCoordinator.cancel()
            auditionPlayer.cleanup()
            // Restore the loop region state
            service.project.editing.modify(() => {
                service.project.timelineBox.loopArea.enabled.setValue(savedLoopEnabled)
            })
            backdrop.remove()
            lifecycle.terminate()
        }

        const startAutoGain = (config: AutoGainConfirmResult) => {
            if (config === null) {return}
            const units = auditionPlayer.getPreviewAudioUnits()
            if (units.length === 0) {return}
            autoGainCoordinator.run({
                method: config.method,
                targetLUFS: config.targetLUFS,
                truePeakCeilingDbTP: config.truePeakCeilingDbTP,
                gatingMode: config.gatingMode,
                previewAudioUnits: units
            }).then(result => {
                trackVolumes = new Map(result)
                const currentPlan = plan.getValue()
                if (currentPlan) {plan.setValue({...currentPlan})}
            }).catch(err => {
                console.warn("Auto-gain analysis failed:", err)
            })
        }

        const handleFile = async (file: File) => {
            isLoading.setValue(true)
            auditionPlayer.cleanup()
            playingTrackIndex.setValue(null)
            autoGainCoordinator.cancel()

            const importer = new MidiImportService(service.automidi.api)
            const result = await Attempts.async(importer.importMidi(file))
            isLoading.setValue(false)

            if (result.isFailure()) {
                return
            }

            const p = result.result()
            plan.setValue(p)
            selectedTracks.setValue(new Set(p.tracks.map((_, i) => i)))
            trackVolumes = new Map()

            // Apply the MIDI file's BPM and time signature to the project immediately
            // so the user hears the correct timing during preview.
            service.project.editing.modify(() => {
                service.project.api.setBpm(p.bpm)
                if (p.timeSignatureBeats && p.timeSignatureNoteValue) {
                    service.project.timelineBoxAdapter.signatureTrack.changeSignature(
                        p.timeSignatureBeats, p.timeSignatureNoteValue
                    )
                }
            })

            auditionPlayer.setupPreview([...p.tracks])

            const settings = AutomidiPreferences.settings
            if (settings.autoGainAskOnLoad) {
                showAutoGainConfirm.setValue(true)
            } else {
                startAutoGain({
                    method: settings.autoGainMethod,
                    targetLUFS: settings.autoGainTargetLUFS,
                    truePeakCeilingDbTP: settings.autoGainTruePeakCeilingDbTP,
                    gatingMode: settings.autoGainGatingMode
                })
            }
        }

        const openFilePicker = async () => {
            const fileResult = await Promises.tryCatch(Files.open({types: [FilePickerMidiType]}))
            if (fileResult.status === "rejected") {
                if (Errors.isAbort(fileResult.error) || Errors.isNotAllowed(fileResult.error)) return
                return
            }
            const file = fileResult.value.at(0)
            if (isAbsent(file)) return
            await handleFile(file)
        }

        // Toggle play for a single track: solo it, start engine
        const togglePlay = (index: number) => {
            if (playingTrackIndex.getValue() === index) {
                auditionPlayer.stop()
                playingTrackIndex.setValue(null)
            } else {
                const currentPlan = plan.getValue()
                if (currentPlan) {
                    auditionPlayer.playTracks(
                        [{index, track: currentPlan.tracks[index]}],
                        trackVolumes
                    )
                }
                playingTrackIndex.setValue(index)
            }
        }

        // Play all selected tracks together (no solo)
        const globalPlay = () => {
            const currentPlan = plan.getValue()
            if (!currentPlan) return
            const tracksToPlay = Array.from(selectedTracks.getValue()).map(index => ({
                index,
                track: currentPlan.tracks[index]
            }))
            auditionPlayer.playTracks(tracksToPlay, trackVolumes)
            playingTrackIndex.setValue(-1)
        }

        // Update a track's volume in the virtual map and live (if currently playing).
        const onVolumeChange = (trackIndex: number, dbValue: number) => {
            const existing = trackVolumes.get(trackIndex)
            if (existing === dbValue) {return}
            trackVolumes = new Map(trackVolumes)
            trackVolumes.set(trackIndex, dbValue)
            auditionPlayer.updateTrackVolume(trackIndex, dbValue)
        }

        // Apply a new BPM to the project live.
        const onBpmChange = (value: string) => {
            const bpmValue = parseFloat(value)
            if (isNaN(bpmValue)) {return}
            service.project.editing.modify(() =>
                service.project.timelineBox.bpm.setValue(Validator.clampBpm(bpmValue)))
        }

        // Apply a new time signature to the project live.
        const onMeterChange = (value: string) => {
            const attempt = Parsing.parseTimeSignature(value)
            if (!attempt.isSuccess()) {return}
            const [nominator, denominator] = attempt.result()
            service.project.editing.modify(() =>
                service.project.timelineBoxAdapter.signatureTrack.changeSignature(nominator, denominator))
        }

        // Stop playback (keep AudioUnits, just pause engine)
        const globalStop = () => {
            auditionPlayer.stop()
            playingTrackIndex.setValue(null)
        }

        const applyImport = async (dialogHandler: {close: () => void}) => {
            const currentPlan = plan.getValue()
            if (!currentPlan) return

            // Stop and remove preview tracks before creating the real ones
            auditionPlayer.cleanup()
            playingTrackIndex.setValue(null)

            const settings = StudioPreferences.settings["midi-import"]

            service.project.editing.modify(() => {
                if (settings.mode === "override") {
                    // In override mode, delete all existing instrument tracks first
                    const audioUnits = service.project.rootBoxAdapter.audioUnits.adapters()
                    for (const au of audioUnits) {
                        if (au.type === AudioUnitType.Instrument) {
                            service.project.api.deleteAudioUnit(au.box)
                        }
                    }
                    service.project.api.setBpm(currentPlan.bpm)
                    if (currentPlan.timeSignatureBeats && currentPlan.timeSignatureNoteValue) {
                        service.project.timelineBoxAdapter.signatureTrack.changeSignature(
                            currentPlan.timeSignatureBeats, currentPlan.timeSignatureNoteValue
                        )
                    }
                }

                let colorIndex = 0
                currentPlan.tracks.forEach((trackPlan: ImportEditPlanTrack, index: number) => {
                    if (!selectedTracks.getValue().has(index)) return

                    const program = trackPlan.isDrum ? 128 : trackPlan.program

                    let icon = IconSymbol.Piano
                    let attachment: {uuid: string, name: string} | undefined = undefined

                    // Determine icon by GM family
                    if (!trackPlan.isDrum) {
                        if (program >= 24 && program <= 31) icon = IconSymbol.Guitar
                        else if (program >= 32 && program <= 39) icon = IconSymbol.BassGuitar
                        else if (program >= 56 && program <= 79) icon = IconSymbol.Saxophone
                        else if (program >= 52 && program <= 54) icon = IconSymbol.Microphone
                        else if (program >= 80 && program <= 95) icon = IconSymbol.Sawtooth
                        else icon = IconSymbol.SoundFont
                    } else {
                        icon = IconSymbol.DrumSet
                    }

                    // Resolve soundfont attachment (same logic as MidiAuditionPlayer)
                    if (settings["auto-assign-soundfont"]) {
                        const sfUuid = settings["default-soundfont-uuid"]
                        if (sfUuid) {
                            const localSf = service.soundfontService.local.unwrapOrNull() ?? []
                            const remoteSf = service.soundfontService.remote.unwrapOrNull() ?? []
                            const found = [...localSf, ...remoteSf].find(sf => sf.uuid === sfUuid)
                            attachment = {uuid: sfUuid, name: found?.name ?? "Soundfont"}
                        } else {
                            // Fallback: find Arachno by name
                            const localSf = service.soundfontService.local.unwrapOrNull() ?? []
                            const remoteSf = service.soundfontService.remote.unwrapOrNull() ?? []
                            const arachno = [...localSf, ...remoteSf]
                                .find(sf => sf.name.toLowerCase().includes("arachno"))
                            if (arachno) attachment = {uuid: arachno.uuid, name: arachno.name}
                        }
                    }

                    const factory = settings["auto-assign-soundfont"]
                        ? InstrumentFactories.Soundfont
                        : InstrumentFactories.Vaporisateur

                    // createInstrument is generic; cast factory + options to `any` to avoid the TS union type error
                    // (both Soundfont and Vaporisateur share the same InstrumentProduct return shape)
                    const {audioUnitBox, trackBox, instrumentBox} = (service.project.api.createInstrument as any)(factory, {
                        name: trackPlan.name,
                        icon,
                        attachment
                    })

                    trackBox.color.setValue(colorIndex++)

                    // Set the TrackBox's instrument field so the timeline header shows
                    // the correct GM program (e.g. "#10 Glockenspiel"). This is independent
                    // from the Soundfont preset, which is set below for Soundfont instruments.
                    trackBox.instrument.setValue(trackPlan.isDrum ? 128 : program)

                    // Set preset index if using Soundfont instrument
                    if (settings["auto-assign-soundfont"] && settings["auto-assign-gm"]) {
                        const soundfontBox = instrumentBox as unknown as SoundfontDeviceBox
                        soundfontBox.presetIndex.setValue(program)
                    }

                    // Apply the per-track volume the user dialed in during preview (if any).
                    const previewedDb = trackVolumes.get(index)
                    if (isDefined(previewedDb) && previewedDb !== 0.0) {
                        const adapter = service.project.boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter)
                        adapter.namedParameter.volume.setUnitValue(adapter.namedParameter.volume.valueMapping.x(previewedDb))
                    }

                    if (trackPlan.notes.length > 0) {
                        const lastNote = trackPlan.notes[trackPlan.notes.length - 1]
                        const duration = (lastNote.startBeats + lastNote.durationBeats) * PPQN.Quarter

                        const regionBox = service.project.api.createNoteRegion({
                            trackBox,
                            position: 0,
                            duration,
                            name: trackPlan.name
                        })

                        for (const notePlan of trackPlan.notes) {
                            service.project.api.createNoteEvent({
                                owner: regionBox,
                                position: notePlan.startBeats * PPQN.Quarter,
                                duration: notePlan.durationBeats * PPQN.Quarter,
                                pitch: notePlan.pitch,
                                velocity: notePlan.velocity / 127.0
                            })
                        }
                    }
                })
            })

            dialogHandler.close()
        }

        const renderSettings = () => (
            <div className="settings-form">
                <div className="setting-row">
                    <label>Import Mode</label>
                    <select
                        value={StudioPreferences.settings["midi-import"].mode}
                        onchange={(e: Event) => {
                            StudioPreferences.settings["midi-import"].mode = (e.target as HTMLSelectElement).value as any
                        }}>
                        <option value="override">Override Project</option>
                        <option value="append">Append to Project</option>
                    </select>
                </div>
                <div className="setting-row">
                    <label>Auto-Assign GM Instruments</label>
                    <input
                        type="checkbox"
                        defaultChecked={StudioPreferences.settings["midi-import"]["auto-assign-gm"]}
                        onchange={(e: Event) => {
                            StudioPreferences.settings["midi-import"]["auto-assign-gm"] = (e.target as HTMLInputElement).checked
                        }}
                    />
                </div>
                <div className="setting-row">
                    <label>Auto-Assign Soundfont</label>
                    <input
                        type="checkbox"
                        defaultChecked={StudioPreferences.settings["midi-import"]["auto-assign-soundfont"]}
                        onchange={(e: Event) => {
                            StudioPreferences.settings["midi-import"]["auto-assign-soundfont"] = (e.target as HTMLInputElement).checked
                        }}
                    />
                </div>
            </div>
        )

        const backdrop: HTMLDivElement = <div className="midi-import-backdrop"/>
        const dialog: HTMLDivElement = (
            <div className={className}>
                <h1 className="midi-import-headline">
                    <Icon symbol={IconSymbol.Folder}/>
                    <span>Import MIDI</span>
                </h1>
                <div data-mount
                     onInit={element => {
                         const buildDropZone = (isDragOver: boolean) => (
                             <div className="import-hub">
                                 <div className={isDragOver ? "drop-zone drag-over" : "drop-zone"}
                                      onclick={openFilePicker}
                                      ondragenter={(e: any) => {e.preventDefault(); e.stopPropagation(); dragOver.setValue(true)}}
                                      ondragover={(e: any) => {e.preventDefault(); e.stopPropagation(); dragOver.setValue(true)}}
                                      ondragleave={(e: any) => {e.preventDefault(); e.stopPropagation(); dragOver.setValue(false)}}
                                      ondrop={(e: any) => {
                                          e.preventDefault(); e.stopPropagation(); dragOver.setValue(false)
                                          const file = e.dataTransfer?.files?.[0]
                                          if (file) {handleFile(file)}
                                      }}>
                                     <div className="icon"><Icon symbol={IconSymbol.Folder}/></div>
                                     <div className="text">Click or drag and drop a .mid file here</div>
                                 </div>
                             </div>
                         )
                         const buildLoading = () => <div className="loading-state">Parsing MIDI file...</div>
                         const buildPreview = (currentPlan: ImportEditPlan) => {
                             const isPlaying = playingTrackIndex.getValue() !== null
                             const transportBar: HTMLElement = (
                                 <div className="transport-bar">
                                     <button
                                         className={Html.buildClassList("transport-play-btn", isPlaying && "active")}
                                         onclick={() => isPlaying ? globalStop() : globalPlay()}>
                                         <Icon symbol={isPlaying ? IconSymbol.Stop : IconSymbol.Play}/>
                                         {isPlaying ? "Stop" : "Play All"}
                                     </button>
                                     <div className="transport-control">
                                         <label>BPM</label>
                                         <input type="number" className="transport-input bpm-input"
                                                min={"20"} max={"999"} step={"1"}
                                                value={bpmString.getValue()}
                                                onchange={(e: Event) => onBpmChange((e.target as HTMLInputElement).value)}/>
                                     </div>
                                     <div className="transport-control">
                                         <label>Meter</label>
                                         <input type="text" className="transport-input meter-input"
                                                placeholder="4/4"
                                                value={meterString.getValue()}
                                                onchange={(e: Event) => onMeterChange((e.target as HTMLInputElement).value)}/>
                                     </div>
                                     <div className="transport-control master-volume">
                                         <HorizontalVolumeSlider lifecycle={lifecycle}
                                                                 editing={service.project.editing}
                                                                 parameter={masterVolume}/>
                                     </div>
                                 </div>
                             )
                             const scrollable: HTMLElement = (
                                 <div className="scrollable-body"
                                      onInit={scrollEl => lifecycle.own(installScrollbars(scrollEl))}>
<MidiTimelinePreview
                                          plan={currentPlan}
                                          selectedTracks={selectedTracks}
                                          playingTrackIndex={playingTrackIndex}
                                          trackVolumes={trackVolumes}
                                          lifecycle={lifecycle}
                                          editing={service.project.editing}
                                          liveStreamReceiver={service.project.liveStreamReceiver}
                                          auditionPlayer={auditionPlayer}
                                          onTogglePlay={togglePlay}
                                          onVolumeChange={onVolumeChange}
                                         onChangeProgram={(trackIndex, newProgram) => {
                                             const newPlan = {...currentPlan}
                                             const newTracks = [...currentPlan.tracks]
                                             newTracks[trackIndex] = {...newTracks[trackIndex], program: newProgram}
                                             newPlan.tracks = newTracks
                                             plan.setValue(newPlan)
                                             auditionPlayer.updateTrackProgram(trackIndex, newProgram, newTracks[trackIndex].isDrum)
                                         }}/>
                                 </div>
                             )
                             return <div className="import-hub">{transportBar}{scrollable}</div>
                         }
                         const render = () => {
                             const p = plan.getValue()
                             const loading = isLoading.getValue()
                             const isDragOver = dragOver.getValue()
                             Html.empty(element)
                             if (loading) {element.appendChild(buildLoading()); return}
                             if (!p) {element.appendChild(buildDropZone(isDragOver)); return}
                             element.appendChild(buildPreview(p))
                         }
                         lifecycle.own(plan.subscribe(render))
                         lifecycle.own(isLoading.subscribe(render))
                         lifecycle.own(dragOver.subscribe(render))
                         render()
                     }}/>
                {renderSettings()}
                <footer className="midi-import-buttons">
                    <AutoGainFooter
                        lifecycle={lifecycle}
                        coordinator={autoGainCoordinator}
                        onReanalyze={() => showAutoGainConfirm.setValue(true)}/>
                    <button className="primary"
                            onclick={() => applyImport({close: () => onDialogClose()})}>
                        Import
                    </button>
                    <button onclick={onDialogClose}>Cancel</button>
                </footer>
            </div>
        )

        backdrop.appendChild(dialog)

        // Confirmation modal for auto-gain
        const confirmMount: HTMLDivElement = <div className="confirm-mount"/>
        backdrop.appendChild(confirmMount)
        const settings = AutomidiPreferences.settings
        const renderConfirm = () => {
            Html.empty(confirmMount)
            if (!showAutoGainConfirm.getValue()) {return}
            const confirmDialog = AutoGainConfirmDialog({
                initial: {
                    method: settings.autoGainMethod,
                    targetLUFS: settings.autoGainTargetLUFS,
                    truePeakCeilingDbTP: settings.autoGainTruePeakCeilingDbTP,
                    gatingMode: settings.autoGainGatingMode
                },
                onSubmit: (result) => {
                    showAutoGainConfirm.setValue(false)
                    if (result) {
                        AutomidiPreferences.update({
                            ...AutomidiPreferences.settings,
                            autoGainMethod: result.method,
                            autoGainTargetLUFS: result.targetLUFS,
                            autoGainTruePeakCeilingDbTP: result.truePeakCeilingDbTP,
                            autoGainGatingMode: result.gatingMode
                        })
                        startAutoGain(result)
                    }
                }
            })
            confirmMount.appendChild(confirmDialog)
        }
        lifecycle.own(showAutoGainConfirm.subscribe(renderConfirm))
        renderConfirm()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation()
                onDialogClose()
            }
        }
        const handleBackdropClick = (event: MouseEvent) => {
            if (event.target === backdrop) {
                onDialogClose()
            }
        }
        document.addEventListener("keydown", handleKeyDown, true)
        backdrop.addEventListener("click", handleBackdropClick)
        lifecycle.own({
            terminate: () => {
                document.removeEventListener("keydown", handleKeyDown, true)
            }
        })

        document.body.appendChild(backdrop)
    }
}

import css from "./TrackHeader.sass?inline"
import {Errors, Lifecycle, panic, Terminator, UUID} from "@opendaw/lib-std"
import {createElement, Group, replaceChildren} from "@opendaw/lib-jsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {EffectFactories, MenuItem} from "@opendaw/studio-core"
import {AudioUnitBoxAdapter, TrackBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {AudioUnitChannelControls} from "@/ui/timeline/tracks/audio-unit/AudioUnitChannelControls.tsx"
import {installTrackHeaderMenu, installTrackInstrumentMenu} from "@/ui/timeline/tracks/audio-unit/headers/TrackHeaderMenu.ts"
import {Events, Html, Keyboard} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {Surface} from "@/ui/surface/Surface"
import {Promises} from "@opendaw/lib-runtime"
import {Colors, IconSymbol, GM_PROGRAMS, LogicTrackColors} from "@opendaw/studio-enums"
import {DragAndDrop} from "@/ui/DragAndDrop"
import {AnyDragData} from "@/ui/AnyDragData"

const className = Html.adoptStyleSheet(css, "TrackHeader")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    trackBoxAdapter: TrackBoxAdapter
    audioUnitBoxAdapter: AudioUnitBoxAdapter
}

export const TrackHeader = ({lifecycle, service, trackBoxAdapter, audioUnitBoxAdapter}: Construct) => {
    const nameLabel: HTMLElement = <h5 style={{color: Colors.dark.toString()}}/>
    const controlLabel: HTMLElement = <h5 style={{color: Colors.shadow.toString()}}/>
    const instrumentLabel: HTMLElement = <h5 style={{color: Colors.shadow.toString()}}/>
    const {project} = service
    lifecycle.own(
        trackBoxAdapter.catchupAndSubscribePath(option => option.match({
            none: () => {
                nameLabel.textContent = ""
                controlLabel.textContent = ""
            },
            some: ([device, target]) => {
                nameLabel.textContent = device
                controlLabel.textContent = target
            }
        }))
    )
    const lockIcon: HTMLElement = <Icon symbol={IconSymbol.Lock} className="lock-icon"/>
    
    const iconElement = <Icon symbol={TrackType.toIconSymbol(trackBoxAdapter.type)} />
    lifecycle.own(
        trackBoxAdapter.color.catchupAndSubscribe(owner => {
            const colorIndex = owner.getValue()
            const color = colorIndex < LogicTrackColors.length ? LogicTrackColors[colorIndex] : LogicTrackColors[0]
            iconElement.style.color = color.toString()
        })
    )
    lifecycle.own(
        trackBoxAdapter.instrument.catchupAndSubscribe(owner => {
            const instrumentIndex = owner.getValue()
            const program = GM_PROGRAMS.find(p => p.program === instrumentIndex)
            // Just map family to a suitable icon. This is a heuristic.
            let symbol: IconSymbol = TrackType.toIconSymbol(trackBoxAdapter.type)
            if (program) {
                switch (program.family) {
                    case "Piano": symbol = IconSymbol.Piano; break;
                    case "Organ": symbol = IconSymbol.Piano; break;
                    case "Guitar": symbol = IconSymbol.Guitar; break;
                    case "Bass": symbol = IconSymbol.BassGuitar; break;
                    case "Strings": symbol = IconSymbol.Waveform; break;
                    case "Ensemble": symbol = IconSymbol.Waveform; break;
                    case "Brass": symbol = IconSymbol.Saxophone; break;
                    case "Reed": symbol = IconSymbol.Saxophone; break;
                    case "Pipe": symbol = IconSymbol.Waveform; break;
                    case "Lead": symbol = IconSymbol.Waveform; break;
                    case "Pad": symbol = IconSymbol.Waveform; break;
                    case "Effects": symbol = IconSymbol.Waveform; break;
                    case "Ethnic": symbol = IconSymbol.Waveform; break;
                    case "Percussive": symbol = IconSymbol.DrumSet; break;
                    case "Sound Effects": symbol = IconSymbol.Waveform; break;
                }
                instrumentLabel.textContent = `${program.program} - ${program.name}`
            } else {
                instrumentLabel.textContent = ""
            }
            const useElement = iconElement.querySelector("use")
            if (useElement) useElement.href.baseVal = `#${IconSymbol.toName(symbol)}`
        })
    )

    const element: HTMLElement = (
        <div className={Html.buildClassList(className, "is-primary")} tabindex={-1}>
            <MenuButton className="icon-container"
                        root={MenuItem.root().setRuntimeChildrenProcedure(installTrackInstrumentMenu(service, trackBoxAdapter))}
                        style={{minWidth: "0"}}>
                {iconElement}
                {lockIcon}
            </MenuButton>
            <div className="labels">
                {nameLabel}
                {controlLabel}
                {instrumentLabel}
            </div>
            <Group onInit={element => {
                const channelLifeCycle = lifecycle.own(new Terminator())
                trackBoxAdapter.indexField
                    .catchupAndSubscribe(owner => {
                        channelLifeCycle.terminate()
                        Html.empty(element)
                        if (owner.getValue() === 0) {
                            replaceChildren(element, (
                                <AudioUnitChannelControls lifecycle={channelLifeCycle}
                                                          service={service}
                                                          adapter={audioUnitBoxAdapter}/>
                            ))
                        } else {
                            replaceChildren(element, <div/>)
                        }
                    })
            }}/>
            <MenuButton root={MenuItem.root()
                .setRuntimeChildrenProcedure(installTrackHeaderMenu(service, audioUnitBoxAdapter, trackBoxAdapter))}
                        style={{minWidth: "0", justifySelf: "end"}}
                        appearance={{color: Colors.shadow, activeColor: Colors.cream}}>
                <Icon symbol={IconSymbol.Menu} style={{fontSize: "0.75em"}}/>
            </MenuButton>
        </div>
    )
    const {audioUnitFreeze} = project
    const updateFrozenState = () => {
        const frozen = audioUnitFreeze.isFrozen(audioUnitBoxAdapter)
        lockIcon.style.display = frozen ? "" : "none"
    }
    updateFrozenState()
    const audioUnitEditing = project.userEditingManager.audioUnit
    lifecycle.ownAll(
        audioUnitFreeze.subscribe((uuid: UUID.Bytes) => {
            if (UUID.equals(uuid, audioUnitBoxAdapter.uuid)) {updateFrozenState()}
        }),
        Events.subscribeDblDwn(nameLabel, async event => {
            const {status, error, value} = await Promises.tryCatch(Surface.get(nameLabel)
                .requestFloatingTextInput(event, trackBoxAdapter.targetName.unwrapOrElse("")))
            if (status === "rejected") {
                if (!Errors.isAbort(error)) {return panic(error)}
            } else {
                project.editing.modify(() => trackBoxAdapter.targetName = value)
            }
        }),
        Events.subscribe(element, "pointerdown", () => {
            project.timelineFocus.focusTrack(trackBoxAdapter)
            if (!audioUnitEditing.isEditing(audioUnitBoxAdapter.box.editing)) {
                audioUnitEditing.edit(audioUnitBoxAdapter.box.editing)
            }
        }),
        Events.subscribe(element, "keydown", (event) => {
            if (!Keyboard.isDelete(event)) {return}
            project.editing.modify(() => {
                if (audioUnitBoxAdapter.tracks.collection.size() === 1) {
                    project.api.deleteAudioUnit(audioUnitBoxAdapter.box)
                } else {
                    audioUnitBoxAdapter.deleteTrack(trackBoxAdapter)
                }
            })
        }),
        DragAndDrop.installTarget(element, {
            drag: (_event: DragEvent, data: AnyDragData): boolean =>
                (data.type === "midi-effect" || data.type === "audio-effect") && data.uuids === null,
            drop: (_event: DragEvent, data: AnyDragData) => {
                if (data.type === "midi-effect") {
                    if (data.uuids !== null) {return}
                    const factory = EffectFactories.MidiNamed[data.device]
                    if (factory.type !== audioUnitBoxAdapter.input.adapter().unwrapOrNull()?.accepts) {
                        return
                    }
                    const effectField = audioUnitBoxAdapter.box.midiEffects
                    project.editing.modify(() =>
                        factory.create(project, effectField, effectField.pointerHub.incoming().length))
                } else if (data.type === "audio-effect") {
                    if (data.uuids !== null) {return}
                    const factory = EffectFactories.AudioNamed[data.device]
                    const effectField = audioUnitBoxAdapter.box.audioEffects
                    project.editing.modify(() =>
                        factory.create(project, effectField, effectField.pointerHub.incoming().length))
                }
            },
            enter: (allowDrop: boolean) => element.classList.toggle("accept-drop", allowDrop),
            leave: () => element.classList.remove("accept-drop")
        })
    )
    return element
}
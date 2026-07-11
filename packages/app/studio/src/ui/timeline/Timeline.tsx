import css from "./Timeline.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement, Inject} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService"
import {TracksFooter} from "@/ui/timeline/tracks/footer/TracksFooter.tsx"
import {TimelineHeader} from "@/ui/timeline/TimelineHeader.tsx"
import {TimelineNavigation} from "@/ui/timeline/TimelineNavigation.tsx"
import {PrimaryTracks} from "./tracks/primary/PrimaryTracks"
import {AudioUnitsTimeline} from "./tracks/audio-unit/AudioUnitsTimeline.tsx"
import {ClipsHeader} from "@/ui/timeline/tracks/audio-unit/clips/ClipsHeader.tsx"
import {ppqn} from "@opendaw/lib-dsp"
import {deferNextFrame, Html} from "@opendaw/lib-dom"
import {RegionDrawTool} from "@/ui/automidi/RegionDrawTool"

const className = Html.adoptStyleSheet(css, "Timeline")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const Timeline = ({lifecycle, service}: Construct) => {
    const {project, timeline} = service
    const {engine} = project
    const {snapping, clips, followCursor, primaryVisibility: {markers, tempo}} = timeline
    const snappingName = Inject.value(snapping.unit.name)
    lifecycle.own(snapping.subscribe(snapping => {snappingName.value = snapping.unit.name}))
    const timelineHeader = <TimelineHeader lifecycle={lifecycle} service={service}/>
    const tracksFooter = <TracksFooter lifecycle={lifecycle} service={service}/>
    const element: HTMLElement = (
        <div className={className}>
            {timelineHeader}
            <ClipsHeader lifecycle={lifecycle} service={service}/>
            <TimelineNavigation lifecycle={lifecycle} service={service}/>
            <PrimaryTracks lifecycle={lifecycle} service={service}/>
            <AudioUnitsTimeline lifecycle={lifecycle} service={service}/>
            {tracksFooter}
        </div>
    )
    const automidiOverlay = document.createElement("div")
    automidiOverlay.className = "automidi-timeline-overlay"
    element.appendChild(automidiOverlay)
    RegionDrawTool(service, automidiOverlay, service.timeline.range)

    // "Draw a region" hint overlay shown while status === "awaiting-region"
    const awaitingOverlay = document.createElement("div")
    awaitingOverlay.className = "automidi-awaiting-overlay hidden"
    const awaitingText = document.createElement("div")
    awaitingText.className = "automidi-awaiting-text"
    const awaitingIcon = document.createElement("span")
    awaitingIcon.className = "automidi-awaiting-text-icon"
    awaitingIcon.textContent = "⬚"
    awaitingText.appendChild(awaitingIcon)
    const awaitingTextLabel = document.createElement("span")
    awaitingTextLabel.textContent = "Draw a region"
    awaitingText.appendChild(awaitingTextLabel)
    const awaitingHint = document.createElement("div")
    awaitingHint.className = "automidi-awaiting-hint"
    awaitingHint.textContent = "Drag on the timeline or piano roll to select a region · Esc to cancel"
    awaitingOverlay.appendChild(awaitingText)
    awaitingOverlay.appendChild(awaitingHint)
    element.appendChild(awaitingOverlay)
    lifecycle.own(service.automidi.status.subscribe(() => {
        const status = service.automidi.status.getValue()
        const isAwaiting = status === "awaiting-region"
        awaitingOverlay.classList.toggle("hidden", !isAwaiting)
        element.classList.toggle("automidi-awaiting-cursor", isAwaiting)
    }))
    const updateRecordingState = () =>
        element.classList.toggle("recording", engine.isRecording.getValue() || engine.isCountingIn.getValue())
    const {request} = lifecycle.own(deferNextFrame(() =>
        element.classList.toggle("primary-tracks-visible", markers.getValue() || tempo.getValue())))
    lifecycle.ownAll(
        Html.watchResize(element, () => {
            const cursorHeight = element.clientHeight
                - timelineHeader.clientHeight
                - tracksFooter.clientHeight
            element.style.setProperty("--cursor-height", `${cursorHeight - 1}px`)
        }),
        engine.isRecording.subscribe(updateRecordingState),
        engine.isCountingIn.subscribe(updateRecordingState),
        followCursor.subscribe(owner => {
            if (owner.getValue()) {
                const range = service.timeline.range
                const position = engine.position.getValue()
                if (position < range.unitMin || position > range.unitMax) {
                    range.moveToUnit(position)
                }
            }
        }),
        engine.position.subscribe((() => {
            let lastPosition: ppqn = 0
            return owner => {
                if (!followCursor.getValue() || service.regionModifierInProgress) {return}
                const range = service.timeline.range
                const position = owner.getValue()
                if (lastPosition <= range.unitMax && position > range.unitMax) {
                    range.moveUnitBy(range.unitMax - range.unitMin)
                } else if (lastPosition >= range.unitMin && position < range.unitMin) {
                    range.moveUnitBy(range.unitMin - range.unitMax)
                }
                lastPosition = position
            }
        })()),
        clips.visible.catchupAndSubscribe(owner => { return element.classList.toggle("clips-visible", owner.getValue()) }),
        clips.count.catchupAndSubscribe(owner => element.style.setProperty("--clips-count", String(owner.getValue()))),
        markers.catchupAndSubscribe(request),
        tempo.catchupAndSubscribe(request)
    )
    return element
}
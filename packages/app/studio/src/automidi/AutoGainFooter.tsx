import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {DefaultObservableValue, Lifecycle, ObservableValue, Option} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon"
import {AutoGainCoordinator} from "./AutoGainCoordinator"
import css from "./AutoGainFooter.sass?inline"

const className = Html.adoptStyleSheet(css, "AutoGainFooter")
const RING_RADIUS = 28
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

type Construct = {
    lifecycle: Lifecycle
    coordinator: AutoGainCoordinator
    onReanalyze: () => void
}

export const AutoGainFooter = ({lifecycle, coordinator, onReanalyze}: Construct) => {
    const captionText = "Auto-gain balances track loudness using K-weighted LUFS analysis (BS.1770-4) for a perceptually even mix."
    const stagesObserver: DefaultObservableValue<ReadonlyArray<{index: number, label: string, weight: number}>> = new DefaultObservableValue([])
    const stageIndexObserver: DefaultObservableValue<number> = new DefaultObservableValue(-1)
    const progressObserver: DefaultObservableValue<number> = new DefaultObservableValue(0)

    const ringProgress: SVGCircleElement = (
        <circle cx={32} cy={32} r={RING_RADIUS.toString()}
                fill="none" stroke-width="3"
                stroke-dasharray={RING_CIRCUMFERENCE.toString()}
                stroke-dashoffset={RING_CIRCUMFERENCE.toString()}
                transform="rotate(-90 32 32)"
                className="ring-progress"/>
    )
    const ringTrack: SVGCircleElement = (
        <circle cx={32} cy={32} r={RING_RADIUS.toString()}
                fill="none" stroke-width="3"
                className="ring-track"/>
    )
    const percentText: SVGTextElement = (
        <text x="32" y="32"
              text-anchor="middle"
              dominant-baseline="central"
              className="ring-percent">0%</text>
    )
    const svg: SVGSVGElement = (
        <svg viewBox="0 0 64 64" width="48" height="48">
            {ringTrack}
            {ringProgress}
            {percentText}
        </svg>
    )

    const stageLabel: HTMLSpanElement = <span className="stage-label">Idle</span>
    const caption: HTMLSpanElement = <span className="caption">{captionText}</span>
    const reanalyzeButton: HTMLButtonElement = (
        <button className="reanalyze-btn" title="Re-analyze" onclick={onReanalyze}>
            <Icon symbol={IconSymbol.Loop}/>
        </button>
    )
    const cancelButton: HTMLButtonElement = (
        <button className="cancel-btn hidden" title="Cancel" onclick={() => coordinator.cancel()}>
            <Icon symbol={IconSymbol.Close}/>
        </button>
    )

    const applyProgress = (value: number) => {
        const clamped = Math.max(0, Math.min(1, value))
        ringProgress.setAttribute("stroke-dashoffset", String(RING_CIRCUMFERENCE * (1 - clamped)))
        percentText.textContent = `${Math.round(clamped * 100)}%`
    }
    applyProgress(0)

    const updateState = () => {
        const isRunning = coordinator.isRunning.getValue()
        const error = coordinator.error.getValue()
        const progress = progressObserver.getValue()
        const stageIndex = stageIndexObserver.getValue()
        const stages = stagesObserver.getValue()
        const currentStage = stageIndex >= 0 && stageIndex < stages.length
            ? stages[stageIndex]
            : null

        if (error.nonEmpty()) {
            stageLabel.textContent = `Error: ${error.unwrap()}`
            reanalyzeButton.classList.remove("hidden")
            cancelButton.classList.add("hidden")
            ringProgress.classList.add("error")
            percentText.textContent = "!"
            percentText.classList.add("error")
        } else if (isRunning) {
            const label = currentStage?.label ?? "Analyzing"
            stageLabel.textContent = label
            reanalyzeButton.classList.add("hidden")
            cancelButton.classList.remove("hidden")
            ringProgress.classList.remove("error")
            percentText.classList.remove("error")
        } else {
            const lastResult = coordinator.lastResult.getValue()
            if (lastResult.nonEmpty()) {
                stageLabel.textContent = "Complete"
            } else {
                stageLabel.textContent = "Idle"
            }
            reanalyzeButton.classList.remove("hidden")
            cancelButton.classList.add("hidden")
            ringProgress.classList.remove("error")
            percentText.classList.remove("error")
        }
        applyProgress(progress)
    }

    const wireStrategySubscription = (strategy: ObservableValue<Option<unknown>>) => {
        lifecycle.own(strategy.subscribe(observable => {
            const strategyOpt = observable.getValue()
            if (strategyOpt.nonEmpty()) {
                const s = strategyOpt.unwrap() as {
                    stages: DefaultObservableValue<ReadonlyArray<{index: number, label: string, weight: number}>>
                    progress: DefaultObservableValue<number>
                    currentStageIndex: DefaultObservableValue<number>
                }
                stagesObserver.setValue(s.stages.getValue())
                progressObserver.setValue(s.progress.getValue())
                stageIndexObserver.setValue(s.currentStageIndex.getValue())
                lifecycle.own(s.stages.subscribe(o => {stagesObserver.setValue(o.getValue()); updateState()}))
                lifecycle.own(s.progress.subscribe(o => {progressObserver.setValue(o.getValue()); applyProgress(o.getValue())}))
                lifecycle.own(s.currentStageIndex.subscribe(o => {stageIndexObserver.setValue(o.getValue()); updateState()}))
            }
            updateState()
        }))
    }
    wireStrategySubscription(coordinator.strategy)
    lifecycle.own(coordinator.isRunning.subscribe(updateState))
    lifecycle.own(coordinator.error.subscribe(updateState))
    lifecycle.own(coordinator.lastResult.subscribe(updateState))
    updateState()

    return (
        <div className={className} data-running={String(coordinator.isRunning.getValue())}>
            <div className="ring-container">{svg}</div>
            <div className="info">
                <div className="row-1">{stageLabel}</div>
                {caption}
            </div>
            <div className="buttons">
                {reanalyzeButton}
                {cancelButton}
            </div>
        </div>
    )
}
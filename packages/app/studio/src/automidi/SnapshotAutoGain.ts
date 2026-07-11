import {OfflineEngineRenderer} from "@opendaw/studio-core"
import {DefaultObservableValue, ObservableValue, Option, Terminator} from "@opendaw/lib-std"
import {Address} from "@opendaw/lib-box"
import {gainToDb} from "@opendaw/lib-dsp"
import {AnalysisStage, applyGainOffsets, AutoGainConfig, AutoGainResult, AutoGainStrategy} from "./AutoGainTypes"
import {AUTO_GAIN_MAX_BOOST_DB, AUTO_GAIN_MIN_CUT_DB} from "./config"
import {StudioService} from "@/service/StudioService"

type TrackMeasurement = {
    trackIndex: number
    address: Address
    maxPeakLinear: number
    maxRmsLinear: number
    hasSignal: boolean
}

const RENDER_WEIGHT = 0.8
const COMPUTE_WEIGHT = 0.15
const APPLY_WEIGHT = 0.05

const computeGainOffset = (targetRmsDb: number, measurement: TrackMeasurement): number => {
    if (!measurement.hasSignal || measurement.maxRmsLinear <= 0.0) {return 0.0}
    const rmsDb = gainToDb(measurement.maxRmsLinear)
    if (!isFinite(rmsDb)) {return 0.0}
    let gainOffset = targetRmsDb - rmsDb
    const maxPeakDb = gainToDb(measurement.maxPeakLinear)
    const maxAllowed = isFinite(maxPeakDb) ? -maxPeakDb - 0.1 : AUTO_GAIN_MAX_BOOST_DB
    if (gainOffset > maxAllowed) {gainOffset = maxAllowed}
    if (gainOffset > AUTO_GAIN_MAX_BOOST_DB) {gainOffset = AUTO_GAIN_MAX_BOOST_DB}
    if (gainOffset < AUTO_GAIN_MIN_CUT_DB) {gainOffset = AUTO_GAIN_MIN_CUT_DB}
    return gainOffset
}

export class SnapshotAutoGain implements AutoGainStrategy {
    readonly #service: StudioService
    readonly #config: AutoGainConfig
    readonly #terminator: Terminator = new Terminator()
    readonly #stages: DefaultObservableValue<ReadonlyArray<AnalysisStage>> = new DefaultObservableValue<ReadonlyArray<AnalysisStage>>([])
    readonly #progress: DefaultObservableValue<number> = new DefaultObservableValue(0)
    readonly #currentStageIndex: DefaultObservableValue<number> = new DefaultObservableValue(0)
    #abortController: AbortController | null = null

    constructor(service: StudioService, config: AutoGainConfig) {
        this.#service = service
        this.#config = config
    }

    get stages(): ObservableValue<ReadonlyArray<AnalysisStage>> {return this.#stages}
    get progress(): ObservableValue<number> {return this.#progress}
    get currentStageIndex(): ObservableValue<number> {return this.#currentStageIndex}

    cancel(): void {
        if (this.#abortController) {
            this.#abortController.abort()
            this.#abortController = null
        }
    }

    terminate(): void {this.#terminator.terminate()}

    async run(): Promise<AutoGainResult> {
        const trackCount = this.#config.previewAudioUnits.length
        const stageDefs: ReadonlyArray<AnalysisStage> = [
            {index: 0, label: "Step 1/5: Preparing project copy + live stream subscriptions", weight: 0.05},
            {index: 1, label: "Step 2/5: Loading soundfont (cached in soundfontManager)", weight: 0.05},
            {index: 2, label: `Step 3/5: Streaming peak/RMS from offline engine for ${trackCount} track(s) (max RMS tracking)`, weight: RENDER_WEIGHT},
            {index: 3, label: `Step 4/5: Computing ${trackCount} RMS-based gain offset(s) (target -18 dBFS RMS, headroom-clamped)`, weight: COMPUTE_WEIGHT},
            {index: 4, label: "Step 5/5: Applying gain offsets to preview AudioUnits (editing.modify)", weight: APPLY_WEIGHT}
        ]
        this.#stages.setValue(stageDefs)
        this.#currentStageIndex.setValue(0)

        const abortController = new AbortController()
        this.#abortController = abortController

        const measurements: TrackMeasurement[] = this.#config.previewAudioUnits.map((unit, trackIndex) => ({
            trackIndex,
            address: unit.address,
            maxPeakLinear: 0.0,
            maxRmsLinear: 0.0,
            hasSignal: false
        }))

        this.#currentStageIndex.setValue(2)
        this.#progress.setValue(0.10)
        const projectCopy = this.#service.project.copy()
        const liveStreamReceiver = projectCopy.liveStreamReceiver
        const subscriptions = measurements.map(m =>
            liveStreamReceiver.subscribeFloats(m.address, (values: Float32Array) => {
                if (values.length < 4) {return}
                const peak = Math.max(Math.abs(values[0]), Math.abs(values[1]))
                const rms = Math.max(Math.abs(values[2]), Math.abs(values[3]))
                if (peak > 0.0 || rms > 0.0) {m.hasSignal = true}
                if (peak > m.maxPeakLinear) {m.maxPeakLinear = peak}
                if (rms > m.maxRmsLinear) {m.maxRmsLinear = rms}
            })
        )

        const renderProgress = new DefaultObservableValue<number>(0)
        const renderProgressSubscription = this.#terminator.own(renderProgress.subscribe(observable => {
            const renderValue = 0.10 + observable.getValue() * RENDER_WEIGHT
            this.#progress.setValue(renderValue)
        }))

        try {
            await OfflineEngineRenderer.start(
                projectCopy,
                Option.None,
                renderProgress,
                abortController.signal
            )
        } catch (e) {
            subscriptions.forEach(s => s.terminate())
            renderProgressSubscription.terminate()
            throw e
        }
        subscriptions.forEach(s => s.terminate())
        renderProgressSubscription.terminate()
        this.#progress.setValue(0.10 + RENDER_WEIGHT)

        this.#currentStageIndex.setValue(3)
        const targetRmsDb = -18.0
        const result: AutoGainResult = new Map()
        for (const m of measurements) {result.set(m.trackIndex, computeGainOffset(targetRmsDb, m))}
        this.#progress.setValue(0.10 + RENDER_WEIGHT + COMPUTE_WEIGHT)

        this.#currentStageIndex.setValue(4)
        applyGainOffsets(this.#service, result, this.#config.previewAudioUnits)
        this.#progress.setValue(1)
        this.#currentStageIndex.setValue(3)
        return result
    }
}

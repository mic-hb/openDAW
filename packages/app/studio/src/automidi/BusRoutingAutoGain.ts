import {OfflineEngineRenderer} from "@opendaw/studio-core"
import {LoudnessAnalyzer} from "@opendaw/lib-dsp"
import {DefaultObservableValue, ObservableValue, Option, Terminator, UUID} from "@opendaw/lib-std"
import {ExportConfiguration, ExportStemConfiguration} from "@opendaw/studio-adapters"
import {AnalysisStage, applyGainOffsets, AutoGainConfig, AutoGainResult, AutoGainStrategy} from "./AutoGainTypes"
import {AUTO_GAIN_MAX_BOOST_DB, AUTO_GAIN_MIN_CUT_DB} from "./config"
import {StudioService} from "@/service/StudioService"

const SAMPLE_RATE = 48_000

const buildStages = (trackCount: number): ReadonlyArray<AnalysisStage> => {
    return [
        {
            index: 0,
            label: `Step 1/5: Preparing project copy + building ExportConfiguration with ${trackCount} stem(s)`,
            weight: 0.05
        },
        {
            index: 1,
            label: `Step 2/5: Marking ${trackCount} track(s) as stems (audioUnit UUID → stem entry, post-channel-strip capture)`,
            weight: 0.05
        },
        {
            index: 2,
            label: `Step 3/5: Rendering ${trackCount} stems via offline engine (Web Worker, SINGLE pass, ${trackCount * 2} output channels)`,
            weight: 0.65
        },
        {
            index: 3,
            label: `Step 4/5: K-weighting + LUFS analysis per stem (BS.1770-4, ${trackCount} × LoudnessAnalyzer instances)`,
            weight: 0.15
        },
        {
            index: 4,
            label: "Step 5/5: Computing gain offsets (peak-aware clamping) + applying volumes",
            weight: 0.10
        }
    ]
}

const computeGainOffset = (targetLUFS: number, ceilingDbTP: number, lufs: number, truePeakDbTP: number): number => {
    if (!isFinite(lufs)) {return 0.0}
    let gainOffset = targetLUFS - lufs
    if (isFinite(truePeakDbTP)) {
        const maxAllowed = ceilingDbTP - truePeakDbTP
        if (gainOffset > maxAllowed) {gainOffset = maxAllowed}
    }
    if (gainOffset > AUTO_GAIN_MAX_BOOST_DB) {gainOffset = AUTO_GAIN_MAX_BOOST_DB}
    if (gainOffset < AUTO_GAIN_MIN_CUT_DB) {gainOffset = AUTO_GAIN_MIN_CUT_DB}
    return gainOffset
}

export class BusRoutingAutoGain implements AutoGainStrategy {
    readonly #service: StudioService
    readonly #config: AutoGainConfig
    readonly #terminator: Terminator = new Terminator()
    readonly #stages: DefaultObservableValue<ReadonlyArray<AnalysisStage>> = new DefaultObservableValue([])
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
        this.#stages.setValue(buildStages(trackCount))
        this.#currentStageIndex.setValue(0)

        const abortController = new AbortController()
        this.#abortController = abortController

        this.#currentStageIndex.setValue(1)
        this.#progress.setValue(0.05)
        const projectCopy = this.#service.project.copy()

        const stems: Record<string, ExportStemConfiguration> = {}
        for (const unit of this.#config.previewAudioUnits) {
            const uuidString = UUID.toString(unit.address.uuid)
            stems[uuidString] = {
                includeAudioEffects: false,
                includeSends: false,
                useInstrumentOutput: false,
                skipChannelStrip: false,
                fileName: `[Preview] ${uuidString}`
            } as ExportStemConfiguration
        }
        const exportConfig: ExportConfiguration = {stems}
        this.#currentStageIndex.setValue(2)
        this.#progress.setValue(0.10)

        const renderProgress = new DefaultObservableValue<number>(0)
        const renderSubscription = this.#terminator.own(renderProgress.subscribe(observable => {
            const renderValue = observable.getValue() * 0.65
            this.#progress.setValue(0.10 + renderValue)
        }))

        let rendered: import("@opendaw/lib-dsp").AudioData | null = null
        try {
            rendered = await OfflineEngineRenderer.start(
                projectCopy,
                Option.wrap(exportConfig),
                renderProgress,
                abortController.signal,
                SAMPLE_RATE
            )
        } catch (e) {
            renderSubscription.terminate()
            throw e
        }
        renderSubscription.terminate()

        this.#currentStageIndex.setValue(3)
        this.#progress.setValue(0.75)
        const result: AutoGainResult = new Map()
        const targetLUFS = this.#config.targetLUFS
        const ceilingDbTP = this.#config.truePeakCeilingDbTP
        for (let i = 0; i < trackCount; i++) {
            const leftChannel = rendered.frames[i * 2]
            const rightChannel = rendered.frames[i * 2 + 1]
            const stemChannels: Array<Float32Array> = [leftChannel, rightChannel]
            const analyzer = new LoudnessAnalyzer(SAMPLE_RATE)
            const measurement = analyzer.processEntireBuffer(stemChannels)
            const gainOffset = computeGainOffset(targetLUFS, ceilingDbTP, measurement.integratedLUFS, measurement.truePeakDbTP)
            if (measurement.integratedLUFS > Number.NEGATIVE_INFINITY) {
                result.set(i, gainOffset)
            }
        }
        this.#progress.setValue(0.90)

        this.#currentStageIndex.setValue(4)
        applyGainOffsets(this.#service, result, this.#config.previewAudioUnits)
        this.#progress.setValue(1)
        this.#currentStageIndex.setValue(4)
        return result
    }
}
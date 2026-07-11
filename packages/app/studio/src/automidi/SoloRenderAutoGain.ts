import {OfflineEngineRenderer} from "@opendaw/studio-core"
import {DefaultObservableValue, isDefined, ObservableValue, Option, Parameter, Terminator} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter} from "@opendaw/studio-adapters"
import {AudioData, LoudnessAnalyzer} from "@opendaw/lib-dsp"
import {AnalysisStage, applyGainOffsets, AutoGainConfig, AutoGainResult, AutoGainStrategy} from "./AutoGainTypes"
import {AUTO_GAIN_MAX_BOOST_DB, AUTO_GAIN_MIN_CUT_DB} from "./config"
import {StudioService} from "@/service/StudioService"

const SAMPLE_RATE = 48_000
const SILENT_DB = -120.0

type TrackMeasurement = {
    trackIndex: number
    audioUnit: AudioUnitBox
    originalVolume: number
    lufs: number
    truePeakDbTP: number
    hasSignal: boolean
}

const computeGainOffset = (targetLUFS: number, ceilingDbTP: number, m: TrackMeasurement): number => {
    if (!m.hasSignal) {return 0.0}
    if (!isFinite(m.lufs)) {return 0.0}
    let gainOffset = targetLUFS - m.lufs
    if (isFinite(m.truePeakDbTP)) {
        const maxAllowed = ceilingDbTP - m.truePeakDbTP
        if (gainOffset > maxAllowed) {gainOffset = maxAllowed}
    }
    if (gainOffset > AUTO_GAIN_MAX_BOOST_DB) {gainOffset = AUTO_GAIN_MAX_BOOST_DB}
    if (gainOffset < AUTO_GAIN_MIN_CUT_DB) {gainOffset = AUTO_GAIN_MIN_CUT_DB}
    return gainOffset
}

export class SoloRenderAutoGain implements AutoGainStrategy {
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
        const stages = this.#buildStages(trackCount)
        this.#stages.setValue(stages)
        this.#currentStageIndex.setValue(0)

        const abortController = new AbortController()
        this.#abortController = abortController

        this.#currentStageIndex.setValue(1)
        this.#progress.setValue(0.05)
        const projectCopy = this.#service.project.copy()

        const measurements: TrackMeasurement[] = []
        const volumeAdapters: Array<{audioUnit: AudioUnitBox, originalDb: number, parameter: Parameter<number>}> = []
        for (let i = 0; i < trackCount; i++) {
            const originalAudioUnit = this.#config.previewAudioUnits[i]
            const copyAudioUnit = projectCopy.boxGraph.findBox<AudioUnitBox>(originalAudioUnit.address.uuid).unwrap()
            const adapter = projectCopy.boxAdapters.adapterFor(copyAudioUnit, AudioUnitBoxAdapter)
            const parameter = isDefined(adapter) ? adapter.namedParameter.volume : null
            const originalDb = isDefined(parameter) ? parameter.valueMapping.x(parameter.getValue()) : 0.0
            volumeAdapters.push({audioUnit: copyAudioUnit, originalDb, parameter: parameter as Parameter<number>})
            measurements.push({
                trackIndex: i,
                audioUnit: copyAudioUnit,
                originalVolume: originalDb,
                lufs: Number.NEGATIVE_INFINITY,
                truePeakDbTP: Number.NEGATIVE_INFINITY,
                hasSignal: false
            })
        }

        const perTrackWeight = 0.7 / trackCount
        const subStageWeight = perTrackWeight / 3

        for (let i = 0; i < trackCount; i++) {
            if (abortController.signal.aborted) {throw new DOMException("Aborted", "AbortError")}
            const baseIndex = 2 + i * 3

            this.#currentStageIndex.setValue(baseIndex)
            this.#progress.setValue(0.10 + i * perTrackWeight)
            projectCopy.editing.modify(() => {
                for (let j = 0; j < trackCount; j++) {
                    const {parameter, originalDb} = volumeAdapters[j]
                    const targetDb = j === i ? originalDb : SILENT_DB
                    parameter.setUnitValue(parameter.valueMapping.x(targetDb))
                }
            })

            this.#currentStageIndex.setValue(baseIndex + 1)
            this.#progress.setValue(0.10 + i * perTrackWeight + subStageWeight)
            const renderProgress = new DefaultObservableValue<number>(0)
            const renderSubscription = this.#terminator.own(renderProgress.subscribe(observable => {
                const trackProgress = i * perTrackWeight + subStageWeight + observable.getValue() * subStageWeight
                this.#progress.setValue(0.10 + trackProgress)
            }))

            let rendered: AudioData | null = null
            try {
                rendered = await OfflineEngineRenderer.start(
                    projectCopy,
                    Option.None,
                    renderProgress,
                    abortController.signal
                )
            } catch (e) {
                renderSubscription.terminate()
                throw e
            }
            renderSubscription.terminate()

            this.#currentStageIndex.setValue(baseIndex + 2)
            this.#progress.setValue(0.10 + i * perTrackWeight + subStageWeight * 2)
            const channels: Array<Float32Array> = rendered ? [...rendered.frames] : []
            const analyzer = new LoudnessAnalyzer(SAMPLE_RATE)
            const result = analyzer.processEntireBuffer(channels)
            measurements[i].lufs = result.integratedLUFS
            measurements[i].truePeakDbTP = result.truePeakDbTP
            measurements[i].hasSignal = isFinite(result.integratedLUFS) && result.integratedLUFS > Number.NEGATIVE_INFINITY

            this.#progress.setValue(0.10 + (i + 1) * perTrackWeight)
        }

        projectCopy.editing.modify(() => {
            for (const {parameter, originalDb} of volumeAdapters) {
                parameter.setUnitValue(parameter.valueMapping.x(originalDb))
            }
        })

        this.#currentStageIndex.setValue(2 + trackCount * 3)
        const result: AutoGainResult = new Map()
        for (const m of measurements) {
            result.set(m.trackIndex, computeGainOffset(this.#config.targetLUFS, this.#config.truePeakCeilingDbTP, m))
        }
        this.#progress.setValue(0.95)

        this.#currentStageIndex.setValue(3 + trackCount * 3)
        applyGainOffsets(this.#service, result, this.#config.previewAudioUnits)
        this.#progress.setValue(1)
        return result
    }

    #buildStages(trackCount: number): ReadonlyArray<AnalysisStage> {
        const stages: AnalysisStage[] = []
        stages.push({index: 0, label: "Step 1/5: Preparing project copy", weight: 0.05})
        stages.push({index: 1, label: "Step 1/5: Loading soundfont", weight: 0.05})
        for (let i = 0; i < trackCount; i++) {
            const trackNum = i + 1
            stages.push({
                index: 2 + i * 3,
                label: `[Track ${trackNum}/${trackCount}] Step 2/5: Muting other tracks (solo setup)`,
                weight: 0.7 / trackCount / 3
            })
            stages.push({
                index: 3 + i * 3,
                label: `[Track ${trackNum}/${trackCount}] Step 3/5: Rendering via offline engine (Web Worker)`,
                weight: 0.7 / trackCount / 3
            })
            stages.push({
                index: 4 + i * 3,
                label: `[Track ${trackNum}/${trackCount}] Step 4/5: K-weighting + LUFS analysis (BS.1770-4)`,
                weight: 0.7 / trackCount / 3
            })
        }
        stages.push({
            index: 2 + trackCount * 3,
            label: `Step 5/5: Computing ${trackCount} gain offset(s) (peak-aware clamping)`,
            weight: 0.15
        })
        stages.push({
            index: 3 + trackCount * 3,
            label: `Step 5/5: Applying gain offsets to preview AudioUnits (editing.modify)`,
            weight: 0.05
        })
        return stages
    }
}
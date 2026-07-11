import {BiquadCoeff, BiquadMono} from "@opendaw/lib-dsp"
import {int} from "@opendaw/lib-std"

const LUFS_ABSOLUTE_GATE = -70.0
const LUFS_RELATIVE_GATE_MARGIN = 10.0
const BLOCK_SIZE_SECONDS = 0.4
const HOP_SIZE_SECONDS = 0.1
const MIN_GATED_BLOCKS = 1

export const KWeightingCoefficients = {
    preFilter: {frequency: 1681.974450955533, gainDb: 3.99984385397, q: 0.7071752369554196},
    rlbFilter: {frequency: 38.13547087602444, q: 0.5003270373238773}
} as const

export class KWeightingFilter {
    readonly #preFilter: BiquadCoeff = new BiquadCoeff()
    readonly #rlbFilter: BiquadCoeff = new BiquadCoeff()
    readonly #preProcessor: BiquadMono = new BiquadMono()
    readonly #rlbProcessor: BiquadMono = new BiquadMono()

    constructor(sampleRate: number) {
        this.#preFilter.setHighShelfParams(
            KWeightingCoefficients.preFilter.frequency / (sampleRate * 0.5),
            KWeightingCoefficients.preFilter.gainDb
        )
        this.#rlbFilter.setHighpassParams(
            KWeightingCoefficients.rlbFilter.frequency / (sampleRate * 0.5),
            KWeightingCoefficients.rlbFilter.q
        )
    }

    reset(): void {
        this.#preProcessor.reset()
        this.#rlbProcessor.reset()
    }

    processFrame(sample: number): number {
        return this.#rlbProcessor.processFrame(this.#rlbFilter, this.#preProcessor.processFrame(this.#preFilter, sample))
    }

    process(input: Float32Array, output: Float32Array, fromIndex: int, toIndex: int): void {
        for (let i = fromIndex; i < toIndex; i++) {
            output[i] = this.processFrame(input[i])
        }
    }
}

export type GatingMode = "bs1770" | "ungated"

export type LoudnessResult = {
    integratedLUFS: number
    momentaryMaxLUFS: number
    shortTermMaxLUFS: number
    truePeakDbTP: number
}

const computeMeanSquare = (channels: ReadonlyArray<Float32Array>, from: int, to: int): number => {
    let sum = 0.0
    for (const channel of channels) {
        for (let i = from; i < to; i++) {sum += channel[i] * channel[i]}
    }
    return sum / (channels.length * (to - from))
}

const lufsFromMeanSquare = (meanSquare: number): number => {
    if (meanSquare <= 0.0) {return Number.NEGATIVE_INFINITY}
    return -0.691 + 10.0 * Math.log10(meanSquare)
}

const truePeakFromChannel = (channel: Float32Array, from: int, to: int): number => {
    let maxAbs = 0.0
    for (let i = from; i < to; i++) {
        const value = Math.abs(channel[i])
        if (value > maxAbs) {maxAbs = value}
    }
    return maxAbs === 0.0 ? Number.NEGATIVE_INFINITY : 20.0 * Math.log10(maxAbs)
}

const fourTimesOversampleTruePeak = (channels: ReadonlyArray<Float32Array>, from: int, to: int): number => {
    let maxAbs = 0.0
    for (const channel of channels) {
        let prev = 0.0
        for (let i = from; i < to; i++) {
            const value = channel[i]
            const d0 = value - prev
            prev = value
            for (let k = 1; k < 4; k++) {
                const interpolated = Math.abs(value - d0 * (1 - k / 4))
                if (interpolated > maxAbs) {maxAbs = interpolated}
            }
        }
    }
    return maxAbs === 0.0 ? Number.NEGATIVE_INFINITY : 20.0 * Math.log10(maxAbs)
}

export class LoudnessAnalyzer {
    readonly #sampleRate: number
    readonly #filter: KWeightingFilter
    #integrated: DefaultIntegratedBuffer
    #truePeak: number = Number.NEGATIVE_INFINITY

    constructor(sampleRate: number) {
        this.#sampleRate = sampleRate
        this.#filter = new KWeightingFilter(sampleRate)
        this.#integrated = new DefaultIntegratedBuffer(sampleRate)
    }

    processBlock(channels: ReadonlyArray<Float32Array>, fromSample: int, toSample: int): void {
        const filtered = channels.map(channel => new Float32Array(channel.length))
        for (let c = 0; c < channels.length; c++) {
            this.#filter.process(channels[c], filtered[c], fromSample, toSample)
        }
        const meanSquare = computeMeanSquare(filtered, fromSample, toSample)
        const lufs = lufsFromMeanSquare(meanSquare)
        this.#integrated.pushBlock(lufs)
        const truePeak = fourTimesOversampleTruePeak(channels, fromSample, toSample)
        if (truePeak > this.#truePeak) {this.#truePeak = truePeak}
    }

    processEntireBuffer(channels: ReadonlyArray<Float32Array>): LoudnessResult {
        this.#filter.reset()
        this.#integrated.reset()
        this.#truePeak = Number.NEGATIVE_INFINITY
        const totalSamples = channels.length > 0 ? channels[0].length : 0
        const blockSize = Math.floor(BLOCK_SIZE_SECONDS * this.#sampleRate)
        const hopSize = Math.floor(HOP_SIZE_SECONDS * this.#sampleRate)
        for (let start = 0; start + blockSize <= totalSamples; start += hopSize) {
            this.processBlock(channels, start, start + blockSize)
        }
        return this.getResult("bs1770")
    }

    getResult(mode: GatingMode): LoudnessResult {
        return {
            integratedLUFS: this.#integrated.computeIntegratedLUFS(mode),
            momentaryMaxLUFS: this.#integrated.maxMomentary,
            shortTermMaxLUFS: this.#integrated.maxShortTerm,
            truePeakDbTP: this.#truePeak
        }
    }
}

class DefaultIntegratedBuffer {
    readonly #sampleRate: number
    readonly #blockLufsValues: Array<number> = new Array<number>()
    #ungatedMean: number = Number.NEGATIVE_INFINITY
    #gatedMean: number = Number.NEGATIVE_INFINITY
    #blockStartIndex: int = 0
    #maxMomentary: number = Number.NEGATIVE_INFINITY
    #maxShortTerm: number = Number.NEGATIVE_INFINITY

    constructor(sampleRate: number) {
        this.#sampleRate = sampleRate
    }

    reset(): void {
        this.#blockLufsValues.length = 0
        this.#ungatedMean = Number.NEGATIVE_INFINITY
        this.#gatedMean = Number.NEGATIVE_INFINITY
        this.#blockStartIndex = 0
        this.#maxMomentary = Number.NEGATIVE_INFINITY
        this.#maxShortTerm = Number.NEGATIVE_INFINITY
    }

    pushBlock(lufs: number): void {
        if (!isFinite(lufs)) {return}
        this.#blockLufsValues.push(lufs)
        if (lufs > this.#maxMomentary) {this.#maxMomentary = lufs}
        const shortTermBlocks = Math.floor(3.0 / HOP_SIZE_SECONDS)
        if (this.#blockLufsValues.length >= shortTermBlocks) {
            const window = this.#blockLufsValues.slice(-shortTermBlocks)
            const meanSquare = meanSquareOfLufs(window)
            if (meanSquare > 0.0) {
                const shortTermLUFS = lufsFromMeanSquare(meanSquare)
                if (shortTermLUFS > this.#maxShortTerm) {this.#maxShortTerm = shortTermLUFS}
            }
        }
        this.#ungatedMean = this.#recomputeMean(this.#blockLufsValues)
        if (this.#ungatedMean === Number.NEGATIVE_INFINITY) {return}
        const relativeGate = this.#ungatedMean - LUFS_RELATIVE_GATE_MARGIN
        const gated = this.#blockLufsValues.filter(value => value >= LUFS_ABSOLUTE_GATE && value >= relativeGate)
        if (gated.length >= MIN_GATED_BLOCKS) {this.#gatedMean = this.#recomputeMean(gated)}
    }

    computeIntegratedLUFS(mode: GatingMode): number {
        if (mode === "ungated") {return this.#ungatedMean}
        return this.#gatedMean
    }

    get maxMomentary(): number {return this.#maxMomentary}
    get maxShortTerm(): number {return this.#maxShortTerm}

    #recomputeMean(values: ReadonlyArray<number>): number {
        if (values.length === 0) {return Number.NEGATIVE_INFINITY}
        const meanSquare = meanSquareOfLufs(values)
        if (meanSquare <= 0.0) {return Number.NEGATIVE_INFINITY}
        return lufsFromMeanSquare(meanSquare)
    }
}

const meanSquareOfLufs = (lufsValues: ReadonlyArray<number>): number => {
    if (lufsValues.length === 0) {return 0.0}
    const linearValues = lufsValues.map(lufs => Math.pow(10.0, (lufs + 0.691) / 10.0))
    const sum = linearValues.reduce((accumulator, value) => accumulator + value, 0.0)
    return sum / lufsValues.length
}
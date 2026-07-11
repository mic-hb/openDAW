import {int, ObservableValue, Terminable} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter} from "@opendaw/studio-adapters"
import {StudioService} from "@/service/StudioService"
import {isDefined} from "@opendaw/lib-std"
import {AutoGainMethod, GatingMode} from "./config"

export type AutoGainResult = Map<number, number>

export type AnalysisStage = {
    index: int
    label: string
    weight: number
}

export type AutoGainConfig = {
    method: AutoGainMethod
    targetLUFS: number
    truePeakCeilingDbTP: number
    gatingMode: GatingMode
    previewAudioUnits: ReadonlyArray<AudioUnitBox>
}

export interface AutoGainStrategy extends Terminable {
    readonly stages: ObservableValue<ReadonlyArray<AnalysisStage>>
    readonly progress: ObservableValue<number>
    readonly currentStageIndex: ObservableValue<number>
    cancel(): void
    run(): Promise<AutoGainResult>
}

export const applyGainOffsets = (service: StudioService, result: AutoGainResult, units: ReadonlyArray<AudioUnitBox>): void => {
    service.project.editing.modify(() => {
        for (const [trackIndex, offset] of result) {
            const unit = units[trackIndex]
            if (!isDefined(unit)) continue
            const adapter = service.project.boxAdapters.adapterFor(unit, AudioUnitBoxAdapter)
            if (!isDefined(adapter)) continue
            const param = adapter.namedParameter.volume
            param.setUnitValue(param.valueMapping.x(offset))
        }
    })
}

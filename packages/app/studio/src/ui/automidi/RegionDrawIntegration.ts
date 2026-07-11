import {Dragging} from "@opendaw/lib-dom"
import {PPQN} from "@opendaw/lib-dsp"
import {isDefined, Nullable} from "@opendaw/lib-std"
import type {Modifier} from "@/ui/timeline/Modifier"

export interface RegionDrawRect {
    readonly startUnit: number
    readonly endUnit: number
}

export interface RegionDrawCommit {
    readonly startBar: number
    readonly endBar: number
    readonly trackId: string
}

interface UnitRange {
    xToUnit(x: number): number
    unitToX(unit: number): number
}

interface UnitSnapping {
    floor(unit: number): number
    ceil(unit: number): number
}

const MIN_DRAG_DISTANCE_PX = 4

export class AutomidiRegionDrawModifier implements Modifier {
    #startX: number = 0
    #endX: number = 0
    #startUnit: number = 0
    #endUnit: number = 0
    #active: boolean = false
    #moved: boolean = false
    #trackId: Nullable<string> = null

    constructor(
        private readonly range: UnitRange,
        private readonly snapping: UnitSnapping,
        private readonly xOffset: () => number,
        private readonly beatsPerBar: () => number,
        private readonly resolveTrackId: (y: number) => Nullable<string>,
        private readonly onUpdate: (rect: RegionDrawRect | null) => void,
        private readonly onCommit: (commit: RegionDrawCommit) => void,
        private readonly unitOffset: () => number = () => 0) {}

    update(event: Dragging.Event): void {
        if (!this.#active) {return}
        const offset = this.xOffset()
        const rawUnit = this.range.xToUnit(event.clientX - offset) + this.unitOffset()
        const unit = this.snapping.ceil(rawUnit)
        this.#endUnit = unit
        const snappedX = this.range.unitToX(unit - this.unitOffset()) + offset
        this.#endX = snappedX
        if (Math.abs(this.#endX - this.#startX) >= MIN_DRAG_DISTANCE_PX) {
            this.#moved = true
            this.onUpdate({
                startUnit: Math.min(this.#startUnit, this.#endUnit),
                endUnit: Math.max(this.#startUnit, this.#endUnit)
            })
        }
    }

    approve(): void {
        if (!this.#active) {return}
        if (this.#moved && isDefined(this.#trackId)) {
            const startUnit = Math.min(this.#startUnit, this.#endUnit)
            const endUnit = Math.max(this.#startUnit, this.#endUnit)
            const ppqnPerBar = this.beatsPerBar() * PPQN.Quarter
            const startBar = Math.floor(startUnit / ppqnPerBar)
            const endBar = Math.max(startBar + 1, Math.floor(endUnit / ppqnPerBar))
            this.onCommit({startBar, endBar, trackId: this.#trackId})
            this.#active = false
            this.#moved = false
        } else {
            this.reset()
        }
    }

    cancel(): void {
        this.reset()
    }

    start(event: PointerEvent): void {
        this.#active = true
        this.#moved = false
        const offset = this.xOffset()
        const rawUnit = this.range.xToUnit(event.clientX - offset) + this.unitOffset()
        const startUnit = this.snapping.floor(rawUnit)
        this.#startUnit = startUnit
        this.#endUnit = startUnit
        this.#startX = this.range.unitToX(startUnit - this.unitOffset()) + offset
        this.#endX = this.#startX
        this.#trackId = this.resolveTrackId(event.clientY)
    }

    private reset(): void {
        this.#active = false
        this.#moved = false
        this.onUpdate(null)
    }
}
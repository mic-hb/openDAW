import {StudioService} from "@/service/StudioService"

export const RegionDrawTool = (
    service: StudioService, 
    parent: HTMLElement, 
    range: {unitToX(u: number): number},
    unitOffset: number = 0
) => {
    const overlay = document.createElement("div")
    overlay.className = "automidi-region-overlay"
    const rect = document.createElement("div")
    rect.className = "automidi-region-rect hidden"
    overlay.appendChild(rect)
    parent.appendChild(overlay)
    
    // We also need to re-render if `range` changes (e.g. scroll, zoom).
    // The cleanest way without taking `range` as an observable is to use a ResizeObserver on parent
    // or just listen to the range observable if it was passed. 
    // Wait, range is a TimelineRange which IS an observable! But let's just listen to regionRect for now,
    // and rely on openDAW's requestAnimationFrame/scroll listeners if we wanted perfect scroll sync.
    // For now, let's just draw it.
    
    const draw = () => {
        const value = service.automidi.regionRect.getValue()
        if (value === null) {
            rect.classList.add("hidden")
            return
        }
        // `unitToX` returns absolute clientX in openDAW timeline range if not subtracted,
        // Wait! `range.unitToX` in openDAW usually returns pixels relative to the range's internal coordinate system?
        // Let's look at PitchEditor.tsx: 
        // `range.unitToX(position + reader.offset)` and then it multiplies by devicePixelRatio for canvas.
        // And `xToUnit(event.clientX - clientRect.left)`
        // This implies `unitToX` returns a value relative to the container's left edge!
        // Yes! `unitToX(unit)` -> pixels from the left edge of the timeline/editor.
        
        const startX = range.unitToX(value.startUnit - unitOffset)
        const endX = range.unitToX(value.endUnit - unitOffset)
        const width = Math.max(0, endX - startX)
        
        if (startX < 0 && endX < 0) {
            rect.classList.add("hidden")
            return
        }
        
        rect.classList.remove("hidden")
        rect.style.left = `${startX}px`
        rect.style.width = `${width}px`
    }

    service.automidi.regionRect.subscribe(draw)
    
    // Listen to range changes if it's an observable
    if (typeof (range as any).subscribe === "function") {
        (range as any).subscribe(draw)
    }

    return overlay
}
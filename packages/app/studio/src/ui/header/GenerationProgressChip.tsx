import css from "./GenerationProgressChip.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "GenerationProgressChip")

const replaceChildren = (el: HTMLElement): void => {
    while (el.firstChild) {el.removeChild(el.firstChild)}
}

export const GenerationProgressChip = ({lifecycle, service}: {lifecycle: import("@opendaw/lib-std").Lifecycle; service: StudioService}) => {
    const root: HTMLElement = <div className={`${className} hidden`}/>
    let lastStatus: string | null = null

    const render = (): void => {
        const status = service.automidi.status.getValue()
        if (status !== "queued" && status !== "generating") {
            root.classList.add("hidden")
            lastStatus = null
            return
        }
        root.classList.remove("hidden")
        replaceChildren(root)

        const total = service.automidi.totalVariations.getValue()
        const idx = service.automidi.currentVariationIndex.getValue()
        const pct = service.automidi.currentVariationProgress.getValue()
        const overall = service.automidi.progress.getValue()

        const icon = document.createElement("span")
        icon.className = "gen-chip-icon"
        icon.textContent = "✦"

        const text = document.createElement("span")
        text.className = "gen-chip-text"
        const totalLabel = total > 0 ? `Variation ${idx + 1}/${total}` : "Queued…"
        text.textContent = totalLabel

        const bar = document.createElement("div")
        bar.className = "gen-chip-bar"
        const fill = document.createElement("div")
        fill.className = "gen-chip-bar-fill"
        const visiblePct = total > 0 ? pct : overall
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, visiblePct)) * 100)}%`
        bar.appendChild(fill)

        const pctLabel = document.createElement("span")
        pctLabel.className = "gen-chip-pct"
        pctLabel.textContent = `${Math.round(visiblePct * 100)}%`

        const cancelBtn = document.createElement("button")
        cancelBtn.className = "gen-chip-cancel"
        cancelBtn.title = "Cancel generation"
        cancelBtn.textContent = "✕"
        cancelBtn.addEventListener("click", () => {
            void service.automidi.cancel()
        })

        root.appendChild(icon)
        root.appendChild(text)
        root.appendChild(bar)
        root.appendChild(pctLabel)
        root.appendChild(cancelBtn)

        const isFresh = status !== lastStatus
        lastStatus = status
        if (isFresh) {
            root.classList.remove("gen-chip-pulse")
            void root.offsetWidth
            root.classList.add("gen-chip-pulse")
        }
    }

    lifecycle.own(service.automidi.status.subscribe(render))
    lifecycle.own(service.automidi.currentVariationIndex.subscribe(render))
    lifecycle.own(service.automidi.currentVariationProgress.subscribe(render))
    lifecycle.own(service.automidi.totalVariations.subscribe(render))
    lifecycle.own(service.automidi.progress.subscribe(render))

    return root
}

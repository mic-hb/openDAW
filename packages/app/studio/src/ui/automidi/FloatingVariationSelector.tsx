import {StudioService} from "@/service/StudioService"
import {ConfidenceTooltip} from "./ConfidenceTooltip"
import {Dragging} from "@opendaw/lib-dom"
import {Option, Terminable} from "@opendaw/lib-std"

const replaceChildren = (el: HTMLElement): void => {
    while (el.firstChild) {el.removeChild(el.firstChild)}
}

const buildProgressBar = (pct: number): HTMLElement => {
    const bar = document.createElement("div")
    bar.className = "automidi-var-progress-bar"
    const fill = document.createElement("div")
    fill.className = "automidi-var-progress-fill"
    fill.style.width = `${Math.round(pct * 100)}%`
    bar.appendChild(fill)
    return bar
}

const COLOR_TEXT = "#EBEBF5"
const COLOR_TEXT_MUTED = "#EBEBF599"
const COLOR_ACCENT = "#AF52DE"

const closeButton = (onClick: () => void): HTMLElement => {
    const btn = document.createElement("button")
    btn.className = "automidi-var-close"
    btn.title = "Close"
    btn.textContent = "✕"
    btn.addEventListener("click", e => {
        e.stopPropagation()
        onClick()
    })
    return btn
}

const playRegion = (service: StudioService, idx: number): void => {
    // previewVariation creates the temporary NoteEventBoxes and starts
    // playback — the audio engine picks them up and plays them as if
    // they were already in the project.
    service.automidi.previewVariation(idx)
}

const modeAccent = (mode: string | null): string => {
    switch (mode) {
        case "continuation": return "#22c55e"
        case "infilling": return "#a855f7"
        case "variation": return "#f59e0b"
        default: return "#818cf8"
    }
}

export const FloatingVariationSelector = (service: StudioService, parent: HTMLElement) => {
    const root = document.createElement("div")
    root.className = "automidi-floating-variations hidden"
    parent.appendChild(root)

    let translateX = 0
    let translateY = 0
    let dragTerminable: Terminable | null = null

    const updateTransform = () => {
        root.style.transform = `translate(${translateX}px, ${translateY}px)`
    }

    const render = (): void => {
        const status = service.automidi.status.getValue()
        if (status !== "generating" && status !== "completed" && status !== "failed") {
            root.classList.add("hidden")
            return
        }
        root.classList.remove("hidden")

        dragTerminable?.terminate()
        dragTerminable = null
        replaceChildren(root)

        const variations = service.automidi.variations.getValue()
        const selectedIdx = service.automidi.selectedVariationIndex.getValue()
        const totalVariations = service.automidi.totalVariations.getValue()
        const currentIdx = service.automidi.currentVariationIndex.getValue()
        const currentPct = service.automidi.currentVariationProgress.getValue()
        const mode = service.automidi.mode.getValue()
        const accent = modeAccent(mode)

        // --- Retry / Close header (always visible on completed) ---
        if (status === "completed" || status === "failed") {
            const topBar = document.createElement("div")
            topBar.className = "automidi-var-topbar"
            const retryBtn = document.createElement("button")
            retryBtn.className = "automidi-var-retry-btn"
            retryBtn.style.setProperty("--btn-color", COLOR_ACCENT)
            retryBtn.innerHTML = `<span class="automidi-var-retry-icon">✦</span><span>${status === "failed" ? "Try Again" : "Retry"}</span>`
            retryBtn.addEventListener("click", () => {
                if (service.automidi.region.getValue() !== null) {
                    service.automidi.retryGeneration()
                } else {
                    service.automidi.rejectVariation()
                }
            })
            topBar.appendChild(retryBtn)
            topBar.appendChild(closeButton(() => service.automidi.rejectVariation()))
            root.appendChild(topBar)
        }

        // --- Title row ---
        const titleRow = document.createElement("div")
        titleRow.className = "automidi-var-title-row"
        const title = document.createElement("span")
        if (status === "failed") {
            title.textContent = "Generation Failed"
            title.style.color = "#f87171"
        } else {
            title.textContent = status === "generating" ? "Generating…" : "Select Variation"
            title.style.color = COLOR_TEXT
        }
        title.style.cssText += ";font-size:14px;font-weight:700;letter-spacing:-0.2px;"
        
        titleRow.style.cursor = "move"
        titleRow.style.userSelect = "none"
        
        dragTerminable = Dragging.attach(titleRow, (e: PointerEvent) => {
            const startX = translateX
            const startY = translateY
            const startPointerX = e.clientX
            const startPointerY = e.clientY
            return Option.wrap({
                update: (moveEvent) => {
                    translateX = startX + (moveEvent.clientX - startPointerX)
                    translateY = startY + (moveEvent.clientY - startPointerY)
                    updateTransform()
                }
            })
        })
        const count = document.createElement("span")
        count.textContent = `${variations.length} generated`
        count.style.cssText = `font-size:12px;color:${COLOR_TEXT_MUTED};`
        titleRow.appendChild(title)
        titleRow.appendChild(count)
        root.appendChild(titleRow)

        // --- Mode / region subtitle ---
        const subtitle = document.createElement("div")
        subtitle.className = "automidi-var-subtitle"
        const region = service.automidi.region.getValue()
        const modeLabel = mode === "continuation" ? "Continuation"
            : mode === "infilling" ? "In-filling"
            : mode === "variation" ? "Variation"
            : "Generation"
        subtitle.innerHTML = `<span class="automidi-var-mode-dot" style="background:${accent}"></span>`
            + `<span>${modeLabel} · Bar ${(region?.startBar ?? 0) + 1}–${region?.endBar ?? 0}</span>`
        root.appendChild(subtitle)

        // --- Global Progress Bar Removed (Moved to skeleton cards) ---

        // --- Error state when generation failed ---
        if (status === "failed") {
            const errorBox = document.createElement("div")
            errorBox.className = "automidi-var-error"
            const errorTitle = document.createElement("div")
            errorTitle.className = "automidi-var-error-title"
            errorTitle.textContent = "Generation failed"
            const errorMsg = document.createElement("div")
            errorMsg.className = "automidi-var-error-msg"
            errorMsg.textContent = service.automidi.error.getValue() ?? "Unknown error"
            errorBox.appendChild(errorTitle)
            errorBox.appendChild(errorMsg)
            root.appendChild(errorBox)
            return
        }

        // --- Empty state when completed but no variations ---
        if (status === "completed" && variations.length === 0) {
            const empty = document.createElement("div")
            empty.className = "automidi-var-empty"
            empty.innerHTML = `
                <div class="automidi-var-empty-title">No variations generated</div>
                <div class="automidi-var-empty-hint">Try adjusting: lower density, different instrument, or a different region.</div>
            `
            root.appendChild(empty)
            return
        }

        // --- Variation cards ---
        const totalToRender = status === "generating" ? Math.max(variations.length, totalVariations || 0) : variations.length
        for (let i = 0; i < totalToRender; i++) {
            const v = variations[i]
            const isPending = i >= variations.length

            const card = document.createElement("div")
            card.className = `automidi-variation-card ${i === selectedIdx ? "selected" : ""}`
            
            if (isPending) {
                card.classList.add("pending")
                const cardHeader = document.createElement("div")
                cardHeader.className = "automidi-variation-header"
                
                // Spinner/Loading icon instead of play button
                const loader = document.createElement("div")
                loader.className = "automidi-var-card-play pending-loader"
                loader.innerHTML = `<span class="automidi-spinner" style="animation: spin 1s linear infinite; display: inline-block;">⟳</span>`
                cardHeader.appendChild(loader)

                const cardInfo = document.createElement("div")
                cardInfo.className = "automidi-variation-info"
                const cardTitle = document.createElement("div")
                cardTitle.className = "automidi-variation-title"
                cardTitle.textContent = `Var ${i + 1}`
                const cardMeta = document.createElement("div")
                cardMeta.className = "automidi-variation-meta"
                cardMeta.style.color = COLOR_TEXT_MUTED
                cardMeta.textContent = i === currentIdx ? "Generating..." : "Waiting..."
                cardInfo.appendChild(cardTitle)
                cardInfo.appendChild(cardMeta)
                cardHeader.appendChild(cardInfo)
                card.appendChild(cardHeader)

                // Inline progress bar for the currently generating item
                if (i === currentIdx) {
                    const progContainer = document.createElement("div")
                    progContainer.style.padding = "12px 16px"
                    progContainer.appendChild(buildProgressBar(currentPct))
                    card.appendChild(progContainer)
                }

                root.appendChild(card)
                continue
            }

            const cardHeader = document.createElement("div")
            cardHeader.className = "automidi-variation-header"

            const playBtn = document.createElement("button")
            playBtn.className = "automidi-var-card-play"
            playBtn.title = "Preview this variation"
            const enginePlaying = service.project.engine.isPlaying.getValue()
            const isCurrent = enginePlaying && i === selectedIdx
            playBtn.textContent = isCurrent ? "⏸" : "▶"
            playBtn.addEventListener("click", e => {
                e.stopPropagation()
                playRegion(service, i)
            })
            cardHeader.appendChild(playBtn)

            const cardInfo = document.createElement("div")
            cardInfo.className = "automidi-variation-info"
            const cardTitle = document.createElement("div")
            cardTitle.className = "automidi-variation-title"
            cardTitle.textContent = `Var ${i + 1}`
            const cardMeta = document.createElement("div")
            cardMeta.className = "automidi-variation-meta"
            cardMeta.textContent = `${v.notes.length} notes`
            cardInfo.appendChild(cardTitle)
            cardInfo.appendChild(cardMeta)
            cardHeader.appendChild(cardInfo)

            const confidence = document.createElement("div")
            confidence.className = "automidi-variation-confidence"
            const confPct = Math.round(v.confidence * 100)
            confidence.innerHTML = `<div class="automidi-variation-confidence-pct">${confPct}%</div>`
                + ConfidenceTooltip({service, confidence: v.confidence, level: v.confidenceLevel}).outerHTML
            cardHeader.appendChild(confidence)

            card.appendChild(cardHeader)

            const cardActions = document.createElement("div")
            cardActions.className = "automidi-variation-card-actions"
            const acceptBtn = document.createElement("button")
            acceptBtn.className = "automidi-var-card-accept"
            acceptBtn.textContent = "Accept this variation"
            acceptBtn.addEventListener("click", e => {
                e.stopPropagation()
                service.automidi.selectVariation(i)
                service.automidi.acceptVariation()
            })
            cardActions.appendChild(acceptBtn)
            card.appendChild(cardActions)

            card.addEventListener("click", () => service.automidi.selectVariation(i))
            root.appendChild(card)
        }

        // --- Bottom action bar (Accept / Dismiss) ---
        if ((status === "completed" || status === "generating") && variations.length > 0) {
            const actionsBar = document.createElement("div")
            actionsBar.className = "automidi-var-actions-bar"
            const confirmBtn = document.createElement("button")
            confirmBtn.className = "automidi-var-confirm-btn"
            confirmBtn.textContent = `Accept Selected${variations.length > 1 ? ` (${variations.length})` : ""}`
            confirmBtn.addEventListener("click", () => service.automidi.acceptVariation())
            const dismissBtn = document.createElement("button")
            dismissBtn.className = "automidi-var-dismiss-btn"
            dismissBtn.textContent = "Dismiss All"
            dismissBtn.addEventListener("click", () => service.automidi.rejectVariation())
            actionsBar.appendChild(confirmBtn)
            actionsBar.appendChild(dismissBtn)
            root.appendChild(actionsBar)
        }

        // --- Footer hint ---
        const hint = document.createElement("div")
        hint.className = "automidi-var-hint"
        hint.textContent = "Play = full mix · Solo = generated track only · Click card to select"
        root.appendChild(hint)
    }

    service.automidi.variations.subscribe(render)
    service.automidi.selectedVariationIndex.subscribe(render)
    service.automidi.status.subscribe(render)
    service.automidi.region.subscribe(render)
    service.automidi.currentVariationProgress.subscribe(render)
    service.automidi.currentVariationIndex.subscribe(render)

    return root
}
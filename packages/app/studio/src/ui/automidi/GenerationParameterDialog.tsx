import css from "./GenerationParameterDialog.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {Terminable, Terminator, UUID, isInstanceOf} from "@opendaw/lib-std"
import {Surface} from "@/ui/surface/Surface"
import {StudioService} from "@/service/StudioService"
import {GM_PROGRAMS} from "@/automidi/gm-programs"
import {AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter} from "@opendaw/studio-adapters"

const className = Html.adoptStyleSheet(css, "generation-parameter-dialog")

const modeLabel = (mode: string | null): string => {
    switch (mode) {
        case "continuation": return "Continuation"
        case "infilling": return "In-filling"
        case "variation": return "Variation"
        default: return "Generate"
    }
}

const modeColor = (mode: string | null): string => {
    switch (mode) {
        case "continuation": return "var(--automidi-mode-continuation)"
        case "infilling": return "var(--automidi-mode-infilling)"
        case "variation": return "var(--automidi-mode-variation)"
        default: return "var(--automidi-accent)"
    }
}

/** Enumerate all TrackBox objects in the current project */
function enumerateTracks(service: StudioService): Array<{id: string; name: string}> {
    const project = service.automidi.project
    if (!project) return []
    const tracks: Array<{id: string; name: string}> = []
    const {boxAdapters} = project
    for (const ptr of project.rootBox.audioUnits.pointerHub.incoming()) {
        if (!isInstanceOf(ptr.box, AudioUnitBox)) {continue}
        const auBox = ptr.box as AudioUnitBox
        const auAdapter = boxAdapters.adapterFor(auBox, AudioUnitBoxAdapter)
        const auName = auAdapter.input.label.unwrapOrElse("Unnamed")
        for (const tPtr of auBox.tracks.pointerHub.incoming()) {
            if (!isInstanceOf(tPtr.box, TrackBox)) {continue}
            const tb = tPtr.box as TrackBox
            const trackId = UUID.toString(tb.address.uuid)
            tracks.push({id: trackId, name: auName})
        }
    }
    return tracks
}

export const GenerationParameterDialog = (service: StudioService): Terminable => {
    const lifecycle = new Terminator()
    const {automidi} = service
    const region = automidi.region.getValue()
    const mode = automidi.mode.getValue()
    const params = automidi.parameters.getValue()
    const color = modeColor(mode)

    // --- Region badge ---
    const regionBadge: HTMLElement = (
        <div className="region-badge" style={{color, background: `${color}22`, borderColor: `${color}44`}}>
            {modeLabel(mode)} · Bar {(region?.startBar ?? 0) + 1}–{region?.endBar ?? 0}
        </div>
    )

    // --- Top-P slider ---
    const topPValueEl: HTMLElement = <span className="param-value">{params.topP.toFixed(2)}</span>
    const topPInput = document.createElement("input")
    topPInput.type = "range"
    topPInput.min = "0.5"
    topPInput.max = "1.0"
    topPInput.step = "0.01"
    topPInput.value = String(params.topP)
    topPInput.className = "automidi-range-input"
    topPInput.addEventListener("input", () => {
        const v = Number(topPInput.value)
        automidi.setParam("topP", v)
        topPValueEl.textContent = v.toFixed(2)
    })

    // --- Temperature slider ---
    const tempValueEl: HTMLElement = <span className="param-value">{params.temperature.toFixed(2)}</span>
    const tempInput = document.createElement("input")
    tempInput.type = "range"
    tempInput.min = "0.1"
    tempInput.max = "2.0"
    tempInput.step = "0.01"
    tempInput.value = String(params.temperature)
    tempInput.className = "automidi-range-input"
    tempInput.addEventListener("input", () => {
        const v = Number(tempInput.value)
        automidi.setParam("temperature", v)
        tempValueEl.textContent = v.toFixed(2)
    })

    // --- Num variations buttons ---
    const varBtnContainer: HTMLElement = <div className="num-var-buttons"/>
    const varButtons: HTMLButtonElement[] = []
    for (let i = 1; i <= 5; i++) {
        const btn = document.createElement("button") as HTMLButtonElement
        btn.className = `var-btn ${params.numVariations === i ? "active" : ""}`
        btn.textContent = String(i)
        btn.style.setProperty("--active-color", color)
        const n = i
        btn.addEventListener("click", () => {
            automidi.setParam("numVariations", n)
            varButtons.forEach((b, idx) => b.classList.toggle("active", idx + 1 === n))
        })
        varButtons.push(btn)
        varBtnContainer.appendChild(btn)
    }

    // --- LoRA selector ---
    const loraSelect = document.createElement("select")
    loraSelect.className = "param-select"
    lifecycle.own(automidi.lora.status.subscribe(loraStatus => {
        loraSelect.innerHTML = ""
        const noneOpt = document.createElement("option")
        noneOpt.value = ""
        noneOpt.textContent = "No LoRA adapter"
        loraSelect.appendChild(noneOpt)
        if (loraStatus) {
            for (const ckpt of loraStatus.available) {
                const opt = document.createElement("option")
                opt.value = ckpt.id
                opt.textContent = `${ckpt.label} (r${ckpt.rank})`
                if (ckpt.id === loraStatus.active) opt.selected = true
                loraSelect.appendChild(opt)
            }
        }
    }))
    loraSelect.addEventListener("change", () => {
        void automidi.lora.select(loraSelect.value || null)
    })

    // --- Track toggles ---
    const tracks = enumerateTracks(service)
    const contextTrackIds = new Set<string>(automidi.contextTrackIds.getValue())
    const targetTrackIds = new Set<string>(automidi.targetTrackIds.getValue())

    const trackRows: HTMLElement = <div className="track-selection-grid"/>

    if (tracks.length > 0) {
        // Header
        const hdr: HTMLElement = (
            <div className="track-grid-header">
                <span/>
                <span style={{textAlign: "center"}}>Input (Context)</span>
                <span style={{textAlign: "center"}}>Output (Generate)</span>
            </div>
        )
        trackRows.appendChild(hdr)
        for (const track of tracks) {
            const ctxCheck = document.createElement("input")
            ctxCheck.type = "checkbox"
            ctxCheck.checked = contextTrackIds.has(track.id)
            ctxCheck.addEventListener("change", () => {
                if (ctxCheck.checked) contextTrackIds.add(track.id)
                else contextTrackIds.delete(track.id)
                automidi.setContextTrackIds(Array.from(contextTrackIds))
            })
            const tgtCheck = document.createElement("input")
            tgtCheck.type = "checkbox"
            tgtCheck.checked = targetTrackIds.has(track.id)
            tgtCheck.addEventListener("change", () => {
                if (tgtCheck.checked) targetTrackIds.add(track.id)
                else targetTrackIds.delete(track.id)
                automidi.setTargetTrackIds(Array.from(targetTrackIds))
            })
            const row: HTMLElement = (
                <div className="track-grid-row">
                    <span className="track-name-cell">{track.name}</span>
                    <span className="track-check-cell">{ctxCheck}</span>
                    <span className="track-check-cell">{tgtCheck}</span>
                </div>
            )
            trackRows.appendChild(row)
        }
    }

    // --- GM program mapping ---
    const gmRows: HTMLElement = <div className="gm-rows"/>
    const gmOverrides = automidi.trackGmOverrides.getValue()
    for (const [trackId, override] of gmOverrides) {
        const trackName = tracks.find(t => t.id === trackId)?.name ?? trackId.slice(0, 8)
        const pgSelect = document.createElement("select")
        pgSelect.className = "param-select gm-select"
        for (const entry of GM_PROGRAMS) {
            const opt = document.createElement("option")
            opt.value = String(entry.program)
            opt.textContent = `${entry.program} — ${entry.name}`
            if (entry.program === override.midiProgram) opt.selected = true
            pgSelect.appendChild(opt)
        }
        pgSelect.addEventListener("change", () => automidi.setTrackGmProgram(trackId, Number(pgSelect.value)))

        const drumCheck = document.createElement("input")
        drumCheck.type = "checkbox"
        drumCheck.checked = Boolean(override.midiIsDrum)
        drumCheck.addEventListener("change", () => automidi.setTrackMidiIsDrum(trackId, drumCheck.checked))

        const row: HTMLElement = (
            <div className="gm-row">
                <span className="gm-track-name">{trackName}</span>
                {pgSelect}
                <label className="gm-drum-label">{drumCheck} Drum kit</label>
            </div>
        )
        gmRows.appendChild(row)
    }

    // --- Progress + error ---
    const progressEl: HTMLElement = <div className="gen-progress hidden"/>
    const errorEl: HTMLElement = <div className="gen-error hidden"/>

    const updateStatus = () => {
        const status = automidi.status.getValue()
        if (status === "queued" || status === "generating") {
            progressEl.classList.remove("hidden")
            const tot = automidi.totalVariations.getValue()
            const idx = automidi.currentVariationIndex.getValue()
            const pct = automidi.currentVariationProgress.getValue()
            progressEl.textContent = tot > 0
                ? `Generating variation ${idx + 1}/${tot} — ${Math.round(pct * 100)}%`
                : "Generating…"
        } else {
            progressEl.classList.add("hidden")
        }
        if (status === "failed") {
            errorEl.classList.remove("hidden")
            errorEl.textContent = automidi.error.getValue() ?? "Generation failed"
        } else {
            errorEl.classList.add("hidden")
        }
        if (status === "completed") {
            dialog.close()
        }
    }
    lifecycle.own(automidi.status.subscribe(updateStatus))
    lifecycle.own(automidi.currentVariationProgress.subscribe(updateStatus))

    // Close the parameter dialog as soon as the request is sent so
    // the user sees the polling progress on the top toolbar instead.
    const closeOnGenerate = () => {
        const status = automidi.status.getValue()
        if (status === "queued" || status === "generating") {
            dialog.close()
        }
    }
    lifecycle.own(automidi.status.subscribe(closeOnGenerate))

    // --- Generate button ---
    const generateBtn = document.createElement("button")
    generateBtn.className = "generate-btn"
    generateBtn.style.setProperty("--btn-color", color)
    generateBtn.innerHTML = `<span>✦ Generate</span>`
    generateBtn.addEventListener("click", () => {
        void automidi.commitParametersAndGenerate()
    })

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "cancel-btn"
    cancelBtn.textContent = "Cancel"
    cancelBtn.addEventListener("click", () => {
        void automidi.cancel()
        dialog.close()
    })

    const resetBtn = document.createElement("button")
    resetBtn.className = "reset-btn"
    resetBtn.textContent = "↺"
    resetBtn.title = "Reset parameters"
    resetBtn.addEventListener("click", () => {
        topPInput.value = "0.95"
        topPValueEl.textContent = "0.95"
        automidi.setParam("topP", 0.95)
        tempInput.value = "1.00"
        tempValueEl.textContent = "1.00"
        automidi.setParam("temperature", 1.0)
        automidi.setParam("numVariations", 3)
        varButtons.forEach((b, i) => b.classList.toggle("active", i === 2))
    })

    const content: HTMLElement = (
        <div className={className}>
            <div className="pd-header">
                <div className="pd-title">
                    <span className="pd-mode-icon" style={{color}}>✦</span>
                    <span className="pd-mode-name">{modeLabel(mode)}</span>
                </div>
                <p className="pd-subtitle">Adjust parameters and generate AI music.</p>
                {regionBadge}
            </div>

            <div className="pd-body">
                <section className="pd-section">
                    <div className="pd-section-header">
                        <span className="pd-section-title">Creativity (Top-P)</span>
                        {topPValueEl}
                    </div>
                    <div className="pd-slider-row">
                        <span className="slider-hint">0.5 (Focused)</span>
                        {topPInput}
                        <span className="slider-hint">1.0 (Creative)</span>
                    </div>
                    <p className="pd-hint">Higher values produce more creative, diverse output.</p>
                </section>

                <section className="pd-section">
                    <div className="pd-section-header">
                        <span className="pd-section-title">Temperature</span>
                        {tempValueEl}
                    </div>
                    <div className="pd-slider-row">
                        <span className="slider-hint">0.1 (Stable)</span>
                        {tempInput}
                        <span className="slider-hint">2.0 (Wild)</span>
                    </div>
                    <p className="pd-hint">Lower values stick to the model's top picks; higher values allow more randomness.</p>
                </section>

                <section className="pd-section">
                    <span className="pd-section-title">Number of Variations</span>
                    {varBtnContainer}
                    <p className="pd-hint">How many alternative generations to produce.</p>
                </section>

                <section className="pd-section">
                    <span className="pd-section-title">LoRA Adapter</span>
                    {loraSelect}
                </section>

                {tracks.length > 0 && (
                    <section className="pd-section">
                        <span className="pd-section-title">Track Selection</span>
                        {trackRows}
                    </section>
                )}

                {gmOverrides.size > 0 && (
                    <details className="pd-section pd-details">
                        <summary className="pd-section-title">Instrument Mapping (GM Program)</summary>
                        {gmRows}
                    </details>
                )}

                {progressEl}
                {errorEl}
            </div>

            <div className="pd-footer">
                {resetBtn}
                {cancelBtn}
                {generateBtn}
            </div>
        </div>
    )

    const dialog: HTMLDialogElement = document.createElement("dialog")
    dialog.className = "automidi-modal automidi-param-modal"
    dialog.appendChild(content)

    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {dialog.close()}
    })

    dialog.addEventListener("close", () => {
        const status = automidi.status.getValue()
        if (status === "configuring-parameters" || status === "selecting-mode") {
            // User dismissed while still configuring — reset the state machine.
            automidi.closeDialog()
        }
        // If status is queued/generating/completed/failed/cancelled, leave
        // the state machine alone — the dialog is closing because generation
        // started (not because the user cancelled).
        lifecycle.terminate()
    }, {once: true})

    Surface.get().body.appendChild(dialog)
    dialog.showModal()

    // Refresh lora list
    void automidi.lora.refresh()

    return lifecycle
}

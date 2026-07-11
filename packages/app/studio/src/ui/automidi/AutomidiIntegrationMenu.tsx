import {StudioService} from "@/service/StudioService"
import {Dragging} from "@opendaw/lib-dom"
import {Option, Terminable} from "@opendaw/lib-std"
import {AutomidiPreferences} from "@/automidi/config"
import type {TelemetryResponse} from "@/automidi/types"

const COLOR_TEXT = "#EBEBF5"
const COLOR_TEXT_MUTED = "#EBEBF599"

const closeButton = (onClick: () => void): HTMLElement => {
    const btn = document.createElement("button")
    btn.className = "automidi-var-close"
    btn.title = "Close"
    btn.textContent = "✕"
    btn.addEventListener("pointerdown", e => {
        e.stopPropagation()
        onClick()
    })
    return btn
}

const createSignalBars = (pct: number): HTMLElement => {
    const container = document.createElement("div")
    container.style.display = "flex"
    container.style.gap = "2px"
    container.style.alignItems = "flex-end"
    container.style.height = "12px"

    let activeBars = 0
    let color = "#ef4444" // red
    if (pct < 20) {
        activeBars = 1
        color = "#22c55e" // green
    } else if (pct < 40) {
        activeBars = 2
        color = "#22c55e"
    } else if (pct < 60) {
        activeBars = 3
        color = "#eab308" // yellow
    } else if (pct < 80) {
        activeBars = 4
        color = "#eab308"
    } else {
        activeBars = 5
        color = "#ef4444"
    }
    
    // For ping, pct might be 0 but we want green 5 bars. We will handle ping separately.
    // If we want ping, we pass pct as (100 - pingScore).

    for (let i = 0; i < 5; i++) {
        const bar = document.createElement("div")
        bar.style.width = "4px"
        bar.style.height = `${4 + i * 2}px`
        bar.style.borderRadius = "1px"
        bar.style.backgroundColor = i < activeBars ? color : "rgba(255,255,255,0.1)"
        container.appendChild(bar)
    }
    
    return container
}

export const AutomidiIntegrationMenu = (service: StudioService, parent: HTMLElement) => {
    const root = document.createElement("div")
    root.className = "automidi-floating-variations hidden"
    root.style.width = "380px"
    root.style.zIndex = "9999" // ensure always on top
    parent.appendChild(root)

    let translateX = 0
    let translateY = 0
    let dragTerminable: Terminable | null = null
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const updateTransform = () => {
        root.style.transform = `translate(${translateX}px, ${translateY}px)`
    }

    const render = (): void => {
        const isOpen = service.automidi.isIntegrationMenuOpen.getValue()
        if (!isOpen) {
            root.classList.add("hidden")
            if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
            }
            return
        }
        root.classList.remove("hidden")

        dragTerminable?.terminate()
        dragTerminable = null
        while (root.firstChild) {root.removeChild(root.firstChild)}

        // --- Title row ---
        const titleRow = document.createElement("div")
        titleRow.className = "automidi-var-title-row"
        const title = document.createElement("span")
        title.textContent = "AutoMIDI Diagnostics"
        title.style.color = COLOR_TEXT
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
        
        titleRow.appendChild(title)
        titleRow.appendChild(closeButton(() => service.automidi.toggleIntegrationMenu()))
        root.appendChild(titleRow)

        // --- Status Panel ---
        const statusPanel = document.createElement("div")
        statusPanel.style.padding = "16px"
        statusPanel.style.display = "flex"
        statusPanel.style.flexDirection = "column"
        statusPanel.style.gap = "12px"
        
        const createRow = (label: string) => {
            const row = document.createElement("div")
            row.style.display = "flex"
            row.style.justifyContent = "space-between"
            row.style.alignItems = "center"
            
            const labelEl = document.createElement("span")
            labelEl.textContent = label
            labelEl.style.color = COLOR_TEXT_MUTED
            labelEl.style.fontSize = "12px"
            row.appendChild(labelEl)
            
            const rightSide = document.createElement("div")
            rightSide.style.display = "flex"
            rightSide.style.alignItems = "center"
            rightSide.style.gap = "8px"
            row.appendChild(rightSide)
            return { row, rightSide }
        }

        // 1. Connection (Ping)
        const pingRow = createRow("Connection")
        const pingLabel = document.createElement("span")
        pingLabel.style.color = COLOR_TEXT
        pingLabel.style.fontSize = "13px"
        pingLabel.textContent = "Checking..."
        let pingBars = createSignalBars(0)
        pingRow.rightSide.appendChild(pingLabel)
        pingRow.rightSide.appendChild(pingBars)
        statusPanel.appendChild(pingRow.row)

        // 2. Model Status
        const modelRow = createRow("AMT Model")
        const modelIndicator = document.createElement("div")
        modelIndicator.style.width = "8px"
        modelIndicator.style.height = "8px"
        modelIndicator.style.borderRadius = "50%"
        modelIndicator.style.backgroundColor = "#555"
        const modelLabel = document.createElement("span")
        modelLabel.style.color = COLOR_TEXT
        modelLabel.style.fontSize = "13px"
        modelLabel.textContent = "Unknown"
        modelRow.rightSide.appendChild(modelIndicator)
        modelRow.rightSide.appendChild(modelLabel)
        statusPanel.appendChild(modelRow.row)
        
        // 3. GPU VRAM
        const gpuRow = createRow("GPU VRAM")
        const gpuLabel = document.createElement("span")
        gpuLabel.style.color = COLOR_TEXT
        gpuLabel.style.fontSize = "13px"
        gpuLabel.textContent = "N/A"
        let gpuBars = createSignalBars(0)
        gpuRow.rightSide.appendChild(gpuLabel)
        gpuRow.rightSide.appendChild(gpuBars)
        statusPanel.appendChild(gpuRow.row)

        // 3b. GPU Compute
        const computeRow = createRow("GPU Compute")
        const computeLabel = document.createElement("span")
        computeLabel.style.color = COLOR_TEXT
        computeLabel.style.fontSize = "13px"
        computeLabel.textContent = "N/A"
        let computeBars = createSignalBars(0)
        computeRow.rightSide.appendChild(computeLabel)
        computeRow.rightSide.appendChild(computeBars)
        statusPanel.appendChild(computeRow.row)

        // 4. Queue
        const queueRow = createRow("Worker Queue")
        const queueLabel = document.createElement("span")
        queueLabel.style.color = COLOR_TEXT
        queueLabel.style.fontSize = "13px"
        queueLabel.textContent = "0 pending"
        queueRow.rightSide.appendChild(queueLabel)
        statusPanel.appendChild(queueRow.row)

        root.appendChild(statusPanel)

        // --- Model Actions ---
        const actionRow = document.createElement("div")
        actionRow.style.padding = "0 16px"
        actionRow.style.display = "flex"
        actionRow.style.gap = "8px"
        
        const btnStyle = "background: rgba(255,255,255,0.1); border: none; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;"
        
        const loadBtn = document.createElement("button")
        loadBtn.textContent = "Load Model"
        loadBtn.style.cssText = btnStyle
        loadBtn.addEventListener("click", () => { service.automidi.api.loadModel() })
        
        const unloadBtn = document.createElement("button")
        unloadBtn.textContent = "Unload"
        unloadBtn.style.cssText = btnStyle
        unloadBtn.addEventListener("click", () => { service.automidi.api.unloadModel() })
        
        const reloadBtn = document.createElement("button")
        reloadBtn.textContent = "Reload"
        reloadBtn.style.cssText = btnStyle
        reloadBtn.addEventListener("click", () => { service.automidi.api.reloadModel() })
        
        actionRow.appendChild(loadBtn)
        actionRow.appendChild(unloadBtn)
        actionRow.appendChild(reloadBtn)
        root.appendChild(actionRow)

        // --- Panic Button ---
        const panicRow = document.createElement("div")
        panicRow.style.padding = "12px 16px"
        
        const panicBtn = document.createElement("button")
        panicBtn.textContent = "PANIC (Cancel All Tasks)"
        panicBtn.style.cssText = "width: 100%; background: #dc2626; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer;"
        panicBtn.addEventListener("click", () => { service.automidi.api.cancelAllTasks() })
        panicRow.appendChild(panicBtn)
        root.appendChild(panicRow)

        // Poll backend status
        const checkStatus = async () => {
            const start = Date.now()
            try {
                const tel: TelemetryResponse = await service.automidi.api.getTelemetry()
                const ping = Date.now() - start
                
                // Ping UI
                pingLabel.textContent = `${ping}ms`
                let pingPct = 0
                if (ping < 50) pingPct = 10 // 5 green bars (ping is reverse, lower is better)
                else if (ping < 100) pingPct = 30 // 4 green
                else if (ping < 200) pingPct = 50 // 3 yellow
                else if (ping < 500) pingPct = 70 // 2 yellow
                else pingPct = 90 // 1 red
                // For ping, the bars logic needs to be inverted if we want 5 bars for good.
                // Our createSignalBars puts 5 bars for high pct (bad). 
                // So if ping is GOOD, pct should be LOW to get green bars? No, user said 1 bar = 0-19% (green).
                // But usually 5 bars green = good signal. Let's stick to the prompt's mapping:
                // 1 green = 0-19%, 2 green = 20-39%, etc. So for PING, low ping = low % = 1 green bar?
                // Actually the prompt said: "5-bar strength indicator (e.g. 1 green bar for 0-19%, ... 5 red bars for 80-100%)"
                // Let's just use that literally for everything to represent LOAD or LATENCY. 
                // So low ping = 1 green bar, high ping = 5 red bars.
                pingRow.rightSide.removeChild(pingBars)
                pingBars = createSignalBars(pingPct)
                pingRow.rightSide.appendChild(pingBars)

                // Model UI
                if (tel.model_loaded) {
                    modelIndicator.style.backgroundColor = "#22c55e"
                    modelLabel.textContent = "Loaded"
                } else {
                    modelIndicator.style.backgroundColor = "#ef4444"
                    modelLabel.textContent = "Unloaded"
                }

                // GPU VRAM UI
                if (tel.gpu_utilization_pct !== null && tel.gpu_allocated_mb !== null && tel.gpu_total_mb !== null) {
                    gpuLabel.textContent = `${(tel.gpu_allocated_mb / 1024).toFixed(2)} / ${(tel.gpu_total_mb / 1024).toFixed(2)}GB (${tel.gpu_utilization_pct.toFixed(1)}%)`
                    gpuRow.rightSide.removeChild(gpuBars)
                    gpuBars = createSignalBars(tel.gpu_utilization_pct)
                    gpuRow.rightSide.appendChild(gpuBars)
                } else {
                    gpuLabel.textContent = "CPU Mode"
                }

                // GPU Compute UI
                if (tel.gpu_compute_pct !== null) {
                    computeLabel.textContent = `${tel.gpu_compute_pct.toFixed(1)}%`
                    computeRow.rightSide.removeChild(computeBars)
                    computeBars = createSignalBars(tel.gpu_compute_pct)
                    computeRow.rightSide.appendChild(computeBars)
                } else {
                    computeLabel.textContent = "N/A"
                }

                // Queue UI
                queueLabel.textContent = `${tel.queue_size} pending`

            } catch (e) {
                pingLabel.textContent = "Disconnected"
                pingRow.rightSide.removeChild(pingBars)
                pingBars = createSignalBars(100) // 5 red bars
                pingRow.rightSide.appendChild(pingBars)
                
                modelIndicator.style.backgroundColor = "#ef4444"
                modelLabel.textContent = "Unknown"
            }
        }
        
        if (!pollInterval) {
            checkStatus()
            pollInterval = setInterval(checkStatus, 3000)
        }

        // --- Configuration Form ---
        const formContainer = document.createElement("div")
        formContainer.style.padding = "8px 16px 16px 16px"
        formContainer.style.display = "flex"
        formContainer.style.flexDirection = "column"
        formContainer.style.gap = "12px"
        formContainer.style.borderTop = "1px solid rgba(255,255,255,0.1)"

        const settings = AutomidiPreferences.settings

        // URL Input
        const urlGroup = document.createElement("div")
        urlGroup.style.display = "flex"
        urlGroup.style.flexDirection = "column"
        urlGroup.style.gap = "4px"
        const urlLabel = document.createElement("label")
        urlLabel.textContent = "Custom Backend URL"
        urlLabel.style.fontSize = "12px"
        urlLabel.style.color = COLOR_TEXT_MUTED
        const urlInput = document.createElement("input")
        urlInput.type = "text"
        urlInput.value = settings.apiUrl
        urlInput.className = "automidi-var-input" 
        urlInput.style.cssText = "background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px 8px; border-radius: 4px; font-size: 13px;"
        urlGroup.appendChild(urlLabel)
        urlGroup.appendChild(urlInput)
        formContainer.appendChild(urlGroup)

        // Timeout Input
        const timeoutGroup = document.createElement("div")
        timeoutGroup.style.display = "flex"
        timeoutGroup.style.flexDirection = "column"
        timeoutGroup.style.gap = "4px"
        const timeoutLabel = document.createElement("label")
        timeoutLabel.textContent = "Generation Timeout (ms)"
        timeoutLabel.style.fontSize = "12px"
        timeoutLabel.style.color = COLOR_TEXT_MUTED
        const timeoutInput = document.createElement("input")
        timeoutInput.type = "number"
        timeoutInput.value = settings.generationTimeoutMs.toString()
        timeoutInput.style.cssText = "background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px 8px; border-radius: 4px; font-size: 13px;"
        timeoutGroup.appendChild(timeoutLabel)
        timeoutGroup.appendChild(timeoutInput)
        formContainer.appendChild(timeoutGroup)

        // Actions
        const actionsBar = document.createElement("div")
        actionsBar.className = "automidi-var-actions-bar"
        actionsBar.style.marginTop = "8px"
        
        const saveBtn = document.createElement("button")
        saveBtn.className = "automidi-var-confirm-btn"
        saveBtn.textContent = "Save Settings"
        saveBtn.addEventListener("click", () => {
            AutomidiPreferences.settings.apiUrl = urlInput.value
            AutomidiPreferences.settings.generationTimeoutMs = parseInt(timeoutInput.value) || 120000
            checkStatus()
        })
        
        const resetBtn = document.createElement("button")
        resetBtn.className = "automidi-var-dismiss-btn"
        resetBtn.textContent = "Reset Defaults"
        resetBtn.addEventListener("click", () => {
            AutomidiPreferences.settings.apiUrl = "http://localhost:8000/api"
            AutomidiPreferences.settings.generationTimeoutMs = 120000
            urlInput.value = "http://localhost:8000/api"
            timeoutInput.value = "120000"
            checkStatus()
        })
        
        actionsBar.appendChild(saveBtn)
        actionsBar.appendChild(resetBtn)
        formContainer.appendChild(actionsBar)
        
        root.appendChild(formContainer)
    }

    service.automidi.isIntegrationMenuOpen.subscribe(render)
    return root
}

import {createElement} from "@opendaw/lib-jsx"
import {RuntimeNotifier} from "@opendaw/lib-std"
import {Surface} from "@/ui/surface/Surface"
import {Dialog} from "@/ui/components/Dialog"
import {Colors, IconSymbol} from "@opendaw/studio-enums"
import {Terminable, Terminator} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import {ParameterControls} from "./ParameterControls"
import {GmProgramMappingSection} from "./GmProgramMappingSection"
import type {Mode} from "@/automidi/types"

const modeColor = (mode: Mode | null): string => {
    switch (mode) {
        case "continuation": return "var(--automidi-mode-continuation)"
        case "infilling": return "var(--automidi-mode-infilling)"
        case "variation": return "var(--automidi-mode-variation)"
        default: return "var(--automidi-text-3)"
    }
}

const modeButton = (mode: Mode, label: string, service: StudioService): HTMLElement => {
    const btn = document.createElement("button")
    btn.className = "menu-button"
    btn.textContent = label
    btn.dataset["mode"] = mode
    btn.addEventListener("click", () => service.automidi.setMode(mode))
    return btn
}

export const GenerationDialog = (service: StudioService): Terminable => {
    const lifecycle = new Terminator()
    const content = document.createElement("div")
    content.className = "automidi-generation-content"

    const modeButtons = document.createElement("div")
    modeButtons.className = "automidi-mode-buttons"
    modeButtons.appendChild(modeButton("continuation", "Continuation", service))
    modeButtons.appendChild(modeButton("infilling", "Infilling", service))
    modeButtons.appendChild(modeButton("variation", "Variation", service))
    content.appendChild(modeButtons)

    content.appendChild(ParameterControls(service))
    content.appendChild(GmProgramMappingSection(service))

    const progress = document.createElement("div")
    progress.className = "automidi-progress hidden"
    content.appendChild(progress)

    const errorBanner = document.createElement("div")
    errorBanner.className = "automidi-error-banner hidden"
    content.appendChild(errorBanner)

    const actions = document.createElement("div")
    actions.className = "automidi-actions"
    const cancelBtn = document.createElement("button")
    cancelBtn.className = "menu-button"
    cancelBtn.textContent = "Cancel"
    cancelBtn.addEventListener("click", () => {void service.automidi.cancel()})
    const generateBtn = document.createElement("button")
    generateBtn.className = "menu-button primary"
    generateBtn.textContent = "Generate"
    generateBtn.addEventListener("click", () => {
        if (service.automidi.duplicatePrograms.length > 0) {
            RuntimeNotifier.info({headline: "Cannot generate", message: "Resolve duplicate GM programs first."})
            return
        }
        if (!service.automidi.mode.getValue()) {
            service.automidi.setMode("continuation")
        }
        service.automidi.requestRegionDraw()
    })
    actions.appendChild(cancelBtn)
    actions.appendChild(generateBtn)
    content.appendChild(actions)

    lifecycle.own(service.automidi.status.subscribe(() => {
        const status = service.automidi.status.getValue()
        if (status === "configuring-parameters") errorBanner.classList.add("hidden")
        if (status === "generating" || status === "queued") {
            progress.classList.remove("hidden")
            const total = service.automidi.totalVariations.getValue()
            const idx = service.automidi.currentVariationIndex.getValue()
            const pct = service.automidi.currentVariationProgress.getValue()
            progress.textContent = `Variation ${idx + 1}/${total} — ${Math.round(pct * 100)}%`
        } else {
            progress.classList.add("hidden")
        }
        if (status === "failed") {
            const msg = service.automidi.error.getValue() ?? "Generation failed"
            errorBanner.textContent = msg
            errorBanner.classList.remove("hidden")
        }
    }))
    lifecycle.own(service.automidi.mode.subscribe(() => {
        const mode = service.automidi.mode.getValue()
        for (const button of modeButtons.querySelectorAll("button")) {
            const value = (button as HTMLElement).dataset["mode"]
            if (value === mode) {
                button.classList.add("active")
                ;(button as HTMLElement).style.borderColor = modeColor(mode)
            } else {
                button.classList.remove("active")
                ;(button as HTMLElement).style.borderColor = "var(--automidi-border)"
            }
        }
    }))

    const dialog: HTMLDialogElement = (
        <Dialog headline="Generate"
                icon={IconSymbol.System}
                cancelable={true}
                buttons={[]}>
            {content}
        </Dialog>
    )
    dialog.style.color = Colors.dark.toString()
    dialog.addEventListener("close", () => {
        service.automidi.closeDialog()
        lifecycle.terminate()
    }, {once: true})
    Surface.get().body.appendChild(dialog)
    dialog.showModal()
    return lifecycle
}
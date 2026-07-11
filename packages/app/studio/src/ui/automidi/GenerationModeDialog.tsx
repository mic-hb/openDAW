import css from "./GenerationModeDialog.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {Terminable, Terminator} from "@opendaw/lib-std"
import {Surface} from "@/ui/surface/Surface"
import {StudioService} from "@/service/StudioService"
import type {Mode} from "@/automidi/types"

const className = Html.adoptStyleSheet(css, "generation-mode-dialog")

interface ModeCardProps {
    mode: Mode
    label: string
    icon: string
    description: string
    color: string
    diagramLabel: string
}

const MODES: ModeCardProps[] = [
    {
        mode: "continuation",
        label: "Continuation",
        icon: "→",
        description: "Extend the composition forward in time, conditioned on past notes.",
        color: "var(--automidi-mode-continuation)",
        diagramLabel: "Past notes → New notes",
    },
    {
        mode: "infilling",
        label: "In-filling",
        icon: "⊟",
        description: "Fill in a blank section. The selected region is treated as empty — conditioned on past and future notes.",
        color: "var(--automidi-mode-infilling)",
        diagramLabel: "Past + Future → Fill gap",
    },
    {
        mode: "variation",
        label: "Variation",
        icon: "↗",
        description: "Suggest alternatives for an existing section. Conditioned on past, future, and selected notes.",
        color: "var(--automidi-mode-variation)",
        diagramLabel: "Past + Region + Future → Alternative",
    },
]

export const GenerationModeDialog = (service: StudioService): Terminable => {
    const lifecycle = new Terminator()

    const cards: HTMLElement[] = MODES.map(({mode, label, icon, description, color, diagramLabel}) => {
        const card: HTMLElement = (
            <div className="mode-card" style={{borderColor: "transparent"}}>
                <div className="mode-card-header">
                    <span className="mode-icon" style={{color}}>{icon}</span>
                    <span className="mode-label">{label}</span>
                </div>
                <p className="mode-desc">{description}</p>
                <div className="mode-diagram" style={{borderColor: color, color: "var(--automidi-text-3)"}}>
                    {diagramLabel}
                </div>
            </div>
        )
        card.addEventListener("mouseenter", () => card.style.borderColor = color)
        card.addEventListener("mouseleave", () => card.style.borderColor = "transparent")
        card.addEventListener("click", () => {
            dialog.close()
            service.automidi.selectMode(mode)
        })
        return card
    })

    const legend: HTMLElement = (
        <div className="mode-legend">
            <span className="legend-item"><span className="legend-dot" style={{background: "var(--automidi-mode-continuation)"}}/>Past notes</span>
            <span className="legend-item"><span className="legend-dot" style={{background: "var(--automidi-accent-2)"}}/>Future notes</span>
            <span className="legend-item"><span className="legend-dot legend-dashed"/>Selected region (AMT generates here)</span>
        </div>
    )

    const footer: HTMLElement = (
        <p className="mode-footer-hint">Press <kbd>Esc</kbd> or click outside to cancel</p>
    )

    const content: HTMLElement = (
        <div className={className}>
            <div className="mode-dialog-header">
                <h2>Choose Generation Mode</h2>
                <p>After selecting, draw a region on the timeline or piano roll.</p>
            </div>
            <div className="mode-cards">
                {cards}
            </div>
            {legend}
            {footer}
        </div>
    )

    const dialog: HTMLDialogElement = document.createElement("dialog")
    dialog.className = "automidi-modal"
    dialog.appendChild(content)

    // Click outside to close
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {dialog.close()}
    })

    dialog.addEventListener("close", () => {
        if (service.automidi.status.getValue() === "selecting-mode") {
            service.automidi.closeDialog()
        }
        lifecycle.terminate()
    }, {once: true})

    Surface.get().body.appendChild(dialog)
    dialog.showModal()
    return lifecycle
}

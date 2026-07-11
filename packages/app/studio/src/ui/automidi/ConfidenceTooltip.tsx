import {StudioService} from "@/service/StudioService"

export interface ConfidenceTooltipProps {
    service: StudioService
    confidence: number
    level: "high" | "medium" | "low" | "none"
}

export const ConfidenceTooltip = ({service: _service, confidence, level}: ConfidenceTooltipProps): HTMLElement => {
    const tip = document.createElement("div")
    tip.className = "automidi-confidence-tip hidden"
    tip.textContent = `Confidence: ${Math.round(confidence * 100)}% (${level})`
    const root = document.createElement("div")
    root.className = "automidi-confidence"
    root.appendChild(tip)
    root.addEventListener("mouseenter", () => tip.classList.remove("hidden"))
    root.addEventListener("mouseleave", () => tip.classList.add("hidden"))
    return root
}
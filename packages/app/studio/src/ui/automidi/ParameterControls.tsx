import type {StudioService} from "@/service/StudioService"

const Slider = (label: string, getValue: () => number, min: number, max: number, step: number, onChange: (v: number) => void) => {
    const valueEl = document.createElement("span")
    valueEl.className = "automidi-slider-value"
    valueEl.textContent = getValue().toFixed(2)
    const input = document.createElement("input")
    input.type = "range"
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(getValue())
    input.addEventListener("input", () => {
        const v = Number(input.value)
        onChange(v)
        valueEl.textContent = v.toFixed(2)
    })
    const labelEl = document.createElement("label")
    labelEl.className = "automidi-slider"
    const textEl = document.createElement("span")
    textEl.textContent = label
    labelEl.appendChild(textEl)
    labelEl.appendChild(input)
    labelEl.appendChild(valueEl)
    return labelEl
}

const Select = (label: string, value: string, options: string[], onChange: (v: string) => void) => {
    const labelEl = document.createElement("label")
    labelEl.className = "automidi-select"
    const textEl = document.createElement("span")
    textEl.textContent = label
    const select = document.createElement("select")
    for (const opt of options) {
        const optEl = document.createElement("option")
        optEl.value = opt
        optEl.textContent = opt
        if (opt === value) optEl.selected = true
        select.appendChild(optEl)
    }
    select.addEventListener("change", () => onChange(select.value))
    labelEl.appendChild(textEl)
    labelEl.appendChild(select)
    return labelEl
}

export const ParameterControls = (service: StudioService) => {
    const root = document.createElement("div")
    root.className = "automidi-parameter-controls"

    root.appendChild(Slider("Top-P", () => service.automidi.parameters.getValue().topP, 0.5, 1.0, 0.01,
        v => service.automidi.setParam("topP", v)))
    root.appendChild(Slider("Temperature", () => service.automidi.parameters.getValue().temperature, 0.1, 2.0, 0.05,
        v => service.automidi.setParam("temperature", v)))
    root.appendChild(Slider("Num Variations", () => service.automidi.parameters.getValue().numVariations, 1, 5, 1,
        v => service.automidi.setParam("numVariations", v)))
    root.appendChild(Select("Model size", service.automidi.parameters.getValue().modelSize,
        ["small", "medium", "large"],
        v => service.automidi.setParam("modelSize", v as "small" | "medium" | "large")))

    return root
}
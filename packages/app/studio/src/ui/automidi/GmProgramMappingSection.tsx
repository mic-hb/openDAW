import type {StudioService} from "@/service/StudioService"
import {GM_PROGRAMS} from "@/automidi/gm-programs"

const replaceChildren = (el: HTMLElement): void => {
    while (el.firstChild) {el.removeChild(el.firstChild)}
}

export const GmProgramMappingSection = (service: StudioService) => {
    const list = document.createElement("div")
    list.className = "automidi-gm-list"
    const dupes = document.createElement("div")
    dupes.className = "automidi-gm-dupes hidden"

    const render = (): void => {
        replaceChildren(list)
        const overrides = service.automidi.trackGmOverrides.getValue()
        for (const [trackId, override] of overrides) {
            const programSelect = document.createElement("select")
            for (const entry of GM_PROGRAMS) {
                const opt = document.createElement("option")
                opt.value = String(entry.program)
                opt.textContent = `${entry.program} — ${entry.name}`
                if (entry.program === override.midiProgram) opt.selected = true
                programSelect.appendChild(opt)
            }
            programSelect.addEventListener("change", () => {
                const v = Number(programSelect.value)
                service.automidi.setTrackGmProgram(trackId, v)
            })
            const drumCheck = document.createElement("input")
            drumCheck.type = "checkbox"
            drumCheck.checked = Boolean(override.midiIsDrum)
            drumCheck.addEventListener("change", () => {
                service.automidi.setTrackMidiIsDrum(trackId, drumCheck.checked)
            })
            const row = document.createElement("div")
            row.className = "automidi-gm-row"
            const nameSpan = document.createElement("span")
            nameSpan.textContent = trackId
            const drumLabel = document.createElement("label")
            drumLabel.appendChild(drumCheck)
            drumLabel.appendChild(document.createTextNode(" drum"))
            row.appendChild(nameSpan)
            row.appendChild(programSelect)
            row.appendChild(drumLabel)
            list.appendChild(row)
        }
        const dups = service.automidi.duplicatePrograms
        if (dups.length > 0) {
            dupes.classList.remove("hidden")
            replaceChildren(dupes)
            dupes.appendChild(document.createTextNode(`Duplicate GM programs: ${dups.map(d => `${d.program} (${d.trackNames.join(", ")})`).join("; ")}`))
        } else {
            dupes.classList.add("hidden")
        }
    }

    service.automidi.trackGmOverrides.subscribe(render)

    const details = document.createElement("details")
    details.className = "automidi-gm-details"
    const summary = document.createElement("summary")
    summary.textContent = "Instrument Mapping (GM programs)"
    details.appendChild(summary)
    details.appendChild(dupes)
    details.appendChild(list)

    return details
}
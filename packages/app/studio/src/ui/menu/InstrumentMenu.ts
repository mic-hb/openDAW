import {GM_PROGRAMS} from "@opendaw/studio-enums"
import {MenuItem} from "@opendaw/studio-core"
import {Procedure} from "@opendaw/lib-std"

export const installGmInstrumentMenu = (currentProgram: number,
                                         onSelect: (program: number) => void): Procedure<MenuItem> => parent => {
    parent.addMenuItem(
        MenuItem.inputText({
            placeholder: "Search instruments...",
            onInput: (value: string) => {
                const term = value.trim().toLowerCase()
                const familyEls = document.querySelectorAll(".instrument-family")
                const itemEls = document.querySelectorAll(".instrument-item")
                if (term === "") {
                    familyEls.forEach(el => el.classList.remove("search-hidden"))
                    itemEls.forEach(el => el.classList.add("search-hidden"))
                } else {
                    familyEls.forEach(el => el.classList.add("search-hidden"))
                    itemEls.forEach(el => {
                        const label = el.querySelector(".label")?.textContent?.toLowerCase() ?? ""
                        if (label.includes(term)) {
                            el.classList.remove("search-hidden")
                        } else {
                            el.classList.add("search-hidden")
                        }
                    })
                }
            },
            onEnter: (value: string) => {
                const term = value.trim()
                if (term === "") {return}
                const match = GM_PROGRAMS.find(p => p.name.toLowerCase().includes(term.toLowerCase()))
                if (match) {onSelect(match.program)}
            }
        })
    )
    const families = Array.from(new Set(GM_PROGRAMS.map(p => p.family)))
    families.forEach(family => {
        parent.addMenuItem(
            MenuItem.default({label: family, className: "instrument-family"}).setRuntimeChildrenProcedure(childParent => {
                GM_PROGRAMS.filter(p => p.family === family).forEach(program => {
                    childParent.addMenuItem(
                        MenuItem.default({
                            label: program.name,
                            checked: currentProgram === program.program
                        }).setTriggerProcedure(() => onSelect(program.program))
                    )
                })
                return childParent
            })
        )
    })
    GM_PROGRAMS.forEach(program => {
        parent.addMenuItem(
            MenuItem.default({
                label: program.name,
                className: "instrument-item search-hidden",
                checked: currentProgram === program.program
            }).setTriggerProcedure(() => onSelect(program.program))
        )
    })
    return parent
}
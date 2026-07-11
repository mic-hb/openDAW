import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Attempts, isAbsent, isDefined, Nullable, RuntimeNotifier} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import type {LoraStatus} from "@/automidi/types"
import {Menu} from "@/ui/components/Menu.tsx"
import {MenuItem} from "@opendaw/studio-core"
import {Colors} from "@opendaw/studio-enums"

const buildLabel = (status: Nullable<LoraStatus>): string => {
    if (isAbsent(status)) {return "Loading…"}
    if (!status.supported) {return status.reason ?? "Base model"}
    if (isAbsent(status.active)) {return "Base model"}
    const active = status.available.find(c => c.id === status.active)
    return isDefined(active) ? active.shortLabel : status.active
}

export const LoraSelector = ({lifecycle, service}: {lifecycle: Lifecycle; service: StudioService}): HTMLElement => {
    const labelEl = <span className="menu-button-text">{"Loading…"}</span>
    const button = document.createElement("button")
    button.className = "menu-button"
    button.style.setProperty("--color", Colors.gray.toString())
    button.style.setProperty("--color-active", Colors.orange.toString())
    button.title = "Select LoRA adapter"
    button.style.backgroundColor = "#202020ff"
    button.style.boxShadow = "0 0 8px 2px #40404088"
    button.style.padding = "6px"
    button.style.borderRadius = "8px"
    button.style.border = "1px solid #000000ff"
    button.style.fontSize = "0.5rem"
    
    const prefix = document.createElement("span")
    prefix.textContent = "Model: "
    button.appendChild(prefix)
    button.appendChild(labelEl)
    
    button.addEventListener("pointerdown", (event) => {
        event.stopPropagation()
        void openDropdown()
    })
    
    lifecycle.own({
        terminate: () => button.remove()
    })
    const updateLabel = (): void => {
        labelEl.textContent = buildLabel(service.automidi.lora.status.getValue())
    }
    service.automidi.lora.status.subscribe(updateLabel)
    updateLabel()
    let dropdown: Nullable<Menu> = null
    const closeDropdown = (): void => {
        if (isDefined(dropdown)) {
            dropdown.terminate()
            dropdown = null
        }
    }
    const openDropdown = async (): Promise<void> => {
        if (isDefined(dropdown)) {closeDropdown(); return}
        await Attempts.async(service.automidi.lora.refresh())
        const status = service.automidi.lora.status.getValue()
        if (isAbsent(status)) {return}
        
        const root = MenuItem.root()
        root.addMenuItem(
            MenuItem.default({label: "Base model", checked: status.active === null})
                .setTriggerProcedure(() => void select(null))
        )
        if (status.supported) {
            for (const checkpoint of status.available) {
                root.addMenuItem(
                    MenuItem.default({
                        label: `${checkpoint.shortLabel} — ${checkpoint.dataset}`, 
                        checked: status.active === checkpoint.id
                    })
                    .setTriggerProcedure(() => void select(checkpoint.id))
                )
            }
        }
        
        button.classList.add("active")
        const menu = Menu.create(root)
        const rect = button.getBoundingClientRect()
        menu.moveTo(rect.left, rect.bottom + Menu.Padding)
        menu.attach(document.body)
        menu.own({
            terminate: () => {
                button.classList.remove("active")
                dropdown = null
            }
        })
        dropdown = menu
    }
    const select = async (id: Nullable<string>): Promise<void> => {
        const status = service.automidi.status.getValue()
        if (status === "queued" || status === "generating") {
            RuntimeNotifier.info({headline: "Wait", message: "Wait for current generation to finish."})
            return
        }
        const result = await Attempts.async(service.automidi.lora.select(id))
        result.match({
            ok: () => undefined,
            err: (error: unknown) => RuntimeNotifier.info({headline: "LoRA select failed", message: String(error)})
        })
        closeDropdown()
    }
    return button
}

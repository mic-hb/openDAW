import type {StudioService} from "@/service/StudioService"
import {GenerationModeDialog} from "@/ui/automidi/GenerationModeDialog"
import {GenerationParameterDialog} from "@/ui/automidi/GenerationParameterDialog"
import {GenerationProgressChip} from "@/ui/header/GenerationProgressChip"
import {Lifecycle} from "@opendaw/lib-std"
import {Button} from "@/ui/components/Button.tsx"
import {Colors} from "@opendaw/studio-enums"
import {createElement} from "@opendaw/lib-jsx"

export const GenerateButton = ({lifecycle, service}: {lifecycle: Lifecycle; service: StudioService}) => {
    // When state machine moves to configuring-parameters, auto-open the parameter dialog
    lifecycle.own(service.automidi.status.subscribe(() => {
        const status = service.automidi.status.getValue()
        if (status === "configuring-parameters") {
            GenerationParameterDialog(service)
        }
    }))

    return (
        <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
            <GenerationProgressChip lifecycle={lifecycle} service={service}/>
            <Button lifecycle={lifecycle}
                    className="menu-button"
                    onClick={() => {
                        const status = service.automidi.status.getValue()
                        if (status === "idle" || status === "failed" || status === "cancelled") {
                            service.automidi.openDialog()
                            GenerationModeDialog(service)
                        }
                    }}
                    style={{
                        backgroundColor: "#202020ff",
                        boxShadow: "0 0 10px 2px #fd9e3188",
                        padding: "6px",
                        borderRadius: "8px",
                        border: "1px solid #fd9e31",
                        color: "#fd9e31",
                    }}
                    appearance={{color: Colors.gray}}>
                <span style={{color: "#fd9e31"}}>✦</span>
                <span>Generate</span>
            </Button>
        </span>
    )
}
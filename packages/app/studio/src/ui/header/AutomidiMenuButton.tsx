import type {StudioService} from "@/service/StudioService"
import {Lifecycle} from "@opendaw/lib-std"
import {Button} from "@/ui/components/Button.tsx"
import {Colors, IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon.tsx"
import {createElement} from "@opendaw/lib-jsx"

export const AutomidiMenuButton = ({lifecycle, service}: {lifecycle: Lifecycle; service: StudioService}) => {
    return (
        <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
            <Button lifecycle={lifecycle}
                    className="menu-button"
                    onClick={() => {
                        service.automidi.toggleIntegrationMenu()
                    }}
                    style={{
                        backgroundColor: "#202020ff",
                        padding: "6px",
                        borderRadius: "8px",
                        border: "1px solid #444",
                    }}
                    appearance={{color: Colors.gray, tooltip: "AutoMIDI Settings"}}>
                <Icon symbol={IconSymbol.Tool}/>
            </Button>
        </span>
    )
}

import {Lifecycle, Nullable} from "@opendaw/lib-std"
import {TrackBoxAdapter} from "@opendaw/studio-adapters"
import {LogicTrackColors} from "@opendaw/studio-enums"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {createElement} from "@opendaw/lib-jsx"
import {MenuItem} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"
import {installTrackColorMenu} from "@/ui/timeline/tracks/audio-unit/headers/TrackHeaderMenu.ts"

export type TrackFamily =
    | "piano" | "bass" | "brass" | "woodwind" | "strings"
    | "percussion" | "guitar" | "vocal" | "default"

const familyToken: Record<TrackFamily, string> = {
    piano:       "var(--automidi-track-piano)",
    bass:        "var(--automidi-track-bass)",
    brass:       "var(--automidi-track-brass)",
    woodwind:    "var(--automidi-track-woodwind)",
    strings:     "var(--automidi-track-strings)",
    percussion:  "var(--automidi-track-percussion)",
    guitar:      "var(--automidi-track-guitar)",
    vocal:       "var(--automidi-track-vocal)",
    default:     "var(--automidi-track-default)",
}

export const inferFamily = (trackType: string, instrumentHint: Nullable<string> = null): TrackFamily => {
    const hint = instrumentHint ?? ""
    const text = `${trackType} ${hint}`.toLowerCase()
    if (text.includes("drum") || text.includes("perc")) {return "percussion"}
    if (text.includes("bass")) {return "bass"}
    if (text.includes("brass") || text.includes("trumpet") || text.includes("trombone") || text.includes("horn")) {return "brass"}
    if (text.includes("woodwind") || text.includes("sax") || text.includes("flute") || text.includes("clarinet")) {return "woodwind"}
    if (text.includes("guitar")) {return "guitar"}
    if (text.includes("vocal") || text.includes("vox") || text.includes("voice")) {return "vocal"}
    if (text.includes("violin") || text.includes("strings") || text.includes("cello") || text.includes("viola")) {return "strings"}
    if (text.includes("piano") || text.includes("keys")) {return "piano"}
    return "default"
}

export const TrackStripe = (family: TrackFamily): HTMLElement => {
    const stripe = document.createElement("div")
    stripe.className = "automidi-track-stripe"
    stripe.style.backgroundColor = familyToken[family]
    return stripe
}

export const TrackStripeFromAdapter = (adapter: TrackBoxAdapter, lifecycle: Lifecycle, service: StudioService): HTMLElement => {
    const stripe = (
        <MenuButton className="automidi-track-stripe"
                    root={MenuItem.root().setRuntimeChildrenProcedure(installTrackColorMenu(service, adapter))}
                    style={{minWidth: "0", minHeight: "100%", padding: "0"}} />
    ) as HTMLElement
    lifecycle.own(
        adapter.color.catchupAndSubscribe(owner => {
            const colorIndex = owner.getValue()
            const color = colorIndex < LogicTrackColors.length ? LogicTrackColors[colorIndex] : LogicTrackColors[0]
            stripe.style.backgroundColor = color.toString()
        })
    )
    return stripe
}

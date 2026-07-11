import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService"
import {MidiExportService, type ProjectSnapshot} from "@/automidi/MidiExportService"
import {Lifecycle} from "@opendaw/lib-std"
import {Button} from "@/ui/components/Button.tsx"
import {Colors} from "@opendaw/studio-enums"

const dateSuffix = (): string => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const slug = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled"

const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

export const MidiExportButton = ({lifecycle, service}: {lifecycle: Lifecycle; service: StudioService}) => {
    const onClick = async (): Promise<void> => {
        const profile = service.projectProfileService.getValue()
        const name = profile.isEmpty() ? null : profile.unwrap().meta.name
        const snapshot: ProjectSnapshot = {
            bpm: 120,
            name,
            timeSignature: {numerator: 4, denominator: 4},
        }
        const exporter = new MidiExportService(snapshot)
        const filename = `${slug(snapshot.name ?? "untitled")}-${dateSuffix()}.mid`
        const blob = await exporter.exportMidi(service.automidi.api)
        downloadBlob(blob, filename)
    }
    return (
        <Button lifecycle={lifecycle}
                className="menu-button"
                onClick={onClick}
                appearance={{
                    color: Colors.gray,
                    activeColor: Colors.bright,
                    tooltip: "Export project as MIDI"
                }}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 21L12 12M12 12L15 15.3333M12 12L9 15.3333" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> <path d="M20.5 7V13C20.5 16.7712 20.5 18.6569 19.3284 19.8284C18.1569 21 16.2712 21 12.5 21H11.5M3.5 7V13C3.5 16.7712 3.5 18.6569 4.67157 19.8284C5.37634 20.5332 6.3395 20.814 7.81608 20.9259" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M12 3H4C3.05719 3 2.58579 3 2.29289 3.29289C2 3.58579 2 4.05719 2 5C2 5.94281 2 6.41421 2.29289 6.70711C2.58579 7 3.05719 7 4 7H20C20.9428 7 21.4142 7 21.7071 6.70711C22 6.41421 22 5.94281 22 5C22 4.05719 22 3.58579 21.7071 3.29289C21.4142 3 20.9428 3 20 3H16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> </g></svg>
        </Button>
    )
}

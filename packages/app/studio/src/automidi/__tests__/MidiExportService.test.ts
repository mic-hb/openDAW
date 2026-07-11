import {describe, expect, it} from "vitest"
import {MidiExportService, type ProjectSnapshot} from "../MidiExportService"

const fakeProject: ProjectSnapshot = {
    bpm: 120,
    name: "Test Project",
    timeSignature: {numerator: 4, denominator: 4},
}

describe("MidiExportService", () => {
    it("buildRequest includes bpm, timeSignature, filename, tracks", () => {
        const service = new MidiExportService(fakeProject)
        const req = service.buildRequest()
        expect(req.bpm).toBe(120)
        expect(req.timeSignatureBeats).toBe(4)
        expect(req.timeSignatureNoteValue).toBe(4)
        expect(req.filename).toBe("Test Project")
        expect(Array.isArray(req.tracks)).toBe(true)
    })

    it("buildRequest uses default 4/4 if project has no time signature", () => {
        const service = new MidiExportService({bpm: 90, name: "X"} as never)
        const req = service.buildRequest()
        expect(req.timeSignatureBeats).toBe(4)
        expect(req.timeSignatureNoteValue).toBe(4)
    })
})

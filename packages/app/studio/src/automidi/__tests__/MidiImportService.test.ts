import {describe, expect, it} from "vitest"
import {MidiImportService} from "../MidiImportService"
import type {MidiImportResponse} from "../schema"

describe("MidiImportService", () => {
    it("buildEditPlan converts response to (trackName, isDrum, notes) tuples", () => {
        const service = new MidiImportService(null as never)
        const response: MidiImportResponse = {
            bpm: 120,
            timeSignatureBeats: 4,
            timeSignatureNoteValue: 4,
            tracks: [
                {
                    name: "Piano",
                    program: 0,
                    isDrum: false,
                    notes: [
                        {pitch: 60, startBeats: 0, durationBeats: 1, velocity: 100},
                        {pitch: 64, startBeats: 1, durationBeats: 1, velocity: 100},
                    ],
                },
                {
                    name: "Drums",
                    program: 128,
                    isDrum: true,
                    notes: [{pitch: 36, startBeats: 0, durationBeats: 1, velocity: 100}],
                },
                {
                    name: "Custom Track",
                    program: 200,
                    isDrum: false,
                    notes: [{pitch: 60, startBeats: 0, durationBeats: 1, velocity: 100}],
                },
            ],
            importWarnings: [],
        }
        const plan = service.buildEditPlan(response)
        expect(plan.tracks.length).toBe(3)
        expect(plan.tracks[0].name).toBe("Acoustic Grand Piano")
        expect(plan.tracks[0].isDrum).toBe(false)
        expect(plan.tracks[0].notes.length).toBe(2)
        expect(plan.tracks[1].name).toBe("Drum Kit")
        expect(plan.tracks[1].isDrum).toBe(true)
        expect(plan.tracks[2].name).toBe("Custom Track")
    })

    it("buildEditPlan is deterministic (same input → same plan)", () => {
        const service = new MidiImportService(null as never)
        const response: MidiImportResponse = {
            bpm: 120,
            timeSignatureBeats: 4,
            timeSignatureNoteValue: 4,
            tracks: [{name: "T", program: 0, isDrum: false, notes: []}],
            importWarnings: [],
        }
        expect(service.buildEditPlan(response)).toEqual(service.buildEditPlan(response))
    })
})

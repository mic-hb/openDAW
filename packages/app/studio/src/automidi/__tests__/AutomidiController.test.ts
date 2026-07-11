import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {Terminator} from "@opendaw/lib-std"
import {AutomidiController} from "../AutomidiController"
import {AutomidiApi} from "../AutomidiApi"
import {POLL_INTERVAL_MS} from "../config"
import {makeMockedFetch, type MockedFetch} from "../__mocks__/fetch"

const makeRegion = (overrides = {}) => ({
    trackId: "track-1",
    startBar: 0,
    endBar: 4,
    beatsPerBar: 4,
    highestPitch: 84,
    contextTrackIds: ["track-1"],
    targetTrackIds: ["track-1"],
    source: "timeline" as const,
    ...overrides,
})

describe("AutomidiController", () => {
    let mock: MockedFetch
    let api: AutomidiApi
    let controller: AutomidiController
    let terminator: Terminator

    beforeEach(() => {
        mock = makeMockedFetch()
        api = new AutomidiApi(mock.fetch as unknown as typeof fetch)
        terminator = new Terminator()
        controller = new AutomidiController(api)
        terminator.own(controller)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("starts in idle", () => {
        expect(controller.status.getValue()).toBe("idle")
    })

    it("openDialog transitions idle → selecting-mode", () => {
        controller.openDialog()
        expect(controller.status.getValue()).toBe("selecting-mode")
    })

    it("selectMode transitions selecting-mode → awaiting-region", () => {
        controller.openDialog()
        controller.selectMode("continuation")
        expect(controller.status.getValue()).toBe("awaiting-region")
        expect(controller.mode.getValue()).toBe("continuation")
    })

    it("selectMode is no-op outside selecting-mode", () => {
        controller.selectMode("continuation")
        expect(controller.status.getValue()).toBe("idle")
    })

    it("regionCommitted transitions awaiting-region → configuring-parameters", async () => {
        controller.openDialog()
        controller.selectMode("continuation")
        await controller.regionCommitted(makeRegion())
        expect(controller.status.getValue()).toBe("configuring-parameters")
    })

    it("closeDialog returns to idle from selecting-mode", () => {
        controller.openDialog()
        controller.closeDialog()
        expect(controller.status.getValue()).toBe("idle")
    })

    it("closeDialog returns to idle from configuring-parameters", async () => {
        controller.openDialog()
        controller.selectMode("continuation")
        await controller.regionCommitted(makeRegion())
        controller.closeDialog()
        expect(controller.status.getValue()).toBe("idle")
    })

    it("requestRegionDraw is a no-op (kept for compat)", () => {
        controller.requestRegionDraw()
        expect(controller.status.getValue()).toBe("idle")
    })

    it("setMode can update mode directly", () => {
        controller.setMode("variation")
        expect(controller.mode.getValue()).toBe("variation")
    })

    it("setParam updates parameters observable", () => {
        controller.openDialog()
        controller.setParam("topP", 0.7)
        expect(controller.parameters.getValue().topP).toBe(0.7)
    })

    it("setTrackGmProgram and setTrackMidiIsDrum update trackGmOverrides", () => {
        controller.openDialog()
        controller.setTrackGmProgram("track-1", 42)
        controller.setTrackMidiIsDrum("track-2", true)
        const overrides = controller.trackGmOverrides.getValue()
        expect(overrides.get("track-1")?.midiProgram).toBe(42)
        expect(overrides.get("track-2")?.midiIsDrum).toBe(true)
    })

    it("duplicatePrograms returns groups with count > 1 (drum tracks excluded)", () => {
        controller.openDialog()
        controller.setTrackGmProgram("track-1", 0)
        controller.setTrackGmProgram("track-2", 0)
        controller.setTrackMidiIsDrum("track-3", true)
        controller.setTrackGmProgram("track-3", 128)
        const dups = controller.duplicatePrograms
        expect(dups.length).toBe(1)
        expect(dups[0].program).toBe(0)
        expect(dups[0].trackNames.length).toBe(2)
    })

    it("commitParametersAndGenerate transitions to queued, then generating, then completed", async () => {
        vi.useFakeTimers()
        controller.openDialog()
        controller.selectMode("continuation")
        controller.setParam("numVariations", 1)

        mock.setSequence([
            {body: {taskId: "t-1", status: "queued"}},
            {body: {taskId: "t-1", status: "processing"}},
            {body: {taskId: "t-1", status: "processing"}},
            {body: {taskId: "t-1", status: "completed", result: {variations: [{id: "v-1", notes: [], confidence: 0.5, confidenceLevel: "medium"}]}}},
        ])

        await controller.regionCommitted(makeRegion())
        expect(controller.status.getValue()).toBe("configuring-parameters")

        const statusUpdates: string[] = []
        controller.status.subscribe(value => statusUpdates.push(value))

        await controller.commitParametersAndGenerate()
        expect(controller.status.getValue()).toBe("queued")

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        expect(controller.status.getValue()).toBe("generating")

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        expect(controller.status.getValue()).toBe("generating")

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        expect(controller.status.getValue()).toBe("completed")
        expect(controller.variations.getValue().length).toBe(1)
        expect(statusUpdates).toContain("queued")
        expect(statusUpdates).toContain("generating")
        expect(statusUpdates).toContain("completed")
    })

    it("cancel during generating transitions to cancelled", async () => {
        vi.useFakeTimers()
        controller.openDialog()
        controller.selectMode("continuation")

        mock.setSequence([
            {body: {taskId: "t-1", status: "queued"}},
            {body: {taskId: "t-1", status: "processing"}},
            {body: {ok: true}},
        ])

        await controller.regionCommitted(makeRegion({trackId: "t"}))
        await controller.commitParametersAndGenerate()
        expect(controller.status.getValue()).toBe("queued")

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        expect(controller.status.getValue()).toBe("generating")

        await controller.cancel()
        expect(controller.status.getValue()).toBe("cancelled")
    })

    it("rejectVariation resets state to idle", async () => {
        controller.openDialog()
        controller.selectMode("continuation")
        await controller.regionCommitted(makeRegion())
        controller.rejectVariation()
        expect(controller.status.getValue()).toBe("idle")
        expect(controller.variations.getValue()).toEqual([])
    })

    it("selectVariation updates the selected index", () => {
        controller.variations.setValue([
            {id: "v-1", notes: [], confidence: 0.5, confidenceLevel: "medium"} as never,
            {id: "v-2", notes: [], confidence: 0.7, confidenceLevel: "high"} as never,
        ])
        controller.selectVariation(1)
        expect(controller.selectedVariationIndex.getValue()).toBe(1)
    })

    it("lora.refresh fetches status and updates observables", async () => {
        mock.setResponse({
            supported: true,
            available: [{id: "l1", label: "L1", shortLabel: "L1", rank: 8, alpha: 16, dataset: "x", trainingSteps: 1000}],
            active: "l1",
        })
        await controller.lora.refresh()
        expect(controller.lora.status.getValue()?.supported).toBe(true)
        expect(controller.lora.activeId.getValue()).toBe("l1")
    })

    it("lora.select updates active id optimistically, rolls back on error", async () => {
        mock.setResponse({supported: true, available: [], active: null})
        await controller.lora.refresh()
        expect(controller.lora.activeId.getValue()).toBeNull()

        mock.setError(new Error("setLora failed"))
        await controller.lora.select("l1").catch(() => undefined)
        expect(controller.lora.activeId.getValue()).toBeNull()
    })
})
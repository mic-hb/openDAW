import {beforeEach, describe, expect, it, vi} from "vitest"
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

describe("AutomidiController smoke test", () => {
    let mock: MockedFetch
    let api: AutomidiApi
    let controller: AutomidiController

    beforeEach(() => {
        mock = makeMockedFetch()
        api = new AutomidiApi(mock.fetch as unknown as typeof fetch)
        controller = new AutomidiController(api)
    })

    it("full happy path: open → select-mode → region → configure → generate → accept", async () => {
        vi.useFakeTimers()
        try {
            controller.openDialog()
            expect(controller.status.getValue()).toBe("selecting-mode")

            controller.selectMode("continuation")
            expect(controller.status.getValue()).toBe("awaiting-region")

            controller.setParam("topP", 0.95)
            controller.setParam("numVariations", 1)

            await controller.regionCommitted(makeRegion())
            expect(controller.status.getValue()).toBe("configuring-parameters")

            mock.setSequence([
                {body: {taskId: "t-1", status: "queued"}},
                {body: {taskId: "t-1", status: "processing"}},
                {body: {taskId: "t-1", status: "completed", result: {variations: [
                    {id: "v-1", notes: [
                        {pitch: 60, startTime: 0, duration: 1, velocity: 100, trackId: "t-1"},
                        {pitch: 64, startTime: 1, duration: 1, velocity: 100, trackId: "t-1"},
                    ], confidence: 0.8, confidenceLevel: "high"},
                ]}}},
            ])

            await controller.commitParametersAndGenerate()
            expect(controller.status.getValue()).toBe("queued")

            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
            expect(controller.status.getValue()).toBe("generating")

            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
            expect(controller.status.getValue()).toBe("completed")
            expect(controller.variations.getValue().length).toBe(1)
            expect(controller.variations.getValue()[0].id).toBe("v-1")

            controller.selectVariation(0)
            expect(controller.selectedVariationIndex.getValue()).toBe(0)

            controller.acceptVariation()
            expect(controller.status.getValue()).toBe("idle")
        } finally {
            vi.useRealTimers()
        }
    })

    it("full reject path: open → select-mode → region → configure → generate → reject", async () => {
        vi.useFakeTimers()
        try {
            controller.openDialog()
            controller.selectMode("variation")
            expect(controller.status.getValue()).toBe("awaiting-region")

            await controller.regionCommitted(makeRegion({endBar: 2}))
            expect(controller.status.getValue()).toBe("configuring-parameters")

            mock.setSequence([
                {body: {taskId: "t-2", status: "queued"}},
                {body: {taskId: "t-2", status: "completed", result: {variations: [
                    {id: "v-1", notes: [], confidence: 0.5, confidenceLevel: "medium"},
                ]}}},
            ])

            await controller.commitParametersAndGenerate()
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
            expect(controller.status.getValue()).toBe("completed")
            expect(controller.variations.getValue().length).toBe(1)

            controller.rejectVariation()
            expect(controller.status.getValue()).toBe("idle")
            expect(controller.variations.getValue()).toEqual([])
        } finally {
            vi.useRealTimers()
        }
    })
})
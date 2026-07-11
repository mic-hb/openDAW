import {beforeEach, describe, expect, it} from "vitest"
import {makeMockedFetch, type MockedFetch} from "../__mocks__/fetch"
import {AutomidiApi} from "../AutomidiApi"
import {AUTOMIDI_API_BASE} from "../config"

describe("AutomidiApi", () => {
    let mock: MockedFetch
    let api: AutomidiApi

    beforeEach(() => {
        mock = makeMockedFetch()
        api = new AutomidiApi(mock.fetch as unknown as typeof fetch)
    })

    it("requestGeneration posts to /api/generations with mapped mode", async () => {
        mock.setResponse({taskId: "t-1", status: "processing"})
        const result = await api.requestGeneration({
            trackId: "track-1",
            region: {trackId: "track-1", startBar: 0, endBar: 4},
            parameters: {
                engine: "amt",
                mode: "continuation",
                temperature: 1.0,
                numVariations: 3,
                amt: {
                    generationMode: "continuation",
                    topP: 0.95,
                    temperature: 1.0,
                    numVariations: 3,
                    loraId: null,
                },
                context: {bpm: 120, timeSignature: {beats: 4, noteValue: 4}, tracks: [], notes: []},
                contextTrackIds: [],
                targetTrackIds: ["track-1"],
                trackGmOverrides: {},
            },
        })
        expect(result.taskId).toBe("t-1")
        const [url, init] = mock.fetch.mock.calls[0]
        expect(url).toBe(`${AUTOMIDI_API_BASE}/generations`)
        const body = JSON.parse(init.body as string)
        expect(body.parameters.amt.generationMode).toBe("continue")
    })

    it("requestGeneration maps infilling → infill, variation → vary", async () => {
        mock.setResponse({taskId: "t-1"})
        await api.requestGeneration({
            trackId: "track-1",
            region: {trackId: "track-1", startBar: 0, endBar: 4},
            parameters: {
                engine: "amt",
                mode: "infilling",
                temperature: 0.8,
                numVariations: 1,
                amt: {generationMode: "infilling", topP: 0.9, temperature: 0.8, numVariations: 1, loraId: null},
                context: {bpm: 120, timeSignature: {beats: 4, noteValue: 4}, tracks: [], notes: []},
                contextTrackIds: [],
                targetTrackIds: ["track-1"],
                trackGmOverrides: {},
            },
        })
        const [, init] = mock.fetch.mock.calls[0]
        expect(JSON.parse(init.body as string).parameters.amt.generationMode).toBe("infill")
    })

    it("pollTaskStatus fetches /api/generations/{id} and parses response", async () => {
        mock.setResponse({taskId: "t-1", status: "completed", result: {variations: []}})
        const result = await api.pollTaskStatus("t-1")
        expect(result.status).toBe("completed")
        expect(mock.fetch.mock.calls[0][0]).toBe(`${AUTOMIDI_API_BASE}/generations/t-1`)
    })

    it("cancelGeneration DELETEs /api/generations/{id}", async () => {
        mock.setResponse({ok: true})
        await api.cancelGeneration("t-1")
        const [url, init] = mock.fetch.mock.calls[0]
        expect(url).toBe(`${AUTOMIDI_API_BASE}/generations/t-1`)
        expect(init.method).toBe("DELETE")
    })

    it("getLoraStatus fetches /api/lora-checkpoint/status", async () => {
        mock.setResponse({supported: true, available: [], active: null})
        const result = await api.getLoraStatus()
        expect(result.supported).toBe(true)
        expect(mock.fetch.mock.calls[0][0]).toBe(`${AUTOMIDI_API_BASE}/lora-checkpoint/status`)
    })

    it("setLora posts id to /api/lora-checkpoint", async () => {
        mock.setResponse({ok: true})
        await api.setLora("lora-1")
        const [url, init] = mock.fetch.mock.calls[0]
        expect(url).toBe(`${AUTOMIDI_API_BASE}/lora-checkpoint`)
        expect(JSON.parse(init.body as string).id).toBe("lora-1")
    })
})

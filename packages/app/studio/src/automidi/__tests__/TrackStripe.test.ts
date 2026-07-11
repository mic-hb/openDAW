import {beforeAll, describe, expect, it} from "vitest"
import {TrackStripe, inferFamily} from "@/ui/automidi/TrackStripe"

interface FakeStyle {
    backgroundColor: string
}

interface FakeElement {
    className: string
    style: FakeStyle
}

beforeAll(() => {
    const doc = {
        createElement: (tag: string): FakeElement => ({
            className: "",
            style: {backgroundColor: ""},
            ...(tag === "div" ? {} : {}),
        }),
    }
    ;(globalThis as Record<string, unknown>)["document"] = doc
})

describe("TrackStripe", () => {
    it("renders 4px wide stripe with track color", () => {
        const stripe = TrackStripe("piano")
        expect(stripe.className).toBe("automidi-track-stripe")
        expect(stripe.style.backgroundColor).toBe("var(--automidi-track-piano)")
    })

    it("renders different colors per family", () => {
        expect(TrackStripe("bass").style.backgroundColor).toBe("var(--automidi-track-bass)")
        expect(TrackStripe("brass").style.backgroundColor).toBe("var(--automidi-track-brass)")
    })
})

describe("inferFamily", () => {
    it("detects drum from trackType", () => {
        expect(inferFamily("Notes", "Drums")).toBe("percussion")
    })
    it("detects guitar from instrument hint", () => {
        expect(inferFamily("Notes", "Nylon Guitar")).toBe("guitar")
    })
    it("falls back to default", () => {
        expect(inferFamily("Notes", null)).toBe("default")
    })
    it("detects brass", () => {
        expect(inferFamily("Notes", "Trumpet")).toBe("brass")
    })
    it("detects woodwind", () => {
        expect(inferFamily("Notes", "Alto Sax")).toBe("woodwind")
    })
    it("detects strings", () => {
        expect(inferFamily("Notes", "Violin")).toBe("strings")
    })
})

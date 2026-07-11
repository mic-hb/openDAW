import {describe, expect, it} from "vitest"
import {PPQN} from "@opendaw/lib-dsp"
import {barToPpqn, beatToPpqn, ppqnToBar} from "../time"

describe("time", () => {
    it("barToPpqn(0) is 0", () => {
        expect(barToPpqn(0)).toBe(0)
    })
    it("barToPpqn(4) is 4 * PPQN.Bar", () => {
        expect(barToPpqn(4)).toBe(4 * PPQN.Bar)
    })
    it("barToPpqn(1.5) rounds to nearest", () => {
        expect(barToPpqn(1.5)).toBe(Math.round(1.5 * PPQN.Bar))
    })
    it("ppqnToBar(0) is 0", () => {
        expect(ppqnToBar(0)).toBe(0)
    })
    it("ppqnToBar(PPQN.Bar) is 1", () => {
        expect(ppqnToBar(PPQN.Bar)).toBe(1)
    })
    it("ppqnToBar(PPQN.Bar + 1) is 1 (floor)", () => {
        expect(ppqnToBar(PPQN.Bar + 1)).toBe(1)
    })
    it("beatToPpqn with 4/4: 4 beats = 1 bar", () => {
        expect(beatToPpqn(4, 4)).toBe(PPQN.Bar)
    })
    it("beatToPpqn with 7/8: 7 beats = 1 bar (denominator 8)", () => {
        expect(beatToPpqn(7, 7)).toBe(PPQN.Bar)
    })
})
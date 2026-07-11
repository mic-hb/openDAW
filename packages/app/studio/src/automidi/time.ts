import {PPQN} from "@opendaw/lib-dsp"

export const barToPpqn = (bar: number): number => Math.round(bar * PPQN.Bar)

export const ppqnToBar = (p: number): number => Math.floor(p / PPQN.Bar)

export const beatToPpqn = (beats: number, beatsPerBar: number): number =>
    Math.round((beats / beatsPerBar) * PPQN.Bar)
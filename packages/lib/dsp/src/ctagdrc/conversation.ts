// Helper functions for dB conversion
export const gainToDecibels = (gain: number): number => gain > 0 ? 20.0 * Math.log10(gain) : -100.0
export const decibelsToGain = (db: number): number => Math.pow(10.0, db * 0.05)
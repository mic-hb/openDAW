import {Preferences} from "@opendaw/lib-fusion"
import {z} from "zod"

export const AutoGainMethodSchema = z.enum(["snapshot", "solo-render", "bus-routing"])
export const GatingModeSchema = z.enum(["bs1770", "ungated"])

export const AutomidiSettingsSchema = z.object({
    apiUrl: z.string().default("http://localhost:8000/api"),
    generationTimeoutMs: z.number().default(120000),
    autoGainMethod: AutoGainMethodSchema.default("snapshot"),
    autoGainTargetLUFS: z.number().default(-18.0),
    autoGainTruePeakCeilingDbTP: z.number().default(-1.0),
    autoGainGatingMode: GatingModeSchema.default("bs1770"),
    autoGainAskOnLoad: z.boolean().default(true),
})

export type AutomidiSettings = z.infer<typeof AutomidiSettingsSchema>
export type AutoGainMethod = z.infer<typeof AutoGainMethodSchema>
export type GatingMode = z.infer<typeof GatingModeSchema>

export const AutomidiPreferences = Preferences.host("automidi-settings", AutomidiSettingsSchema)

export const AUTOMIDI_API_BASE = () => AutomidiPreferences.settings.apiUrl

export const POLL_INTERVAL_MS = 1_000
export const POLL_RETRY_DELAY_MS = 2_000
export const POLL_5XX_RETRY_DELAY_MS = 5_000
export const POLL_MAX_RETRIES = 3

export const EXPORT_PROXY_TIMEOUT_MS = 60_000

export const AUTO_GAIN_TARGET_DB = -18.0
export const AUTO_GAIN_MAX_BOOST_DB = 12.0
export const AUTO_GAIN_MIN_CUT_DB = -48.0

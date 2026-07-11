import {z} from "zod"

export const NoteShapeSchema = z.object({
    pitch: z.number().int().min(0).max(127),
    startTime: z.number(),
    duration: z.number().positive(),
    velocity: z.number().int().min(1).max(127),
    trackId: z.string().optional(),
})

export const VariationSchema = z.object({
    id: z.string(),
    notes: z.array(NoteShapeSchema),
    confidence: z.number().min(0).max(1),
    confidenceLevel: z.enum(["high", "medium", "low", "none"]),
})

export const TaskStatusSchema = z.object({
    taskId: z.string(),
    status: z.enum(["processing", "completed", "failed", "cancelled", "retrying"]),
    progress: z.number().nullable().optional(),
    currentVariationIndex: z.number().int().nullable().optional(),
    currentVariationProgress: z.number().nullable().optional(),
    totalVariations: z.number().int().nullable().optional(),
    result: z.object({
        variations: z.array(VariationSchema),
    }).nullable().optional(),
    error: z.string().nullable().optional(),
    errorCode: z.string().nullable().optional(),
    attempt: z.number().int().optional(),
    maxAttempts: z.number().int().optional(),
})

export const LoraCheckpointSchema = z.object({
    id: z.string(),
    label: z.string(),
    shortLabel: z.string(),
    rank: z.number().int(),
    alpha: z.number(),
    dataset: z.string(),
    trainingSteps: z.number().int(),
})

export const LoraStatusSchema = z.object({
    supported: z.boolean(),
    reason: z.string().nullable().optional(),
    available: z.array(LoraCheckpointSchema),
    active: z.string().nullable(),
})

export const ImportedNoteSchema = z.object({
    pitch: z.number().int().min(0).max(127),
    startBeats: z.number(),
    durationBeats: z.number().positive(),
    velocity: z.number().int().min(1).max(127),
})

export const ImportedTrackSchema = z.object({
    name: z.string(),
    program: z.number().int().min(0).max(127),
    isDrum: z.boolean(),
    notes: z.array(ImportedNoteSchema),
})

export const MidiImportResponseSchema = z.object({
    bpm: z.number().positive(),
    timeSignatureBeats: z.number().int().positive(),
    timeSignatureNoteValue: z.number().int().positive(),
    tracks: z.array(ImportedTrackSchema),
    importWarnings: z.array(z.string()).default([]),
})

export const GenerationContextTrackSchema = z.object({
    id: z.string(),
    name: z.string(),
    instrument: z.string(),
    midiProgram: z.number().int().min(0).max(127),
    midiIsDrum: z.boolean(),
})

export const GenerationContextNoteSchema = z.object({
    pitch: z.number().int().min(0).max(127),
    velocity: z.number().int().min(1).max(127),
    startTime: z.number(),
    duration: z.number().positive(),
    trackId: z.string(),
})

export const GenerationContextSchema = z.object({
    bpm: z.number().positive(),
    timeSignature: z.object({
        beats: z.number().int().positive(),
        noteValue: z.number().int().positive(),
    }),
    tracks: z.array(GenerationContextTrackSchema),
    notes: z.array(GenerationContextNoteSchema),
})

export const GenerationRequestSchema = z.object({
    trackId: z.string(),
    region: z.object({
        trackId: z.string(),
        startBar: z.number().int().min(0),
        endBar: z.number().int(),
    }),
    parameters: z.object({
        engine: z.literal("amt"),
        mode: z.enum(["continuation", "infilling", "variation"]),
        temperature: z.number().min(0.0).max(2.0),
        numVariations: z.number().int().min(1).max(10),
        amt: z.object({
            generationMode: z.enum(["continuation", "infilling", "variation"]),
            topP: z.number().min(0.5).max(1.0),
            temperature: z.number().min(0.0).max(2.0),
            numVariations: z.number().int().min(1).max(10),
            loraId: z.string().nullable(),
        }),
        context: GenerationContextSchema,
        contextTrackIds: z.array(z.string()),
        targetTrackIds: z.array(z.string()),
        trackGmOverrides: z.record(z.string(), z.object({
            midiProgram: z.number().int().min(0).max(127).optional(),
            midiIsDrum: z.boolean().optional(),
        })).optional(),
    }),
})

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type LoraStatus = z.infer<typeof LoraStatusSchema>
export type MidiImportResponse = z.infer<typeof MidiImportResponseSchema>
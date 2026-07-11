import {vi} from "vitest"

export interface MockedFetch {
    fetch: ReturnType<typeof vi.fn>
    setResponse: (body: unknown, init?: {status?: number; headers?: Record<string, string>}) => void
    setError: (error: Error) => void
    setSequence: (responses: Array<{body?: unknown; error?: Error; status?: number}>) => void
    reset: () => void
}

export const makeMockedFetch = (): MockedFetch => {
    const fetch = vi.fn()
    const setResponse = (body: unknown, init: {status?: number; headers?: Record<string, string>} = {}): void => {
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), {
            status: init.status ?? 200,
            headers: {"content-type": "application/json", ...(init.headers ?? {})},
        }))
    }
    const setError = (error: Error): void => {
        fetch.mockRejectedValueOnce(error)
    }
    let queue: Array<{body?: unknown; error?: Error; status?: number}> = []
    const setSequence = (responses: Array<{body?: unknown; error?: Error; status?: number}>): void => {
        queue = [...responses]
    }
    fetch.mockImplementation(() => {
        const next = queue.shift()
        if (!next) {
            return Promise.reject(new Error("mock fetch: no response queued"))
        }
        if (next.error) return Promise.reject(next.error)
        return Promise.resolve(new Response(JSON.stringify(next.body ?? {}), {status: next.status ?? 200}))
    })
    return {
        fetch,
        setResponse,
        setError,
        setSequence,
        reset: () => {
            fetch.mockReset()
            queue = []
        },
    }
}

import {beforeAll, describe, expect, it, vi} from "vitest"
import {ConfidenceTooltip} from "@/ui/automidi/ConfidenceTooltip"

const fakeService = {
    terminator: {own: vi.fn()},
} as never

interface FakeNode {
    tag: string
    className: string
    textContent: string
    type: string
    value: string
    checked: boolean
    children: FakeNode[]
    firstChild: FakeNode | null
    outerHTML: string
    parent: FakeNode | null
    appendChild: (child: FakeNode) => FakeNode
    removeChild: (child: FakeNode) => FakeNode
    addEventListener: (type: string, listener: (event: unknown) => void) => void
    querySelector: (selector: string) => FakeNode | null
    classList: {
        add: (c: string) => void
        remove: (c: string) => void
        contains: (c: string) => boolean
        toggle: (c: string) => void
    }
}

const escapeText = (text: string): string =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const rebuildOuterHTML = (node: FakeNode): string => {
    const inner = node.children.length > 0
        ? node.children.map((c) => c.outerHTML).join("")
        : escapeText(node.textContent)
    return `<${node.tag} class="${node.className}">${inner}</${node.tag}>`
}

const createNode = (tag: string): FakeNode => {
    const node: Record<string, unknown> = {
        tag,
        _className: "",
        _textContent: "",
        children: [] as FakeNode[],
        firstChild: null,
        outerHTML: "",
        parent: null,
        type: "",
        value: "",
        checked: false,
    }
    const setOuter = (): void => {
        ;(node as unknown as FakeNode).outerHTML = rebuildOuterHTML(node as unknown as FakeNode)
    }
    const classList = {
        add: (c: string): void => {
            const cls = (node["_className"] as string).split(/\s+/).filter((s) => s.length > 0)
            if (!cls.includes(c)) {cls.push(c)}
            node["_className"] = cls.join(" ")
            setOuter()
        },
        remove: (c: string): void => {
            const cls = (node["_className"] as string).split(/\s+/).filter((s) => s.length > 0)
            const idx = cls.indexOf(c)
            if (idx >= 0) {cls.splice(idx, 1)}
            node["_className"] = cls.join(" ")
            setOuter()
        },
        contains: (c: string): boolean => (node["_className"] as string).split(/\s+/).includes(c),
        toggle: (c: string): void => {
            const cls = (node["_className"] as string).split(/\s+/).filter((s) => s.length > 0)
            const idx = cls.indexOf(c)
            if (idx >= 0) {cls.splice(idx, 1)} else {cls.push(c)}
            node["_className"] = cls.join(" ")
            setOuter()
        },
    }
    Object.defineProperty(node, "className", {
        get(): string {return node["_className"] as string},
        set(value: string): void {
            node["_className"] = value
            setOuter()
        },
        configurable: true,
    })
    Object.defineProperty(node, "textContent", {
        get(): string {return node["_textContent"] as string},
        set(value: string): void {
            node["_textContent"] = value
            setOuter()
        },
        configurable: true,
    })
    Object.defineProperty(node, "appendChild", {
        value: (child: FakeNode): FakeNode => {
            child.parent = node as unknown as FakeNode
            ;(node["children"] as FakeNode[]).push(child)
            node["firstChild"] = (node["children"] as FakeNode[])[0] ?? null
            setOuter()
            return child
        },
        configurable: true,
    })
    Object.defineProperty(node, "removeChild", {
        value: (child: FakeNode): FakeNode => {
            node["children"] = (node["children"] as FakeNode[]).filter((c) => c !== child)
            node["firstChild"] = (node["children"] as FakeNode[])[0] ?? null
            setOuter()
            return child
        },
        configurable: true,
    })
    Object.defineProperty(node, "addEventListener", {
        value: (): void => undefined,
        configurable: true,
    })
    Object.defineProperty(node, "querySelector", {
        value: (selector: string): FakeNode | null => {
            const className = selector.startsWith(".") ? selector.slice(1) : null
            if (className !== null) {
                for (const child of node["children"] as FakeNode[]) {
                    if (child.className.split(/\s+/).includes(className)) {return child}
                    const nested = child.querySelector(selector)
                    if (nested !== null) {return nested}
                }
            }
            return null
        },
        configurable: true,
    })
    Object.defineProperty(node, "classList", {
        value: classList,
        configurable: true,
    })
    setOuter()
    return node as unknown as FakeNode
}

beforeAll(() => {
    const doc = {
        createElement: (tag: string): FakeNode => createNode(tag),
        createTextNode: (text: string): FakeNode => {
            const node = createNode("#text")
            node.textContent = text
            return node
        },
    }
    ;(globalThis as Record<string, unknown>)["document"] = doc
})

describe("ConfidenceTooltip", () => {
    it("renders confidence percentage and level", () => {
        const root = ConfidenceTooltip({service: fakeService, confidence: 0.85, level: "high"}) as unknown as FakeNode
        expect(root.outerHTML).toContain("85%")
        expect(root.outerHTML).toContain("high")
    })

    it("hides tooltip initially", () => {
        const root = ConfidenceTooltip({service: fakeService, confidence: 0.5, level: "medium"}) as unknown as FakeNode
        const tip = root.querySelector(".automidi-confidence-tip")
        expect(tip).not.toBeNull()
        expect(tip?.classList.contains("hidden")).toBe(true)
    })
})
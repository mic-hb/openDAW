import {createElement} from "@opendaw/lib-jsx"
import {clampUnit, Editing, EmptyExec, Lifecycle, Nullable, Option, Parameter, Strings, Terminator, unitValue} from "@opendaw/lib-std"
import {ValueDragging} from "@/ui/hooks/dragging.ts"
import {ValueTooltip} from "@/ui/surface/ValueTooltip.tsx"
import {CssUtils, Events, Html} from "@opendaw/lib-dom"
import {Colors} from "@opendaw/studio-enums"
import {Surface} from "@/ui/surface/Surface"
import {FloatingTextInput} from "@/ui/components/FloatingTextInput"
import {StudioPreferences} from "@opendaw/studio-core"
import {Runtime} from "@opendaw/lib-runtime"
import {DefaultVolumeMarkers, MarkerLength, VolumeMarker} from "./VolumeSlider"
import css from "./HorizontalVolumeSlider.sass?inline"

const className = Html.adoptStyleSheet(css, "horizontal-volume-slider")

type Construct = {
    lifecycle: Lifecycle
    editing: Editing
    parameter: Parameter<number>
    markers?: ReadonlyArray<VolumeMarker>
}

export const HorizontalVolumeSlider = ({lifecycle, editing, parameter, markers = DefaultVolumeMarkers}: Construct) => {
    const strokeWidth = 1.0 / devicePixelRatio
    const guide: SVGRectElement = (
        <rect height="0.125em"
              rx="0.0625em"
              ry="0.0625em"
              stroke="none"
              fill="rgba(0, 0, 0, 0.25)"/>
    )
    const linesTop: ReadonlyArray<SVGLineElement> = markers.map(({length, decibel}) => {
        const x = `${parameter.valueMapping.x(decibel) * 100.0}%`
        return <line x1={x}
                     x2={x}
                     y1={length === MarkerLength.Long ? 0 : "25%"}
                     stroke={decibel === 0 && Colors.green}/>
    })
    const linesBottom: ReadonlyArray<SVGLineElement> = markers.map(({decibel}) => {
        const x = `${parameter.valueMapping.x(decibel) * 100.0}%`
        return <line x1={x}
                     x2={x}
                     y1="50%"
                     stroke={decibel === 0 && Colors.green}/>
    })
    const lineContainer: SVGSVGElement = <svg x="1em"
                                               overflow="visible"
                                               stroke="rgba(255,255,255,0.16)"
                                               shape-rendering="crispEdges">{linesTop}{linesBottom}</svg>
    const svg: SVGSVGElement = (<svg viewBox="0 0 0 0">{guide}{lineContainer}</svg>)
    const thumb: HTMLElement = (<div className="thumb"/>)
    const wrapper: HTMLDivElement = (<div className={className} data-class="horizontal-volume-slider">{svg}{thumb}</div>)
    const dragLifecycle = lifecycle.own(new Terminator())
    lifecycle.ownAll(
        Html.watchResize(wrapper, () => {
            if (!wrapper.isConnected) {return}
            const {clientWidth, clientHeight} = wrapper
            if (clientWidth === 0 || clientHeight === 0) {return}
            lineContainer.setAttribute("stroke-width", String(strokeWidth))
            const {baseVal: rect} = svg.viewBox
            rect.width = clientWidth
            rect.height = clientHeight
            const em = parseFloat(getComputedStyle(wrapper).fontSize)
            guide.x.baseVal.value = CssUtils.calc("1em - 1px", clientWidth, em)
            guide.y.baseVal.value = CssUtils.calc("50% - 0.0625em", clientHeight, em)
            guide.width.baseVal.value = CssUtils.calc("100% - 2em + 1.5px", clientWidth, em)
            const topY2 = CssUtils.calc("50% - 0.0625em - 1px", clientHeight, em)
            const bottomY1 = CssUtils.calc("50% + 0.0625em + 1px", clientHeight, em)
            linesTop.forEach(line => {line.y2.baseVal.value = topY2})
            linesBottom.forEach((line, index) => {
                line.y1.baseVal.value = bottomY1
                line.y2.baseVal.value = markers[index].length === MarkerLength.Long
                    ? clientHeight
                    : CssUtils.calc("75%", clientHeight, em)
            })
            lineContainer.width.baseVal.value = CssUtils.calc("100% - 2em", clientWidth, em)
            const snapLength = 3
            const guideBounds = guide.getBoundingClientRect()
            const trackLength = guideBounds.width
            dragLifecycle.terminate()
            dragLifecycle.own(ValueDragging.installUnitValueRelativeDragging((event: PointerEvent) => Option.wrap({
                start: (): unitValue => {
                    editing.mark()
                    if (event.target === thumb) {
                        return parameter.getUnitValue()
                    } else {
                        const newValue: unitValue = (event.clientX - guideBounds.left) / guideBounds.width
                        editing.modify(() => parameter.setUnitValue(newValue), false)
                        return newValue
                    }
                },
                modify: (value: unitValue) => editing.modify(() => parameter.setUnitValue(value), false),
                cancel: (prevValue: unitValue) => editing.modify(() => parameter.setUnitValue(prevValue), false),
                finalise: (_prevValue: unitValue, _newValue: unitValue): void => editing.mark(),
                finally: (): void => {}
            }), wrapper, {
                trackLength: trackLength - snapLength,
                snap: {snapLength, threshold: parameter.valueMapping.x(0.0)},
                ratio: 1.0,
                horizontal: true
            }))
        }))
    const observer = (parameter: Parameter<number>) =>
        wrapper.style.setProperty("--value", parameter.getControlledUnitValue().toString())
    lifecycle.ownAll(
        parameter.subscribe(observer),
        ValueTooltip.default(wrapper, () => {
            const clientRect = thumb.getBoundingClientRect()
            return ({
                clientX: clientRect.left + clientRect.width + 8,
                clientY: clientRect.top + clientRect.height + 8,
                ...parameter.getPrintValue()
            })
        }),
        Events.subscribeDblDwn(thumb, () => {
            const rect = thumb.getBoundingClientRect()
            const printValue = parameter.getPrintValue()
            const resolvers = Promise.withResolvers<string>()
            resolvers.promise.then(value => {
                const withUnit = Strings.endsWithDigit(value) ? `${value}${printValue.unit}` : value
                editing.modify(() => parameter.setPrintValue(withUnit))
                editing.mark()
            }, EmptyExec)
            Surface.get(thumb).flyout.appendChild(
                <FloatingTextInput position={{x: rect.left, y: rect.top + (rect.height >> 1)}}
                                   value={printValue.value}
                                   unit={printValue.unit}
                                   numeric
                                   resolvers={resolvers}/>
            )
        }),
        StudioPreferences.catchupAndSubscribe((() => {
            const terminator = lifecycle.own(new Terminator())
            return (enabled) => {
                terminator.terminate()
                if (!enabled) {return}
                let value: Nullable<unitValue> = null
                const debounceApprove = Runtime.debounce(() => {
                    value = null
                    editing.mark()
                })
                terminator.own(Events.subscribe(wrapper, "wheel", event => {
                    const ratio = 0.005
                    value ??= parameter.getUnitValue()
                    value = clampUnit(value - Math.sign(event.deltaY) * ratio)
                    editing.modify(() => parameter.setUnitValue(value!), false)
                    debounceApprove()
                    event.preventDefault()
                    event.stopImmediatePropagation()
                }))
            }
        })(), "pointer", "modifying-controls-wheel")
    )
    observer(parameter)
    return wrapper
}
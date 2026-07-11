import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {DefaultObservableValue} from "@opendaw/lib-std"
import {AutoGainMethod, GatingMode} from "./config"
import css from "./AutoGainConfirmDialog.sass?inline"

const className = Html.adoptStyleSheet(css, "AutoGainConfirmDialog")

export type AutoGainConfirmResult = {
    method: AutoGainMethod
    targetLUFS: number
    truePeakCeilingDbTP: number
    gatingMode: GatingMode
} | null

type Construct = {
    initial: {method: AutoGainMethod, targetLUFS: number, truePeakCeilingDbTP: number, gatingMode: GatingMode}
    onSubmit: (result: AutoGainConfirmResult) => void
}

export const AutoGainConfirmDialog = ({initial, onSubmit}: Construct) => {
    const methodObservable = new DefaultObservableValue<AutoGainMethod>(initial.method)
    const targetLUFSObservable = new DefaultObservableValue<number>(initial.targetLUFS)
    const truePeakObservable = new DefaultObservableValue<number>(initial.truePeakCeilingDbTP)
    const gatingObservable = new DefaultObservableValue<GatingMode>(initial.gatingMode)

    const methodSelect: HTMLSelectElement = (
        <select onchange={(event: Event) => methodObservable.setValue((event.target as HTMLSelectElement).value as AutoGainMethod)}>
            <option value="snapshot">Snapshot (RMS, fast)</option>
            <option value="solo-render">Solo-render (LUFS, accurate)</option>
            <option value="bus-routing">Bus-routing (LUFS, single render)</option>
        </select>
    )
    methodSelect.value = initial.method

    const targetLUFSInput: HTMLInputElement = (
        <input type="number" step="0.1" min="-36" max="0"
               onchange={(event: Event) => {
                   const value = parseFloat((event.target as HTMLInputElement).value)
                   if (isFinite(value)) {targetLUFSObservable.setValue(value)}
               }}/>
    )
    targetLUFSInput.value = initial.targetLUFS.toString()

    const truePeakInput: HTMLInputElement = (
        <input type="number" step="0.1" min="-12" max="0"
               onchange={(event: Event) => {
                   const value = parseFloat((event.target as HTMLInputElement).value)
                   if (isFinite(value)) {truePeakObservable.setValue(value)}
               }}/>
    )
    truePeakInput.value = initial.truePeakCeilingDbTP.toString()

    const gatingSelect: HTMLSelectElement = (
        <select onchange={(event: Event) => gatingObservable.setValue((event.target as HTMLSelectElement).value as GatingMode)}>
            <option value="bs1770">BS.1770 (with gating)</option>
            <option value="ungated">Ungated</option>
        </select>
    )
    gatingSelect.value = initial.gatingMode

    const overlay: HTMLDivElement = <div className="overlay"/>
    const dialog: HTMLDivElement = (
        <div className={className}>
            <h2>Auto-Gain Analysis</h2>
            <p className="description">
                Run loudness analysis to balance track volumes? This computes the appropriate
                gain for each track so they sound equally loud perceptually.
            </p>
            <div className="form">
                <label>
                    <span>Method</span>
                    {methodSelect}
                </label>
                <label>
                    <span>Target LUFS</span>
                    {targetLUFSInput}
                    <span className="unit">dB</span>
                </label>
                <label>
                    <span>True Peak Ceiling</span>
                    {truePeakInput}
                    <span className="unit">dBTP</span>
                </label>
                <label>
                    <span>Gating</span>
                    {gatingSelect}
                </label>
            </div>
            <div className="buttons">
                <button className="skip" onclick={() => onSubmit(null)}>Skip</button>
                <button className="analyze primary"
                        onclick={() => onSubmit({
                            method: methodObservable.getValue(),
                            targetLUFS: targetLUFSObservable.getValue(),
                            truePeakCeilingDbTP: truePeakObservable.getValue(),
                            gatingMode: gatingObservable.getValue()
                        })}>
                    Analyze
                </button>
            </div>
        </div>
    )

    const root: HTMLDivElement = <div className="root">{overlay}{dialog}</div>
    return root
}
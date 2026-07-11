import {DefaultObservableValue, ObservableValue, Option, Terminator} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import {BusRoutingAutoGain} from "./BusRoutingAutoGain"
import {SnapshotAutoGain} from "./SnapshotAutoGain"
import {SoloRenderAutoGain} from "./SoloRenderAutoGain"
import {AutoGainConfig, AutoGainResult, AutoGainStrategy} from "./AutoGainTypes"

export class AutoGainCoordinator {
    readonly #service: StudioService
    readonly #terminator: Terminator = new Terminator()
    readonly #strategy: DefaultObservableValue<Option<AutoGainStrategy>> = new DefaultObservableValue(Option.None)
    readonly #isRunning: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #error: DefaultObservableValue<Option<string>> = new DefaultObservableValue(Option.None)
    readonly #lastResult: DefaultObservableValue<Option<AutoGainResult>> = new DefaultObservableValue(Option.None)

    constructor(service: StudioService) {
        this.#service = service
    }

    get strategy(): ObservableValue<Option<AutoGainStrategy>> {return this.#strategy}
    get isRunning(): ObservableValue<boolean> {return this.#isRunning}
    get error(): ObservableValue<Option<string>> {return this.#error}
    get lastResult(): ObservableValue<Option<AutoGainResult>> {return this.#lastResult}

    cancel(): void {
        const strategy = this.#strategy.getValue()
        if (strategy.nonEmpty()) {strategy.unwrap().cancel()}
    }

    terminate(): void {
        this.cancel()
        this.#terminator.terminate()
    }

    async run(config: AutoGainConfig): Promise<AutoGainResult> {
        this.cancel()
        this.#error.setValue(Option.None)

        const strategy = this.#createStrategy(config)
        this.#strategy.setValue(Option.wrap(strategy))

        this.#isRunning.setValue(true)
        try {
            const result = await strategy.run()
            this.#lastResult.setValue(Option.wrap(result))
            this.#isRunning.setValue(false)
            this.#strategy.setValue(Option.None)
            strategy.terminate()
            return result
        } catch (e) {
            this.#error.setValue(Option.wrap(e instanceof Error ? e.message : String(e)))
            this.#isRunning.setValue(false)
            this.#strategy.setValue(Option.None)
            strategy.terminate()
            throw e
        }
    }

    #createStrategy(config: AutoGainConfig): AutoGainStrategy {
        const service = this.#service
        switch (config.method) {
            case "snapshot":
                return new SnapshotAutoGain(service, config)
            case "solo-render":
                return new SoloRenderAutoGain(service, config)
            case "bus-routing":
                return new BusRoutingAutoGain(service, config)
        }
    }
}
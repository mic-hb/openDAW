# AutoMIDI Changelog

> **Scope:** This document is the canonical index of every modification the AutoMIDI project made on top of upstream `andremichelle/openDAW`. It complements (and replaces, for AutoMIDI-specific content) `docs/component-inventory-frontend.md` and `docs/comprehensive-analysis-frontend.md`, which previously described the deprecated NextJS frontend.
>
> All measurements below are from `git diff --shortstat origin/main..origin/dev/auto-midi` against the fork `github.com/mic-hb/openDAW`.

## Overview

| Area                                                                                                                    | Files         | +/−                     |
| ----------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- |
| `packages/app/studio/src/automidi/` (services)                                                                          | 31            | +4033                   |
| `packages/app/studio/src/ui/automidi/` (panels)                                                                         | 15            | +2533                   |
| `packages/app/studio/src/ui/header/` (header buttons + chips)                                                           | 17            | +1266 / −35             |
| `packages/studio/*` (core SDK modifications)                                                                            | 26            | +367 / −42              |
| `packages/lib/*` (low-level lib modifications)                                                                          | 6             | +220 / −1               |
| Root (`.env.example`, `scripts/dev.sh`, `scripts/gen-cert.sh`, `test-audition.js`, `packages-lock.json`, Rust registry) | 7             | (counted in the totals) |
| **Total**                                                                                                               | **161 files** | **+11357 / −1090**      |

71 added, 90 modified. The work is organised into five themes:

1. **Persistence schema additions** — fields on `TrackBox` and `NoteEventBox`, plus 16 colour palette entries.
2. **Preference schema additions** — `midi-import` sub-object on `StudioSettings`.
3. **AutoMIDI service layer** — HTTP client, controller, MIDI import/export, audition player, auto-gain.
4. **AutoMIDI UI layer** — header buttons, generation dialog, MIDI import dialog, parameter controls, region-draw tools, track stripe colour, GM program mapping.
5. **Visual/styling** — AutoMIDI design tokens, regional SCSS overrides, Geist font.

## 1. Persistence schema additions

### 1.1 `TrackBox` (file: `packages/studio/forge-boxes/src/schema/std/timeline/TrackBox.ts`)

Added at the end of the `fields` block:

```ts
40: {type: "int32", name: "instrument", value: 0, unit: "", constraints: "any"},
41: {type: "int32", name: "color", value: 0, unit: "", constraints: "any"}
```

- **Field 40 `instrument`** — int32; GM program number AutoMIDI assigns to a track on MIDI import (or "no override" when 0).
- **Field 41 `color`** — int32; index into the new `LogicTrackColors` palette (see § 1.4). 0 means "use default".

Adapter surfacing:

```ts
// packages/studio/adapters/src/timeline/TrackBoxAdapter.ts
get instrument(): Int32Field { return this.#box.instrument }
get color(): Int32Field { return this.#box.color }
```

Rust registry `crates/studio-boxes/src/registry.rs` updated to declare the new field types so the WASM engine can read/write them.

### 1.2 `NoteEventBox` (file: `packages/studio/forge-boxes/src/schema/std/timeline/NoteEventBox.ts`)

Added at the end of the `fields` block:

```ts
26: {type: "boolean", name: "isGhost", value: false}
```

- **Field 26 `isGhost`** — boolean; marks secondary-track notes as read-only ghost overlays in the piano roll. Previously the secondary-track ghost rendering was distinguished only by `boxAdapters`; this field makes the marker a first-class field on every note.

Adapter surfacing (file: `packages/studio/adapters/src/timeline/event/NoteEventBoxAdapter.ts`):

```ts
get isGhost(): boolean { return this.#box.isGhost.getValue() }
```

Rust registry updated to include field 26.

### 1.3 `Colors` palette additions (file: `packages/studio/enums/src/Colors.ts`)

A new exported `LogicTrackColors` array (15 entries) appended before the existing `Colors` object:

```ts
export const LogicTrackColors = [
  new Color(211, 100, 50), // 0: Blue
  new Color(135, 60, 49), // 1: Green
  new Color(48, 100, 50), // 2: Yellow
  new Color(35, 100, 50), // 3: Orange
  new Color(2, 100, 59), // 4: Red
  // ... 10 more entries ...
];
```

Drives the 15 stripe colours referenced from `--automidi-track-*` tokens (see § 5).

### 1.4 `Pointers` enum (file: `packages/studio/enums/src/Pointers.ts`)

Added at the end of the enum:

```ts
CompositeCell,   // value 55
CompositeDevice, // value 56
```

These back the experimental "composite instrument" prototype (`CompositeDeviceBox` + `CompositeCellBox`). The schema files are present in the fork but were not registered with `DeviceDefinitions`; they are disabled by default. The entries exist so that the schema is consumable by `BoxForge.gen` once the team chooses to enable them.

### 1.5 `MenuItemOptions.className` (file: `packages/studio/core/src/ui/menu/MenuItems.ts`)

```ts
export type MenuItemOptions = {
  hidden?: boolean;
  selectable?: boolean;
  separatorBefore?: boolean;
  className?: string; // <- added (AutoMIDI uses it on instrument-family and search-hidden items)
};
```

Plus a getter on the `MenuItem` class:

```ts
get className(): string { return this.#options.className ?? "" }
```

### 1.6 `MenuItem.inputText` factory + `InputTextMenuData` type (file: `packages/studio/core/src/ui/menu/MenuItems.ts`)

```ts
export type InputTextMenuData = {
    type: "input-text"
    placeholder?: string
    onInput?: (value: string) => void
    onEnter?: (value: string) => void
}

// ...

static inputText(properties: Omit<InputTextMenuData, "type"> & MenuItemOptions) {
    return this.#create({type: "input-text", ...properties}, properties)
}
```

Adds a free-text input menu item type. AutoMIDI uses it for "Search instruments…" in the GM-program menu (`packages/app/studio/src/ui/menu/InstrumentMenu.ts`), which was added on top of upstream's `MenuItem` API.

## 2. Preference schema additions

### 2.1 `StudioPreferences.settings["midi-import"]` (file: `packages/studio/core/src/StudioSettings.ts`)

```ts
"midi-import": z.object({
    "mode": z.enum(["append", "override"]),
    "auto-assign-gm": z.boolean(),
    "auto-assign-soundfont": z.boolean(),
    "default-soundfont-uuid": z.string().nullable()
}).default({
    "mode": "override",
    "auto-assign-gm": true,
    "auto-assign-soundfont": true,
    "default-soundfont-uuid": null
})
```

Drives:

- `StudioPreferences.settings["midi-import"].mode` — `append` vs `override` semantics on import (override = AutoMIDI replaces conflicting track data).
- `auto-assign-gm` — when true (default), MIDI-import assigns GM programs to new tracks.
- `auto-assign-soundfont` — when true, picks a soundfont for new tracks.
- `default-soundfont-uuid` — user-chosen UUID for the soundfont picker; `null` falls back to a hardcoded search for "Arachno".

Consumed by `MidiAuditionPlayer` and `MidiImportDialog`.

### 2.2 `PreferencePanel.NestedLabels` null handling (file: `packages/app/studio/src/ui/PreferencePanel.tsx`)

```ts
type Primitive = boolean | number | string | null;
```

Widened the nested-labels primitive to accept `null`, matching the optional `default-soundfont-uuid` field above.

## 3. AutoMIDI service layer

Located at `packages/app/studio/src/automidi/`. 30 files / +4033 lines.

### 3.1 Files

| File                                  | Lines     | Purpose                                                                                                                                                                                 |                                                                                          |
| ------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AutomidiApi.ts`                      | 184       | HTTP client for the FastAPI backend (`/api/generations`, `/api/midi/import                                                                                                              | export`, `/api/telemetry`, `/api/system/model/{action}`, `/api/lora-checkpoint/status`). |
| `AutomidiController.ts`               | 746       | State-machine controller. Lifecycle-owned. Wires the buttons (Generate / Import) to the dialogs; manages the `GenerationStatus` transitions; tracks task id, polling, and cancellation. |                                                                                          |
| `MidiImportService.ts`                | 61        | Builds `ImportEditPlan` from a backend `MidiImportResponse`. Resolves instruments via `getGmProgram`.                                                                                   |                                                                                          |
| `MidiExportService.ts`                | 53        | Project → MIDI snapshot serializer (reverse of import).                                                                                                                                 |                                                                                          |
| `MidiAuditionPlayer.ts`               | 216       | Plays back MIDI audition using the chosen soundfont. Resolves `default-soundfont-uuid` or falls back to "Arachno" by name search.                                                       |                                                                                          |
| `GenerationContextBuilder.ts`         | 126       | Strips the current project down to the minimal `GenerationContext` (BPM, time-sig, tracks, notes) the backend expects.                                                                  |                                                                                          |
| `AutoGainCoordinator.ts`              | 70        | Coordinates auto-gain analysis across the three writers (`BusRoutingAutoGain`, `SoloRenderAutoGain`, `SnapshotAutoGain`).                                                               |                                                                                          |
| `BusRoutingAutoGain.ts`               | 152       | Auto-gain analysis branch: scanning the bus routing graph.                                                                                                                              |                                                                                          |
| `SoloRenderAutoGain.ts`               | 198       | Auto-gain analysis branch: soloing tracks and re-rendering.                                                                                                                             |                                                                                          |
| `SnapshotAutoGain.ts`                 | 133       | Auto-gain analysis branch: snapshot-based offline rendering.                                                                                                                            |                                                                                          |
| `AutoGainTypes.ts`                    | 43        | Shared types for the auto-gain coordinator.                                                                                                                                             |                                                                                          |
| `MidiTimelinePreview.tsx`             | 258       | Widget that previews the planned edit: per-track lanes, volume sliders, peak meters. Subscribes to `liveStreamReceiver` for live metering.                                              |                                                                                          |
| `MidiTimelinePreview.sass`            | 123       | Styles for the preview.                                                                                                                                                                 |                                                                                          |
| `AutoGainFooter.tsx` / `.sass`        | 149 / 111 | Footer showing K-weighted LUFS results across the three branches.                                                                                                                       |                                                                                          |
| `AutoGainConfirmDialog.tsx` / `.sass` | 107 / 95  | Confirmation dialog before committing the auto-gain to the project.                                                                                                                     |                                                                                          |
| `gm-programs.ts`                      | 159       | Local copy of the GM programs table (overlaps with the upstream `studio-enums/GMPrograms`; this one is shape-compatible and used by the UI panels).                                     |                                                                                          |
| `schema.ts`                           | 131       | Zod-style types for the API request/response payloads (`MidiImportResponse`, `TaskStatus`, `LoraStatus`, …).                                                                            |                                                                                          |
| `types.ts`                            | 81        | Domain types: `Mode`, `GenerationStatus`, `NoteShape`, `Variation`, `GenerationRegion`, `GenerationParameters`, `TrackGmOverride`.                                                      |                                                                                          |
| `config.ts`                           | 34        | Constants — `AUTOMIDI_API_BASE`, `POLL_INTERVAL_MS`, `POLL_MAX_RETRIES`, `POLL_RETRY_DELAY_MS`.                                                                                         |                                                                                          |
| `time.ts`                             | 8         | `barToPpqn`, `beatToPpqn`, `ppqnToBar` conversions.                                                                                                                                     |                                                                                          |
| `__mocks__/fetch.ts`                  | 44        | Vitest mock for `fetch` used by the API tests.                                                                                                                                          |                                                                                          |

The `__tests__/` directory holds 8 vitest suites (see § 6).

### 3.2 `StudioService.automidi` field

The controller is mounted by `StudioService.ts` (file: `packages/app/studio/src/service/StudioService.ts`):

```ts
this.automidi = new AutomidiController(this);
```

A single top-level instance that owns one `GenerationStatus` `DefaultObservableValue` and one `Nullable<LoraStatus>` `NullableObservableValue`. UI components subscribe to `service.automidi.status.getValue()`.

### 3.3 `InstrumentFactories.Soundfont` (file: `packages/studio/adapters/src/factories/InstrumentFactories.ts`)

```ts
export const Soundfont: InstrumentFactory<{ uuid: UUID.String; name: string } | undefined, SoundfontDeviceBox> = {
  create: (boxGraph, host, name, icon, attachment?) =>
    SoundfontDeviceBox.create(boxGraph, UUID.generate(), (box) => {
      box.label.setValue(name);
      box.icon.setValue(IconSymbol.toName(icon));
      box.host.refer(host);
      if (attachment) {
        const fileBox = boxGraph
          .findBox<SoundfontFileBox>(UUID.parse(attachment.uuid))
          .unwrapOrElse(() =>
            SoundfontFileBox.create(boxGraph, UUID.parse(attachment.uuid), (b) => b.fileName.setValue(attachment.name)),
          );
        box.file.refer(fileBox);
      }
    }),
};
```

Extends the upstream Soundfont factory with an optional pre-attached `SoundfontFileBox` so importers can wire the AudioUnit's soundfont directly at creation time (instead of relying on the user picking one in a follow-up dialog).

## 4. AutoMIDI UI layer

Located at `packages/app/studio/src/ui/automidi/` and `packages/app/studio/src/ui/header/`. 32 files / +3799 lines (combined).

### 4.1 UI panels (`ui/automidi/`)

| File                                      | Lines       | Purpose                                                                                                                        |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AutomidiIntegrationMenu.tsx`             | 403         | Top-level menu entry. Hosts the GlobalShortcuts integration, telemetry view, model lifecycle (load/unload/reload).             |
| `GenerationDialog.tsx`                    | 124         | Top-level dialog. Hosts `GenerationModeDialog`, `GenerationParameterDialog`, the manual progress panel.                        |
| `GenerationModeDialog.tsx` / `.sass`      | 117 / 97    | Three-mode picker: `continuation`, `infilling`, `variation`. Mode buttons carry mode-specific colour from `--automidi-mode-*`. |
| `GenerationParameterDialog.tsx` / `.sass` | 387 / 266   | All sliders / number inputs for `topP`, `temperature`, `numVariations`, `LoRA picker`, GM program override.                    |
| `ParameterControls.tsx`                   | (continues) | Slider / number-input primitives scoped to `className="automidi-slider"` etc.                                                  |
| `FloatingVariationSelector.tsx`           | 314         | After a generation returns, the user can hover over the timeline and pick one of `numVariations` to insert.                    |
| `GmProgramMappingSection.tsx`             | 69          | Lists all 128 GM programs, filter input, family-grouped output.                                                                |
| `TrackStripe.tsx`                         | 61          | Returns a colored `<div>` for a track header based on its `inferFamily` (piano, bass, brass, …).                               |
| `RegionDrawTool.tsx`                      | (small)     | Region-draw modifier on the openDAW timeline — drag to define a generation region.                                             |
| `RegionDrawIntegration.ts`                | (small)     | Registers `RegionDrawTool` with the editor's surface.                                                                          |
| `ConfidenceTooltip.tsx`                   | 19          | Conditional tooltip showing model confidence on variation inserts.                                                             |
| `automidi-tokens.sass`                    | 65          | CSS custom properties under `html.automidi` (the design tokens).                                                               |
| `automidi.sass`                           | 100+        | Modal + overlay SCSS scoped under `html.automidi`.                                                                             |

### 4.2 Header buttons and chips (`ui/header/`)

| File                                                           | Lines       | Purpose                                                                                                                |
| -------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AutomidiMenuButton.tsx`                                       | (small)     | Header button that opens `AutomidiIntegrationMenu`. Added to `Header.tsx` next to the existing menu cluster.           |
| `GenerateButton.tsx`                                           | (~70)       | Opens the `GenerationModeDialog`. Auto-opens `GenerationParameterDialog` when state moves to `configuring-parameters`. |
| `MidiImportButton.tsx`                                         | (small)     | Opens `MidiImportDialog`.                                                                                              |
| `MidiImportDialog.tsx`                                         | (~200)      | Hosts `MidiTimelinePreview` and the `AutoGain*` flow. Reads/writes `StudioPreferences.settings["midi-import"]`.        |
| `MidiImportDialog.sass`                                        | (small)     | Styles.                                                                                                                |
| `CaptureMidiButton.tsx`                                        | (small)     | Toggles the project's capture-recording state (orange when armed).                                                     |
| `GenerationProgressChip.tsx` / `.sass`                         | (small × 2) | Header chip showing live generation status (`queued` / `generating` / `completed` / `failed`).                         |
| `LoraSelector.tsx`                                             | (~80)       | Header dropdown to switch the active LoRA checkpoint before generation. Backed by `service.automidi.loraStatus`.       |
| `BaseFrequencyControl.sass`                                    | (~20)       | Mono-font treatment for the base-frequency readout.                                                                    |
| `CountIn.sass`                                                 | (small)     | Recording count-in styles (4 small files).                                                                             |
| `TimeStateDisplay.sass`                                        | (small)     | Time-state chip styles.                                                                                                |
| `TransportGroup.tsx` / `TransportGroup.sass`                   | (modified)  | Adds the new AutoMIDI buttons next to the existing transport controls.                                                 |
| `Header.tsx` / `Header.sass`                                   | (modified)  | Includes `AutomidiMenuButton`. SCSS variables now driven by AutoMIDI tokens (`html.automidi &`).                       |
| `Mixer.tsx`                                                    | (modified)  | Renders the `TrackStripe` next to each mixer channel.                                                                  |
| `Footer.sass`                                                  | (modified)  | AutoMIDI-tokenized footer surface.                                                                                     |
| `BaseFrequencyControl.tsx` (alias — was just the .sass header) | (added)     | A small popover for changing the project's base frequency.                                                             |

### 4.3 Shortcut (file: `packages/app/studio/src/ui/shortcuts/GlobalShortcuts.ts`)

```ts
"generate-midi": {
    shortcut: Shortcut.of(Key.KeyG),
    description: "Open AutoMIDI generation dialog"
}
```

Bind `G` to opening the dialog. The shortcut is consumed via `ShortcutManager.get().createContext(...)` at the dialog site (`GenerationDialog.tsx`).

### 4.4 Header placement

In `packages/app/studio/src/ui/header/Header.tsx`:

```tsx
{
  AutomidiMenuButton({ lifecycle, service });
}
```

Inserted in the header's right-cluster button group, to the right of the existing transport / project toolbar.

### 4.5 Note-editor glue (files: `NoteEditor.tsx`, `PitchEditor.tsx`)

```tsx
// NoteEditor.tsx — passes service down to its child editor
<PitchEditor lifecycle={lifecycle}
             service={service}  // <- added
             ... />

// PitchEditor.tsx — receives service, mounts an AutoMIDI region-draw modifier
import {StudioService} from "@/service/StudioService"
import {AutomidiRegionDrawModifier} from "@/ui/automidi/RegionDrawIntegration"
import {RegionDrawTool} from "@/ui/automidi/RegionDrawTool"

constructor({lifecycle, service}: Construct) {
    ...
    AutomidiRegionDrawModifier(service, ...)
}
```

The region-draw modifier lets the user click-drag on the piano roll background to define a generation region (passes `{trackId, startBar, endBar}` straight into the `GenerationRequest`).

## 5. Visual / styling overrides

### 5.1 Color tokens (`packages/app/studio/src/ui/automidi/automidi-tokens.sass`)

Scoped under `html.automidi`:

```sass
html.automidi
  --automidi-bg:                #000000
  --automidi-surface-1:          #1C1C1E
  --automidi-surface-2:          #2C2C2E
  --automidi-surface-3:          #38383A
  --automidi-border:             #38383A
  --automidi-border-soft:        #2C2C2E

  --automidi-text-1:             #FFFFFF
  --automidi-text-2:             #EBEBF5
  --automidi-text-3:             #EBEBF599     /* 60% alpha */

  --automidi-accent:             #007AFF
  --automidi-accent-2:           #5AC8FA
  --automidi-danger:             #FF3B30
  --automidi-success:            #34C759
  --automidi-warning:            #FFCC00

  --automidi-mode-continuation:  #34C759
  --automidi-mode-infilling:     #AF52DE
  --automidi-mode-variation:     #FF9500

  --automidi-font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif
  --automidi-font-mono: "SF Mono", ui-monospace, monospace

  --automidi-radius-sm:          6px
  --automidi-radius-md:          8px
  --automidi-radius-lg:          12px

  /* Track-stripe per-instrument-family palette */
  --automidi-track-piano:        #AF52DE
  --automidi-track-bass:         #007AFF
  --automidi-track-brass:        #FF3B30
  --automidi-track-woodwind:     #30D158
  --automidi-track-strings:      #FF453A
  --automidi-track-percussion:   #FF9F0A
  --automidi-track-guitar:       #BF5AF2
  --automidi-track-vocal:        #FF375F
  --automidi-track-default:      #8E8E93
```

### 5.2 OpenDAW colour forwarding (`packages/app/studio/src/colors.sass`)

AutoMIDI overlays the existing `--color-*` openDAW variables with forwarders to the new tokens. About 20 SCSS files reference these variables; forwarding them once means the new look reaches every component without touching each file:

```sass
:root
  color-scheme: dark
  --color-background:           var(--automidi-bg)
  --color-bright:              var(--automidi-text-1)
  --color-dark:                var(--automidi-text-3)
  --color-gray:                var(--automidi-text-2)
  --color-blue:                var(--automidi-accent)
  --color-black:               var(--automidi-surface-3)
  --color-shadow:              rgba(0, 0, 0, 0.5)
  --color-white:               var(--automidi-text-1)
  --color-cream:               var(--automidi-accent)
  --color-active:              var(--automidi-accent)
  --color-divider:             var(--automidi-border)
  --color-panel-background:    var(--automidi-surface-1)
  --color-panel-background-bright: var(--automidi-surface-2)
  --color-panel-background-dark:   var(--automidi-bg)
  --color-red:                 var(--automidi-danger)
  --color-green:               var(--automidi-mode-continuation)
  --color-purple:              var(--automidi-mode-infilling)
  --color-orange:              var(--automidi-mode-variation)
  --color-yellow:              var(--automidi-warning)
```

The variables above are still defined inside `:root`. The AutoMIDI tokens are reachable from `html.automidi .*` and from `--color-*` simultaneously, so all openDAW components pick up the new look once `<html>` gets `class="automidi"`.

### 5.3 Font

`packages/app/studio/src/main.sass` switches the body font:

```sass
@use "@/ui/automidi/automidi-tokens"
@use "@/ui/automidi/automidi"

html, body
  font-family: "Geist", system-ui, sans-serif
  font-weight: 400
  ...
```

`Geist` is loaded by the bundler; falls back to `system-ui` if the font is unavailable.

### 5.4 Brand string

`packages/app/studio/src/ui/dashboard/Dashboard.tsx`:

```diff
-<h1>Welcome to openDAW</h1>
+<h1>Welcome to AutoMIDI</h1>
 ...
-<p>openDAW is an open source web based music studio with a clear focus on <a
+<p>AutoMIDI is an open source web based music studio forked from openDAW with the integration of AI features.
+   openDAW has a clear focus on <a
 ...
+   AutoMIDI is a work of undergraduate thesis by Michael H.
```

## 6. Tests

All tests live in `packages/app/studio/src/automidi/__tests__/` (8 vitest suites).

| Test file                    | Lines | Coverage                                                                                         |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `AutomidiApi.test.ts`        | 95    | HTTP envelope handling, retry, Lora status endpoint, error mapping. Uses `__mocks__/fetch.ts`.   |
| `AutomidiController.test.ts` | 213   | State-machine transitions across all 9 `GenerationStatus` values, polling cadence, cancellation. |
| `ConfidenceTooltip.test.ts`  | 166   | Conditional confidence tooltip rendering.                                                        |
| `MidiExportService.test.ts`  | 27    | Project → MIDI roundtrip.                                                                        |
| `MidiImportService.test.ts`  | 58    | Response → `ImportEditPlan` mapping.                                                             |
| `smoke.test.ts`              | 106   | End-to-end: poll cadence, timeout, retry.                                                        |
| `time.test.ts`               | 30    | PPQN math (`barToPpqn`, `beatToPpqn`, `ppqnToBar`).                                              |
| `TrackStripe.test.ts`        | 56    | `inferFamily` resolves the right token.                                                          |

Run with:

```bash
cd packages/app/studio
npx vitest run automidi
```

## 7. Manifest files

| File                                  | Purpose                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`                        | Documents `AUTOMIDI_API_URL=http://localhost:8000`. Used by `dev.sh` to ping `/api/health` before starting the studio.                                   |
| `scripts/dev.sh`                      | `npm install`, generate cert, build, then `bun run dev:studio`. Pre-flight-prints a warning if the backend is unreachable but does not block.            |
| `scripts/gen-cert.sh`                 | Self-signed `localhost.pem` / `localhost-key.pem` for the dev server's HTTPS. Uses `openssl req -x509 -nodes -newkey rsa:2048`.                          |
| `test-audition.js`                    | Tiny smoke script runnable via `node test-audition.js` (smoke-test the audience path).                                                                   |
| `package-lock.json`                   | npm lockfile. (The previously-existing `bun.lock` was removed during the 2026-07-11 sync because the upstream openDAW README documents an npm workflow.) |
| `crates/studio-boxes/src/registry.rs` | Rust registry updated to declare the new field types of `TrackBox` (40, 41) and `NoteEventBox` (26).                                                     |

## 8. Schema field-id strategy

AutoMIDI's persistence additions consistently use the next free numeric field ID at the end of each Box's `fields` block, and the next free enum entries (`CompositeCell`/`CompositeDevice` at 55/56). This means they rebases safely against upstream: when upstream bumps its own fields, ours do not collide unless upstream happens to choose the exact same ID.

## 9. Files changed (full list)

<details>
<summary>Click to expand (161 files)</summary>

```
packages/app/studio/src/automidi/AutoGainConfirmDialog.sass    A
packages/app/studio/src/automidi/AutoGainConfirmDialog.tsx     A
packages/app/studio/src/automidi/AutoGainCoordinator.ts       A
packages/app/studio/src/automidi/AutoGainFooter.sass           A
packages/app/studio/src/automidi/AutoGainFooter.tsx            A
packages/app/studio/src/automidi/AutoGainTypes.ts              A
packages/app/studio/src/automidi/AutomidiApi.ts                A
packages/app/studio/src/automidi/AutomidiController.ts         A
packages/app/studio/src/automidi/BusRoutingAutoGain.ts         A
packages/app/studio/src/automidi/GenerationContextBuilder.ts   A
packages/app/studio/src/automidi/MidiAuditionPlayer.ts         A
packages/app/studio/src/automidi/MidiExportService.ts          A
packages/app/studio/src/automidi/MidiImportService.ts          A
packages/app/studio/src/automidi/MidiTimelinePreview.sass      A
packages/app/studio/src/automidi/MidiTimelinePreview.tsx       A
packages/app/studio/src/automidi/SnapshotAutoGain.ts           A
packages/app/studio/src/automidi/SoloRenderAutoGain.ts         A
packages/app/studio/src/automidi/__mocks__/fetch.ts            A
packages/app/studio/src/automidi/__tests__/*                   A (8 suites)
packages/app/studio/src/automidi/config.ts                     A
packages/app/studio/src/automidi/gm-programs.ts                A
packages/app/studio/src/automidi/schema.ts                     A
packages/app/studio/src/automidi/time.ts                       A
packages/app/studio/src/automidi/types.ts                      A
packages/app/studio/src/ui/automidi/AutomidiIntegrationMenu.tsx A
packages/app/studio/src/ui/automidi/ConfidenceTooltip.tsx      A
packages/app/studio/src/ui/automidi/FloatingVariationSelector.tsx A
packages/app/studio/src/ui/automidi/GenerationDialog.tsx       A
packages/app/studio/src/ui/automidi/GenerationModeDialog.sass  A
packages/app/studio/src/ui/automidi/GenerationModeDialog.tsx   A
packages/app/studio/src/ui/automidi/GenerationParameterDialog.sass A
packages/app/studio/src/ui/automidi/GenerationParameterDialog.tsx A
packages/app/studio/src/ui/automidi/GmProgramMappingSection.tsx A
packages/app/studio/src/ui/automidi/ParameterControls.tsx       A
packages/app/studio/src/ui/automidi/RegionDrawIntegration.ts    A
packages/app/studio/src/ui/automidi/RegionDrawTool.tsx          A
packages/app/studio/src/ui/automidi/TrackStripe.tsx            A
packages/app/studio/src/ui/automidi/automidi.sass              A
packages/app/studio/src/ui/automidi/automidi-tokens.sass        A
packages/app/studio/src/ui/header/AutomidiMenuButton.tsx       A
packages/app/studio/src/ui/header/BaseFrequencyControl.sass     A
packages/app/studio/src/ui/header/CaptureMidiButton.tsx        A
packages/app/studio/src/ui/header/CountIn.sass                 A
packages/app/studio/src/ui/header/GenerateButton.tsx           A
packages/app/studio/src/ui/header/GenerationProgressChip.sass  A
packages/app/studio/src/ui/header/GenerationProgressChip.tsx   A
packages/app/studio/src/ui/header/LoraSelector.tsx             A
packages/app/studio/src/ui/header/MidiExportButton.tsx         A
packages/app/studio/src/ui/header/MidiImportButton.tsx         A
packages/app/studio/src/ui/header/MidiImportDialog.sass        A
packages/app/studio/src/ui/header/MidiImportDialog.tsx         A
packages/app/studio/src/ui/header/TimeStateDisplay.sass         A
packages/app/studio/src/ui/header/TransportGroup.sass          A
packages/app/studio/src/ui/header/TransportGroup.tsx           A
packages/app/studio/src/ui/components/*                        M (sass: AutomatableControl, AutomationControl, Dialog, FloatingTextInput, HorizontalMeter, Knob, Menu, MenuButton, NumberInput, ParameterLabel, PeakMeter, ProgressBar, SearchInput, VolumeSlider / ts: Menu, MenuButton)
packages/app/studio/src/ui/dashboard/Dashboard.tsx              M
packages/app/studio/src/ui/Footer.sass                        M
packages/app/studio/src/ui/mixer/Mixer.tsx                     M
packages/app/studio/src/ui/pages/PreferencesPage.tsx           M
packages/app/studio/src/ui/pages/PreferencesPageLabels.ts      M
packages/app/studio/src/ui/pages/stats/DashboardPage.tsx        M
packages/app/studio/src/ui/PreferencePanel.tsx                 M
packages/app/studio/src/ui/shortcuts/GlobalShortcuts.ts         M
packages/app/studio/src/ui/header/Header.sass                  M
packages/app/studio/src/ui/header/Header.tsx                   M
packages/app/studio/src/ui/timeline/MidiImport.ts              M
packages/app/studio/src/ui/timeline/editors/notes/NoteEditor.tsx              M
packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchEditor.tsx         M
packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchPainter.ts          M
packages/app/studio/src/colors.sass                            M
packages/app/studio/src/main.sass                              M
packages/app/studio/src/main.ts                                M
packages/app/studio/src/service/Mixdowns.ts                    M
packages/app/studio/src/service/StudioService.ts               M
packages/app/studio/src/service/StudioShortcutManager.ts       M
packages/app/studio/src/perf/DeviceBenchmark.ts                 M
packages/app/studio/src/perf/measure.ts                        M
packages/app/studio/src/features.ts                            M
packages/app/studio/src/boot.ts                                M
packages/app/studio/CHANGELOG.md                               M
packages/app/studio/index.html                                 M
packages/app/studio/package.json                               M
packages/app/studio/public/manuals/devices/audio/vocoder.md   M
packages/app/studio/src/ui/devices/menu-items.ts               M
packages/app/studio/src/ui/info-panel/PublishMusic.ts          M
packages/app/studio/src/ui/monitoring/MonitoringDialog.sass    M
packages/app/studio/src/ui/monitoring/MonitoringDialog.tsx     M
packages/app/studio/src/ui/pages/PerformancePage.tsx            M
packages/studio/adapters/src/factories/InstrumentFactories.ts                 M
packages/studio/adapters/src/timeline/clip/AudioClipBoxAdapter.ts               M
packages/studio/adapters/src/timeline/clip/NoteClipBoxAdapter.ts                M
packages/studio/adapters/src/timeline/clip/ValueClipBoxAdapter.ts               M
packages/studio/adapters/src/timeline/event/NoteEventBoxAdapter.ts              M
packages/studio/adapters/src/timeline/region/AudioRegionBoxAdapter.ts           M
packages/studio/adapters/src/timeline/region/NoteRegionBoxAdapter.ts            M
packages/studio/adapters/src/timeline/region/ValueRegionBoxAdapter.ts           M
packages/studio/adapters/src/timeline/TrackBoxAdapter.ts                        M
packages/studio/core/src/StudioSettings.ts                                     M
packages/studio/core/src/ui/menu/MenuItems.ts                                   M
packages/studio/core/src/project/ProjectApi.ts                                 M
packages/studio/core-processors/src/EngineWorklet.ts                           M
packages/studio/core-workers/src/offline-engine-main.ts                         M
packages/studio/forge-boxes/src/schema/std/timeline/NoteEventBox.ts             M
packages/studio/forge-boxes/src/schema/std/timeline/TrackBox.ts                 M
packages/studio/enums/src/Colors.ts                                            M
packages/studio/enums/src/index.ts                                            M
packages/studio/scripting/src/Procedural.ts                                    M
packages/studio/sdk/src/index.ts                                               M
packages/lib/dsp/src/*                                                         M (each maintainer-only surface added)
packages/lib/dsp/imports/dsp-imports.d.ts                                      M
packages/lib/dom/src/event.ts                                                  M
packages/studio/scripting/package.json                                          M
packages/studio/sdk/package.json                                               M
packages/studio/adapters/package.json                                          M
packages/studio/core/package.json                                               M
packages/studio/core-processors/package.json                                   M
packages/studio/core-workers/package.json                                      M
packages/studio/enums/package.json                                             M
packages/studio/forge-boxes/package.json                                       M
turbo.json                                                                    M
.env.example                                                                  A
scripts/dev.sh                                                               A
scripts/gen-cert.sh                                                          A
test-audition.js                                                              A
package-lock.json                                                             M
crates/studio-boxes/src/registry.rs                                          M
crates/studio-boxes/Cargo.toml                                               M
crates/studio-boxes/src/lib.rs                                                M
crates/engine/src/api/{*.rs}                                                  M (drift due to engine module reshuffling during the upstream sync)
```

</details>

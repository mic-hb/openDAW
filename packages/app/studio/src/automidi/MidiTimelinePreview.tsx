import { createElement } from "@opendaw/lib-jsx";
import { Html } from "@opendaw/lib-dom";
import {
  DefaultObservableValue,
  DefaultParameter,
  Editing,
  Lifecycle,
  StringMapping,
  Terminator,
} from "@opendaw/lib-std";
import { gainToDb } from "@opendaw/lib-dsp";
import { IconCartridge } from "@/ui/components/Icon.tsx";
import { HorizontalVolumeSlider } from "@/ui/components/HorizontalVolumeSlider.tsx";
import { HorizontalPeakMeter } from "@/ui/components/HorizontalPeakMeter.tsx";
import { MenuButton } from "@/ui/components/MenuButton.tsx";
import { MenuItem } from "@opendaw/studio-core";
import { LiveStreamReceiver } from "@opendaw/lib-fusion";
import { installGmInstrumentMenu } from "@/ui/menu/InstrumentMenu";
import { AudioUnitBoxAdapter } from "@opendaw/studio-adapters";
import { IconSymbol, GM_PROGRAMS, LogicTrackColors } from "@opendaw/studio-enums";
import { ImportEditPlan, ImportEditPlanTrack } from "./MidiImportService";
import { MidiAuditionPlayer } from "./MidiAuditionPlayer";
import css from "./MidiTimelinePreview.sass?inline";

const className = Html.adoptStyleSheet(css, "MidiTimelinePreview");

type Construct = {
  plan: ImportEditPlan;
  selectedTracks: DefaultObservableValue<Set<number>>;
  playingTrackIndex: DefaultObservableValue<number | null>;
  trackVolumes: Map<number, number>;
  lifecycle: Lifecycle;
  editing: Editing;
  liveStreamReceiver: LiveStreamReceiver;
  auditionPlayer: MidiAuditionPlayer;
  onTogglePlay: (index: number) => void;
  onChangeProgram: (trackIndex: number, newProgram: number) => void;
  onVolumeChange: (trackIndex: number, dbValue: number) => void;
};

type TrackRow = {
  element: HTMLElement;
  parameter: DefaultParameter<number>;
};

export const MidiTimelinePreview = ({
  plan,
  selectedTracks,
  playingTrackIndex,
  trackVolumes,
  lifecycle,
  editing,
  liveStreamReceiver,
  auditionPlayer,
  onTogglePlay,
  onChangeProgram,
  onVolumeChange
}: Construct) => {
  // Compute scale values across all tracks so note silhouettes are relative
  let maxBeats = 0;
  let minPitch = 127;
  let maxPitch = 0;
  plan.tracks.forEach((track) => {
    if (track.notes.length === 0) return;
    const lastNote = track.notes[track.notes.length - 1];
    maxBeats = Math.max(maxBeats, lastNote.startBeats + lastNote.durationBeats);
    track.notes.forEach((note) => {
      minPitch = Math.min(note.pitch, minPitch);
      maxPitch = Math.max(note.pitch, maxPitch);
    });
  });
  if (maxBeats === 0) maxBeats = 1;
  const pitchRange = Math.max(12, maxPitch - minPitch + 4);
  const pitchMin = Math.max(0, minPitch - 2);

  const drawSilhouette = (canvas: HTMLCanvasElement, track: ImportEditPlanTrack, color: { toString: () => string }) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (track.notes.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, h / 2 - 1, w, 2);
      return;
    }
    ctx.fillStyle = color.toString();
    for (const note of track.notes) {
      const x = (note.startBeats / maxBeats) * w;
      const noteWidth = Math.max(1, (note.durationBeats / maxBeats) * w);
      const y = h - ((note.pitch - pitchMin) / pitchRange) * h;
      ctx.fillRect(x, Math.max(0, y - 2), noteWidth, 4);
    }
  };

  const buildRow = (track: ImportEditPlanTrack, i: number, tracksTerminator: Terminator): TrackRow => {
    const color = LogicTrackColors[i % LogicTrackColors.length];
    const isPlaying = playingTrackIndex.getValue() === i;
    const isGlobalPlaying = playingTrackIndex.getValue() === -1;
    const isSelected = selectedTracks.getValue().has(i);
    const gmName = track.isDrum
      ? "Drum Kit"
      : (GM_PROGRAMS.find((p) => p.program === track.program)?.name ?? `Program ${track.program}`);

    const parameter = new DefaultParameter<number>(
      AudioUnitBoxAdapter.VolumeMapper,
      StringMapping.decible,
      "track-volume",
      trackVolumes.get(i) ?? 0.0,
    );
    const originalSetUnitValue = parameter.setUnitValue.bind(parameter);
    parameter.setUnitValue = (unit: number) => {
      originalSetUnitValue(unit);
      const db = AudioUnitBoxAdapter.VolumeMapper.y(unit);
      onVolumeChange(i, db);
    };

    const selectionBox: HTMLInputElement = (
      <input
        type="checkbox"
        className="track-select"
        defaultChecked={isSelected}
        onchange={() => {
          const current = new Set(selectedTracks.getValue());
          if (current.has(i)) current.delete(i);
          else current.add(i);
          selectedTracks.setValue(current);
        }}
      />
    );

    const colorSwatch: HTMLElement = <div className="track-color" style={{ background: color.toString() }} />;

    const nameLabel: HTMLElement = (
      <span className="track-name" title={track.name || `Track ${i + 1}`}>
        {track.name || `Track ${i + 1}`}
      </span>
    );

    const programLabel: HTMLElement = <span className="track-program">{gmName}</span>;

    const programPicker: HTMLElement | null = track.isDrum ? null : (
      <MenuButton
        root={MenuItem.root().setRuntimeChildrenProcedure(
          installGmInstrumentMenu(track.program, (program: number) => onChangeProgram(i, program)),
        )}
        className="program-select"
      >
        <span className="program-label">
          #{track.program + 1} {gmName}
        </span>
      </MenuButton>
    );

    const volumeSlider: HTMLElement = (
      <HorizontalVolumeSlider lifecycle={tracksTerminator} editing={editing} parameter={parameter} />
    );

    const peaks = new Float32Array(2);
    peaks.fill(Number.NEGATIVE_INFINITY);
    const peakMeter: HTMLElement = (
      <HorizontalPeakMeter lifecycle={tracksTerminator} peaksInDb={peaks} />
    );

    const liveStreamTerminator = tracksTerminator.own(new Terminator());
    const syncLiveStream = () => {
      liveStreamTerminator.terminate();
      const isThisTrackPlaying = playingTrackIndex.getValue() === i
        || (playingTrackIndex.getValue() === -1 && selectedTracks.getValue().has(i));
      if (!isThisTrackPlaying) {
        peaks.fill(Number.NEGATIVE_INFINITY);
        return;
      }
      const addressOpt = auditionPlayer.getPreviewAudioUnitAddress(i);
      if (addressOpt.isEmpty()) {
        peaks.fill(Number.NEGATIVE_INFINITY);
        return;
      }
      liveStreamTerminator.own(
        liveStreamReceiver.subscribeFloats(addressOpt.unwrap(), (array: Float32Array) => {
          peaks[0] = gainToDb(array[0]);
          peaks[1] = gainToDb(array[1]);
        })
      );
    };
    tracksTerminator.ownAll(
      playingTrackIndex.subscribe(syncLiveStream),
      selectedTracks.subscribe(syncLiveStream)
    );
    syncLiveStream();

    const silhouette: HTMLCanvasElement = <canvas width={420} height={64} />;
    drawSilhouette(silhouette, track, color);

    const playIconObservable = new DefaultObservableValue<IconSymbol>(isPlaying ? IconSymbol.Stop : IconSymbol.Play);
    const playIcon: HTMLElement = (
      <IconCartridge lifecycle={tracksTerminator} symbol={playIconObservable} className="play-icon" />
    );
    const playButton: HTMLElement = (
      <button
        className={Html.buildClassList("play-btn", isPlaying && "active")}
        title={isPlaying ? "Stop" : "Solo & Play"}
        onclick={() => onTogglePlay(i)}
      >
        {playIcon}
      </button>
    );

    const rowChildren: HTMLElement[] = [
      selectionBox,
      colorSwatch,
      <div className="track-info">
        {nameLabel}
        {programLabel}
        {programPicker}
        <div className="volume-row">{volumeSlider}</div>
        <div className="peak-row">{peakMeter}</div>
      </div>,
      <div className="track-timeline">{silhouette}</div>,
      playButton,
    ];
    const row: HTMLElement = (
      <div
        className={Html.buildClassList(
          "track-row",
          isPlaying && "playing",
          isGlobalPlaying && isSelected && "global-playing",
        )}
      >
        {rowChildren}
      </div>
    );

    const updatePlayingState = () => {
      const currentlyPlaying = playingTrackIndex.getValue() === i;
      const currentlyGlobalPlaying = playingTrackIndex.getValue() === -1;
      const currentlySelected = selectedTracks.getValue().has(i);
      row.classList.toggle("playing", currentlyPlaying);
      row.classList.toggle("global-playing", currentlyGlobalPlaying && currentlySelected);
      playButton.classList.toggle("active", currentlyPlaying);
      playIconObservable.setValue(currentlyPlaying ? IconSymbol.Stop : IconSymbol.Play);
    };
    tracksTerminator.ownAll(
      playingTrackIndex.subscribe(updatePlayingState),
      selectedTracks.subscribe(updatePlayingState),
    );

    return { element: row, parameter };
  };

  const tracksTerminator = lifecycle.own(new Terminator());
  const container: HTMLElement = <div className={className} />;
  plan.tracks.forEach((track, i) => {
    const row = buildRow(track, i, tracksTerminator);
    container.appendChild(row.element);
  });
  return container;
};

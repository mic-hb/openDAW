// No frontend imports

export interface GmProgram {
  /** 0-based GM program number, 0-127. */
  program: number;
  /** "Piano" | "Chromatic Percussion" | ... | "Sound Effects" */
  family: string;
  /** Human-readable name, e.g. "Acoustic Grand Piano". */
  name: string;
}

/**
 * The 128 General MIDI Level 1 programs (0-127).
 * The drum kit is conventionally referenced as program 128 (see
 * `GM_DRUM_PROGRAM`); it is NOT in this array because it has no
 * "program number" in the 0-127 sense.
 *
 * Source of truth: General MIDI Level 1 specification.
 */
export const GM_PROGRAMS: readonly GmProgram[] = [
  // 0-7 Piano
  { program: 0, family: "Piano", name: "Acoustic Grand Piano" },
  { program: 1, family: "Piano", name: "Bright Acoustic Piano" },
  { program: 2, family: "Piano", name: "Electric Grand Piano" },
  { program: 3, family: "Piano", name: "Honky-tonk Piano" },
  { program: 4, family: "Piano", name: "Electric Piano 1" },
  { program: 5, family: "Piano", name: "Electric Piano 2" },
  { program: 6, family: "Piano", name: "Harpsichord" },
  { program: 7, family: "Piano", name: "Clavinet" },
  // 8-15 Chromatic Percussion
  { program: 8, family: "Chromatic Percussion", name: "Celesta" },
  { program: 9, family: "Chromatic Percussion", name: "Glockenspiel" },
  { program: 10, family: "Chromatic Percussion", name: "Music Box" },
  { program: 11, family: "Chromatic Percussion", name: "Vibraphone" },
  { program: 12, family: "Chromatic Percussion", name: "Marimba" },
  { program: 13, family: "Chromatic Percussion", name: "Xylophone" },
  { program: 14, family: "Chromatic Percussion", name: "Tubular Bells" },
  { program: 15, family: "Chromatic Percussion", name: "Dulcimer" },
  // 16-23 Organ
  { program: 16, family: "Organ", name: "Drawbar Organ" },
  { program: 17, family: "Organ", name: "Percussive Organ" },
  { program: 18, family: "Organ", name: "Rock Organ" },
  { program: 19, family: "Organ", name: "Church Organ" },
  { program: 20, family: "Organ", name: "Reed Organ" },
  { program: 21, family: "Organ", name: "Accordion" },
  { program: 22, family: "Organ", name: "Harmonica" },
  { program: 23, family: "Organ", name: "Tango Accordion" },
  // 24-31 Guitar
  { program: 24, family: "Guitar", name: "Acoustic Guitar (nylon)" },
  { program: 25, family: "Guitar", name: "Acoustic Guitar (steel)" },
  { program: 26, family: "Guitar", name: "Electric Guitar (jazz)" },
  { program: 27, family: "Guitar", name: "Electric Guitar (clean)" },
  { program: 28, family: "Guitar", name: "Electric Guitar (muted)" },
  { program: 29, family: "Guitar", name: "Overdriven Guitar" },
  { program: 30, family: "Guitar", name: "Distortion Guitar" },
  { program: 31, family: "Guitar", name: "Guitar Harmonics" },
  // 32-39 Bass
  { program: 32, family: "Bass", name: "Acoustic Bass" },
  { program: 33, family: "Bass", name: "Electric Bass (finger)" },
  { program: 34, family: "Bass", name: "Electric Bass (pick)" },
  { program: 35, family: "Bass", name: "Fretless Bass" },
  { program: 36, family: "Bass", name: "Slap Bass 1" },
  { program: 37, family: "Bass", name: "Slap Bass 2" },
  { program: 38, family: "Bass", name: "Synth Bass 1" },
  { program: 39, family: "Bass", name: "Synth Bass 2" },
  // 40-47 Strings
  { program: 40, family: "Strings", name: "Violin" },
  { program: 41, family: "Strings", name: "Viola" },
  { program: 42, family: "Strings", name: "Cello" },
  { program: 43, family: "Strings", name: "Contrabass" },
  { program: 44, family: "Strings", name: "Tremolo Strings" },
  { program: 45, family: "Strings", name: "Pizzicato Strings" },
  { program: 46, family: "Strings", name: "Orchestral Harp" },
  { program: 47, family: "Strings", name: "Timpani" },
  // 48-55 Ensemble
  { program: 48, family: "Ensemble", name: "String Ensemble 1" },
  { program: 49, family: "Ensemble", name: "String Ensemble 2" },
  { program: 50, family: "Ensemble", name: "Synth Strings 1" },
  { program: 51, family: "Ensemble", name: "Synth Strings 2" },
  { program: 52, family: "Ensemble", name: "Choir Aahs" },
  { program: 53, family: "Ensemble", name: "Voice Oohs" },
  { program: 54, family: "Ensemble", name: "Synth Choir" },
  { program: 55, family: "Ensemble", name: "Orchestra Hit" },
  // 56-63 Brass
  { program: 56, family: "Brass", name: "Trumpet" },
  { program: 57, family: "Brass", name: "Trombone" },
  { program: 58, family: "Brass", name: "Tuba" },
  { program: 59, family: "Brass", name: "Muted Trumpet" },
  { program: 60, family: "Brass", name: "French Horn" },
  { program: 61, family: "Brass", name: "Brass Section" },
  { program: 62, family: "Brass", name: "Synth Brass 1" },
  { program: 63, family: "Brass", name: "Synth Brass 2" },
  // 64-71 Reed
  { program: 64, family: "Reed", name: "Soprano Sax" },
  { program: 65, family: "Reed", name: "Alto Sax" },
  { program: 66, family: "Reed", name: "Tenor Sax" },
  { program: 67, family: "Reed", name: "Baritone Sax" },
  { program: 68, family: "Reed", name: "Oboe" },
  { program: 69, family: "Reed", name: "English Horn" },
  { program: 70, family: "Reed", name: "Bassoon" },
  { program: 71, family: "Reed", name: "Clarinet" },
  // 72-79 Pipe
  { program: 72, family: "Pipe", name: "Piccolo" },
  { program: 73, family: "Pipe", name: "Flute" },
  { program: 74, family: "Pipe", name: "Recorder" },
  { program: 75, family: "Pipe", name: "Pan Flute" },
  { program: 76, family: "Pipe", name: "Blown Bottle" },
  { program: 77, family: "Pipe", name: "Shakuhachi" },
  { program: 78, family: "Pipe", name: "Whistle" },
  { program: 79, family: "Pipe", name: "Ocarina" },
  // 80-87 Lead
  { program: 80, family: "Lead", name: "Lead 1 (square)" },
  { program: 81, family: "Lead", name: "Lead 2 (sawtooth)" },
  { program: 82, family: "Lead", name: "Lead 3 (calliope)" },
  { program: 83, family: "Lead", name: "Lead 4 (chiff)" },
  { program: 84, family: "Lead", name: "Lead 5 (charang)" },
  { program: 85, family: "Lead", name: "Lead 6 (voice)" },
  { program: 86, family: "Lead", name: "Lead 7 (fifths)" },
  { program: 87, family: "Lead", name: "Lead 8 (bass + lead)" },
  // 88-95 Pad
  { program: 88, family: "Pad", name: "Pad 1 (new age)" },
  { program: 89, family: "Pad", name: "Pad 2 (warm)" },
  { program: 90, family: "Pad", name: "Pad 3 (polysynth)" },
  { program: 91, family: "Pad", name: "Pad 4 (choir)" },
  { program: 92, family: "Pad", name: "Pad 5 (bowed)" },
  { program: 93, family: "Pad", name: "Pad 6 (metallic)" },
  { program: 94, family: "Pad", name: "Pad 7 (halo)" },
  { program: 95, family: "Pad", name: "Pad 8 (sweep)" },
  // 96-103 Effects
  { program: 96, family: "Effects", name: "FX 1 (rain)" },
  { program: 97, family: "Effects", name: "FX 2 (soundtrack)" },
  { program: 98, family: "Effects", name: "FX 3 (crystal)" },
  { program: 99, family: "Effects", name: "FX 4 (atmosphere)" },
  { program: 100, family: "Effects", name: "FX 5 (brightness)" },
  { program: 101, family: "Effects", name: "FX 6 (goblins)" },
  { program: 102, family: "Effects", name: "FX 7 (echoes)" },
  { program: 103, family: "Effects", name: "FX 8 (sci-fi)" },
  // 104-111 Ethnic
  { program: 104, family: "Ethnic", name: "Sitar" },
  { program: 105, family: "Ethnic", name: "Banjo" },
  { program: 106, family: "Ethnic", name: "Shamisen" },
  { program: 107, family: "Ethnic", name: "Koto" },
  { program: 108, family: "Ethnic", name: "Kalimba" },
  { program: 109, family: "Ethnic", name: "Bagpipe" },
  { program: 110, family: "Ethnic", name: "Fiddle" },
  { program: 111, family: "Ethnic", name: "Shanai" },
  // 112-119 Percussive
  { program: 112, family: "Percussive", name: "Tinkle Bell" },
  { program: 113, family: "Percussive", name: "Agogo" },
  { program: 114, family: "Percussive", name: "Steel Drums" },
  { program: 115, family: "Percussive", name: "Woodblock" },
  { program: 116, family: "Percussive", name: "Taiko Drum" },
  { program: 117, family: "Percussive", name: "Melodic Tom" },
  { program: 118, family: "Percussive", name: "Synth Drum" },
  { program: 119, family: "Percussive", name: "Reverse Cymbal" },
  // 120-127 Sound Effects
  { program: 120, family: "Sound Effects", name: "Guitar Fret Noise" },
  { program: 121, family: "Sound Effects", name: "Breath Noise" },
  { program: 122, family: "Sound Effects", name: "Seashore" },
  { program: 123, family: "Sound Effects", name: "Bird Tweet" },
  { program: 124, family: "Sound Effects", name: "Telephone Ring" },
  { program: 125, family: "Sound Effects", name: "Helicopter" },
  { program: 126, family: "Sound Effects", name: "Applause" },
  { program: 127, family: "Sound Effects", name: "Gunshot" },
  { program: 128, family: "Drum", name: "Acoustic Drum Kit" },
  { program: 136, family: "Drum", name: "Room Drum Kit" },
  { program: 144, family: "Drum", name: "Power Drum Kit" },
  { program: 152, family: "Drum", name: "Electronic Drum Kit" },
  { program: 153, family: "Drum", name: "TR-808 Drum Kit" },
  { program: 160, family: "Drum", name: "Jazz Drum Kit" },
  { program: 168, family: "Drum", name: "Brush Drum Kit" },
  { program: 176, family: "Drum", name: "Orchestra Drum Kit" },
  { program: 184, family: "Drum", name: "Sound FX Drum Kit" },
];

/** Conventional GM drum-kit program (not 0-based; not in `GM_PROGRAMS`). */
export const GM_DRUM_PROGRAM = 128;

/** Melodic programs (alias for `GM_PROGRAMS`, kept for clarity at call sites). */
export const GM_MELODIC_PROGRAMS: readonly GmProgram[] = GM_PROGRAMS;

/** Look up a GM program by number, or undefined. */
export function getGmProgram(program: number): GmProgram | undefined {
  return GM_PROGRAMS.find((p) => p.program === program);
}



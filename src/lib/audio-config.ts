export type Note = 'C' | 'C#' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
export type PresetName = 'warm' | 'shimmer' | 'air' | 'strings' | 'analog' | 'bright';

export const NOTES_LIST: Note[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const FREQUENCIES: Record<Note, number> = {
    'C': 130.81, 'C#': 138.59, 'D': 146.83, 'Eb': 155.56, 'E': 164.81, 'F': 174.61,
    'F#': 185.00, 'G': 196.00, 'Ab': 207.65, 'A': 220.00, 'Bb': 233.08, 'B': 246.94
};

export const PRESETS = {
    warm: { options: { attack: 1.5, release: 3.5 }, voices: [{ type: 'sawtooth', detune: 0, volume: -18, filter: { Q: 1, type: "lowpass", rolloff: -24, frequency: 400 } }, { type: 'sawtooth', detune: 10, volume: -18, filter: { Q: 1, type: "lowpass", rolloff: -24, frequency: 400 } }, { type: 'sawtooth', detune: -10, volume: -18, filter: { Q: 1, type: "lowpass", rolloff: -24, frequency: 400 } }, { type: 'triangle', volume: -9, filter: { Q: 1, type: "lowpass", rolloff: -24, frequency: 300 } }] },
    shimmer: { options: { attack: 2, release: 5 }, voices: [{ type: 'sawtooth', volume: -24, filter: { Q: 0.5, type: "lowpass", rolloff: -24, frequency: 2000 } }, { type: 'square', volume: -30, filter: { Q: 0.5, type: "lowpass", rolloff: -24, frequency: 3000 } }, { type: 'triangle', volume: -33, filter: { Q: 0.5, type: "lowpass", rolloff: -24, frequency: 4000 } }] },
    air: { options: { attack: 3, release: 4 }, voices: [{ type: 'sine', volume: -6, filter: { Q: 0, type: "lowpass", rolloff: -24, frequency: 3000 } }, { type: 'triangle', volume: -24, filter: { Q: 0, type: "lowpass", rolloff: -24, frequency: 1500 } }] },
    strings: { options: { attack: 0.8, release: 2.5 }, voices: [{ type: 'sawtooth', detune: 0, volume: -20, filter: { Q: 0.8, type: "lowpass", rolloff: -24, frequency: 1200 } }, { type: 'sawtooth', detune: 5, volume: -20, filter: { Q: 0.8, type: "lowpass", rolloff: -24, frequency: 1200 } }, { type: 'sawtooth', detune: -5, volume: -20, filter: { Q: 0.8, type: "lowpass", rolloff: -24, frequency: 1200 } }, { type: 'sawtooth', volume: -15, filter: { Q: 0.8, type: "lowpass", rolloff: -24, frequency: 600 } }] },
    analog: { options: { attack: 0.1, release: 3 }, voices: [{ type: 'square', volume: -21, filter: { Q: 2, type: "lowpass", rolloff: -24, frequency: 800 } }, { type: 'sawtooth', detune: 15, volume: -21, filter: { Q: 2, type: "lowpass", rolloff: -24, frequency: 800 } }, { type: 'sawtooth', detune: -15, volume: -21, filter: { Q: 2, type: "lowpass", rolloff: -24, frequency: 800 } }] },
    bright: { options: { attack: 0.5, release: 4 }, voices: [{ type: 'triangle', volume: -15, filter: { Q: 0.5, type: "lowpass", rolloff: -24, frequency: 2500 } }, { type: 'square', volume: -27, filter: { Q: 0.5, type: "lowpass", rolloff: -24, frequency: 2000 } }] }
};

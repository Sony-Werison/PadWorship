export type SliderValues = {
    volume: number;
    cutoff: number;
    mix: number;
    motion: number;
    ambience: number;
    fadeTime: number;
    baseLayer: number;
};

export type Preset = {
    name: string;
    values: SliderValues;
};

export const DEFAULT_PRESETS: Preset[] = [
    {
        name: 'Padrão',
        values: { volume: 70, cutoff: 80, mix: 50, motion: 20, ambience: 30, fadeTime: 5, baseLayer: 1 }
    },
    {
        name: 'Dark & Moody',
        values: { volume: 65, cutoff: 40, mix: 25, motion: 40, ambience: 50, fadeTime: 7, baseLayer: 2 }
    },
    {
        name: 'Bright Shimmer',
        values: { volume: 75, cutoff: 95, mix: 50, motion: 10, ambience: 20, fadeTime: 3, baseLayer: 3 }
    },
    {
        name: 'Ambient Swell',
        values: { volume: 70, cutoff: 60, mix: 70, motion: 60, ambience: 80, fadeTime: 8, baseLayer: 1 }
    }
];

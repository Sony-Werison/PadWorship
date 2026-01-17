export type SliderValues = {
    volume: number;
    cutoff: number;
    mix: number;
    motion: number;
    ambience: number;
};

export type Preset = {
    name: string;
    values: SliderValues;
};

export const DEFAULT_PRESETS: Preset[] = [
    {
        name: 'Padrão',
        values: { volume: 70, cutoff: 80, mix: 0, motion: 20, ambience: 30 }
    },
    {
        name: 'Dark & Moody',
        values: { volume: 65, cutoff: 40, mix: 25, motion: 40, ambience: 50 }
    },
    {
        name: 'Bright Shimmer',
        values: { volume: 75, cutoff: 95, mix: 50, motion: 10, ambience: 20 }
    },
    {
        name: 'Ambient Swell',
        values: { volume: 70, cutoff: 60, mix: 70, motion: 60, ambience: 80 }
    }
];

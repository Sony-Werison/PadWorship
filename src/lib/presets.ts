export type SliderValues = {
    volume: number;
    cutoff: number;
    mix: number;
    motion: number;
    ambience: number;
    layers: {
        base: number;
        tex1: number;
        tex2: number;
    };
};

export type Preset = {
    name: string;
    values: SliderValues;
};

export const DEFAULT_PRESETS: Preset[] = [
    {
        name: 'Padrão',
        values: { volume: 70, cutoff: 80, mix: 50, motion: 20, ambience: 30, layers: { base: 1, tex1: 0.7, tex2: 0.7 } }
    },
    {
        name: 'Dark & Moody',
        values: { volume: 65, cutoff: 40, mix: 25, motion: 40, ambience: 50, layers: { base: 1, tex1: 0.5, tex2: 0.5 } }
    },
    {
        name: 'Bright Shimmer',
        values: { volume: 75, cutoff: 95, mix: 50, motion: 10, ambience: 20, layers: { base: 0.8, tex1: 1, tex2: 1 } }
    },
    {
        name: 'Ambient Swell',
        values: { volume: 70, cutoff: 60, mix: 70, motion: 60, ambience: 80, layers: { base: 0.6, tex1: 0.9, tex2: 0.9 } }
    }
];

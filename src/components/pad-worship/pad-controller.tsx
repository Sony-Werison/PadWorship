'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, HelpCircle, Download, Upload, Save, Trash2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTES_LIST, type Note } from '@/lib/audio-config';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_PRESETS, type Preset } from '@/lib/presets';
import { useRouter } from 'next/navigation';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";


type ActivePad = {
    note: Note;
    padGain: GainNode;
    layerGains: {
        base: GainNode;
        tex1: GainNode;
        tex2: GainNode;
    };
    stopScheduler: () => void;
};

const noteToFileNameMap: Partial<Record<Note, string>> = {
    'Ab': 'G#', 'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#',
};
const semitonesFromC: Record<Note, number> = { 'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11 };

const FADE_TIME = 5.0; // seconds for crossfade and stop

export default function PadController({ mode }: { mode: 'full' | 'modulation' }) {
    const [isMounted, setIsMounted] = useState(false);
    const [activeKey, setActiveKey] = useState<Note | null>(null);
    const [volume, setVolume] = useState(70);
    const [cutoff, setCutoff] = useState(80);
    const [mix, setMix] = useState(50);
    const [motion, setMotion] = useState(20);
    const [ambience, setAmbience] = useState(30);
    const [isReady, setIsReady] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);

    // Preset State
    const [presets, setPresets] = useState<Preset[]>([]);
    const [activePresetName, setActivePresetName] = useState<string>('Padrão');
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const importFileRef = useRef<HTMLInputElement | null>(null);

    // New State
    const router = useRouter();
    const [isBackDialogOpen, setIsBackDialogOpen] = useState(false);
    const [layerVolumes, setLayerVolumes] = useState({ base: 1, tex1: 0.7, tex2: 0.7 });

    const { toast } = useToast();
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const cutoffFilterRef = useRef<BiquadFilterNode | null>(null);
    const mixGainRef = useRef<GainNode | null>(null);
    const pannerRef = useRef<StereoPannerNode | null>(null);
    const lfoRef = useRef<OscillatorNode | null>(null);
    const lfoGainRef = useRef<GainNode | null>(null);
    const pannerLfoRef = useRef<OscillatorNode | null>(null);
    const pannerLfoGainRef = useRef<GainNode | null>(null);
    const activePadRef = useRef<ActivePad | null>(null);
    const audioCache = useRef<Record<string, AudioBuffer>>({});
    const isAudioInitialized = useRef(false);

    // --- PRESET LOGIC ---
    useEffect(() => {
        try {
            const savedPresets = localStorage.getItem('padWorshipPresets');
            const loadedPresets = savedPresets ? JSON.parse(savedPresets) : DEFAULT_PRESETS;
            setPresets(loadedPresets);
            const initialPreset = loadedPresets[0] || DEFAULT_PRESETS[0];
            if (initialPreset) {
                handlePresetSelect(initialPreset.name, loadedPresets);
            }
        } catch (error) {
            console.error("Failed to load presets from localStorage", error);
            setPresets(DEFAULT_PRESETS);
        }
    }, []);

    useEffect(() => {
        if (presets.length > 0) {
            try {
                localStorage.setItem('padWorshipPresets', JSON.stringify(presets));
            } catch (error) {
                console.error("Failed to save presets to localStorage", error);
            }
        }
    }, [presets]);

    const handlePresetSelect = (name: string, currentPresets = presets) => {
        const selectedPreset = currentPresets.find(p => p.name === name);
        if (selectedPreset) {
            const { volume, cutoff, mix, motion, ambience } = selectedPreset.values;
            setVolume(volume);
            setCutoff(cutoff);
            setMix(mix);
            setMotion(motion);
            setAmbience(ambience);
            setActivePresetName(name);
        }
    };

    const handleSavePreset = () => {
        const nameToSave = newPresetName.trim();
        if (!nameToSave) {
            toast({ variant: 'destructive', title: 'Nome inválido', description: 'Por favor, insira um nome para o preset.' });
            return;
        }

        const newPreset: Preset = {
            name: nameToSave,
            values: { volume, cutoff, mix, motion, ambience }
        };
        
        setPresets(currentPresets => {
            const existingIndex = currentPresets.findIndex(p => p.name === nameToSave);
            if (existingIndex > -1) {
                const updatedPresets = [...currentPresets];
                updatedPresets[existingIndex] = newPreset;
                return updatedPresets;
            } else {
                return [...currentPresets, newPreset];
            }
        });

        setActivePresetName(newPreset.name);
        setIsSaveDialogOpen(false);
        toast({ title: `Preset "${newPreset.name}" salvo!` });
    };

    const handleDeletePreset = () => {
        if (activePresetName === 'Padrão' && presets.find(p => p.name === 'Padrão')) {
            toast({
                variant: 'destructive',
                title: 'Ação não permitida',
                description: 'Não é possível excluir o preset padrão original.',
            });
            return;
        }
        const newPresets = presets.filter(p => p.name !== activePresetName);
        setPresets(newPresets);
        handlePresetSelect(newPresets[0]?.name || 'Padrão', newPresets);
        toast({ title: `Preset "${activePresetName}" excluído.` });
    };
    
    const handleExportPresets = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `pad_worship_presets_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            toast({ title: "Presets exportados com sucesso!" });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro ao Exportar', description: 'Não foi possível gerar o arquivo de presets.' });
        }
    };

    const handleImportPresets = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("File is not valid text");
                const importedPresets = JSON.parse(text);
                
                if (Array.isArray(importedPresets) && importedPresets.every(p => p.name && p.values)) {
                    setPresets(importedPresets);
                    handlePresetSelect(importedPresets[0]?.name || 'Padrão', importedPresets);
                    toast({ title: "Presets importados com sucesso!" });
                } else {
                    throw new Error("Invalid preset file format.");
                }
            } catch (error) {
                console.error("Failed to import presets:", error);
                toast({ variant: 'destructive', title: 'Erro na Importação', description: 'O arquivo de preset é inválido ou está corrompido.'});
            } finally {
                if (event.target) event.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // --- AUDIO LOGIC ---
    useEffect(() => {
        setIsMounted(true);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if(isIOS) {
             toast({
                title: 'Aviso para iOS',
                description: 'No iPhone/iPad, verifique se o botão "Silêncio" (lateral) está desligado.',
                duration: 6000,
            });
        }
    }, [toast]);
    
    const initAudio = useCallback(async () => {
        if (isAudioInitialized.current || !window.AudioContext) return;
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (context.state === 'suspended') await context.resume();

            const masterGain = context.createGain();
            const cutoffFilter = context.createBiquadFilter();
            const mixGain = context.createGain();
            const lfo = context.createOscillator();
            const lfoGain = context.createGain();
            const panner = context.createStereoPanner();
            const pannerLfo = context.createOscillator();
            const pannerLfoGain = context.createGain();

            lfo.type = 'sine';
            lfo.frequency.value = 0.5;
            lfo.connect(lfoGain).connect(cutoffFilter.frequency);
            lfo.start();

            pannerLfo.type = 'sine';
            pannerLfo.frequency.value = 0.2;
            pannerLfo.connect(pannerLfoGain).connect(panner.pan);
            pannerLfo.start();

            cutoffFilter.type = 'lowpass';
            
            masterGain.connect(cutoffFilter);
            cutoffFilter.connect(panner);
            panner.connect(context.destination);
            
            audioContextRef.current = context;
            masterGainRef.current = masterGain;
            cutoffFilterRef.current = cutoffFilter;
            mixGainRef.current = mixGain;
            lfoRef.current = lfo;
            lfoGainRef.current = lfoGain;
            pannerRef.current = panner;
            pannerLfoRef.current = pannerLfo;
            pannerLfoGainRef.current = pannerLfoGain;

            isAudioInitialized.current = true;
        } catch (e) {
            console.error('Could not start audio context', e);
            toast({ variant: 'destructive', title: 'Erro de Áudio', description: 'Não foi possível iniciar o áudio.' });
        }
    }, [toast]);

    const preloadSamples = useCallback(async () => {
        await initAudio();
        if (!audioContextRef.current || !isMounted) return;

        const notesToLoad = mode === 'full' ? NOTES_LIST : ['C'];
        const totalSamples = notesToLoad.length * 3;
        let loadedCount = 0;

        for (const note of notesToLoad) {
            const fileNameNote = noteToFileNameMap[note] || note;
            const noteForPath = encodeURIComponent(fileNameNote);
            const paths = [`/audio/${noteForPath} Pad.wav`, `/audio/${noteForPath} Pad2.wav`, `/audio/${noteForPath} Pad3.wav`];

            for (const path of paths) {
                try {
                    if (!audioCache.current[path]) {
                        const response = await fetch(path);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            audioCache.current[path] = await audioContextRef.current.decodeAudioData(arrayBuffer);
                        } else {
                             throw new Error(`Failed to fetch: ${response.statusText}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error preloading sample at ${path}:`, error);
                } finally {
                    loadedCount++;
                    setLoadingProgress((loadedCount / totalSamples) * 100);
                }
            }
        }
        setIsReady(true);
    }, [isMounted, initAudio, mode]);

    useEffect(() => {
        if(isMounted) preloadSamples();
    }, [isMounted, preloadSamples]);

    // Audio Controls Effects
    useEffect(() => { if (masterGainRef.current && audioContextRef.current) masterGainRef.current.gain.setTargetAtTime(volume / 100, audioContextRef.current.currentTime, 0.05); }, [volume]);
    useEffect(() => { if (mixGainRef.current && audioContextRef.current) mixGainRef.current.gain.setTargetAtTime(mix / 100, audioContextRef.current.currentTime, 0.05); }, [mix]);
    useEffect(() => { if (lfoGainRef.current && audioContextRef.current) lfoGainRef.current.gain.setTargetAtTime((motion / 100) * 2000, audioContextRef.current.currentTime, 0.05); }, [motion]);
    useEffect(() => { if (pannerLfoGainRef.current && audioContextRef.current) pannerLfoGainRef.current.gain.setTargetAtTime(ambience / 100, audioContextRef.current.currentTime, 0.05);}, [ambience]);
    useEffect(() => {
        if (!cutoffFilterRef.current || !audioContextRef.current) return;
        const minValue = 40;
        const maxValue = audioContextRef.current.sampleRate / 2;
        const C = 2;
        const normalizedValue = cutoff / 100;
        const frequency = minValue * Math.pow(maxValue / minValue, Math.pow(normalizedValue, C));
        cutoffFilterRef.current.frequency.setTargetAtTime(frequency, audioContextRef.current.currentTime, 0.05);
    }, [cutoff]);
     useEffect(() => {
        if (activePadRef.current && audioContextRef.current) {
            const { layerGains } = activePadRef.current;
            const now = audioContextRef.current.currentTime;
            layerGains.base.gain.setTargetAtTime(layerVolumes.base, now, 0.05);
            layerGains.tex1.gain.setTargetAtTime(layerVolumes.tex1, now, 0.05);
            layerGains.tex2.gain.setTargetAtTime(layerVolumes.tex2, now, 0.05);
        }
    }, [layerVolumes]);


    const stopPad = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !activePadRef.current) return;

        const { padGain, stopScheduler } = activePadRef.current;
        const stopTime = context.currentTime + FADE_TIME;
        
        stopScheduler();
        padGain.gain.cancelScheduledValues(context.currentTime);
        padGain.gain.linearRampToValueAtTime(0.0001, stopTime);

        setTimeout(() => { try { padGain.disconnect(); } catch (e) {} }, FADE_TIME * 1000 + 200);
        
        activePadRef.current = null;
        setActiveKey(null);
    }, []);

    const playPad = (note: Note) => {
        const context = audioContextRef.current;
        if (!context || !masterGainRef.current || !mixGainRef.current) return;
        
        const noteForSamples = mode === 'modulation' ? 'C' : note;
        const fileNameNote = noteToFileNameMap[noteForSamples] || noteForSamples;
        const noteForPath = encodeURIComponent(fileNameNote);

        const baseBuffer = audioCache.current[`/audio/${noteForPath} Pad.wav`];
        const tex1Buffer = audioCache.current[`/audio/${noteForPath} Pad2.wav`];
        const tex2Buffer = audioCache.current[`/audio/${noteForPath} Pad3.wav`];

        if (!baseBuffer || !tex1Buffer || !tex2Buffer) {
            toast({ variant: 'destructive', title: 'Erro de Sample', description: `Não foi possível carregar os áudios para a nota ${note}.` });
            return;
        }
            
        if (activePadRef.current) {
            const oldPad = activePadRef.current;
            oldPad.stopScheduler();
            oldPad.padGain.gain.cancelScheduledValues(context.currentTime);
            oldPad.padGain.gain.linearRampToValueAtTime(0.0001, context.currentTime + FADE_TIME);

            setTimeout(() => { 
                try {
                    oldPad.padGain.disconnect();
                } catch (e) {} 
            }, FADE_TIME * 1000 + 200);
        }
        
        const padGain = context.createGain();
        padGain.gain.value = 0.0001;
        padGain.connect(masterGainRef.current);
        padGain.gain.linearRampToValueAtTime(1, context.currentTime + FADE_TIME);
        
        // This is a shared node, must be cleaned up properly.
        // Let's create a new mixGain for each pad to avoid conflicts.
        const newMixGain = context.createGain();
        newMixGain.gain.value = mix / 100;
        newMixGain.connect(padGain);


        const baseLayerGain = context.createGain();
        baseLayerGain.gain.value = layerVolumes.base;
        baseLayerGain.connect(padGain);

        const tex1LayerGain = context.createGain();
        tex1LayerGain.gain.value = layerVolumes.tex1;
        tex1LayerGain.connect(newMixGain);

        const tex2LayerGain = context.createGain();
        tex2LayerGain.gain.value = layerVolumes.tex2;
        tex2LayerGain.connect(newMixGain);

        const layerGains = { base: baseLayerGain, tex1: tex1LayerGain, tex2: tex2LayerGain };

        const playbackRate = mode === 'modulation' ? Math.pow(2, semitonesFromC[note] / 12) : 1;

        let isLooping = true;
        const timeouts: number[] = [];

        const scheduler = (startTime: number) => {
            if (!isLooping) return;
            
            const duration = baseBuffer.duration;
            const effectiveDuration = duration / playbackRate;
            const crossfade = FADE_TIME;

            playIteration(startTime, effectiveDuration, crossfade);

            const nextStartTime = startTime + effectiveDuration - crossfade;
            const delay = (nextStartTime - context.currentTime) * 1000;

            const timeoutId = window.setTimeout(() => scheduler(nextStartTime), delay > 0 ? delay : 0);
            timeouts.push(timeoutId);
        }
        
        const playIteration = (startTime: number, duration: number, crossfade: number) => {
            [baseBuffer, tex1Buffer, tex2Buffer].forEach((buffer, index) => {
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = playbackRate;

                const iterGain = context.createGain();
                source.connect(iterGain);

                if (index === 0) {
                    iterGain.connect(layerGains.base);
                } else if (index === 1) {
                    iterGain.connect(layerGains.tex1);
                } else {
                    iterGain.connect(layerGains.tex2);
                }

                iterGain.gain.setValueAtTime(0.0001, startTime);
                iterGain.gain.linearRampToValueAtTime(1, startTime + crossfade);
                iterGain.gain.setValueAtTime(1, startTime + duration - crossfade);
                iterGain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

                source.start(startTime);
                source.onended = () => { try { iterGain.disconnect(); source.disconnect(); } catch(e) {} };
            });
        }

        const stopScheduler = () => { isLooping = false; timeouts.forEach(clearTimeout); };
        
        scheduler(context.currentTime);

        activePadRef.current = { note, padGain, layerGains, stopScheduler };
        setActiveKey(note);
    };

    const handleNoteClick = (note: Note) => {
        if (!isAudioInitialized.current && !isReady) return;
        if (!isAudioInitialized.current) initAudio();
        if (!isAudioInitialized.current) return;
        
        if (activeKey === note) stopPad();
        else playPad(note);
    };
    
    if (!isReady) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary"/>
            <div className="w-full max-w-sm text-center">
                <p className="text-lg font-semibold text-foreground">
                    Carregando samples... ({mode === 'modulation' ? 'Modo Rápido' : 'Modo Qualidade'})
                </p>
                <p className="text-sm text-muted-foreground">Isso pode levar um momento.</p>
                <Progress value={loadingProgress} className="mt-4" />
            </div>
        </div>
      );
    }
    
    return (
        <>
        <input type="file" ref={importFileRef} onChange={handleImportPresets} accept=".json" className="hidden" />
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
             <DialogContent>
                <DialogHeader>
                    <DialogTitle>Salvar Preset</DialogTitle>
                    <DialogDescription>
                        Digite um nome para o seu novo preset. Se o nome já existir, ele será atualizado.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Ex: Bright Pad"
                    autoFocus
                />
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
                    <Button type="submit" onClick={handleSavePreset}>Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={isBackDialogOpen} onOpenChange={setIsBackDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sair da página?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Você tem certeza que quer voltar para a tela de seleção? O áudio será interrompido.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        stopPad();
                        router.push('/');
                    }}>Sair</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col items-center min-h-screen overflow-x-hidden">
            <header className="container mx-auto max-w-4xl p-5 flex items-center justify-center relative">
                 <Button variant="outline" size="icon" className="absolute left-5 top-1/2 -translate-y-1/2" onClick={() => setIsBackDialogOpen(true)}>
                    <ArrowLeft className="h-4 w-4"/>
                </Button>
                <h1 className="text-3xl font-extrabold tracking-tighter bg-gradient-to-r from-purple-300 to-indigo-400 text-transparent bg-clip-text">
                    Pad Worship Pro
                </h1>
            </header>

            <main className="container mx-auto max-w-4xl flex-1 px-5 flex flex-col gap-4">
                {/* Sliders Section */}
                <div className="glass-pane rounded-2xl p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
                         <div className="flex flex-col gap-2">
                           <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Volume</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Controla o volume geral do pad.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Volume" value={[volume]} onValueChange={([v]) => setVolume(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Cutoff</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Controla o filtro de frequências (Low-Pass). Abaixe para um som mais abafado.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Cutoff" value={[cutoff]} onValueChange={([v]) => setCutoff(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Mix</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Controla o volume das camadas de textura/atmosfera.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Mix" value={[mix]} onValueChange={([v]) => setMix(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Motion</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Adiciona uma leve flutuação ao som (LFO no filtro).</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Motion" value={[motion]} onValueChange={([v]) => setMotion(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Ambience L/R</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Cria um efeito de panorâmica automática (AutoPanner).</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Ambience L/R" value={[ambience]} onValueChange={([v]) => setAmbience(v)} max={100} step={1} />
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2.5">
                    {NOTES_LIST.map(note => (
                        <button
                            key={note}
                            data-note={note}
                            onClick={() => handleNoteClick(note)}
                            className={cn(
                                "glass-pane relative overflow-hidden rounded-xl py-5 text-xl font-bold transition-all duration-200 hover:bg-white/10 active:scale-95 active:duration-100",
                                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                activeKey === note && "bg-primary/80 border-primary shadow-[0_0_20px_theme(colors.primary.DEFAULT)] z-10"
                            )}
                        >
                            {note}
                        </button>
                    ))}
                </div>
                
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1" className="border-none">
                        <AccordionTrigger className="glass-pane rounded-2xl px-4 py-3 hover:no-underline">
                            Controles de Camada Individuais
                        </AccordionTrigger>
                        <AccordionContent className="glass-pane rounded-2xl p-4 mt-2">
                             <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 pt-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-center text-muted-foreground uppercase tracking-widest">Base</label>
                                    <Slider
                                        aria-label="Volume Base"
                                        value={[layerVolumes.base * 100]}
                                        onValueChange={([v]) => setLayerVolumes(prev => ({...prev, base: v / 100}))}
                                        max={100}
                                        step={1}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-center text-muted-foreground uppercase tracking-widest">Textura 1</label>
                                    <Slider
                                        aria-label="Volume Textura 1"
                                        value={[layerVolumes.tex1 * 100]}
                                        onValueChange={([v]) => setLayerVolumes(prev => ({...prev, tex1: v / 100}))}
                                        max={100}
                                        step={1}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-center text-muted-foreground uppercase tracking-widest">Textura 2</label>
                                    <Slider
                                        aria-label="Volume Textura 2"
                                        value={[layerVolumes.tex2 * 100]}
                                        onValueChange={([v]) => setLayerVolumes(prev => ({...prev, tex2: v / 100}))}
                                        max={100}
                                        step={1}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Presets Section */}
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="presets" className="border-none">
                        <AccordionTrigger className="glass-pane rounded-2xl px-4 py-3 hover:no-underline">
                           Gerenciamento de Presets
                        </AccordionTrigger>
                        <AccordionContent className="glass-pane rounded-2xl p-4 mt-2">
                            <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                                <div className="w-full sm:w-auto sm:flex-1">
                                    <Select value={activePresetName} onValueChange={handlePresetSelect}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Selecione um preset" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {presets.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="icon"><Save className="h-4 w-4" /></Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="end" className="w-auto p-0">
                                            <div className="p-4">
                                                <p className="text-sm font-medium">Salvar Preset</p>
                                                <p className="text-sm text-muted-foreground">Salvar as configurações atuais como um novo preset ou sobrescrever um existente.</p>
                                                 <Button size="sm" className="w-full mt-4" onClick={() => { setNewPresetName(activePresetName); setIsSaveDialogOpen(true); }}>
                                                    Abrir Caixa de Salvar
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                     <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="icon" disabled={presets.find(p => p.name === activePresetName) === DEFAULT_PRESETS.find(d => d.name === activePresetName) && activePresetName === 'Padrão'}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Esta ação não pode ser desfeita. O preset "{activePresetName}" será excluído permanentemente.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeletePreset}>Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    <Button variant="outline" size="icon" onClick={handleExportPresets}><Download className="h-4 w-4" /></Button>
                                    <Button variant="outline" size="icon" onClick={() => importFileRef.current?.click()}><Upload className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </main>

            <footer className="mt-auto p-5 text-center text-xs text-muted-foreground">
                <p>Use fones ou conecte ao som para ouvir os graves.</p>
            </footer>
        </div>
        </>
    );
}

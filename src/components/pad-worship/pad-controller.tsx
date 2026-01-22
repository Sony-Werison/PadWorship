'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, HelpCircle, Download, Upload, Save, Trash2, ArrowLeft, PictureInPicture } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


type ActivePad = {
    note: Note;
    padGain: GainNode;
    mixGain: GainNode;
    stopScheduler: () => void;
};

const noteToFileNameMap: Partial<Record<Note, string>> = {
    'Ab': 'G#', 'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#',
};
const semitonesFromC: Record<Note, number> = { 'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11 };

const AVG_SAMPLE_SIZE_MB = 0.8; // Tamanho médio estimado de um arquivo de sample
const FULL_MODE_SAMPLES = 36;   // 12 notas * 3 camadas
const MODULATION_MODE_SAMPLES = 3; // 1 nota * 3 camadas

// Helper for older Safari versions that don't support the promise-based decodeAudioData
function decodeAudioDataAsync(context: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
        // The callback-based version is supported in all browsers.
        context.decodeAudioData(arrayBuffer, 
            (buffer) => resolve(buffer),
            (error) => reject(error)
        );
    });
}


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
    const [loadedMb, setLoadedMb] = useState(0);
    const [fadeTime, setFadeTime] = useState(5);

    // Preset State
    const [presets, setPresets] = useState<Preset[]>([]);
    const [activePresetName, setActivePresetName] = useState<string>('Padrão');
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const importFileRef = useRef<HTMLInputElement | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


    // New State
    const router = useRouter();
    const [isBackDialogOpen, setIsBackDialogOpen] = useState(false);
    const [baseLayer, setBaseLayer] = useState(1);
    const [isAmbienceSupported, setIsAmbienceSupported] = useState(true);

    const [isPiPSupported, setIsPiPSupported] = useState(false);
    const [isPiPActive, setIsPiPActive] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const { toast } = useToast();
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const cutoffFilterRef = useRef<BiquadFilterNode | null>(null);
    const pannerRef = useRef<StereoPannerNode | null>(null);
    const lfoRef = useRef<OscillatorNode | null>(null);
    const lfoGainRef = useRef<GainNode | null>(null);
    const pannerLfoRef = useRef<OscillatorNode | null>(null);
    const pannerLfoGainRef = useRef<GainNode | null>(null);
    const activePadRef = useRef<ActivePad | null>(null);
    const audioCache = useRef<Record<string, AudioBuffer>>({});
    const isAudioInitialized = useRef(false);

    const totalSizeMb = useMemo(() => {
        const sampleCount = mode === 'full' ? FULL_MODE_SAMPLES : MODULATION_MODE_SAMPLES;
        return sampleCount * AVG_SAMPLE_SIZE_MB;
    }, [mode]);

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
            const { volume, cutoff, mix, motion, ambience, fadeTime, baseLayer } = selectedPreset.values;
            setVolume(volume);
            setCutoff(cutoff);
            setMix(mix);
            setMotion(motion);
            setAmbience(ambience);
            setActivePresetName(name);

            if (typeof fadeTime !== 'undefined') {
                setFadeTime(fadeTime);
            } else {
                setFadeTime(5); // Fallback for old presets
            }

            if (typeof baseLayer !== 'undefined') {
                setBaseLayer(baseLayer);
            } else {
                setBaseLayer(1); // Fallback for old presets
            }
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
            values: { volume, cutoff, mix, motion, ambience, fadeTime, baseLayer }
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
            setIsDeleteDialogOpen(false);
            return;
        }
        const newPresets = presets.filter(p => p.name !== activePresetName);
        setPresets(newPresets);
        const nextPreset = newPresets[0] || DEFAULT_PRESETS[0];
        if (nextPreset) {
             handlePresetSelect(nextPreset.name, newPresets);
        }
        toast({ title: `Preset "${activePresetName}" excluído.` });
        setIsDeleteDialogOpen(false);
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

    const togglePiP = async () => {
        if (!videoRef.current) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiPActive(false);
            } else {
                await videoRef.current.requestPictureInPicture();
                setIsPiPActive(true);
            }
        } catch (error) {
            console.error("PiP Error:", error);
            toast({
                variant: 'destructive',
                title: 'Erro de Picture-in-Picture',
                description: 'Não foi possível ativar o modo. Seu navegador pode não ser compatível.'
            });
        }
    };

    // --- AUDIO LOGIC ---
    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined' && !window.StereoPannerNode) {
            setIsAmbienceSupported(false);
        }

        if (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
            setIsPiPSupported(true);

            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            // @ts-ignore - captureStream is experimental but works in modern browsers
            if (video && typeof canvas.captureStream === 'function') {
                canvas.width = canvas.height = 1; // 1x1 canvas
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, 1, 1);
                }
                
                // @ts-ignore
                video.srcObject = canvas.captureStream();
                video.play().catch(() => { /* Autoplay might be blocked, that's fine */ });

                const onEnterPiP = () => setIsPiPActive(true);
                const onLeavePiP = () => {
                    setIsPiPActive(false);
                    // Try to resume playback if PiP is closed, as some browsers pause it.
                    video.play().catch(() => {});
                };

                video.addEventListener('enterpictureinpicture', onEnterPiP);
                video.addEventListener('leavepictureinpicture', onLeavePiP);

                // Check if already in PiP when component mounts
                if (document.pictureInPictureElement === video) {
                    setIsPiPActive(true);
                }

                return () => {
                    video.removeEventListener('enterpictureinpicture', onEnterPiP);
                    video.removeEventListener('leavepictureinpicture', onLeavePiP);
                };
            }
        }
    }, []);
    
    const initAudio = useCallback(async () => {
        if (isAudioInitialized.current || !window.AudioContext) return;
        try {
            // Suspend context on creation for better cross-browser compatibility, especially on iOS.
            const context = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
             if (context.state === 'suspended') {
                 // The context must be resumed by a user gesture.
                 // We will do this on the first note click.
            }

            const masterGain = context.createGain();
            const cutoffFilter = context.createBiquadFilter();
            const lfo = context.createOscillator();
            const lfoGain = context.createGain();
            
            lfo.type = 'sine';
            lfo.frequency.value = 0.5;
            lfo.connect(lfoGain).connect(cutoffFilter.frequency);
            lfo.start();
            
            cutoffFilter.type = 'lowpass';
            masterGain.connect(cutoffFilter);

            if (isAmbienceSupported) {
                const panner = context.createStereoPanner();
                const pannerLfo = context.createOscillator();
                const pannerLfoGain = context.createGain();

                pannerLfo.type = 'sine';
                pannerLfo.frequency.value = 0.2;
                pannerLfo.connect(pannerLfoGain).connect(panner.pan);
                pannerLfo.start();
                
                cutoffFilter.connect(panner);
                panner.connect(context.destination);

                pannerRef.current = panner;
                pannerLfoRef.current = pannerLfo;
                pannerLfoGainRef.current = pannerLfoGain;
            } else {
                cutoffFilter.connect(context.destination);
            }
            
            audioContextRef.current = context;
            masterGainRef.current = masterGain;
            cutoffFilterRef.current = cutoffFilter;
            lfoRef.current = lfo;
            lfoGainRef.current = lfoGain;

            isAudioInitialized.current = true;
        } catch (e) {
            console.error('Could not start audio context', e);
            toast({ variant: 'destructive', title: 'Erro de Áudio', description: 'Não foi possível iniciar o áudio.' });
        }
    }, [toast, isAmbienceSupported]);

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
                            audioCache.current[path] = await decodeAudioDataAsync(audioContextRef.current, arrayBuffer);
                        } else {
                             throw new Error(`Failed to fetch: ${response.statusText}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error preloading sample at ${path}:`, error);
                } finally {
                    loadedCount++;
                    const progressPercent = (loadedCount / totalSamples) * 100;
                    setLoadingProgress(progressPercent);
                    setLoadedMb((progressPercent / 100) * totalSizeMb);
                }
            }
        }
        setIsReady(true);
    }, [isMounted, initAudio, mode, totalSizeMb]);

    useEffect(() => {
        if(isMounted) preloadSamples();
    }, [isMounted, preloadSamples]);

    // Audio Controls Effects
    useEffect(() => { if (masterGainRef.current && audioContextRef.current) masterGainRef.current.gain.setTargetAtTime(volume / 100, audioContextRef.current.currentTime, 0.05); }, [volume]);
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
        if (activePadRef.current?.mixGain && audioContextRef.current) {
            activePadRef.current.mixGain.gain.setTargetAtTime(mix / 100, audioContextRef.current.currentTime, 0.05);
        }
    }, [mix]);

    const stopPad = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !activePadRef.current) return;

        const { padGain, stopScheduler } = activePadRef.current;
        const stopTime = context.currentTime + fadeTime;
        
        stopScheduler();
        padGain.gain.cancelScheduledValues(context.currentTime);
        padGain.gain.linearRampToValueAtTime(0.0001, stopTime);

        setTimeout(() => { try { padGain.disconnect(); } catch (e) {} }, fadeTime * 1000 + 200);
        
        activePadRef.current = null;
        setActiveKey(null);
    }, [fadeTime]);

    const playPad = (note: Note) => {
        const context = audioContextRef.current;
        if (!context || !masterGainRef.current) return;
        
        const noteForSamples = mode === 'modulation' ? 'C' : note;
        const fileNameNote = noteToFileNameMap[noteForSamples] || noteForSamples;
        const noteForPath = encodeURIComponent(fileNameNote);

        const buffers = [
            audioCache.current[`/audio/${noteForPath} Pad.wav`],
            audioCache.current[`/audio/${noteForPath} Pad2.wav`],
            audioCache.current[`/audio/${noteForPath} Pad3.wav`]
        ];
        
        if (buffers.some(b => !b)) {
            toast({ variant: 'destructive', title: 'Erro de Sample', description: `Não foi possível carregar os áudios para a nota ${note}.` });
            return;
        }

        if (activePadRef.current) {
            const oldPad = activePadRef.current;
            oldPad.stopScheduler();
            oldPad.padGain.gain.cancelScheduledValues(context.currentTime);
            oldPad.padGain.gain.linearRampToValueAtTime(0.0001, context.currentTime + fadeTime);

            setTimeout(() => { 
                try { oldPad.padGain.disconnect(); } catch (e) {} 
            }, fadeTime * 1000 + 200);
        }
        
        const padGain = context.createGain();
        padGain.gain.value = 0.0001;
        padGain.connect(masterGainRef.current);
        padGain.gain.linearRampToValueAtTime(1, context.currentTime + fadeTime);
        
        const mixGain = context.createGain();
        mixGain.gain.value = mix / 100;
        mixGain.connect(padGain);

        const playbackRate = mode === 'modulation' ? Math.pow(2, semitonesFromC[note] / 12) : 1;

        let isLooping = true;
        const timeouts: number[] = [];

        const scheduler = (startTime: number) => {
            if (!isLooping) return;
            
            const duration = buffers[0]!.duration;
            const effectiveDuration = duration / playbackRate;
            const crossfade = fadeTime;

            playIteration(startTime, effectiveDuration, crossfade);

            const nextStartTime = startTime + effectiveDuration - crossfade;
            const delay = (nextStartTime - context.currentTime) * 1000;

            const timeoutId = window.setTimeout(() => scheduler(nextStartTime), delay > 0 ? delay : 0);
            timeouts.push(timeoutId);
        }
        
        const playIteration = (startTime: number, duration: number, crossfade: number) => {
            buffers.forEach((buffer, index) => {
                if (!buffer) return;
                const sampleNumber = index + 1;

                const source = context.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = playbackRate;

                const iterGain = context.createGain();
                source.connect(iterGain);
                
                const layerGain = context.createGain();
                iterGain.connect(layerGain);

                if (sampleNumber === baseLayer) {
                    layerGain.gain.value = 1.0; // Base layer volume
                    layerGain.connect(padGain); // Connects directly to main output, bypassing mix
                } else {
                    layerGain.gain.value = 0.7; // Texture layer volume
                    layerGain.connect(mixGain); // Connects to the mix bus
                }

                iterGain.gain.setValueAtTime(0.0001, startTime);
                iterGain.gain.linearRampToValueAtTime(1, startTime + crossfade);
                iterGain.gain.setValueAtTime(1, startTime + duration - crossfade);
                iterGain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

                source.start(startTime);
                source.onended = () => { try { iterGain.disconnect(); layerGain.disconnect(); source.disconnect(); } catch(e) {} };
            });
        }

        const stopScheduler = () => { isLooping = false; timeouts.forEach(clearTimeout); };
        
        scheduler(context.currentTime);

        activePadRef.current = { note, padGain, mixGain, stopScheduler };
        setActiveKey(note);
    };

    const handleNoteClick = (note: Note) => {
        if (!isReady || !audioContextRef.current) return;
    
        const context = audioContextRef.current;

        const action = () => {
            if (activeKey === note) {
                stopPad();
            } else {
                playPad(note);
            }
        };

        if (context.state === 'suspended') {
            context.resume().then(action);
        } else {
            action();
        }
    };
    
    if (!isReady) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary"/>
            <div className="w-full max-w-sm text-center">
                <p className="text-lg font-semibold text-foreground">
                    Carregando samples... ({mode === 'modulation' ? 'Modo Rápido' : 'Modo Qualidade'})
                </p>
                <p className="text-sm text-muted-foreground">
                    Baixando: {loadedMb.toFixed(1)} MB / {totalSizeMb.toFixed(1)} MB
                </p>
                <Progress value={loadingProgress} className="mt-4" />
            </div>
        </div>
      );
    }
    
    return (
        <>
        <video ref={videoRef} muted loop playsInline style={{ display: 'none' }} />
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
                {isPiPSupported && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="absolute right-5 top-1/2 -translate-y-1/2"
                                    onClick={togglePiP}
                                    aria-label="Manter áudio em segundo plano"
                                >
                                    <PictureInPicture className={cn("h-4 w-4", isPiPActive && "text-primary")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{isPiPActive ? 'Sair do modo PiP' : 'Manter áudio em 2º plano'}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </header>

            <main className="container mx-auto max-w-4xl flex-1 px-5 flex flex-col gap-4">
                {/* Sliders Section */}
                <div className="glass-pane rounded-2xl p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                         <div className="flex flex-col gap-2">
                           <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Volume</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Ajusta o volume geral do pad.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Volume" value={[volume]} onValueChange={([v]) => setVolume(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Cutoff</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Controla o brilho. Sons mais abertos (brilhantes) ou fechados (escuros).</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Cutoff" value={[cutoff]} onValueChange={([v]) => setCutoff(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Mix</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Mistura as camadas de textura (samples secundários) ao som principal.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Mix" value={[mix]} onValueChange={([v]) => setMix(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Motion</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Adiciona um movimento lento e dinâmico ao filtro de brilho (cutoff).</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Motion" value={[motion]} onValueChange={([v]) => setMotion(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className={cn("text-xs text-muted-foreground uppercase tracking-widest", !isAmbienceSupported && "opacity-50")}>Ambience L/R</label>
                                 <Popover>
                                    <PopoverTrigger asChild disabled={!isAmbienceSupported}>
                                        <button className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                                            <HelpCircle className="h-4 w-4" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm">
                                        {isAmbienceSupported
                                            ? <p>Cria um efeito estéreo que move o som lentamente de um lado para o outro.</p>
                                            : <p>Este efeito não é suportado pelo seu navegador.</p>
                                        }
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Slider aria-label="Ambience L/R" value={[ambience]} onValueChange={([v]) => setAmbience(v)} max={100} step={1} disabled={!isAmbienceSupported} />
                        </div>
                         <div className="flex flex-col gap-2">
                            <div className="flex justify-center items-center gap-2">
                                <label className="text-xs text-muted-foreground uppercase tracking-widest">Crossfade</label>
                                <Popover>
                                    <PopoverTrigger asChild><button className="text-muted-foreground transition-colors hover:text-foreground"><HelpCircle className="h-4 w-4" /></button></PopoverTrigger>
                                    <PopoverContent align="center" className="w-60 text-sm"><p>Ajusta o tempo de transição (fade in/out) entre as notas.</p></PopoverContent>
                                </Popover>
                            </div>
                            <Slider
                                aria-label="Crossfade"
                                value={[fadeTime]}
                                onValueChange={([v]) => setFadeTime(v)}
                                min={1}
                                max={10}
                                step={0.5}
                            />
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
                            Seleção de Camada Base
                        </AccordionTrigger>
                        <AccordionContent className="glass-pane rounded-2xl p-4 mt-2">
                             <p className="text-sm text-muted-foreground mb-4">Selecione qual sample servirá como a camada principal (base). Os outros dois atuarão como texturas, controlados pelo slider "Mix".</p>
                            <RadioGroup value={String(baseLayer)} onValueChange={(val) => setBaseLayer(Number(val))} className="flex flex-col sm:flex-row gap-4 sm:gap-8 justify-center pt-2">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="1" id="r1" />
                                    <Label htmlFor="r1">Sample 1 (Padrão)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="2" id="r2" />
                                    <Label htmlFor="r2">Sample 2</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="3" id="r3" />
                                    <Label htmlFor="r3">Sample 3</Label>
                                </div>
                            </RadioGroup>
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
                                     <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Cog, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTES_LIST, FREQUENCIES, PRESETS, type Note, type PresetName } from '@/lib/audio-config';
import SampleConfigModal from './sample-config-modal';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type AppMode = 'synth' | 'sample';
type SampleConfig = Record<Note, string>;
type AudioBuffers = Record<Note, Tone.ToneAudioBuffer>;

export default function PadController() {
    const [isMounted, setIsMounted] = useState(false);
    const [mode, setMode] = useState<AppMode>('synth');
    const [activeKey, setActiveKey] = useState<Note | null>(null);
    const [volume, setVolume] = useState(70);
    const [motion, setMotion] = useState(30);
    const [ambience, setAmbience] = useState(0);
    const [currentPreset, setCurrentPreset] = useState<PresetName>('warm');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sampleConfig, setSampleConfig] = useState<SampleConfig>(
        () => NOTES_LIST.reduce((acc, note) => ({ ...acc, [note]: '' }), {} as SampleConfig)
    );

    const { toast } = useToast();
    
    // Tone.js refs
    const audioCtxReady = useRef(false);
    const masterGain = useRef<Tone.Volume | null>(null);
    const compressor = useRef<Tone.Compressor | null>(null);
    const lfo = useRef<Tone.LFO | null>(null);
    const autoPanner = useRef<Tone.AutoPanner | null>(null);
    
    // Synth refs for crossfade
    const synthA = useRef<Tone.PolySynth | null>(null);
    const synthB = useRef<Tone.PolySynth | null>(null);
    const crossFadeNode = useRef<Tone.CrossFade | null>(null);
    const activeSynthRef = useRef<'A' | 'B'>('A');

    // Sample refs
    const activeSamplePlayer = useRef<Tone.Player | null>(null);
    const audioBuffers = useRef<Partial<AudioBuffers>>({});
    const sampleLoadingStatus = useRef<Record<Note, 'idle' | 'loading' | 'loaded' | 'error'>>(
        NOTES_LIST.reduce((acc, note) => ({ ...acc, [note]: 'idle' }), {} as any)
    );

    // Load config from localStorage on mount
    useEffect(() => {
        setIsMounted(true);
        try {
            const savedConfig = localStorage.getItem('padWorshipSampleConfig');
            if (savedConfig) {
                setSampleConfig(JSON.parse(savedConfig));
            }
        } catch (e) {
            console.error("Failed to load sample config from localStorage", e);
        }

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if(isIOS) {
             toast({
                title: 'Aviso para iOS',
                description: 'No iPhone/iPad, verifique se o botão "Silêncio" (lateral) está desligado.',
            });
        }
    }, [toast]);
    
    // Initialize Audio Context
    const initAudio = useCallback(async () => {
        if (audioCtxReady.current) return;
        try {
            await Tone.start();
            
            masterGain.current = new Tone.Volume(-6).toDestination();
            compressor.current = new Tone.Compressor(-20, 10).connect(masterGain.current);
            autoPanner.current = new Tone.AutoPanner('4n').connect(compressor.current).start();
            
            crossFadeNode.current = new Tone.CrossFade(0).connect(autoPanner.current);
            
            lfo.current = new Tone.LFO({
              frequency: '8n',
              min: 200,
              max: 2000,
              amplitude: 0
            }).start();

            audioCtxReady.current = true;
            console.log('Audio context is ready.');
        } catch (e) {
            console.error('Could not start audio context', e);
            toast({
                variant: 'destructive',
                title: 'Erro de Áudio',
                description: 'Não foi possível iniciar o áudio. Por favor, interaja com a página e tente novamente.',
            });
        }
    }, [toast]);

    const setupSynths = useCallback(() => {
        if (synthA.current) synthA.current.dispose();
        if (synthB.current) synthB.current.dispose();

        const preset = PRESETS[currentPreset];
        const voiceConfig = preset.voices[0];

        const synthOptions = {
            oscillator: { type: voiceConfig.type },
            envelope: preset.options,
        };

        const createSynth = () => {
            const newSynth = new Tone.PolySynth(Tone.Synth, synthOptions);
            if (voiceConfig.filter) {
                newSynth.set({ filter: voiceConfig.filter });
            }
            return newSynth;
        }
        
        if (!crossFadeNode.current) return;
        synthA.current = createSynth().connect(crossFadeNode.current.a);
        synthB.current = createSynth().connect(crossFadeNode.current.b);

    }, [currentPreset]);

    useEffect(() => {
        if (!audioCtxReady.current) return;
        setupSynths();
    }, [setupSynths, isMounted]);

    // Audio Controls Effects
    useEffect(() => { masterGain.current?.volume.rampTo(Tone.gainToDb(volume / 100), 0.1); }, [volume]);
    useEffect(() => { if (lfo.current) lfo.current.amplitude.value = (motion / 100) * 1800; }, [motion]);
    useEffect(() => { if (autoPanner.current) autoPanner.current.frequency.value = (ambience / 100) * 2; }, [ambience]);

    const handleSaveConfig = (newConfig: SampleConfig) => {
        setSampleConfig(newConfig);
        try {
            localStorage.setItem('padWorshipSampleConfig', JSON.stringify(newConfig));
        } catch (e) {
            console.error("Failed to save sample config", e);
        }
        audioBuffers.current = {};
        Object.keys(sampleLoadingStatus.current).forEach(key => {
            sampleLoadingStatus.current[key as Note] = 'idle';
        });
    };

    const stopPad = useCallback((fadeTime = 2) => {
        if (!audioCtxReady.current) return;
        if (synthA.current) synthA.current.releaseAll();
        if (synthB.current) synthB.current.releaseAll();

        if (activeSamplePlayer.current) {
            activeSamplePlayer.current.volume.rampTo(-Infinity, fadeTime);
            activeSamplePlayer.current.stop(`+${fadeTime}`);
            activeSamplePlayer.current = null;
        }
        setActiveKey(null);
    }, []);
    
    const playSynthNote = useCallback((note: Note) => {
        if (!crossFadeNode.current || !synthA.current || !synthB.current) {
            setupSynths();
        }
        if (!crossFadeNode.current || !synthA.current || !synthB.current) return;

        const frequency = FREQUENCIES[note];
        const fadeTime = 1.5;

        const inactiveSynth = activeSynthRef.current === 'A' ? synthB.current : synthA.current;
        const activeSynth = activeSynthRef.current === 'A' ? synthA.current : synthB.current;
        const nextFadeVal = activeSynthRef.current === 'A' ? 1 : 0;
        
        inactiveSynth.triggerAttack([frequency, frequency/2]);
        crossFadeNode.current.fade.rampTo(nextFadeVal, fadeTime);
        activeSynth.releaseAll();

        activeSynthRef.current = activeSynthRef.current === 'A' ? 'B' : 'A';
    }, [setupSynths]);

    const playSampleNote = useCallback(async (note: Note) => {
        const fileId = sampleConfig[note];
        if (!fileId) {
            toast({ variant: 'destructive', title: 'Sample não configurado', description: `Não há um sample do Google Drive configurado para a nota ${note}.` });
            setActiveKey(null);
            return;
        }

        const stopCurrentSample = (fadeTime: number) => {
            if (activeSamplePlayer.current) {
                const oldPlayer = activeSamplePlayer.current;
                oldPlayer.volume.rampTo(-Infinity, fadeTime);
                oldPlayer.stop(`+${fadeTime}`);
                activeSamplePlayer.current = null;
            }
        };

        stopCurrentSample(1.5);

        try {
            let buffer = audioBuffers.current[note];
            if (!buffer) {
                sampleLoadingStatus.current[note] = 'loading';
                setActiveKey(note); 
                
                const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
                
                buffer = await new Promise<Tone.ToneAudioBuffer>((resolve, reject) => {
                  const playerForLoad = new Tone.Player(url, () => {
                      resolve(playerForLoad.buffer);
                      playerForLoad.dispose();
                  }, (err) => {
                      reject(err)
                  }).toDestination();
                });
                
                audioBuffers.current[note] = buffer;
                sampleLoadingStatus.current[note] = 'loaded';
            }
            
            const newPlayer = new Tone.Player(buffer).connect(compressor.current!);
            newPlayer.loop = true;
            newPlayer.volume.value = -Infinity;
            newPlayer.start(Tone.now());
            newPlayer.volume.rampTo(0, 1.5);

            activeSamplePlayer.current = newPlayer;

        } catch (error) {
            console.error(`Error loading sample for note ${note}:`, error);
            sampleLoadingStatus.current[note] = 'error';
            toast({ variant: 'destructive', title: 'Erro ao carregar sample', description: `Não foi possível carregar o áudio para a nota ${note}. Verifique o ID e as permissões do arquivo.` });
            stopCurrentSample(0.1);
            setActiveKey(null);
        }

    }, [sampleConfig, toast]);

    const handleNoteClick = async (note: Note) => {
        await initAudio();
        if (!audioCtxReady.current) return;

        if (activeKey === note) {
            stopPad();
            return;
        }

        if (mode === 'synth') {
            playSynthNote(note);
        } else {
            await playSampleNote(note);
        }
        setActiveKey(note);
    };

    const toggleMode = () => {
        stopPad(0.1);
        setMode(prev => (prev === 'synth' ? 'sample' : 'synth'));
    };

    const getNoteButtonClass = (note: Note) => {
        if (mode === 'sample') {
            const status = sampleLoadingStatus.current[note];
            if (status === 'loading' && activeKey === note) {
                return 'animate-pulse-loading border-yellow-400 text-yellow-400';
            }
             if (status === 'error') {
                return 'border-red-500/50 text-red-500/80';
            }
        }
        return '';
    };

    if (!isMounted) {
      return (
        <div className="flex h-screen w-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary"/>
        </div>
      );
    }
    
    return (
        <TooltipProvider>
            <header className="w-full p-5 text-center flex flex-col items-center gap-2.5">
                <h1 className="text-3xl font-extrabold tracking-tighter bg-gradient-to-r from-purple-300 to-indigo-400 text-transparent bg-clip-text">
                    Pad Worship Pro
                </h1>
                <Button 
                    onClick={toggleMode} 
                    variant="outline"
                    className={cn("rounded-full border-white/20 bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider text-xs px-4 py-2 h-auto",
                        mode === 'sample' && 'bg-primary/20 text-purple-300 border-primary/50'
                    )}
                >
                    Fonte: {mode === 'synth' ? 'Sintetizador' : 'Samples (Drive)'}
                </Button>
            </header>

            <main className="container mx-auto max-w-2xl flex-1 px-5 flex flex-col gap-4">
                <div className="glass-pane rounded-2xl p-4 flex flex-col gap-4 transition-all">
                    {mode === 'sample' ? (
                        <Button onClick={() => setIsModalOpen(true)} variant="outline" className="w-full bg-accent/20 border-accent/50 text-blue-300 hover:bg-accent/30 hover:text-white font-semibold">
                            <Cog className="mr-2 h-4 w-4" /> Configurar Samples (Google Drive)
                        </Button>
                    ) : (
                        <div id="synthControls">
                            <label className="text-xs text-muted-foreground uppercase tracking-widest text-center block mb-3">Timbre (Preset)</label>
                            <div className="flex flex-wrap justify-center gap-2">
                                {Object.keys(PRESETS).map(p => (
                                    <Button key={p} variant="ghost" size="sm" onClick={() => setCurrentPreset(p as PresetName)} className={cn("font-semibold", currentPreset === p && 'bg-primary/20 text-purple-300 border border-primary/50')}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Button>
                                ))}
                            </div>
                            <div className="mt-6 space-y-4">
                                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                                    <label className="text-sm text-muted-foreground text-right">Motion</label>
                                    <Slider title="Intensidade do movimento do filtro" value={[motion]} onValueChange={([v]) => setMotion(v)} max={100} step={1} />
                                </div>
                                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                                    <label className="text-sm text-muted-foreground text-right">Ambiência L/R</label>
                                    <Slider title="Velocidade da movimentação estéreo (Auto-Pan)" value={[ambience]} onValueChange={([v]) => setAmbience(v)} max={100} step={1} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={cn("h-6 flex justify-center items-center gap-2.5 transition-opacity", activeKey ? 'opacity-100' : 'opacity-0')}>
                    <div className="flex gap-0.5 h-4 items-end">
                        <div className="w-1 bg-primary animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1 bg-primary animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1 bg-primary animate-bounce"></div>
                    </div>
                    <span className="text-lg font-bold text-white">{activeKey || '--'}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2.5">
                    {NOTES_LIST.map(note => (
                       <Tooltip key={note}>
                          <TooltipTrigger asChild>
                            <button
                                data-note={note}
                                onClick={() => handleNoteClick(note)}
                                className={cn(
                                    "glass-pane relative overflow-hidden rounded-xl py-5 text-xl font-bold transition-all duration-200 hover:bg-white/10 active:scale-95 active:duration-100",
                                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                    activeKey === note && "bg-primary border-primary shadow-[0_0_30px_theme(colors.primary.DEFAULT)] z-10",
                                    getNoteButtonClass(note)
                                )}
                            >
                                {note}
                                {activeKey === note && <div className="absolute inset-0 bg-radial-gradient from-white/40 to-transparent animate-pulse-glow"></div>}
                            </button>
                            </TooltipTrigger>
                            {mode === 'sample' && sampleLoadingStatus.current[note] === 'error' && (
                                <TooltipContent>
                                    <p>Erro ao carregar sample.</p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    ))}
                </div>

                <div className="glass-pane rounded-2xl p-5 flex flex-col gap-5">
                    <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                        <label className="text-sm text-muted-foreground">Volume</label>
                        <Slider value={[volume]} onValueChange={([v]) => setVolume(v)} max={100} step={1} />
                    </div>
                </div>
            </main>

            <footer className="mt-auto p-5 text-center text-xs text-muted-foreground">
                <p>Use fones ou conecte ao som para ouvir os graves.</p>
            </footer>

            <SampleConfigModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                initialConfig={sampleConfig}
                onSave={handleSaveConfig}
            />
        </TooltipProvider>
    );
}

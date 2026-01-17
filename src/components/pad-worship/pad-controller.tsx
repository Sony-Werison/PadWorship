'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTES_LIST, type Note } from '@/lib/audio-config';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Type for the active pad containing audio nodes
type ActivePad = {
    note: Note;
    padGain: GainNode;
    sources: AudioBufferSourceNode[];
};

// Map flat notes to sharp filenames
const noteToFileNameMap: Partial<Record<Note, string>> = {
    'Ab': 'G#',
    'Bb': 'A#',
    'Eb': 'D#',
};

const FADE_TIME = 1.5; // seconds for crossfade and stop

export default function PadController() {
    const [isMounted, setIsMounted] = useState(false);
    const [activeKey, setActiveKey] = useState<Note | null>(null);
    const [volume, setVolume] = useState(70);
    const [cutoff, setCutoff] = useState(100);
    const [mix, setMix] = useState(0);
    const [loadingNote, setLoadingNote] = useState<Note | null>(null);

    const { toast } = useToast();
    
    // Web Audio API refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const cutoffFilterRef = useRef<BiquadFilterNode | null>(null);
    const mixGainRef = useRef<GainNode | null>(null);
    const activePadRef = useRef<ActivePad | null>(null);
    const audioCache = useRef<Record<string, AudioBuffer>>({});
    const isAudioInitialized = useRef(false);

    useEffect(() => {
        setIsMounted(true);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if(isIOS) {
             toast({
                title: 'Aviso para iOS',
                description: 'No iPhone/iPad, verifique se o botão "Silêncio" (lateral) está desligado.',
            });
        }
    }, [toast]);
    
    const initAudio = useCallback(async () => {
        if (isAudioInitialized.current || !window.AudioContext) return;
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (context.state === 'suspended') {
              await context.resume();
            }

            const masterGain = context.createGain();
            const cutoffFilter = context.createBiquadFilter();
            const mixGain = context.createGain();

            cutoffFilter.type = 'lowpass';
            cutoffFilter.frequency.value = context.sampleRate / 2;
            
            masterGain.connect(cutoffFilter);
            cutoffFilter.connect(context.destination);
            
            audioContextRef.current = context;
            masterGainRef.current = masterGain;
            cutoffFilterRef.current = cutoffFilter;
            mixGainRef.current = mixGain;

            isAudioInitialized.current = true;
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

    // Audio Controls Effects
    useEffect(() => {
        if (!masterGainRef.current || !audioContextRef.current) return;
        masterGainRef.current.gain.setTargetAtTime(volume / 100, audioContextRef.current.currentTime, 0.05);
    }, [volume]);

    useEffect(() => {
        if (!mixGainRef.current || !audioContextRef.current) return;
        mixGainRef.current.gain.setTargetAtTime(mix / 100, audioContextRef.current.currentTime, 0.05);
    }, [mix]);

    useEffect(() => {
        if (!cutoffFilterRef.current || !audioContextRef.current) return;
        // Map 0-100 slider to an exponential frequency range (e.g., 40Hz to 20kHz)
        const minFreq = 40;
        const maxFreq = audioContextRef.current.sampleRate / 2;
        const freq = minFreq * Math.pow(maxFreq / minFreq, cutoff / 100);
        cutoffFilterRef.current.frequency.setTargetAtTime(freq, audioContextRef.current.currentTime, 0.05);
    }, [cutoff]);


    const loadSamples = useCallback(async (note: Note): Promise<AudioBuffer[]> => {
        const context = audioContextRef.current;
        if (!context) throw new Error("Audio context not initialized");
        
        const fileNameNote = noteToFileNameMap[note] || note;
        const noteForPath = encodeURIComponent(fileNameNote);
        const paths = [
            `/audio/${noteForPath} Pad.wav`,
            `/audio/${noteForPath} Pad2.wav`,
            `/audio/${noteForPath} Pad3.wav`,
        ];

        const loadPromises = paths.map(async (path) => {
            if (audioCache.current[path]) {
                return audioCache.current[path];
            }
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${path}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            audioCache.current[path] = audioBuffer;
            return audioBuffer;
        });

        return Promise.all(loadPromises);
    }, []);

    const stopPad = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !activePadRef.current) return;

        const { padGain, sources } = activePadRef.current;
        const stopTime = context.currentTime + FADE_TIME;
        
        padGain.gain.cancelScheduledValues(context.currentTime);
        padGain.gain.linearRampToValueAtTime(0, stopTime);

        sources.forEach(source => {
          try {
            source.stop(stopTime)
          } catch (e) {
            // may already be stopped
          }
        });
        
        activePadRef.current = null;
        setActiveKey(null);
    }, []);

    const playPad = useCallback(async (note: Note) => {
        const context = audioContextRef.current;
        if (!context || !masterGainRef.current || !mixGainRef.current) return;

        setLoadingNote(note);

        try {
            const [baseBuffer, tex1Buffer, tex2Buffer] = await loadSamples(note);
            
            // If another note is playing, fade it out
            if (activePadRef.current) {
                const oldPad = activePadRef.current;
                const stopTime = context.currentTime + FADE_TIME;
                oldPad.padGain.gain.cancelScheduledValues(context.currentTime);
                oldPad.padGain.gain.linearRampToValueAtTime(0, stopTime);
                oldPad.sources.forEach(source => {
                  try {
                    source.stop(stopTime)
                  } catch(e) {
                    // may already be stopped
                  }
                });
            }
            
            // Create new nodes for the new pad
            const padGain = context.createGain();
            padGain.gain.value = 0;
            padGain.connect(masterGainRef.current);

            const baseSource = context.createBufferSource();
            baseSource.buffer = baseBuffer;
            baseSource.loop = true;

            const tex1Source = context.createBufferSource();
            tex1Source.buffer = tex1Buffer;
            tex1Source.loop = true;
            
            const tex2Source = context.createBufferSource();
            tex2Source.buffer = tex2Buffer;
            tex2Source.loop = true;

            // Connect sources to graph
            baseSource.connect(padGain);
            tex1Source.connect(mixGainRef.current);
            tex2Source.connect(mixGainRef.current);
            mixGainRef.current.connect(padGain);

            // Start all sources and fade in
            const startTime = context.currentTime;
            baseSource.start(startTime);
            tex1Source.start(startTime);
            tex2Source.start(startTime);
            
            padGain.gain.linearRampToValueAtTime(1, startTime + FADE_TIME);

            // Update active pad state
            const newPad: ActivePad = {
                note,
                padGain,
                sources: [baseSource, tex1Source, tex2Source]
            };

            activePadRef.current = newPad;
            setActiveKey(note);

        } catch (error) {
            console.error(`Error playing note ${note}:`, error);
            toast({
                variant: 'destructive',
                title: 'Erro ao Carregar Sample',
                description: `Não foi possível encontrar os arquivos para a nota ${note}. Verifique se os arquivos estão na pasta /public/audio.`
            });
            if (activePadRef.current?.note === note) {
                activePadRef.current = null;
                setActiveKey(null);
            }
        } finally {
            setLoadingNote(null);
        }

    }, [loadSamples, toast]);


    const handleNoteClick = async (note: Note) => {
        await initAudio();
        if (!isAudioInitialized.current) return;
        
        if (activeKey === note) {
            stopPad();
        } else {
            playPad(note);
        }
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
            </header>

            <main className="container mx-auto max-w-2xl flex-1 px-5 flex flex-col gap-4">
                <div className="glass-pane rounded-2xl p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-muted-foreground uppercase tracking-widest text-center">Volume</label>
                            <Slider aria-label="Volume" value={[volume]} onValueChange={([v]) => setVolume(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-muted-foreground uppercase tracking-widest text-center">Cutoff</label>
                            <Slider aria-label="Cutoff" value={[cutoff]} onValueChange={([v]) => setCutoff(v)} max={100} step={1} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-muted-foreground uppercase tracking-widest text-center">Mix</label>
                            <Slider aria-label="Mix" value={[mix]} onValueChange={([v]) => setMix(v)} max={100} step={1} />
                        </div>
                    </div>
                </div>

                <div className={cn("h-6 flex justify-center items-center gap-2.5 transition-opacity", activeKey || loadingNote ? 'opacity-100' : 'opacity-0')}>
                    <div className="flex gap-0.5 h-4 items-end">
                        <div className="w-1 bg-primary animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1 bg-primary animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1 bg-primary animate-bounce"></div>
                    </div>
                    <span className="text-lg font-bold text-white">{activeKey || loadingNote || '--'}</span>
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
                                    loadingNote === note && 'animate-pulse-loading border-yellow-400 text-yellow-400'
                                )}
                                disabled={loadingNote !== null && loadingNote !== note}
                            >
                                {loadingNote === note ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : note}
                                {activeKey === note && <div className="absolute inset-0 bg-radial-gradient from-white/40 to-transparent animate-pulse-glow"></div>}
                            </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Tocar nota {note}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </main>

            <footer className="mt-auto p-5 text-center text-xs text-muted-foreground">
                <p>Use fones ou conecte ao som para ouvir os graves.</p>
            </footer>
        </TooltipProvider>
    );
}

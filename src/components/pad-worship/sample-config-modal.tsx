'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NOTES_LIST, type Note } from '@/lib/audio-config';
import { checkAudioFilesAvailability } from '@/ai/flows/audio-file-availability-assistant';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

type SampleConfig = Record<Note, string>;

type AvailabilityStatus = 'idle' | 'loading' | 'checked';
type AvailabilityResult = {
  isAvailable: boolean;
  errorMessage?: string;
};

interface SampleConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig: SampleConfig;
  onSave: (config: SampleConfig) => void;
}

export default function SampleConfigModal({
  open,
  onOpenChange,
  initialConfig,
  onSave,
}: SampleConfigModalProps) {
  const [driveIds, setDriveIds] = useState<SampleConfig>(initialConfig);
  const [availability, setAvailability] = useState<Record<Note, { status: AvailabilityStatus; result?: AvailabilityResult }>>(
    () => NOTES_LIST.reduce((acc, note) => ({ ...acc, [note]: { status: 'idle' } }), {} as Record<Note, { status: AvailabilityStatus; result?: AvailabilityResult }>)
  );
  const [isChecking, setIsChecking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDriveIds(initialConfig);
      // Reset status on open
      setAvailability(NOTES_LIST.reduce((acc, note) => ({ ...acc, [note]: { status: 'idle' } }), {} as Record<Note, { status: AvailabilityStatus; result?: AvailabilityResult }>));
    }
  }, [open, initialConfig]);

  const handleInputChange = (note: Note, value: string) => {
    setDriveIds(prev => ({ ...prev, [note]: value }));
  };

  const handleCheckAvailability = async () => {
    const fileIdsToCheck = NOTES_LIST.filter(note => driveIds[note].trim() !== '').map(note => driveIds[note]);
    
    if (fileIdsToCheck.length === 0) {
      toast({ title: "Nenhum ID para verificar", description: "Insira pelo menos um ID de arquivo do Google Drive." });
      return;
    }

    setIsChecking(true);
    setAvailability(prev => {
      const newState = { ...prev };
      NOTES_LIST.forEach(note => {
        if (driveIds[note].trim() !== '') {
          newState[note] = { status: 'loading' };
        } else {
          newState[note] = { status: 'idle' };
        }
      });
      return newState;
    });

    try {
      const response = await checkAudioFilesAvailability({ fileIds: fileIdsToCheck });
      
      const resultsMap = new Map<string, AvailabilityResult>();
      response.availabilityReport.forEach(report => {
        resultsMap.set(report.fileId, { isAvailable: report.isAvailable, errorMessage: report.errorMessage });
      });

      setAvailability(prev => {
        const newState = { ...prev };
        NOTES_LIST.forEach(note => {
          const fileId = driveIds[note];
          if (fileId && fileIdsToCheck.includes(fileId)) {
            const result = resultsMap.get(fileId);
            newState[note] = { status: 'checked', result };
          } else {
             newState[note] = { status: 'idle' };
          }
        });
        return newState;
      });

    } catch (error) {
      console.error("Error checking file availability:", error);
      toast({
        variant: 'destructive',
        title: 'Erro na Verificação',
        description: 'Não foi possível verificar os arquivos. Tente novamente.',
      });
      // Reset loading states
      setAvailability(prev => {
        const newState = { ...prev };
        NOTES_LIST.forEach(note => {
            newState[note] = { status: 'idle' };
        });
        return newState;
      });
    } finally {
      setIsChecking(false);
    }
  };
  
  const handleSave = () => {
    onSave(driveIds);
    onOpenChange(false);
    toast({ title: 'Configuração Salva', description: 'Seus samples do Google Drive foram salvos.' });
  }

  const renderStatusIcon = (note: Note) => {
    const state = availability[note];
    if (state.status === 'loading') {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (state.status === 'checked' && state.result) {
      if (state.result.isAvailable) {
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      }
      return <XCircle className="h-4 w-4 text-red-500" title={state.result.errorMessage} />;
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[#1e1b4b] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Configurar Samples (Drive)</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-blue-200/80 mb-4 leading-relaxed">
          Cole o <strong>ID do arquivo</strong> do Google Drive para cada nota.
          <br />O arquivo deve estar como "Público" (Qualquer pessoa com o link).
          <br />Ex: ID "1aBcD..." do link <i>drive.google.com/file/d/<b>1aBcD...</b>/view</i>
        </div>
        <ScrollArea className="h-[40vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {NOTES_LIST.map(note => (
              <div key={note} className="grid grid-cols-[30px_1fr_30px] items-center gap-2">
                <Label htmlFor={note} className="font-bold text-primary/80">
                  {note}
                </Label>
                <Input
                  id={note}
                  value={driveIds[note] || ''}
                  onChange={(e) => handleInputChange(note, e.target.value)}
                  placeholder="ID do arquivo do Google Drive"
                  className="bg-black/30 border-white/20 focus:ring-primary"
                />
                <div className="flex items-center justify-center h-full w-full">
                  {renderStatusIcon(note)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="mt-6 sm:justify-between w-full">
            <Button variant="outline" onClick={handleCheckAvailability} disabled={isChecking}>
                {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <AlertTriangle className="mr-2 h-4 w-4"/>}
                Verificar Disponibilidade
            </Button>
            <div className="flex gap-2">
                <DialogClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Salvar Configuração
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

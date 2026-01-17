'use client';

import PadController from '@/components/pad-worship/pad-controller';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function PadPageContent() {
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode') as 'full' | 'modulation' | null;

    if (!mode || !['full', 'modulation'].includes(mode)) {
         return (
            <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4 text-center">
                 <p className="text-lg text-destructive">Modo de áudio inválido.</p>
                 <p className="text-muted-foreground">Por favor, volte e selecione um modo para continuar.</p>
                 <Button asChild className="mt-4">
                    <Link href="/">Voltar para a seleção</Link>
                 </Button>
             </div>
         );
    }

    return <PadController mode={mode} />;
}

export default function PadPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary"/>
                <p className="text-muted-foreground">Carregando interface...</p>
            </div>
        }>
            <PadPageContent />
        </Suspense>
    );
}

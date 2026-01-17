import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Database, Cpu } from 'lucide-react';

export default function ModeSelection() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
        <header className="text-center">
             <h1 className="text-4xl font-extrabold tracking-tighter bg-gradient-to-r from-purple-300 to-indigo-400 text-transparent bg-clip-text">
                Pad Worship Pro
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">Escolha o modo de áudio para começar</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
            <Link href="/pad?mode=full" passHref>
                <Card className="glass-pane hover:border-primary transition-all cursor-pointer h-full flex flex-col group">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <Database className="text-purple-300 transition-colors group-hover:text-primary" /> Samples
                        </CardTitle>
                        <CardDescription>Qualidade Máxima</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                        <p className="text-sm text-muted-foreground">Carrega todos os arquivos de áudio para cada nota. Oferece a melhor qualidade sonora, mas o carregamento inicial é mais longo.</p>
                    </CardContent>
                </Card>
            </Link>
             <Link href="/pad?mode=modulation" passHref>
                <Card className="glass-pane hover:border-primary transition-all cursor-pointer h-full flex flex-col group">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <Cpu className="text-indigo-400 transition-colors group-hover:text-primary" /> Modulação
                        </CardTitle>
                        <CardDescription>Carregamento Rápido</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                        <p className="text-sm text-muted-foreground">Carrega apenas um conjunto de samples e altera o tom digitalmente (pitch shift). Carregamento quase instantâneo, mas pode introduzir pequenos artefatos sonoros.</p>
                    </CardContent>
                </Card>
            </Link>
        </div>
        <footer className="absolute bottom-5 text-center text-xs text-muted-foreground">
            <p>Use fones ou conecte ao som para ouvir os graves.</p>
        </footer>
    </div>
  );
}

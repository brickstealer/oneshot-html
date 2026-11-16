import type {Metadata} from 'next';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext', 'cyrillic-ext'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'TransBiome Express — Процедурный Симулятор Поезда',
  description: 'Кинематографическая 3D-симуляция поезда в бесконечном процедурно генерируемом мире с городами, деревнями, лесами и горными серпантинами.',
  openGraph: {
    title: 'TransBiome Express — Процедурный Симулятор Поезда',
    description: 'Кинематографическая 3D-симуляция поезда в бесконечном процедурно генерируемом мире с городами, деревнями, лесами и горными серпантинами.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TransBiome Express — Процедурный Симулятор Поезда',
    description: 'Кинематографическая 3D-симуляция поезда в бесконечном процедурно генерируемом мире с городами, деревнями, лесами и горными серпантинами.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ru" className={`${outfit.variable} ${jakarta.variable} ${jetbrains.variable} dark`}>
      <body suppressHydrationWarning className="bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}

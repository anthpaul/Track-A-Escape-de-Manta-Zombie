import type { Metadata, Viewport } from "next";
import { Geist_Mono, Silkscreen, Space_Grotesk } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// Fuente pixel para títulos, IDs, botones y etiquetas cortas; Space Grotesk para el texto corrido.
const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spondylus Z",
  description: "Motor de rutas en tiempo real para escapar de los zombies de Manta.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // permite que env(safe-area-inset-*) funcione en teléfonos con muesca o indicador de inicio
  themeColor: "#13030d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`dark ${silkscreen.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

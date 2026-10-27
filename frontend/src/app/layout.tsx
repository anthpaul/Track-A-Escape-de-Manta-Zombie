import type { Metadata, Viewport } from "next";
import { Geist_Mono, Silkscreen, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Pixel font for titles, IDs, buttons and short labels; Space Grotesk for running text.
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
  title: "Escape de Manta Zombie",
  description: "Motor de rutas en tiempo real para escapar de los zombies de Manta.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets env(safe-area-inset-*) work on phones with a notch or home indicator
  themeColor: "#13030d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`dark ${silkscreen.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

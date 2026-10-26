import type { Metadata } from "next";
import { Geist_Mono, Griffy, Nunito } from "next/font/google";
import "./globals.css";

// Body and numbers: rounded and very legible. Headings: Halloween flavor that stays readable.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const griffy = Griffy({
  variable: "--font-griffy",
  weight: "400",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`dark ${nunito.variable} ${griffy.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente IA Dashboard · Activum",
  description: "Exporta y analiza conversaciones de tus agentes ElevenLabs. Métricas, transcripciones y exportación a Excel.",
  openGraph: {
    title: "Agente IA Dashboard · Activum",
    description: "Exporta y analiza conversaciones de tus agentes ElevenLabs. Métricas, transcripciones y exportación a Excel.",
    url: "https://elevenlabs-conversation-excel-export.vercel.app",
    siteName: "Activum",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Agente IA Dashboard" }],
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agente IA Dashboard · Activum",
    description: "Exporta y analiza conversaciones de tus agentes ElevenLabs.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/favicon-180.png", sizes: "180x180" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Mono:wght@300;400;500&family=Jost:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

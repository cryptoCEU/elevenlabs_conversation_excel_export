# ElevenLabs Conversation Exporter

Webapp Next.js para exportar todas las conversaciones de tus agentes ElevenLabs a Excel (.xlsx).

![Stack](https://img.shields.io/badge/Next.js-14-black) ![Deploy](https://img.shields.io/badge/Vercel-ready-black) ![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Conversational_AI-purple)

## ✨ Funcionalidades

- 📋 **Lista todas las conversaciones** de un agente ElevenLabs
- ✅ **Selección individual o masiva** de conversaciones a exportar
- 📊 **Exporta a Excel** con 3 hojas:
  - **Resumen** — metadata de cada conversación
  - **Transcripciones** — todos los mensajes (usuario + agente)
  - **Datos Recogidos** — data collection del análisis (si existe)
- 🔒 Las credenciales **nunca se persisten** en el servidor
- ♾️ Soporta **paginación automática** (agentes con muchas conversaciones)

## 🚀 Deploy en Vercel (recomendado)

### 1. Fork / Subir a GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/TU_USUARIO/elevenlabs-exporter.git
git push -u origin main
```

### 2. Importar en Vercel

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa tu repositorio de GitHub
3. Vercel detecta Next.js automáticamente — clic en **Deploy**

¡Listo! No necesitas variables de entorno (las credenciales se introducen en la UI).

## 💻 Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## 🔑 Cómo obtener credenciales ElevenLabs

| Campo | Dónde encontrarlo |
|-------|------------------|
| **API Key** | elevenlabs.io → Settings → API Keys |
| **Agent ID** | URL del agente en Conversational AI: `.../agent/AGENT_ID_AQUI` |

## 📁 Estructura del Excel exportado

### Hoja: Resumen
| ID Conversación | ID Agente | Estado | Fecha / Hora | Duración | Nº Mensajes | Resultado | Resumen |
|---|---|---|---|---|---|---|---|

### Hoja: Transcripciones
| ID Conversación | Fecha | Rol | Mensaje | Segundo en llamada |
|---|---|---|---|---|

### Hoja: Datos Recogidos
Columnas dinámicas según los campos configurados en el análisis del agente.

## 🛠 Stack

- **Framework**: Next.js 14 (App Router)
- **API**: ElevenLabs Conversational AI REST API
- **Excel**: SheetJS (xlsx)
- **UI**: Tailwind CSS + custom CSS
- **Deploy**: Vercel

## 📄 Licencia

MIT

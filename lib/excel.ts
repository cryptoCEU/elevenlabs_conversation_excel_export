// lib/excel.ts
import * as XLSX from "xlsx";
import type { ConversationDetail } from "./elevenlabs";
import { deriveTimings } from "./elevenlabs";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  return `${m}m ${String(s).padStart(2,"0")}s`;
}

function getDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function getTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export function buildExcelWorkbook(
  conversations: ConversationDetail[],
  agentName: string
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows = conversations.map((c) => {
    const { conversationSecs, waitSecs } = deriveTimings(c);

    return {
      "Fecha": getDate(c.start_time_unix_secs),
      "Hora": getTime(c.start_time_unix_secs),
      "Cola": agentName,
      "Duración llamada": fmt(c.call_duration_secs ?? 0),
      "Tiempo de conversación": fmt(conversationSecs),
      "Tiempo de espera": fmt(waitSecs),
      "ID Conversación": c.conversation_id,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // Fecha
    { wch: 12 }, // Hora
    { wch: 28 }, // Cola
    { wch: 20 }, // Duración llamada
    { wch: 24 }, // Tiempo de conversación
    { wch: 20 }, // Tiempo de espera
    { wch: 36 }, // ID Conversación
  ];

  // Freeze header
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, "Conversaciones");
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

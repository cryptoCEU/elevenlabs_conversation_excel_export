// lib/excel.ts
import * as XLSX from "xlsx";
import type { ConversationDetail } from "./elevenlabs";
import { deriveTimings } from "./elevenlabs";

function fmtDuration(secs: number): string {
  if (!secs || secs <= 0) return "0m 00s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function getDate(unix: number): string {
  if (!unix || unix <= 0) return "";
  try {
    return new Date(unix * 1000).toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return String(unix); }
}

function getTime(unix: number): string {
  if (!unix || unix <= 0) return "";
  try {
    return new Date(unix * 1000).toLocaleTimeString("es-ES", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return ""; }
}

export function buildExcelWorkbook(
  conversations: ConversationDetail[],
  agentName: string,
  agentCode = ""
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows = conversations.map((c) => {
    const { conversationSecs, waitSecs } = deriveTimings(c);
    const dur = c.call_duration_secs ?? 0;

    return {
      "Fecha":                   getDate(c.start_time_unix_secs),
      "Hora":                    getTime(c.start_time_unix_secs),
      "Cola":                    agentName,
      "Llamante":                c.caller_phone ?? "",
      "Llamado":                 c.called_phone ?? "",
      "Atendida":                agentCode,
      "Duración llamada":        fmtDuration(dur),
      "T.Timbre":                c.ring_secs ?? 0,        // seconds (number)
      "Tiempo de conversación":  conversationSecs,         // seconds (number)
      "Tiempo de espera":        waitSecs,                 // seconds (number)
      "Finalizado":              c.ended_by ?? "—",
      "Pos.In":                  "",
      "Pos.Out":                 "",
      "ID Conversación":         c.conversation_id,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 }, // Fecha
    { wch: 10 }, // Hora
    { wch: 28 }, // Cola
    { wch: 14 }, // Atendida
    { wch: 18 }, // Llamante
    { wch: 18 }, // Llamado
    { wch: 18 }, // Duración llamada
    { wch: 12 }, // T.Timbre
    { wch: 22 }, // Tiempo de conversación
    { wch: 18 }, // Tiempo de espera
    { wch: 14 }, // Finalizado
    { wch: 10 }, // Pos.In
    { wch: 10 }, // Pos.Out
    { wch: 38 }, // ID Conversación
  ];

  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, "Conversaciones");
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

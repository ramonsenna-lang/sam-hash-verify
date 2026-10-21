/**
 * SAM HASH VERIFY — In-Memory Audit & Operations Logger
 * 100% Client-side session audit logging without external telemetry or data leakage.
 */

import { AuditLogEntry, AuditOperationType, AuditResultStatus, HashAlgorithm } from '../types';
import { formatForensicDate } from './exporter';

type AuditSubscriber = (logs: AuditLogEntry[]) => void;

class AuditLoggerService {
  private logs: AuditLogEntry[] = [];
  private subscribers: Set<AuditSubscriber> = new Set();
  private detailedMode: boolean = false;

  constructor() {
    // Initial system boot log
    const { formatted, tz } = formatForensicDate();
    this.logs = [
      {
        id: `LOG-${Date.now().toString(36).toUpperCase()}-INIT`,
        timestamp: new Date().toISOString(),
        formattedDate: formatted,
        timezone: tz,
        operation: 'SISTEMA_INICIALIZADO',
        status: 'INFO',
        message: 'SAM HASH VERIFY inicializado em memória local do navegador (WebAssembly hash-wasm ativo).',
      },
    ];
  }

  public setDetailedMode(enabled: boolean) {
    this.detailedMode = enabled;
  }

  public isDetailedMode(): boolean {
    return this.detailedMode;
  }

  public addLog(entry: {
    operation: AuditOperationType;
    status: AuditResultStatus;
    message: string;
    durationMs?: number;
    algorithm?: HashAlgorithm;
    filesCount?: number;
    details?: Record<string, unknown>;
  }): AuditLogEntry {
    const { formatted, tz } = formatForensicDate();
    const id = `LOG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Clean details to prevent accidental full file content or personal data leak
    let sanitizedDetails = entry.details;
    if (!this.detailedMode && sanitizedDetails) {
      sanitizedDetails = { ...sanitizedDetails };
      delete (sanitizedDetails as Record<string, unknown>).fileContent;
      delete (sanitizedDetails as Record<string, unknown>).absolutePath;
    }

    const logItem: AuditLogEntry = {
      id,
      timestamp: new Date().toISOString(),
      formattedDate: formatted,
      timezone: tz,
      operation: entry.operation,
      status: entry.status,
      durationMs: entry.durationMs,
      message: entry.message,
      algorithm: entry.algorithm,
      filesCount: entry.filesCount,
      details: sanitizedDetails,
    };

    // Prepend to show newest first
    this.logs.unshift(logItem);

    // Limit in-memory logs to 1000 items to prevent runaway browser memory
    if (this.logs.length > 1000) {
      this.logs.pop();
    }

    this.notifySubscribers();
    return logItem;
  }

  public getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.notifySubscribers();
  }

  public subscribe(callback: AuditSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    const current = [...this.logs];
    this.subscribers.forEach((cb) => {
      try {
        cb(current);
      } catch (err) {
        console.error('Audit subscriber error', err);
      }
    });
  }

  public exportTXT(): string {
    const { formatted, tz } = formatForensicDate();
    let txt = `================================================================================\n`;
    txt += `SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM\n`;
    txt += `LOG DE AUDITORIA DE OPERAÇÕES LOCAIS (SESSÃO EM MEMÓRIA)\n`;
    txt += `Data da Exportação: ${formatted} (${tz})\n`;
    txt += `Total de Eventos:   ${this.logs.length}\n`;
    txt += `Desenvolvido pelo APF Ramon (ramon.grsl) | Polícia Federal — XIV Cellebrite — Turma A — 2026\n`;
    txt += `NOTA TÉCNICA: Logs gerados localmente e exportáveis não constituem, isoladamente,\n`;
    txt += `uma trilha de auditoria de hardware inviolável.\n`;
    txt += `================================================================================\n\n`;

    this.logs.forEach((log, idx) => {
      txt += `[${idx + 1}] PROTOCOLO: ${log.id}\n`;
      txt += `  Data/Hora:  ${log.formattedDate} (${log.timezone})\n`;
      txt += `  Operação:   ${log.operation}\n`;
      txt += `  Status:     ${log.status}\n`;
      if (log.durationMs !== undefined) txt += `  Duração:    ${log.durationMs} ms\n`;
      if (log.algorithm) txt += `  Algoritmo:  ${log.algorithm}\n`;
      if (log.filesCount !== undefined) txt += `  Arquivos:   ${log.filesCount}\n`;
      txt += `  Mensagem:   ${log.message}\n`;
      if (log.details && Object.keys(log.details).length > 0) {
        txt += `  Detalhes:   ${JSON.stringify(log.details)}\n`;
      }
      txt += `--------------------------------------------------------------------------------\n`;
    });

    return txt;
  }

  public exportCSV(): string {
    const header = [
      'ID_Log',
      'Data_Hora',
      'Fuso_Horario',
      'Operacao',
      'Status',
      'Duracao_Ms',
      'Algoritmo',
      'Qtd_Arquivos',
      'Mensagem',
    ];

    const rows = this.logs.map((log) => [
      `"${log.id}"`,
      `"${log.formattedDate}"`,
      `"${log.timezone}"`,
      `"${log.operation}"`,
      `"${log.status}"`,
      log.durationMs !== undefined ? log.durationMs : '',
      `"${log.algorithm || ''}"`,
      log.filesCount !== undefined ? log.filesCount : '',
      `"${log.message.replace(/"/g, '""')}"`,
    ]);

    return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const auditLogger = new AuditLoggerService();

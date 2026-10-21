import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Eye,
  FileCode,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { SingleValidationRecord } from '../types';
import { exportSingleRecordPDF, exportSingleRecordTXT, downloadTextFile } from '../utils/exporter';

interface ReportsHistoryModuleProps {
  records: SingleValidationRecord[];
  onClearRecords: () => void;
}

export const ReportsHistoryModule: React.FC<ReportsHistoryModuleProps> = ({
  records,
  onClearRecords,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SingleValidationRecord | null>(null);

  const filtered = records.filter(
    (r) =>
      r.fileMetadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.calculatedHash.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.referenceHash && r.referenceHash.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportAllCSV = () => {
    if (records.length === 0) return;
    const header = [
      'Protocolo_Local',
      'Data_Hora',
      'Fuso_Horario',
      'Arquivo',
      'Tamanho_Bytes',
      'Algoritmo',
      'Hash_Referencia',
      'Hash_Calculado',
      'Status',
      'Responsavel',
      'Procedimento',
      'Evidencia',
    ];
    const rows = records.map((r) => [
      `"${r.id}"`,
      `"${r.timestamp}"`,
      `"${r.timezone}"`,
      `"${r.fileMetadata.name.replace(/"/g, '""')}"`,
      r.fileMetadata.size,
      r.algorithm,
      `"${(r.referenceHash || '').replace(/"/g, '""')}"`,
      `"${r.calculatedHash.replace(/"/g, '""')}"`,
      r.status,
      `"${(r.examinerName || '').replace(/"/g, '""')}"`,
      `"${(r.procedureNumber || '').replace(/"/g, '""')}"`,
      `"${(r.evidenceNumber || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    downloadTextFile(csv, `Historico_Sessao_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  const handleExportAllTXT = () => {
    if (records.length === 0) return;
    let txt = `================================================================================\n`;
    txt += `HASH VERIFY — HISTÓRICO CONSOLIDADO DE OPERAÇÕES DA SESSÃO\n`;
    txt += `Total de registros: ${records.length}\n`;
    txt += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `================================================================================\n\n`;

    records.forEach((r, idx) => {
      txt += `[REGISTRO #${idx + 1}] — ${r.id}\n`;
      txt += `  Data/Hora: ${r.timestamp} (${r.timezone})\n`;
      txt += `  Arquivo: ${r.fileMetadata.name} (${r.fileMetadata.size} bytes)\n`;
      txt += `  Algoritmo: ${r.algorithm}\n`;
      txt += `  Referência: ${r.referenceHash || '(Sem valor de referência)'}\n`;
      txt += `  Calculado:  ${r.calculatedHash}\n`;
      txt += `  Resultado:  ${r.status}\n`;
      if (r.procedureNumber) txt += `  Procedimento: ${r.procedureNumber}\n`;
      if (r.examinerName) txt += `  Responsável: ${r.examinerName}\n`;
      txt += `--------------------------------------------------------------------------------\n\n`;
    });

    downloadTextFile(txt, `Historico_Sessao_${Date.now()}.txt`);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#262930] pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <FileText className="w-6 h-6 text-[#F57917]" />
          Relatórios Técnicos & Histórico da Sessão
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Histórico volátil mantido estritamente em memória RAM durante a sessão ativa, sem persistência
          automática de evidências. Emita laudos periciais formais em PDF com conclusão técnica padronizada.
        </p>
      </div>

      {/* Action Bar */}
      <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por arquivo, hash ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {records.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportAllTXT}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#F57917]" />
                TXT
              </button>
              <button
                type="button"
                onClick={handleExportAllCSV}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#F57917]" />
                CSV
              </button>
              <button
                type="button"
                onClick={onClearRecords}
                className="py-1.5 px-3 rounded-lg text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Sessão
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {records.length > 0 ? (
        <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                  <th className="py-3 px-4 font-semibold">Protocolo / Data</th>
                  <th className="py-3 px-4 font-semibold">Arquivo</th>
                  <th className="py-3 px-3 font-semibold">Algoritmo</th>
                  <th className="py-3 px-4 font-semibold">Hash Calculado</th>
                  <th className="py-3 px-3 font-semibold">Resultado</th>
                  <th className="py-3 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262930]">
                {filtered.map((record) => (
                  <tr key={record.id} className="hover:bg-[#17191D]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono text-zinc-300 font-semibold">{record.id}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {record.timestamp}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">
                        {record.fileMetadata.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {(record.fileMetadata.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-[#F57917] font-semibold">
                      {record.algorithm}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-300">
                      <span className="truncate max-w-[150px] inline-block font-mono" title={record.calculatedHash}>
                        {record.calculatedHash.substring(0, 16)}...{record.calculatedHash.slice(-8)}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {record.status === 'CORRESPONDENTE' && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          CORRESPONDENTE
                        </span>
                      )}
                      {record.status === 'DIVERGENTE' && (
                        <span className="inline-flex items-center gap-1 text-red-400 font-bold font-mono text-[11px]">
                          <XCircle className="w-3.5 h-3.5" />
                          DIVERGENTE
                        </span>
                      )}
                      {record.status === 'SEM_REFERENCIA' && (
                        <span className="text-zinc-400 font-mono text-[11px]">
                          CÁLCULO PURO
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(record)}
                          className="p-1.5 rounded-lg bg-[#17191D] hover:bg-[#262930] text-zinc-300 hover:text-white"
                          title="Visualizar Detalhes"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => exportSingleRecordPDF(record)}
                          className="py-1 px-2.5 rounded-lg bg-[#F57917]/20 hover:bg-[#F57917]/30 text-[#F57917] border border-[#F57917]/40 text-xs font-semibold flex items-center gap-1"
                          title="Emitir Laudo Pericial em PDF"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Laudo PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-[#262930] bg-[#0F1115]">
          <div className="w-12 h-12 rounded-xl bg-[#17191D] flex items-center justify-center text-zinc-600 mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <div className="text-sm font-semibold text-zinc-300">
            Nenhuma operação registrada na sessão
          </div>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Ao validar ou gerar hashes nos outros módulos, os registros técnicos aparecerão nesta tabela para exportação consolidada e geração de laudos em PDF.
          </p>
        </div>
      )}

      {/* Record Inspection Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0F1115] border border-[#262930] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262930] pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-[#F57917] uppercase">
                  Detalhes do Registro Forense
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">{selectedRecord.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-zinc-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-zinc-400">
                <div>
                  <span className="text-zinc-500 block">Arquivo:</span>
                  <span className="text-white font-medium">{selectedRecord.fileMetadata.name}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Tamanho:</span>
                  <span className="text-white font-mono">{selectedRecord.fileMetadata.formattedSize}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Data e Fuso:</span>
                  <span className="text-white">{selectedRecord.timestamp} ({selectedRecord.timezone})</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Algoritmo:</span>
                  <span className="text-[#F57917] font-bold">{selectedRecord.algorithm}</span>
                </div>
              </div>

              {selectedRecord.referenceHash && (
                <div>
                  <span className="text-zinc-500 block mb-1">Hash de Referência:</span>
                  <div className="p-2.5 rounded-lg bg-[#17191D] border border-[#262930] font-mono text-[11px] text-zinc-300 break-all select-all">
                    {selectedRecord.referenceHash}
                  </div>
                </div>
              )}

              <div>
                <span className="text-zinc-500 block mb-1">Hash Calculado:</span>
                <div className="p-2.5 rounded-lg bg-[#17191D] border border-[#262930] font-mono text-[11px] text-emerald-400 break-all select-all">
                  {selectedRecord.calculatedHash}
                </div>
              </div>

              {selectedRecord.notes && (
                <div>
                  <span className="text-zinc-500 block mb-1">Observações:</span>
                  <div className="p-2.5 rounded-lg bg-[#17191D] text-zinc-300 text-xs">
                    {selectedRecord.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#262930]">
              <button
                type="button"
                onClick={() => {
                  const txt = exportSingleRecordTXT(selectedRecord);
                  navigator.clipboard.writeText(txt);
                }}
                className="py-2 px-3.5 rounded-xl bg-[#17191D] hover:bg-[#262930] text-zinc-300 text-xs font-medium"
              >
                Copiar Texto Completo
              </button>
              <button
                type="button"
                onClick={() => exportSingleRecordPDF(selectedRecord)}
                className="py-2 px-4 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                Baixar Laudo PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

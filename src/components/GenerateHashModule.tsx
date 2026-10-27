import React, { useState, useRef } from 'react';
import {
  Fingerprint,
  Upload,
  Copy,
  Check,
  FileText,
  XCircle,
  FileCode,
  Download,
  AlertCircle,
  Trash2,
  RefreshCw,
  FolderTree,
  RotateCcw,
} from 'lucide-react';
import { HashAlgorithm, SingleValidationRecord } from '../types';
import { FolderHashModule } from './FolderHashModule';
import {
  computeHashes,
  formatBytes,
  extractFileMetadata,
  generateLocalVerificationId,
} from '../utils/crypto';
import {
  exportSingleRecordPDF,
  exportSingleRecordTXT,
  downloadTextFile,
  formatForensicDate,
} from '../utils/exporter';

interface GenerateHashModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
  initialSubTab?: 'arquivos' | 'pastas';
}

interface CalculatedFileResult {
  file: File;
  id: string;
  timestamp: string;
  timezone: string;
  hashes: Record<HashAlgorithm, string>;
  selectedAlgorithms: HashAlgorithm[];
  timeTakenMs: number;
}

export const GenerateHashModule: React.FC<GenerateHashModuleProps> = ({
  onAddSessionRecord,
  initialSubTab = 'arquivos',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'arquivos' | 'pastas'>(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<HashAlgorithm[]>(['SHA-256']);

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileProcessingIndex, setCurrentFileProcessingIndex] = useState<number>(0);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [processedBytes, setProcessedBytes] = useState<number>(0);

  const [calculatedResults, setCalculatedResults] = useState<CalculatedFileResult[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAlgorithm = (algo: HashAlgorithm) => {
    if (selectedAlgorithms.includes(algo)) {
      if (selectedAlgorithms.length === 1) {
        return; // At least one algorithm required
      }
      setSelectedAlgorithms(selectedAlgorithms.filter((a) => a !== algo));
    } else {
      setSelectedAlgorithms([...selectedAlgorithms, algo]);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setErrorMessage(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    if (activeFileIndex >= selectedFiles.length - 1 && activeFileIndex > 0) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  const handleClearSelection = () => {
    if (isProcessing) {
      const confirmCancel = window.confirm(
        'Existe um processamento em andamento. Deseja cancelar a operação e limpar os dados temporários?'
      );
      if (!confirmCancel) return;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setIsProcessing(false);
    }
    setSelectedFiles([]);
    setActiveFileIndex(0);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearResults = () => {
    setCalculatedResults([]);
  };

  const clearAllFiles = handleClearSelection;

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setErrorMessage('Cálculo cancelado pelo usuário.');
    }
  };

  const handleCalculateAll = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Selecione ao menos um arquivo para realizar o cálculo.');
      return;
    }

    if (selectedAlgorithms.length === 0) {
      setErrorMessage('Selecione ao menos um algoritmo criptográfico.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    const results: CalculatedFileResult[] = [];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        if (abortController.signal.aborted) break;

        setCurrentFileProcessingIndex(i);
        setCurrentProgress(0);
        setProcessedBytes(0);

        const currentFile = selectedFiles[i];
        const startTime = performance.now();

        const computedHashes = await computeHashes(
          currentFile,
          selectedAlgorithms,
          (pct, bytes) => {
            setCurrentProgress(pct);
            setProcessedBytes(bytes);
          },
          abortController.signal
        );

        const endTime = performance.now();
        const { formatted, tz } = formatForensicDate();
        const localId = generateLocalVerificationId();

        const fileResult: CalculatedFileResult = {
          file: currentFile,
          id: localId,
          timestamp: formatted,
          timezone: tz,
          hashes: computedHashes,
          selectedAlgorithms: [...selectedAlgorithms],
          timeTakenMs: Math.round(endTime - startTime),
        };

        results.push(fileResult);

        // Add to global session history for each computed algorithm
        const meta = extractFileMetadata(currentFile);
        for (const algo of selectedAlgorithms) {
          const sessionRecord: SingleValidationRecord = {
            id: localId,
            timestamp: formatted,
            timezone: tz,
            fileMetadata: meta,
            algorithm: algo,
            referenceHash: '',
            calculatedHash: computedHashes[algo],
            status: 'SEM_REFERENCIA',
          };
          onAddSessionRecord(sessionRecord);
        }
      }

      setCalculatedResults(results);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setErrorMessage('Operação cancelada com sucesso.');
      } else {
        setErrorMessage(
          err instanceof Error
            ? `Erro de processamento: ${err.message}`
            : 'Erro desconhecido na leitura do arquivo.'
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const copyValue = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportCurrentResultPDF = (result: CalculatedFileResult, algo: HashAlgorithm) => {
    const meta = extractFileMetadata(result.file);
    exportSingleRecordPDF({
      id: result.id,
      timestamp: result.timestamp,
      timezone: result.timezone,
      fileMetadata: meta,
      algorithm: algo,
      referenceHash: '',
      calculatedHash: result.hashes[algo],
      status: 'SEM_REFERENCIA',
    });
  };

  const exportAllAsCSV = () => {
    if (calculatedResults.length === 0) return;
    const headers = ['Arquivo', 'Tamanho_Bytes', 'Tamanho_Formatado', 'Algoritmo', 'Hash_Calculado', 'Tempo_ms', 'Data_Hora'];
    const rows: string[] = [];

    for (const res of calculatedResults) {
      for (const algo of res.selectedAlgorithms) {
        rows.push(
          [
            `"${res.file.name.replace(/"/g, '""')}"`,
            res.file.size,
            `"${formatBytes(res.file.size)}"`,
            algo,
            `"${res.hashes[algo]}"`,
            res.timeTakenMs,
            `"${res.timestamp}"`,
          ].join(',')
        );
      }
    }

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    downloadTextFile(csvContent, `Hashes_Calculados_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  const exportAllAsTXT = () => {
    if (calculatedResults.length === 0) return;
    let content = `HASH VERIFY — RELATÓRIO TÉCNICO DE HASHES GERADOS\n`;
    content += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
    content += `Arquitetura: Processamento local incremental via WebAssembly\n`;
    content += `================================================================================\n\n`;

    for (const res of calculatedResults) {
      content += `ARQUIVO: ${res.file.name}\n`;
      content += `  Tamanho: ${res.file.size} bytes (${formatBytes(res.file.size)})\n`;
      content += `  Última Modificação: ${new Date(res.file.lastModified).toISOString()}\n`;
      content += `  Tempo de Cálculo: ${res.timeTakenMs} ms\n`;
      for (const algo of res.selectedAlgorithms) {
        content += `  [${algo}]: ${res.hashes[algo]}\n`;
      }
      content += `--------------------------------------------------------------------------------\n\n`;
    }

    downloadTextFile(content, `Hashes_Calculados_${Date.now()}.txt`);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#262930] pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <Fingerprint className="w-6 h-6 text-[#F57917]" />
          Gerador de Hashes Criptográficos
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Calcule as impressões digitais de um ou múltiplos arquivos simultaneamente nos algoritmos MD5,
          SHA-1, SHA-256 e SHA-512. Streaming em blocos sem risco de estouro de memória para arquivos gigabytes.
        </p>
      </div>

      {/* Sub-tab Switcher: Arquivos vs Pastas */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0F1115] border border-[#262930] w-max">
        <button
          type="button"
          onClick={() => setActiveSubTab('arquivos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'arquivos'
              ? 'bg-[#17191D] text-white border border-[#363B47] shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Fingerprint className={`w-4 h-4 ${activeSubTab === 'arquivos' ? 'text-[#F57917]' : 'text-zinc-500'}`} />
          <span>Hash de Arquivos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('pastas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'pastas'
              ? 'bg-[#17191D] text-white border border-[#363B47] shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FolderTree className={`w-4 h-4 ${activeSubTab === 'pastas' ? 'text-[#F57917]' : 'text-zinc-500'}`} />
          <span>Hash de Pastas e Subpastas</span>
        </button>
      </div>

      {activeSubTab === 'pastas' ? (
        <FolderHashModule onAddSessionRecord={onAddSessionRecord} />
      ) : (
        <>
          {/* Algorithm Selector bar */}
      <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-semibold uppercase text-zinc-300 block">
            Algoritmos a Calcular Simultaneamente:
          </span>
          <span className="text-[11px] text-zinc-500">
            SHA-256 é o padrão forense recomendado para garantia de integridade.
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as HashAlgorithm[]).map((algo) => {
            const isSelected = selectedAlgorithms.includes(algo);
            return (
              <button
                key={algo}
                type="button"
                onClick={() => toggleAlgorithm(algo)}
                className={`py-1.5 px-3.5 rounded-lg text-xs font-mono font-medium transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-[#F57917] text-white border-[#F57917] shadow-sm'
                    : 'bg-[#17191D] text-zinc-400 border-[#262930] hover:text-white'
                }`}
              >
                {algo}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFilesSelected(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="p-8 rounded-2xl border-2 border-dashed border-[#262930] hover:border-[#F57917]/70 bg-[#17191D]/50 hover:bg-[#17191D] transition-all cursor-pointer flex flex-col items-center justify-center text-center group"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <div className="w-14 h-14 rounded-2xl bg-[#262930] flex items-center justify-center text-[#F57917] mb-3 group-hover:scale-105 transition-transform">
          <Upload className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-semibold text-white">
            Clique para selecionar ou arraste arquivos aqui
          </span>
          <p className="text-xs text-zinc-400">
            Suporta múltiplos arquivos de qualquer tamanho (.ufdr, .zip, .bin, .img, .pdf, .e01, etc.)
          </p>
        </div>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3 p-4 rounded-xl bg-[#0F1115] border border-[#262930]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Arquivos na Fila ({selectedFiles.length})
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="px-2.5 py-1 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] text-zinc-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Limpar arquivos da fila de seleção"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>LIMPAR SELEÇÃO</span>
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {selectedFiles.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCode className="w-4 h-4 text-[#F57917] shrink-0" />
                  <span className="truncate max-w-[280px] sm:max-w-md font-medium text-white">
                    {f.name}
                  </span>
                  <span className="text-zinc-500 font-mono text-[11px] shrink-0">
                    ({(f.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Execution Controls */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            {isProcessing ? (
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-mono flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                    Processando arquivo {currentFileProcessingIndex + 1} de {selectedFiles.length}:{' '}
                    <strong className="text-white truncate max-w-xs">
                      {selectedFiles[currentFileProcessingIndex]?.name}
                    </strong>
                  </span>
                  <span className="text-white font-mono font-bold">{currentProgress}%</span>
                </div>
                <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F57917] h-full transition-all duration-150"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {(processedBytes / (1024 * 1024)).toFixed(1)} MB /{' '}
                    {(selectedFiles[currentFileProcessingIndex]?.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="text-red-400 hover:text-red-300 font-medium"
                  >
                    Cancelar Operação
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCalculateAll}
                className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <Fingerprint className="w-4 h-4" />
                CALCULAR HASHES DE TODOS OS ARQUIVOS
              </button>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Calculation Results Display */}
      {calculatedResults.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#262930] pb-3">
            <div>
              <h2 className="text-sm font-mono font-bold uppercase text-white flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Hashes Calculados com Sucesso ({calculatedResults.length} arquivo(s))
              </h2>
              <span className="text-[11px] text-zinc-400">
                Todos os valores apresentados foram calculados em tempo real sobre a totalidade dos bytes.
              </span>
            </div>

            {/* Export Buttons & Clear Results */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearResults}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-400 hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Limpar hashes calculados preservando a seleção"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>LIMPAR RESULTADOS</span>
              </button>
              <button
                type="button"
                onClick={exportAllAsTXT}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#F57917]" />
                TXT
              </button>
              <button
                type="button"
                onClick={exportAllAsCSV}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#F57917]" />
                CSV
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {calculatedResults.map((result, idx) => {
              const meta = extractFileMetadata(result.file);
              return (
                <div
                  key={result.id}
                  className="p-5 rounded-2xl bg-[#0F1115] border border-[#262930] space-y-4 shadow-sm"
                >
                  {/* File Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#262930] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-[#F57917]" />
                        <span className="font-bold text-white text-sm break-all">
                          {result.file.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {meta.formattedSize} • Modificado em: {new Date(result.file.lastModified).toLocaleString('pt-BR')} • {result.timeTakenMs} ms
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 bg-[#17191D] px-2 py-1 rounded border border-[#262930]">
                      {result.id}
                    </span>
                  </div>

                  {/* Calculated Hashes Table */}
                  <div className="space-y-2.5">
                    {result.selectedAlgorithms.map((algo) => {
                      const hashVal = result.hashes[algo];
                      const copyId = `${result.id}-${algo}`;
                      return (
                        <div
                          key={algo}
                          className="p-3 rounded-xl bg-[#17191D] border border-[#262930] space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold font-mono text-[#F57917]">{algo}</span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => copyValue(hashVal, copyId)}
                                className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] cursor-pointer"
                              >
                                {copiedKey === copyId ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                {copiedKey === copyId ? 'Copiado!' : 'Copiar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => exportCurrentResultPDF(result, algo)}
                                className="text-zinc-400 hover:text-[#F57917] flex items-center gap-1 text-[11px] cursor-pointer"
                              >
                                <FileText className="w-3 h-3" />
                                PDF
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[11px] text-zinc-200 break-all select-all pt-0.5 leading-relaxed">
                            {hashVal}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          )}
        </>
      )}
    </div>
  );
};

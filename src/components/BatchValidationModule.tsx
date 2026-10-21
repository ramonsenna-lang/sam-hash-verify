import React, { useState, useRef } from 'react';
import {
  Layers,
  Upload,
  FolderOpen,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Download,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import { BatchItem, HashAlgorithm, ValidationStatus, SingleValidationRecord } from '../types';
import {
  computeHashes,
  compareHashes,
  parseHashManifest,
  formatBytes,
  formatShortBytes,
  generateLocalVerificationId,
  extractFileMetadata,
} from '../utils/crypto';
import { exportBatchCSV, downloadTextFile, formatForensicDate } from '../utils/exporter';

interface BatchValidationModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
}

export const BatchValidationModule: React.FC<BatchValidationModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [manifestText, setManifestText] = useState<string>('');
  const [showManifestInput, setShowManifestInput] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState<number>(0);

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const manifestFileInputRef = useRef<HTMLInputElement>(null);

  // Add physical files to batch
  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setBatchItems((prev) => {
      const updated = [...prev];

      for (const f of files) {
        const relPath = (f as { webkitRelativePath?: string }).webkitRelativePath || f.name;

        // Check if an entry already exists for this exact relative path or name
        const existingIdx = updated.findIndex(
          (item) => (item.relativePath || item.fileName) === relPath
        );

        if (existingIdx >= 0) {
          // If it was created from manifest with ARQUIVO NAO LOCALIZADO, attach the file
          updated[existingIdx] = {
            ...updated[existingIdx],
            file: f,
            fileSize: f.size,
            formattedSize: formatShortBytes(f.size),
            status: updated[existingIdx].expectedHash ? 'PENDENTE' : 'SEM_REFERENCIA',
          };
        } else {
          // New file
          updated.push({
            id: generateLocalVerificationId(),
            fileName: f.name,
            file: f,
            relativePath: relPath,
            fileSize: f.size,
            formattedSize: formatShortBytes(f.size),
            algorithm: 'SHA-256',
            status: 'SEM_REFERENCIA',
            progress: 0,
          });
        }
      }

      return updated;
    });

    setStatusMessage(`${files.length} arquivo(s) carregado(s) para o lote.`);
  };

  // Import manifest text or file
  const handleApplyManifest = (content: string) => {
    if (!content.trim()) return;

    const entries = parseHashManifest(content);
    if (entries.length === 0) {
      setStatusMessage('Nenhum formato de hash reconhecido no manifesto.');
      return;
    }

    setBatchItems((prev) => {
      const updated = [...prev];

      for (const entry of entries) {
        // Try matching against existing files by exact relative path or filename
        const existingIdx = updated.findIndex(
          (item) =>
            item.fileName.toLowerCase() === entry.fileName.toLowerCase() ||
            (item.relativePath && item.relativePath.toLowerCase() === entry.fileName.toLowerCase())
        );

        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            algorithm: entry.algorithm,
            expectedHash: entry.expectedHash,
            status: 'PENDENTE',
          };
        } else {
          // File not yet loaded
          updated.push({
            id: generateLocalVerificationId(),
            fileName: entry.fileName,
            relativePath: entry.fileName,
            algorithm: entry.algorithm,
            expectedHash: entry.expectedHash,
            status: 'NAO_LOCALIZADO',
            progress: 0,
          });
        }
      }

      return updated;
    });

    setShowManifestInput(false);
    setStatusMessage(`${entries.length} registro(s) importado(s) do manifesto com sucesso.`);
  };

  const handleManifestFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setManifestText(reader.result);
          handleApplyManifest(reader.result);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setStatusMessage('Processamento do lote cancelado.');
    }
  };

  const handleProcessBatch = async () => {
    const processable = batchItems.filter((i) => i.file && i.status !== 'CORRESPONDENTE');
    if (processable.length === 0) {
      setStatusMessage('Nenhum arquivo pendente de processamento.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const { formatted, tz } = formatForensicDate();

    try {
      for (let i = 0; i < batchItems.length; i++) {
        if (abortController.signal.aborted) break;

        const currentItem = batchItems[i];
        if (!currentItem.file || currentItem.status === 'CORRESPONDENTE') {
          continue;
        }

        setCurrentProcessingId(currentItem.id);

        try {
          const computedMap = await computeHashes(
            currentItem.file,
            [currentItem.algorithm],
            (pct) => {
              setBatchItems((prev) =>
                prev.map((item) =>
                  item.id === currentItem.id ? { ...item, progress: pct } : item
                )
              );
            },
            abortController.signal
          );

          const calculated = computedMap[currentItem.algorithm];
          let status: ValidationStatus = 'SEM_REFERENCIA';

          if (currentItem.expectedHash) {
            const comp = compareHashes(currentItem.expectedHash, calculated);
            status = comp.isMatch ? 'CORRESPONDENTE' : 'DIVERGENTE';
          }

          setBatchItems((prev) =>
            prev.map((item) =>
              item.id === currentItem.id
                ? {
                    ...item,
                    calculatedHash: calculated,
                    status,
                    progress: 100,
                  }
                : item
            )
          );

          // Add to session records
          const meta = extractFileMetadata(currentItem.file, currentItem.relativePath);
          onAddSessionRecord({
            id: currentItem.id,
            timestamp: formatted,
            timezone: tz,
            fileMetadata: meta,
            algorithm: currentItem.algorithm,
            referenceHash: currentItem.expectedHash || '',
            calculatedHash: calculated,
            status,
          });
        } catch (itemErr: unknown) {
          if ((itemErr as Error)?.name === 'AbortError') throw itemErr;
          setBatchItems((prev) =>
            prev.map((item) =>
              item.id === currentItem.id
                ? {
                    ...item,
                    status: 'ERRO',
                    errorMessage: itemErr instanceof Error ? itemErr.message : 'Falha na leitura',
                  }
                : item
            )
          );
        }

        setOverallProgress(Math.round(((i + 1) / batchItems.length) * 100));
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('Operação interrompida pelo usuário.');
      }
    } finally {
      setIsProcessing(false);
      setCurrentProcessingId(null);
      abortControllerRef.current = null;
    }
  };

  const handleExportCSV = () => {
    if (batchItems.length === 0) return;
    const csv = exportBatchCSV(batchItems);
    downloadTextFile(csv, `Validacao_Lote_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  // Filtered items
  const filteredItems = batchItems.filter((item) => {
    const matchesFilter =
      filterStatus === 'ALL' ||
      item.status === filterStatus ||
      (filterStatus === 'PENDING' && (item.status === 'PENDENTE' || item.status === 'SEM_REFERENCIA'));

    const matchesSearch =
      !searchTerm ||
      item.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.expectedHash && item.expectedHash.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.calculatedHash && item.calculatedHash.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Summary counts
  const totalCount = batchItems.length;
  const matchCount = batchItems.filter((i) => i.status === 'CORRESPONDENTE').length;
  const mismatchCount = batchItems.filter((i) => i.status === 'DIVERGENTE').length;
  const missingCount = batchItems.filter((i) => i.status === 'NAO_LOCALIZADO').length;
  const noRefCount = batchItems.filter((i) => i.status === 'SEM_REFERENCIA').length;
  const completedCount = matchCount + mismatchCount + noRefCount;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#262930] pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <Layers className="w-6 h-6 text-[#F57917]" />
          Validação em Lote & Importação de Manifestos
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Conferência em escala para extrações complexas contendo múltiplos arquivos e diretórios.
          Importe arquivos de manifesto (.txt, .csv, md5sum, sha256sum) e associe aos arquivos correspondentes.
        </p>
      </div>

      {/* Action Strip: Add Files / Folder / Manifest */}
      <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* File Selection */}
          <input
            ref={filesInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesAdded(e.target.files)}
          />
          <button
            type="button"
            onClick={() => filesInputRef.current?.click()}
            className="py-2 px-3.5 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#F57917]" />
            Adicionar Arquivos
          </button>

          {/* Directory Selection (webkitdirectory) */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is standard in Chromium/Firefox/Safari
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => handleFilesAdded(e.target.files)}
          />
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="py-2 px-3.5 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-[#F57917]" />
            Adicionar Pasta Inteira
          </button>

          {/* Manifest upload */}
          <input
            ref={manifestFileInputRef}
            type="file"
            accept=".txt,.csv,.md5,.sha1,.sha256"
            className="hidden"
            onChange={handleManifestFileUpload}
          />
          <button
            type="button"
            onClick={() => manifestFileInputRef.current?.click()}
            className="py-2 px-3.5 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#F57917]" />
            Carregar Manifesto (.csv / .txt)
          </button>

          <button
            type="button"
            onClick={() => setShowManifestInput(!showManifestInput)}
            className="py-2 px-3 rounded-lg bg-transparent hover:bg-[#17191D] text-zinc-400 hover:text-white text-xs font-medium transition-colors"
          >
            {showManifestInput ? 'Ocultar Caixa de Texto' : 'Colar Texto de Manifesto'}
          </button>
        </div>

        {batchItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="py-2 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#F57917]" />
              Exportar CSV
            </button>

            <button
              type="button"
              onClick={() => {
                setBatchItems([]);
                setStatusMessage(null);
              }}
              className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1"
            >
              Limpar Lista
            </button>
          </div>
        )}
      </div>

      {/* Manifest Textarea Section */}
      {showManifestInput && (
        <div className="p-4 rounded-xl bg-[#131519] border border-[#262930] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Colar Lista ou Manifesto de Hashes
            </span>
            <span className="text-[11px] text-zinc-500">
              Aceita CSV, sha256sum, md5sum ou BSD style
            </span>
          </div>
          <textarea
            rows={4}
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            placeholder={`Exemplos aceitos:\nSHA256,ARQUIVO\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855,extracao01.ufdr\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *extracao02.zip`}
            className="w-full p-3 rounded-lg bg-[#0F1115] border border-[#262930] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917] resize-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleApplyManifest(manifestText)}
              disabled={!manifestText.trim()}
              className="py-1.5 px-4 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Aplicar ao Lote
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#F57917] shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      {batchItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-[#262930]">
            <span className="text-[11px] font-mono text-zinc-500 block uppercase">Total Itens</span>
            <span className="text-xl font-bold font-mono text-white tabular-nums">{totalCount}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-emerald-950/60">
            <span className="text-[11px] font-mono text-emerald-500 block uppercase">Correspondentes</span>
            <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">{matchCount}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-red-950/60">
            <span className="text-[11px] font-mono text-red-500 block uppercase">Divergentes</span>
            <span className="text-xl font-bold font-mono text-red-400 tabular-nums">{mismatchCount}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-yellow-950/60">
            <span className="text-[11px] font-mono text-yellow-500 block uppercase">Não Localizados</span>
            <span className="text-xl font-bold font-mono text-yellow-400 tabular-nums">{missingCount}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-[#262930]">
            <span className="text-[11px] font-mono text-zinc-500 block uppercase">Sem Referência</span>
            <span className="text-xl font-bold font-mono text-zinc-300 tabular-nums">{noRefCount}</span>
          </div>
        </div>
      )}

      {/* Batch Processing Execution Bar */}
      {batchItems.length > 0 && (
        <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] flex flex-col sm:flex-row items-center justify-between gap-4">
          {isProcessing ? (
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                  Processando lote de evidências...
                </span>
                <span className="text-white font-bold">{overallProgress}%</span>
              </div>
              <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#F57917] h-full transition-all duration-150"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Interromper Lote
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-400">
                Pronto para conferência de {batchItems.filter((i) => i.file).length} arquivo(s) carregado(s).
              </div>
              <button
                type="button"
                onClick={handleProcessBatch}
                className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <Layers className="w-4 h-4" />
                PROCESSAR E VALIDAR LOTE
              </button>
            </>
          )}
        </div>
      )}

      {/* Table & Filtering */}
      {batchItems.length > 0 ? (
        <div className="space-y-3">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-lg border border-[#262930] overflow-x-auto max-w-full">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'CORRESPONDENTE', label: 'Correspondentes' },
                { id: 'DIVERGENTE', label: 'Divergentes' },
                { id: 'NAO_LOCALIZADO', label: 'Não Localizados' },
                { id: 'PENDING', label: 'Pendentes' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id)}
                  className={`py-1 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    filterStatus === tab.id
                      ? 'bg-[#F57917] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar por nome ou hash..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917]"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                    <th className="py-3 px-4 font-semibold">Arquivo / Caminho</th>
                    <th className="py-3 px-3 font-semibold">Tamanho</th>
                    <th className="py-3 px-3 font-semibold">Algoritmo</th>
                    <th className="py-3 px-4 font-semibold">Hash Esperado</th>
                    <th className="py-3 px-4 font-semibold">Hash Calculado</th>
                    <th className="py-3 px-4 font-semibold text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262930]">
                  {filteredItems.map((item) => {
                    const isProcessingThis = currentProcessingId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-[#17191D]/60 transition-colors ${
                          isProcessingThis ? 'bg-[#17191D]/80' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-white truncate max-w-[220px] sm:max-w-xs">
                            {item.fileName}
                          </div>
                          {item.relativePath && item.relativePath !== item.fileName && (
                            <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[220px]">
                              {item.relativePath}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono text-zinc-400 whitespace-nowrap">
                          {item.fileSize !== undefined ? formatShortBytes(item.fileSize) : '—'}
                        </td>

                        <td className="py-3 px-3 font-mono text-[#F57917] font-semibold">
                          {item.algorithm}
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                          {item.expectedHash ? (
                            <span className="truncate max-w-[150px] inline-block font-mono" title={item.expectedHash}>
                              {item.expectedHash.substring(0, 16)}...{item.expectedHash.slice(-8)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px]">
                          {isProcessingThis ? (
                            <div className="flex items-center gap-1.5 text-[#F57917]">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>{item.progress}%</span>
                            </div>
                          ) : item.calculatedHash ? (
                            <span
                              className="truncate max-w-[150px] inline-block font-mono text-zinc-200"
                              title={item.calculatedHash}
                            >
                              {item.calculatedHash.substring(0, 16)}...{item.calculatedHash.slice(-8)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {item.status === 'CORRESPONDENTE' && (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              CORRESPONDENTE
                            </span>
                          )}
                          {item.status === 'DIVERGENTE' && (
                            <span className="inline-flex items-center gap-1 text-red-400 font-bold font-mono text-[11px]">
                              <XCircle className="w-3.5 h-3.5" />
                              DIVERGENTE
                            </span>
                          )}
                          {item.status === 'NAO_LOCALIZADO' && (
                            <span className="inline-flex items-center gap-1 text-yellow-400 font-medium font-mono text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              NÃO LOCALIZADO
                            </span>
                          )}
                          {item.status === 'SEM_REFERENCIA' && (
                            <span className="text-zinc-400 font-mono text-[11px]">
                              SEM REFERÊNCIA
                            </span>
                          )}
                          {item.status === 'PENDENTE' && (
                            <span className="text-zinc-500 font-mono text-[11px]">
                              PENDENTE
                            </span>
                          )}
                          {item.status === 'ERRO' && (
                            <span className="text-red-400 font-mono text-[11px]" title={item.errorMessage}>
                              ERRO
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-[#262930] bg-[#0F1115]">
          <div className="w-12 h-12 rounded-xl bg-[#17191D] flex items-center justify-center text-zinc-600 mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div className="text-sm font-semibold text-zinc-300">
            Nenhum lote carregado
          </div>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Adicione uma pasta completa ou selecione vários arquivos para iniciar a validação automatizada em massa.
          </p>
        </div>
      )}
    </div>
  );
};

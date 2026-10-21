import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderTree,
  FolderOpen,
  Folder,
  Upload,
  Play,
  Pause,
  Square,
  RotateCcw,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Copy,
  Check,
  Clock,
  HardDrive,
  ShieldCheck,
  FileCode,
  Lock,
  RefreshCw,
  File as FileIcon,
  HelpCircle,
  ArrowUpDown,
  Share2,
} from 'lucide-react';
import {
  HashAlgorithm,
  FolderFileItem,
  FolderItemStatus,
  SingleValidationRecord,
} from '../types';
import {
  computeHashes,
  formatBytes,
  formatShortBytes,
} from '../utils/crypto';
import {
  exportFolderHashReportPDF,
  exportFolderManifestCSV,
  exportFolderManifestTXT,
  exportFolderManifestJSON,
  downloadTextFile,
  formatForensicDate,
  FolderHashReportData,
} from '../utils/exporter';

interface FolderHashModuleProps {
  onAddSessionRecord?: (record: SingleValidationRecord) => void;
}

export const FolderHashModule: React.FC<FolderHashModuleProps> = ({
  onAddSessionRecord,
}) => {
  // Directory & Items state
  const [folderName, setFolderName] = useState<string>('');
  const [items, setItems] = useState<FolderFileItem[]>([]);
  const [isReadingFolder, setIsReadingFolder] = useState<boolean>(false);
  const [folderReadError, setFolderReadError] = useState<string | null>(null);

  // Algorithm selection
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<HashAlgorithm[]>(['SHA-256']);
  const [primaryAlgorithm, setPrimaryAlgorithm] = useState<HashAlgorithm>('SHA-256');

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Real-time progress state
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [currentFileProgress, setCurrentFileProgress] = useState<number>(0);
  const [processedBytes, setProcessedBytes] = useState<number>(0);
  const [totalBytesToProcess, setTotalBytesToProcess] = useState<number>(0);
  const [bytesPerSecond, setBytesPerSecond] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Forensic Metadata Form
  const [procedureNumber, setProcedureNumber] = useState<string>('');
  const [evidenceNumber, setEvidenceNumber] = useState<string>('');
  const [examinerName, setExaminerName] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  const [showMetadataForm, setShowMetadataForm] = useState<boolean>(false);

  // Search, Filter & Sort
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CALCULADO' | 'PENDENTE' | 'ERRO'>('ALL');
  const [extensionFilter, setExtensionFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'seq' | 'name' | 'path' | 'size'>('seq');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionAddedNotice, setSessionAddedNotice] = useState<boolean>(false);

  // Refs for pause/cancel and directory input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pauseRef = useRef<boolean>(false);
  const cancelRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Elapsed time tracker
  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, isPaused]);

  // Keep pauseRef synchronized
  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

  // Available extensions in current folder
  const availableExtensions = useMemo(() => {
    const extSet = new Set<string>();
    items.forEach((item) => {
      if (item.extension) {
        extSet.add(item.extension.toLowerCase());
      } else {
        extSet.add('(sem extensão)');
      }
    });
    return Array.from(extSet).sort();
  }, [items]);

  // Total subfolders count
  const totalSubfoldersCount = useMemo(() => {
    const folderSet = new Set<string>();
    items.forEach((item) => {
      const parts = item.relativePath.split('/');
      if (parts.length > 1) {
        // Remove file name to get dir path
        parts.pop();
        folderSet.add(parts.join('/'));
      }
    });
    return folderSet.size;
  }, [items]);

  // Summary counts
  const summary = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === 'CALCULADO').length;
    const errors = items.filter((i) => i.status === 'ERRO').length;
    const pending = items.filter((i) => i.status === 'PENDENTE').length;
    const totalBytes = items.reduce((acc, curr) => acc + curr.size, 0);

    return { total, completed, errors, pending, totalBytes };
  }, [items]);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.fileName.toLowerCase().includes(q) ||
          i.relativePath.toLowerCase().includes(q) ||
          (i.hashes[primaryAlgorithm] && i.hashes[primaryAlgorithm]!.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'ALL') {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (extensionFilter !== 'ALL') {
      if (extensionFilter === '(sem extensão)') {
        result = result.filter((i) => !i.extension);
      } else {
        result = result.filter((i) => i.extension.toLowerCase() === extensionFilter.toLowerCase());
      }
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'seq') cmp = a.seq - b.seq;
      else if (sortField === 'name') cmp = a.fileName.localeCompare(b.fileName);
      else if (sortField === 'path') cmp = a.relativePath.localeCompare(b.relativePath);
      else if (sortField === 'size') cmp = a.size - b.size;

      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, statusFilter, extensionFilter, sortField, sortDirection, primaryAlgorithm]);

  // Handle standard input change with webkitdirectory
  const handleDirectoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    processFileList(Array.from(files));
    // Reset file input value so user can re-select the same directory if wanted
    e.target.value = '';
  };

  // Convert File list to FolderFileItems
  const processFileList = (files: File[]) => {
    setIsReadingFolder(true);
    setFolderReadError(null);
    setIsRunning(false);
    setIsPaused(false);
    setIsFinished(false);
    setCurrentIndex(-1);
    setCurrentFileProgress(0);
    setProcessedBytes(0);
    setElapsedSeconds(0);
    setSessionAddedNotice(false);

    try {
      if (files.length === 0) {
        setFolderReadError('A pasta selecionada não contém arquivos válidos.');
        setIsReadingFolder(false);
        return;
      }

      // Determine root folder name from relative path or first file
      let detectedRoot = '';
      const samplePath = files[0].webkitRelativePath;
      if (samplePath && samplePath.includes('/')) {
        detectedRoot = samplePath.split('/')[0];
      } else {
        detectedRoot = 'Diretório Selecionado';
      }
      setFolderName(detectedRoot);

      let totalBytesSum = 0;
      const parsedItems: FolderFileItem[] = files.map((file, idx) => {
        totalBytesSum += file.size;
        const relativePath = file.webkitRelativePath || file.name;
        const nameParts = file.name.split('.');
        const extension = nameParts.length > 1 ? `.${nameParts[nameParts.length - 1]}` : '';

        return {
          id: `fitem-${idx + 1}-${Date.now()}`,
          seq: idx + 1,
          fileName: file.name,
          relativePath,
          extension,
          size: file.size,
          formattedSize: formatShortBytes(file.size),
          file,
          algorithm: primaryAlgorithm,
          hashes: {},
          status: 'PENDENTE',
        };
      });

      setItems(parsedItems);
      setTotalBytesToProcess(totalBytesSum);
    } catch (err: unknown) {
      setFolderReadError(`Erro ao catalogar diretório: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsReadingFolder(false);
    }
  };

  // Alternative Directory Access via File System Access API (when available)
  const handlePickDirectoryFSA = async () => {
    if (!('showDirectoryPicker' in window)) {
      // Fallback to standard input
      fileInputRef.current?.click();
      return;
    }

    try {
      setIsReadingFolder(true);
      setFolderReadError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });

      const collectedFiles: File[] = [];

      // Recursive scan helper
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scanDir = async (handle: any, currentPath: string) => {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            // Attach webkitRelativePath property for compatibility
            Object.defineProperty(file, 'webkitRelativePath', {
              value: `${currentPath}/${file.name}`,
              writable: false,
            });
            collectedFiles.push(file);
          } else if (entry.kind === 'directory') {
            await scanDir(entry, `${currentPath}/${entry.name}`);
          }
        }
      };

      await scanDir(dirHandle, dirHandle.name);
      processFileList(collectedFiles);
    } catch (err: unknown) {
      // User cancelled picker or error
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled, do nothing
      } else {
        setFolderReadError(`Não foi possível acessar a pasta via File System API: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setIsReadingFolder(false);
    }
  };

  // Algorithm Toggle
  const handleToggleAlgorithm = (algo: HashAlgorithm) => {
    if (isRunning) return;
    setSelectedAlgorithms((prev) => {
      let next: HashAlgorithm[];
      if (prev.includes(algo)) {
        if (prev.length === 1) return prev; // Keep at least one
        next = prev.filter((a) => a !== algo);
      } else {
        next = [...prev, algo];
      }
      if (!next.includes(primaryAlgorithm)) {
        setPrimaryAlgorithm(next[0]);
      }
      return next;
    });
  };

  // Switch Primary Algorithm
  const handleSetPrimaryAlgorithm = (algo: HashAlgorithm) => {
    if (!selectedAlgorithms.includes(algo)) {
      setSelectedAlgorithms((prev) => [...prev, algo]);
    }
    setPrimaryAlgorithm(algo);
  };

  // Start / Resume Calculation
  const handleStartCalculation = async () => {
    if (items.length === 0 || isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    setIsFinished(false);
    pauseRef.current = false;
    cancelRef.current = false;

    const startTimestamp = Date.now();
    setStartTime(startTimestamp);

    let processedAccumulator = 0;
    // Calculate already processed bytes if resuming
    items.forEach((it) => {
      if (it.status === 'CALCULADO') {
        processedAccumulator += it.size;
      }
    });

    const totalToProcess = summary.totalBytes;
    setTotalBytesToProcess(totalToProcess);

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;

      // Handle pause loop
      while (pauseRef.current) {
        if (cancelRef.current) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (cancelRef.current) break;

      const currentItem = items[i];
      // Skip already calculated items unless empty
      if (currentItem.status === 'CALCULADO' && Object.keys(currentItem.hashes).length > 0) {
        continue;
      }

      setCurrentIndex(i);
      setCurrentFileProgress(0);

      // Mark as calculating
      setItems((prev) => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: 'PENDENTE' };
        return copy;
      });

      const fileStartTime = performance.now();

      try {
        let lastReportedBytes = 0;
        const hashes = await computeHashes(
          currentItem.file,
          selectedAlgorithms,
          (progress, bytesDone) => {
            setCurrentFileProgress(progress);
            const deltaBytes = bytesDone - lastReportedBytes;
            if (deltaBytes > 0) {
              processedAccumulator += deltaBytes;
              lastReportedBytes = bytesDone;
              setProcessedBytes(processedAccumulator);

              // Calculate throughput
              const elapsedTotalSec = (Date.now() - startTimestamp) / 1000;
              if (elapsedTotalSec > 0.5) {
                setBytesPerSecond(processedAccumulator / elapsedTotalSec);
              }
            }
          }
        );

        const fileEndTime = performance.now();

        // Update item state
        setItems((prev) => {
          const copy = [...prev];
          copy[i] = {
            ...copy[i],
            hashes,
            status: 'CALCULADO',
            timeTakenMs: Math.round(fileEndTime - fileStartTime),
            errorMessage: undefined,
          };
          return copy;
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          break;
        }

        setItems((prev) => {
          const copy = [...prev];
          copy[i] = {
            ...copy[i],
            status: 'ERRO',
            errorMessage: err instanceof Error ? err.message : String(err),
          };
          return copy;
        });
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setCurrentFileProgress(100);
    if (!cancelRef.current) {
      setIsFinished(true);
    }
  };

  // Pause
  const handlePause = () => {
    setIsPaused(true);
    pauseRef.current = true;
  };

  // Resume
  const handleResume = () => {
    setIsPaused(false);
    pauseRef.current = false;
  };

  // Cancel
  const handleCancel = () => {
    cancelRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
  };

  // Reset / Clear
  const handleReset = () => {
    if (isRunning) {
      handleCancel();
    }
    setItems([]);
    setFolderName('');
    setIsReadingFolder(false);
    setFolderReadError(null);
    setIsRunning(false);
    setIsPaused(false);
    setIsFinished(false);
    setCurrentIndex(-1);
    setCurrentFileProgress(0);
    setProcessedBytes(0);
    setTotalBytesToProcess(0);
    setElapsedSeconds(0);
    setBytesPerSecond(0);
    setSessionAddedNotice(false);
  };

  // Copy hash helper
  const handleCopyHash = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Sort toggle helper
  const handleToggleSort = (field: 'seq' | 'name' | 'path' | 'size') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Build report data object
  const buildReportData = (): FolderHashReportData => {
    const { formatted, tz } = formatForensicDate();
    const protocolId = `DIR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    return {
      id: protocolId,
      folderName: folderName || 'Diretório Raiz',
      totalFiles: items.length,
      totalSubfolders: totalSubfoldersCount,
      totalBytes: summary.totalBytes,
      formattedTotalBytes: formatBytes(summary.totalBytes),
      algorithms: selectedAlgorithms,
      timestamp: formatted,
      timezone: tz,
      examinerName: examinerName.trim() || undefined,
      procedureNumber: procedureNumber.trim() || undefined,
      evidenceNumber: evidenceNumber.trim() || undefined,
      items,
    };
  };

  // Export PDF
  const handleExportPDF = () => {
    if (items.length === 0) return;
    const data = buildReportData();
    exportFolderHashReportPDF(data);
  };

  // Export TXT
  const handleExportTXT = () => {
    if (items.length === 0) return;
    const data = buildReportData();
    const content = exportFolderManifestTXT(data);
    const safeName = (folderName || 'manifesto_pasta').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadTextFile(content, `Manifesto_${safeName}_${primaryAlgorithm.toLowerCase()}.txt`);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (items.length === 0) return;
    const data = buildReportData();
    const content = exportFolderManifestCSV(data);
    const safeName = (folderName || 'hashes_pasta').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadTextFile(content, `Hashes_${safeName}.csv`, 'text/csv;charset=utf-8');
  };

  // Export JSON
  const handleExportJSON = () => {
    if (items.length === 0) return;
    const data = buildReportData();
    const content = exportFolderManifestJSON(data);
    const safeName = (folderName || 'manifesto_pasta').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadTextFile(content, `Manifesto_${safeName}.json`, 'application/json;charset=utf-8');
  };

  // Add all completed items to session records
  const handleAddAllToSession = () => {
    if (!onAddSessionRecord || items.length === 0) return;
    const { formatted, tz } = formatForensicDate();

    items.forEach((item) => {
      if (item.status === 'CALCULADO') {
        const calculatedHash = item.hashes[primaryAlgorithm] || '';
        const rec: SingleValidationRecord = {
          id: `REC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          timestamp: formatted,
          timezone: tz,
          fileMetadata: {
            name: item.fileName,
            size: item.size,
            type: item.file.type || 'application/octet-stream',
            lastModified: item.file.lastModified,
            formattedSize: item.formattedSize,
            relativePath: item.relativePath,
          },
          algorithm: primaryAlgorithm,
          referenceHash: '',
          calculatedHash,
          status: 'SEM_REFERENCIA',
          examinerName: examinerName.trim() || undefined,
          procedureNumber: procedureNumber.trim() || undefined,
          evidenceNumber: evidenceNumber.trim() || undefined,
          toolName: 'SAM HASH VERIFY — Hash de Pastas',
          notes: `Extraído da pasta "${folderName}" (${item.relativePath})`,
        };
        onAddSessionRecord(rec);
      }
    });

    setSessionAddedNotice(true);
    setTimeout(() => setSessionAddedNotice(false), 3000);
  };

  // Format seconds to mm:ss
  const formatTime = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Overall progress percentage
  const overallPercentage =
    totalBytesToProcess > 0
      ? Math.min(100, Math.round((processedBytes / totalBytesToProcess) * 100))
      : summary.total > 0
      ? Math.round((summary.completed / summary.total) * 100)
      : 0;

  // Estimated time remaining (ETA)
  const etaSeconds =
    bytesPerSecond > 0 && totalBytesToProcess > processedBytes
      ? Math.round((totalBytesToProcess - processedBytes) / bytesPerSecond)
      : null;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Hidden standard file input with webkitdirectory */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDirectoryInputChange}
        className="hidden"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
      />

      {/* Top Header Card */}
      <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-center text-[#F57917] shadow-inner">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white font-mono">
                  HASH DE PASTAS E SUBPASTAS
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[#F57917]/10 text-[#F57917] border border-[#F57917]/20">
                  Recursivo
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Selecione uma pasta para calcular o hash de todos os arquivos contidos nela e em suas subpastas.
                Os arquivos serão processados localmente, sem envio para servidores externos.
              </p>
            </div>
          </div>

          {/* Privacy Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#17191D] border border-emerald-950/60 text-emerald-400 text-xs font-medium shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Processamento 100% Local</span>
          </div>
        </div>

        {/* Directory Selection Button Box */}
        {items.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-[#262930] hover:border-[#F57917]/60 rounded-2xl p-8 sm:p-12 text-center transition-colors bg-[#131519]/50">
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-[#17191D] border border-[#262930] flex items-center justify-center text-[#F57917] mb-4 shadow-lg">
                <FolderOpen className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white mb-2">
                Selecione a Pasta para Análise Criptográfica
              </h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Suporta estruturas de extrações Cellebrite UFED, relatórios forenses, diretórios de imagens periciais e conjuntos de arquivos digitais.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReadingFolder}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isReadingFolder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Lendo Diretório...</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4" />
                      <span>SELECIONAR PASTA</span>
                    </>
                  )}
                </button>

                {'showDirectoryPicker' in window && (
                  <button
                    type="button"
                    onClick={handlePickDirectoryFSA}
                    disabled={isReadingFolder}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#17191D] hover:bg-[#20242B] border border-[#262930] hover:border-zinc-500 text-zinc-200 font-semibold text-xs tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FolderTree className="w-4 h-4 text-[#F57917]" />
                    <span>File System API</span>
                  </button>
                )}
              </div>

              {folderReadError && (
                <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{folderReadError}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Active Folder Summary Banner */
          <div className="mt-6 pt-5 border-t border-[#262930]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[#262930] text-[#F57917]">
                  <Folder className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 font-mono">PASTA RAIZ:</span>
                    <span className="text-sm font-bold text-white font-mono">{folderName}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mt-1">
                    <span><strong>{summary.total}</strong> arquivos identificados</span>
                    <span className="text-zinc-600">•</span>
                    <span><strong>{totalSubfoldersCount}</strong> subpastas</span>
                    <span className="text-zinc-600">•</span>
                    <span><strong>{formatBytes(summary.totalBytes)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRunning}
                  className="px-3 py-1.5 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>Trocar Pasta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMetadataForm((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{showMetadataForm ? 'Ocultar Metadados' : 'Dados do Laudo'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isRunning && !isPaused}
                  className="px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/40 border border-red-900/40 text-red-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Forensic Case Metadata (Optional - for PDF reports) */}
      {items.length > 0 && showMetadataForm && (
        <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-5 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
            <FileText className="w-4 h-4 text-[#F57917]" />
            <span>Metadados da Extração e Cadeia de Custódia (Opcional para Laudo Técnico)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Número do Procedimento / IPL / Processo</label>
              <input
                type="text"
                value={procedureNumber}
                onChange={(e) => setProcedureNumber(e.target.value)}
                placeholder="Ex: IPL 1234/2026-SR/PF/SP"
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#F57917]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Item / Número da Evidência</label>
              <input
                type="text"
                value={evidenceNumber}
                onChange={(e) => setEvidenceNumber(e.target.value)}
                placeholder="Ex: Evidência E-01 (Smartphone)"
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#F57917]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Perito / Responsável Técnico</label>
              <input
                type="text"
                value={examinerName}
                onChange={(e) => setExaminerName(e.target.value)}
                placeholder="Ex: APF / Perito Criminal Federal"
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#F57917]"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[11px] text-zinc-400 mb-1">Notas Técnicas / Observações da Extração</label>
            <textarea
              rows={2}
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              placeholder="Ex: Verificação de diretórios extraídos com Cellebrite Physical Analyzer v7.x. Sem violação física observada."
              className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#F57917] resize-none"
            />
          </div>
        </div>
      )}

      {/* Control Bar: Algorithms & Processing Controls */}
      {items.length > 0 && (
        <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-5 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Algorithm Selector */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-zinc-400 block font-semibold">
                Algoritmos Criptográficos Selecionados:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {(['SHA-256', 'MD5', 'SHA-1', 'SHA-512'] as HashAlgorithm[]).map((algo) => {
                  const isSelected = selectedAlgorithms.includes(algo);
                  const isPrimary = primaryAlgorithm === algo;

                  return (
                    <div
                      key={algo}
                      className={`flex items-center rounded-lg border text-xs overflow-hidden transition-all ${
                        isSelected
                          ? 'border-[#F57917] bg-[#17191D]'
                          : 'border-[#262930] bg-[#121418] text-zinc-500'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleAlgorithm(algo)}
                        disabled={isRunning}
                        className={`px-3 py-1.5 font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          isSelected ? 'text-[#F57917]' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-[#F57917]' : 'bg-zinc-600'}`}></span>
                        <span>{algo}</span>
                      </button>

                      {isSelected && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryAlgorithm(algo)}
                          title="Definir como algoritmo primário de exibição e manifesto"
                          className={`px-2 py-1.5 text-[10px] font-mono border-l cursor-pointer ${
                            isPrimary
                              ? 'bg-[#F57917] text-zinc-950 font-bold border-[#F57917]'
                              : 'border-[#262930] text-zinc-400 hover:text-white hover:bg-[#20242B]'
                          }`}
                        >
                          {isPrimary ? 'PADRÃO' : 'Tornar Padrão'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Execution Buttons */}
            <div className="flex items-center gap-2 pt-2 lg:pt-0">
              {!isRunning ? (
                <button
                  type="button"
                  onClick={handleStartCalculation}
                  className="px-6 py-2.5 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {summary.completed > 0 && summary.completed < summary.total
                      ? 'Retomar Cálculo'
                      : isFinished
                      ? 'Recalcular Tudo'
                      : 'INICIAR CÁLCULO'}
                  </span>
                </button>
              ) : (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Retomar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Pausar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2.5 rounded-xl bg-red-900/60 hover:bg-red-800 border border-red-700 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Cancelar</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Real-time Progress Section */}
          {(isRunning || isPaused || isFinished || summary.completed > 0) && (
            <div className="mt-5 pt-5 border-t border-[#262930] space-y-4">
              {/* Overall Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <span className="font-bold">PROCESSO GERAL:</span>
                    <span className="text-[#F57917]">
                      {summary.completed} de {summary.total} arquivos ({overallPercentage}%)
                    </span>
                    {isPaused && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 border border-amber-800 text-amber-300">
                        PAUSADO
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-zinc-400 text-[11px]">
                    <span>
                      {formatShortBytes(processedBytes)} / {formatShortBytes(totalBytesToProcess)}
                    </span>
                    {bytesPerSecond > 0 && isRunning && !isPaused && (
                      <span className="text-emerald-400">
                        {formatShortBytes(bytesPerSecond)}/s
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{formatTime(elapsedSeconds)}</span>
                    </span>
                    {etaSeconds !== null && isRunning && !isPaused && (
                      <span className="text-zinc-500">
                        ETA: {formatTime(etaSeconds)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full h-2.5 rounded-full bg-[#17191D] border border-[#262930] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F57917] to-amber-400 transition-all duration-200"
                    style={{ width: `${overallPercentage}%` }}
                  ></div>
                </div>
              </div>

              {/* Current Active File (when running) */}
              {isRunning && currentIndex >= 0 && currentIndex < items.length && (
                <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930] text-xs">
                  <div className="flex items-center justify-between mb-1 font-mono">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <RefreshCw className="w-3 h-3 animate-spin text-[#F57917] shrink-0" />
                      <span className="text-zinc-400 truncate">
                        {items[currentIndex].relativePath}
                      </span>
                    </div>
                    <span className="text-[#F57917] shrink-0">
                      {currentFileProgress}% ({items[currentIndex].formattedSize})
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-[#262930] overflow-hidden">
                    <div
                      className="h-full bg-[#F57917] transition-all duration-150"
                      style={{ width: `${currentFileProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Completion Notice and Fast Export Bar */}
              {isFinished && (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-2.5 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                    <div>
                      <strong className="block font-bold">Cálculo de hashes concluído com sucesso!</strong>
                      <span className="text-zinc-300 text-[11px]">
                        Todos os {summary.completed} arquivos do diretório foram processados e indexados com integridade.
                      </span>
                    </div>
                  </div>

                  {/* Fast Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      className="px-3.5 py-2 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Laudo PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportTXT}
                      className="px-3 py-2 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileCode className="w-3.5 h-3.5 text-[#F57917]" />
                      <span>Manifesto TXT</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-3 py-2 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-zinc-300" />
                      <span>CSV</span>
                    </button>
                    {onAddSessionRecord && (
                      <button
                        type="button"
                        onClick={handleAddAllToSession}
                        disabled={sessionAddedNotice}
                        className="px-3 py-2 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:text-emerald-400"
                      >
                        {sessionAddedNotice ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Adicionado ao Histórico!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Enviar à Sessão</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results Section & Forensic File Table */}
      {items.length > 0 && (
        <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
          {/* Header of Table with search and filter controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Inventário Criptográfico da Pasta ({filteredItems.length} de {items.length})
              </h3>
              <span className="text-[11px] font-mono text-zinc-500">
                • Exibindo {primaryAlgorithm}
              </span>
            </div>

            {/* Quick Export drop / buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={summary.completed === 0}
                className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Exportar laudo forense completo em PDF com paginação e resumo"
              >
                <Download className="w-3.5 h-3.5 text-[#F57917]" />
                <span>Laudo PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportTXT}
                disabled={summary.completed === 0}
                className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Exportar manifesto sha256sum compatível com GNU Coreutils"
              >
                <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                <span>TXT</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={summary.completed === 0}
                className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Exportar planilha pericial CSV com todos os dados"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportJSON}
                disabled={summary.completed === 0}
                className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Exportar manifesto em formato estruturado JSON"
              >
                <span>JSON</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
            {/* Search Input */}
            <div className="relative col-span-1 sm:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, subpasta ou código de hash..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F57917]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300 focus:outline-none focus:border-[#F57917] cursor-pointer"
              >
                <option value="ALL">Status: Todos ({items.length})</option>
                <option value="CALCULADO">Calculados ({summary.completed})</option>
                <option value="PENDENTE">Pendentes ({summary.pending})</option>
                <option value="ERRO">Erros ({summary.errors})</option>
              </select>
            </div>

            {/* Extension Filter */}
            <div>
              <select
                value={extensionFilter}
                onChange={(e) => setExtensionFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300 focus:outline-none focus:border-[#F57917] cursor-pointer"
              >
                <option value="ALL">Extensões: Todas ({availableExtensions.length})</option>
                {availableExtensions.map((ext) => (
                  <option key={ext} value={ext}>
                    {ext}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="border border-[#262930] rounded-xl overflow-hidden bg-[#131519]">
            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                  <tr>
                    <th
                      onClick={() => handleToggleSort('seq')}
                      className="py-3 px-3 w-12 text-center cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>#</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('path')}
                      className="py-3 px-3 cursor-pointer hover:text-white min-w-[280px]"
                    >
                      <div className="flex items-center gap-1">
                        <span>Caminho Relativo na Pasta</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('size')}
                      className="py-3 px-3 w-28 text-right cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Tamanho</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-3 min-w-[320px]">
                      <span>Hash Calculado ({primaryAlgorithm})</span>
                    </th>
                    <th className="py-3 px-3 w-28 text-center">
                      <span>Status</span>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#262930]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-500 font-mono text-xs">
                        Nenhum arquivo corresponde aos critérios de pesquisa ou filtro aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const hashValue = item.hashes[primaryAlgorithm];
                      const isCurrentCalculating = isRunning && items[currentIndex]?.id === item.id;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[#1A1D24] transition-colors ${
                            isCurrentCalculating ? 'bg-[#F57917]/10' : ''
                          }`}
                        >
                          {/* Seq */}
                          <td className="py-2.5 px-3 text-center font-mono text-zinc-500 text-[11px]">
                            {item.seq}
                          </td>

                          {/* Path */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <FileIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-mono text-zinc-200 text-xs truncate max-w-md sm:max-w-lg" title={item.relativePath}>
                                  {item.relativePath}
                                </p>
                                <span className="text-[10px] text-zinc-500 font-sans">
                                  {new Date(item.file.lastModified).toLocaleDateString('pt-BR')} • {item.extension || 'sem ext'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Size */}
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-300 whitespace-nowrap">
                            {item.formattedSize}
                          </td>

                          {/* Hash */}
                          <td className="py-2.5 px-3">
                            {item.status === 'CALCULADO' && hashValue ? (
                              <div className="flex items-center justify-between gap-2 bg-[#0A0C0E] px-2.5 py-1.5 rounded-lg border border-[#262930] group">
                                <span className="font-mono text-[11px] text-zinc-200 tracking-wider truncate" title={hashValue}>
                                  {hashValue}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyHash(hashValue, item.id)}
                                  className="text-zinc-500 hover:text-[#F57917] p-1 rounded transition-colors shrink-0 cursor-pointer"
                                  title="Copiar Hash"
                                >
                                  {copiedId === item.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : item.status === 'ERRO' ? (
                              <span className="text-red-400 font-mono text-[11px] flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{item.errorMessage || 'Falha de leitura'}</span>
                              </span>
                            ) : isCurrentCalculating ? (
                              <div className="flex items-center gap-2 text-[#F57917] font-mono text-[11px]">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Calculando... ({currentFileProgress}%)</span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 font-mono text-[11px]">
                                Aguardando cálculo...
                              </span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-3 text-center">
                            {item.status === 'CALCULADO' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                                <Check className="w-3 h-3" />
                                <span>OK</span>
                              </span>
                            ) : item.status === 'ERRO' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-950/60 border border-red-800 text-red-400">
                                <XCircle className="w-3 h-3" />
                                <span>ERRO</span>
                              </span>
                            ) : isCurrentCalculating ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F57917]/20 border border-[#F57917]/40 text-[#F57917]">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>LENDO</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400">
                                PENDENTE
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Technical Forensic Methodology Note */}
      <div className="rounded-xl bg-[#0F1115] border border-[#262930] p-4 text-xs text-zinc-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#F57917] shrink-0" />
          <span className="leading-relaxed">
            Metodologia Forense: O hash de cada arquivo é calculado individualmente sobre seu fluxo contínuo de bytes (stream),
            preservando a árvore hierárquica de subdiretórios conforme os padrões internacionais de perícia digital (NIST / RFC).
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[11px] shrink-0">
          <Lock className="w-3.5 h-3.5 text-emerald-500" />
          <span>Zero Transferência de Rede</span>
        </div>
      </div>
    </div>
  );
};

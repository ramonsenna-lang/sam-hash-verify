import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileCheck2,
  FolderOpen,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  PlusCircle,
  FileCode,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  FileText,
  RotateCcw,
  Trash2,
  FileSearch,
  AlertCircle,
  Check,
  FolderTree,
} from 'lucide-react';
import {
  ExtractionManifestItem,
  ManifestVerificationItem,
  ManifestItemStatus,
  SingleValidationRecord,
  HashAlgorithm,
} from '../types';
import {
  computeHashes,
  formatBytes,
  formatShortBytes,
  generateLocalVerificationId,
  extractFileMetadata,
} from '../utils/crypto';
import {
  downloadTextFile,
  formatForensicDate,
  exportManifestValidationPDF,
  exportManifestValidationCSV,
  exportManifestValidationTXT,
  ManifestValidationReportData,
} from '../utils/exporter';
import {
  detectAndParseManifest,
  ParseManifestResult,
  ParsedManifestRecord,
} from '../utils/exactFileParser';
import { auditLogger } from '../utils/auditLogger';

interface ExtractionManifestModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
}

export const ExtractionManifestModule: React.FC<ExtractionManifestModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [activeSubMode, setActiveSubMode] = useState<'GERAR' | 'VALIDAR'>('GERAR');

  // ----------------------------------------------------
  // SUB-MODE 1: GENERATE MANIFEST STATE
  // ----------------------------------------------------
  const [generationFiles, setGenerationFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [manifestItems, setManifestItems] = useState<ExtractionManifestItem[]>([]);
  const [manifestNotes, setManifestNotes] = useState('');
  const [genStatusMessage, setGenStatusMessage] = useState<string | null>(null);

  // Clear confirmation modals
  const [confirmClearGenAllOpen, setConfirmClearGenAllOpen] = useState(false);
  const [confirmClearValAllOpen, setConfirmClearValAllOpen] = useState(false);

  // Operation sequence counters to invalidate stale async jobs
  const genOpSeqRef = useRef<number>(0);
  const valOpSeqRef = useRef<number>(0);

  // ----------------------------------------------------
  // SUB-MODE 2: VALIDATE MANIFEST STATE
  // ----------------------------------------------------
  const [verificationFiles, setVerificationFiles] = useState<File[]>([]);
  const [importedManifestText, setImportedManifestText] = useState('');
  const [selectedManifestFileName, setSelectedManifestFileName] = useState<string>('');
  const [detectedManifest, setDetectedManifest] = useState<ParseManifestResult | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [verificationResults, setVerificationResults] = useState<ManifestVerificationItem[]>([]);
  const [manifestSearch, setManifestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [valStatusMessage, setValStatusMessage] = useState<string | null>(null);

  // Ambiguity resolution state: maps item ID to selected candidate file index
  const [ambiguityResolutions, setAmbiguityResolutions] = useState<Record<string, number>>({});

  // Abort Controllers and File Input Refs
  const abortGenRef = useRef<AbortController | null>(null);
  const abortValRef = useRef<AbortController | null>(null);

  const genFileInputRef = useRef<HTMLInputElement>(null);
  const genFolderInputRef = useRef<HTMLInputElement>(null);
  const valFileInputRef = useRef<HTMLInputElement>(null);
  const valFolderInputRef = useRef<HTMLInputElement>(null);
  const manifestFileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // AUTO-PARSE MANIFEST TEXT ON CHANGE
  // ----------------------------------------------------
  useEffect(() => {
    if (!importedManifestText.trim()) {
      setDetectedManifest(null);
      return;
    }

    try {
      const parsed = detectAndParseManifest(importedManifestText);
      setDetectedManifest(parsed);
    } catch (err: unknown) {
      console.error('Erro ao analisar manifesto:', err);
    }
  }, [importedManifestText]);

  // ----------------------------------------------------
  // SUB-MODE 1: GENERATE MANIFEST HANDLERS
  // ----------------------------------------------------
  const handleGenFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setGenerationFiles((prev) => [...prev, ...files]);
    setGenStatusMessage(`${files.length} arquivo(s) adicionado(s) para geração do manifesto.`);
  };

  const handleStartGeneration = async () => {
    if (generationFiles.length === 0) {
      setGenStatusMessage('Adicione ao menos um arquivo ou pasta para gerar o manifesto.');
      return;
    }

    const currentOp = ++genOpSeqRef.current;
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenStatusMessage(null);
    const abort = new AbortController();
    abortGenRef.current = abort;

    const { formatted, tz } = formatForensicDate();
    const createdItems: ExtractionManifestItem[] = [];

    try {
      for (let i = 0; i < generationFiles.length; i++) {
        if (abort.signal.aborted || currentOp !== genOpSeqRef.current) break;

        setCurrentFileIdx(i);
        const f = generationFiles[i];
        const relPath = (f as { webkitRelativePath?: string }).webkitRelativePath || f.name;

        const hashes = await computeHashes(
          f,
          ['SHA-256'],
          (pct) => {
            if (currentOp !== genOpSeqRef.current) return;
            const overall = Math.round(((i + pct / 100) / generationFiles.length) * 100);
            setGenerationProgress(overall);
          },
          abort.signal
        );

        if (currentOp !== genOpSeqRef.current) break;

        const sha256 = hashes['SHA-256'];
        const item: ExtractionManifestItem = {
          id: generateLocalVerificationId(),
          fileName: f.name,
          relativePath: relPath,
          size: f.size,
          formattedSize: formatShortBytes(f.size),
          algorithm: 'SHA-256',
          hash: sha256,
          timestamp: formatted,
        };

        createdItems.push(item);
      }

      if (currentOp === genOpSeqRef.current && !abort.signal.aborted) {
        setManifestItems(createdItems);
        setGenStatusMessage(`Manifesto gerado com sucesso: ${createdItems.length} arquivo(s) indexados.`);
        auditLogger.addLog({
          operation: 'MANIFESTO_GERADO',
          status: 'SUCESSO',
          message: `Manifesto SHA-256 gerado localmente com ${createdItems.length} arquivos.`,
          filesCount: createdItems.length,
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setGenStatusMessage('Operação de geração de manifesto cancelada.');
      } else {
        setGenStatusMessage(
          err instanceof Error ? `Erro: ${err.message}` : 'Erro no cálculo do manifesto.'
        );
      }
    } finally {
      if (currentOp === genOpSeqRef.current) {
        setIsGenerating(false);
        abortGenRef.current = null;
      }
    }
  };

  // 1.1 Limpar Seleção (Gerar Manifesto)
  const handleClearGenSelection = () => {
    if (isGenerating) {
      const confirmCancel = window.confirm(
        'Existe um processamento de cálculo ativo. Deseja cancelar a operação e limpar a seleção?'
      );
      if (!confirmCancel) return;
      abortGenRef.current?.abort();
    }

    genOpSeqRef.current++;
    setIsGenerating(false);
    setGenerationFiles([]);
    setManifestItems([]);
    setGenerationProgress(0);
    setCurrentFileIdx(0);
    setGenStatusMessage(null);

    // Reset input elements
    if (genFileInputRef.current) genFileInputRef.current.value = '';
    if (genFolderInputRef.current) genFolderInputRef.current.value = '';
  };

  // 1.2 Limpar Tudo (Gerar Manifesto)
  const handleConfirmClearGenAll = () => {
    if (isGenerating) {
      abortGenRef.current?.abort();
    }

    genOpSeqRef.current++;
    setIsGenerating(false);
    setGenerationFiles([]);
    setManifestItems([]);
    setManifestNotes('');
    setGenerationProgress(0);
    setCurrentFileIdx(0);
    setGenStatusMessage(null);

    if (genFileInputRef.current) genFileInputRef.current.value = '';
    if (genFolderInputRef.current) genFolderInputRef.current.value = '';

    setConfirmClearGenAllOpen(false);
  };

  const exportManifestTXT = () => {
    if (manifestItems.length === 0) return;
    const { formatted, tz } = formatForensicDate();

    let txt = `================================================================================\n`;
    txt += `SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM\n`;
    txt += `MANIFESTO DE INTEGRIDADE DA EXTRAÇÃO FORENSE (SHA-256)\n`;
    txt += `Data/Hora de Geração: ${formatted} (${tz})\n`;
    txt += `Total de Arquivos:    ${manifestItems.length}\n`;
    if (manifestNotes.trim()) {
      txt += `Notas da Extração:    ${manifestNotes.trim()}\n`;
    }
    txt += `Desenvolvido pelo APF Ramon (ramon.grsl) | Polícia Federal — XIV Cellebrite — Turma A — 2026\n`;
    txt += `================================================================================\n\n`;

    manifestItems.forEach((item) => {
      txt += `${item.hash}  *${item.relativePath}\n`;
    });

    downloadTextFile(txt, `Manifesto_Integridade_SHA256_${Date.now()}.txt`);
  };

  const exportManifestCSV = () => {
    if (manifestItems.length === 0) return;
    const header = ['Arquivo', 'Caminho_Relativo', 'Tamanho_Bytes', 'Tamanho_Formatado', 'Algoritmo', 'Hash_Calculado', 'Data_Hora'];
    const rows = manifestItems.map((item) => [
      `"${item.fileName.replace(/"/g, '""')}"`,
      `"${item.relativePath.replace(/"/g, '""')}"`,
      item.size,
      `"${item.formattedSize}"`,
      item.algorithm,
      `"${item.hash}"`,
      `"${item.timestamp}"`,
    ]);

    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadTextFile(csv, `Manifesto_Integridade_SHA256_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  // ----------------------------------------------------
  // SUB-MODE 2: VALIDATE MANIFEST HANDLERS
  // ----------------------------------------------------
  const handleManifestUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedManifestFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImportedManifestText(reader.result);
          setValStatusMessage(`Manifesto "${file.name}" carregado. Selecione agora os arquivos ou pasta atual para conferência.`);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleValFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setVerificationFiles(files);
    setAmbiguityResolutions({});
    setValStatusMessage(`${files.length} arquivo(s) local(is) selecionado(s) para conferência.`);
  };

  // 2.1 Limpar Seleção (Validar Manifesto)
  // Keeps imported manifest! Removes verification files and validation results
  const handleClearValSelection = () => {
    if (isValidating) {
      const confirmCancel = window.confirm(
        'Existe uma conferência ativa. Deseja cancelar a operação e limpar os arquivos selecionados?'
      );
      if (!confirmCancel) return;
      abortValRef.current?.abort();
    }

    valOpSeqRef.current++;
    setIsValidating(false);
    setVerificationFiles([]);
    setVerificationResults([]);
    setValidationProgress(0);
    setAmbiguityResolutions({});
    setValStatusMessage(null);

    if (valFileInputRef.current) valFileInputRef.current.value = '';
    if (valFolderInputRef.current) valFolderInputRef.current.value = '';
  };

  // 2.2 Limpar Tudo (Validar Manifesto)
  const handleConfirmClearValAll = () => {
    if (isValidating) {
      abortValRef.current?.abort();
    }

    valOpSeqRef.current++;
    setIsValidating(false);
    setVerificationFiles([]);
    setImportedManifestText('');
    setSelectedManifestFileName('');
    setDetectedManifest(null);
    setVerificationResults([]);
    setValidationProgress(0);
    setAmbiguityResolutions({});
    setValStatusMessage(null);

    if (valFileInputRef.current) valFileInputRef.current.value = '';
    if (valFolderInputRef.current) valFolderInputRef.current.value = '';
    if (manifestFileInputRef.current) manifestFileInputRef.current.value = '';

    setConfirmClearValAllOpen(false);
  };

  // Start Validation Execution
  const handleStartValidation = async () => {
    if (!detectedManifest || detectedManifest.records.length === 0) {
      setValStatusMessage('Carregue ou cole o texto de um manifesto com registros válidos para iniciar.');
      return;
    }

    if (verificationFiles.length === 0) {
      setValStatusMessage('Selecione os arquivos ou a pasta atual para conferir contra o manifesto.');
      return;
    }

    const currentOp = ++valOpSeqRef.current;
    setIsValidating(true);
    setValidationProgress(0);
    setValStatusMessage(null);
    const abort = new AbortController();
    abortValRef.current = abort;

    const { formatted, tz } = formatForensicDate();

    try {
      // Index local files by normalized relative path and by pure filename
      const localFilesByPath = new Map<string, File>();
      const localFilesByName = new Map<string, File[]>();

      for (const file of verificationFiles) {
        const rel = ((file as { webkitRelativePath?: string }).webkitRelativePath || file.name)
          .replace(/\\/g, '/')
          .toLowerCase();

        localFilesByPath.set(rel, file);

        const nameLower = file.name.toLowerCase();
        const existing = localFilesByName.get(nameLower) || [];
        existing.push(file);
        localFilesByName.set(nameLower, existing);
      }

      const results: ManifestVerificationItem[] = [];
      const usedLocalFiles = new Set<File>();
      const totalRecords = detectedManifest.records.length;

      for (let i = 0; i < totalRecords; i++) {
        if (abort.signal.aborted || currentOp !== valOpSeqRef.current) break;

        const record = detectedManifest.records[i];
        const seq = i + 1;

        if (!record.isValid) {
          results.push({
            id: generateLocalVerificationId(),
            sequence: seq,
            lineNumber: record.lineNumber,
            fileName: record.fileName || 'Registro Inválido',
            relativePath: record.relativePath || record.rawLine,
            algorithm: record.algorithm,
            expectedHash: record.expectedHash,
            calculatedHash: undefined,
            status: 'REGISTRO_INVALIDO',
            notes: record.errorMessage || 'Linha do manifesto contém formato inválido.',
          });
          continue;
        }

        // Association Rule:
        // 1. Exact match by relative path
        const normPath = record.relativePath.replace(/\\/g, '/').toLowerCase();
        let targetFile: File | undefined = localFilesByPath.get(normPath);

        let candidateFiles: File[] = [];

        if (!targetFile) {
          // 2. Match by filename
          const nameMatches = localFilesByName.get(record.fileName.toLowerCase()) || [];

          // Check if user manually resolved this ambiguity
          const manualChoiceIdx = ambiguityResolutions[String(seq)];
          if (manualChoiceIdx !== undefined && nameMatches[manualChoiceIdx]) {
            targetFile = nameMatches[manualChoiceIdx];
          } else if (nameMatches.length === 1) {
            // Exactly 1 candidate found
            targetFile = nameMatches[0];
          } else if (nameMatches.length > 1) {
            // Ambiguous multiple files found with identical filename in different subfolders
            candidateFiles = nameMatches;
          }
        }

        // If ambiguous
        if (!targetFile && candidateFiles.length > 1) {
          results.push({
            id: generateLocalVerificationId(),
            sequence: seq,
            lineNumber: record.lineNumber,
            fileName: record.fileName,
            relativePath: record.relativePath,
            algorithm: record.algorithm,
            expectedHash: record.expectedHash,
            calculatedHash: undefined,
            status: 'ASSOCIACAO_AMBIGUA',
            candidateFiles,
            notes: `Encontrados ${candidateFiles.length} arquivos com o mesmo nome em subpastas distintas. Selecione o arquivo correto para validação.`,
          });
          continue;
        }

        // If file not found
        if (!targetFile) {
          results.push({
            id: generateLocalVerificationId(),
            sequence: seq,
            lineNumber: record.lineNumber,
            fileName: record.fileName,
            relativePath: record.relativePath,
            algorithm: record.algorithm,
            expectedHash: record.expectedHash,
            calculatedHash: undefined,
            status: 'ARQUIVO_NAO_LOCALIZADO',
            notes: 'Arquivo listado no manifesto mas não encontrado na pasta ou arquivos selecionados.',
          });
          continue;
        }

        // Target file identified: calculate cryptographic hash
        usedLocalFiles.add(targetFile);

        try {
          const hashes = await computeHashes(
            targetFile,
            [record.algorithm],
            undefined,
            abort.signal
          );

          if (currentOp !== valOpSeqRef.current) break;

          const calculated = hashes[record.algorithm];
          const isMatch = calculated.toLowerCase() === record.expectedHash.toLowerCase();
          const status: ManifestItemStatus = isMatch ? 'CORRESPONDENTE' : 'DIVERGENTE';

          const itemRel = (targetFile as { webkitRelativePath?: string }).webkitRelativePath || targetFile.name;

          results.push({
            id: generateLocalVerificationId(),
            sequence: seq,
            lineNumber: record.lineNumber,
            fileName: targetFile.name,
            relativePath: itemRel,
            size: targetFile.size,
            formattedSize: formatShortBytes(targetFile.size),
            algorithm: record.algorithm,
            expectedHash: record.expectedHash,
            calculatedHash: calculated,
            status,
            notes: isMatch
              ? 'Hash calculado idêntico ao hash de referência do manifesto.'
              : 'Hash calculado difere do hash registrado no manifesto (dados alterados).',
          });

          // Add to session record
          const meta = extractFileMetadata(targetFile);
          onAddSessionRecord({
            id: generateLocalVerificationId(),
            timestamp: formatted,
            timezone: tz,
            fileMetadata: meta,
            algorithm: record.algorithm,
            referenceHash: record.expectedHash,
            calculatedHash: calculated,
            status: isMatch ? 'CORRESPONDENTE' : 'DIVERGENTE',
            notes: `Validação Manifesto [${detectedManifest.formatLabel}]: ${meta.name}`,
          });
        } catch (err: unknown) {
          results.push({
            id: generateLocalVerificationId(),
            sequence: seq,
            lineNumber: record.lineNumber,
            fileName: targetFile.name,
            relativePath: (targetFile as { webkitRelativePath?: string }).webkitRelativePath || targetFile.name,
            size: targetFile.size,
            formattedSize: formatShortBytes(targetFile.size),
            algorithm: record.algorithm,
            expectedHash: record.expectedHash,
            calculatedHash: undefined,
            status: 'ERRO_LEITURA',
            notes: `Erro de leitura ao calcular hash: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        setValidationProgress(Math.round(((i + 1) / totalRecords) * 100));
      }

      // Check for additional local files not present in the manifest
      for (const file of verificationFiles) {
        if (!usedLocalFiles.has(file)) {
          results.push({
            id: generateLocalVerificationId(),
            fileName: file.name,
            relativePath: (file as { webkitRelativePath?: string }).webkitRelativePath || file.name,
            size: file.size,
            formattedSize: formatShortBytes(file.size),
            algorithm: 'SHA-256',
            expectedHash: undefined,
            calculatedHash: undefined,
            status: 'ADICIONAL',
            notes: 'Arquivo existente na pasta atual que NÃO constava no manifesto de referência.',
          });
        }
      }

      if (currentOp === valOpSeqRef.current && !abort.signal.aborted) {
        setVerificationResults(results);
        const correspondentes = results.filter((r) => r.status === 'CORRESPONDENTE').length;
        const divergentes = results.filter((r) => r.status === 'DIVERGENTE').length;
        const naoLocalizados = results.filter(
          (r) => r.status === 'ARQUIVO_NAO_LOCALIZADO' || r.status === 'AUSENTE'
        ).length;

        setValStatusMessage(
          `Conferência concluída: ${correspondentes} íntegro(s), ${divergentes} divergente(s), ${naoLocalizados} não localizado(s).`
        );

        auditLogger.addLog({
          operation: 'MANIFESTO_VALIDADO',
          status: divergentes > 0 ? 'DIVERGENTE' : 'SUCESSO',
          message: `Conferência de manifesto [${detectedManifest.formatLabel}]: ${correspondentes} correspondentes, ${divergentes} divergentes.`,
          filesCount: results.length,
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setValStatusMessage('Conferência de manifesto cancelada.');
      } else {
        setValStatusMessage(
          err instanceof Error ? `Erro: ${err.message}` : 'Erro na conferência do manifesto.'
        );
      }
    } finally {
      if (currentOp === valOpSeqRef.current) {
        setIsValidating(false);
        abortValRef.current = null;
      }
    }
  };

  // Ambiguity resolution helper
  const handleResolveAmbiguity = (itemId: string, candidateIndex: number) => {
    setAmbiguityResolutions((prev) => ({
      ...prev,
      [itemId]: candidateIndex,
    }));
  };

  // ----------------------------------------------------
  // FILTERING & STATS FOR VALIDATION RESULTS
  // ----------------------------------------------------
  const filteredValidation = useMemo(() => {
    return verificationResults.filter((item) => {
      const matchFilter = statusFilter === 'ALL' || item.status === statusFilter;
      const matchSearch =
        !manifestSearch.trim() ||
        item.fileName.toLowerCase().includes(manifestSearch.toLowerCase()) ||
        item.relativePath.toLowerCase().includes(manifestSearch.toLowerCase()) ||
        (item.expectedHash && item.expectedHash.toLowerCase().includes(manifestSearch.toLowerCase())) ||
        (item.calculatedHash && item.calculatedHash.toLowerCase().includes(manifestSearch.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [verificationResults, statusFilter, manifestSearch]);

  const stats = useMemo(() => {
    const total = verificationResults.length;
    const correspondente = verificationResults.filter((i) => i.status === 'CORRESPONDENTE').length;
    const divergente = verificationResults.filter((i) => i.status === 'DIVERGENTE').length;
    const naoLocalizado = verificationResults.filter(
      (i) => i.status === 'ARQUIVO_NAO_LOCALIZADO' || i.status === 'AUSENTE'
    ).length;
    const ambiguo = verificationResults.filter((i) => i.status === 'ASSOCIACAO_AMBIGUA').length;
    const erro = verificationResults.filter((i) => i.status === 'ERRO_LEITURA').length;
    const invalido = verificationResults.filter((i) => i.status === 'REGISTRO_INVALIDO').length;
    const adicional = verificationResults.filter((i) => i.status === 'ADICIONAL').length;
    const naoVerificado = verificationResults.filter((i) => i.status === 'NAO_VERIFICADO').length;

    const isFullyVerified =
      total > 0 &&
      divergente === 0 &&
      naoLocalizado === 0 &&
      ambiguo === 0 &&
      erro === 0 &&
      invalido === 0 &&
      correspondente > 0;

    return {
      total,
      correspondente,
      divergente,
      naoLocalizado,
      ambiguo,
      erro,
      invalido,
      adicional,
      naoVerificado,
      isFullyVerified,
    };
  }, [verificationResults]);

  // Export validation reports
  const handleExportValidationPDF = () => {
    if (verificationResults.length === 0) return;
    const { formatted, tz } = formatForensicDate();

    let manifestOrigin = detectedManifest?.formatLabel || 'Manifesto de Integridade';
    if (detectedManifest?.format === 'EXACTFILE' && detectedManifest.exactFileMeta?.version) {
      manifestOrigin = `ExactFile ${detectedManifest.exactFileMeta.version}`;
    }

    const reportData: ManifestValidationReportData = {
      id: generateLocalVerificationId(),
      manifestOrigin,
      manifestName: selectedManifestFileName || 'Manifesto_Carregado.txt',
      declaredDate: detectedManifest?.exactFileMeta?.declaredDate,
      validationTimestamp: formatted,
      timezone: tz,
      algorithm: detectedManifest?.algorithms.join(', ') || 'SHA-256',
      totalItems: stats.total,
      correspondentes: stats.correspondente,
      divergentes: stats.divergente,
      naoLocalizados: stats.naoLocalizado,
      ambiguos: stats.ambiguo,
      erros: stats.erro,
      naoVerificados: stats.naoVerificado,
      items: verificationResults,
    };

    exportManifestValidationPDF(reportData);
  };

  const handleExportValidationCSV = () => {
    if (verificationResults.length === 0) return;
    const { formatted, tz } = formatForensicDate();

    const reportData: ManifestValidationReportData = {
      id: generateLocalVerificationId(),
      manifestOrigin: detectedManifest?.formatLabel || 'Manifesto de Integridade',
      manifestName: selectedManifestFileName || 'Manifesto_Carregado.txt',
      validationTimestamp: formatted,
      timezone: tz,
      algorithm: detectedManifest?.algorithms.join(', ') || 'SHA-256',
      totalItems: stats.total,
      correspondentes: stats.correspondente,
      divergentes: stats.divergente,
      naoLocalizados: stats.naoLocalizado,
      ambiguos: stats.ambiguo,
      erros: stats.erro,
      naoVerificados: stats.naoVerificado,
      items: verificationResults,
    };

    const csv = exportManifestValidationCSV(reportData);
    downloadTextFile(csv, `Resultado_Validacao_Manifesto_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  const handleExportValidationTXT = () => {
    if (verificationResults.length === 0) return;
    const { formatted, tz } = formatForensicDate();

    const reportData: ManifestValidationReportData = {
      id: generateLocalVerificationId(),
      manifestOrigin: detectedManifest?.formatLabel || 'Manifesto de Integridade',
      manifestName: selectedManifestFileName || 'Manifesto_Carregado.txt',
      declaredDate: detectedManifest?.exactFileMeta?.declaredDate,
      validationTimestamp: formatted,
      timezone: tz,
      algorithm: detectedManifest?.algorithms.join(', ') || 'SHA-256',
      totalItems: stats.total,
      correspondentes: stats.correspondente,
      divergentes: stats.divergente,
      naoLocalizados: stats.naoLocalizado,
      ambiguos: stats.ambiguo,
      erros: stats.erro,
      naoVerificados: stats.naoVerificado,
      items: verificationResults,
    };

    const txt = exportManifestValidationTXT(reportData);
    downloadTextFile(txt, `Resultado_Validacao_Manifesto_${Date.now()}.txt`);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Module Header */}
      <div className="border-b border-[#262930] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5 font-mono">
            <FileCheck2 className="w-6 h-6 text-[#F57917]" />
            MANIFESTO DE INTEGRIDADE DA EXTRAÇÃO
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Gere manifestos ou valide a integridade contra manifestos existentes (incluindo o formato de checksums do <strong>ExactFile</strong>, GNU coreutils sha256sum e CSVs periciais).
          </p>
        </div>

        {/* Sub-mode switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-xl border border-[#262930] shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubMode('GERAR')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeSubMode === 'GERAR'
                ? 'bg-[#F57917] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            1. Gerar Novo Manifesto
          </button>
          <button
            type="button"
            onClick={() => setActiveSubMode('VALIDAR')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeSubMode === 'VALIDAR'
                ? 'bg-[#F57917] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            2. Validar Manifesto Existente
          </button>
        </div>
      </div>

      {/* Global Status Banner */}
      {(genStatusMessage || valStatusMessage) && (
        <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs text-zinc-300 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#F57917] shrink-0" />
          <span>{activeSubMode === 'GERAR' ? genStatusMessage : valStatusMessage}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-MODE 1: GERAR NOVO MANIFESTO                                      */}
      {/* ===================================================================== */}
      {activeSubMode === 'GERAR' && (
        <div className="space-y-5 animate-fade-in">
          <div className="p-5 rounded-2xl bg-[#0F1115] border border-[#262930] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-zinc-300 block">
                  Adicionar Evidências ou Pasta da Extração
                </span>
                <span className="text-[11px] text-zinc-500">
                  Calcula hashes determinísticos de cada arquivo preservando a hierarquia de caminhos relativos.
                </span>
              </div>

              {/* Action Buttons with LIMPAR SELEÇÃO and LIMPAR TUDO */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={genFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleGenFilesAdded(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => genFileInputRef.current?.click()}
                  className="py-2 px-3.5 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>Selecionar Arquivos</span>
                </button>

                <input
                  ref={genFolderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is standard in Chromium/Firefox/Safari
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => handleGenFilesAdded(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => genFolderInputRef.current?.click()}
                  className="py-2 px-3.5 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>Selecionar Pasta</span>
                </button>

                {/* 1. LIMPAR SELEÇÃO */}
                <button
                  type="button"
                  onClick={handleClearGenSelection}
                  disabled={generationFiles.length === 0 && manifestItems.length === 0}
                  className="py-2 px-3 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Limpar arquivos e resultados da operação atual"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>LIMPAR SELEÇÃO</span>
                </button>

                {/* 2. LIMPAR TUDO */}
                <button
                  type="button"
                  onClick={() => setConfirmClearGenAllOpen(true)}
                  className="py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  title="Limpar toda a sessão do módulo Gerar Manifesto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>LIMPAR TUDO</span>
                </button>
              </div>
            </div>

            {/* Optional Manifest Notes */}
            <div className="pt-2 border-t border-[#262930]">
              <label className="block text-[11px] text-zinc-400 mb-1 font-mono">
                Notas Técnicas / Observações da Extração (Opcional):
              </label>
              <input
                type="text"
                value={manifestNotes}
                onChange={(e) => setManifestNotes(e.target.value)}
                placeholder="Ex: Extração física Cellebrite UFED - Dispositivo apreendido na Operação..."
                className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917]"
              />
            </div>

            {/* Files Summary & Generation Button */}
            {generationFiles.length > 0 && (
              <div className="pt-3 border-t border-[#262930] space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{generationFiles.length} arquivo(s) selecionado(s) para catalogação</span>
                  <span className="font-mono">
                    Volume total: {formatBytes(generationFiles.reduce((acc, f) => acc + f.size, 0))}
                  </span>
                </div>

                {isGenerating ? (
                  <div className="space-y-2 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                        Calculando hashes ({currentFileIdx + 1}/{generationFiles.length}):{' '}
                        <strong className="text-white truncate max-w-xs">
                          {generationFiles[currentFileIdx]?.name}
                        </strong>
                      </span>
                      <span className="text-white font-bold">{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#F57917] h-full transition-all duration-150"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => abortGenRef.current?.abort()}
                        className="text-xs text-red-400 hover:underline cursor-pointer"
                      >
                        Interromper Cálculo
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartGeneration}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 text-xs font-bold tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    CALCULAR E GERAR MANIFESTO SHA-256
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Generated Manifest Table */}
          {manifestItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Manifesto Gerado ({manifestItems.length} arquivos catalogados)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportManifestTXT}
                    className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#F57917]" />
                    <span>Exportar TXT</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportManifestCSV}
                    className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#F57917]" />
                    <span>Exportar CSV</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Caminho Relativo / Arquivo</th>
                        <th className="py-2.5 px-3 font-semibold">Tamanho</th>
                        <th className="py-2.5 px-4 font-semibold">Hash SHA-256</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262930]">
                      {manifestItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#17191D]/60 transition-colors">
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-white truncate block max-w-sm" title={item.relativePath}>
                              {item.relativePath}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-400 whitespace-nowrap">
                            {item.formattedSize}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-300 select-all">
                            {item.hash}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-MODE 2: VALIDAR MANIFESTO EXISTENTE                               */}
      {/* ===================================================================== */}
      {activeSubMode === 'VALIDAR' && (
        <div className="space-y-5 animate-fade-in">
          {/* Top Control Bar with Clear Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0F1115] border border-[#262930]">
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-[#F57917]" />
              <span className="text-xs font-mono font-bold text-white uppercase">
                Validação de Integridade de Manifesto
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* LIMPAR SELEÇÃO (VALIDAR MANIFESTO) */}
              <button
                type="button"
                onClick={handleClearValSelection}
                disabled={verificationFiles.length === 0 && verificationResults.length === 0}
                className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Remove arquivos e resultados, mantendo o manifesto importado"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#F57917]" />
                <span>LIMPAR SELEÇÃO</span>
              </button>

              {/* LIMPAR TUDO (VALIDAR MANIFESTO) */}
              <button
                type="button"
                onClick={() => setConfirmClearValAllOpen(true)}
                className="py-1.5 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                title="Limpar toda a sessão de validação incluindo o manifesto importado"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>LIMPAR TUDO</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Upload or Paste Manifest */}
            <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                  Passo 1: Manifesto de Referência
                </span>
                <input
                  ref={manifestFileInputRef}
                  type="file"
                  accept=".txt,.csv,.json"
                  className="hidden"
                  onChange={handleManifestUpload}
                />
                <button
                  type="button"
                  onClick={() => manifestFileInputRef.current?.click()}
                  className="text-xs text-[#F57917] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Carregar Arquivo (.txt / .csv / .json)</span>
                </button>
              </div>

              <textarea
                rows={5}
                value={importedManifestText}
                onChange={(e) => {
                  setImportedManifestText(e.target.value);
                  setSelectedManifestFileName('');
                }}
                placeholder="Cole o conteúdo do manifesto (ex: ExactFile, sha256sum ou CSV)..."
                className="w-full p-2.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917] resize-none"
              />

              {/* ExactFile & Manifest Format Detected Badge */}
              {detectedManifest && (
                <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F57917]/20 border border-[#F57917]/40 text-[#F57917]">
                      FORMATO IDENTIFICADO: {detectedManifest.formatLabel.toUpperCase()}
                    </span>

                    <span className="text-[11px] font-mono text-zinc-400">
                      {detectedManifest.validCount} registro(s) reconhecido(s)
                    </span>
                  </div>

                  {/* ExactFile Detailed Metadata */}
                  {detectedManifest.format === 'EXACTFILE' && detectedManifest.exactFileMeta && (
                    <div className="pt-2 border-t border-[#262930] grid grid-cols-2 gap-2 text-[11px] text-zinc-300 font-sans">
                      {detectedManifest.exactFileMeta.version && (
                        <div>
                          <span className="text-zinc-500 block text-[10px]">Versão ExactFile:</span>
                          <strong>{detectedManifest.exactFileMeta.version}</strong>
                        </div>
                      )}
                      {detectedManifest.exactFileMeta.declaredDate && (
                        <div>
                          <span className="text-zinc-500 block text-[10px]">Data Declarada:</span>
                          <strong>{detectedManifest.exactFileMeta.declaredDate}</strong>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Qtd Declarada no Rodapé:</span>
                        <strong>{detectedManifest.exactFileMeta.declaredCount ?? 'Não informada'}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Algoritmos Identificados:</span>
                        <strong className="text-[#F57917]">{detectedManifest.algorithms.join(', ')}</strong>
                      </div>
                    </div>
                  )}

                  {/* Warning if declared count mismatches recognized count */}
                  {detectedManifest.exactFileMeta?.countMismatchWarning && (
                    <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>{detectedManifest.exactFileMeta.countMismatchWarning}</span>
                    </div>
                  )}

                  {/* Error notifications */}
                  {detectedManifest.parseErrors.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        <span>Avisos de interpretação ({detectedManifest.parseErrors.length} linha(s)):</span>
                      </div>
                      <ul className="list-disc list-inside text-[10px] space-y-0.5">
                        {detectedManifest.parseErrors.slice(0, 3).map((err, i) => (
                          <li key={i}>
                            Linha {err.line}: {err.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Select Current Local Files or Entire Folder */}
            <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                    Passo 2: Evidência Atual (Arquivos / Pasta)
                  </span>
                  {verificationFiles.length > 0 && (
                    <span className="text-xs text-[#F57917] font-mono font-bold">
                      {verificationFiles.length} item(ns) selecionado(s)
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  Selecione os arquivos correspondentes ou selecione a pasta raiz da extração para varredura recursiva de subpastas.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    ref={valFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleValFilesAdded(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => valFileInputRef.current?.click()}
                    className="w-full py-3 px-3 rounded-xl bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4 text-[#F57917]" />
                    <span>Selecionar Arquivos</span>
                  </button>

                  <input
                    ref={valFolderInputRef}
                    type="file"
                    // @ts-expect-error webkitdirectory is standard
                    webkitdirectory=""
                    directory=""
                    multiple
                    className="hidden"
                    onChange={(e) => handleValFilesAdded(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => valFolderInputRef.current?.click()}
                    className="w-full py-3 px-3 rounded-xl bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-[#F57917]" />
                    <span>Selecionar Pasta Atual</span>
                  </button>
                </div>
              </div>

              {verificationFiles.length > 0 && (
                <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930] text-xs text-zinc-300 flex items-center justify-between">
                  <span>Pronto para comparar {verificationFiles.length} arquivos locais com o manifesto.</span>
                  <span className="font-mono text-zinc-400">
                    {formatShortBytes(verificationFiles.reduce((acc, f) => acc + f.size, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Validation Execution Button */}
          <div>
            {isValidating ? (
              <div className="space-y-2 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                    Comparando arquivos com o manifesto...
                  </span>
                  <span className="text-white font-bold">{validationProgress}%</span>
                </div>
                <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F57917] h-full transition-all duration-150"
                    style={{ width: `${validationProgress}%` }}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => abortValRef.current?.abort()}
                    className="text-xs text-red-400 hover:underline cursor-pointer"
                  >
                    Interromper Conferência
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartValidation}
                disabled={!detectedManifest || detectedManifest.records.length === 0 || verificationFiles.length === 0}
                className="w-full py-3.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-zinc-950 font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>CONFERIR E VALIDAR CONTRA O MANIFESTO</span>
              </button>
            )}
          </div>

          {/* Verification Results Dashboard */}
          {verificationResults.length > 0 && (
            <div className="space-y-4">
              {/* Summary Strip (Requirement 8) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-xl bg-[#0F1115] border border-emerald-950/60">
                  <span className="text-[10px] font-mono text-emerald-500 block uppercase">
                    Correspondentes
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                    {stats.correspondente}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#0F1115] border border-red-950/60">
                  <span className="text-[10px] font-mono text-red-500 block uppercase">
                    Divergentes
                  </span>
                  <span className="text-lg font-bold font-mono text-red-400 tabular-nums">
                    {stats.divergente}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#0F1115] border border-amber-950/60">
                  <span className="text-[10px] font-mono text-amber-500 block uppercase">
                    Não Localizados
                  </span>
                  <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                    {stats.naoLocalizado}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#0F1115] border border-purple-950/60">
                  <span className="text-[10px] font-mono text-purple-400 block uppercase">
                    Ambíguos
                  </span>
                  <span className="text-lg font-bold font-mono text-purple-300 tabular-nums">
                    {stats.ambiguo}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#0F1115] border border-red-950/60">
                  <span className="text-[10px] font-mono text-red-400 block uppercase">
                    Erros Leitura
                  </span>
                  <span className="text-lg font-bold font-mono text-red-300 tabular-nums">
                    {stats.erro}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#0F1115] border border-[#262930]">
                  <span className="text-[10px] font-mono text-zinc-400 block uppercase">
                    Total Registros
                  </span>
                  <span className="text-lg font-bold font-mono text-white tabular-nums">
                    {stats.total}
                  </span>
                </div>
              </div>

              {/* Status Alert Conclusion */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                  stats.isFullyVerified
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-800 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs">
                  {stats.isFullyVerified ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <strong className="block">
                      {stats.isFullyVerified
                        ? 'INTEGRIDADE INTEGRAL COMPROVADA'
                        : 'CONFERÊNCIA COM IRREGULARIDADES'}
                    </strong>
                    <span className="text-[11px] text-zinc-300">
                      {stats.isFullyVerified
                        ? `Todos os ${stats.correspondente} arquivos apresentaram correspondência exata contra o manifesto.`
                        : 'O manifesto não pode ser declarado integralmente validado enquanto houver arquivos divergentes, não localizados ou ambíguos.'}
                    </span>
                  </div>
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleExportValidationPDF}
                    className="px-3 py-1.5 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Laudo PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportValidationTXT}
                    className="px-2.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[#F57917]" />
                    <span>TXT</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportValidationCSV}
                    className="px-2.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-300" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Filter and Search */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-lg border border-[#262930] overflow-x-auto max-w-full">
                  {[
                    { id: 'ALL', label: `Todos (${verificationResults.length})` },
                    { id: 'CORRESPONDENTE', label: `Correspondentes (${stats.correspondente})` },
                    { id: 'DIVERGENTE', label: `Divergentes (${stats.divergente})` },
                    { id: 'ARQUIVO_NAO_LOCALIZADO', label: `Não Localizados (${stats.naoLocalizado})` },
                    { id: 'ASSOCIACAO_AMBIGUA', label: `Ambíguos (${stats.ambiguo})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`py-1 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-[#F57917] text-zinc-950 font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome, caminho ou hash..."
                    value={manifestSearch}
                    onChange={(e) => setManifestSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917]"
                  />
                </div>
              </div>

              {/* Table of Results */}
              <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Caminho / Nome do Arquivo</th>
                        <th className="py-2.5 px-3">Hash Referência (Manifesto)</th>
                        <th className="py-2.5 px-3">Hash Calculado Local</th>
                        <th className="py-2.5 px-3 text-center w-32">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262930]">
                      {filteredValidation.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-[#17191D]/60 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono text-zinc-500">
                            {item.sequence || idx + 1}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-medium text-white truncate max-w-sm" title={item.relativePath}>
                              {item.relativePath}
                            </div>
                            <div className="text-[10px] text-zinc-500">{item.notes}</div>

                            {/* Ambiguity Resolution Selector */}
                            {item.status === 'ASSOCIACAO_AMBIGUA' && item.candidateFiles && (
                              <div className="mt-2 p-2 rounded-lg bg-[#17191D] border border-purple-800/60 space-y-1.5">
                                <span className="text-[10px] text-purple-300 font-bold block">
                                  Selecione o arquivo correto entre os candidatos encontrados:
                                </span>
                                <div className="space-y-1">
                                  {item.candidateFiles.map((cand, candIdx) => (
                                    <button
                                      key={candIdx}
                                      type="button"
                                      onClick={() => handleResolveAmbiguity(String(item.sequence), candIdx)}
                                      className="text-left w-full text-[10px] font-mono text-zinc-300 hover:text-white p-1 rounded hover:bg-[#20242B] flex items-center justify-between cursor-pointer"
                                    >
                                      <span className="truncate max-w-xs">
                                        {(cand as any).webkitRelativePath || cand.name}
                                      </span>
                                      <span className="text-zinc-500">{formatShortBytes(cand.size)}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Expected Hash */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                            {item.expectedHash ? (
                              <span className="truncate max-w-[200px] inline-block font-mono" title={item.expectedHash}>
                                {item.expectedHash}
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Calculated Hash */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-200">
                            {item.calculatedHash ? (
                              <span className="truncate max-w-[200px] inline-block font-mono" title={item.calculatedHash}>
                                {item.calculatedHash}
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {item.status === 'CORRESPONDENTE' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                CORRESPONDENTE
                              </span>
                            )}
                            {item.status === 'DIVERGENTE' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-950/60 border border-red-800 text-red-400">
                                <XCircle className="w-3 h-3" />
                                DIVERGENTE
                              </span>
                            )}
                            {(item.status === 'ARQUIVO_NAO_LOCALIZADO' || item.status === 'AUSENTE') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-800 text-amber-400">
                                <AlertTriangle className="w-3 h-3" />
                                NÃO LOCALIZADO
                              </span>
                            )}
                            {item.status === 'ASSOCIACAO_AMBIGUA' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950/60 border border-purple-800 text-purple-300">
                                <AlertTriangle className="w-3 h-3" />
                                AMBÍGUO
                              </span>
                            )}
                            {item.status === 'ERRO_LEITURA' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-950/60 border border-red-800 text-red-400">
                                <XCircle className="w-3 h-3" />
                                ERRO LEITURA
                              </span>
                            )}
                            {item.status === 'REGISTRO_INVALIDO' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 border border-zinc-700 text-zinc-400">
                                INVÁLIDO
                              </span>
                            )}
                            {item.status === 'ADICIONAL' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950/60 border border-purple-800 text-purple-400">
                                <PlusCircle className="w-3 h-3" />
                                ADICIONAL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CONFIRMATION MODALS                                                   */}
      {/* ===================================================================== */}
      {/* 1. Confirm Clear All - Generation */}
      {confirmClearGenAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0F1115] border border-red-900/60 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Limpar Tudo — Gerar Manifesto?
              </h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Deseja realmente limpar toda a sessão de geração de manifesto, incluindo os arquivos selecionados, hashes calculados e notas preenchidas? Arquivos do seu computador não serão afetados.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearGenAllOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearGenAll}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow"
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Confirm Clear All - Validation */}
      {confirmClearValAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0F1115] border border-red-900/60 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Limpar Tudo — Validar Manifesto?
              </h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Deseja realmente limpar toda a sessão de validação, incluindo o manifesto de referência carregado, os arquivos locais e os resultados da conferência?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearValAllOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearValAll}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow"
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

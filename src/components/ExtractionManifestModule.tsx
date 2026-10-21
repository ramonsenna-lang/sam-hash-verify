import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import {
  ExtractionManifestItem,
  ManifestVerificationItem,
  ManifestItemStatus,
  SingleValidationRecord,
} from '../types';
import {
  computeHashes,
  formatBytes,
  formatShortBytes,
  generateLocalVerificationId,
  extractFileMetadata,
} from '../utils/crypto';
import { downloadTextFile, formatForensicDate } from '../utils/exporter';

interface ExtractionManifestModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
}

export const ExtractionManifestModule: React.FC<ExtractionManifestModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [activeSubMode, setActiveSubMode] = useState<'GERAR' | 'VALIDAR'>('GERAR');

  // Generation state
  const [generationFiles, setGenerationFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [manifestItems, setManifestItems] = useState<ExtractionManifestItem[]>([]);
  const [manifestNotes, setManifestNotes] = useState('');

  // Validation state
  const [verificationFiles, setVerificationFiles] = useState<File[]>([]);
  const [importedManifestText, setImportedManifestText] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [verificationResults, setVerificationResults] = useState<ManifestVerificationItem[]>([]);
  const [manifestSearch, setManifestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const abortGenRef = useRef<AbortController | null>(null);
  const abortValRef = useRef<AbortController | null>(null);
  const genFileInputRef = useRef<HTMLInputElement>(null);
  const genFolderInputRef = useRef<HTMLInputElement>(null);
  const valFileInputRef = useRef<HTMLInputElement>(null);
  const valFolderInputRef = useRef<HTMLInputElement>(null);
  const manifestFileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // SUB-MODE 1: GENERATE MANIFEST
  // ----------------------------------------------------
  const handleGenFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setGenerationFiles((prev) => [...prev, ...files]);
    setStatusMessage(`${files.length} arquivo(s) adicionado(s) para geração do manifesto.`);
  };

  const handleStartGeneration = async () => {
    if (generationFiles.length === 0) {
      setStatusMessage('Adicione ao menos um arquivo ou pasta para gerar o manifesto.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setStatusMessage(null);
    const abort = new AbortController();
    abortGenRef.current = abort;

    const { formatted, tz } = formatForensicDate();
    const createdItems: ExtractionManifestItem[] = [];

    try {
      for (let i = 0; i < generationFiles.length; i++) {
        if (abort.signal.aborted) break;

        setCurrentFileIdx(i);
        const f = generationFiles[i];
        const relPath = (f as { webkitRelativePath?: string }).webkitRelativePath || f.name;

        const hashes = await computeHashes(
          f,
          ['SHA-256'],
          (pct) => {
            const overall = Math.round(((i + pct / 100) / generationFiles.length) * 100);
            setGenerationProgress(overall);
          },
          abort.signal
        );

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

        // Record in session
        const meta = extractFileMetadata(f, relPath);
        onAddSessionRecord({
          id: item.id,
          timestamp: formatted,
          timezone: tz,
          fileMetadata: meta,
          algorithm: 'SHA-256',
          referenceHash: '',
          calculatedHash: sha256,
          status: 'SEM_REFERENCIA',
          notes: `Manifesto de Integridade da Extração [${relPath}]`,
        });
      }

      setManifestItems(createdItems);
      setStatusMessage(`Manifesto gerado com sucesso para ${createdItems.length} arquivo(s).`);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('Geração do manifesto cancelada pelo usuário.');
      } else {
        setStatusMessage(
          err instanceof Error ? `Erro: ${err.message}` : 'Erro durante o cálculo do manifesto.'
        );
      }
    } finally {
      setIsGenerating(false);
      abortGenRef.current = null;
    }
  };

  const exportManifestCSV = () => {
    if (manifestItems.length === 0) return;
    const header = ['Arquivo', 'Caminho_Relativo', 'Tamanho_Bytes', 'Algoritmo', 'Hash_SHA256', 'Data_Hora'];
    const rows = manifestItems.map((item) => [
      `"${item.fileName.replace(/"/g, '""')}"`,
      `"${item.relativePath.replace(/"/g, '""')}"`,
      item.size,
      item.algorithm,
      `"${item.hash}"`,
      `"${item.timestamp}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadTextFile(csv, `Manifesto_Integridade_Extracao_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  };

  const exportManifestTXT = () => {
    if (manifestItems.length === 0) return;
    let txt = `================================================================================\n`;
    txt += `SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM\n`;
    txt += `MANIFESTO DE INTEGRIDADE DA EXTRAÇÃO FORENSE\n`;
    txt += `Data de Geração: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `Total de Arquivos: ${manifestItems.length}\n`;
    txt += `Algoritmo Padronizado: SHA-256\n`;
    txt += `Polícia Federal — XIV Cellebrite — Turma A — 2026\n`;
    txt += `Desenvolvido pelo APF Ramon (ramon.grsl)\n`;
    txt += `================================================================================\n\n`;

    manifestItems.forEach((m) => {
      txt += `${m.hash}  *${m.relativePath}\n`;
    });

    downloadTextFile(txt, `Manifesto_Integridade_Extracao_${Date.now()}.txt`);
  };

  // ----------------------------------------------------
  // SUB-MODE 2: VALIDATE EXISTING MANIFEST
  // ----------------------------------------------------
  const handleManifestUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImportedManifestText(reader.result);
          setStatusMessage(`Manifesto "${file.name}" carregado. Adicione os arquivos atuais para conferência.`);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleStartValidation = async () => {
    if (!importedManifestText.trim()) {
      setStatusMessage('Carregue ou cole o texto do manifesto original para iniciar a conferência.');
      return;
    }

    if (verificationFiles.length === 0) {
      setStatusMessage('Selecione os arquivos ou pasta atual para conferir contra o manifesto.');
      return;
    }

    setIsValidating(true);
    setValidationProgress(0);
    setStatusMessage(null);
    const abort = new AbortController();
    abortValRef.current = abort;

    const { formatted, tz } = formatForensicDate();

    try {
      // 1. Parse manifest entries
      const manifestLines = importedManifestText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const manifestDict = new Map<string, { expectedHash: string; originalPath: string }>();

      for (const line of manifestLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

        // Try CSV
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts[0].toUpperCase() === 'ARQUIVO' || parts[0].toUpperCase() === 'FILENAME') continue;
          if (parts.length >= 5 && parts[4].length === 64) {
            // Format: Arquivo, Caminho_Relativo, Tamanho_Bytes, Algoritmo, Hash_SHA256, Data_Hora
            const path = parts[1] || parts[0];
            manifestDict.set(path.toLowerCase(), {
              expectedHash: parts[4].toLowerCase(),
              originalPath: path,
            });
            continue;
          }
          if (parts[0].length === 64) {
            manifestDict.set(parts[1].toLowerCase(), {
              expectedHash: parts[0].toLowerCase(),
              originalPath: parts[1],
            });
            continue;
          }
        }

        // Try GNU coreutils: HASH  *PATH or HASH  PATH
        const match = trimmed.match(/^([a-fA-F0-9]{32,128})\s+[\*]?(.+)$/);
        if (match) {
          const hash = match[1].toLowerCase();
          const p = match[2].trim();
          manifestDict.set(p.toLowerCase(), { expectedHash: hash, originalPath: p });
          continue;
        }
      }

      // 2. Map current local files
      const localFileMap = new Map<string, File>();
      for (const f of verificationFiles) {
        const rel = ((f as { webkitRelativePath?: string }).webkitRelativePath || f.name).toLowerCase();
        localFileMap.set(rel, f);
      }

      const results: ManifestVerificationItem[] = [];
      const processedLocalPaths = new Set<string>();

      let processedCount = 0;
      const totalOps = manifestDict.size + localFileMap.size;

      // Check all entries listed in the manifest
      for (const [key, manifestInfo] of manifestDict.entries()) {
        if (abort.signal.aborted) break;

        const localFile = localFileMap.get(key) || localFileMap.get(manifestInfo.originalPath.toLowerCase());

        if (!localFile) {
          // File is missing!
          results.push({
            id: generateLocalVerificationId(),
            fileName: manifestInfo.originalPath.split('/').pop() || manifestInfo.originalPath,
            relativePath: manifestInfo.originalPath,
            algorithm: 'SHA-256',
            expectedHash: manifestInfo.expectedHash,
            calculatedHash: undefined,
            status: 'AUSENTE',
            notes: 'Arquivo listado no manifesto mas não encontrado na pasta selecionada.',
          });
        } else {
          processedLocalPaths.add(
            ((localFile as { webkitRelativePath?: string }).webkitRelativePath || localFile.name).toLowerCase()
          );

          // Calculate hash of local file
          const computed = await computeHashes(
            localFile,
            ['SHA-256'],
            undefined,
            abort.signal
          );
          const calcHash = computed['SHA-256'].toLowerCase();
          const match = calcHash === manifestInfo.expectedHash;
          const status: ManifestItemStatus = match ? 'CORRESPONDENTE' : 'DIVERGENTE';

          results.push({
            id: generateLocalVerificationId(),
            fileName: localFile.name,
            relativePath: (localFile as { webkitRelativePath?: string }).webkitRelativePath || localFile.name,
            size: localFile.size,
            formattedSize: formatShortBytes(localFile.size),
            algorithm: 'SHA-256',
            expectedHash: manifestInfo.expectedHash,
            calculatedHash: calcHash,
            status,
            notes: match
              ? 'Integridade do arquivo confirmada contra o manifesto.'
              : 'O arquivo atual difere do registrado originalmente.',
          });

          // Add to session records
          const meta = extractFileMetadata(localFile);
          onAddSessionRecord({
            id: generateLocalVerificationId(),
            timestamp: formatted,
            timezone: tz,
            fileMetadata: meta,
            algorithm: 'SHA-256',
            referenceHash: manifestInfo.expectedHash,
            calculatedHash: calcHash,
            status: match ? 'CORRESPONDENTE' : 'DIVERGENTE',
            notes: `Validação de Manifesto [${meta.relativePath}]`,
          });
        }

        processedCount++;
        setValidationProgress(Math.round((processedCount / totalOps) * 100));
      }

      // Check for additional files present locally that were NOT in the manifest
      for (const [key, file] of localFileMap.entries()) {
        if (abort.signal.aborted) break;

        if (!processedLocalPaths.has(key)) {
          // Additional file detected!
          const computed = await computeHashes(file, ['SHA-256'], undefined, abort.signal);
          const calcHash = computed['SHA-256'].toLowerCase();

          results.push({
            id: generateLocalVerificationId(),
            fileName: file.name,
            relativePath: (file as { webkitRelativePath?: string }).webkitRelativePath || file.name,
            size: file.size,
            formattedSize: formatShortBytes(file.size),
            algorithm: 'SHA-256',
            expectedHash: undefined,
            calculatedHash: calcHash,
            status: 'ADICIONAL',
            notes: 'Arquivo presente na evidência atual que NÃO constava no manifesto original.',
          });
        }
      }

      setVerificationResults(results);
      setStatusMessage(`Validação concluída: ${results.length} itens analisados.`);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setStatusMessage('Validação de manifesto cancelada.');
      } else {
        setStatusMessage(
          err instanceof Error ? `Erro: ${err.message}` : 'Erro na conferência do manifesto.'
        );
      }
    } finally {
      setIsValidating(false);
      abortValRef.current = null;
    }
  };

  // Filter items in validation mode
  const filteredValidation = verificationResults.filter((item) => {
    const matchFilter = statusFilter === 'ALL' || item.status === statusFilter;
    const matchSearch =
      !manifestSearch ||
      item.fileName.toLowerCase().includes(manifestSearch.toLowerCase()) ||
      item.relativePath.toLowerCase().includes(manifestSearch.toLowerCase()) ||
      (item.expectedHash && item.expectedHash.toLowerCase().includes(manifestSearch.toLowerCase())) ||
      (item.calculatedHash && item.calculatedHash.toLowerCase().includes(manifestSearch.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const countCorrespondente = verificationResults.filter((i) => i.status === 'CORRESPONDENTE').length;
  const countDivergente = verificationResults.filter((i) => i.status === 'DIVERGENTE').length;
  const countAusente = verificationResults.filter((i) => i.status === 'AUSENTE').length;
  const countAdicional = verificationResults.filter((i) => i.status === 'ADICIONAL').length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#262930] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <FileCheck2 className="w-6 h-6 text-[#F57917]" />
            Manifesto de Integridade da Extração
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gere ou valide manifestos de integridade criptográfica SHA-256 para extrações forenses completas.
            Distingue arquivos internos, detecta arquivos ausentes ou inserções adicionais.
          </p>
        </div>

        {/* Sub-mode switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-xl border border-[#262930] shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubMode('GERAR')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeSubMode === 'GERAR'
                ? 'bg-[#F57917] text-white shadow-sm'
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
                ? 'bg-[#F57917] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            2. Validar Manifesto Existente
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs text-zinc-300 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#F57917] shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODE 1: GERAR NOVO MANIFESTO */}
      {/* --------------------------------------------------------------------- */}
      {activeSubMode === 'GERAR' && (
        <div className="space-y-5 animate-fade-in">
          <div className="p-5 rounded-2xl bg-[#0F1115] border border-[#262930] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-zinc-300 block">
                  Adicionar Evidências ou Diretório da Extração
                </span>
                <span className="text-[11px] text-zinc-500">
                  Calcula SHA-256 determinístico de cada arquivo preservando os caminhos relativos.
                </span>
              </div>

              <div className="flex items-center gap-2">
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
                  Arquivos
                </button>

                <input
                  ref={genFolderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is standard
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
                  Pasta Inteira
                </button>

                {generationFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setGenerationFiles([]);
                      setManifestItems([]);
                      setStatusMessage(null);
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400 px-2"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {generationFiles.length > 0 && (
              <div className="pt-2 border-t border-[#262930] space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{generationFiles.length} arquivo(s) selecionado(s)</span>
                  <span className="font-mono">
                    Total aprox:{' '}
                    {(
                      generationFiles.reduce((acc, f) => acc + f.size, 0) /
                      (1024 * 1024)
                    ).toFixed(2)}{' '}
                    MB
                  </span>
                </div>

                {isGenerating ? (
                  <div className="space-y-2 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                        Calculando manifesto ({currentFileIdx + 1}/{generationFiles.length}):{' '}
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
                        className="text-xs text-red-400 hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartGeneration}
                    className="w-full py-3 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Manifesto Gerado ({manifestItems.length} arquivos)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportManifestTXT}
                    className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#F57917]" />
                    Exportar TXT
                  </button>
                  <button
                    type="button"
                    onClick={exportManifestCSV}
                    className="py-1.5 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#F57917]" />
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Caminho / Arquivo</th>
                        <th className="py-2.5 px-3 font-semibold">Tamanho</th>
                        <th className="py-2.5 px-4 font-semibold">Hash SHA-256</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262930]">
                      {manifestItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#17191D]/60 transition-colors">
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-white truncate block max-w-sm">
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

      {/* --------------------------------------------------------------------- */}
      {/* MODE 2: VALIDAR MANIFESTO EXISTENTE */}
      {/* --------------------------------------------------------------------- */}
      {activeSubMode === 'VALIDAR' && (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step A: Upload or Paste Manifest */}
            <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                  Passo 1: Manifesto Original
                </span>
                <input
                  ref={manifestFileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleManifestUpload}
                />
                <button
                  type="button"
                  onClick={() => manifestFileInputRef.current?.click()}
                  className="text-xs text-[#F57917] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Carregar Arquivo (.txt / .csv)
                </button>
              </div>

              <textarea
                rows={4}
                value={importedManifestText}
                onChange={(e) => setImportedManifestText(e.target.value)}
                placeholder="Cole aqui o texto do manifesto original (linhas no formato 'HASH  *CAMINHO' ou CSV)..."
                className="w-full p-2.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917] resize-none"
              />
            </div>

            {/* Step B: Select Current Local Files */}
            <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                  Passo 2: Evidência Atual (Arquivos / Pasta)
                </span>
                {verificationFiles.length > 0 && (
                  <span className="text-xs text-zinc-500 font-mono">
                    {verificationFiles.length} item(ns)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={valFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setVerificationFiles(Array.from(e.target.files));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => valFileInputRef.current?.click()}
                  className="flex-1 py-3 px-3 rounded-xl bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-xs font-medium text-white flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#F57917]" />
                  Selecionar Arquivos
                </button>

                <input
                  ref={valFolderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is standard
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setVerificationFiles(Array.from(e.target.files));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => valFolderInputRef.current?.click()}
                  className="flex-1 py-3 px-3 rounded-xl bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-xs font-medium text-white flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4 text-[#F57917]" />
                  Selecionar Pasta Atual
                </button>
              </div>

              {verificationFiles.length > 0 && (
                <div className="text-[11px] text-zinc-400">
                  Pronto para comparar {verificationFiles.length} arquivos locais com o manifesto.
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
                    className="text-xs text-red-400 hover:underline"
                  >
                    Interromper
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartValidation}
                disabled={!importedManifestText.trim() || verificationFiles.length === 0}
                className="w-full py-3.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                CONFERIR E VALIDAR CONTRA O MANIFESTO
              </button>
            )}
          </div>

          {/* Verification Results Dashboard */}
          {verificationResults.length > 0 && (
            <div className="space-y-4">
              {/* Score KPI strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0F1115] border border-emerald-950/60">
                  <span className="text-[11px] font-mono text-emerald-500 block uppercase">
                    Correspondentes
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                    {countCorrespondente}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0F1115] border border-red-950/60">
                  <span className="text-[11px] font-mono text-red-500 block uppercase">
                    Divergentes (Modificados)
                  </span>
                  <span className="text-xl font-bold font-mono text-red-400 tabular-nums">
                    {countDivergente}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0F1115] border border-yellow-950/60">
                  <span className="text-[11px] font-mono text-yellow-500 block uppercase">
                    Ausentes (Faltantes)
                  </span>
                  <span className="text-xl font-bold font-mono text-yellow-400 tabular-nums">
                    {countAusente}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0F1115] border border-purple-950/60">
                  <span className="text-[11px] font-mono text-purple-400 block uppercase">
                    Adicionais (Não Listados)
                  </span>
                  <span className="text-xl font-bold font-mono text-purple-300 tabular-nums">
                    {countAdicional}
                  </span>
                </div>
              </div>

              {/* Filter and Search */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-lg border border-[#262930] overflow-x-auto max-w-full">
                  {[
                    { id: 'ALL', label: 'Todos' },
                    { id: 'CORRESPONDENTE', label: 'Correspondentes' },
                    { id: 'DIVERGENTE', label: 'Divergentes' },
                    { id: 'AUSENTE', label: 'Ausentes' },
                    { id: 'ADICIONAL', label: 'Adicionais' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`py-1 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-[#F57917] text-white shadow-sm'
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
                    placeholder="Filtrar..."
                    value={manifestSearch}
                    onChange={(e) => setManifestSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917]"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-[#262930] overflow-hidden bg-[#0F1115]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                        <th className="py-3 px-4 font-semibold">Caminho / Arquivo</th>
                        <th className="py-3 px-4 font-semibold">Hash Original</th>
                        <th className="py-3 px-4 font-semibold">Hash Atual</th>
                        <th className="py-3 px-4 font-semibold text-right">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262930]">
                      {filteredValidation.map((item) => (
                        <tr key={item.id} className="hover:bg-[#17191D]/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-medium text-white truncate max-w-xs">
                              {item.relativePath}
                            </div>
                            <div className="text-[10px] text-zinc-500">{item.notes}</div>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                            {item.expectedHash ? (
                              <span className="truncate max-w-[140px] inline-block font-mono" title={item.expectedHash}>
                                {item.expectedHash.substring(0, 16)}...{item.expectedHash.slice(-8)}
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-zinc-300">
                            {item.calculatedHash ? (
                              <span className="truncate max-w-[140px] inline-block font-mono" title={item.calculatedHash}>
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
                                ÍNTEGRO
                              </span>
                            )}
                            {item.status === 'DIVERGENTE' && (
                              <span className="inline-flex items-center gap-1 text-red-400 font-bold font-mono text-[11px]">
                                <XCircle className="w-3.5 h-3.5" />
                                DIVERGENTE
                              </span>
                            )}
                            {item.status === 'AUSENTE' && (
                              <span className="inline-flex items-center gap-1 text-yellow-400 font-medium font-mono text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                AUSENTE
                              </span>
                            )}
                            {item.status === 'ADICIONAL' && (
                              <span className="inline-flex items-center gap-1 text-purple-400 font-medium font-mono text-[11px]">
                                <PlusCircle className="w-3.5 h-3.5" />
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
    </div>
  );
};

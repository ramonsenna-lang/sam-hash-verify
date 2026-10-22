import React, { useState, useRef, useId } from 'react';
import {
  Cloud,
  FileCheck2,
  FolderOpen,
  FileText,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Copy,
  Check,
  Download,
  Trash2,
  RotateCcw,
  Search,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileUp,
  FileSpreadsheet,
  Clock,
  Layers,
  Lock,
  Eye,
  Info,
  Link2,
  Unlink,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { GoogleLogo, AppleLogo } from './CloudProviderLogos';
import {
  CloudProvider,
  AppleValidationMode,
  GoogleCloudManifestItem,
  AppleCloudManifestItem,
  CloudVerificationItem,
  CloudAccountCompleteness,
  CloudValidationSession,
  HashAlgorithm,
  SingleValidationRecord,
} from '../types';
import {
  parseGoogleHashPdf,
  parseAppleManifestCsv,
  mergeGoogleManifests,
  GooglePdfParsedResult,
  GoogleManifestMergeResult,
  getForensicConclusion,
} from '../utils/cloudParsers';
import { computeHashes, formatBytes, formatShortBytes } from '../utils/crypto';
import {
  exportCloudValidationPDF,
  exportCloudValidationCSV,
  exportCloudAccountCompletenessCSV,
  exportCloudShaSumList,
  formatForensicDate,
} from '../utils/exporter';
import { auditLogger } from '../utils/auditLogger';

export interface TechnicalDiagnosticRow {
  id: string;
  sourceDocName?: string;
  pdfFileName: string;
  selectedFileName: string;
  relativePath: string;
  account: string;
  associationStatus: 'ASSOCIADO' | 'AMBIGUO' | 'NAO_LOCALIZADO' | 'EXTRA';
  associationType?: 'DIRECT' | 'RELATIVE_PATH' | 'EXTENSION_ADJUSTED' | 'NORMALIZED' | 'MANUAL';
  hashStatus: 'PENDENTE' | 'CALCULANDO' | 'CALCULADO' | 'ERRO';
  comparisonStatus: 'INTEGRO' | 'DIVERGENTE' | 'NAO_COMPARADO';
  finalVerdict: 'INTEGRO' | 'ALTERADO' | 'AUSENTE' | 'EXTRA' | 'AMBIGUO' | 'NAO_VERIFICAVEL';
  declaredHash?: string;
  calculatedHash?: string;
  fileSize?: number;
  formattedSize?: string;
  timeTakenMs?: number;
  ambiguousCandidates?: File[];
  file?: File;
  item?: GoogleCloudManifestItem | AppleCloudManifestItem;
}

interface CloudValidationModuleProps {
  onAddSessionRecord?: (record: SingleValidationRecord) => void;
}

export const CloudValidationModule: React.FC<CloudValidationModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);

  // Common metadata inputs
  const [procedureNumber, setProcedureNumber] = useState<string>('');
  const [internalReference, setInternalReference] = useState<string>('');
  const [examinerName, setExaminerName] = useState<string>('');

  // ---------------------------------------------------------------------------
  // GOOGLE STATE
  // ---------------------------------------------------------------------------
  const [googlePdfs, setGooglePdfs] = useState<
    Array<{
      file: File;
      parsed: GooglePdfParsedResult;
      sha256: string;
    }>
  >([]);
  const [googleMergedItems, setGoogleMergedItems] = useState<GoogleCloudManifestItem[]>([]);
  const [googleDeliveredFiles, setGoogleDeliveredFiles] = useState<File[]>([]);
  const [isParsingGooglePdf, setIsParsingGooglePdf] = useState(false);

  // ---------------------------------------------------------------------------
  // APPLE STATE
  // ---------------------------------------------------------------------------
  const [appleCsvFile, setAppleCsvFile] = useState<File | null>(null);
  const [appleCsvSha256, setAppleCsvSha256] = useState<string>('');
  const [appleItems, setAppleItems] = useState<AppleCloudManifestItem[]>([]);
  const [appleDeliveredFiles, setAppleDeliveredFiles] = useState<File[]>([]);
  const [appleMode, setAppleMode] = useState<AppleValidationMode>('GPG_ENCRYPTED');
  const [appleAlgorithm, setAppleAlgorithm] = useState<'SHA-256' | 'SHA-512'>('SHA-256');
  const [isParsingAppleCsv, setIsParsingAppleCsv] = useState(false);

  // ---------------------------------------------------------------------------
  // VERIFICATION PROCESS STATE
  // ---------------------------------------------------------------------------
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesToHash, setTotalFilesToHash] = useState(0);
  const [currentHashedName, setCurrentHashedName] = useState('');
  const [currentBytesProcessed, setCurrentBytesProcessed] = useState(0);
  const [currentFileTotalBytes, setCurrentFileTotalBytes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [validationSession, setValidationSession] = useState<CloudValidationSession | null>(null);

  // Active view filters in results
  const [activeTabFilter, setActiveTabFilter] = useState<
    'TODOS' | 'INTEGRO' | 'ALTERADO' | 'AUSENTE' | 'EXTRA' | 'NAO_VERIFICAVEL'
  >('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAccountTab, setActiveAccountTab] = useState<'ITEMS' | 'ACCOUNTS'>('ACCOUNTS');

  // Copied indicator
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Diagnostics, Previews & Manual Supervised Association
  const [googleMergeResult, setGoogleMergeResult] = useState<GoogleManifestMergeResult | null>(null);
  const [googlePreviewOpen, setGooglePreviewOpen] = useState(true);
  const [googlePreviewSearch, setGooglePreviewSearch] = useState('');
  const [applePreviewOpen, setApplePreviewOpen] = useState(true);
  const [applePreviewSearch, setApplePreviewSearch] = useState('');
  const [diagnosticOpen, setDiagnosticOpen] = useState(true);
  const [diagnosticSearch, setDiagnosticSearch] = useState('');
  const [activeDiagTab, setActiveDiagTab] = useState<'MATCHED' | 'AMBIGUOUS' | 'EXTRAS' | 'MISSING' | 'ALERTS' | 'ALL'>('MATCHED');
  const [manualAssociations, setManualAssociations] = useState<Record<string, string>>({});

  // Abort control & clear confirmation modal
  const abortControllerRef = useRef<AbortController | null>(null);
  const opSeqRef = useRef<number>(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
  } | null>(null);

  // Hidden inputs IDs
  const googlePdfInputId = useId();
  const googleFolderInputId = useId();
  const googleFilesInputId = useId();
  const appleCsvInputId = useId();
  const appleFolderInputId = useId();
  const appleFilesInputId = useId();

  // Helper to calculate SHA-256 of file buffer
  const calculateSha256 = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  // ---------------------------------------------------------------------------
  // GOOGLE HANDLERS
  // ---------------------------------------------------------------------------
  const handleGooglePdfUpload = async (files: FileList | File[]) => {
    setIsParsingGooglePdf(true);
    setStatusMessage(null);
    try {
      const newPdfs = [...googlePdfs];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;

        const sha256 = await calculateSha256(file);
        const parsed = await parseGoogleHashPdf(file, file.name);
        newPdfs.push({ file, parsed, sha256 });

        if (parsed.procedureNumber && !procedureNumber) {
          setProcedureNumber(parsed.procedureNumber);
        }
        if (parsed.internalReference && !internalReference) {
          setInternalReference(parsed.internalReference);
        }
      }

      setGooglePdfs(newPdfs);

      const merged = mergeGoogleManifests(newPdfs.map((p) => p.parsed));
      setGoogleMergedItems(merged.items);
      setGoogleMergeResult(merged);

      if (merged.procedureNumber && !procedureNumber) {
        setProcedureNumber(merged.procedureNumber);
      }
      if (merged.internalReference && !internalReference) {
        setInternalReference(merged.internalReference);
      }

      setStatusMessage({
        type: merged.items.length > 0 ? 'success' : 'warning',
        text:
          merged.items.length > 0
            ? `${newPdfs.length} PDF(s) da Google carregado(s) com sucesso. Total de ${merged.items.length} registro(s) de hash extraído(s).`
            : `Aviso: Nenhum registro de hash identificado nos PDFs carregados. Verifique se o arquivo corresponde ao documento judicial de hashes.`,
      });
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `Erro ao processar PDF da Google: ${err instanceof Error ? err.message : 'Arquivo inválido ou ilegível.'}`,
      });
    } finally {
      setIsParsingGooglePdf(false);
    }
  };

  const handleRemoveGooglePdf = (idxToRemove: number) => {
    const next = googlePdfs.filter((_, i) => i !== idxToRemove);
    setGooglePdfs(next);
    if (next.length === 0) {
      setGoogleMergedItems([]);
      setGoogleMergeResult(null);
    } else {
      const merged = mergeGoogleManifests(next.map((p) => p.parsed));
      setGoogleMergedItems(merged.items);
      setGoogleMergeResult(merged);
    }
  };

  const handleLoadSampleGooglePdf = async () => {
    setIsParsingGooglePdf(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/assets/aistudio/Valores_de_Hash_152344365__1__c1941beb.pdf');
      if (!response.ok) throw new Error('Não foi possível carregar o arquivo de exemplo do Google.');
      const blob = await response.blob();
      const sampleFile = new File([blob], 'Valores de Hash 152344365 (1).pdf', {
        type: 'application/pdf',
      });
      await handleGooglePdfUpload([sampleFile]);
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Não foi possível carregar o PDF de amostra oficial.',
      });
      setIsParsingGooglePdf(false);
    }
  };

  // ---------------------------------------------------------------------------
  // APPLE HANDLERS
  // ---------------------------------------------------------------------------
  const handleAppleCsvUpload = async (file: File) => {
    setIsParsingAppleCsv(true);
    setStatusMessage(null);
    try {
      const sha256 = await calculateSha256(file);
      const text = await file.text();
      const parsed = parseAppleManifestCsv(text, file.name);

      setAppleCsvFile(file);
      setAppleCsvSha256(sha256);
      setAppleItems(parsed.items);

      if (parsed.caseNumber && !procedureNumber) {
        setProcedureNumber(parsed.caseNumber);
      }

      setStatusMessage({
        type: 'success',
        text: `Manifesto CSV da Apple processado com sucesso. ${parsed.items.length} registro(s) em ${new Set(parsed.items.map((it) => it.accountId)).size} conta(s).`,
      });
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `Erro ao processar CSV da Apple: ${err instanceof Error ? err.message : 'Formato inválido.'}`,
      });
    } finally {
      setIsParsingAppleCsv(false);
    }
  };

  const handleLoadSampleAppleCsv = async () => {
    setIsParsingAppleCsv(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/assets/aistudio/arquivoenviadopelaApple_78b47c64.csv');
      if (!response.ok) throw new Error('Não foi possível carregar o CSV de exemplo da Apple.');
      const blob = await response.blob();
      const sampleFile = new File([blob], '2228147_20261023150000-account-download-details.csv', {
        type: 'text/csv',
      });
      await handleAppleCsvUpload(sampleFile);
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Não foi possível carregar o manifesto CSV de amostra oficial.',
      });
      setIsParsingAppleCsv(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CLEAR HANDLERS
  // ---------------------------------------------------------------------------
  const handleClearSelection = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    opSeqRef.current++;
    setIsProcessing(false);
    setProgressPercent(0);

    if (selectedProvider === 'GOOGLE') {
      setGoogleDeliveredFiles([]);
    } else {
      setAppleDeliveredFiles([]);
    }
    setValidationSession(null);
    setStatusMessage({
      type: 'info',
      text: 'Seleção de arquivos limpa. O manifesto carregado foi preservado.',
    });
  };

  const handleClearAll = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    opSeqRef.current++;
    setIsProcessing(false);
    setProgressPercent(0);

    if (selectedProvider === 'GOOGLE') {
      setGooglePdfs([]);
      setGoogleMergedItems([]);
      setGoogleDeliveredFiles([]);
      setGoogleMergeResult(null);
    } else {
      setAppleCsvFile(null);
      setAppleCsvSha256('');
      setAppleItems([]);
      setAppleDeliveredFiles([]);
    }

    setManualAssociations({});
    setProcedureNumber('');
    setInternalReference('');
    setExaminerName('');
    setValidationSession(null);
    setShowClearConfirm(false);
    setStatusMessage({
      type: 'info',
      text: 'Sessão reiniciada completamente.',
    });
  };

  // ---------------------------------------------------------------------------
  // DIAGNOSTIC & ASSOCIATION ENGINE (G-WARD & A-WARD RESILIENT MATCHING)
  // ---------------------------------------------------------------------------
  const computeDiagnostics = () => {
    const isGoogle = selectedProvider === 'GOOGLE';
    const declaredList = isGoogle ? googleMergedItems : appleItems;
    const deliveredList = isGoogle ? googleDeliveredFiles : appleDeliveredFiles;

    // 1. Build immutable inventory of delivered File objects
    const deliveredInventory = deliveredList.map((file, idx) => ({
      id: `deliv-${idx}-${file.name}`,
      file,
      name: file.name,
      relativePath: (file as { webkitRelativePath?: string }).webkitRelativePath || file.name,
      size: file.size,
      formattedSize: formatBytes(file.size),
    }));

    const cleanStr = (s: string) => s.trim().replace(/:+$/, '').trim();
    const normSeparators = (p: string) => p.replace(/\\+/g, '/').replace(/\/+/g, '/').trim();
    const getLeaf = (p: string) => {
      const norm = normSeparators(cleanStr(p));
      const parts = norm.split('/');
      return parts[parts.length - 1] || norm;
    };
    const normAlphanum = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '');

    // Maps to track deterministic associations
    const assignedDeclaredMap = new Map<
      string,
      {
        delivered: typeof deliveredInventory[0];
        matchType: 'MANUAL' | 'DIRECT' | 'RELATIVE_PATH' | 'EXTENSION_ADJUSTED' | 'NORMALIZED';
        targetMode?: 'GPG' | 'CLEAR_TEXT';
      }
    >();
    const assignedDeliveredIds = new Set<string>();
    const ambiguousDeclaredMap = new Map<string, typeof deliveredInventory>();

    // Step 1: Manual associations first (highest priority)
    for (const dec of declaredList) {
      for (const [key, targetDecId] of Object.entries(manualAssociations)) {
        if (targetDecId === dec.id) {
          const matchedInv = deliveredInventory.find(
            (inv) =>
              !assignedDeliveredIds.has(inv.id) &&
              (inv.id === key || inv.name === key || inv.relativePath === key)
          );
          if (matchedInv) {
            const isZip =
              matchedInv.name.toLowerCase().endsWith('.zip') &&
              !matchedInv.name.toLowerCase().endsWith('.gpg');
            assignedDeclaredMap.set(dec.id, {
              delivered: matchedInv,
              matchType: 'MANUAL',
              targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
            });
            assignedDeliveredIds.add(matchedInv.id);
            break;
          }
        }
      }
    }

    // Step 2: Exact Relative Path Match (prioritizes matching full directory hierarchy)
    for (const dec of declaredList) {
      if (assignedDeclaredMap.has(dec.id)) continue;
      const decClean = cleanStr(dec.fileName);
      const decNormPath = normSeparators(decClean).toLowerCase();

      const candidates = deliveredInventory.filter(
        (inv) =>
          !assignedDeliveredIds.has(inv.id) &&
          normSeparators(inv.relativePath).toLowerCase() === decNormPath
      );

      if (candidates.length === 1) {
        const isZip =
          candidates[0].name.toLowerCase().endsWith('.zip') &&
          !candidates[0].name.toLowerCase().endsWith('.gpg');
        assignedDeclaredMap.set(dec.id, {
          delivered: candidates[0],
          matchType: 'RELATIVE_PATH',
          targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
        });
        assignedDeliveredIds.add(candidates[0].id);
      } else if (candidates.length > 1) {
        ambiguousDeclaredMap.set(dec.id, candidates);
      }
    }

    // Step 3: Exact Basename Match (Rule 1 & Rule 3: full declared name matches file.name)
    for (const dec of declaredList) {
      if (assignedDeclaredMap.has(dec.id) || ambiguousDeclaredMap.has(dec.id)) continue;
      const decLeaf = getLeaf(dec.fileName).toLowerCase();

      const candidates = deliveredInventory.filter(
        (inv) =>
          !assignedDeliveredIds.has(inv.id) &&
          getLeaf(inv.name).toLowerCase() === decLeaf
      );

      if (candidates.length === 1) {
        const isZip =
          candidates[0].name.toLowerCase().endsWith('.zip') &&
          !candidates[0].name.toLowerCase().endsWith('.gpg');
        assignedDeclaredMap.set(dec.id, {
          delivered: candidates[0],
          matchType: 'DIRECT',
          targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
        });
        assignedDeliveredIds.add(candidates[0].id);
      } else if (candidates.length > 1) {
        ambiguousDeclaredMap.set(dec.id, candidates);
      }
    }

    // Step 4: Subfolder ending match (Rule 3: locates file in any subfolder)
    for (const dec of declaredList) {
      if (assignedDeclaredMap.has(dec.id) || ambiguousDeclaredMap.has(dec.id)) continue;
      const decLeaf = getLeaf(dec.fileName).toLowerCase();

      const candidates = deliveredInventory.filter(
        (inv) =>
          !assignedDeliveredIds.has(inv.id) &&
          (normSeparators(inv.relativePath).toLowerCase().endsWith('/' + decLeaf) ||
            getLeaf(inv.relativePath).toLowerCase() === decLeaf)
      );

      if (candidates.length === 1) {
        const isZip =
          candidates[0].name.toLowerCase().endsWith('.zip') &&
          !candidates[0].name.toLowerCase().endsWith('.gpg');
        assignedDeclaredMap.set(dec.id, {
          delivered: candidates[0],
          matchType: 'DIRECT',
          targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
        });
        assignedDeliveredIds.add(candidates[0].id);
      } else if (candidates.length > 1) {
        ambiguousDeclaredMap.set(dec.id, candidates);
      }
    }

    // Step 5: Apple Dual-Extension Match (.zip vs .zip.gpg)
    if (!isGoogle) {
      for (const dec of declaredList) {
        if (assignedDeclaredMap.has(dec.id) || ambiguousDeclaredMap.has(dec.id)) continue;
        const cleanDec = cleanStr(dec.fileName).toLowerCase();
        const decWithoutGpg = cleanDec.replace(/\.gpg$/i, '');

        const candidates = deliveredInventory.filter((inv) => {
          if (assignedDeliveredIds.has(inv.id)) return false;
          const cleanInv = inv.name.trim().toLowerCase();
          const invWithoutGpg = cleanInv.replace(/\.gpg$/i, '');
          return cleanInv === decWithoutGpg || invWithoutGpg === cleanDec;
        });

        if (candidates.length === 1) {
          const isZip =
            candidates[0].name.toLowerCase().endsWith('.zip') &&
            !candidates[0].name.toLowerCase().endsWith('.gpg');
          assignedDeclaredMap.set(dec.id, {
            delivered: candidates[0],
            matchType: 'EXTENSION_ADJUSTED',
            targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
          });
          assignedDeliveredIds.add(candidates[0].id);
        } else if (candidates.length > 1) {
          ambiguousDeclaredMap.set(dec.id, candidates);
        }
      }
    }

    // Step 6: Safe Normalized Match (collapsing multiple spaces, underscores, dots)
    for (const dec of declaredList) {
      if (assignedDeclaredMap.has(dec.id) || ambiguousDeclaredMap.has(dec.id)) continue;
      const normDec = normAlphanum(getLeaf(dec.fileName));

      const candidates = deliveredInventory.filter(
        (inv) =>
          !assignedDeliveredIds.has(inv.id) &&
          normAlphanum(getLeaf(inv.name)) === normDec
      );

      if (candidates.length === 1) {
        const isZip =
          candidates[0].name.toLowerCase().endsWith('.zip') &&
          !candidates[0].name.toLowerCase().endsWith('.gpg');
        assignedDeclaredMap.set(dec.id, {
          delivered: candidates[0],
          matchType: 'NORMALIZED',
          targetMode: isZip ? 'CLEAR_TEXT' : 'GPG',
        });
        assignedDeliveredIds.add(candidates[0].id);
      } else if (candidates.length > 1) {
        ambiguousDeclaredMap.set(dec.id, candidates);
      }
    }

    // Results assembly
    const matchedEntries: Array<{
      file: File;
      item: GoogleCloudManifestItem | AppleCloudManifestItem;
      matchType: 'MANUAL' | 'DIRECT' | 'RELATIVE_PATH' | 'EXTENSION_ADJUSTED' | 'NORMALIZED';
      targetMode?: 'GPG' | 'CLEAR_TEXT';
      relativePath: string;
      deliveredId: string;
    }> = [];

    assignedDeclaredMap.forEach((data, decId) => {
      const item = declaredList.find((it) => it.id === decId)!;
      matchedEntries.push({
        file: data.delivered.file,
        item,
        matchType: data.matchType,
        targetMode: data.targetMode,
        relativePath: data.delivered.relativePath,
        deliveredId: data.delivered.id,
      });
    });

    const extras = deliveredInventory
      .filter((inv) => !assignedDeliveredIds.has(inv.id))
      .map((inv) => inv.file);
    const missing = declaredList.filter(
      (dec) => !assignedDeclaredMap.has(dec.id) && !ambiguousDeclaredMap.has(dec.id)
    );
    const ambiguous = declaredList.filter((dec) => ambiguousDeclaredMap.has(dec.id));

    const directCount = matchedEntries.filter(
      (m) => m.matchType === 'DIRECT' || m.matchType === 'RELATIVE_PATH'
    ).length;
    const adjustedCount = matchedEntries.filter(
      (m) => m.matchType === 'EXTENSION_ADJUSTED' || m.matchType === 'NORMALIZED'
    ).length;
    const manualCount = matchedEntries.filter((m) => m.matchType === 'MANUAL').length;
    const ambiguousCount = ambiguous.length;

    // Technical Rows construction for the Technical State Table
    const technicalRows: TechnicalDiagnosticRow[] = [];

    declaredList.forEach((dec, idx) => {
      const match = assignedDeclaredMap.get(dec.id);
      const isAmbiguous = ambiguousDeclaredMap.has(dec.id);
      const ambiguousFiles = isAmbiguous
        ? ambiguousDeclaredMap.get(dec.id)!.map((i) => i.file)
        : undefined;

      // Check if session has verified this item
      const sessionItem = validationSession?.items.find(
        (si) => si.fileName === dec.fileName && si.verdict !== 'EXTRA'
      );

      let assocStatus: 'ASSOCIADO' | 'AMBIGUO' | 'NAO_LOCALIZADO' | 'EXTRA' = 'NAO_LOCALIZADO';
      if (match) assocStatus = 'ASSOCIADO';
      else if (isAmbiguous) assocStatus = 'AMBIGUO';

      let hashStatus: 'PENDENTE' | 'CALCULANDO' | 'CALCULADO' | 'ERRO' = 'PENDENTE';
      let comparisonStatus: 'INTEGRO' | 'DIVERGENTE' | 'NAO_COMPARADO' = 'NAO_COMPARADO';
      let finalVerdict:
        | 'INTEGRO'
        | 'ALTERADO'
        | 'AUSENTE'
        | 'EXTRA'
        | 'AMBIGUO'
        | 'NAO_VERIFICAVEL' = 'AUSENTE';

      if (sessionItem) {
        if (sessionItem.verdict === 'INTEGRO') {
          hashStatus = 'CALCULADO';
          comparisonStatus = 'INTEGRO';
          finalVerdict = 'INTEGRO';
        } else if (sessionItem.verdict === 'ALTERADO') {
          hashStatus = 'CALCULADO';
          comparisonStatus = 'DIVERGENTE';
          finalVerdict = 'ALTERADO';
        } else if (sessionItem.verdict === 'NAO_VERIFICAVEL') {
          hashStatus = 'PENDENTE';
          comparisonStatus = 'NAO_COMPARADO';
          finalVerdict = 'NAO_VERIFICAVEL';
        } else {
          finalVerdict = 'AUSENTE';
        }
      } else if (match) {
        finalVerdict = 'AUSENTE'; // Ready to calculate
      } else if (isAmbiguous) {
        finalVerdict = 'AMBIGUO';
      }

      technicalRows.push({
        id: `tech-dec-${idx + 1}`,
        sourceDocName: 'sourcePdfName' in dec ? (dec.sourcePdfName || '-') : ((dec as AppleCloudManifestItem).sourceCsvName || '-'),
        pdfFileName: dec.fileName,
        selectedFileName: match ? match.delivered.name : '-',
        relativePath: match ? match.delivered.relativePath : '-',
        account: 'account' in dec ? dec.account : dec.accountId,
        associationStatus: assocStatus,
        associationType: match?.matchType,
        hashStatus,
        comparisonStatus,
        finalVerdict,
        declaredHash:
          'declaredHash' in dec
            ? dec.declaredHash
            : dec.gpgSha256 || dec.clearTextSha256,
        calculatedHash: sessionItem?.calculatedHash,
        fileSize: match?.delivered.size,
        formattedSize: match?.delivered.formattedSize,
        timeTakenMs: sessionItem?.timeTakenMs,
        ambiguousCandidates: ambiguousFiles,
        file: match?.delivered.file,
        item: dec,
      });
    });

    extras.forEach((file, idx) => {
      const relPath = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      technicalRows.push({
        id: `tech-extra-${idx + 1}`,
        pdfFileName: '(Não consta no PDF / CSV)',
        selectedFileName: file.name,
        relativePath: relPath,
        account: 'EXTRA',
        associationStatus: 'EXTRA',
        hashStatus: 'PENDENTE',
        comparisonStatus: 'NAO_COMPARADO',
        finalVerdict: 'EXTRA',
        declaredHash: undefined,
        calculatedHash: undefined,
        fileSize: file.size,
        formattedSize: formatBytes(file.size),
        file,
      });
    });

    const calculatedHashCount = technicalRows.filter((r) => r.hashStatus === 'CALCULADO').length;
    const integroCount = technicalRows.filter((r) => r.finalVerdict === 'INTEGRO').length;
    const divergentCount = technicalRows.filter((r) => r.finalVerdict === 'ALTERADO').length;
    const pendingHashCount = technicalRows.filter(
      (r) => r.associationStatus === 'ASSOCIADO' && r.hashStatus === 'PENDENTE'
    ).length;

    return {
      declaredTotal: declaredList.length,
      deliveredTotal: deliveredList.length,
      assignedDeclaredMap,
      assignedDeliveredIds,
      ambiguousDeclaredMap,
      matchedEntries,
      directCount,
      adjustedCount,
      manualCount,
      ambiguousCount,
      pendingHashCount,
      calculatedHashCount,
      integroCount,
      divergentCount,
      totalAssociated: matchedEntries.length,
      extras,
      missing,
      ambiguous,
      technicalRows,
    };
  };

  const handleManualAssociate = (fileKey: string, itemId: string) => {
    if (!itemId) {
      setManualAssociations((prev) => {
        const next = { ...prev };
        delete next[fileKey];
        return next;
      });
    } else {
      setManualAssociations((prev) => ({
        ...prev,
        [fileKey]: itemId,
      }));
    }
  };

  const handleRemoveManualAssociation = (fileKey: string) => {
    setManualAssociations((prev) => {
      const next = { ...prev };
      delete next[fileKey];
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // RUN VERIFICATION ENGINE (BIDIRECTIONAL)
  // ---------------------------------------------------------------------------
  const handleStartVerification = async () => {
    if (!selectedProvider) return;

    const currentOp = ++opSeqRef.current;
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsProcessing(true);
    setProgressPercent(0);
    setCurrentBytesProcessed(0);
    setCurrentFileTotalBytes(0);
    setElapsedSeconds(0);
    setValidationSession(null);
    setStatusMessage(null);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const deliveredFiles =
        selectedProvider === 'GOOGLE' ? googleDeliveredFiles : appleDeliveredFiles;

      // Compute unified diagnostics & deterministic associations
      const diag = computeDiagnostics();

      const verificationItems: CloudVerificationItem[] = [];
      const matchedDeliveredFileSet = new Set<File>();

      // 1. Process items declared in Provider's Document
      if (selectedProvider === 'GOOGLE') {
        const totalItems = googleMergedItems.length;
        const totalToHash = diag.matchedEntries.length;
        setTotalFilesToHash(totalToHash > 0 ? totalToHash : totalItems);

        let hashedIdx = 0;

        for (let i = 0; i < totalItems; i++) {
          if (opSeqRef.current !== currentOp || signal.aborted) {
            throw new Error('Operação cancelada pelo usuário.');
          }

          const decItem = googleMergedItems[i];
          const matchData = diag.assignedDeclaredMap.get(decItem.id);

          if (!matchData) {
            // Ausente
            verificationItems.push({
              id: `v-goog-${i + 1}`,
              sequence: i + 1,
              provider: 'GOOGLE',
              account: decItem.account,
              fileName: decItem.fileName,
              algorithm: 'SHA-512',
              declaredHash: decItem.declaredHash,
              calculatedHash: undefined,
              verdict: 'AUSENTE',
              verdictLabel: 'AUSENTE (FALTANDO)',
              severity: 'warning',
              sourceDoc: decItem.sourcePdfName,
              notes: 'Declarado no PDF de hashes do Google, mas arquivo não localizado na entrega.',
            });
          } else {
            hashedIdx++;
            const matchedFile = matchData.delivered.file;
            matchedDeliveredFileSet.add(matchedFile);

            setCurrentFileIndex(hashedIdx);
            setCurrentHashedName(matchedFile.name);
            setCurrentFileTotalBytes(matchedFile.size);
            setCurrentBytesProcessed(0);

            const t0 = performance.now();

            // Calculate real SHA-512 in chunks with streaming progress
            const hashResult = await computeHashes(
              matchedFile,
              ['SHA-512'],
              (pct, bytesProcessed, totalBytes) => {
                setCurrentBytesProcessed(bytesProcessed);
                setCurrentFileTotalBytes(totalBytes);
                const overall = Math.round(
                  ((hashedIdx - 1) / Math.max(1, totalToHash)) * 100 +
                    pct / Math.max(1, totalToHash)
                );
                setProgressPercent(Math.min(99, overall));
              },
              signal
            );
            const calcSha512 = hashResult['SHA-512'].toLowerCase().trim();
            const expectedSha512 = decItem.declaredHash.toLowerCase().trim();
            const elapsed = Math.round(performance.now() - t0);

            const isMatch = calcSha512 === expectedSha512;

            verificationItems.push({
              id: `v-goog-${i + 1}`,
              sequence: i + 1,
              provider: 'GOOGLE',
              account: decItem.account,
              fileName: decItem.fileName,
              relativePath: matchData.delivered.relativePath,
              algorithm: 'SHA-512',
              declaredHash: decItem.declaredHash,
              calculatedHash: calcSha512,
              verdict: isMatch ? 'INTEGRO' : 'ALTERADO',
              verdictLabel: isMatch ? 'ÍNTEGRO (OK)' : 'ALTERADO (FALHA)',
              severity: isMatch ? 'none' : 'grave',
              deliveredFile: matchedFile,
              fileSize: matchedFile.size,
              formattedSize: formatBytes(matchedFile.size),
              timeTakenMs: elapsed,
              sourceDoc: decItem.sourcePdfName,
              notes: isMatch
                ? `Hash SHA-512 confere rigorosamente com o PDF oficial do Google (${
                    matchData.matchType === 'MANUAL'
                      ? 'Associação manual'
                      : matchData.matchType === 'RELATIVE_PATH'
                      ? 'Correspondência por caminho relativo'
                      : matchData.matchType === 'NORMALIZED'
                      ? 'Correspondência normalizada'
                      : 'Correspondência direta'
                  }).`
                : 'ALERTA PERICIAL: Divergência detectada entre o arquivo recebido e o declarado pelo Google.',
            });
          }
        }
      } else {
        // APPLE VERIFICATION
        const totalItems = appleItems.length;
        const totalToHash = diag.matchedEntries.length;
        setTotalFilesToHash(totalToHash > 0 ? totalToHash : totalItems);

        let hashedIdx = 0;

        for (let i = 0; i < totalItems; i++) {
          if (opSeqRef.current !== currentOp || signal.aborted) {
            throw new Error('Operação cancelada pelo usuário.');
          }

          const decItem = appleItems[i];
          const matchData = diag.assignedDeclaredMap.get(decItem.id);

          if (!matchData) {
            const fallbackHash =
              appleMode === 'GPG_ENCRYPTED'
                ? appleAlgorithm === 'SHA-256'
                  ? decItem.gpgSha256
                  : decItem.gpgSha512
                : appleAlgorithm === 'SHA-256'
                ? decItem.clearTextSha256
                : decItem.clearTextSha512;

            verificationItems.push({
              id: `v-appl-${i + 1}`,
              sequence: i + 1,
              provider: 'APPLE',
              account: decItem.accountId,
              fileName: decItem.fileName,
              categoryOrProduct: decItem.dataType,
              algorithm: appleAlgorithm,
              declaredHash: fallbackHash,
              calculatedHash: undefined,
              verdict: 'AUSENTE',
              verdictLabel: 'AUSENTE (FALTANDO)',
              severity: 'warning',
              sourceDoc: decItem.sourceCsvName,
              gpgSize: decItem.gpgSize,
              expiryDate: decItem.expiryDate,
              notes: 'Declarado no manifesto CSV da Apple, porém arquivo não localizado na entrega.',
            });
          } else {
            hashedIdx++;
            const matchedFile = matchData.delivered.file;
            matchedDeliveredFileSet.add(matchedFile);

            setCurrentFileIndex(hashedIdx);
            setCurrentHashedName(matchedFile.name);
            setCurrentFileTotalBytes(matchedFile.size);
            setCurrentBytesProcessed(0);

            const isPhysicalClearText =
              matchData.targetMode === 'CLEAR_TEXT' ||
              (matchedFile.name.toLowerCase().endsWith('.zip') &&
                !matchedFile.name.toLowerCase().endsWith('.gpg'));

            const expectedHash = isPhysicalClearText
              ? appleAlgorithm === 'SHA-256'
                ? decItem.clearTextSha256
                : decItem.clearTextSha512
              : appleAlgorithm === 'SHA-256'
              ? decItem.gpgSha256
              : decItem.gpgSha512;

            if (!expectedHash) {
              verificationItems.push({
                id: `v-appl-${i + 1}`,
                sequence: i + 1,
                provider: 'APPLE',
                account: decItem.accountId,
                fileName: decItem.fileName,
                relativePath: matchData.delivered.relativePath,
                categoryOrProduct: decItem.dataType,
                algorithm: appleAlgorithm,
                declaredHash: undefined,
                calculatedHash: undefined,
                verdict: 'NAO_VERIFICAVEL',
                verdictLabel: 'NÃO VERIFICÁVEL',
                severity: 'warning',
                deliveredFile: matchedFile,
                fileSize: matchedFile.size,
                formattedSize: formatBytes(matchedFile.size),
                sourceDoc: decItem.sourceCsvName,
                notes:
                  'Coluna de hash vazia no manifesto da Apple para esta modalidade. Ausência de hash tratada como NÃO VERIFICÁVEL.',
              });
            } else {
              const t0 = performance.now();
              const hashResult = await computeHashes(
                matchedFile,
                [appleAlgorithm],
                (pct, bytesProcessed, totalBytes) => {
                  setCurrentBytesProcessed(bytesProcessed);
                  setCurrentFileTotalBytes(totalBytes);
                  const overall = Math.round(
                    ((hashedIdx - 1) / Math.max(1, totalToHash)) * 100 +
                      pct / Math.max(1, totalToHash)
                  );
                  setProgressPercent(Math.min(99, overall));
                },
                signal
              );
              const calcHash = hashResult[appleAlgorithm].toLowerCase().trim();
              const elapsed = Math.round(performance.now() - t0);
              const isMatch = calcHash === expectedHash.toLowerCase().trim();

              const noteDetail = isPhysicalClearText
                ? 'Conferido contra CLEAR_TEXT_SHA'
                : 'Conferido contra GPG_SHA';

              verificationItems.push({
                id: `v-appl-${i + 1}`,
                sequence: i + 1,
                provider: 'APPLE',
                account: decItem.accountId,
                fileName: decItem.fileName,
                relativePath: matchData.delivered.relativePath,
                categoryOrProduct: decItem.dataType,
                algorithm: appleAlgorithm,
                declaredHash: expectedHash,
                calculatedHash: calcHash,
                verdict: isMatch ? 'INTEGRO' : 'ALTERADO',
                verdictLabel: isMatch ? 'ÍNTEGRO (OK)' : 'ALTERADO (FALHA)',
                severity: isMatch ? 'none' : 'grave',
                deliveredFile: matchedFile,
                fileSize: matchedFile.size,
                formattedSize: formatBytes(matchedFile.size),
                timeTakenMs: elapsed,
                sourceDoc: decItem.sourceCsvName,
                gpgSize: decItem.gpgSize,
                expiryDate: decItem.expiryDate,
                notes: isMatch
                  ? `Hash ${appleAlgorithm} confere com o manifesto CSV da Apple (${noteDetail}, ${
                      matchData.matchType === 'MANUAL'
                        ? 'Associação manual'
                        : matchData.matchType === 'EXTENSION_ADJUSTED'
                        ? 'Ajuste de extensão'
                        : 'Correspondência direta'
                    }).`
                  : `ALERTA PERICIAL: Hash ${appleAlgorithm} calculado diverge do manifesto CSV da Apple (${noteDetail}).`,
              });
            }
          }
        }
      }

      // 2. Confrontation in reverse: Delivered files NOT associated with manifest -> EXTRA
      deliveredFiles.forEach((file) => {
        if (!matchedDeliveredFileSet.has(file)) {
          const isKnownContainer =
            /^\d+-\d{8}-\d+\.zip$/i.test(file.name) ||
            /carta/i.test(file.name) ||
            /anexo/i.test(file.name);

          verificationItems.push({
            id: `v-extra-${verificationItems.length + 1}`,
            sequence: verificationItems.length + 1,
            provider: selectedProvider,
            account: 'EXTRA',
            fileName: file.name,
            relativePath: (file as { webkitRelativePath?: string }).webkitRelativePath || file.name,
            algorithm: selectedProvider === 'GOOGLE' ? 'SHA-512' : appleAlgorithm,
            declaredHash: undefined,
            calculatedHash: undefined,
            verdict: 'EXTRA',
            verdictLabel: isKnownContainer
              ? 'EXTRA (VOLUME/CARTA)'
              : 'EXTRA (NÃO DECLARADO)',
            severity: isKnownContainer ? 'warning' : 'grave',
            deliveredFile: file,
            fileSize: file.size,
            formattedSize: formatBytes(file.size),
            notes: isKnownContainer
              ? 'Arquivo de volume ou carta do provedor que não possui hash individual listado no documento.'
              : 'Arquivo presente na mídia entregue, porém NÃO consta na relação oficial de hashes do provedor.',
          });
        }
      });

      // 3. Compute Completeness strictly by DECLARED Accounts (never create artificial accounts from Extras)
      const declaredAccountsList =
        selectedProvider === 'GOOGLE'
          ? Array.from(new Set(googleMergedItems.map((i) => i.account || 'CONTA_PADRAO')))
          : Array.from(new Set(appleItems.map((i) => i.accountId || 'CONTA_PADRAO')));

      const accountsCompleteness: CloudAccountCompleteness[] = declaredAccountsList.map(
        (accName) => {
          const accItems = verificationItems.filter(
            (it) => it.verdict !== 'EXTRA' && it.account === accName
          );
          const expected = accItems.length;
          const delivered = accItems.filter((it) => !!it.deliveredFile).length;
          const integro = accItems.filter((it) => it.verdict === 'INTEGRO').length;
          const alterado = accItems.filter((it) => it.verdict === 'ALTERADO').length;
          const ausente = accItems.filter((it) => it.verdict === 'AUSENTE').length;
          const extra = 0;
          const naoVerificavel = accItems.filter(
            (it) => it.verdict === 'NAO_VERIFICAVEL'
          ).length;

          let status: 'INTEGRA' | 'INCOMPLETA' | 'DIVERGENTE' | 'SEM_ENTREGA' = 'INTEGRA';
          let statusLabel = '100% Conforme';

          if (delivered === 0 && expected > 0) {
            status = 'SEM_ENTREGA';
            statusLabel = 'Sem Arquivos Entregues';
          } else if (alterado > 0) {
            status = 'DIVERGENTE';
            statusLabel = 'Divergência Crítica de Hash';
          } else if (ausente > 0) {
            status = 'INCOMPLETA';
            statusLabel = `${ausente} Arquivo(s) Faltando`;
          }

          return {
            account: accName,
            expected,
            delivered,
            integro,
            alterado,
            ausente,
            extra,
            naoVerificavel,
            status,
            statusLabel,
          };
        }
      );

      // 4. Summaries
      const totalExpected = verificationItems.filter((i) => i.verdict !== 'EXTRA').length;
      const totalDelivered = verificationItems.filter((i) => !!i.deliveredFile).length;
      const totalIntegro = verificationItems.filter((i) => i.verdict === 'INTEGRO').length;
      const totalAlterado = verificationItems.filter((i) => i.verdict === 'ALTERADO').length;
      const totalAusente = verificationItems.filter((i) => i.verdict === 'AUSENTE').length;
      const totalExtra = verificationItems.filter((i) => i.verdict === 'EXTRA').length;
      const totalNaoVerificavel = verificationItems.filter(
        (i) => i.verdict === 'NAO_VERIFICAVEL'
      ).length;

      const integrityRate =
        totalExpected > 0 ? (totalIntegro / totalExpected) * 100 : 0;

      // 5. Verification Seal (SHA-256 string)
      const sealInput = verificationItems
        .map((i) => `${i.fileName}:${i.verdict}:${i.calculatedHash || ''}`)
        .join('|');
      const sealBuffer = new TextEncoder().encode(sealInput);
      const sealHashBuf = await crypto.subtle.digest('SHA-256', sealBuffer);
      const verificationSealSha256 = Array.from(new Uint8Array(sealHashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const { formatted: genDate, tz } = formatForensicDate();

      const session: CloudValidationSession = {
        id: `CLOUD-${selectedProvider}-${Date.now()}`,
        provider: selectedProvider,
        procedureNumber,
        internalReference,
        declaredDate:
          selectedProvider === 'GOOGLE'
            ? googlePdfs[0]?.parsed.declaredDate
            : undefined,
        examinerName,
        sourceDocs:
          selectedProvider === 'GOOGLE'
            ? googlePdfs.map((p) => ({
                name: p.file.name,
                size: p.file.size,
                sha256: p.sha256,
                itemsCount: p.parsed.items.length,
              }))
            : appleCsvFile
            ? [
                {
                  name: appleCsvFile.name,
                  size: appleCsvFile.size,
                  sha256: appleCsvSha256,
                  itemsCount: appleItems.length,
                },
              ]
            : [],
        items: verificationItems,
        accounts: accountsCompleteness,
        appleMode: selectedProvider === 'APPLE' ? appleMode : undefined,
        appleAlgorithm: selectedProvider === 'APPLE' ? appleAlgorithm : undefined,
        summary: {
          totalExpected,
          totalDelivered,
          totalIntegro,
          totalAlterado,
          totalAusente,
          totalExtra,
          totalNaoVerificavel,
          totalAccounts: accountsCompleteness.length,
          integrityRate,
        },
        verificationSealSha256,
        generatedAt: `${genDate} (${tz})`,
      };

      setValidationSession(session);

      auditLogger.addLog({
        operation: 'VALIDACAO_LOTE',
        status: totalAlterado > 0 ? 'DIVERGENTE' : 'SUCESSO',
        message: `Conferência em Nuvem (${selectedProvider}): ${totalIntegro}/${totalExpected} íntegros, ${totalAlterado} alterados, ${totalAusente} ausentes.`,
        algorithm: selectedProvider === 'GOOGLE' ? 'SHA-512' : appleAlgorithm,
        filesCount: totalDelivered,
      });

      setStatusMessage({
        type: totalAlterado > 0 ? 'error' : totalAusente > 0 ? 'warning' : 'success',
        text: `Conferência finalizada. ${totalIntegro} arquivo(s) íntegro(s), ${totalAlterado} alterado(s), ${totalAusente} ausente(s), ${totalExtra} extra(s).`,
      });
    } catch (err) {
      if (signal.aborted) {
        setStatusMessage({
          type: 'info',
          text: 'Conferência cancelada pelo operador.',
        });
      } else {
        console.error(err);
        setStatusMessage({
          type: 'error',
          text: `Erro durante a verificação: ${
            err instanceof Error ? err.message : 'Falha desconhecida.'
          }`,
        });
      }
    } finally {
      clearInterval(timerInterval);
      setIsProcessing(false);
      setProgressPercent(100);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleExportDiagnosticCSV = () => {
    const diag = computeDiagnostics();
    const rows = diag.technicalRows;
    const separator = ';';
    const headers = [
      'Documento de Origem',
      'Conta Identificada',
      'Nome Declarado no PDF/CSV',
      'Arquivo Selecionado (Disco)',
      'Caminho Relativo',
      'Situacao da Associacao',
      'Tipo de Associacao',
      'Situacao do Hash',
      'Situacao da Comparacao',
      'Veredito Final',
      'Hash Declarado',
      'Hash Calculado',
      'Tamanho (Bytes)',
      'Tamanho Formatado',
      'Tempo Calculo (ms)',
    ];

    const escapeCell = (val: unknown): string => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvLines = [headers.map(escapeCell).join(separator)];

    for (const r of rows) {
      const assocText =
        r.associationStatus === 'ASSOCIADO'
          ? r.associationType === 'DIRECT'
            ? 'ASSOCIADO_EXATO'
            : r.associationType === 'RELATIVE_PATH'
            ? 'ASSOCIADO_CAMINHO'
            : r.associationType === 'MANUAL'
            ? 'ASSOCIADO_MANUAL'
            : 'ASSOCIADO_NORMALIZADO'
          : r.associationStatus === 'AMBIGUO'
          ? 'AMBIGUO'
          : r.associationStatus === 'EXTRA'
          ? 'EXTRA'
          : 'NAO_ASSOCIADO';

      const compText =
        r.comparisonStatus === 'INTEGRO'
          ? 'COINCIDENTE'
          : r.comparisonStatus === 'DIVERGENTE'
          ? 'DIVERGENTE'
          : 'NAO_APLICAVEL';

      csvLines.push(
        [
          r.sourceDocName || '-',
          r.account || '-',
          r.pdfFileName || '-',
          r.selectedFileName || '-',
          r.relativePath || '-',
          assocText,
          r.associationType || '-',
          r.hashStatus,
          compText,
          r.finalVerdict,
          r.declaredHash || '-',
          r.calculatedHash || '-',
          r.fileSize !== undefined ? r.fileSize : '-',
          r.formattedSize || '-',
          r.timeTakenMs !== undefined ? r.timeTakenMs : '-',
        ]
          .map(escapeCell)
          .join(separator)
      );
    }

    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAM_HASH_DIAGNOSTICO_${selectedProvider || 'CLOUD'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDiagnosticJSON = () => {
    const diag = computeDiagnostics();
    const data = {
      sistema: 'SAM HASH VERIFY — Validação Forense de Nuvens',
      versaoModulo: 'G-Ward / A-Ward Forense',
      provedor: selectedProvider,
      dataHoraISO: new Date().toISOString(),
      resumoMetricas: {
        registrosDocumento: diag.declaredTotal,
        arquivosDisco: diag.deliveredTotal,
        totalAssociados: diag.totalAssociated,
        associadosDiretos: diag.directCount,
        associadosAjustados: diag.adjustedCount,
        associadosManuais: diag.manualCount,
        ambiguos: diag.ambiguousCount,
        pendentesHash: diag.pendingHashCount,
        hashesCalculados: diag.calculatedHashCount,
        hashesIntegros: diag.integroCount,
        hashesDivergentes: diag.divergentCount,
        ausentes: diag.missing.length,
        extras: diag.extras.length,
      },
      registrosTecnicos: diag.technicalRows.map((r) => ({
        documentoOrigem: r.sourceDocName,
        conta: r.account,
        nomeDeclarado: r.pdfFileName,
        arquivoSelecionado: r.selectedFileName,
        caminhoRelativo: r.relativePath,
        situacaoAssociacao:
          r.associationStatus === 'ASSOCIADO'
            ? r.associationType === 'DIRECT'
              ? 'ASSOCIADO_EXATO'
              : r.associationType === 'RELATIVE_PATH'
              ? 'ASSOCIADO_CAMINHO'
              : r.associationType === 'MANUAL'
              ? 'ASSOCIADO_MANUAL'
              : 'ASSOCIADO_NORMALIZADO'
            : r.associationStatus === 'AMBIGUO'
            ? 'AMBIGUO'
            : r.associationStatus === 'EXTRA'
            ? 'EXTRA'
            : 'NAO_ASSOCIADO',
        tipoAssociacao: r.associationType || null,
        situacaoHash: r.hashStatus,
        situacaoComparacao:
          r.comparisonStatus === 'INTEGRO'
            ? 'COINCIDENTE'
            : r.comparisonStatus === 'DIVERGENTE'
            ? 'DIVERGENTE'
            : 'NAO_APLICAVEL',
        vereditoFinal: r.finalVerdict,
        hashDeclarado: r.declaredHash || null,
        hashCalculado: r.calculatedHash || null,
        tamanhoBytes: r.fileSize ?? null,
        tamanhoFormatado: r.formattedSize ?? null,
        tempoMs: r.timeTakenMs ?? null,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAM_HASH_DIAGNOSTICO_${selectedProvider || 'CLOUD'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // FILTERED ITEMS
  // ---------------------------------------------------------------------------
  const filteredItems = validationSession
    ? validationSession.items.filter((item) => {
        if (activeTabFilter !== 'TODOS' && item.verdict !== activeTabFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            item.fileName.toLowerCase().includes(q) ||
            item.account.toLowerCase().includes(q) ||
            (item.categoryOrProduct && item.categoryOrProduct.toLowerCase().includes(q))
          );
        }
        return true;
      })
    : [];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Top Banner & Provider Selection */}
      <div className="bg-[#0F1115] border border-[#262930] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-center text-[#F57917]">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide">
                  VALIDAÇÃO DE HASH — NUVENS
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F57917]/20 text-[#F57917] border border-[#F57917]/30">
                  LEGAL PRODUCTIONS
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Conferência de integridade de produções judiciais das empresas Google e Apple
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              Processamento 100% Local no Navegador
            </span>
          </div>
        </div>

        {/* Informative Disclaimer */}
        <div className="mt-4 pt-3 border-t border-[#262930] flex items-center gap-2 text-[11px] text-zinc-500">
          <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>
            As logomarcas e referências identificam a origem técnica dos arquivos fornecidos em cumprimento judicial, sem sugerir qualquer endosso ou patrocínio oficial de Google LLC ou Apple Inc.
          </span>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border animate-fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/30 border-rose-800/60 text-rose-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/30 border-amber-800/60 text-amber-300'
              : 'bg-blue-950/30 border-blue-800/60 text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            ) : statusMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-zinc-500 hover:text-zinc-300 text-sm font-bold px-2 py-0.5 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* PROVIDER CARDS (Landing / Switcher) */}
      {!selectedProvider && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {/* Card Google */}
          <div className="bg-[#121418] border border-[#262930] hover:border-[#4285F4]/60 rounded-2xl p-8 flex flex-col justify-between transition-all duration-200 shadow-xl group">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-[#1A1D24] border border-[#262930] flex items-center justify-center p-3 mb-5 group-hover:scale-105 transition-transform">
                <GoogleLogo className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-[#4285F4] transition-colors flex items-center gap-2">
                GOOGLE
                <span className="text-xs px-2 py-0.5 rounded bg-[#4285F4]/20 text-[#4285F4] font-mono font-normal">
                  LERS / SHA-512
                </span>
              </h2>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Valide arquivos recebidos do Google utilizando o PDF oficial de valores de hash.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-500">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Parser inteligente para múltiplos PDFs particionados
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Tratamento de hashes e nomes divididos entre páginas
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Conferência SHA-512 (128 hex) nativa em blocos
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-5 border-t border-[#262930]">
              <button
                type="button"
                onClick={() => setSelectedProvider('GOOGLE')}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#4285F4] hover:bg-[#3367D6] text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>VALIDAR PRODUÇÃO GOOGLE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card Apple */}
          <div className="bg-[#121418] border border-[#262930] hover:border-zinc-400 rounded-2xl p-8 flex flex-col justify-between transition-all duration-200 shadow-xl group">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-[#1A1D24] border border-[#262930] flex items-center justify-center p-3 mb-5 group-hover:scale-105 transition-transform text-white">
                <AppleLogo className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-zinc-200 transition-colors flex items-center gap-2">
                APPLE
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-normal">
                  MANIFESTO CSV
                </span>
              </h2>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Valide arquivos recebidos da Apple utilizando o manifesto CSV da produção.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-500">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Leitura de account-download-details.csv com UTF-8 BOM
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Conferência de pacotes cifrados (.zip.gpg) e decifrados (.zip)
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Suporte aos algoritmos SHA-256 e SHA-512 declarados
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-5 border-t border-[#262930]">
              <button
                type="button"
                onClick={() => setSelectedProvider('APPLE')}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>VALIDAR PRODUÇÃO APPLE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTED PROVIDER WORKFLOW */}
      {selectedProvider && (
        <div className="space-y-6">
          {/* Subheader / Provider Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121418] border border-[#262930] p-3 rounded-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (validationSession || googlePdfs.length > 0 || appleCsvFile) {
                    setShowClearConfirm(true);
                  } else {
                    setSelectedProvider(null);
                  }
                }}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-[#17191D] hover:bg-[#20242C] transition-colors cursor-pointer"
              >
                ← Voltar para seleção de nuvens
              </button>
              <span className="text-zinc-600">|</span>
              <div className="flex items-center gap-2">
                {selectedProvider === 'GOOGLE' ? (
                  <>
                    <GoogleLogo className="w-5 h-5" />
                    <span className="font-bold text-white text-sm">Produção Google LLC</span>
                  </>
                ) : (
                  <>
                    <div className="text-white">
                      <AppleLogo className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-white text-sm">Produção Apple Inc.</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedProvider(selectedProvider === 'GOOGLE' ? 'APPLE' : 'GOOGLE')}
                className="text-xs text-[#F57917] hover:underline px-2 py-1 cursor-pointer"
              >
                Alternar para {selectedProvider === 'GOOGLE' ? 'Apple' : 'Google'}
              </button>
            </div>
          </div>

          {/* Forensic Case Details Strip */}
          <div className="bg-[#121418] border border-[#262930] rounded-xl p-4">
            <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#F57917]" />
              Identificação do Procedimento e Perícia
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Número dos Autos / Procedimento:
                </label>
                <input
                  type="text"
                  value={procedureNumber}
                  onChange={(e) => setProcedureNumber(e.target.value)}
                  placeholder="Ex: 0808301-18.2026.8.19.0605"
                  className="w-full bg-[#1A1D24] border border-[#262930] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 font-mono focus:border-[#F57917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Referência Interna / Solicitação:
                </label>
                <input
                  type="text"
                  value={internalReference}
                  onChange={(e) => setInternalReference(e.target.value)}
                  placeholder="Ex: 152344365"
                  className="w-full bg-[#1A1D24] border border-[#262930] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 font-mono focus:border-[#F57917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Perito / Examinador Responsável:
                </label>
                <input
                  type="text"
                  value={examinerName}
                  onChange={(e) => setExaminerName(e.target.value)}
                  placeholder="Ex: APF Ramon (ramon.grsl)"
                  className="w-full bg-[#1A1D24] border border-[#262930] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-[#F57917] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* GOOGLE SECTION */}
          {/* ================================================================= */}
          {selectedProvider === 'GOOGLE' && (
            <div className="space-y-6">
              {/* Step 1: Import Google PDF(s) */}
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#4285F4]/20 text-[#4285F4] flex items-center justify-center text-xs">1</span>
                      Importar PDF de Hashes do Google
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Permite importar um ou vários PDFs (Google parte relações grandes, ex: [1] a [4]).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadSampleGooglePdf}
                      disabled={isParsingGooglePdf || isProcessing}
                      className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#363B47] text-xs text-[#4285F4] font-medium transition-colors cursor-pointer disabled:opacity-50"
                      title="Carrega o PDF oficial 152344365 recebido pelo tribunal"
                    >
                      Carregar Amostra Real Oficial (PDF Google)
                    </button>

                    <label
                      htmlFor={googlePdfInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4285F4] hover:bg-[#3367D6] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Adicionar PDF(s)</span>
                    </label>
                    <input
                      id={googlePdfInputId}
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={(e) => e.target.files && handleGooglePdfUpload(e.target.files)}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* PDFs Loaded List */}
                {googlePdfs.length > 0 ? (
                  <div className="space-y-3 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {googlePdfs.map((pdfItem, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs flex flex-col justify-between"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-[#4285F4] shrink-0" />
                              <span className="font-semibold text-white truncate" title={pdfItem.file.name}>
                                {pdfItem.file.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-mono">
                                {pdfItem.parsed.items.length} itens
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveGooglePdf(idx)}
                                disabled={isProcessing}
                                className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title="Remover este PDF"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-[#262930] text-[10px] space-y-1 text-zinc-400">
                            <div>Páginas: {pdfItem.parsed.pageCount}</div>
                            <div className="font-mono truncate">
                              SHA-256 Custódia: <span className="text-zinc-300">{pdfItem.sha256}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Consolidated Summary */}
                    <div className="p-3 rounded-xl bg-[#1A1D24] border border-[#363B47] text-xs flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400">Total Unificado:</span>
                        <span className="font-bold text-white font-mono">
                          {googleMergedItems.length} arquivo(s) declarados
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-400">Contas:</span>
                        <span className="font-bold text-[#4285F4] font-mono">
                          {new Set(googleMergedItems.map((i) => i.account)).size} conta(s)
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-mono">
                        Algoritmo: SHA-512 (128 hex)
                      </span>
                    </div>

                    {/* Conflict Warnings between multiple PDFs */}
                    {googleMergeResult?.conflicts && googleMergeResult.conflicts.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>Conflito Detectado: {googleMergeResult.conflicts.length} arquivo(s) possuem hashes divergentes entre os PDFs carregados!</span>
                        </div>
                        <div className="space-y-1 text-[11px] max-h-24 overflow-y-auto font-mono">
                          {googleMergeResult.conflicts.map((c, i) => (
                            <div key={i} className="text-rose-300">
                              • {c.fileName}: {c.hashes.map((h) => `${h.sourcePdf} (${h.hash.slice(0, 10)}...)`).join(' vs ')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Zero-items Diagnostic Alert */}
                    {googleMergedItems.length === 0 && (
                      <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800 text-amber-200 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Nenhum par [Arquivo: SHA512-[Hash]] identificado no(s) PDF(s)</span>
                        </div>
                        <p className="text-[11px] text-amber-300/80">
                          O documento foi lido ({googlePdfs.reduce((acc, p) => acc + p.parsed.pageCount, 0)} páginas), porém nenhum registro no padrão do Google foi extraído. Verifique se o documento judicial é o "Valores de Hash dos Arquivos Produzidos".
                        </p>
                        {googlePdfs[0]?.parsed.rawTextSample && (
                          <div className="p-2.5 rounded bg-black/40 font-mono text-[10px] text-zinc-400 max-h-24 overflow-y-auto">
                            Amostra de texto extraída: {googlePdfs[0].parsed.rawTextSample}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Collapsible Preview Table of Extracted Hashes */}
                    {googleMergedItems.length > 0 && (
                      <div className="bg-[#14171C] border border-[#262930] rounded-xl overflow-hidden mt-3">
                        <div
                          className="p-3 bg-[#1A1D24] border-b border-[#262930] flex items-center justify-between cursor-pointer select-none"
                          onClick={() => setGooglePreviewOpen(!googlePreviewOpen)}
                        >
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-[#4285F4]" />
                            <span className="font-bold text-xs text-white">
                              Prévia dos Arquivos e Hashes Declarados no PDF ({googleMergedItems.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <span>{googlePreviewOpen ? 'Recolher' : 'Expandir Prévia'}</span>
                            {googlePreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>

                        {googlePreviewOpen && (
                          <div className="p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={googlePreviewSearch}
                                  onChange={(e) => setGooglePreviewSearch(e.target.value)}
                                  placeholder="Filtrar prévia por nome de arquivo ou conta no PDF..."
                                  className="w-full bg-[#0F1115] border border-[#262930] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#4285F4]"
                                />
                              </div>
                              <span className="text-[11px] text-zinc-400 font-mono shrink-0">
                                Exibindo {googleMergedItems.filter((item) => {
                                  if (!googlePreviewSearch) return true;
                                  const q = googlePreviewSearch.toLowerCase();
                                  return item.fileName.toLowerCase().includes(q) || item.account.toLowerCase().includes(q);
                                }).length} de {googleMergedItems.length}
                              </span>
                            </div>

                            <div className="max-h-60 overflow-y-auto rounded-lg border border-[#262930] bg-[#0F1115]">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-[#17191D] text-zinc-400 font-mono uppercase text-[10px] sticky top-0 border-b border-[#262930]">
                                  <tr>
                                    <th className="py-2 px-3">#</th>
                                    <th className="py-2 px-3">Conta</th>
                                    <th className="py-2 px-3">Nome Declarado</th>
                                    <th className="py-2 px-3">Hash Oficial (SHA-512)</th>
                                    <th className="py-2 px-3">PDF Origem</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1D2128]">
                                  {googleMergedItems
                                    .filter((item) => {
                                      if (!googlePreviewSearch) return true;
                                      const q = googlePreviewSearch.toLowerCase();
                                      return item.fileName.toLowerCase().includes(q) || item.account.toLowerCase().includes(q);
                                    })
                                    .slice(0, 100)
                                    .map((item, i) => (
                                      <tr key={item.id} className="hover:bg-white/[0.02]">
                                        <td className="py-1.5 px-3 font-mono text-zinc-500">{i + 1}</td>
                                        <td className="py-1.5 px-3 font-mono text-zinc-300 truncate max-w-[140px]" title={item.account}>
                                          {item.account}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-white font-medium truncate max-w-[220px]" title={item.fileName}>
                                          {item.fileName}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-zinc-300">
                                          <div className="flex items-center gap-1.5">
                                            <span className="truncate max-w-[140px]" title={item.declaredHash}>
                                              {item.declaredHash.slice(0, 14)}...{item.declaredHash.slice(-8)}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleCopy(item.declaredHash)}
                                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                              title="Copiar Hash SHA-512"
                                            >
                                              {copiedHash === item.declaredHash ? (
                                                <Check className="w-3 h-3 text-emerald-400" />
                                              ) : (
                                                <Copy className="w-3 h-3" />
                                              )}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="py-1.5 px-3 text-zinc-500 truncate max-w-[120px]" title={item.sourcePdfName}>
                                          {item.sourcePdfName}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-[#262930] rounded-xl text-center text-zinc-500 text-xs">
                    Nenhum documento PDF do Google importado ainda. Selecione os arquivos ou clique em "Carregar Amostra Real Oficial".
                  </div>
                )}
              </div>

              {/* Step 2: Delivered Files Selection */}
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-xs">2</span>
                      Arquivos Efetivamente Recebidos do Google
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Selecione a pasta ou os arquivos da produção baixada para cálculo real do hash SHA-512.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Clear selection button */}
                    {googleDeliveredFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#262930] text-zinc-400 hover:text-white text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Limpar Seleção</span>
                      </button>
                    )}

                    <label
                      htmlFor={googleFolderInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] hover:border-[#F57917] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#F57917]" />
                      <span>Selecionar Pasta</span>
                    </label>
                    <input
                      id={googleFolderInputId}
                      type="file"
                      // @ts-expect-error webkitdirectory is standard for folder picker
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setGoogleDeliveredFiles(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                    />

                    <label
                      htmlFor={googleFilesInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Selecionar Arquivos</span>
                    </label>
                    <input
                      id={googleFilesInputId}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setGoogleDeliveredFiles(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                {googleDeliveredFiles.length > 0 ? (
                  <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-4 h-4 text-[#F57917]" />
                      <span className="font-semibold text-white">
                        {googleDeliveredFiles.length} arquivo(s) localizados para verificação
                      </span>
                      <span className="text-zinc-500">
                        ({formatBytes(googleDeliveredFiles.reduce((acc, f) => acc + f.size, 0))})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">Pronto para calcular</span>
                  </div>
                ) : (
                  <div className="p-6 border-2 border-dashed border-[#262930] rounded-xl text-center text-zinc-500 text-xs">
                    Nenhum arquivo físico selecionado ainda. Se você deseja apenas consultar o manifesto, o relatório de arquivos esperados já está disponível acima. Para conferir a integridade, aponte a pasta de arquivos recebidos.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* APPLE SECTION */}
          {/* ================================================================= */}
          {selectedProvider === 'APPLE' && (
            <div className="space-y-6">
              {/* Apple Mode Switcher: Encrypted GPG vs Decrypted ZIP */}
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-md">
                <div className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#F57917]" />
                  Modalidade de Conferência Apple (A-Ward)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setAppleMode('GPG_ENCRYPTED')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      appleMode === 'GPG_ENCRYPTED'
                        ? 'bg-[#17191D] border-white text-white shadow-lg'
                        : 'bg-[#0F1115] border-[#262930] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">1. Arquivos Cifrados (.zip.gpg)</span>
                      {appleMode === 'GPG_ENCRYPTED' && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-zinc-400">
                      Conferência pré-decifração: compara o hash dos arquivos brutos baixados da blobstore contra as colunas <code className="text-zinc-300">GPG_SHA256</code> ou <code className="text-zinc-300">GPG_SHA512</code>.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAppleMode('ZIP_DECRYPTED')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      appleMode === 'ZIP_DECRYPTED'
                        ? 'bg-[#17191D] border-white text-white shadow-lg'
                        : 'bg-[#0F1115] border-[#262930] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">2. Arquivos Decifrados (.zip)</span>
                      {appleMode === 'ZIP_DECRYPTED' && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-zinc-400">
                      Conferência pós-decifração: compara o hash dos arquivos após abertura da criptografia GPG contra as colunas <code className="text-zinc-300">CLEAR_TEXT_SHA256</code> ou <code className="text-zinc-300">CLEAR_TEXT_SHA512</code>.
                    </p>
                  </button>
                </div>

                {/* Algorithm Choice */}
                <div className="mt-4 pt-4 border-t border-[#262930] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Algoritmo de Hash para Comparação:</span>
                    <button
                      type="button"
                      onClick={() => setAppleAlgorithm('SHA-256')}
                      className={`px-3 py-1 rounded-lg font-mono font-semibold transition-all cursor-pointer ${
                        appleAlgorithm === 'SHA-256'
                          ? 'bg-[#F57917] text-white'
                          : 'bg-[#1A1D24] text-zinc-400 hover:text-white border border-[#262930]'
                      }`}
                    >
                      SHA-256 (Padrão Sempre Presente)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppleAlgorithm('SHA-512')}
                      className={`px-3 py-1 rounded-lg font-mono font-semibold transition-all cursor-pointer ${
                        appleAlgorithm === 'SHA-512'
                          ? 'bg-[#F57917] text-white'
                          : 'bg-[#1A1D24] text-zinc-400 hover:text-white border border-[#262930]'
                      }`}
                    >
                      SHA-512 (Se disponível no CSV)
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 1: Import Apple CSV */}
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center text-xs">1</span>
                      Importar Manifesto CSV da Apple
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Arquivo <code className="text-zinc-300">account-download-details.csv</code> fornecido no pacote inicial.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadSampleAppleCsv}
                      disabled={isParsingAppleCsv || isProcessing}
                      className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#363B47] text-xs text-zinc-200 font-medium transition-colors cursor-pointer disabled:opacity-50"
                      title="Carrega o arquivo CSV oficial enviado pela Apple para perícia"
                    >
                      Carregar Amostra Real Oficial (CSV Apple)
                    </button>

                    <label
                      htmlFor={appleCsvInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Selecionar CSV</span>
                    </label>
                    <input
                      id={appleCsvInputId}
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files && e.target.files[0] && handleAppleCsvUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </div>
                </div>

                {appleCsvFile ? (
                  <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930] text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-white">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>{appleCsvFile.name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 font-mono text-[11px]">
                        {appleItems.length} registros reconhecidos
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#262930] flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400">
                      <div>
                        Contas Identificadas:{' '}
                        <span className="font-bold text-white font-mono">
                          {new Set(appleItems.map((i) => i.accountId)).size} contas
                        </span>
                      </div>
                      <div className="font-mono truncate">
                        SHA-256 Custódia CSV: <span className="text-zinc-300">{appleCsvSha256}</span>
                      </div>
                    </div>

                    {/* Collapsible Preview Table for Apple CSV */}
                    {appleItems.length > 0 && (
                      <div className="bg-[#14171C] border border-[#262930] rounded-xl overflow-hidden mt-3">
                        <div
                          className="p-3 bg-[#1A1D24] border-b border-[#262930] flex items-center justify-between cursor-pointer select-none"
                          onClick={() => setApplePreviewOpen(!applePreviewOpen)}
                        >
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-[#F57917]" />
                            <span className="font-bold text-xs text-white">
                              Prévia dos Arquivos Declarados no CSV Apple ({appleItems.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <span>{applePreviewOpen ? 'Recolher' : 'Expandir Prévia'}</span>
                            {applePreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>

                        {applePreviewOpen && (
                          <div className="p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={applePreviewSearch}
                                  onChange={(e) => setApplePreviewSearch(e.target.value)}
                                  placeholder="Filtrar prévia por arquivo, conta ou categoria no CSV..."
                                  className="w-full bg-[#0F1115] border border-[#262930] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F57917]"
                                />
                              </div>
                              <span className="text-[11px] text-zinc-400 font-mono shrink-0">
                                Exibindo {appleItems.filter((item) => {
                                  if (!applePreviewSearch) return true;
                                  const q = applePreviewSearch.toLowerCase();
                                  return (
                                    item.fileName.toLowerCase().includes(q) ||
                                    item.accountId.toLowerCase().includes(q) ||
                                    item.dataType.toLowerCase().includes(q)
                                  );
                                }).length} de {appleItems.length}
                              </span>
                            </div>

                            <div className="max-h-60 overflow-y-auto rounded-lg border border-[#262930] bg-[#0F1115]">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-[#17191D] text-zinc-400 font-mono uppercase text-[10px] sticky top-0 border-b border-[#262930]">
                                  <tr>
                                    <th className="py-2 px-3">#</th>
                                    <th className="py-2 px-3">Conta</th>
                                    <th className="py-2 px-3">Categoria</th>
                                    <th className="py-2 px-3">Nome Declarado (File_Name)</th>
                                    <th className="py-2 px-3">GPG SHA-256</th>
                                    <th className="py-2 px-3">Clear-Text SHA-256</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1D2128]">
                                  {appleItems
                                    .filter((item) => {
                                      if (!applePreviewSearch) return true;
                                      const q = applePreviewSearch.toLowerCase();
                                      return (
                                        item.fileName.toLowerCase().includes(q) ||
                                        item.accountId.toLowerCase().includes(q) ||
                                        item.dataType.toLowerCase().includes(q)
                                      );
                                    })
                                    .slice(0, 100)
                                    .map((item, i) => (
                                      <tr key={item.id} className="hover:bg-white/[0.02]">
                                        <td className="py-1.5 px-3 font-mono text-zinc-500">{i + 1}</td>
                                        <td className="py-1.5 px-3 font-mono text-zinc-300">{item.accountId}</td>
                                        <td className="py-1.5 px-3 text-zinc-400 truncate max-w-[120px]">{item.dataType}</td>
                                        <td className="py-1.5 px-3 font-mono text-white font-medium truncate max-w-[220px]" title={item.fileName}>
                                          {item.fileName}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-zinc-300">
                                          {item.gpgSha256 ? `${item.gpgSha256.slice(0, 12)}...` : '-'}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-zinc-300">
                                          {item.clearTextSha256 ? `${item.clearTextSha256.slice(0, 12)}...` : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-[#262930] rounded-xl text-center text-zinc-500 text-xs">
                    Nenhum manifesto CSV da Apple importado ainda. Selecione um arquivo ou clique em "Carregar Amostra Real Oficial".
                  </div>
                )}
              </div>

              {/* Step 2: Delivered Files Selection */}
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-xs">2</span>
                      Arquivos Efetivamente Recebidos da Apple
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Selecione a pasta onde foram salvos os arquivos{' '}
                      {appleMode === 'GPG_ENCRYPTED' ? '.zip.gpg' : '.zip decifrados'}.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {appleDeliveredFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#262930] text-zinc-400 hover:text-white text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Limpar Seleção</span>
                      </button>
                    )}

                    <label
                      htmlFor={appleFolderInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] hover:border-[#F57917] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#F57917]" />
                      <span>Selecionar Pasta</span>
                    </label>
                    <input
                      id={appleFolderInputId}
                      type="file"
                      // @ts-expect-error webkitdirectory is standard for folder picker
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setAppleDeliveredFiles(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                    />

                    <label
                      htmlFor={appleFilesInputId}
                      className="px-3.5 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Selecionar Arquivos</span>
                    </label>
                    <input
                      id={appleFilesInputId}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setAppleDeliveredFiles(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                {appleDeliveredFiles.length > 0 ? (
                  <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-4 h-4 text-[#F57917]" />
                      <span className="font-semibold text-white">
                        {appleDeliveredFiles.length} arquivo(s) prontos para validação
                      </span>
                      <span className="text-zinc-500">
                        ({formatBytes(appleDeliveredFiles.reduce((acc, f) => acc + f.size, 0))})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">Pronto</span>
                  </div>
                ) : (
                  <div className="p-6 border-2 border-dashed border-[#262930] rounded-xl text-center text-zinc-500 text-xs">
                    Nenhum arquivo físico selecionado ainda. Aponte a pasta de arquivos para executar o cálculo real de hashes.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* DIAGNÓSTICO DA VALIDAÇÃO (EXPANDABLE FORENSIC PANEL) */}
          {/* ================================================================= */}
          {((selectedProvider === 'GOOGLE' && (googleMergedItems.length > 0 || googleDeliveredFiles.length > 0)) ||
            (selectedProvider === 'APPLE' && (appleItems.length > 0 || appleDeliveredFiles.length > 0))) && (() => {
            const diag = computeDiagnostics();
            const unassignedDeclared = diag.missing;

            const filteredTechnicalRows = diag.technicalRows.filter((row) => {
              if (activeDiagTab === 'MATCHED' && row.associationStatus !== 'ASSOCIADO') return false;
              if (activeDiagTab === 'AMBIGUOUS' && row.associationStatus !== 'AMBIGUO') return false;
              if (activeDiagTab === 'MISSING' && row.associationStatus !== 'NAO_LOCALIZADO') return false;
              if (activeDiagTab === 'EXTRAS' && row.associationStatus !== 'EXTRA') return false;

              if (diagnosticSearch.trim()) {
                const q = diagnosticSearch.toLowerCase();
                return (
                  row.pdfFileName.toLowerCase().includes(q) ||
                  row.selectedFileName.toLowerCase().includes(q) ||
                  row.relativePath.toLowerCase().includes(q) ||
                  row.account.toLowerCase().includes(q)
                );
              }
              return true;
            });

            return (
              <div className="bg-[#121418] border border-[#262930] rounded-2xl p-6 shadow-xl space-y-4">
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  onClick={() => setDiagnosticOpen(!diagnosticOpen)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[#F57917] shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                        <span>
                          {selectedProvider === 'GOOGLE'
                            ? 'DIAGNÓSTICO DA VALIDAÇÃO GOOGLE'
                            : 'DIAGNÓSTICO DA VALIDAÇÃO APPLE'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-emerald-400 border border-emerald-900/60">
                          {diag.totalAssociated} de {diag.deliveredTotal} arquivos associados
                        </span>
                        {diag.ambiguousCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800">
                            {diag.ambiguousCount} ambíguo(s)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Confronto e inventário determinístico entre registros do documento oficial e arquivos selecionados no disco.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-400 self-end sm:self-auto">
                    <span>{diagnosticOpen ? 'Recolher Painel' : 'Expandir Diagnóstico'}</span>
                    {diagnosticOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {diagnosticOpen && (
                  <div className="space-y-4 pt-3 border-t border-[#262930] animate-fade-in">
                    {/* Metrics Strip: 10 Separate Indicators (Section 5) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                      <div className="p-2.5 rounded-xl bg-[#17191D] border border-[#262930]">
                        <div className="text-[9px] text-zinc-400 font-mono uppercase truncate" title="Registros no Documento">Registros Doc</div>
                        <div className="text-base font-bold text-white font-mono mt-0.5">{diag.declaredTotal}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#17191D] border border-[#262930]">
                        <div className="text-[9px] text-zinc-400 font-mono uppercase truncate" title="Arquivos no Disco">Arquivos Disco</div>
                        <div className="text-base font-bold text-white font-mono mt-0.5">{diag.deliveredTotal}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
                        <div className="text-[9px] text-emerald-400 font-mono uppercase truncate" title="Associados Automaticamente">Assoc. Automática</div>
                        <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">{diag.directCount + diag.adjustedCount}</div>
                      </div>
                      <div className={`p-2.5 rounded-xl border ${diag.ambiguousCount > 0 ? 'bg-purple-950/30 border-purple-800' : 'bg-[#17191D] border-[#262930]'}`}>
                        <div className="text-[9px] text-purple-400 font-mono uppercase truncate" title="Associação Ambígua">Assoc. Ambígua</div>
                        <div className="text-base font-bold text-purple-300 font-mono mt-0.5">{diag.ambiguousCount}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-[#262930]">
                        <div className="text-[9px] text-zinc-400 font-mono uppercase truncate" title="Pendentes de Cálculo">Pendentes Hash</div>
                        <div className="text-base font-bold text-zinc-300 font-mono mt-0.5">{diag.pendingHashCount}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-blue-950/20 border border-blue-900/40">
                        <div className="text-[9px] text-blue-400 font-mono uppercase truncate" title="Hashes SHA-512 Calculados">Hashes Calculados</div>
                        <div className="text-base font-bold text-blue-300 font-mono mt-0.5">{diag.calculatedHashCount}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/60">
                        <div className="text-[9px] text-emerald-400 font-mono uppercase truncate" title="Hashes Íntegros (OK)">Hashes Íntegros</div>
                        <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">{diag.integroCount}</div>
                      </div>
                      <div className={`p-2.5 rounded-xl border ${diag.divergentCount > 0 ? 'bg-rose-950/40 border-rose-800' : 'bg-[#17191D] border-[#262930]'}`}>
                        <div className="text-[9px] text-rose-400 font-mono uppercase truncate" title="Hashes Divergentes">Divergentes</div>
                        <div className={`text-base font-bold font-mono mt-0.5 ${diag.divergentCount > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                          {diag.divergentCount}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-900/40">
                        <div className="text-[9px] text-rose-400 font-mono uppercase truncate" title="Registros Ausentes na Mídia">Ausentes</div>
                        <div className="text-base font-bold text-rose-300 font-mono mt-0.5">{diag.missing.length}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-900/40">
                        <div className="text-[9px] text-amber-400 font-mono uppercase truncate" title="Arquivos Extras Não Declarados">Extras</div>
                        <div className="text-base font-bold text-amber-300 font-mono mt-0.5">{diag.extras.length}</div>
                      </div>
                    </div>

                    {/* Sub-tabs / Filters for the Technical State View */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#262930] pb-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveDiagTab('ALL')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeDiagTab === 'ALL'
                              ? 'bg-[#1A1D24] text-white border border-[#363B47]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5 text-zinc-300" />
                          <span>Tabela Geral ({diag.technicalRows.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveDiagTab('MATCHED')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeDiagTab === 'MATCHED'
                              ? 'bg-[#1A1D24] text-white border border-[#363B47]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Associados ({diag.totalAssociated})</span>
                        </button>

                        {diag.ambiguousCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveDiagTab('AMBIGUOUS')}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                              activeDiagTab === 'AMBIGUOUS'
                                ? 'bg-purple-950/60 text-purple-200 border border-purple-800'
                                : 'text-purple-400 hover:text-purple-200'
                            }`}
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                            <span>Ambíguos ({diag.ambiguousCount})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setActiveDiagTab('MISSING')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeDiagTab === 'MISSING'
                              ? 'bg-[#1A1D24] text-white border border-[#363B47]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Ausentes ({diag.missing.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveDiagTab('EXTRAS')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeDiagTab === 'EXTRAS'
                              ? 'bg-[#1A1D24] text-white border border-[#363B47]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Extras ({diag.extras.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveDiagTab('ALERTS')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeDiagTab === 'ALERTS'
                              ? 'bg-[#1A1D24] text-white border border-[#363B47]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Info className="w-3.5 h-3.5 text-blue-400" />
                          <span>Alertas Estruturais</span>
                        </button>
                      </div>

                      {/* Toolbar: Fast search filter and CSV/JSON export buttons */}
                      {activeDiagTab !== 'ALERTS' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative w-56">
                            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={diagnosticSearch}
                              onChange={(e) => setDiagnosticSearch(e.target.value)}
                              placeholder="Buscar na tabela técnica..."
                              className="w-full bg-[#0F1115] border border-[#262930] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F57917]"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleExportDiagnosticCSV}
                            className="px-2.5 py-1 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] hover:border-emerald-500/50 text-zinc-300 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                            title="Exportar confronto técnico forense em formato CSV"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Exportar CSV</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleExportDiagnosticJSON}
                            className="px-2.5 py-1 rounded-lg bg-[#17191D] hover:bg-[#20242C] border border-[#262930] hover:border-blue-500/50 text-zinc-300 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                            title="Exportar confronto técnico forense em formato JSON para auditoria"
                          >
                            <Download className="w-3.5 h-3.5 text-blue-400" />
                            <span>Exportar JSON</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Ambiguity notice banner if present */}
                    {diag.ambiguousCount > 0 && activeDiagTab === 'AMBIGUOUS' && (
                      <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800 text-purple-200 text-xs flex items-center gap-3">
                        <HelpCircle className="w-5 h-5 text-purple-400 shrink-0" />
                        <div>
                          <strong className="font-bold">ASSOCIAÇÃO AMBÍGUA IDENTIFICADA:</strong>
                          <p className="text-[11px] text-purple-300/90 mt-0.5">
                            Foram encontrados múltiplos arquivos com o mesmo nome em subpastas diferentes para o mesmo registro. Conforme norma forense, o sistema não associou arbitrariamente. Selecione abaixo o arquivo correto pelo caminho relativo correspondente.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Alerts Sub-tab View */}
                    {activeDiagTab === 'ALERTS' ? (
                      <div className="space-y-3 text-xs">
                        {selectedProvider === 'GOOGLE' && googlePdfs.length > 0 && (
                          <div className="space-y-2">
                            {googlePdfs.map((pdfItem, i) => (
                              <div key={i} className="p-3 rounded-xl bg-[#17191D] border border-[#262930] space-y-1.5">
                                <div className="font-bold text-white flex items-center justify-between">
                                  <span>{pdfItem.file.name}</span>
                                  <span className="font-mono text-emerald-400 text-[11px]">
                                    {pdfItem.parsed.items.length} registros extraídos ({pdfItem.parsed.pageCount} págs)
                                  </span>
                                </div>
                                {pdfItem.parsed.warnings && pdfItem.parsed.warnings.length > 0 && (
                                  <div className="p-2 rounded bg-amber-950/30 text-amber-300 text-[11px] font-mono">
                                    {pdfItem.parsed.warnings.map((w, wi) => (
                                      <div key={wi}>• {w}</div>
                                    ))}
                                  </div>
                                )}
                                {pdfItem.parsed.unparsedLines && pdfItem.parsed.unparsedLines.length > 0 && (
                                  <div className="p-2 rounded bg-zinc-900 text-zinc-400 text-[10px] font-mono">
                                    <div className="font-semibold text-zinc-300 mb-1">Linhas residuais de cabeçalho ignoradas:</div>
                                    {pdfItem.parsed.unparsedLines.map((ul, uli) => (
                                      <div key={uli} className="truncate">{ul}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}

                            {googleMergeResult?.duplicateCount ? (
                              <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-900/40 text-blue-300 text-[11px]">
                                Foram consolidadas {googleMergeResult.duplicateCount} ocorrência(s) duplicadas idênticas entre os PDFs carregados.
                              </div>
                            ) : null}
                          </div>
                        )}

                        {selectedProvider === 'APPLE' && appleCsvFile && (
                          <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930] space-y-2">
                            <div className="font-bold text-white flex items-center justify-between">
                              <span>{appleCsvFile.name}</span>
                              <span className="font-mono text-emerald-400 text-[11px]">
                                {appleItems.length} registros reconhecidos
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Colunas lidas: <code className="text-zinc-300">{appleItems[0] ? 'Data_Type, File_Name, GPG_SHA256, CLEAR_TEXT_SHA256...' : 'Nenhuma'}</code>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* TABELA TÉCNICA DE ESTADO (Section 5) */
                      <div className="space-y-2">
                        {filteredTechnicalRows.length === 0 ? (
                          <div className="p-6 text-center text-xs text-zinc-500 bg-[#0F1115] rounded-xl border border-[#262930]">
                            Nenhum registro encontrado para o filtro selecionado.
                          </div>
                        ) : (
                          <div className="max-h-96 overflow-y-auto rounded-xl border border-[#262930] bg-[#0F1115]">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-[#17191D] text-zinc-400 font-mono uppercase text-[10px] sticky top-0 border-b border-[#262930] z-10">
                                <tr>
                                  <th className="py-2.5 px-3">#</th>
                                  <th className="py-2.5 px-3">Doc Origem</th>
                                  <th className="py-2.5 px-3">Conta Identificada</th>
                                  <th className="py-2.5 px-3">Nome Declarado</th>
                                  <th className="py-2.5 px-3">Arquivo Selecionado (Disco)</th>
                                  <th className="py-2.5 px-3">Caminho Relativo</th>
                                  <th className="py-2.5 px-3">Situação Associação</th>
                                  <th className="py-2.5 px-3">Situação Hash</th>
                                  <th className="py-2.5 px-3">Situação Comparação</th>
                                  <th className="py-2.5 px-3">Veredito Final</th>
                                  <th className="py-2.5 px-3">Ações / Ajuste</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1D2128]">
                                {filteredTechnicalRows.map((row, idx) => {
                                  const assocLabel =
                                    row.associationStatus === 'ASSOCIADO'
                                      ? row.associationType === 'DIRECT'
                                        ? 'ASSOCIADO_EXATO'
                                        : row.associationType === 'RELATIVE_PATH'
                                        ? 'ASSOCIADO_CAMINHO'
                                        : row.associationType === 'MANUAL'
                                        ? 'ASSOCIADO_MANUAL'
                                        : 'ASSOCIADO_NORMALIZADO'
                                      : row.associationStatus === 'AMBIGUO'
                                      ? 'AMBIGUO'
                                      : row.associationStatus === 'EXTRA'
                                      ? 'EXTRA'
                                      : 'NAO_ASSOCIADO';

                                  const compLabel =
                                    row.comparisonStatus === 'INTEGRO'
                                      ? 'COINCIDENTE'
                                      : row.comparisonStatus === 'DIVERGENTE'
                                      ? 'DIVERGENTE'
                                      : 'NAO_APLICAVEL';

                                  return (
                                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                                      <td className="py-2 px-3 font-mono text-zinc-500">{idx + 1}</td>

                                      {/* Documento Origem */}
                                      <td className="py-2 px-3 font-mono text-zinc-400 text-[10px] max-w-[120px] truncate" title={row.sourceDocName}>
                                        {row.sourceDocName || '-'}
                                      </td>

                                      {/* Conta Identificada */}
                                      <td className="py-2 px-3 font-mono text-zinc-300 text-[10px] max-w-[140px] truncate" title={row.account}>
                                        {row.account || '-'}
                                      </td>

                                      {/* Nome Declarado */}
                                      <td className="py-2 px-3 font-mono text-white font-medium max-w-[200px] truncate" title={row.pdfFileName}>
                                        {row.pdfFileName}
                                      </td>

                                      {/* Nome Selecionado */}
                                      <td className="py-2 px-3 font-mono text-zinc-300 max-w-[180px] truncate" title={row.selectedFileName}>
                                        {row.selectedFileName}
                                      </td>

                                      {/* Caminho Relativo */}
                                      <td className="py-2 px-3 font-mono text-zinc-500 text-[10px] max-w-[150px] truncate" title={row.relativePath}>
                                        {row.relativePath}
                                      </td>

                                      {/* Situação da Associação */}
                                      <td className="py-2 px-3">
                                        {row.associationStatus === 'ASSOCIADO' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-900/50">
                                            {assocLabel}
                                          </span>
                                        ) : row.associationStatus === 'AMBIGUO' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800">
                                            AMBIGUO ({row.ambiguousCandidates?.length || 2} opções)
                                          </span>
                                        ) : row.associationStatus === 'EXTRA' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/50 text-amber-400 border border-amber-900/50">
                                            EXTRA
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/50 text-rose-400 border border-rose-900/50">
                                            NAO_ASSOCIADO
                                          </span>
                                        )}
                                      </td>

                                      {/* Situação do Hash */}
                                      <td className="py-2 px-3">
                                        {row.hashStatus === 'CALCULADO' ? (
                                          <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                            <span className="truncate max-w-[90px]" title={row.calculatedHash}>
                                              CALCULADO
                                            </span>
                                          </div>
                                        ) : row.hashStatus === 'CALCULANDO' ? (
                                          <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400">
                                            <Clock className="w-3 h-3 animate-spin shrink-0" />
                                            CALCULANDO
                                          </span>
                                        ) : row.hashStatus === 'ERRO' ? (
                                          <span className="text-[10px] font-mono text-rose-400 font-bold">ERRO</span>
                                        ) : (
                                          <span className="text-[10px] font-mono text-zinc-500">PENDENTE</span>
                                        )}
                                      </td>

                                      {/* Situação da Comparação */}
                                      <td className="py-2 px-3">
                                        {compLabel === 'COINCIDENTE' ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-400 font-bold flex items-center gap-1 w-max">
                                            <Check className="w-3 h-3 text-emerald-400" />
                                            COINCIDENTE
                                          </span>
                                        ) : compLabel === 'DIVERGENTE' ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-400 font-bold flex items-center gap-1 w-max">
                                            <AlertOctagon className="w-3 h-3 text-rose-400" />
                                            DIVERGENTE
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-mono text-zinc-500">NAO_APLICAVEL</span>
                                        )}
                                      </td>

                                      {/* Veredito Final */}
                                      <td className="py-2 px-3 font-mono text-[10px]">
                                        {row.finalVerdict === 'INTEGRO' ? (
                                          <span className="text-emerald-400 font-bold">INTEGRO</span>
                                        ) : row.finalVerdict === 'ALTERADO' ? (
                                          <span className="text-rose-400 font-bold">ALTERADO</span>
                                        ) : row.finalVerdict === 'EXTRA' ? (
                                          <span className="text-amber-400 font-bold">EXTRA</span>
                                        ) : row.finalVerdict === 'AMBIGUO' ? (
                                          <span className="text-purple-400 font-bold">AMBIGUO</span>
                                        ) : (
                                          <span className="text-rose-400 font-bold">AUSENTE</span>
                                        )}
                                      </td>

                                    {/* Ações / Ajuste */}
                                    <td className="py-2 px-3">
                                      {row.associationStatus === 'AMBIGUO' && row.ambiguousCandidates ? (
                                        <select
                                          className="bg-[#17191D] border border-purple-700/60 text-purple-200 text-[10px] rounded px-1.5 py-0.5 max-w-[140px] focus:outline-none"
                                          onChange={(e) => {
                                            if (e.target.value && row.item) {
                                              handleManualAssociate(e.target.value, row.item.id);
                                            }
                                          }}
                                          defaultValue=""
                                        >
                                          <option value="">Escolher arquivo correto...</option>
                                          {row.ambiguousCandidates.map((cand, ci) => {
                                            const rel = (cand as { webkitRelativePath?: string }).webkitRelativePath || cand.name;
                                            return (
                                              <option key={ci} value={cand.name}>
                                                {rel}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      ) : row.associationStatus === 'EXTRA' ? (
                                        <select
                                          className="bg-[#17191D] border border-[#363B47] text-zinc-300 text-[10px] rounded px-1.5 py-0.5 max-w-[130px] focus:outline-none focus:border-[#F57917]"
                                          value={manualAssociations[row.selectedFileName] || ''}
                                          onChange={(e) => handleManualAssociate(row.selectedFileName, e.target.value)}
                                        >
                                          <option value="">Vincular a ausente...</option>
                                          {unassignedDeclared.map((it) => (
                                            <option key={it.id} value={it.id}>
                                              {it.fileName}
                                            </option>
                                          ))}
                                        </select>
                                      ) : row.associationType === 'MANUAL' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveManualAssociation(row.selectedFileName)}
                                          className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer font-mono"
                                          title="Desfazer associação manual"
                                        >
                                          <Unlink className="w-3 h-3" />
                                          <span>Desvincular</span>
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ACTION BUTTON (Section 8) */}
          {(() => {
            const hasItems = selectedProvider === 'GOOGLE' ? googleMergedItems.length > 0 : appleItems.length > 0;
            const hasFiles = selectedProvider === 'GOOGLE' ? googleDeliveredFiles.length > 0 : appleDeliveredFiles.length > 0;
            const canStart = hasItems && hasFiles && !isProcessing;
            const diag = computeDiagnostics();

            return (
              <div className="bg-[#0F1115] border border-[#262930] rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Execução da Verificação Criptográfica Forense
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {selectedProvider === 'GOOGLE'
                      ? `${googleMergedItems.length} registros no PDF • ${googleDeliveredFiles.length} arquivos selecionados • ${diag.totalAssociated} associados com sucesso`
                      : `${appleItems.length} registros no CSV • ${appleDeliveredFiles.length} arquivos selecionados • ${diag.totalAssociated} associados com sucesso`}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      disabled={isProcessing}
                      className="px-4 py-2.5 rounded-xl bg-[#17191D] hover:bg-[#20242C] border border-[#262930] text-zinc-400 hover:text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4 text-zinc-500" />
                      <span>Limpar Tudo</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleStartVerification}
                      disabled={!canStart}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-lg cursor-pointer flex items-center gap-2 ${
                        !canStart
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          : selectedProvider === 'GOOGLE'
                          ? 'bg-[#4285F4] hover:bg-[#3367D6] text-white shadow-blue-500/20'
                          : 'bg-[#F57917] hover:bg-[#e06c10] text-white shadow-amber-500/20'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isProcessing ? 'Calculando SHA-512...' : 'INICIAR VALIDAÇÃO FORENSE'}</span>
                    </button>
                  </div>

                  {!canStart && (
                    <span className="text-[10px] text-amber-400/90 font-mono">
                      {!hasItems
                        ? `* Importe o ${selectedProvider === 'GOOGLE' ? 'PDF' : 'CSV'} com os hashes para habilitar.`
                        : !hasFiles
                        ? '* Selecione a pasta ou os arquivos recebidos para confronto.'
                        : ''}
                    </span>
                  )}
                  {canStart && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      ✓ Pronto para validar: {diag.totalAssociated} associado(s){diag.missing.length > 0 ? `, ${diag.missing.length} ausente(s)` : ''}{diag.extras.length > 0 ? `, ${diag.extras.length} extra(s)` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Enhanced Progress Bar during calculation (Section 6) */}
          {isProcessing && (
            <div className="bg-[#121418] border border-[#262930] rounded-xl p-5 animate-fade-in space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-zinc-200 font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F57917] animate-spin" />
                  <span>Calculando Hashes SHA-512 em Blocos (100% Local)...</span>
                </span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-zinc-400">
                    Arquivo <span className="text-white font-bold">{currentFileIndex}</span> de{' '}
                    <span className="text-white font-bold">{totalFilesToHash}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#F57917]/20 text-[#F57917] font-bold">
                    {progressPercent}%
                  </span>
                </div>
              </div>

              <div className="w-full bg-[#1A1D24] rounded-full h-2.5 overflow-hidden border border-[#262930]">
                <div
                  className="bg-gradient-to-r from-[#F57917] via-amber-400 to-emerald-400 h-full transition-all duration-150"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400 font-mono">
                <div className="flex items-center gap-2 truncate max-w-xl">
                  <span className="text-zinc-500">Arquivo:</span>
                  <span className="text-white truncate" title={currentHashedName}>
                    {currentHashedName}
                  </span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {currentFileTotalBytes > 0 && (
                    <span className="text-zinc-300">
                      Bytes: {formatBytes(currentBytesProcessed)} / {formatBytes(currentFileTotalBytes)}
                    </span>
                  )}
                  <span className="text-zinc-400">
                    Tempo: <span className="text-white font-bold">{elapsedSeconds}s</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-rose-400 hover:text-rose-300 hover:underline cursor-pointer font-sans text-xs font-semibold"
                  >
                    Cancelar Processamento
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* RESULTS DASHBOARD */}
          {/* ================================================================= */}
          {validationSession && (
            <div className="space-y-6 animate-fade-in">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="p-3.5 rounded-xl bg-[#121418] border border-[#262930] text-center">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Contas</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {validationSession.summary.totalAccounts}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121418] border border-[#262930] text-center">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Esperados</div>
                  <div className="text-lg font-bold text-zinc-300 font-mono mt-1">
                    {validationSession.summary.totalExpected}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121418] border border-[#262930] text-center">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Entregues</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {validationSession.summary.totalDelivered}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-center">
                  <div className="text-[10px] text-emerald-400 font-mono uppercase">Íntegros (OK)</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                    {validationSession.summary.totalIntegro}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl text-center border ${
                    validationSession.summary.totalAlterado > 0
                      ? 'bg-rose-950/30 border-rose-800 text-rose-400'
                      : 'bg-[#121418] border-[#262930] text-zinc-500'
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase">Alterados (Falha)</div>
                  <div className="text-lg font-bold font-mono mt-1">
                    {validationSession.summary.totalAlterado}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl text-center border ${
                    validationSession.summary.totalAusente > 0
                      ? 'bg-amber-950/30 border-amber-800 text-amber-400'
                      : 'bg-[#121418] border-[#262930] text-zinc-500'
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase">Ausentes</div>
                  <div className="text-lg font-bold font-mono mt-1">
                    {validationSession.summary.totalAusente}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121418] border border-[#262930] text-center">
                  <div className="text-[10px] text-purple-400 font-mono uppercase">Extras</div>
                  <div className="text-lg font-bold text-purple-300 font-mono mt-1">
                    {validationSession.summary.totalExtra}
                  </div>
                </div>
              </div>

              {/* Strict Forensic Conclusion Banner */}
              {(() => {
                const conc = getForensicConclusion(
                  validationSession.summary,
                  validationSession.provider
                );
                const isSuccess = conc.type === 'conclusive_success';
                const isDivergent = conc.type === 'divergent';
                const isIncomplete = conc.type === 'incomplete';
                const isExtrasOnly = conc.type === 'extras_only';
                const isInconclusive = conc.type === 'inconclusive';

                const borderBgClass = isDivergent
                  ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                  : isInconclusive
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  : isIncomplete
                  ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                  : isExtrasOnly
                  ? 'bg-purple-950/40 border-purple-800 text-purple-200'
                  : 'bg-emerald-950/40 border-emerald-800 text-emerald-200';

                return (
                  <div className={`p-4 rounded-xl border text-xs flex items-start sm:items-center gap-3 ${borderBgClass}`}>
                    {isDivergent ? (
                      <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : isInconclusive ? (
                      <AlertCircle className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : isIncomplete ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : isExtrasOnly ? (
                      <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <div>
                      <strong className="font-bold uppercase tracking-wide mr-1.5">{conc.title}:</strong>
                      <span>{conc.message}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Forensic Verification Seal Card */}
              <div className="p-3.5 rounded-xl bg-[#121418] border border-[#262930] text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span className="text-zinc-400">Selo Forense da Sessão (SHA-256):</span>
                  <span className="font-mono text-zinc-200">{validationSession.verificationSealSha256}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(validationSession.verificationSealSha256)}
                  className="text-xs text-[#F57917] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedHash === validationSession.verificationSealSha256 ? 'Copiado' : 'Copiar Selo'}</span>
                </button>
              </div>

              {/* Navigation Tabs between "Completude por Conta" & "Arquivos Detalhados" */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262930] pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAccountTab('ACCOUNTS')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeAccountTab === 'ACCOUNTS'
                        ? 'bg-[#17191D] text-white border border-[#262930] shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-[#F57917]" />
                    <span>Completude por Conta ({validationSession.accounts.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAccountTab('ITEMS')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeAccountTab === 'ITEMS'
                        ? 'bg-[#17191D] text-white border border-[#262930] shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <FileCheck2 className="w-3.5 h-3.5 text-[#F57917]" />
                    <span>Relação Detalhada de Arquivos ({validationSession.items.length})</span>
                  </button>
                </div>

                {/* Export Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportCloudValidationPDF(validationSession)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#F57917] hover:bg-[#e06c10] text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportCloudValidationCSV(validationSession);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `SAM_HASH_${validationSession.provider}_DETALHADO.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#262930] text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>CSV Detalhado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportCloudAccountCompletenessCSV(validationSession);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `SAM_HASH_${validationSession.provider}_CONTAS.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#262930] text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>CSV Contas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const txt = exportCloudShaSumList(validationSession);
                      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${validationSession.provider.toLowerCase()}_shasum_list.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#262930] border border-[#262930] text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Exporta lista no formato sha256sum/sha512sum com quebra de linha UNIX LF para conferência externa"
                  >
                    <span>Lista Shasum (LF)</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: COMPLETUDE POR CONTA */}
              {activeAccountTab === 'ACCOUNTS' && (
                <div className="bg-[#121418] border border-[#262930] rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px]">
                          <th className="py-3 px-4">Conta / Identificador</th>
                          <th className="py-3 px-3 text-center">Esperados</th>
                          <th className="py-3 px-3 text-center">Entregues</th>
                          <th className="py-3 px-3 text-center text-emerald-400">Íntegros</th>
                          <th className="py-3 px-3 text-center text-rose-400">Alterados</th>
                          <th className="py-3 px-3 text-center text-amber-400">Ausentes</th>
                          <th className="py-3 px-3 text-center text-purple-400">Extras</th>
                          <th className="py-3 px-4">Situação Forense da Conta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#20242C]">
                        {validationSession.accounts.map((acc, idx) => (
                          <tr key={idx} className="hover:bg-[#1A1D24] transition-colors">
                            <td className="py-3 px-4 font-mono font-semibold text-white">
                              {acc.account}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-zinc-300">
                              {acc.expected}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-white">
                              {acc.delivered}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-emerald-400 font-semibold">
                              {acc.integro}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-rose-400 font-semibold">
                              {acc.alterado}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-amber-400 font-semibold">
                              {acc.ausente}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-purple-400">
                              {acc.extra}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                                  acc.status === 'INTEGRA'
                                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/60'
                                    : acc.status === 'SEM_ENTREGA'
                                    ? 'bg-rose-950/40 text-rose-400 border border-rose-900/60'
                                    : acc.status === 'DIVERGENTE'
                                    ? 'bg-rose-950/40 text-rose-400 border border-rose-900/60'
                                    : 'bg-amber-950/40 text-amber-400 border border-amber-900/60'
                                }`}
                              >
                                {acc.status === 'INTEGRA' ? (
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                )}
                                <span>{acc.statusLabel}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: DETAILED ITEMS */}
              {activeAccountTab === 'ITEMS' && (
                <div className="space-y-4">
                  {/* Filters & Search Bar */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-[#121418] border border-[#262930] p-3 rounded-xl">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        ['TODOS', 'INTEGRO', 'ALTERADO', 'AUSENTE', 'EXTRA', 'NAO_VERIFICAVEL'] as const
                      ).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setActiveTabFilter(filter)}
                          className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                            activeTabFilter === filter
                              ? 'bg-[#F57917] text-white font-semibold'
                              : 'bg-[#17191D] text-zinc-400 hover:text-white border border-[#262930]'
                          }`}
                        >
                          {filter === 'TODOS'
                            ? `Todos (${validationSession.items.length})`
                            : filter === 'INTEGRO'
                            ? `Íntegros (${validationSession.summary.totalIntegro})`
                            : filter === 'ALTERADO'
                            ? `Alterados (${validationSession.summary.totalAlterado})`
                            : filter === 'AUSENTE'
                            ? `Ausentes (${validationSession.summary.totalAusente})`
                            : filter === 'EXTRA'
                            ? `Extras (${validationSession.summary.totalExtra})`
                            : `Não Verificáveis (${validationSession.summary.totalNaoVerificavel})`}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full md:w-64">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por arquivo ou conta..."
                        className="w-full bg-[#17191D] border border-[#262930] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-[#F57917] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-3">
                    {filteredItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border text-xs transition-all ${
                          item.verdict === 'INTEGRO'
                            ? 'bg-[#121418] border-[#262930] hover:border-emerald-800'
                            : item.verdict === 'ALTERADO'
                            ? 'bg-rose-950/20 border-rose-800/80'
                            : item.verdict === 'AUSENTE'
                            ? 'bg-amber-950/20 border-amber-800/80'
                            : item.verdict === 'EXTRA'
                            ? 'bg-purple-950/20 border-purple-800/80'
                            : 'bg-zinc-900/40 border-zinc-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-mono text-zinc-500 text-[10px]">#{item.sequence}</span>
                            <span className="font-bold text-white font-mono truncate" title={item.fileName}>
                              {item.fileName}
                            </span>
                            {item.categoryOrProduct && (
                              <span className="px-2 py-0.5 rounded bg-[#1F242D] text-zinc-300 text-[10px]">
                                {item.categoryOrProduct}
                              </span>
                            )}
                          </div>

                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider shrink-0 ${
                              item.verdict === 'INTEGRO'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                : item.verdict === 'ALTERADO'
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                                : item.verdict === 'AUSENTE'
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-800'
                                : item.verdict === 'EXTRA'
                                ? 'bg-purple-950/60 text-purple-300 border border-purple-800'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {item.verdictLabel}
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-zinc-400 flex flex-wrap items-center gap-3">
                          <div>
                            Conta: <span className="font-mono text-zinc-200">{item.account}</span>
                          </div>
                          {item.formattedSize && (
                            <div>
                              Tamanho: <span className="text-zinc-300">{item.formattedSize}</span>
                            </div>
                          )}
                          {item.timeTakenMs !== undefined && (
                            <div>
                              Tempo de Cálculo: <span className="text-zinc-300">{item.timeTakenMs} ms</span>
                            </div>
                          )}
                        </div>

                        {/* Hash details */}
                        <div className="mt-3 pt-2.5 border-t border-[#262930] grid grid-cols-1 gap-2 font-mono text-[11px]">
                          {item.declaredHash && (
                            <div className="flex items-start justify-between gap-2 bg-[#090A0D] p-2 rounded border border-[#1C1F26]">
                              <div className="overflow-hidden">
                                <span className="text-zinc-500 block text-[10px]">
                                  HASH DECLARADO ({item.algorithm}):
                                </span>
                                <span className="text-zinc-300 break-all select-all">{item.declaredHash}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(item.declaredHash!)}
                                className="text-zinc-500 hover:text-white p-1 shrink-0 cursor-pointer"
                                title="Copiar hash declarado"
                              >
                                {copiedHash === item.declaredHash ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}

                          {item.calculatedHash && (
                            <div className="flex items-start justify-between gap-2 bg-[#090A0D] p-2 rounded border border-[#1C1F26]">
                              <div className="overflow-hidden">
                                <span className="text-zinc-500 block text-[10px]">
                                  HASH CALCULADO ({item.algorithm}):
                                </span>
                                <span
                                  className={`break-all select-all font-semibold ${
                                    item.verdict === 'INTEGRO' ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {item.calculatedHash}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(item.calculatedHash!)}
                                className="text-zinc-500 hover:text-white p-1 shrink-0 cursor-pointer"
                                title="Copiar hash calculado"
                              >
                                {copiedHash === item.calculatedHash ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {item.notes && (
                          <div className="mt-2 text-[11px] text-zinc-400 italic flex items-center gap-1.5">
                            <Info className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span>{item.notes}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {filteredItems.length === 0 && (
                      <div className="p-8 text-center text-zinc-500 text-xs border border-[#262930] rounded-xl">
                        Nenhum arquivo corresponde ao filtro selecionado.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL TO CLEAR ALL */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121418] border border-[#262930] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                Confirmar Limpeza Total
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Deseja realmente limpar toda a sessão atual de conferência em nuvem? Os documentos e arquivos selecionados serão descarregados da memória do navegador.
            </p>

            <div className="p-3 rounded-xl bg-[#1A1D24] border border-[#262930] text-[11px] text-zinc-400">
              <strong className="text-zinc-200">Garantia Forense:</strong> Nenhum arquivo local existente no disco do seu computador será alterado ou excluído.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-xl bg-[#1A1D24] hover:bg-[#262930] text-zinc-300 text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

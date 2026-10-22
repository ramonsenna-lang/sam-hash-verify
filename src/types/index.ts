/**
 * HASH VERIFY — Forensic Integrity System
 * Data structures and types for forensic cryptographic verification
 */

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';

export type ValidationStatus =
  | 'CORRESPONDENTE'
  | 'DIVERGENTE'
  | 'SEM_REFERENCIA'
  | 'NAO_LOCALIZADO'
  | 'ERRO'
  | 'CANCELADO'
  | 'PROCESSANDO'
  | 'PENDENTE';

export type ExtractionType =
  | 'Física'
  | 'Sistema de arquivos'
  | 'Lógica'
  | 'Nuvem'
  | 'Outro';

export interface ForensicExtractionMetadata {
  procedureNumber: string;
  evidenceNumber: string;
  deviceId: string;
  toolName: string;
  extractionType: ExtractionType;
  examinerName: string;
  technicalNotes: string;
  referenceHash: string;
  algorithm: HashAlgorithm;
}

export interface HashCalculationResult {
  algorithm: HashAlgorithm;
  hash: string;
  timeTakenMs: number;
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  formattedSize: string;
  relativePath?: string;
}

export interface SingleValidationRecord {
  id: string;
  timestamp: string;
  timezone: string;
  fileMetadata: FileMetadata;
  algorithm: HashAlgorithm;
  referenceHash: string;
  calculatedHash: string;
  status: ValidationStatus;
  examinerName?: string;
  procedureNumber?: string;
  evidenceNumber?: string;
  toolName?: string;
  notes?: string;
}

export interface BatchItem {
  id: string;
  fileName: string;
  file?: File;
  relativePath?: string;
  fileSize?: number;
  formattedSize?: string;
  algorithm: HashAlgorithm;
  expectedHash?: string;
  calculatedHash?: string;
  status: ValidationStatus;
  progress: number;
  errorMessage?: string;
  timeTakenMs?: number;
}

export interface ComparisonRecord {
  id: string;
  timestamp: string;
  fileA: {
    name: string;
    size: number;
    formattedSize: string;
    hash: string;
  };
  fileB: {
    name: string;
    size: number;
    formattedSize: string;
    hash: string;
  };
  algorithm: HashAlgorithm;
  identical: boolean;
  timeTakenMs: number;
}

export interface CryptoVectorTest {
  id: string;
  name: string;
  description: string;
  input: string;
  expected: Record<HashAlgorithm, string>;
}

export type ManifestItemStatus =
  | 'CORRESPONDENTE'
  | 'DIVERGENTE'
  | 'ARQUIVO_NAO_LOCALIZADO'
  | 'ASSOCIACAO_AMBIGUA'
  | 'ERRO_LEITURA'
  | 'REGISTRO_INVALIDO'
  | 'NAO_VERIFICADO'
  | 'AUSENTE'
  | 'ADICIONAL'
  | 'SEM_REFERENCIA';

export interface ExtractionManifestItem {
  id: string;
  fileName: string;
  relativePath: string;
  size: number;
  formattedSize: string;
  algorithm: HashAlgorithm;
  hash: string;
  timestamp: string;
}

export interface ManifestVerificationItem {
  id: string;
  sequence?: number;
  fileName: string;
  relativePath: string;
  size?: number;
  formattedSize?: string;
  algorithm: HashAlgorithm;
  expectedHash?: string;
  calculatedHash?: string;
  status: ManifestItemStatus;
  statusLabel?: string;
  notes?: string;
  candidateFiles?: File[];
  selectedFile?: File;
  lineNumber?: number;
}

export type FolderItemStatus = 'CALCULADO' | 'ERRO' | 'CANCELADO' | 'PENDENTE';

export interface FolderFileItem {
  id: string;
  seq: number;
  fileName: string;
  relativePath: string;
  extension: string;
  size: number;
  formattedSize: string;
  file: File;
  algorithm: HashAlgorithm;
  hashes: Partial<Record<HashAlgorithm, string>>;
  status: FolderItemStatus;
  errorMessage?: string;
  timeTakenMs?: number;
}

// -----------------------------------------------------------------------------
// CONFIGURATION & DOCUMENT CUSTOMIZATION TYPES
// -----------------------------------------------------------------------------

export type HashCaseFormat = 'lowercase' | 'uppercase';
export type PageOrientation = 'portrait' | 'landscape';
export type PaperSize = 'a4';

export interface HeaderConfig {
  title: string;
  subtitle: string;
  description: string;
  institutionName: string;
  sectorName: string;
  logoDataUrl?: string;
  logoAlignment: 'left' | 'center' | 'right';
  showInstitutionalFields: boolean;
}

export interface FooterConfig {
  developerCredit: string;
  trainingContext: string;
  customText?: string;
  showPageNumbers: boolean;
  showIssueDate: boolean;
  showAppVersion: boolean;
  showReportId: boolean;
  showInstitutionalNotes: boolean;
  customInstitutionalNotes?: string;
}

export interface DocumentFormattingConfig {
  paperSize: PaperSize;
  orientation: PageOrientation;
  marginsMm: number;
  primaryFontSizePt: number;
  titleAccentColor: string;
  showTableBorders: boolean;
  autoPageBreak: boolean;
}

export interface DefaultFieldsConfig {
  procedureNumber: string;
  evidenceNumber: string;
  examinerName: string;
  examinerBadge: string;
  unitName: string;
  extractionTool: string;
  defaultNotes: string;
}

export interface DocumentModelPreset {
  id: string;
  name: string;
  description: string;
  isCustom?: boolean;
  header: HeaderConfig;
  footer: FooterConfig;
  formatting: DocumentFormattingConfig;
  defaultFields: DefaultFieldsConfig;
}

export interface GeneralPreferences {
  defaultAlgorithm: HashAlgorithm;
  enabledAlgorithms: HashAlgorithm[];
  hashCase: HashCaseFormat;
  theme: 'dark' | 'light';
  language: 'pt-BR';
  dateFormat: 'pt-BR';
  sizeUnits: 'auto' | 'bytes' | 'kb' | 'mb' | 'gb';
  chunkSizeMb: number;
}

export interface AppConfiguration {
  version: string;
  general: GeneralPreferences;
  documents: {
    activeModelId: string;
    header: HeaderConfig;
    footer: FooterConfig;
    formatting: DocumentFormattingConfig;
    defaultFields: DefaultFieldsConfig;
    models: DocumentModelPreset[];
  };
  audit: {
    detailedTechnicalLog: boolean;
  };
}

// -----------------------------------------------------------------------------
// LOGS & AUDIT TYPES
// -----------------------------------------------------------------------------

export type AuditOperationType =
  | 'CALCULO_HASH'
  | 'VALIDACAO_HASH'
  | 'COMPARACAO_HASHES'
  | 'VALIDACAO_LOTE'
  | 'EXTRACAO_FORENSE'
  | 'HASH_PASTAS'
  | 'MANIFESTO_GERADO'
  | 'MANIFESTO_VALIDADO'
  | 'RELATORIO_GERADO'
  | 'CONFIGURACAO_ALTERADA'
  | 'TESTES_CRIPTOGRAFICOS'
  | 'SISTEMA_INICIALIZADO';

export type AuditResultStatus = 'SUCESSO' | 'DIVERGENTE' | 'ERRO' | 'CANCELADO' | 'INFO';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  formattedDate: string;
  timezone: string;
  operation: AuditOperationType;
  status: AuditResultStatus;
  durationMs?: number;
  message: string;
  algorithm?: HashAlgorithm;
  filesCount?: number;
  details?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// CLOUD PROVIDER VALIDATION TYPES (GOOGLE & APPLE)
// -----------------------------------------------------------------------------

export type CloudProvider = 'GOOGLE' | 'APPLE';

export type CloudValidationVerdict =
  | 'INTEGRO'
  | 'ALTERADO'
  | 'AUSENTE'
  | 'EXTRA'
  | 'NAO_VERIFICAVEL';

export type AppleValidationMode = 'GPG_ENCRYPTED' | 'ZIP_DECRYPTED';

export interface GoogleCloudManifestItem {
  id: string;
  fileName: string;
  account: string;
  algorithm: 'SHA-512';
  declaredHash: string;
  sourcePdfName?: string;
  sourcePage?: number;
}

export interface AppleCloudManifestItem {
  id: string;
  dataType: string;
  fileName: string;
  accountId: string;
  fileLink?: string;
  fileType?: string;
  gpgSize?: string;
  gpgSha256?: string;
  gpgSha512?: string;
  clearTextSha256?: string;
  clearTextSha512?: string;
  expiryDate?: string;
  sourceCsvName?: string;
}

export interface CloudVerificationItem {
  id: string;
  sequence: number;
  provider: CloudProvider;
  account: string;
  fileName: string;
  relativePath?: string;
  categoryOrProduct?: string;
  algorithm: HashAlgorithm;
  declaredHash?: string;
  calculatedHash?: string;
  verdict: CloudValidationVerdict;
  verdictLabel: string;
  severity: 'none' | 'warning' | 'grave';
  deliveredFile?: File;
  fileSize?: number;
  formattedSize?: string;
  timeTakenMs?: number;
  sourceDoc?: string;
  notes?: string;
  gpgSize?: string;
  expiryDate?: string;
}

export interface CloudAccountCompleteness {
  account: string;
  expected: number;
  delivered: number;
  integro: number;
  alterado: number;
  ausente: number;
  extra: number;
  naoVerificavel: number;
  status: 'INTEGRA' | 'INCOMPLETA' | 'DIVERGENTE' | 'SEM_ENTREGA';
  statusLabel: string;
}

export interface CloudValidationSession {
  id: string;
  provider: CloudProvider;
  procedureNumber?: string;
  internalReference?: string;
  declaredDate?: string;
  examinerName?: string;
  notes?: string;
  sourceDocs: Array<{
    name: string;
    size: number;
    sha256: string;
    itemsCount: number;
  }>;
  items: CloudVerificationItem[];
  accounts: CloudAccountCompleteness[];
  appleMode?: AppleValidationMode;
  appleAlgorithm?: 'SHA-256' | 'SHA-512';
  summary: {
    totalExpected: number;
    totalDelivered: number;
    totalIntegro: number;
    totalAlterado: number;
    totalAusente: number;
    totalExtra: number;
    totalNaoVerificavel: number;
    totalAccounts: number;
    integrityRate: number;
  };
  verificationSealSha256: string;
  generatedAt: string;
}

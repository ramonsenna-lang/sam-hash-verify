/**
 * SAM HASH VERIFY — Centralized Configuration Management
 * Handles general preferences, document layouts, headers, footers, models presets,
 * and JSON backup/restore. 100% client-side with localStorage persistence.
 */

import {
  AppConfiguration,
  DocumentModelPreset,
  GeneralPreferences,
  HeaderConfig,
  FooterConfig,
  DocumentFormattingConfig,
  DefaultFieldsConfig,
} from '../types';
import { auditLogger } from './auditLogger';

export const CONFIG_STORAGE_KEY = 'sam_hash_verify_v1_config';
export const CONFIG_VERSION = '1.2.0';

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  title: 'SAM HASH VERIFY',
  subtitle: 'FORENSIC INTEGRITY SYSTEM',
  description: 'Sistema de Geração e Validação de Integridade Digital',
  institutionName: 'Polícia Federal',
  sectorName: 'Perícia Digital Forense',
  logoDataUrl: undefined,
  logoAlignment: 'left',
  showInstitutionalFields: true,
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  developerCredit: 'Desenvolvido pelo APF Ramon (ramon.grsl)',
  trainingContext: 'Polícia Federal — XIV Cellebrite — Turma A — 2026',
  customText: '',
  showPageNumbers: true,
  showIssueDate: true,
  showAppVersion: true,
  showReportId: true,
  showInstitutionalNotes: true,
  customInstitutionalNotes:
    'Documento gerado localmente pelo SAM HASH VERIFY com atestação matemática de integridade.',
};

export const DEFAULT_FORMATTING_CONFIG: DocumentFormattingConfig = {
  paperSize: 'a4',
  orientation: 'portrait',
  marginsMm: 14,
  primaryFontSizePt: 8.5,
  titleAccentColor: '#F57917',
  showTableBorders: true,
  autoPageBreak: true,
};

export const DEFAULT_FIELDS_CONFIG: DefaultFieldsConfig = {
  procedureNumber: '',
  evidenceNumber: '',
  examinerName: '',
  examinerBadge: '',
  unitName: '',
  extractionTool: '',
  defaultNotes: '',
};

export const DEFAULT_GENERAL_PREFERENCES: GeneralPreferences = {
  defaultAlgorithm: 'SHA-256',
  enabledAlgorithms: ['SHA-256', 'MD5', 'SHA-1', 'SHA-512'],
  hashCase: 'lowercase',
  theme: 'dark',
  language: 'pt-BR',
  dateFormat: 'pt-BR',
  sizeUnits: 'auto',
  chunkSizeMb: 2,
};

export const BUILT_IN_MODELS: DocumentModelPreset[] = [
  {
    id: 'padrao',
    name: 'Modelo Padrão SAM HASH VERIFY',
    description: 'Cabeçalho oficial Cellebrite charcoal & laranja, campos periciais completos e rodapé padrão.',
    isCustom: false,
    header: { ...DEFAULT_HEADER_CONFIG },
    footer: { ...DEFAULT_FOOTER_CONFIG },
    formatting: { ...DEFAULT_FORMATTING_CONFIG },
    defaultFields: { ...DEFAULT_FIELDS_CONFIG },
  },
  {
    id: 'simplificado',
    name: 'Modelo Técnico Simplificado',
    description: 'Visual minimalista monocromático, focado diretamente na tabela de hashes sem caixas decorativas.',
    isCustom: false,
    header: {
      ...DEFAULT_HEADER_CONFIG,
      description: 'Termo de Validação de Integridade Criptográfica',
      showInstitutionalFields: false,
    },
    footer: {
      ...DEFAULT_FOOTER_CONFIG,
      showInstitutionalNotes: false,
    },
    formatting: {
      ...DEFAULT_FORMATTING_CONFIG,
      titleAccentColor: '#3F3F46', // Neutral zinc
      marginsMm: 12,
    },
    defaultFields: { ...DEFAULT_FIELDS_CONFIG },
  },
  {
    id: 'detalhado',
    name: 'Modelo Técnico Detalhado Forense',
    description: 'Laudo pericial abrangente com todas as caixas de metadados, identificação funcional, setor e notas.',
    isCustom: false,
    header: {
      ...DEFAULT_HEADER_CONFIG,
      showInstitutionalFields: true,
    },
    footer: {
      ...DEFAULT_FOOTER_CONFIG,
      showPageNumbers: true,
      showIssueDate: true,
      showAppVersion: true,
      showReportId: true,
      showInstitutionalNotes: true,
    },
    formatting: {
      ...DEFAULT_FORMATTING_CONFIG,
      showTableBorders: true,
    },
    defaultFields: {
      ...DEFAULT_FIELDS_CONFIG,
      defaultNotes: 'Análise de integridade realizada em estação pericial sem conexão com redes externas.',
    },
  },
];

export const DEFAULT_APP_CONFIGURATION: AppConfiguration = {
  version: CONFIG_VERSION,
  general: { ...DEFAULT_GENERAL_PREFERENCES },
  documents: {
    activeModelId: 'padrao',
    header: { ...DEFAULT_HEADER_CONFIG },
    footer: { ...DEFAULT_FOOTER_CONFIG },
    formatting: { ...DEFAULT_FORMATTING_CONFIG },
    defaultFields: { ...DEFAULT_FIELDS_CONFIG },
    models: [...BUILT_IN_MODELS],
  },
  audit: {
    detailedTechnicalLog: false,
  },
};

type ConfigSubscriber = (config: AppConfiguration) => void;
const configSubscribers: Set<ConfigSubscriber> = new Set();

/**
 * Load application configuration safely from localStorage
 */
export function getAppConfiguration(): AppConfiguration {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_CONFIGURATION;
  }

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_CONFIGURATION;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APP_CONFIGURATION;

    // Deep merge with defaults to ensure all required fields exist
    return {
      version: parsed.version || CONFIG_VERSION,
      general: {
        ...DEFAULT_GENERAL_PREFERENCES,
        ...(parsed.general || {}),
      },
      documents: {
        activeModelId: parsed.documents?.activeModelId || 'padrao',
        header: {
          ...DEFAULT_HEADER_CONFIG,
          ...(parsed.documents?.header || {}),
        },
        footer: {
          ...DEFAULT_FOOTER_CONFIG,
          ...(parsed.documents?.footer || {}),
        },
        formatting: {
          ...DEFAULT_FORMATTING_CONFIG,
          ...(parsed.documents?.formatting || {}),
        },
        defaultFields: {
          ...DEFAULT_FIELDS_CONFIG,
          ...(parsed.documents?.defaultFields || {}),
        },
        models:
          Array.isArray(parsed.documents?.models) && parsed.documents.models.length > 0
            ? parsed.documents.models
            : [...BUILT_IN_MODELS],
      },
      audit: {
        detailedTechnicalLog: Boolean(parsed.audit?.detailedTechnicalLog),
      },
    };
  } catch (err) {
    console.warn('Erro ao carregar configurações do localStorage, utilizando padrões:', err);
    return DEFAULT_APP_CONFIGURATION;
  }
}

/**
 * Save configuration to localStorage and notify subscribers
 */
export function saveAppConfiguration(config: AppConfiguration): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    auditLogger.setDetailedMode(config.audit.detailedTechnicalLog);
    auditLogger.addLog({
      operation: 'CONFIGURACAO_ALTERADA',
      status: 'SUCESSO',
      message: 'Preferências do sistema e personalizações de documentos salvas com sucesso.',
    });
    notifySubscribers(config);
  } catch (err) {
    console.error('Falha ao salvar configurações:', err);
    throw new Error('Não foi possível gravar as preferências no armazenamento local.');
  }
}

/**
 * Restore original system defaults
 */
export function resetAppConfiguration(): AppConfiguration {
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    const restored = DEFAULT_APP_CONFIGURATION;
    auditLogger.setDetailedMode(false);
    auditLogger.addLog({
      operation: 'CONFIGURACAO_ALTERADA',
      status: 'INFO',
      message: 'Configurações do SAM HASH VERIFY restauradas para os padrões originais de fábrica.',
    });
    notifySubscribers(restored);
    return restored;
  } catch (err) {
    console.error('Erro ao restaurar padrões:', err);
    return DEFAULT_APP_CONFIGURATION;
  }
}

/**
 * Export configuration object as a clean JSON backup file
 */
export function exportConfigurationJSON(config: AppConfiguration): string {
  const backup = {
    system: 'SAM HASH VERIFY',
    exportType: 'CONFIGURATION_BACKUP',
    version: config.version,
    exportedAt: new Date().toISOString(),
    configuration: config,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Validate and import a configuration JSON string
 */
export function importConfigurationJSON(
  jsonString: string
): { success: boolean; config?: AppConfiguration; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'O arquivo informado não contém um objeto JSON válido.' };
    }

    const payload = parsed.configuration || parsed;

    if (!payload.general || !payload.documents) {
      return {
        success: false,
        error: 'Estrutura de arquivo inválida: seções obrigatórias ("general" ou "documents") não localizadas.',
      };
    }

    const merged: AppConfiguration = {
      version: payload.version || CONFIG_VERSION,
      general: {
        ...DEFAULT_GENERAL_PREFERENCES,
        ...(payload.general || {}),
      },
      documents: {
        activeModelId: payload.documents?.activeModelId || 'padrao',
        header: {
          ...DEFAULT_HEADER_CONFIG,
          ...(payload.documents?.header || {}),
        },
        footer: {
          ...DEFAULT_FOOTER_CONFIG,
          ...(payload.documents?.footer || {}),
        },
        formatting: {
          ...DEFAULT_FORMATTING_CONFIG,
          ...(payload.documents?.formatting || {}),
        },
        defaultFields: {
          ...DEFAULT_FIELDS_CONFIG,
          ...(payload.documents?.defaultFields || {}),
        },
        models:
          Array.isArray(payload.documents?.models) && payload.documents.models.length > 0
            ? payload.documents.models
            : [...BUILT_IN_MODELS],
      },
      audit: {
        detailedTechnicalLog: Boolean(payload.audit?.detailedTechnicalLog),
      },
    };

    saveAppConfiguration(merged);
    auditLogger.addLog({
      operation: 'CONFIGURACAO_ALTERADA',
      status: 'SUCESSO',
      message: 'Backup de configurações importado e aplicado com sucesso ao sistema.',
    });

    return { success: true, config: merged };
  } catch (err: unknown) {
    return {
      success: false,
      error: `Erro ao processar JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function subscribeConfiguration(callback: ConfigSubscriber): () => void {
  configSubscribers.add(callback);
  return () => {
    configSubscribers.delete(callback);
  };
}

function notifySubscribers(config: AppConfiguration) {
  configSubscribers.forEach((cb) => {
    try {
      cb(config);
    } catch (e) {
      console.error(e);
    }
  });
}

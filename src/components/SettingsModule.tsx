import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  Sliders,
  FileText,
  ShieldCheck,
  Cpu,
  Database,
  Info,
  Save,
  RotateCcw,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  FileCode,
  Lock,
  HardDrive,
  Check,
  Trash2,
  Copy,
  Layers,
  Terminal,
  ExternalLink,
  Award,
} from 'lucide-react';
import {
  AppConfiguration,
  HashAlgorithm,
  HashCaseFormat,
  DocumentModelPreset,
  AuditLogEntry,
  AuditOperationType,
  AuditResultStatus,
} from '../types';
import {
  getAppConfiguration,
  saveAppConfiguration,
  resetAppConfiguration,
  exportConfigurationJSON,
  importConfigurationJSON,
  subscribeConfiguration,
  DEFAULT_APP_CONFIGURATION,
} from '../utils/config';
import { auditLogger } from '../utils/auditLogger';
import { generateTestDocumentPDF, formatForensicDate } from '../utils/exporter';
import { CryptoTestsModule } from './CryptoTestsModule';

interface SettingsModuleProps {
  initialSubTab?: string;
  onThemeChange?: (isDark: boolean) => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  initialSubTab = 'geral',
  onThemeChange,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<string>(initialSubTab);
  const [config, setConfig] = useState<AppConfiguration>(getAppConfiguration());

  // Save feedback
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState<boolean>(false);

  // Document Model selection
  const [selectedModelId, setSelectedModelId] = useState<string>(config.documents.activeModelId);

  // Preview Document Modal
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);

  // Logo upload ref
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Backup / Restore JSON file input
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupImportPending, setBackupImportPending] = useState<AppConfiguration | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Audit Logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>(auditLogger.getLogs());
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logOpFilter, setLogOpFilter] = useState<string>('ALL');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [clearLogsConfirmOpen, setClearLogsConfirmOpen] = useState<boolean>(false);

  // Real-time browser capabilities diagnostics
  const [diagnostics, setDiagnostics] = useState<{
    fileApi: boolean;
    webAssembly: boolean;
    webWorkers: boolean;
    fileSystemAccess: boolean;
    webCrypto: boolean;
    localStorage: boolean;
  }>({
    fileApi: false,
    webAssembly: false,
    webWorkers: false,
    fileSystemAccess: false,
    webCrypto: false,
    localStorage: false,
  });

  // Keep config in sync with service updates
  useEffect(() => {
    const unsub = subscribeConfiguration((updated) => {
      setConfig(updated);
    });
    return unsub;
  }, []);

  // Keep audit logs in sync
  useEffect(() => {
    const unsub = auditLogger.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
    });
    return unsub;
  }, []);

  // Run browser diagnostics on mount
  useEffect(() => {
    const checkDiagnostics = () => {
      const hasFileApi = typeof File !== 'undefined' && typeof FileReader !== 'undefined';
      const hasWasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';
      const hasWorkers = typeof Worker !== 'undefined';
      const hasFSA = 'showDirectoryPicker' in window;
      const hasCrypto = typeof window !== 'undefined' && Boolean(window.crypto?.subtle);
      let hasLocal = false;
      try {
        localStorage.setItem('__test', '1');
        localStorage.removeItem('__test');
        hasLocal = true;
      } catch {
        hasLocal = false;
      }

      setDiagnostics({
        fileApi: hasFileApi,
        webAssembly: hasWasm,
        webWorkers: hasWorkers,
        fileSystemAccess: hasFSA,
        webCrypto: hasCrypto,
        localStorage: hasLocal,
      });
    };
    checkDiagnostics();
  }, []);

  // Switch initial subtab if prop changes
  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Handle Save
  const handleSave = () => {
    saveAppConfiguration(config);
    if (onThemeChange) {
      onThemeChange(config.general.theme === 'dark');
    }
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2500);
  };

  // Handle Reset Defaults
  const handleConfirmReset = () => {
    const restored = resetAppConfiguration();
    setConfig(restored);
    setSelectedModelId('padrao');
    if (onThemeChange) {
      onThemeChange(true);
    }
    setResetConfirmOpen(false);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2500);
  };

  // Handle Model Preset Switch
  const handleSelectModel = (modelId: string) => {
    const preset = config.documents.models.find((m) => m.id === modelId);
    if (!preset) return;

    setSelectedModelId(modelId);
    setConfig((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        activeModelId: modelId,
        header: { ...preset.header },
        footer: { ...preset.footer },
        formatting: { ...preset.formatting },
        defaultFields: { ...preset.defaultFields },
      },
    }));
  };

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoError(null);

    // Validate size (max 500 KB)
    if (file.size > 500 * 1024) {
      setLogoError('A imagem da logomarca deve ter no máximo 500 KB.');
      return;
    }

    // Validate mime type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLogoError('Formato de imagem não suportado. Utilize PNG ou JPG.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({
          ...prev,
          documents: {
            ...prev.documents,
            header: {
              ...prev.documents.header,
              logoDataUrl: reader.result as string,
            },
          },
        }));
      }
    };
    reader.onerror = () => {
      setLogoError('Falha ao ler o arquivo de imagem.');
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setConfig((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        header: {
          ...prev.documents.header,
          logoDataUrl: undefined,
        },
      },
    }));
  };

  // Handle Backup Export
  const handleExportBackup = () => {
    const jsonStr = exportConfigurationJSON(config);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAM_HASH_VERIFY_Config_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Backup Import
  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const res = importConfigurationJSON(reader.result);
        if (res.success && res.config) {
          setBackupImportPending(res.config);
        } else {
          setBackupError(res.error || 'Arquivo de backup inválido.');
        }
      }
    };
    reader.onerror = () => setBackupError('Falha ao ler o arquivo selecionado.');
    reader.readAsText(file);

    e.target.value = '';
  };

  const handleConfirmBackupImport = () => {
    if (!backupImportPending) return;
    saveAppConfiguration(backupImportPending);
    setConfig(backupImportPending);
    if (onThemeChange) {
      onThemeChange(backupImportPending.general.theme === 'dark');
    }
    setBackupImportPending(null);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2500);
  };

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase().trim();
        const matchesMsg = log.message.toLowerCase().includes(q);
        const matchesId = log.id.toLowerCase().includes(q);
        const matchesOp = log.operation.toLowerCase().includes(q);
        if (!matchesMsg && !matchesId && !matchesOp) return false;
      }
      if (logOpFilter !== 'ALL' && log.operation !== logOpFilter) {
        return false;
      }
      if (logStatusFilter !== 'ALL' && log.status !== logStatusFilter) {
        return false;
      }
      return true;
    });
  }, [logs, logSearchQuery, logOpFilter, logStatusFilter]);

  // Sub tabs definition
  const subTabs = [
    { id: 'geral', label: 'Geral', icon: Sliders },
    { id: 'documentos', label: 'Documentos e Relatórios', icon: FileText },
    { id: 'auditoria', label: 'Logs e Auditoria', icon: Terminal, badge: logs.length },
    { id: 'testes', label: 'Testes Criptográficos', icon: Cpu },
    { id: 'seguranca', label: 'Segurança e Privacidade', icon: ShieldCheck },
    { id: 'backup', label: 'Backup e Restauração', icon: Database },
    { id: 'sobre', label: 'Sobre o Sistema', icon: Info },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Hidden inputs */}
      <input
        type="file"
        ref={logoInputRef}
        onChange={handleLogoUpload}
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
      />
      <input
        type="file"
        ref={backupInputRef}
        onChange={handleBackupFileSelect}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Top Banner Card */}
      <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-center text-[#F57917] shadow-inner">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white font-mono">
                  CONFIGURAÇÕES DO SISTEMA
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[#F57917]/10 text-[#F57917] border border-[#F57917]/20">
                  Painel de Controle
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Centralize preferências gerais, personalização de laudos e manifestos, logs de auditoria local, testes criptográficos e diagnósticos de segurança.
              </p>
            </div>
          </div>

          {/* Quick Actions (Save & Reset) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Configurações</span>
            </button>

            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Restaurar padrões de fábrica"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Padrões</span>
            </button>
          </div>
        </div>

        {/* Save confirmation toast */}
        {saveSuccessNotice && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Configurações e preferências atualizadas com sucesso no armazenamento local!</span>
          </div>
        )}
      </div>

      {/* Secondary Navigation Tabs Bar */}
      <div className="border-b border-[#262930] bg-[#0F1115] rounded-xl p-1.5 flex flex-wrap items-center gap-1">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#17191D] text-[#F57917] font-semibold border border-[#262930] shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-[#131519]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#F57917]' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#262930] text-zinc-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. CONFIGURAÇÕES GERAIS                                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'geral' && (
        <div className="space-y-6 animate-fade-in">
          {/* Card: Algoritmos e Formato */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-[#262930] pb-3">
              <Sliders className="w-5 h-5 text-[#F57917]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Algoritmos Criptográficos e Formatação de Hashes
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Algoritmo Padrão */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-300 font-bold mb-2">
                  Algoritmo Padrão de Inicialização:
                </label>
                <p className="text-xs text-zinc-400 mb-3">
                  Define o algoritmo selecionado por padrão ao abrir as telas de cálculo e validação.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as HashAlgorithm[]).map((algo) => {
                    const isSelected = config.general.defaultAlgorithm === algo;
                    return (
                      <button
                        key={algo}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            general: { ...prev.general, defaultAlgorithm: algo },
                          }))
                        }
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#17191D] border-[#F57917] text-[#F57917] font-bold shadow-md'
                            : 'bg-[#131519] border-[#262930] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <div className="font-mono text-xs">{algo}</div>
                        {algo === 'SHA-256' && (
                          <div className="text-[10px] text-zinc-500 mt-1">Padrão Forense</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Formato de Apresentação (Maiúsculas / Minúsculas) */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-300 font-bold mb-2">
                  Formato de Apresentação dos Hashes:
                </label>
                <p className="text-xs text-zinc-400 mb-3">
                  Afeta exclusivamente a representação textual na tela e nos relatórios. Não altera os bytes originais calculados.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        general: { ...prev.general, hashCase: 'lowercase' },
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      config.general.hashCase === 'lowercase'
                        ? 'bg-[#17191D] border-[#F57917] text-[#F57917] font-bold'
                        : 'bg-[#131519] border-[#262930] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-mono text-xs">minúsculas (padrão)</div>
                    <div className="font-mono text-[10px] text-zinc-500 truncate mt-1">e3b0c44298fc1c149af...</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        general: { ...prev.general, hashCase: 'uppercase' },
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      config.general.hashCase === 'uppercase'
                        ? 'bg-[#17191D] border-[#F57917] text-[#F57917] font-bold'
                        : 'bg-[#131519] border-[#262930] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-mono text-xs">MAIÚSCULAS</div>
                    <div className="font-mono text-[10px] text-zinc-500 truncate mt-1">E3B0C44298FC1C149AF...</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Algoritmos Exibidos na Interface */}
            <div className="pt-4 border-t border-[#262930]">
              <label className="block text-xs font-mono uppercase text-zinc-300 font-bold mb-2">
                Algoritmos Disponíveis nas Interfaces:
              </label>
              <p className="text-xs text-zinc-400 mb-3">
                Desative a exibição de algoritmos que não costuma utilizar no dia a dia pericial, sem remover suas implementações criptográficas.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as HashAlgorithm[]).map((algo) => {
                  const isChecked = config.general.enabledAlgorithms.includes(algo);
                  return (
                    <label
                      key={algo}
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-[#17191D] border border-[#262930] text-xs font-mono text-zinc-200 cursor-pointer hover:border-zinc-500"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...config.general.enabledAlgorithms, algo]
                            : config.general.enabledAlgorithms.filter((a) => a !== algo);
                          if (next.length === 0) return; // Keep at least one
                          setConfig((prev) => ({
                            ...prev,
                            general: { ...prev.general, enabledAlgorithms: next },
                          }));
                        }}
                        className="rounded border-[#262930] text-[#F57917] focus:ring-[#F57917]"
                      />
                      <span>{algo}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card: Preferências de Interface e Desempenho */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-[#262930] pb-3">
              <Layers className="w-5 h-5 text-[#F57917]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Interface, Idioma e Parâmetros de Leitura
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Tema */}
              <div>
                <label className="block text-zinc-400 mb-1 font-mono">Tema Visual:</label>
                <select
                  value={config.general.theme}
                  onChange={(e) => {
                    const theme = e.target.value as 'dark' | 'light';
                    setConfig((prev) => ({
                      ...prev,
                      general: { ...prev.general, theme },
                    }));
                    if (onThemeChange) onThemeChange(theme === 'dark');
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                >
                  <option value="dark">Escuro (Cellebrite Dark • #08090B)</option>
                  <option value="light">Claro (Pericial White)</option>
                </select>
              </div>

              {/* Idioma */}
              <div>
                <label className="block text-zinc-400 mb-1 font-mono">Idioma Operacional:</label>
                <input
                  type="text"
                  disabled
                  value="Português Brasileiro (pt-BR)"
                  className="w-full px-3 py-2 rounded-lg bg-[#121418] border border-[#262930] text-zinc-400 font-mono"
                />
              </div>

              {/* Formato de Tamanhos */}
              <div>
                <label className="block text-zinc-400 mb-1 font-mono">Unidades de Tamanho:</label>
                <select
                  value={config.general.sizeUnits}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      general: { ...prev.general, sizeUnits: e.target.value as any },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                >
                  <option value="auto">Automático (Bytes, KB, MB, GB)</option>
                  <option value="bytes">Exibir sempre Bytes exatos</option>
                  <option value="mb">Padronizar em Megabytes (MB)</option>
                </select>
              </div>
            </div>

            {/* Parâmetros de Desempenho e Memória */}
            <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-300">
                  Tamanho dos Blocos de Leitura (Chunk Streaming):
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#262930] text-zinc-300">
                  2.097.152 bytes (2 MB)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                O fatiamento em blocos de 2 MB garante que o navegador processe arquivos gigantescos (acima de 20 GB) de maneira fluida, mantendo a interface responsiva e prevenindo estouro de pilha de memória RAM no navegador.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DOCUMENTOS E RELATÓRIOS                                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'documentos' && (
        <div className="space-y-6 animate-fade-in">
          {/* Presets / Modelos Bar */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262930] pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#F57917]" />
                  <span>Modelos de Documentos e Personalização de Laudos</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Selecione um modelo pré-configurado ou personalize cabeçalhos, logomarcas, rodapés e campos padrão.
                </p>
              </div>

              {/* Preview & Test Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>Visualizar Documento</span>
                </button>

                <button
                  type="button"
                  onClick={() => generateTestDocumentPDF(config)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Gerar Documento de Teste</span>
                </button>
              </div>
            </div>

            {/* Model Presets List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {config.documents.models.map((model) => {
                const isSelected = selectedModelId === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#17191D] border-[#F57917] shadow-lg'
                        : 'bg-[#131519] border-[#262930] hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">{model.name}</span>
                      {isSelected && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#F57917] text-zinc-950 font-bold">
                          ATIVO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{model.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4.1 Cabeçalho Customization */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-[#262930] pb-2">
              <span>4.1. Cabeçalho dos Documentos e Laudos</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Título Principal do Sistema:</label>
                <input
                  type="text"
                  value={config.documents.header.title}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        header: { ...prev.documents.header, title: e.target.value },
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Subtítulo Técnico:</label>
                <input
                  type="text"
                  value={config.documents.header.subtitle}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        header: { ...prev.documents.header, subtitle: e.target.value },
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Nome da Instituição ou Órgão:</label>
                <input
                  type="text"
                  value={config.documents.header.institutionName}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        header: { ...prev.documents.header, institutionName: e.target.value },
                      },
                    }))
                  }
                  placeholder="Ex: Polícia Federal"
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Identificação do Setor / Unidade:</label>
                <input
                  type="text"
                  value={config.documents.header.sectorName}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        header: { ...prev.documents.header, sectorName: e.target.value },
                      },
                    }))
                  }
                  placeholder="Ex: Setor Técnico-Científico / Perícia Forense"
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>
            </div>

            {/* Custom Logo Upload & Alignment */}
            <div className="pt-3 border-t border-[#262930] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {config.documents.header.logoDataUrl ? (
                  <div className="relative w-16 h-16 rounded-xl bg-white p-1 border border-zinc-300 flex items-center justify-center overflow-hidden">
                    <img
                      src={config.documents.header.logoDataUrl}
                      alt="Logomarca personalizada"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[#17191D] border border-dashed border-[#262930] flex items-center justify-center text-zinc-600 text-[10px] text-center p-1">
                    Sem Logo
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#F57917]" />
                      <span>{config.documents.header.logoDataUrl ? 'Trocar Logomarca' : 'Carregar Imagem (PNG/JPG)'}</span>
                    </button>
                    {config.documents.header.logoDataUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-300 text-xs cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500 block mt-1">
                    Processada 100% localmente. Máx 500 KB.
                  </span>
                  {logoError && <span className="text-red-400 text-[11px] block">{logoError}</span>}
                </div>
              </div>

              {/* Logo Alignment */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 font-mono">Alinhamento:</span>
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        documents: {
                          ...prev.documents,
                          header: { ...prev.documents.header, logoAlignment: align },
                        },
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer ${
                      config.documents.header.logoAlignment === align
                        ? 'bg-[#F57917] text-zinc-950 font-bold'
                        : 'bg-[#17191D] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {align === 'left' ? 'Esquerda' : align === 'center' ? 'Centro' : 'Direita'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4.2 Rodapé Customization */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-[#262930] pb-2">
              <span>4.2. Rodapé e Créditos dos Documentos</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Crédito de Autoria (Padrão):</label>
                <input
                  type="text"
                  value={config.documents.footer.developerCredit}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, developerCredit: e.target.value },
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Contexto Institucional de Capacitação:</label>
                <input
                  type="text"
                  value={config.documents.footer.trainingContext}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, trainingContext: e.target.value },
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>
            </div>

            {/* Footer Toggles */}
            <div className="pt-3 border-t border-[#262930] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={config.documents.footer.showPageNumbers}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, showPageNumbers: e.target.checked },
                      },
                    }))
                  }
                  className="rounded border-[#262930] text-[#F57917]"
                />
                <span>Número de Páginas</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={config.documents.footer.showIssueDate}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, showIssueDate: e.target.checked },
                      },
                    }))
                  }
                  className="rounded border-[#262930] text-[#F57917]"
                />
                <span>Data de Emissão</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={config.documents.footer.showAppVersion}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, showAppVersion: e.target.checked },
                      },
                    }))
                  }
                  className="rounded border-[#262930] text-[#F57917]"
                />
                <span>Versão da Ferramenta</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={config.documents.footer.showReportId}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        footer: { ...prev.documents.footer, showReportId: e.target.checked },
                      },
                    }))
                  }
                  className="rounded border-[#262930] text-[#F57917]"
                />
                <span>Protocolo Local</span>
              </label>
            </div>
          </div>

          {/* 4.3 & 4.4 Formatação e Campos Padrão */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2 border-b border-[#262930] pb-2">
              <span>4.3 & 4.4. Formatação e Campos Periciais Padrão (Opcionais)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Procedimento Pré-definido:</label>
                <input
                  type="text"
                  value={config.documents.defaultFields.procedureNumber}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        defaultFields: { ...prev.documents.defaultFields, procedureNumber: e.target.value },
                      },
                    }))
                  }
                  placeholder="Ex: IPL 1234/2026-SR/PF/SP"
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Perito / Responsável Técnico Padrão:</label>
                <input
                  type="text"
                  value={config.documents.defaultFields.examinerName}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      documents: {
                        ...prev.documents,
                        defaultFields: { ...prev.documents.defaultFields, examinerName: e.target.value },
                      },
                    }))
                  }
                  placeholder="Ex: APF / Perito Criminal"
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-200 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Cor de Destaque dos Laudos:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.documents.formatting.titleAccentColor}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        documents: {
                          ...prev.documents,
                          formatting: { ...prev.documents.formatting, titleAccentColor: e.target.value },
                        },
                      }))
                    }
                    className="w-9 h-9 rounded-lg border border-[#262930] bg-[#17191D] cursor-pointer"
                  />
                  <span className="font-mono text-zinc-300 text-xs">
                    {config.documents.formatting.titleAccentColor}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LOGS E AUDITORIA                                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'auditoria' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262930] pb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#F57917]" />
                  <span>Trilha de Auditoria e Logs Locais em Memória</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Registra todas as operações executadas na sessão para rastreabilidade técnica. 100% mantido em memória volátil, sem envio a servidores.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const content = auditLogger.exportTXT();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
                    a.download = `Log_Auditoria_SAM_HASH_VERIFY_${Date.now()}.txt`;
                    a.click();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-[#F57917]" />
                  <span>Exportar TXT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const content = auditLogger.exportCSV();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
                    a.download = `Log_Auditoria_SAM_HASH_VERIFY_${Date.now()}.csv`;
                    a.click();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#17191D] hover:bg-[#20242B] border border-[#262930] text-zinc-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-300" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setClearLogsConfirmOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Logs</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Pesquisar mensagens de log..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <select
                  value={logOpFilter}
                  onChange={(e) => setLogOpFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300 focus:outline-none focus:border-[#F57917]"
                >
                  <option value="ALL">Todas as Operações ({logs.length})</option>
                  <option value="CALCULO_HASH">Cálculo de Hash</option>
                  <option value="VALIDACAO_HASH">Validação de Hash</option>
                  <option value="COMPARACAO_HASHES">Comparação de Hashes</option>
                  <option value="VALIDACAO_LOTE">Validação em Lote</option>
                  <option value="HASH_PASTAS">Hash de Pastas</option>
                  <option value="CONFIGURACAO_ALTERADA">Configuração Alterada</option>
                  <option value="RELATORIO_GERADO">Relatório Gerado</option>
                  <option value="TESTES_CRIPTOGRAFICOS">Testes Criptográficos</option>
                </select>
              </div>

              <div>
                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-300 focus:outline-none focus:border-[#F57917]"
                >
                  <option value="ALL">Todos os Resultados</option>
                  <option value="SUCESSO">Sucesso / OK</option>
                  <option value="INFO">Informativo</option>
                  <option value="DIVERGENTE">Divergente</option>
                  <option value="ERRO">Erros</option>
                </select>
              </div>
            </div>

            {/* Logs Table */}
            <div className="border border-[#262930] rounded-xl overflow-hidden bg-[#131519]">
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[#17191D] border-b border-[#262930] text-zinc-400 font-mono text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3 w-40">Data / Hora</th>
                      <th className="py-2.5 px-3 w-36">Operação</th>
                      <th className="py-2.5 px-3 w-24 text-center">Status</th>
                      <th className="py-2.5 px-3">Mensagem Técnica</th>
                      <th className="py-2.5 px-3 w-20 text-right">Duração</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262930] font-mono text-[11px]">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500">
                          Nenhum evento de log localizado com os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#1A1D24] transition-colors">
                          <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                            {log.formattedDate}
                          </td>
                          <td className="py-2 px-3 font-bold text-zinc-300">
                            {log.operation}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.status === 'SUCESSO'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                  : log.status === 'ERRO'
                                  ? 'bg-red-950/60 text-red-400 border border-red-800'
                                  : log.status === 'DIVERGENTE'
                                  ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-zinc-200 font-sans text-xs">
                            {log.message}
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-500">
                            {log.durationMs !== undefined ? `${log.durationMs}ms` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 leading-relaxed">
              * Nota de Conformidade Forense: Os registros de log exibidos acima são gravados exclusivamente na memória volátil do navegador durante a sessão. Logs locais e arquivos exportados não constituem, isoladamente, uma trilha de auditoria inviolável por hardware.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TESTES CRIPTOGRÁFICOS                                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'testes' && (
        <div className="space-y-4 animate-fade-in">
          {/* Breadcrumb banner */}
          <div className="p-3.5 rounded-xl bg-[#0F1115] border border-[#262930] flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-zinc-400">
              <Settings className="w-4 h-4 text-zinc-500" />
              <span>CONFIGURAÇÕES</span>
              <span>&gt;</span>
              <span className="text-[#F57917] font-bold">TESTES CRIPTOGRÁFICOS (NIST / RFC)</span>
            </div>
            <span className="text-[11px] text-zinc-500 hidden sm:inline">
              FIPS 180-4 • RFC 1321 • RFC 3174
            </span>
          </div>

          {/* Existing CryptoTestsModule preserved completely */}
          <CryptoTestsModule />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SEGURANÇA E PRIVACIDADE                                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'seguranca' && (
        <div className="space-y-6 animate-fade-in">
          {/* Diagnostics Card */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-[#262930] pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Painel de Diagnóstico do Navegador & Isolamento
              </h2>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              O SAM HASH VERIFY foi concebido com arquitetura de processamento estritamente local (Zero-Upload).
              Abaixo são checadas as APIs nativas do navegador empregadas na leitura binária e na computação dos algoritmos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">File API (Streaming)</span>
                  <span className="text-[10px] text-zinc-500">Leitura binária em fatias</span>
                </div>
                {diagnostics.fileApi ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">WebAssembly (Wasm)</span>
                  <span className="text-[10px] text-zinc-500">Motor hash-wasm ultra-rápido</span>
                </div>
                {diagnostics.webAssembly ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">Web Workers</span>
                  <span className="text-[10px] text-zinc-500">Threads de execução paralela</span>
                </div>
                {diagnostics.webWorkers ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">File System Access API</span>
                  <span className="text-[10px] text-zinc-500">Varredura direta de diretórios</span>
                </div>
                {diagnostics.fileSystemAccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-zinc-500 font-mono">WebKit Fallback</span>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">SubtleCrypto</span>
                  <span className="text-[10px] text-zinc-500">Criptografia nativa Web API</span>
                </div>
                {diagnostics.webCrypto ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-white block">Storage Local (Preferências)</span>
                  <span className="text-[10px] text-zinc-500">Persistência local segura</span>
                </div>
                {diagnostics.localStorage ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>
          </div>

          {/* Modo Offline Card */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-[#262930] pb-3">
              <Lock className="w-5 h-5 text-[#F57917]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Operação em Ambiente Offline e Isolamento de Rede
              </h2>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              O SAM HASH VERIFY pode ser operado sem conexão ativa à internet assim que os arquivos estáticos (HTML/JS/Wasm) forem carregados na estação de trabalho pericial. Todo o pipeline criptográfico é 100% autônomo.
            </p>

            <div className="p-4 rounded-xl bg-[#17191D] border border-amber-900/40 text-amber-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Transparência Metodológica Forense:</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                A presença dos recursos técnicos nativos (File API e WebAssembly) não garante, por si só, isolamento físico de rede caso a estação computacional permaneça conectada à internet. Para investigações de alta sensibilidade, recomenda-se desconectar a estação de trabalho de redes públicas ou operá-la em ambiente estritamente isolado (Air-Gapped).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. BACKUP E RESTAURAÇÃO                                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'backup' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-[#262930] pb-3">
              <Database className="w-5 h-5 text-[#F57917]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Backup e Restauração de Configurações
              </h2>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Exporte suas preferências personalizadas, modelos de documentos, dados de cabeçalho e configurações visuais em um arquivo JSON padronizado para migrar entre estações de trabalho ou manter cópias de segurança.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Export Backup Card */}
              <div className="p-5 rounded-xl bg-[#17191D] border border-[#262930] flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2 font-mono font-bold text-sm text-white">
                    <Download className="w-4 h-4 text-[#F57917]" />
                    <span>Exportar Backup (JSON)</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Gera um arquivo JSON contendo todas as suas preferências, modelos de laudos e parâmetros técnicos.
                    Não inclui arquivos de evidências ou dados sigilosos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full py-2.5 rounded-lg bg-[#262930] hover:bg-[#323640] text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#F57917]" />
                  <span>Baixar Arquivo JSON de Backup</span>
                </button>
              </div>

              {/* Import Backup Card */}
              <div className="p-5 rounded-xl bg-[#17191D] border border-[#262930] flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2 font-mono font-bold text-sm text-white">
                    <Upload className="w-4 h-4 text-[#F57917]" />
                    <span>Importar Backup (JSON)</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Restaura preferências previamente exportadas. A estrutura do arquivo será validada antes de qualquer alteração ser aplicada.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="w-full py-2.5 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] text-zinc-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow"
                >
                  <Upload className="w-4 h-4" />
                  <span>Selecionar Arquivo JSON</span>
                </button>
              </div>
            </div>

            {backupError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{backupError}</span>
              </div>
            )}

            {/* Import Preview Confirmation */}
            {backupImportPending && (
              <div className="p-4 rounded-xl bg-[#17191D] border border-[#F57917] space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white font-mono">
                    Prévia do Backup Detectado (Versão {backupImportPending.version}):
                  </span>
                  <span className="text-[10px] font-mono text-[#F57917]">Pronto para aplicar</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-300">
                  <div>
                    <span className="text-zinc-500 block">Algoritmo Padrão:</span>
                    <strong>{backupImportPending.general.defaultAlgorithm}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Tema:</span>
                    <strong>{backupImportPending.general.theme}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Modelos:</span>
                    <strong>{backupImportPending.documents.models.length} modelo(s)</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Instituição:</span>
                    <strong>{backupImportPending.documents.header.institutionName || 'Padrão'}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-[#262930]">
                  <button
                    type="button"
                    onClick={handleConfirmBackupImport}
                    className="px-4 py-2 rounded-lg bg-[#F57917] text-zinc-950 font-bold text-xs cursor-pointer shadow"
                  >
                    Confirmar e Aplicar Configurações
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupImportPending(null)}
                    className="px-3 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. SOBRE O SISTEMA                                                        */}
      {/* ========================================================================= */}
      {activeSubTab === 'sobre' && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Hero About Card */}
          <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#262930] pb-6">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#F57917]">
                  Sistema de Geração e Validação de Integridade Digital
                </span>
                <h1 className="text-2xl font-black tracking-tight text-white font-mono mt-1">
                  SAM HASH <span className="text-[#F57917]">VERIFY</span>
                </h1>
                <p className="text-sm font-semibold text-zinc-300 mt-1">
                  Forensic Integrity System
                </p>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-[#17191D] border border-[#262930] text-right font-mono text-xs">
                <span className="text-zinc-500 block text-[10px]">VERSÃO DA APLICAÇÃO</span>
                <span className="text-[#F57917] font-bold">v1.2.0 (2026)</span>
              </div>
            </div>

            {/* Institutional Credits Section requested in Prompt Section 9 */}
            <div className="p-5 rounded-xl bg-[#17191D] border border-[#262930] space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white font-mono">
                <Award className="w-4 h-4 text-[#F57917]" />
                <span>Autoria e Contexto Institucional de Formação</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Desenvolvido por:</span>
                  <span className="text-white font-bold">APF Ramon (ramon.grsl)</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Turma e Capacitação:</span>
                  <span className="text-zinc-200 font-medium">Polícia Federal — XIV Cellebrite — Turma A — 2026</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Origem do Nome:</span>
                  <span className="text-[#F57917] font-medium">Nome SAM em homenagem ao instrutor Samuel.</span>
                </div>
              </div>
            </div>

            {/* Technical Specifications */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <span className="text-zinc-500 block text-[11px] font-mono">MOTOR CRIPTOGRÁFICO</span>
                <span className="text-white font-bold mt-1 block">WebAssembly (hash-wasm)</span>
                <span className="text-[10px] text-zinc-400">Licença MIT • Alta performance</span>
              </div>

              <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <span className="text-zinc-500 block text-[11px] font-mono">GERADOR DE LAUDOS</span>
                <span className="text-white font-bold mt-1 block">jsPDF (Client-Side)</span>
                <span className="text-[10px] text-zinc-400">Licença MIT • Renderização vetorial</span>
              </div>

              <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <span className="text-zinc-500 block text-[11px] font-mono">INTERFACE & DESIGN</span>
                <span className="text-white font-bold mt-1 block">React 19 + Tailwind CSS</span>
                <span className="text-[10px] text-zinc-400">Estética Cellebrite UFED Charcoal</span>
              </div>

              <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <span className="text-zinc-500 block text-[11px] font-mono">PRIVACIDADE</span>
                <span className="text-emerald-400 font-bold mt-1 block">100% Local (Navegador)</span>
                <span className="text-[10px] text-zinc-400">Zero telemetria ou upload</span>
              </div>
            </div>

            {/* Mandatory Disclaimer from Section 9 */}
            <div className="p-4 rounded-xl bg-[#131519] border border-[#262930] text-xs text-zinc-400 space-y-2">
              <span className="font-bold text-zinc-300 font-mono block">AVISO LEGAL FORENSE OBRIGATÓRIO:</span>
              <p className="leading-relaxed">
                “Esta ferramenta é destinada ao apoio à geração e verificação de hashes criptográficos. Seus resultados não substituem os procedimentos oficiais de perícia, documentação e cadeia de custódia.”
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                * A referência à Polícia Federal e à Cellebrite identifica exclusivamente o contexto de capacitação técnica profissional, sem sugerir certificação, homologação ou endosso oficial da ferramenta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Pré-visualização do Documento                                      */}
      {/* ========================================================================= */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl rounded-2xl bg-[#0F1115] border border-[#262930] p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#262930] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-[#F57917]" />
                <h3 className="text-sm font-bold text-white font-mono uppercase">
                  Pré-visualização do Laudo Pericial (Modelo: {config.documents.models.find(m => m.id === selectedModelId)?.name || 'Padrão'})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="text-zinc-500 hover:text-white p-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Simulated Paper View */}
            <div className="bg-white text-zinc-900 rounded-xl p-8 shadow-inner space-y-6 font-sans text-xs">
              {/* Header */}
              <div className="border-b-2 border-[#F57917] pb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-black tracking-tight text-zinc-950 font-mono">
                    {config.documents.header.title}
                  </h1>
                  <span className="text-xs font-bold text-[#F57917] font-mono block">
                    {config.documents.header.subtitle}
                  </span>
                  <span className="text-[11px] text-zinc-600 block">
                    {config.documents.header.description}
                  </span>
                </div>

                {config.documents.header.logoDataUrl ? (
                  <img
                    src={config.documents.header.logoDataUrl}
                    alt="Logo"
                    className="h-12 max-w-[120px] object-contain"
                  />
                ) : config.documents.header.showInstitutionalFields ? (
                  <div className="text-right text-[11px] text-zinc-600">
                    <strong>{config.documents.header.institutionName}</strong>
                    <div className="text-[10px]">{config.documents.header.sectorName}</div>
                  </div>
                ) : null}
              </div>

              {/* Title & Metadata */}
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase">
                  RELATÓRIO DE VERIFICAÇÃO DE INTEGRIDADE DIGITAL
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs border p-3 rounded-lg bg-zinc-50">
                  <div>
                    <span className="text-zinc-500 block">Protocolo Local:</span>
                    <strong className="font-mono">VERIFY-PREVIEW-2026</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Responsável Técnico:</span>
                    <strong>{config.documents.defaultFields.examinerName || 'Não especificado'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Procedimento:</span>
                    <strong>{config.documents.defaultFields.procedureNumber || 'Não especificado'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Data de Verificação:</span>
                    <span>{new Date().toLocaleDateString('pt-BR')} (Fuso Local)</span>
                  </div>
                </div>
              </div>

              {/* Sample Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-100 border-b">
                    <tr>
                      <th className="p-2">Arquivo</th>
                      <th className="p-2">Tamanho</th>
                      <th className="p-2">Algoritmo</th>
                      <th className="p-2">Hash Calculado</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2 font-mono">evidence_sample.ufdr</td>
                      <td className="p-2">1.4 GB</td>
                      <td className="p-2 font-bold">{config.general.defaultAlgorithm}</td>
                      <td className="p-2 font-mono text-[10px]">
                        {config.general.hashCase === 'uppercase'
                          ? 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
                          : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                      </td>
                      <td className="p-2 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-800 font-bold">
                          OK
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between text-[10px] text-zinc-500 gap-2">
                <div>
                  <strong>{config.documents.footer.developerCredit}</strong> | {config.documents.footer.trainingContext}
                </div>
                {config.documents.footer.showPageNumbers && <span>Página 1 de 1</span>}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => generateTestDocumentPDF(config)}
                className="px-4 py-2 rounded-lg bg-[#F57917] text-zinc-950 font-bold text-xs cursor-pointer shadow"
              >
                Baixar PDF com Este Modelo
              </button>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
              >
                Fechar Prévia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Confirmação de Restauração de Padrões                               */}
      {/* ========================================================================= */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0F1115] border border-red-900/60 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Restaurar Configurações Originais?
              </h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Todas as personalizações de cabeçalhos, rodapés, cores, modelos salvos e preferências serão redefinidas para os padrões originais de fábrica do SAM HASH VERIFY.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow"
              >
                Sim, Restaurar Padrões
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Confirmação de Limpeza de Logs                                     */}
      {/* ========================================================================= */}
      {clearLogsConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0F1115] border border-red-900/60 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Limpar Logs da Sessão?
              </h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Deseja realmente limpar todos os registros de log da sessão atual? Esta ação apagará os eventos da memória local.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClearLogsConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#262930] text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  auditLogger.clearLogs();
                  setClearLogsConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow"
              >
                Sim, Limpar Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

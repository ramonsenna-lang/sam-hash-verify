import React from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Layers,
  FileText,
  HardDrive,
  GitCompare,
  Cpu,
  Lock,
  ArrowRight,
  FileCheck2,
  FolderTree,
  Award,
  HelpCircle,
} from 'lucide-react';
import { ForensicLogo } from './ForensicLogo';

interface HomeDashboardProps {
  onNavigate: (tab: string) => void;
  sessionRecordCount: number;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  onNavigate,
  sessionRecordCount,
}) => {
  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Top Main Banner Card inspired by Cellebrite Forensic UI */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0F1115] border border-[#262930] p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <ForensicLogo size="lg" />

          {/* Privacy & Engine Assurance Badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#17191D] border border-emerald-950/60 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Processamento 100% Local (Navegador)</span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span className="text-zinc-400 hidden sm:inline">Zero Telemetria</span>
          </div>
        </div>

        {/* Intro text */}
        <p className="mt-5 text-zinc-300 text-sm sm:text-base leading-relaxed max-w-3xl">
          Bem-vindo ao <strong className="text-white font-semibold">SAM HASH VERIFY</strong>, uma ferramenta técnica
          de apoio à verificação de integridade de evidências digitais. Calcule, compare e valide hashes criptográficos
          de arquivos, incluindo extrações forenses de dispositivos móveis (Cellebrite UFED, Physical Analyzer), dados em nuvem
          e outros arquivos digitais. Todo o processamento é realizado localmente no navegador, preservando os arquivos originais.
        </p>

        {/* Quick Instructions Strip requested in Section 4 */}
        <div className="mt-6 pt-5 border-t border-[#262930] grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930]">
            <div className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-[10px] font-mono">1</span>
              Como gerar um hash:
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Selecione um arquivo, escolha os algoritmos desejados (MD5, SHA-1, SHA-256, SHA-512) e clique em Gerar Hash.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930]">
            <div className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-[10px] font-mono">2</span>
              Como validar um hash:
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Selecione o arquivo da evidência, informe o hash de referência oficial e execute a comparação.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930]">
            <div className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-[10px] font-mono">3</span>
              Como validar vários arquivos:
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Selecione múltiplos arquivos ou uma pasta e importe, se disponível, uma lista de hashes de referência.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Main Action Cards — Matching the User's Reference Layout */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-400 font-mono">
            Módulos Principais de Operação
          </h2>
          <span className="text-xs text-zinc-500">Selecione a ação desejada</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 1. Validar Hash */}
          <button
            onClick={() => onNavigate('validar')}
            className="group relative flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-[#17191D] hover:bg-[#1E2228] border border-[#262930] hover:border-[#F57917]/60 transition-all duration-200 shadow-lg cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-[#262930]/70 flex items-center justify-center text-[#F57917] mb-4 group-hover:scale-105 transition-transform duration-200">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-[#F57917] transition-colors">
              Validar Hash
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Conferir integridade contra valor de referência
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[#F57917] opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Acessar validação</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* 2. Gerar Hash */}
          <button
            onClick={() => onNavigate('gerar')}
            className="group relative flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-[#17191D] hover:bg-[#1E2228] border border-[#262930] hover:border-[#F57917]/60 transition-all duration-200 shadow-lg cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-[#262930]/70 flex items-center justify-center text-[#F57917] mb-4 group-hover:scale-105 transition-transform duration-200">
              <Fingerprint className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-[#F57917] transition-colors">
              Gerar Hash
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Calcular impressões digitais criptográficas
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[#F57917] opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Iniciar cálculo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* 3. Validação em Lote */}
          <button
            onClick={() => onNavigate('lote')}
            className="group relative flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-[#17191D] hover:bg-[#1E2228] border border-[#262930] hover:border-[#F57917]/60 transition-all duration-200 shadow-lg cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-[#262930]/70 flex items-center justify-center text-[#F57917] mb-4 group-hover:scale-105 transition-transform duration-200">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-[#F57917] transition-colors">
              Validação em Lote
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Múltiplas evidências & importação de manifestos
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[#F57917] opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Processar lote</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* 4. Relatórios */}
          <button
            onClick={() => onNavigate('relatorios')}
            className="group relative flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-[#17191D] hover:bg-[#1E2228] border border-[#262930] hover:border-[#F57917]/60 transition-all duration-200 shadow-lg cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-[#262930]/70 flex items-center justify-center text-[#F57917] mb-4 group-hover:scale-105 transition-transform duration-200">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-[#F57917] transition-colors">
              Relatórios & Histórico
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Documentação técnica pericial em PDF, TXT e CSV
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[#F57917] opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Ver laudos e histórico</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      </div>

      {/* Secondary Forensic Modules */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-400 font-mono">
            Ferramentas Forenses Especializadas
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Hash de Pastas */}
          <div
            onClick={() => onNavigate('pastas')}
            className="p-5 rounded-xl bg-[#131519] border border-[#262930] hover:border-[#F57917]/60 hover:bg-[#171A20] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-[#262930] text-[#F57917]">
                  <FolderTree className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-white">Hash de Pastas</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Varredura recursiva de diretórios e subpastas. Cálculo de hashes, catálogo e exportação de manifestos e laudo em PDF.
              </p>
            </div>
            <span className="mt-4 text-xs text-[#F57917] font-medium flex items-center gap-1">
              Processar pasta <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          {/* Manifesto de Integridade */}
          <div
            onClick={() => onNavigate('manifesto')}
            className="p-5 rounded-xl bg-[#131519] border border-[#262930] hover:border-[#F57917]/60 hover:bg-[#171A20] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-[#262930] text-[#F57917]">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-white">Manifesto da Extração</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Gere e confira manifestos de integridade de arquivos internos. Detecta arquivos ausentes, divergentes ou inserções adicionais.
              </p>
            </div>
            <span className="mt-4 text-xs text-[#F57917] font-medium flex items-center gap-1">
              Gerenciar manifesto <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          {/* Extração Forense Cellebrite */}
          <div
            onClick={() => onNavigate('extracao')}
            className="p-5 rounded-xl bg-[#131519] border border-[#262930] hover:border-[#F57917]/50 hover:bg-[#171A20] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-[#262930] text-[#F57917]">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-white">Extrações Forenses</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Suporte para arquivos UFED (.ufdr, .ufd), Physical Analyzer, imagens (.bin, .e01, .raw) e nuvem,
                com formulário pericial de cadeia de custódia.
              </p>
            </div>
            <span className="mt-4 text-xs text-[#F57917] font-medium flex items-center gap-1">
              Conferir extração <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          {/* Comparar Dois Arquivos */}
          <div
            onClick={() => onNavigate('comparar')}
            className="p-5 rounded-xl bg-[#131519] border border-[#262930] hover:border-[#F57917]/50 hover:bg-[#171A20] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-[#262930] text-[#F57917]">
                  <GitCompare className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-white">Comparação de Arquivos</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Submeta dois arquivos simultaneamente (Arquivo A e Arquivo B) para conferir se
                possuem hashes criptográficos estritamente idênticos.
              </p>
            </div>
            <span className="mt-4 text-xs text-[#F57917] font-medium flex items-center gap-1">
              Comparar arquivos <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          {/* Testes Criptográficos NIST / FIPS */}
          <div
            onClick={() => onNavigate('testes')}
            className="p-5 rounded-xl bg-[#131519] border border-[#262930] hover:border-[#F57917]/50 hover:bg-[#171A20] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-[#262930] text-[#F57917]">
                  <Cpu className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-white">Validação de Algoritmos</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Execute os testes oficiais NIST/RFC para atestar a conformidade matemática
                e a exatidão das funções de dispersão diretamente no seu navegador.
              </p>
            </div>
            <span className="mt-4 text-xs text-[#F57917] font-medium flex items-center gap-1">
              Executar testes <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Discrete Tribute & Mandatory Credits Banner requested in Section 1 and Section 4 */}
      <div className="rounded-2xl bg-[#0F1115] border border-[#262930] p-6 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#262930] pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#F57917]" />
            <span className="text-xs font-mono font-bold uppercase text-white tracking-wider">
              Identificação do Projeto & Contexto de Formação
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 block text-[11px]">Desenvolvimento:</span>
            <span className="text-zinc-200 font-medium">Desenvolvido pelo APF Ramon (ramon.grsl)</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[11px]">Turma e Edição:</span>
            <span className="text-zinc-200 font-medium">Polícia Federal — XIV Cellebrite — Turma A — 2026</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[11px]">Garantia de Privacidade:</span>
            <span className="text-emerald-400 font-medium">Processamento local — Nenhum arquivo é enviado ao servidor</span>
          </div>
        </div>

        <p className="text-[10px] text-zinc-500 pt-1 leading-relaxed">
          * A referência à Polícia Federal e à Cellebrite identifica exclusivamente o contexto de capacitação técnica, sem sugerir certificação, homologação ou endosso oficial da ferramenta.
        </p>
      </div>

      {/* Bottom Legal & Privacy Notice */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-[#0F1115] border border-[#262930] text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-zinc-500" />
          <span className="font-mono tracking-wider text-zinc-300">
            PROCESSAMENTO LOCAL • SEM UPLOAD
          </span>
        </div>
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Privacidade Garantida — Nenhum byte sai da memória da sua estação de trabalho</span>
        </div>
      </div>
    </div>
  );
};

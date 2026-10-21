import React, { useState } from 'react';
import {
  GitCompare,
  Copy,
  Check,
  ClipboardPaste,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  HelpCircle,
  ShieldCheck,
  Type,
  Code2,
} from 'lucide-react';
import { detectProbableAlgorithm, generateLocalVerificationId } from '../utils/crypto';
import {
  exportHashComparisonPDF,
  exportHashComparisonTXT,
  downloadTextFile,
  formatForensicDate,
  type HashComparisonReportData,
} from '../utils/exporter';

export const CompareTwoHashesTab: React.FC = () => {
  const [hash1, setHash1] = useState('');
  const [hash2, setHash2] = useState('');
  const [comparisonMode, setComparisonMode] = useState<'CRIPTOGRAFICA' | 'TEXTO_EXATO'>('CRIPTOGRAFICA');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  // Clipboard paste helpers
  const handlePaste = async (target: 1 | 2) => {
    try {
      const text = await navigator.clipboard.readText();
      if (target === 1) {
        setHash1(text);
      } else {
        setHash2(text);
      }
      setHasCompared(false);
    } catch {
      // In case clipboard permission is denied in browser iframe, user can still paste via keyboard
    }
  };

  const handleClear = (target: 1 | 2) => {
    if (target === 1) setHash1('');
    else setHash2('');
    setHasCompared(false);
  };

  const handleClearAll = () => {
    setHash1('');
    setHash2('');
    setHasCompared(false);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Perform comparison analysis
  const executeComparison = () => {
    setHasCompared(true);
  };

  // Calculations
  const raw1 = hash1;
  const raw2 = hash2;

  const trimmed1 = raw1.trim();
  const trimmed2 = raw2.trim();

  const len1 = comparisonMode === 'CRIPTOGRAFICA' ? trimmed1.length : raw1.length;
  const len2 = comparisonMode === 'CRIPTOGRAFICA' ? trimmed2.length : raw2.length;

  const detection1 = detectProbableAlgorithm(trimmed1);
  const detection2 = detectProbableAlgorithm(trimmed2);

  let resultStatus: 'IDENTICOS' | 'DIFERENTES' | 'FORMATO_INVALIDO' = 'DIFERENTES';
  let resultLabel = '';
  let algorithmNote: string | null = null;
  let algorithmMismatchWarning: string | null = null;

  if (comparisonMode === 'CRIPTOGRAFICA') {
    const isHex1 = trimmed1.length > 0 && /^[0-9a-fA-F]+$/.test(trimmed1);
    const isHex2 = trimmed2.length > 0 && /^[0-9a-fA-F]+$/.test(trimmed2);

    if (!isHex1 || !isHex2) {
      resultStatus = 'FORMATO_INVALIDO';
      resultLabel = 'FORMATO DE HASH INVÁLIDO';
      if (!isHex1 && !isHex2) {
        algorithmNote = 'Ambos os códigos possuem caracteres não-hexadecimais inválidos.';
      } else if (!isHex1) {
        algorithmNote = 'O Código 1 (Referência) contém caracteres inválidos (não hexadecimais).';
      } else {
        algorithmNote = 'O Código 2 (Comparação) contém caracteres inválidos (não hexadecimais).';
      }
    } else {
      // Both are valid hex
      if (detection1.algorithm && detection2.algorithm && detection1.algorithm !== detection2.algorithm) {
        algorithmMismatchWarning = `Atenção: O Código 1 parece ser ${detection1.algorithm} (${len1} caracteres) enquanto o Código 2 parece ser ${detection2.algorithm} (${len2} caracteres).`;
      } else if (detection1.algorithm) {
        algorithmNote = `Provável algoritmo: ${detection1.algorithm} (${len1} caracteres hexadecimais)`;
      }

      if (trimmed1.toLowerCase() === trimmed2.toLowerCase()) {
        resultStatus = 'IDENTICOS';
        resultLabel = 'HASHES IDÊNTICOS';
      } else {
        resultStatus = 'DIFERENTES';
        resultLabel = 'HASHES DIFERENTES';
      }
    }
  } else {
    // Mode B: Exact Literal Text Comparison
    if (raw1 === raw2 && raw1.length > 0) {
      resultStatus = 'IDENTICOS';
      resultLabel = 'CÓDIGOS IDÊNTICOS';
    } else {
      resultStatus = 'DIFERENTES';
      resultLabel = 'CÓDIGOS DIFERENTES';
    }
  }

  // Positional Divergence Analysis
  const strA = comparisonMode === 'CRIPTOGRAFICA' ? trimmed1 : raw1;
  const strB = comparisonMode === 'CRIPTOGRAFICA' ? trimmed2 : raw2;
  const maxLen = Math.max(strA.length, strB.length);

  let divergentCount = 0;
  let firstDivergenceIndex: number | null = null;
  const charComparisonArray: Array<{
    index: number;
    charA: string | null;
    charB: string | null;
    isMatch: boolean;
  }> = [];

  for (let i = 0; i < maxLen; i++) {
    const charA = i < strA.length ? strA[i] : null;
    const charB = i < strB.length ? strB[i] : null;

    let isMatch = false;
    if (charA !== null && charB !== null) {
      if (comparisonMode === 'CRIPTOGRAFICA') {
        isMatch = charA.toLowerCase() === charB.toLowerCase();
      } else {
        isMatch = charA === charB;
      }
    }

    if (!isMatch) {
      divergentCount++;
      if (firstDivergenceIndex === null) {
        firstDivergenceIndex = i + 1; // 1-indexed for forensic human readability
      }
    }

    charComparisonArray.push({
      index: i + 1,
      charA,
      charB,
      isMatch,
    });
  }

  // Generate Report Helper
  const getReportData = (): HashComparisonReportData => {
    const { formatted, tz } = formatForensicDate();
    return {
      id: generateLocalVerificationId(),
      code1: comparisonMode === 'CRIPTOGRAFICA' ? trimmed1 : raw1,
      code2: comparisonMode === 'CRIPTOGRAFICA' ? trimmed2 : raw2,
      mode: comparisonMode,
      algorithm: detection1.algorithm || detection2.algorithm || null,
      length1: len1,
      length2: len2,
      resultStatus,
      resultLabel,
      divergentCount,
      firstDivergenceIndex,
      timestamp: formatted,
      timezone: tz,
    };
  };

  const handleGeneratePDF = () => {
    const data = getReportData();
    exportHashComparisonPDF(data);
  };

  const handleGenerateTXT = () => {
    const data = getReportData();
    const txt = exportHashComparisonTXT(data);
    downloadTextFile(txt, `Comparacao_Hashes_${data.id}.txt`);
  };

  const handleCopyReportTXT = () => {
    const data = getReportData();
    const txt = exportHashComparisonTXT(data);
    copyToClipboard(txt, 'report-txt');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Mode Selector */}
      <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-bold uppercase text-zinc-300 block">
            Modo de Comparação Direta:
          </span>
          <span className="text-[11px] text-zinc-500">
            {comparisonMode === 'CRIPTOGRAFICA'
              ? 'Validação de hashes hexadecimais (ignora maiúsculas/minúsculas e espaços externos).'
              : 'Comparação literal exata (diferencia maiúsculas, minúsculas, símbolos e espaços).'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-xl border border-[#262930]">
          <button
            type="button"
            onClick={() => {
              setComparisonMode('CRIPTOGRAFICA');
              setHasCompared(false);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              comparisonMode === 'CRIPTOGRAFICA'
                ? 'bg-[#F57917] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Modo Criptográfico (Hex)
          </button>
          <button
            type="button"
            onClick={() => {
              setComparisonMode('TEXTO_EXATO');
              setHasCompared(false);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              comparisonMode === 'TEXTO_EXATO'
                ? 'bg-[#F57917] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Texto Exato (Literal)
          </button>
        </div>
      </div>

      {/* Two Hash Input Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* HASH 1 — REFERÊNCIA */}
        <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-[10px]">
                1
              </span>
              Hash 1 — Referência
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePaste(1)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Colar da área de transferência"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-[#F57917]" />
                Colar
              </button>
              {hash1 && (
                <button
                  type="button"
                  onClick={() => handleClear(1)}
                  className="text-xs text-zinc-500 hover:text-red-400 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={4}
            value={hash1}
            onChange={(e) => {
              setHash1(e.target.value);
              setHasCompared(false);
            }}
            placeholder="Cole ou digite o primeiro código de hash..."
            className="w-full p-3 rounded-lg bg-[#17191D] border border-[#262930] text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917] resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span>Comprimento: <strong className="text-zinc-300">{hash1.length}</strong> caracteres</span>
            {detection1.algorithm && comparisonMode === 'CRIPTOGRAFICA' && (
              <span className="text-[#F57917] font-semibold">{detection1.algorithm}</span>
            )}
          </div>
        </div>

        {/* HASH 2 — COMPARAÇÃO */}
        <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#F57917]/20 text-[#F57917] flex items-center justify-center text-[10px]">
                2
              </span>
              Hash 2 — Comparação
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePaste(2)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Colar da área de transferência"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-[#F57917]" />
                Colar
              </button>
              {hash2 && (
                <button
                  type="button"
                  onClick={() => handleClear(2)}
                  className="text-xs text-zinc-500 hover:text-red-400 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={4}
            value={hash2}
            onChange={(e) => {
              setHash2(e.target.value);
              setHasCompared(false);
            }}
            placeholder="Cole ou digite o segundo código de hash..."
            className="w-full p-3 rounded-lg bg-[#17191D] border border-[#262930] text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#F57917] resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span>Comprimento: <strong className="text-zinc-300">{hash2.length}</strong> caracteres</span>
            {detection2.algorithm && comparisonMode === 'CRIPTOGRAFICA' && (
              <span className="text-[#F57917] font-semibold">{detection2.algorithm}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={executeComparison}
          disabled={!hash1.trim() || !hash2.trim()}
          className="flex-1 w-full py-3 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
        >
          <GitCompare className="w-4 h-4" />
          COMPARAR HASHES
        </button>

        {(hash1 || hash2 || hasCompared) && (
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full sm:w-auto py-3 px-5 rounded-xl bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Comparação
          </button>
        )}
      </div>

      {/* Warnings / Algorithm notices */}
      {algorithmMismatchWarning && hasCompared && (
        <div className="p-3.5 rounded-xl bg-yellow-950/40 border border-yellow-700/60 text-yellow-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
          <span>{algorithmMismatchWarning}</span>
        </div>
      )}

      {/* Comparison Results Card */}
      {hasCompared && (
        <div className="p-6 rounded-2xl bg-[#0F1115] border border-[#262930] space-y-5 animate-fade-in">
          {/* Main Status Banner */}
          {resultStatus === 'IDENTICOS' && (
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-600/70 text-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-wide">
                    {resultLabel}
                  </h3>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    {comparisonMode === 'CRIPTOGRAFICA'
                      ? 'Os valores de hash apresentaram correspondência exata para a representação hexadecimal normalizada.'
                      : 'Os dois códigos de texto são integralmente idênticos caractere por caractere.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {resultStatus === 'DIFERENTES' && (
            <div className="p-4 rounded-xl bg-red-950/50 border border-red-600/70 text-red-200">
              <div className="flex items-center gap-3">
                <XCircle className="w-7 h-7 text-red-400 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-wide">
                    {resultLabel}
                  </h3>
                  <p className="text-xs text-red-300 mt-0.5">
                    {comparisonMode === 'CRIPTOGRAFICA'
                      ? 'Divergência detectada entre os códigos de hash fornecidos.'
                      : 'Os códigos possuem caracteres diferentes entre si.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {resultStatus === 'FORMATO_INVALIDO' && (
            <div className="p-4 rounded-xl bg-yellow-950/50 border border-yellow-600/70 text-yellow-200">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-7 h-7 text-yellow-400 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-wide">
                    {resultLabel}
                  </h3>
                  <p className="text-xs text-yellow-300 mt-0.5">
                    {algorithmNote || 'A sequência informada não representa um hash hexadecimal válido.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930]">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block">Comprimento Código 1</span>
              <span className="text-lg font-bold font-mono text-white tabular-nums">{len1} chars</span>
            </div>

            <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930]">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block">Comprimento Código 2</span>
              <span className="text-lg font-bold font-mono text-white tabular-nums">{len2} chars</span>
            </div>

            <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930]">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block">Posições Divergentes</span>
              <span
                className={`text-lg font-bold font-mono tabular-nums ${
                  divergentCount === 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {divergentCount}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#17191D] border border-[#262930]">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block">1ª Posição Divergente</span>
              <span className="text-lg font-bold font-mono text-white tabular-nums">
                {firstDivergenceIndex !== null ? `Posição ${firstDivergenceIndex}` : 'Nenhuma'}
              </span>
            </div>
          </div>

          {/* Length Difference warning if any */}
          {len1 !== len2 && (
            <div className="p-3 rounded-lg bg-[#17191D] border border-[#262930] text-xs text-zinc-400 flex items-center justify-between">
              <span>
                Diferença de comprimento:{' '}
                <strong className="text-white font-mono">{Math.abs(len1 - len2)} caractere(s) excedente(s)</strong>
              </span>
              <span className="text-zinc-500 font-mono text-[11px]">
                {len1 > len2 ? 'Código 1 é mais longo' : 'Código 2 é mais longo'}
              </span>
            </div>
          )}

          {/* Visual Positional Differences Highlight */}
          <div className="space-y-3 pt-2 border-t border-[#262930]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                Mapeamento de Caracteres por Posição
              </span>
              <span className="text-[11px] text-zinc-500">
                <span className="text-red-400 font-bold">Vermelho:</span> divergente |{' '}
                <span className="text-emerald-400 font-bold">Verde:</span> idêntico
              </span>
            </div>

            {/* Character comparison ribbons */}
            <div className="p-4 rounded-xl bg-[#17191D] border border-[#262930] space-y-3 font-mono text-xs overflow-x-auto">
              {/* Row 1 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">Hash 1 (Referência):</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(strA, 'copy-h1')}
                    className="text-[#F57917] hover:underline flex items-center gap-1 text-[10px]"
                  >
                    {copiedKey === 'copy-h1' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'copy-h1' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="p-2.5 rounded bg-[#0F1115] border border-[#262930] select-all flex flex-wrap gap-x-0.5 gap-y-1 font-mono text-[12px] break-all">
                  {charComparisonArray.map((item) => {
                    if (item.charA === null) {
                      return (
                        <span key={`a-${item.index}`} className="bg-zinc-800/80 text-zinc-600 px-0.5 rounded">
                          ∅
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`a-${item.index}`}
                        className={`px-0.5 rounded transition-colors ${
                          item.isMatch
                            ? 'text-zinc-200'
                            : 'bg-red-950/80 text-red-300 font-bold underline decoration-red-500'
                        }`}
                        title={`Posição ${item.index}: '${item.charA}' vs '${item.charB ?? 'ausente'}'`}
                      >
                        {item.charA}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Row 2 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300">Hash 2 (Comparação):</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(strB, 'copy-h2')}
                    className="text-[#F57917] hover:underline flex items-center gap-1 text-[10px]"
                  >
                    {copiedKey === 'copy-h2' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'copy-h2' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="p-2.5 rounded bg-[#0F1115] border border-[#262930] select-all flex flex-wrap gap-x-0.5 gap-y-1 font-mono text-[12px] break-all">
                  {charComparisonArray.map((item) => {
                    if (item.charB === null) {
                      return (
                        <span key={`b-${item.index}`} className="bg-zinc-800/80 text-zinc-600 px-0.5 rounded">
                          ∅
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`b-${item.index}`}
                        className={`px-0.5 rounded transition-colors ${
                          item.isMatch
                            ? 'text-zinc-200'
                            : 'bg-red-950/80 text-red-300 font-bold underline decoration-red-500'
                        }`}
                        title={`Posição ${item.index}: '${item.charB}' vs '${item.charA ?? 'ausente'}'`}
                      >
                        {item.charB}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Report Actions */}
          <div className="pt-4 border-t border-[#262930] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-500">
              * A conferência direta entre códigos atesta a igualdade textual e não substitui a validação do arquivo de origem.
            </span>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleCopyReportTXT}
                className="flex-1 sm:flex-none py-2 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedKey === 'report-txt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'report-txt' ? 'Copiado!' : 'Copiar TXT'}
              </button>
              <button
                type="button"
                onClick={handleGenerateTXT}
                className="flex-1 sm:flex-none py-2 px-3 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#F57917]" />
                Baixar TXT
              </button>
              <button
                type="button"
                onClick={handleGeneratePDF}
                className="flex-1 sm:flex-none py-2 px-4 rounded-lg bg-[#F57917] hover:bg-[#FF9A35] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <FileText className="w-3.5 h-3.5" />
                GERAR RELATÓRIO PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useRef } from 'react';
import {
  GitCompare,
  Upload,
  CheckCircle2,
  XCircle,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { SingleValidationRecord, ValidationStatus } from '../types';
import { computeHashes, formatBytes, extractFileMetadata, generateLocalVerificationId } from '../utils/crypto';
import { formatForensicDate } from '../utils/exporter';

interface FileComparisonModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
}

export const FileComparisonModule: React.FC<FileComparisonModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [activeFileLabel, setActiveFileLabel] = useState<string>('');
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);

  const [comparisonResult, setComparisonResult] = useState<{
    hashA: string;
    hashB: string;
    identical: boolean;
    timeTakenMs: number;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileAInputRef = useRef<HTMLInputElement>(null);
  const fileBInputRef = useRef<HTMLInputElement>(null);

  const handleCompare = async () => {
    if (!fileA || !fileB) {
      setErrorMessage('Selecione ambos os arquivos (Arquivo A e Arquivo B) para efetuar a comparação.');
      return;
    }

    setIsProcessing(true);
    setProgressA(0);
    setProgressB(0);
    setComparisonResult(null);
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = performance.now();

    try {
      setActiveFileLabel('Calculando hash do Arquivo A...');
      const resultA = await computeHashes(
        fileA,
        ['SHA-256'],
        (pct) => setProgressA(pct),
        abortController.signal
      );

      setActiveFileLabel('Calculando hash do Arquivo B...');
      const resultB = await computeHashes(
        fileB,
        ['SHA-256'],
        (pct) => setProgressB(pct),
        abortController.signal
      );

      const hashA = resultA['SHA-256'];
      const hashB = resultB['SHA-256'];
      const identical = hashA.toLowerCase() === hashB.toLowerCase();
      const endTime = performance.now();

      setComparisonResult({
        hashA,
        hashB,
        identical,
        timeTakenMs: Math.round(endTime - startTime),
      });

      const { formatted, tz } = formatForensicDate();
      const localId = generateLocalVerificationId();
      const metaA = extractFileMetadata(fileA);

      const status: ValidationStatus = identical ? 'CORRESPONDENTE' : 'DIVERGENTE';

      onAddSessionRecord({
        id: localId,
        timestamp: formatted,
        timezone: tz,
        fileMetadata: metaA,
        algorithm: 'SHA-256',
        referenceHash: hashB,
        calculatedHash: hashA,
        status,
        notes: `Comparação direta entre [${fileA.name}] e [${fileB.name}]`,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setErrorMessage('Comparação cancelada.');
      } else {
        setErrorMessage(
          err instanceof Error ? `Erro: ${err.message}` : 'Erro desconhecido na comparação.'
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const copyVal = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#262930] pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <GitCompare className="w-6 h-6 text-[#F57917]" />
          Comparação Direta Entre Dois Arquivos
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Submeta dois arquivos independentes para calcular seus respectivos hashes SHA-256 e atestar
          se seus conteúdos binários são integralmente idênticos ou divergentes.
        </p>
      </div>

      {/* Two File Dropzones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Arquivo A */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Arquivo A (Origem / Cópia Mestra)
            </label>
            {fileA && (
              <button
                type="button"
                onClick={() => {
                  setFileA(null);
                  setComparisonResult(null);
                }}
                className="text-[11px] text-zinc-500 hover:text-red-400"
              >
                Remover
              </button>
            )}
          </div>

          <div
            onClick={() => fileAInputRef.current?.click()}
            className={`p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
              fileA ? 'border-[#F57917]/70 bg-[#17191D]' : 'border-[#262930] hover:border-zinc-500 bg-[#0F1115]'
            }`}
          >
            <input
              ref={fileAInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFileA(e.target.files[0]);
                  setComparisonResult(null);
                }
              }}
            />
            <div className="w-10 h-10 rounded-xl bg-[#262930] flex items-center justify-center text-[#F57917] mb-2.5">
              <FileCode className="w-5 h-5" />
            </div>

            {fileA ? (
              <div className="space-y-1">
                <span className="text-sm font-semibold text-white break-all">{fileA.name}</span>
                <div className="text-xs text-zinc-400 font-mono">
                  {(fileA.size / (1024 * 1024)).toFixed(2)} MB ({fileA.size.toLocaleString('pt-BR')} bytes)
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-sm font-medium text-zinc-300">Selecionar Arquivo A</span>
                <p className="text-xs text-zinc-500">Clique ou arraste o arquivo</p>
              </div>
            )}
          </div>

          {isProcessing && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Leitura A</span>
                <span>{progressA}%</span>
              </div>
              <div className="w-full bg-[#262930] rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#F57917] h-full transition-all" style={{ width: `${progressA}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Arquivo B */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Arquivo B (Cópia de Trabalho / Destino)
            </label>
            {fileB && (
              <button
                type="button"
                onClick={() => {
                  setFileB(null);
                  setComparisonResult(null);
                }}
                className="text-[11px] text-zinc-500 hover:text-red-400"
              >
                Remover
              </button>
            )}
          </div>

          <div
            onClick={() => fileBInputRef.current?.click()}
            className={`p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
              fileB ? 'border-[#F57917]/70 bg-[#17191D]' : 'border-[#262930] hover:border-zinc-500 bg-[#0F1115]'
            }`}
          >
            <input
              ref={fileBInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFileB(e.target.files[0]);
                  setComparisonResult(null);
                }
              }}
            />
            <div className="w-10 h-10 rounded-xl bg-[#262930] flex items-center justify-center text-[#F57917] mb-2.5">
              <FileCode className="w-5 h-5" />
            </div>

            {fileB ? (
              <div className="space-y-1">
                <span className="text-sm font-semibold text-white break-all">{fileB.name}</span>
                <div className="text-xs text-zinc-400 font-mono">
                  {(fileB.size / (1024 * 1024)).toFixed(2)} MB ({fileB.size.toLocaleString('pt-BR')} bytes)
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-sm font-medium text-zinc-300">Selecionar Arquivo B</span>
                <p className="text-xs text-zinc-500">Clique ou arraste o arquivo</p>
              </div>
            )}
          </div>

          {isProcessing && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Leitura B</span>
                <span>{progressB}%</span>
              </div>
              <div className="w-full bg-[#262930] rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#F57917] h-full transition-all" style={{ width: `${progressB}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compare Action Button */}
      <div>
        {isProcessing ? (
          <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] flex items-center justify-between text-xs text-zinc-300 font-mono">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
              {activeFileLabel}
            </span>
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              className="text-red-400 hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCompare}
            disabled={!fileA || !fileB}
            className="w-full py-3 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
          >
            <GitCompare className="w-4 h-4" />
            COMPARAR HASHES SHA-256 DOS ARQUIVOS
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Comparison Result Banner */}
      {comparisonResult && (
        <div className="p-6 rounded-2xl bg-[#0F1115] border border-[#262930] space-y-5 animate-fade-in">
          {/* Status Alert */}
          {comparisonResult.identical ? (
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-600/70 text-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    HASHES IDÊNTICOS
                  </h3>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    Os dois arquivos possuem exatamente o mesmo hash SHA-256, fornecendo forte evidência
                    técnica de que seus conteúdos binários são idênticos.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-red-950/50 border border-red-600/70 text-red-200">
              <div className="flex items-center gap-3">
                <XCircle className="w-7 h-7 text-red-400 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    HASHES DIFERENTES
                  </h3>
                  <p className="text-xs text-red-300 mt-0.5">
                    Os valores de hash SHA-256 divergem. Os arquivos possuem ao menos um byte diferente
                    entre si.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Details breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] space-y-2">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-bold text-white">{fileA?.name}</span>
                <button
                  type="button"
                  onClick={() => copyVal(comparisonResult.hashA, 'hashA')}
                  className="text-[#F57917] hover:underline flex items-center gap-1 text-[11px]"
                >
                  {copiedKey === 'hashA' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copiar
                </button>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                {fileA ? formatBytes(fileA.size) : ''}
              </div>
              <div className="p-2 rounded bg-[#0F1115] border border-[#262930] font-mono text-[11px] text-zinc-200 break-all select-all">
                {comparisonResult.hashA}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#17191D] border border-[#262930] space-y-2">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="font-bold text-white">{fileB?.name}</span>
                <button
                  type="button"
                  onClick={() => copyVal(comparisonResult.hashB, 'hashB')}
                  className="text-[#F57917] hover:underline flex items-center gap-1 text-[11px]"
                >
                  {copiedKey === 'hashB' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copiar
                </button>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                {fileB ? formatBytes(fileB.size) : ''}
              </div>
              <div className="p-2 rounded bg-[#0F1115] border border-[#262930] font-mono text-[11px] text-zinc-200 break-all select-all">
                {comparisonResult.hashB}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 font-mono text-right">
            Tempo total de cálculo: {comparisonResult.timeTakenMs} ms
          </div>
        </div>
      )}
    </div>
  );
};

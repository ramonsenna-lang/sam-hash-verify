import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Upload,
  Copy,
  Check,
  FileText,
  XCircle,
  File as FileIcon,
  HelpCircle,
  RefreshCw,
  GitCompare,
  HardDrive,
} from 'lucide-react';
import { HashAlgorithm, ValidationStatus, SingleValidationRecord } from '../types';
import {
  computeHashes,
  detectProbableAlgorithm,
  compareHashes,
  extractFileMetadata,
  generateLocalVerificationId,
} from '../utils/crypto';
import { exportSingleRecordPDF, exportSingleRecordTXT, formatForensicDate } from '../utils/exporter';
import { CompareTwoHashesTab } from './CompareTwoHashesTab';
import { ForensicExtractionModule } from './ForensicExtractionModule';

interface ValidateHashModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
  initialSubTab?: 'validacao' | 'extracao';
}

export const ValidateHashModule: React.FC<ValidateHashModuleProps> = ({
  onAddSessionRecord,
  initialSubTab = 'validacao',
}) => {
  const [activeMainSubTab, setActiveMainSubTab] = useState<'validacao' | 'extracao'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveMainSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [activeValidationSubTab, setActiveValidationSubTab] = useState<'ARQUIVO' | 'DOIS_HASHES'>('ARQUIVO');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [referenceHashInput, setReferenceHashInput] = useState('');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<HashAlgorithm>('SHA-256');
  const [algorithmAutoDetected, setAlgorithmAutoDetected] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedBytes, setProcessedBytes] = useState(0);

  const [currentResult, setCurrentResult] = useState<{
    status: ValidationStatus;
    calculatedHash: string;
    referenceHash: string;
    algorithm: HashAlgorithm;
    recordId: string;
    timestamp: string;
    timezone: string;
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect algorithm whenever referenceHashInput changes
  useEffect(() => {
    const trimmed = referenceHashInput.trim();
    if (!trimmed) {
      setAlgorithmAutoDetected(null);
      return;
    }
    const detection = detectProbableAlgorithm(trimmed);
    if (detection.isValidHex && detection.algorithm) {
      setSelectedAlgorithm(detection.algorithm);
      setAlgorithmAutoDetected(detection.message);
    } else {
      setAlgorithmAutoDetected(detection.message);
    }
  }, [referenceHashInput]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setCurrentResult(null);
      setErrorMessage(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setCurrentResult(null);
      setErrorMessage(null);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setErrorMessage('Operação cancelada pelo usuário.');
    }
  };

  const handleValidate = async () => {
    if (!selectedFile) {
      setErrorMessage('Por favor, selecione um arquivo para validação.');
      return;
    }

    const trimmedRef = referenceHashInput.trim();
    if (!trimmedRef) {
      setErrorMessage('Informe o hash de referência para efetuar a validação.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessedBytes(0);
    setErrorMessage(null);
    setCurrentResult(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = performance.now();

    try {
      const computedMap = await computeHashes(
        selectedFile,
        [selectedAlgorithm],
        (pct, processed) => {
          setProgress(pct);
          setProcessedBytes(processed);
        },
        abortController.signal
      );

      const calculated = computedMap[selectedAlgorithm];
      const comparison = compareHashes(trimmedRef, calculated);
      const isMatch = comparison.isMatch;

      const { formatted, tz } = formatForensicDate();
      const localId = generateLocalVerificationId();
      const fileMeta = extractFileMetadata(selectedFile);

      const status: ValidationStatus = isMatch ? 'CORRESPONDENTE' : 'DIVERGENTE';

      const newRecord: SingleValidationRecord = {
        id: localId,
        timestamp: formatted,
        timezone: tz,
        fileMetadata: fileMeta,
        algorithm: selectedAlgorithm,
        referenceHash: trimmedRef,
        calculatedHash: calculated,
        status,
      };

      setCurrentResult({
        status,
        calculatedHash: calculated,
        referenceHash: trimmedRef,
        algorithm: selectedAlgorithm,
        recordId: localId,
        timestamp: formatted,
        timezone: tz,
      });

      onAddSessionRecord(newRecord);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setErrorMessage('Validação cancelada.');
      } else {
        setErrorMessage(
          err instanceof Error
            ? `Erro durante o cálculo: ${err.message}`
            : 'Erro desconhecido durante o cálculo de hash.'
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadPDF = () => {
    if (!currentResult || !selectedFile) return;
    const fileMeta = extractFileMetadata(selectedFile);
    exportSingleRecordPDF({
      id: currentResult.recordId,
      timestamp: currentResult.timestamp,
      timezone: currentResult.timezone,
      fileMetadata: fileMeta,
      algorithm: currentResult.algorithm,
      referenceHash: currentResult.referenceHash,
      calculatedHash: currentResult.calculatedHash,
      status: currentResult.status,
    });
  };

  const handleCopyFullResult = () => {
    if (!currentResult || !selectedFile) return;
    const fileMeta = extractFileMetadata(selectedFile);
    const txt = exportSingleRecordTXT({
      id: currentResult.recordId,
      timestamp: currentResult.timestamp,
      timezone: currentResult.timezone,
      fileMetadata: fileMeta,
      algorithm: currentResult.algorithm,
      referenceHash: currentResult.referenceHash,
      calculatedHash: currentResult.calculatedHash,
      status: currentResult.status,
    });
    copyToClipboard(txt, 'full-result');
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Sub-tab Switcher: Validação de Hash vs Extrações Forenses */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0F1115] border border-[#262930] w-max max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveMainSubTab('validacao')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeMainSubTab === 'validacao'
              ? 'bg-[#17191D] text-white border border-[#363B47] shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ShieldCheck className={`w-4 h-4 ${activeMainSubTab === 'validacao' ? 'text-[#F57917]' : 'text-zinc-500'}`} />
          <span>Validação de Hash</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainSubTab('extracao')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeMainSubTab === 'extracao'
              ? 'bg-[#17191D] text-white border border-[#363B47] shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <HardDrive className={`w-4 h-4 ${activeMainSubTab === 'extracao' ? 'text-[#F57917]' : 'text-zinc-500'}`} />
          <span>Extrações Forenses</span>
        </button>
      </div>

      {activeMainSubTab === 'extracao' ? (
        <ForensicExtractionModule onAddSessionRecord={onAddSessionRecord} />
      ) : (
        <>
          {/* Header section with Sub-Tabs */}
      <div className="border-b border-[#262930] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#F57917]" />
            Validação de Integridade Criptográfica
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Conferência determinística de integridade de arquivos de evidência ou comparação direta entre dois códigos de hash.
          </p>
        </div>

        {/* 2 Tabs requested in Section 1 */}
        <div className="flex items-center gap-1.5 p-1 bg-[#17191D] rounded-xl border border-[#262930] shrink-0">
          <button
            type="button"
            onClick={() => setActiveValidationSubTab('ARQUIVO')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeValidationSubTab === 'ARQUIVO'
                ? 'bg-[#F57917] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            1. Validar Hash de Arquivo
          </button>
          <button
            type="button"
            onClick={() => setActiveValidationSubTab('DOIS_HASHES')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeValidationSubTab === 'DOIS_HASHES'
                ? 'bg-[#F57917] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            2. Comparar Dois Hashes
          </button>
        </div>
      </div>

      {/* ABA 2 — COMPARAR DOIS HASHES */}
      {activeValidationSubTab === 'DOIS_HASHES' && <CompareTwoHashesTab />}

      {/* ABA 1 — VALIDAR HASH DE ARQUIVO */}
      {activeValidationSubTab === 'ARQUIVO' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
        {/* Left / Main Column: Input Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* File Selection Dropzone */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
              1. Selecionar Arquivo da Evidência
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                selectedFile
                  ? 'border-[#F57917]/70 bg-[#17191D]'
                  : 'border-[#262930] hover:border-zinc-500 bg-[#0F1115]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-12 h-12 rounded-xl bg-[#262930] flex items-center justify-center text-[#F57917] mb-3">
                {selectedFile ? <FileIcon className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
              </div>

              {selectedFile ? (
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-white break-all">
                    {selectedFile.name}
                  </span>
                  <div className="text-xs text-zinc-400 font-mono">
                    {selectedFile.size.toLocaleString('pt-BR')} bytes (
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </div>
                  <span className="text-[11px] text-[#F57917] block pt-1">
                    Clique para trocar de arquivo
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-sm font-medium text-zinc-200">
                    Clique para selecionar ou arraste o arquivo aqui
                  </span>
                  <p className="text-xs text-zinc-500">
                    Qualquer extensão binária (.ufdr, .zip, .bin, .img, .pdf, .e01, etc.)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reference Hash Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                2. Hash de Referência (Esperado)
              </label>
              {referenceHashInput && (
                <button
                  type="button"
                  onClick={() => setReferenceHashInput('')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Limpar
                </button>
              )}
            </div>

            <textarea
              rows={3}
              value={referenceHashInput}
              onChange={(e) => setReferenceHashInput(e.target.value)}
              placeholder="Cole o valor hexadecimal do hash de referência (ex: e3b0c44298fc1c149afbf4...)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#17191D] border border-[#262930] focus:border-[#F57917] focus:outline-none text-white font-mono text-xs placeholder:text-zinc-600 transition-colors resize-none"
            />

            {/* Algorithm Detection Status */}
            {algorithmAutoDetected && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 bg-[#121418] px-3 py-1.5 rounded-lg border border-[#262930]">
                <HelpCircle className="w-3.5 h-3.5 text-[#F57917] shrink-0" />
                <span>Detecção: {algorithmAutoDetected}</span>
              </div>
            )}
          </div>

          {/* Algorithm Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
              3. Algoritmo Criptográfico de Comparação
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as HashAlgorithm[]).map((algo) => (
                <button
                  key={algo}
                  type="button"
                  onClick={() => setSelectedAlgorithm(algo)}
                  className={`py-2 px-3 text-xs font-mono font-medium rounded-lg border transition-all text-center cursor-pointer ${
                    selectedAlgorithm === algo
                      ? 'bg-[#F57917] text-white border-[#F57917] shadow-sm'
                      : 'bg-[#17191D] text-zinc-400 border-[#262930] hover:text-white hover:border-zinc-600'
                  }`}
                >
                  {algo}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">
              A detecção é provável com base no comprimento; confirme o algoritmo explicitado no relatório de origem.
            </p>
          </div>

          {/* Action Button & Progress */}
          <div className="pt-2">
            {isProcessing ? (
              <div className="space-y-3 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-mono flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-[#F57917] animate-spin" />
                    Calculando {selectedAlgorithm}...
                  </span>
                  <span className="text-white font-mono font-bold">{progress}%</span>
                </div>

                <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F57917] h-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    Processado: {(processedBytes / (1024 * 1024)).toFixed(1)} MB /{' '}
                    {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(1) : 0} MB
                  </span>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleValidate}
                disabled={!selectedFile || !referenceHashInput.trim()}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                  !selectedFile || !referenceHashInput.trim()
                    ? 'bg-[#262930] text-zinc-500 cursor-not-allowed'
                    : 'bg-[#F57917] hover:bg-[#FF9A35] text-white active:scale-[0.99]'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
                VALIDAR INTEGRIDADE
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Right Column: Result Presentation Card */}
        <div className="lg:col-span-5">
          <div className="h-full rounded-2xl bg-[#0F1115] border border-[#262930] p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#262930] pb-3">
                <span className="text-xs font-mono font-semibold uppercase text-zinc-400">
                  Resultado da Conferência
                </span>
                {currentResult && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    {currentResult.recordId}
                  </span>
                )}
              </div>

              {currentResult ? (
                <div className="space-y-4 animate-fade-in">
                  {/* Status Banner */}
                  {currentResult.status === 'CORRESPONDENTE' ? (
                    <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-600/70 text-emerald-200">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-base font-extrabold tracking-wide text-white">
                            HASH CORRESPONDENTE
                          </div>
                          <div className="text-xs text-emerald-300 font-medium">
                            Integridade matemática confirmada para {currentResult.algorithm}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-red-950/50 border border-red-600/70 text-red-200">
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
                        <div>
                          <div className="text-base font-extrabold tracking-wide text-white">
                            HASH DIVERGENTE
                          </div>
                          <div className="text-xs text-red-300 font-medium">
                            O hash do arquivo difere do valor de referência
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hash Comparison Details */}
                  <div className="space-y-3 text-xs">
                    {/* Reference Hash */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="font-semibold">Hash de Referência ({currentResult.algorithm}):</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(currentResult.referenceHash, 'ref-hash')}
                          className="text-[#F57917] hover:underline flex items-center gap-1 text-[11px]"
                        >
                          {copiedField === 'ref-hash' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Copiar
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#17191D] border border-[#262930] font-mono text-[11px] text-zinc-200 break-all select-all">
                        {currentResult.referenceHash}
                      </div>
                    </div>

                    {/* Calculated Hash */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="font-semibold">Hash Calculado ({currentResult.algorithm}):</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(currentResult.calculatedHash, 'calc-hash')}
                          className="text-[#F57917] hover:underline flex items-center gap-1 text-[11px]"
                        >
                          {copiedField === 'calc-hash' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Copiar
                        </button>
                      </div>
                      <div
                        className={`p-2.5 rounded-lg border font-mono text-[11px] break-all select-all ${
                          currentResult.status === 'CORRESPONDENTE'
                            ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300'
                            : 'bg-red-950/20 border-red-800 text-red-300'
                        }`}
                      >
                        {currentResult.calculatedHash}
                      </div>
                    </div>
                  </div>

                  {/* Audit Metadata */}
                  <div className="pt-2 border-t border-[#262930] space-y-1 text-[11px] text-zinc-400 font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Arquivo:</span>
                      <span className="text-zinc-300 truncate max-w-[200px]" title={selectedFile?.name}>
                        {selectedFile?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Tamanho:</span>
                      <span className="text-zinc-300">
                        {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : 0} MB (
                        {selectedFile?.size.toLocaleString('pt-BR')} bytes)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Data e Fuso:</span>
                      <span className="text-zinc-300">
                        {currentResult.timestamp} ({currentResult.timezone})
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty / Awaiting verification state */
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#17191D] border border-[#262930] flex items-center justify-center text-zinc-600 mx-auto">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="text-zinc-400 text-xs max-w-xs mx-auto">
                    Aguardando submissão do arquivo e do hash de referência para iniciar o cálculo.
                  </div>
                  <div className="text-[11px] text-zinc-600">
                    O status <strong className="text-zinc-500">NÃO VERIFICADO</strong> permanece ativo até a conclusão do cálculo.
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions when Result is Ready */}
            {currentResult && (
              <div className="pt-4 border-t border-[#262930] space-y-2">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#262930] hover:bg-[#323640] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#F57917]" />
                  GERAR RELATÓRIO PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopyFullResult}
                  className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-[#17191D] text-zinc-400 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-[#262930] cursor-pointer"
                >
                  {copiedField === 'full-result' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === 'full-result' ? 'Resumo Copiado!' : 'Copiar Laudo em Texto (TXT)'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
        </>
      )}
    </div>
  );
};

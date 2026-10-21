import React, { useState, useRef } from 'react';
import {
  HardDrive,
  Upload,
  FileCheck,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Copy,
  Check,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FolderArchive,
} from 'lucide-react';
import {
  HashAlgorithm,
  ExtractionType,
  ForensicExtractionMetadata,
  SingleValidationRecord,
  ValidationStatus,
} from '../types';
import {
  computeHashes,
  compareHashes,
  extractFileMetadata,
  generateLocalVerificationId,
  detectProbableAlgorithm,
} from '../utils/crypto';
import { exportSingleRecordPDF, exportSingleRecordTXT, formatForensicDate } from '../utils/exporter';

interface ForensicExtractionModuleProps {
  onAddSessionRecord: (record: SingleValidationRecord) => void;
}

export const ForensicExtractionModule: React.FC<ForensicExtractionModuleProps> = ({
  onAddSessionRecord,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Forensic Metadata Form
  const [procedureNumber, setProcedureNumber] = useState('');
  const [evidenceNumber, setEvidenceNumber] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [toolName, setToolName] = useState('Cellebrite UFED 4PC');
  const [extractionType, setExtractionType] = useState<ExtractionType>('Física');
  const [examinerName, setExaminerName] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [referenceHash, setReferenceHash] = useState('');
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('SHA-256');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedBytes, setProcessedBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [validationResult, setValidationResult] = useState<{
    id: string;
    status: ValidationStatus;
    calculatedHash: string;
    referenceHash: string;
    algorithm: HashAlgorithm;
    timestamp: string;
    timezone: string;
    metadata: ForensicExtractionMetadata;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceHashChange = (val: string) => {
    setReferenceHash(val);
    const detection = detectProbableAlgorithm(val);
    if (detection.isValidHex && detection.algorithm) {
      setAlgorithm(detection.algorithm);
    }
  };

  const handleValidateExtraction = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecione o arquivo de extração forense para validação.');
      return;
    }

    const trimmedRef = referenceHash.trim();
    if (!trimmedRef) {
      setErrorMessage('Informe o hash de referência gerado pela ferramenta forense no momento da aquisição.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessedBytes(0);
    setErrorMessage(null);
    setValidationResult(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const computed = await computeHashes(
        selectedFile,
        [algorithm],
        (pct, bytes) => {
          setProgress(pct);
          setProcessedBytes(bytes);
        },
        abortController.signal
      );

      const calculated = computed[algorithm];
      const comp = compareHashes(trimmedRef, calculated);
      const isMatch = comp.isMatch;
      const status: ValidationStatus = isMatch ? 'CORRESPONDENTE' : 'DIVERGENTE';

      const { formatted, tz } = formatForensicDate();
      const localId = generateLocalVerificationId();
      const fileMeta = extractFileMetadata(selectedFile);

      const metadata: ForensicExtractionMetadata = {
        procedureNumber,
        evidenceNumber,
        deviceId,
        toolName,
        extractionType,
        examinerName,
        technicalNotes,
        referenceHash: trimmedRef,
        algorithm,
      };

      const resultPayload = {
        id: localId,
        status,
        calculatedHash: calculated,
        referenceHash: trimmedRef,
        algorithm,
        timestamp: formatted,
        timezone: tz,
        metadata,
      };

      setValidationResult(resultPayload);

      // Add to session records
      onAddSessionRecord({
        id: localId,
        timestamp: formatted,
        timezone: tz,
        fileMetadata: fileMeta,
        algorithm,
        referenceHash: trimmedRef,
        calculatedHash: calculated,
        status,
        examinerName,
        procedureNumber,
        evidenceNumber,
        toolName,
        notes: `[Tipo: ${extractionType} | Disp: ${deviceId || 'N/A'}] ${technicalNotes}`,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setErrorMessage('Processamento da extração cancelado.');
      } else {
        setErrorMessage(
          err instanceof Error
            ? `Erro de conferência: ${err.message}`
            : 'Erro desconhecido na conferência da extração.'
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownloadReport = () => {
    if (!validationResult || !selectedFile) return;
    const fileMeta = extractFileMetadata(selectedFile);
    exportSingleRecordPDF({
      id: validationResult.id,
      timestamp: validationResult.timestamp,
      timezone: validationResult.timezone,
      fileMetadata: fileMeta,
      algorithm: validationResult.algorithm,
      referenceHash: validationResult.referenceHash,
      calculatedHash: validationResult.calculatedHash,
      status: validationResult.status,
      examinerName: validationResult.metadata.examinerName,
      procedureNumber: validationResult.metadata.procedureNumber,
      evidenceNumber: validationResult.metadata.evidenceNumber,
      toolName: `${validationResult.metadata.toolName} (${validationResult.metadata.extractionType})`,
      notes: validationResult.metadata.technicalNotes,
    });
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
          <HardDrive className="w-6 h-6 text-[#F57917]" />
          Conferência de Extrações Forenses
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Validação de integridade de arquivos gerados por Cellebrite UFED, Physical Analyzer,
          geradores de imagens forenses (.e01, .raw, .bin) e aquisições em nuvem, com registro de metadados periciais.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Extraction Details & File Form */}
        <div className="lg:col-span-7 space-y-5">
          {/* File input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
              Arquivo da Imagem ou Pacote Forense
            </label>
            <div
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
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                    setValidationResult(null);
                    setErrorMessage(null);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-xl bg-[#262930] flex items-center justify-center text-[#F57917] mb-3">
                <FolderArchive className="w-6 h-6" />
              </div>

              {selectedFile ? (
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-white break-all">
                    {selectedFile.name}
                  </span>
                  <div className="text-xs text-zinc-400 font-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ({selectedFile.size.toLocaleString('pt-BR')} bytes)
                  </div>
                  <span className="text-[11px] text-[#F57917] block pt-1">
                    Clique para trocar o arquivo
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-sm font-medium text-zinc-200">
                    Selecione o arquivo da extração (.ufdr, .ufd, .zip, .e01, .bin, .img)
                  </span>
                  <p className="text-xs text-zinc-500">
                    Processado byte a byte via streaming sem envio a servidores
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reference Hash & Algorithm */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Hash Registrado pela Ferramenta
              </label>
              <input
                type="text"
                value={referenceHash}
                onChange={(e) => handleReferenceHashChange(e.target.value)}
                placeholder="Cole o hash gerado no relatório de aquisição..."
                className="w-full px-3 py-2 rounded-xl bg-[#17191D] border border-[#262930] focus:border-[#F57917] focus:outline-none text-white font-mono text-xs placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Algoritmo
              </label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as HashAlgorithm)}
                className="w-full px-3 py-2 rounded-xl bg-[#17191D] border border-[#262930] text-white font-mono text-xs focus:border-[#F57917] focus:outline-none"
              >
                <option value="SHA-256">SHA-256</option>
                <option value="MD5">MD5</option>
                <option value="SHA-1">SHA-1</option>
                <option value="SHA-512">SHA-512</option>
              </select>
            </div>
          </div>

          {/* Contextual Forensic Metadata Form */}
          <div className="p-4 rounded-xl bg-[#0F1115] border border-[#262930] space-y-3">
            <div className="flex items-center justify-between border-b border-[#262930] pb-2">
              <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                Informações Contextuais Periciais (Opcional)
              </span>
              <span className="text-[10px] text-zinc-500">Gravado no laudo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Nº do Procedimento / Autos:</label>
                <input
                  type="text"
                  placeholder="Ex: IPL 045/2026, Processo..."
                  value={procedureNumber}
                  onChange={(e) => setProcedureNumber(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Nº da Evidência / Item:</label>
                <input
                  type="text"
                  placeholder="Ex: EVI-01, Item Apreendido 03"
                  value={evidenceNumber}
                  onChange={(e) => setEvidenceNumber(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Dispositivo Examinado:</label>
                <input
                  type="text"
                  placeholder="Ex: iPhone 14 Pro, Samsung S22, IMEI..."
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Ferramenta Forense Utilizada:</label>
                <input
                  type="text"
                  placeholder="Ex: Cellebrite UFED, Magnet AXIOM..."
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Tipo de Extração:</label>
                <select
                  value={extractionType}
                  onChange={(e) => setExtractionType(e.target.value as ExtractionType)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                >
                  <option value="Física">Física (Bit-stream image)</option>
                  <option value="Sistema de arquivos">Sistema de arquivos (File System)</option>
                  <option value="Lógica">Lógica (Logical backup)</option>
                  <option value="Nuvem">Nuvem (Cloud extraction)</option>
                  <option value="Outro">Outro formato</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Responsável pela Conferência:</label>
                <input
                  type="text"
                  placeholder="Nome do perito ou analista"
                  value={examinerName}
                  onChange={(e) => setExaminerName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white focus:outline-none focus:border-[#F57917]"
                />
              </div>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1 text-xs">Observações Técnicas:</label>
              <textarea
                rows={2}
                placeholder="Observações complementares sobre a preservação e integridade..."
                value={technicalNotes}
                onChange={(e) => setTechnicalNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#17191D] border border-[#262930] text-white text-xs focus:outline-none focus:border-[#F57917] resize-none"
              />
            </div>
          </div>

          {/* Validation Action Button */}
          <div>
            {isProcessing ? (
              <div className="space-y-2 p-4 rounded-xl bg-[#17191D] border border-[#262930]">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-[#F57917] animate-spin" />
                    Processando imagem forense...
                  </span>
                  <span className="text-white font-bold">{progress}%</span>
                </div>
                <div className="w-full bg-[#262930] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F57917] h-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>{(processedBytes / (1024 * 1024)).toFixed(1)} MB lidos</span>
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-red-400 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleValidateExtraction}
                disabled={!selectedFile || !referenceHash.trim()}
                className="w-full py-3.5 px-6 rounded-xl bg-[#F57917] hover:bg-[#FF9A35] disabled:bg-[#262930] disabled:text-zinc-600 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                CONFERIR INTEGRIDADE DA EXTRAÇÃO
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Right Column: Result Panel */}
        <div className="lg:col-span-5">
          <div className="h-full rounded-2xl bg-[#0F1115] border border-[#262930] p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#262930] pb-3">
                <span className="text-xs font-mono font-semibold uppercase text-zinc-400">
                  Resultado Pericial
                </span>
                {validationResult && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    {validationResult.id}
                  </span>
                )}
              </div>

              {validationResult ? (
                <div className="space-y-4 animate-fade-in">
                  {/* Status Banner */}
                  {validationResult.status === 'CORRESPONDENTE' ? (
                    <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-600/70 text-emerald-200">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-base font-extrabold tracking-wide text-white">
                            EXTRAÇÃO ÍNTEGRA
                          </div>
                          <div className="text-xs text-emerald-300 font-medium">
                            Hash idêntico ao registrado pela ferramenta ({validationResult.algorithm})
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
                            DIVERGÊNCIA DETECTADA
                          </div>
                          <div className="text-xs text-red-300 font-medium">
                            O hash binário difere da referência informada
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hashes values */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between text-zinc-400 mb-1">
                        <span>Hash Declarado ({validationResult.algorithm}):</span>
                        <button
                          type="button"
                          onClick={() => copyVal(validationResult.referenceHash, 'ref')}
                          className="text-[#F57917] hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'ref' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Copiar
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#17191D] border border-[#262930] font-mono text-[11px] text-zinc-200 break-all select-all">
                        {validationResult.referenceHash}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-zinc-400 mb-1">
                        <span>Hash Calculado no Navegador:</span>
                        <button
                          type="button"
                          onClick={() => copyVal(validationResult.calculatedHash, 'calc')}
                          className="text-[#F57917] hover:underline flex items-center gap-1"
                        >
                          {copiedKey === 'calc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Copiar
                        </button>
                      </div>
                      <div
                        className={`p-2.5 rounded-lg border font-mono text-[11px] break-all select-all ${
                          validationResult.status === 'CORRESPONDENTE'
                            ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300'
                            : 'bg-red-950/20 border-red-800 text-red-300'
                        }`}
                      >
                        {validationResult.calculatedHash}
                      </div>
                    </div>
                  </div>

                  {/* Case Info Preview */}
                  <div className="p-3 rounded-lg bg-[#17191D] border border-[#262930] space-y-1 text-[11px] font-mono text-zinc-400">
                    {procedureNumber && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Procedimento:</span>
                        <span className="text-zinc-200">{procedureNumber}</span>
                      </div>
                    )}
                    {evidenceNumber && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Evidência:</span>
                        <span className="text-zinc-200">{evidenceNumber}</span>
                      </div>
                    )}
                    {deviceId && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Dispositivo:</span>
                        <span className="text-zinc-200">{deviceId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Tipo:</span>
                      <span className="text-zinc-200">{extractionType}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#17191D] border border-[#262930] flex items-center justify-center text-zinc-600 mx-auto">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-zinc-400 max-w-xs mx-auto">
                    Aguardando submissão do arquivo e do hash de referência para validação da extração.
                  </div>
                </div>
              )}
            </div>

            {validationResult && (
              <div className="pt-4 border-t border-[#262930]">
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#262930] hover:bg-[#323640] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#F57917]" />
                  GERAR RELATÓRIO PERICIAL (PDF)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * HASH VERIFY — Forensic Report Exporter
 * Generates technical verification reports in PDF, TXT and CSV formats
 * 100% Client-side generation without server dependencies
 */

import jsPDF from 'jspdf';
import { SingleValidationRecord, BatchItem } from '../types';

/**
 * Technical conclusion generator based on validation status
 */
export function getStandardizedConclusion(status: string): string {
  switch (status) {
    case 'CORRESPONDENTE':
      return 'Os valores de hash calculado e de referência apresentaram correspondência para o algoritmo informado, relativamente ao arquivo submetido à verificação.';
    case 'DIVERGENTE':
      return 'Os valores de hash calculado e de referência apresentaram divergência, não sendo possível confirmar a correspondência de integridade por meio desta verificação.';
    case 'SEM_REFERENCIA':
      return 'Foi realizado o cálculo do hash criptográfico do arquivo, sem comparação com valor de referência.';
    default:
      return 'A verificação não pôde ser completada ou apresentou irregularidade técnica durante a leitura dos dados.';
  }
}

/**
 * Format date in Brazilian forensic format with timezone
 */
export function formatForensicDate(date: Date = new Date()): { formatted: string; tz: string } {
  const formatted = date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return { formatted, tz };
}

/**
 * Generate and download a forensic verification report as PDF
 */
export function exportSingleRecordPDF(record: SingleValidationRecord): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Header Background Bar (Cellebrite charcoal & orange accent)
  doc.setFillColor(15, 17, 21); // #0F1115
  doc.rect(margin, y, contentWidth, 24, 'F');

  // Orange accent line on top of header
  doc.setFillColor(245, 121, 23); // #F57917
  doc.rect(margin, y, contentWidth, 1.8, 'F');

  // Brand Header text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SAM HASH VERIFY', margin + 6, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(245, 121, 23);
  doc.text('FORENSIC INTEGRITY SYSTEM', margin + 56, y + 10);

  doc.setTextColor(180, 185, 195);
  doc.setFontSize(8);
  doc.text('SISTEMA DE GERAÇÃO E VALIDAÇÃO DE INTEGRIDADE DIGITAL', margin + 6, y + 17);

  y += 32;

  // Document Title
  doc.setTextColor(20, 24, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RELATÓRIO DE VERIFICAÇÃO DE INTEGRIDADE DIGITAL', margin, y);

  y += 5;
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + contentWidth, y);

  y += 7;

  // Metadata block (Protocol & Date)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Identificador Local de Verificação:', margin, y);
  doc.setFont('courier', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text(record.id, margin + 58, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Data e Hora da Verificação:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(`${record.timestamp} (Fuso: ${record.timezone})`, margin + 58, y);

  if (record.examinerName) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 75, 85);
    doc.text('Responsável Técnico:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 24, 30);
    doc.text(record.examinerName, margin + 58, y);
  }

  // Case & Extraction details if available
  if (record.procedureNumber || record.evidenceNumber || record.toolName) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(245, 121, 23);
    doc.text('DADOS DO PROCEDIMENTO E EVIDÊNCIA', margin, y);
    y += 3;
    doc.setDrawColor(240, 242, 245);
    doc.line(margin, y, margin + contentWidth, y);
    y += 6;

    if (record.procedureNumber) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(70, 75, 85);
      doc.text('Nº do Procedimento / Autos:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 24, 30);
      doc.text(record.procedureNumber, margin + 58, y);
      y += 6;
    }

    if (record.evidenceNumber) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(70, 75, 85);
      doc.text('Nº da Evidência / Item:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 24, 30);
      doc.text(record.evidenceNumber, margin + 58, y);
      y += 6;
    }

    if (record.toolName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(70, 75, 85);
      doc.text('Ferramenta de Extração:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 24, 30);
      doc.text(record.toolName, margin + 58, y);
      y += 6;
    }
  }

  // File Details section
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(245, 121, 23);
  doc.text('IDENTIFICAÇÃO DO ARQUIVO SUBMETIDO', margin, y);
  y += 3;
  doc.setDrawColor(240, 242, 245);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 75, 85);
  doc.text('Nome do Arquivo:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(record.fileMetadata.name, margin + 58, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Tamanho em Bytes:', margin, y);
  doc.setFont('courier', 'normal');
  doc.text(`${record.fileMetadata.size.toLocaleString('pt-BR')} bytes`, margin + 58, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Tamanho Formatado:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(record.fileMetadata.formattedSize.split('(')[0].trim(), margin + 58, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Última Modificação:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(record.fileMetadata.lastModified).toLocaleString('pt-BR'), margin + 58, y);

  // Cryptographic Verification section
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(245, 121, 23);
  doc.text('CONFERÊNCIA CRIPTOGRÁFICA', margin, y);
  y += 3;
  doc.setDrawColor(240, 242, 245);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 75, 85);
  doc.text('Algoritmo Utilizado:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text(record.algorithm, margin + 58, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Hash de Referência:', margin, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 35, 45);
  const refText = record.referenceHash || '(Nenhum hash de referência fornecido)';
  const splitRef = doc.splitTextToSize(refText, contentWidth - 4);
  doc.text(splitRef, margin + 2, y);
  y += splitRef.length * 4.5 + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 75, 85);
  doc.text('Hash Calculado:', margin, y);
  y += 5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 20, 25);
  const calcText = record.calculatedHash || '(Não calculado)';
  const splitCalc = doc.splitTextToSize(calcText, contentWidth - 4);
  doc.text(splitCalc, margin + 2, y);
  y += splitCalc.length * 4.5 + 4;

  // Status Box
  const status = record.status;
  if (status === 'CORRESPONDENTE') {
    doc.setFillColor(220, 252, 231); // Light emerald
    doc.setDrawColor(22, 163, 74); // Green 600
    doc.setTextColor(22, 101, 52); // Green 800
  } else if (status === 'DIVERGENTE') {
    doc.setFillColor(254, 226, 226); // Light red
    doc.setDrawColor(220, 38, 38); // Red 600
    doc.setTextColor(153, 27, 27); // Red 800
  } else {
    doc.setFillColor(254, 249, 195); // Light yellow
    doc.setDrawColor(202, 138, 4); // Yellow 600
    doc.setTextColor(133, 77, 14); // Yellow 800
  }

  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const statusLabel =
    status === 'CORRESPONDENTE'
      ? 'RESULTADO: HASH CORRESPONDENTE (INTEGRIDADE VERIFICADA)'
      : status === 'DIVERGENTE'
      ? 'RESULTADO: HASH DIVERGENTE (INTEGRIDADE NÃO CONFIRMADA)'
      : 'RESULTADO: CÁLCULO REALIZADO SEM VALOR DE REFERÊNCIA';
  doc.text(statusLabel, margin + 6, y + 9);

  y += 20;

  // Technical Conclusion
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 24, 30);
  doc.text('CONCLUSÃO TÉCNICA PADRONIZADA', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 55, 65);
  const conclusionText = getStandardizedConclusion(status);
  const splitConclusion = doc.splitTextToSize(conclusionText, contentWidth);
  doc.text(splitConclusion, margin, y);
  y += splitConclusion.length * 4.5 + 6;

  if (record.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Observações Técnicas:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const splitNotes = doc.splitTextToSize(record.notes, contentWidth);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 4 + 6;
  }

  // Footer Credits & Disclaimer Section (as requested)
  y = Math.max(y, 252);
  doc.setDrawColor(220, 225, 230);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4.5;

  // Project Credits
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 85, 95);
  doc.text('SAM HASH VERIFY — Forensic Integrity System', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110, 115, 125);
  y += 3.8;
  doc.text('Desenvolvido pelo APF Ramon (ramon.grsl)  |  Polícia Federal — XIV Cellebrite — Turma A — 2026', margin, y);
  y += 3.5;
  doc.text('Contexto de capacitação técnica profissional (sem certificação/endosso oficial)', margin, y);

  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 135, 145);
  const disclaimer =
    'AVISO FORENSE: Este relatório atesta o cálculo estritamente determinístico do hash criptográfico sobre os dados binários do arquivo processado localmente no navegador. Não substitui procedimentos oficiais de cadeia de custódia física nem laudo pericial formal expedido por autoridade pericial competente.';
  const splitDisclaimer = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(splitDisclaimer, margin, y);

  doc.save(`Relatorio_Hash_${record.fileMetadata.name}_${record.id}.pdf`);
}

/**
 * Export record as formatted plain text
 */
export function exportSingleRecordTXT(record: SingleValidationRecord): string {
  const conclusion = getStandardizedConclusion(record.status);

  return `================================================================================
SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM
RELATÓRIO DE VERIFICAÇÃO DE INTEGRIDADE DIGITAL
================================================================================
CRÉDITOS DO PROJETO:
  Desenvolvido pelo APF Ramon (ramon.grsl)
  Polícia Federal — XIV Cellebrite — Turma A — 2026
  (Identificação de contexto de formação profissional sem endosso oficial)
================================================================================

IDENTIFICAÇÃO DO REGISTRO:
  Protocolo Local: ${record.id}
  Data e Hora:    ${record.timestamp}
  Fuso Horário:   ${record.timezone}
  Responsável:    ${record.examinerName || 'Não informado'}

DADOS FORENSES:
  Procedimento:   ${record.procedureNumber || 'Não informado'}
  Evidência:      ${record.evidenceNumber || 'Não informada'}
  Ferramenta:     ${record.toolName || 'Não informada'}

DADOS DO ARQUIVO:
  Nome:           ${record.fileMetadata.name}
  Tamanho:        ${record.fileMetadata.size} bytes (${record.fileMetadata.formattedSize})
  Caminho Rel.:   ${record.fileMetadata.relativePath || record.fileMetadata.name}
  Modificado em:  ${new Date(record.fileMetadata.lastModified).toISOString()}

CONFERÊNCIA CRIPTOGRÁFICA:
  Algoritmo:      ${record.algorithm}
  Hash Referência: ${record.referenceHash || '(Sem valor de referência)'}
  Hash Calculado:  ${record.calculatedHash}

RESULTADO:
  Status:         ${record.status}

CONCLUSÃO TÉCNICA:
  ${conclusion}

${record.notes ? `OBSERVAÇÕES TÉCNICAS:\n  ${record.notes}\n` : ''}
AVISO:
  Todo o processamento foi executado localmente no navegador, sem transmissão
  de arquivos ou metadados a servidores externos. A verificação comprova
  a correspondência matemática pontual e não substitui os trâmites legais
  de cadeia de custódia e perícia criminal formal.
================================================================================
`;
}

/**
 * Export Batch validation results as CSV
 */
export function exportBatchCSV(items: BatchItem[]): string {
  const header = ['Arquivo', 'Tamanho_Bytes', 'Algoritmo', 'Hash_Referencia', 'Hash_Calculado', 'Resultado', 'Mensagem'];
  const rows = items.map((item) => [
    `"${(item.relativePath || item.fileName).replace(/"/g, '""')}"`,
    item.fileSize !== undefined ? item.fileSize : '',
    item.algorithm,
    `"${(item.expectedHash || '').replace(/"/g, '""')}"`,
    `"${(item.calculatedHash || '').replace(/"/g, '""')}"`,
    item.status,
    `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
  ]);

  return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Helper to trigger browser file download for TXT or CSV
 */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface HashComparisonReportData {
  id: string;
  code1: string;
  code2: string;
  mode: 'CRIPTOGRAFICA' | 'TEXTO_EXATO';
  algorithm?: string | null;
  length1: number;
  length2: number;
  resultStatus: 'IDENTICOS' | 'DIFERENTES' | 'FORMATO_INVALIDO';
  resultLabel: string;
  divergentCount: number;
  firstDivergenceIndex?: number | null;
  timestamp: string;
  timezone: string;
  technicalNotes?: string;
}

export function exportHashComparisonPDF(data: HashComparisonReportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Header background bar
  doc.setFillColor(15, 17, 21);
  doc.rect(margin, y, contentWidth, 24, 'F');

  // Orange accent line
  doc.setFillColor(245, 121, 23);
  doc.rect(margin, y, contentWidth, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SAM HASH VERIFY', margin + 6, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(245, 121, 23);
  doc.text('FORENSIC INTEGRITY SYSTEM', margin + 56, y + 10);

  doc.setTextColor(180, 185, 195);
  doc.setFontSize(8);
  doc.text('SISTEMA DE GERAÇÃO E VALIDAÇÃO DE INTEGRIDADE DIGITAL', margin + 6, y + 17);

  y += 32;

  // Document Title
  doc.setTextColor(20, 24, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RELATÓRIO DE COMPARAÇÃO DIRETA DE HASHES', margin, y);

  y += 5;
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + contentWidth, y);

  y += 7;

  // Metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Identificador Local:', margin, y);
  doc.setFont('courier', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text(data.id, margin + 45, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Data e Hora:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(`${data.timestamp} (${data.timezone})`, margin + 45, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Tipo de Comparação:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(
    data.mode === 'CRIPTOGRAFICA'
      ? 'Comparação Criptográfica (Hexadecimal / Case-Insensitive)'
      : 'Comparação de Texto Exato (Literal / Case-Sensitive)',
    margin + 45,
    y
  );

  if (data.algorithm) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 75, 85);
    doc.text('Provável Algoritmo:', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 121, 23);
    doc.text(data.algorithm, margin + 45, y);
  }

  // Codes section
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(245, 121, 23);
  doc.text('CÓDIGOS SUBMETIDOS À COMPARAÇÃO', margin, y);
  y += 3;
  doc.setDrawColor(240, 242, 245);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  // Code 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 75, 85);
  doc.text(`Hash 1 — Referência (${data.length1} caracteres):`, margin, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(25, 30, 40);
  const split1 = doc.splitTextToSize(data.code1, contentWidth - 4);
  doc.text(split1, margin + 2, y);
  y += split1.length * 4.5 + 4;

  // Code 2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 75, 85);
  doc.text(`Hash 2 — Comparação (${data.length2} caracteres):`, margin, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(25, 30, 40);
  const split2 = doc.splitTextToSize(data.code2, contentWidth - 4);
  doc.text(split2, margin + 2, y);
  y += split2.length * 4.5 + 6;

  // Metrics Box
  doc.setFillColor(248, 249, 251);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 65, 75);
  doc.text(`Comprimento Cód. 1: ${data.length1} chars`, margin + 4, y + 6);
  doc.text(`Comprimento Cód. 2: ${data.length2} chars`, margin + 65, y + 6);
  doc.text(
    data.firstDivergenceIndex
      ? `1ª Divergência: posição ${data.firstDivergenceIndex}`
      : '1ª Divergência: Nenhuma',
    margin + 125,
    y + 6
  );
  doc.text(`Posições Divergentes: ${data.divergentCount}`, margin + 4, y + 12);
  if (data.length1 !== data.length2) {
    doc.text(
      `Diferença de Comprimento: ${Math.abs(data.length1 - data.length2)} caractere(s) excedente(s)`,
      margin + 65,
      y + 12
    );
  }
  y += 22;

  // Status Banner
  if (data.resultStatus === 'IDENTICOS') {
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(22, 163, 74);
    doc.setTextColor(22, 101, 52);
  } else if (data.resultStatus === 'DIFERENTES') {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 38, 38);
    doc.setTextColor(153, 27, 27);
  } else {
    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(202, 138, 4);
    doc.setTextColor(133, 77, 14);
  }

  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`RESULTADO: ${data.resultLabel}`, margin + 6, y + 9);
  y += 20;

  // Technical Conclusion
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 24, 30);
  doc.text('CONCLUSÃO DA COMPARAÇÃO', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 55, 65);

  let conclusion = '';
  if (data.mode === 'CRIPTOGRAFICA') {
    if (data.resultStatus === 'IDENTICOS') {
      conclusion =
        'Os valores de hash informados apresentaram correspondência textual após a normalização permitida para a representação hexadecimal.';
    } else if (data.resultStatus === 'DIFERENTES') {
      conclusion = 'Os valores de hash informados apresentaram divergência na comparação realizada.';
    } else {
      conclusion =
        'Um ou ambos os códigos informados não representam sequências hexadecimais válidas para algoritmos criptográficos usuais.';
    }
  } else {
    conclusion =
      'Foi realizada uma comparação textual estrita e literal entre os dois códigos informados. Esta operação é puramente textual e NÃO comprova a validade criptográfica ou a integridade dos arquivos de origem.';
  }

  const splitConc = doc.splitTextToSize(conclusion, contentWidth);
  doc.text(splitConc, margin, y);
  y += splitConc.length * 4.5 + 6;

  // Footer Credits
  y = Math.max(y, 252);
  doc.setDrawColor(220, 225, 230);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 85, 95);
  doc.text('SAM HASH VERIFY — Forensic Integrity System', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110, 115, 125);
  y += 3.8;
  doc.text('Desenvolvido pelo APF Ramon (ramon.grsl)  |  Polícia Federal — XIV Cellebrite — Turma A — 2026', margin, y);
  y += 3.5;
  doc.text('Contexto de capacitação técnica profissional (sem certificação/endosso oficial)', margin, y);

  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 135, 145);
  const disclaimer =
    'AVISO FORENSE: Esta ferramenta realizou exclusivamente o confronto determinístico direto entre os caracteres dos códigos informados manualmente. Não substitui procedimentos de validação criptográfica direta de arquivos de evidência em custódia.';
  const splitDisclaimer = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(splitDisclaimer, margin, y);

  doc.save(`Comparacao_Hashes_${data.id}.pdf`);
}

export function exportHashComparisonTXT(data: HashComparisonReportData): string {
  let conclusion = '';
  if (data.mode === 'CRIPTOGRAFICA') {
    if (data.resultStatus === 'IDENTICOS') {
      conclusion =
        'Os valores de hash informados apresentaram correspondência textual após a normalização permitida para a representação hexadecimal.';
    } else if (data.resultStatus === 'DIFERENTES') {
      conclusion = 'Os valores de hash informados apresentaram divergência na comparação realizada.';
    } else {
      conclusion = 'Um ou ambos os códigos informados não representam sequências hexadecimais válidas.';
    }
  } else {
    conclusion =
      'Foi realizada uma comparação textual estrita e literal entre os dois códigos informados. Esta operação é puramente textual e NÃO comprova a validade criptográfica ou a integridade dos arquivos de origem.';
  }

  return `================================================================================
SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM
RELATÓRIO DE COMPARAÇÃO DIRETA DE HASHES
================================================================================
CRÉDITOS DO PROJETO:
  Desenvolvido pelo APF Ramon (ramon.grsl)
  Polícia Federal — XIV Cellebrite — Turma A — 2026
  (Identificação de contexto de formação profissional sem endosso oficial)
================================================================================

IDENTIFICAÇÃO:
  Protocolo Local: ${data.id}
  Data e Hora:    ${data.timestamp} (${data.timezone})
  Modo:           ${data.mode === 'CRIPTOGRAFICA' ? 'Comparação Criptográfica (Hexadecimal / Case-Insensitive)' : 'Comparação de Texto Exato (Literal / Case-Sensitive)'}
  Provável Algo:  ${data.algorithm || 'Não determinado'}

CÓDIGOS COMPARADOS:
  Hash 1: ${data.code1} (comprimento: ${data.length1})
  Hash 2: ${data.code2} (comprimento: ${data.length2})

MÉTRICAS DA COMPARAÇÃO:
  Posições Divergentes: ${data.divergentCount}
  1ª Posição Divergente: ${data.firstDivergenceIndex || 'Nenhuma'}
  Diferença de Comprimento: ${Math.abs(data.length1 - data.length2)} caracteres

RESULTADO:
  ${data.resultLabel}

CONCLUSÃO:
  ${conclusion}

================================================================================
`;
}

// -----------------------------------------------------------------------------
// FOLDER HASHES EXPORT UTILITIES (RECURSIVE DIRECTORY MANIFEST & PDF REPORT)
// -----------------------------------------------------------------------------

import type { FolderFileItem, HashAlgorithm } from '../types';

export interface FolderHashReportData {
  id: string;
  folderName: string;
  totalFiles: number;
  totalSubfolders: number;
  totalBytes: number;
  formattedTotalBytes: string;
  algorithms: HashAlgorithm[];
  timestamp: string;
  timezone: string;
  examinerName?: string;
  procedureNumber?: string;
  evidenceNumber?: string;
  items: FolderFileItem[];
}

export function exportFolderHashReportPDF(data: FolderHashReportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const drawHeader = (isFirstPage: boolean) => {
    // Top banner
    doc.setFillColor(15, 17, 21);
    doc.rect(margin, y, contentWidth, isFirstPage ? 20 : 12, 'F');

    doc.setFillColor(245, 121, 23);
    doc.rect(margin, y, contentWidth, 1.4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isFirstPage ? 11 : 9);
    doc.text('SAM HASH VERIFY', margin + 5, y + (isFirstPage ? 8 : 7));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(245, 121, 23);
    doc.text('FORENSIC INTEGRITY SYSTEM', margin + 46, y + (isFirstPage ? 8 : 7));

    if (isFirstPage) {
      doc.setTextColor(180, 185, 195);
      doc.setFontSize(7.5);
      doc.text('RELATÓRIO DE GERAÇÃO DE HASHES DE DIRETÓRIO (PASTAS E SUBPASTAS)', margin + 5, y + 14);
    }

    y += isFirstPage ? 25 : 16;
  };

  // Draw Page 1 Header
  drawHeader(true);

  // Metadata block
  doc.setTextColor(20, 24, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INFORMAÇÕES GERAIS DA EXTRAÇÃO / DIRETÓRIO', margin, y);
  y += 3;
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Pasta Analisada:', margin, y);
  doc.setFont('courier', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text(data.folderName, margin + 45, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Identificador / Protocolo:', margin, y);
  doc.setFont('courier', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(data.id, margin + 45, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Data e Fuso Horário:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(`${data.timestamp} (${data.timezone})`, margin + 45, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Total de Arquivos / Volume:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(`${data.totalFiles} arquivo(s) | ${data.totalSubfolders} subpasta(s) | ${data.formattedTotalBytes}`, margin + 45, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Algoritmos Calculados:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 121, 23);
  doc.text(data.algorithms.join(', '), margin + 45, y);

  if (data.examinerName || data.procedureNumber || data.evidenceNumber) {
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 75, 85);
    doc.text('Procedimento / Evidência:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 24, 30);
    const procStr = [
      data.procedureNumber ? `Proc: ${data.procedureNumber}` : null,
      data.evidenceNumber ? `Evid: ${data.evidenceNumber}` : null,
      data.examinerName ? `Perito: ${data.examinerName}` : null,
    ].filter(Boolean).join(' | ');
    doc.text(procStr, margin + 45, y);
  }

  y += 9;

  // Table header function
  const drawTableHeader = () => {
    doc.setFillColor(240, 242, 246);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setDrawColor(210, 215, 222);
    doc.rect(margin, y, contentWidth, 7, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(40, 45, 55);
    doc.text('Nº', margin + 2, y + 4.8);
    doc.text('Caminho Relativo do Arquivo', margin + 10, y + 4.8);
    doc.text('Tamanho', margin + 85, y + 4.8);
    doc.text('Algoritmo / Hash Calculado', margin + 110, y + 4.8);
    doc.text('Situação', margin + contentWidth - 14, y + 4.8);

    y += 7;
  };

  drawTableHeader();

  // Draw items
  const primaryAlgo: HashAlgorithm = data.algorithms[0] || 'SHA-256';

  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx];
    const itemHash = item.hashes[primaryAlgo] || '—';

    // Page overflow check
    if (y > pageHeight - 25) {
      doc.addPage();
      y = 16;
      drawHeader(false);
      drawTableHeader();
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(250, 251, 253);
      doc.rect(margin, y, contentWidth, 6.2, 'F');
    }

    doc.setDrawColor(235, 238, 242);
    doc.line(margin, y + 6.2, margin + contentWidth, y + 6.2);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 85, 95);
    doc.text(String(idx + 1), margin + 2, y + 4.2);

    // Truncate path if too long
    const displayPath = item.relativePath.length > 55
      ? '...' + item.relativePath.slice(-52)
      : item.relativePath;

    doc.setFont('courier', 'normal');
    doc.setTextColor(25, 30, 40);
    doc.text(displayPath, margin + 10, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.text(item.formattedSize || `${item.size} B`, margin + 85, y + 4.2);

    // Hash value
    doc.setFont('courier', 'bold');
    doc.setTextColor(item.status === 'CALCULADO' ? 20 : 150, 25, 30);
    const shortHash = itemHash.length > 36 ? itemHash.substring(0, 34) + '...' : itemHash;
    doc.text(`${primaryAlgo}: ${shortHash}`, margin + 110, y + 4.2);

    // Status
    doc.setFont('helvetica', 'bold');
    if (item.status === 'CALCULADO') {
      doc.setTextColor(22, 101, 52);
    } else if (item.status === 'ERRO') {
      doc.setTextColor(185, 28, 28);
    } else {
      doc.setTextColor(133, 77, 14);
    }
    doc.text(item.status, margin + contentWidth - 14, y + 4.2);

    y += 6.2;
  }

  // Check if room for conclusion, else add page
  if (y > pageHeight - 45) {
    doc.addPage();
    y = 16;
    drawHeader(false);
  }

  y += 6;

  // Technical Conclusion
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 24, 30);
  doc.text('CONCLUSÃO TÉCNICA PADRONIZADA', margin, y);
  y += 4;

  const hasIncomplete = data.items.some((i) => i.status !== 'CALCULADO');
  let conclusion =
    'Foram calculados os hashes criptográficos individuais dos arquivos acessíveis na pasta selecionada e em suas subpastas, utilizando os algoritmos indicados neste relatório. Os resultados documentam os valores obtidos no momento do processamento, sem constituir, isoladamente, comprovação de autenticidade ou de cadeia de custódia.';

  if (hasIncomplete) {
    conclusion +=
      ' ATENÇÃO: Houve arquivos com erro de leitura ou cancelamento durante o cálculo, indicando incompletude no inventário hash da pasta.';
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 65, 75);
  const splitConclusion = doc.splitTextToSize(conclusion, contentWidth);
  doc.text(splitConclusion, margin, y);
  y += splitConclusion.length * 3.8 + 6;

  // Footer Credits & Page Numbers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footY = pageHeight - 10;
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, footY - 2, margin + contentWidth, footY - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 85, 95);
    doc.text('SAM HASH VERIFY — Forensic Integrity System', margin, footY + 2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 125, 135);
    doc.text('Desenvolvido pelo APF Ramon (ramon.grsl) | Polícia Federal — XIV Cellebrite — Turma A — 2026', margin, footY + 5.5);

    doc.text(`Página ${p} de ${totalPages}`, margin + contentWidth - 18, footY + 2);
  }

  doc.save(`Relatorio_Diretorio_${data.folderName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${data.id}.pdf`);
}

/**
 * Export Folder Manifest as deterministic CSV, TXT or JSON
 */
export function exportFolderManifestCSV(data: FolderHashReportData): string {
  const header = ['Sequencial', 'Caminho_Relativo', 'Nome_Arquivo', 'Extensao', 'Tamanho_Bytes', 'Algoritmo', 'Hash_Calculado', 'Situacao'];
  const primaryAlgo: HashAlgorithm = data.algorithms[0] || 'SHA-256';

  const rows = data.items.map((item, idx) => [
    idx + 1,
    `"${item.relativePath.replace(/"/g, '""')}"`,
    `"${item.fileName.replace(/"/g, '""')}"`,
    `"${item.extension}"`,
    item.size,
    primaryAlgo,
    `"${(item.hashes[primaryAlgo] || '').replace(/"/g, '""')}"`,
    item.status,
  ]);

  return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

export function exportFolderManifestTXT(data: FolderHashReportData): string {
  const primaryAlgo: HashAlgorithm = data.algorithms[0] || 'SHA-256';
  let txt = `================================================================================\n`;
  txt += `SAM HASH VERIFY — FORENSIC INTEGRITY SYSTEM\n`;
  txt += `MANIFESTO DE INTEGRIDADE DE DIRETÓRIO (PASTAS E SUBPASTAS)\n`;
  txt += `Pasta Raiz: ${data.folderName}\n`;
  txt += `Data/Hora:  ${data.timestamp} (${data.timezone})\n`;
  txt += `Total de Arquivos: ${data.totalFiles} (${data.formattedTotalBytes})\n`;
  txt += `Subpastas: ${data.totalSubfolders}\n`;
  txt += `Algoritmo Padronizado: ${primaryAlgo}\n`;
  txt += `Desenvolvido pelo APF Ramon (ramon.grsl) | Polícia Federal — XIV Cellebrite — Turma A — 2026\n`;
  txt += `================================================================================\n\n`;

  // Standard GNU coreutils format: HASH  *PATH
  data.items.forEach((item) => {
    const hash = item.hashes[primaryAlgo] || 'ERRO_NAO_CALCULADO';
    txt += `${hash}  *${item.relativePath}\n`;
  });

  return txt;
}

export function exportFolderManifestJSON(data: FolderHashReportData): string {
  const payload = {
    system: 'SAM HASH VERIFY — Forensic Integrity System',
    version: '1.0',
    exportType: 'DIRECTORY_INTEGRITY_MANIFEST',
    id: data.id,
    timestamp: data.timestamp,
    timezone: data.timezone,
    rootFolder: data.folderName,
    totalFiles: data.totalFiles,
    totalSubfolders: data.totalSubfolders,
    totalBytes: data.totalBytes,
    formattedTotalBytes: data.formattedTotalBytes,
    algorithms: data.algorithms,
    examiner: data.examinerName || null,
    procedure: data.procedureNumber || null,
    evidence: data.evidenceNumber || null,
    credits: {
      developer: 'APF Ramon (ramon.grsl)',
      class: 'Polícia Federal — XIV Cellebrite — Turma A — 2026',
    },
    files: data.items.map((item, idx) => ({
      sequence: idx + 1,
      relativePath: item.relativePath,
      fileName: item.fileName,
      extension: item.extension,
      sizeBytes: item.size,
      hashes: item.hashes,
      status: item.status,
      errorMessage: item.errorMessage || null,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

// -----------------------------------------------------------------------------
// TEST DOCUMENT GENERATION FOR SETTINGS & PREVIEW
// -----------------------------------------------------------------------------

import { getAppConfiguration } from './config';
import { auditLogger } from './auditLogger';

export function generateTestDocumentPDF(customConfig?: ReturnType<typeof getAppConfiguration>): void {
  const config = customConfig || getAppConfiguration();
  const header = config.documents.header;
  const footer = config.documents.footer;
  const formatting = config.documents.formatting;

  const doc = new jsPDF({
    orientation: formatting.orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = formatting.marginsMm || 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Hex color parser
  const hex = formatting.titleAccentColor || '#F57917';
  const r = parseInt(hex.slice(1, 3), 16) || 245;
  const g = parseInt(hex.slice(3, 5), 16) || 121;
  const b = parseInt(hex.slice(5, 7), 16) || 23;

  // Header Bar
  doc.setFillColor(15, 17, 21);
  doc.rect(margin, y, contentWidth, 24, 'F');

  // Accent Line
  doc.setFillColor(r, g, b);
  doc.rect(margin, y, contentWidth, 1.8, 'F');

  // Header Logo or Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(header.title || 'SAM HASH VERIFY', margin + 6, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  doc.text(header.subtitle || 'FORENSIC INTEGRITY SYSTEM', margin + 58, y + 10);

  doc.setTextColor(180, 185, 195);
  doc.setFontSize(8);
  doc.text(header.description || 'Sistema de Geração e Validação de Integridade Digital', margin + 6, y + 17);

  // Institutional Info if enabled
  if (header.showInstitutionalFields && (header.institutionName || header.sectorName)) {
    doc.setFontSize(7.5);
    doc.setTextColor(220, 225, 235);
    const instText = [header.institutionName, header.sectorName].filter(Boolean).join(' • ');
    doc.text(instText, margin + contentWidth - 6, y + 17, { align: 'right' });
  }

  y += 32;

  // Watermark Warning of Test Document
  doc.setFillColor(254, 243, 199); // Yellow 100
  doc.setDrawColor(217, 119, 6); // Amber 600
  doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(146, 64, 14); // Amber 800
  doc.text(
    '*** DOCUMENTO DE TESTE FORENSE — DADOS E HASHES FICTÍCIOS PARA VALIDAÇÃO DE LAYOUT ***',
    margin + contentWidth / 2,
    y + 6.5,
    { align: 'center' }
  );

  y += 16;

  // Title
  doc.setTextColor(20, 24, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RELATÓRIO DE DEMONSTRAÇÃO E CONFERÊNCIA DE FORMATAÇÃO', margin, y);

  y += 4;
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + contentWidth, y);

  y += 6;

  // Fictitious metadata
  const { formatted, tz } = formatForensicDate();
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Protocolo de Teste:', margin, y);
  doc.setFont('courier', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text('TEST-SAMPLE-2026-X99', margin + 45, y);

  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Data / Fuso Horário:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(`${formatted} (${tz})`, margin + 45, y);

  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Procedimento Fictício:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(config.documents.defaultFields.procedureNumber || 'IPL 9999/2026-SR/PF/SP (TESTE)', margin + 45, y);

  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Perito / Responsável:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text(config.documents.defaultFields.examinerName || 'Responsável Técnico Designado', margin + 45, y);

  y += 9;

  // Section File
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(r, g, b);
  doc.text('DADOS DA EVIDÊNCIA SIMULADA', margin, y);
  y += 2.5;
  doc.setDrawColor(240, 242, 245);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5.5;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Arquivo Analisado:', margin, y);
  doc.setFont('courier', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text('extracao_forense_demonstracao.ufdr', margin + 45, y);

  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Tamanho Simulado:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 24, 30);
  doc.text('1.458.920.124 bytes (1.36 GB)', margin + 45, y);

  y += 8;

  // Cryptographic Section with Case formatting check
  const isUpper = config.general.hashCase === 'uppercase';
  const sampleHash = isUpper
    ? 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
    : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(r, g, b);
  doc.text('VERIFICAÇÃO CRIPTOGRÁFICA (SIMULAÇÃO)', margin, y);
  y += 2.5;
  doc.setDrawColor(240, 242, 245);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5.5;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Algoritmo:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 24, 30);
  doc.text(config.general.defaultAlgorithm || 'SHA-256', margin + 45, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 75, 85);
  doc.text('Hash Calculado:', margin, y);
  y += 4.5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 20, 25);
  doc.text(sampleHash, margin + 2, y);

  y += 9;

  // Status Box
  doc.setFillColor(220, 252, 231);
  doc.setDrawColor(22, 163, 74);
  doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(22, 101, 52);
  doc.text('RESULTADO SIMULADO: HASH CORRESPONDENTE (INTEGRIDADE DEMONSTRADA)', margin + 6, y + 7.5);

  y += 17;

  // Standardized Conclusion
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 24, 30);
  doc.text('CONCLUSÃO TÉCNICA PADRONIZADA (MODELO DE TESTE)', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 55, 65);
  const conclusion =
    'Este documento atesta a renderização correta de cabeçalhos, metadados periciais, margens e rodapés configurados no SAM HASH VERIFY. Em casos reais, a correspondência confirma a integridade matemática dos dados.';
  const splitConclusion = doc.splitTextToSize(conclusion, contentWidth);
  doc.text(splitConclusion, margin, y);

  // Footer on page
  const footY = pageHeight - 16;
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, footY - 2, margin + contentWidth, footY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 85, 95);
  doc.text(footer.developerCredit || 'Desenvolvido pelo APF Ramon (ramon.grsl)', margin, footY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110, 115, 125);
  doc.text(footer.trainingContext || 'Polícia Federal — XIV Cellebrite — Turma A — 2026', margin, footY + 6);

  if (footer.showPageNumbers) {
    doc.text('Página 1 de 1', margin + contentWidth - 18, footY + 2.5);
  }

  if (footer.showIssueDate) {
    doc.text(`Emissão: ${formatted}`, margin + contentWidth - 45, footY + 6);
  }

  doc.save('Documento_Teste_Forense_SAM_HASH_VERIFY.pdf');

  auditLogger.addLog({
    operation: 'RELATORIO_GERADO',
    status: 'SUCESSO',
    message: 'Documento de teste forense gerado para validação de layout e margens.',
  });
}



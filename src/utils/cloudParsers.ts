/**
 * SAM HASH VERIFY — Forensic Integrity System
 * Cloud Provider Manifest Parsers: Google (PDF) and Apple (CSV)
 * Incorporates G-Ward and A-Ward forensic specifications
 */

import * as pdfjsLib from 'pdfjs-dist';
import {
  GoogleCloudManifestItem,
  AppleCloudManifestItem,
} from '../types';

// Configure PDF.js worker in browser environment
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  } catch (err) {
    console.warn('PDF.js worker initialization notice:', err);
  }
}

export interface GooglePdfParsedResult {
  procedureNumber?: string;
  internalReference?: string;
  declaredDate?: string;
  sourceFileName: string;
  pageCount: number;
  items: GoogleCloudManifestItem[];
  rawTextSample: string;
  warnings?: string[];
  unparsedLines?: string[];
  linesCount?: number;
}

export interface AppleCsvParsedResult {
  caseNumber?: string;
  sourceFileName: string;
  rowCount: number;
  items: AppleCloudManifestItem[];
  detectedColumns: string[];
  warnings?: string[];
}

/**
 * Extracts account identifier from Google production filename.
 * Rule from G-Ward:
 * - Everything before the first numeric token: <email>.<id_da_conta>.<Produto>...
 * - If Waze: <email>.Waze.pdf, until TLD.
 * - CRITICAL: Never merge accounts by dots! Google honors literal requested identifiers.
 */
export function extractGoogleAccount(fileName: string): string {
  const cleanName = fileName.replace(/:+$/, '').trim();

  // 1. Check for email pattern with @ symbol
  if (cleanName.includes('@')) {
    const emailPartsMatch = cleanName.match(/^([a-zA-Z0-9._%+\-]+)@([a-zA-Z0-9.\-_]+)/);
    if (emailPartsMatch) {
      const user = emailPartsMatch[1];
      const rest = emailPartsMatch[2]; // e.g. 'gmail.com.169852118102.GooglePay...'
      const restParts = rest.split('.');
      const domainParts: string[] = [restParts[0]];
      let i = 1;
      while (i < restParts.length) {
        const p = restParts[i];
        // Stop if numeric account ID token (e.g. 169852118102) or capitalized product name (e.g. GooglePay)
        if (/^\d+$/.test(p) || /^[A-Z]/.test(p)) {
          break;
        }
        // Valid TLD labels (e.g. com, br, net, org, co, uk) - all lowercase 2-6 chars
        if (/^[a-z]{2,6}$/.test(p)) {
          domainParts.push(p);
          i++;
        } else {
          break;
        }
      }
      return `${user}@${domainParts.join('.')}`;
    }
  }

  // 2. Non-email account: check for tokenized pattern before numeric account ID or product name
  const parts = cleanName.split('.');
  if (parts.length > 1) {
    const accParts: string[] = [];
    for (const part of parts) {
      // Stop when encountering a numeric ID with 8+ digits or a capitalized product
      if (/^\d{8,}$/.test(part) || /^[A-Z][a-zA-Z0-9]+$/.test(part)) {
        if (accParts.length > 0) break;
      }
      accParts.push(part);
    }
    if (accParts.length > 0) {
      return accParts.join('.');
    }
  }

  // 3. Fallback: split by first numeric sequence if length > 3
  const fallbackMatch = cleanName.match(/^([^\d]+)/);
  if (fallbackMatch && fallbackMatch[1].length > 3) {
    return fallbackMatch[1].replace(/\.+$/, '');
  }

  return 'CONTA_PADRAO';
}

/**
 * Parses Google PDF "Valores de Hash dos Arquivos Produzidos"
 * Implements coordinate sorting and multi-line reconstruction for names & 128-hex SHA-512.
 */
export async function parseGoogleHashPdf(
  input: File | ArrayBuffer,
  fileName: string
): Promise<GooglePdfParsedResult> {
  const arrayBuffer =
    input instanceof File ? await input.arrayBuffer() : input;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  let procedureNumber: string | undefined;
  let internalReference: string | undefined;
  let declaredDate: string | undefined;
  const allLines: string[] = [];
  const warnings: string[] = [];
  let rawTextSample = '';

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.filter(
      (it) => 'str' in it && (it as { str: string }).str.trim().length > 0
    ) as Array<{ str: string; transform: number[]; width?: number }>;

    // Sort items by Y descending (top-to-bottom on page), then X ascending (left-to-right)
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    // Group items into visual lines with 4px vertical tolerance
    const pageLines: string[] = [];
    let currentLine: typeof items = [];
    let curY: number | null = null;

    for (const it of items) {
      if (curY === null || Math.abs(it.transform[5] - curY) > 4) {
        if (currentLine.length > 0) {
          pageLines.push(currentLine.map((x) => x.str).join('').trim());
        }
        currentLine = [it];
        curY = it.transform[5];
      } else {
        currentLine.push(it);
      }
    }
    if (currentLine.length > 0) {
      pageLines.push(currentLine.map((x) => x.str).join('').trim());
    }

    if (pageNum === 1 && rawTextSample.length === 0) {
      rawTextSample = pageLines.slice(0, 15).join('\n');
    }

    // Process and filter lines on this page
    for (const line of pageLines) {
      // Extract metadata if present
      const autosMatch = line.match(/Autos\s*n\.?\s*:?\s*([0-9.\-\/]+)/i);
      if (autosMatch && !procedureNumber) {
        procedureNumber = autosMatch[1].trim();
      }
      const refMatch = line.match(/Ref\.?\s*Interna\s*:?\s*(\d+)/i);
      if (refMatch && !internalReference) {
        internalReference = refMatch[1].trim();
      }
      const dateMatch =
        line.match(/Mountain\s+View,\s*(\d{2}\/\d{2}\/\d{4})/i) ||
        line.match(/(\d{2}\/\d{2}\/\d{4})\s*\(MM\/DD\/AAAA\)/i);
      if (dateMatch && !declaredDate) {
        declaredDate = dateMatch[1].trim();
      }

      // Discard header / footer noise lines per page cleanly
      const isHeaderFooter =
        /www\.google\.com|Google LLC|1600 Amphitheatre|Mountain View|94043|Valores de Hash|Autos n\.|Ref\. Interna|\(MM\/DD\/AAAA\)|P[áa]gina\s+\d+|Page\s+\d+|CONFIDENCIAL/i.test(
          line
        );

      if (!isHeaderFooter && line.length > 0) {
        allLines.push(line);
      }
    }
  }

  // Token state machine to capture multi-line filenames and SHA-512 hashes
  const items: GoogleCloudManifestItem[] = [];
  const unparsedLines: string[] = [];
  let pendingFileName = '';
  let pendingHash = '';
  let inHash = false;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    const shaMatch = line.match(/SHA-?512[-:]?/i);

    if (shaMatch && shaMatch.index !== undefined) {
      inHash = true;
      const beforeSha = line.slice(0, shaMatch.index).trim();
      if (beforeSha.length > 0) {
        pendingFileName += (pendingFileName ? '' : '') + beforeSha;
      }
      const afterSha = line.slice(shaMatch.index + shaMatch[0].length).trim();
      pendingHash += afterSha.replace(/[^0-9a-fA-F]/g, '');
      continue;
    }

    if (inHash) {
      const hexOnly = line.replace(/[^0-9a-fA-F]/g, '');
      // If line is predominantly hex characters
      if (
        hexOnly.length >= 20 &&
        !line.includes('.zip') &&
        !line.includes('.pdf') &&
        !line.includes('@')
      ) {
        pendingHash += hexOnly;
        if (pendingHash.length >= 128) {
          const finalName = pendingFileName.trim().replace(/:+$/, '').trim();
          const finalHash = pendingHash.slice(0, 128).toLowerCase();
          const account = extractGoogleAccount(finalName);

          items.push({
            id: `google-${items.length + 1}-${finalName}`,
            fileName: finalName,
            account,
            algorithm: 'SHA-512',
            declaredHash: finalHash,
            sourcePdfName: fileName,
          });

          pendingFileName = '';
          pendingHash = '';
          inHash = false;
        }
      } else {
        // Line doesn't look like pure hex; if we already had a full hash, close it
        if (pendingHash.length >= 128) {
          const finalName = pendingFileName.trim().replace(/:+$/, '').trim();
          const finalHash = pendingHash.slice(0, 128).toLowerCase();
          const account = extractGoogleAccount(finalName);

          items.push({
            id: `google-${items.length + 1}-${finalName}`,
            fileName: finalName,
            account,
            algorithm: 'SHA-512',
            declaredHash: finalHash,
            sourcePdfName: fileName,
          });

          pendingFileName = '';
          pendingHash = '';
          inHash = false;
        } else if (pendingHash.length > 0 && pendingHash.length < 128) {
          warnings.push(
            `Hash truncado detectado para '${pendingFileName}': ${pendingHash.length} de 128 caracteres.`
          );
        }

        // Start accumulating new filename line
        pendingFileName += line;
      }
    } else {
      pendingFileName += line;
    }
  }

  // Handle final pending item if any
  if (pendingFileName && pendingHash.length >= 128) {
    const finalName = pendingFileName.trim().replace(/:+$/, '').trim();
    const finalHash = pendingHash.slice(0, 128).toLowerCase();
    const account = extractGoogleAccount(finalName);

    items.push({
      id: `google-${items.length + 1}-${finalName}`,
      fileName: finalName,
      account,
      algorithm: 'SHA-512',
      declaredHash: finalHash,
      sourcePdfName: fileName,
    });
  } else if (pendingFileName.length > 0) {
    unparsedLines.push(pendingFileName);
  }

  if (items.length === 0) {
    warnings.push(
      `Nenhum par [Arquivo: SHA512-[Hash]] localizado em ${numPages} página(s). Verifique se o PDF importado corresponde ao documento oficial do Google ('Valores de Hash dos Arquivos Produzidos').`
    );
  }

  return {
    procedureNumber,
    internalReference,
    declaredDate,
    sourceFileName: fileName,
    pageCount: numPages,
    items,
    rawTextSample,
    warnings: warnings.length > 0 ? warnings : undefined,
    unparsedLines: unparsedLines.length > 0 ? unparsedLines : undefined,
    linesCount: allLines.length,
  };
}

/**
 * Parses RFC 4180 CSV rows handling quoted text and multiline entries.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Sanitizes Apple CSV text handling lines wrapped in outer quotes with escaped inner quotes.
 */
export function sanitizeAppleCsvText(input: string): string {
  let clean = input;
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1);
  }
  const lines = clean.split(/\r?\n/);
  const unescapedLines = lines.map((line) => {
    let trimmed = line.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.includes(',""')) {
      trimmed = trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  });
  return unescapedLines.join('\n');
}

/**
 * Parses Apple CSV manifest (account-download-details.csv).
 * Supports UTF-8 with BOM (utf-8-sig), outer quotes, and extra unexpected columns.
 */
export function parseAppleManifestCsv(
  csvText: string,
  fileName: string
): AppleCsvParsedResult {
  const sanitizedCsv = sanitizeAppleCsvText(csvText);

  // Extract case number if present in filename: <caso>_<data>-account-download-details.csv
  let caseNumber: string | undefined;
  const caseMatch =
    fileName.match(/^(\d{6,})_(\d{14})-account-download-details\.csv$/i) ||
    fileName.match(/^(\d{6,})/);
  if (caseMatch) {
    caseNumber = caseMatch[1];
  }

  const rows = parseCsvRows(sanitizedCsv);
  if (rows.length < 2) {
    return {
      caseNumber,
      sourceFileName: fileName,
      rowCount: 0,
      items: [],
      detectedColumns: [],
      warnings: ['Arquivo CSV vazio ou com estrutura insuficiente de cabeçalhos.'],
    };
  }

  // Header row analysis
  const header = rows[0].map((col) => col.trim().replace(/^"|"$/g, ''));
  const colIndexMap = new Map<string, number>();

  header.forEach((col, idx) => {
    colIndexMap.set(col.toLowerCase(), idx);
  });

  const getColVal = (row: string[], colName: string): string => {
    const idx = colIndexMap.get(colName.toLowerCase());
    if (idx !== undefined && idx < row.length) {
      return row[idx].trim().replace(/^"|"$/g, '');
    }
    return '';
  };

  const items: AppleCloudManifestItem[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const fileNameVal = getColVal(row, 'File_Name');

    if (!fileNameVal) continue;

    const dataType = getColVal(row, 'Data_Type') || 'Dados de Conta';
    const fileLink = getColVal(row, 'File_Link');
    const fileType = getColVal(row, 'File_Type');
    const gpgSize = getColVal(row, 'GPG_Size');
    const gpgSha256 = getColVal(row, 'GPG_SHA256').toLowerCase();
    const gpgSha512 = getColVal(row, 'GPG_SHA512').toLowerCase();
    const clearTextSha256 = getColVal(row, 'CLEAR_TEXT_SHA256').toLowerCase();
    const clearTextSha512 = getColVal(row, 'CLEAR_TEXT_SHA512').toLowerCase();
    const expiryDate = getColVal(row, 'Link Expiry Date');

    // Extract Account ID: token before first hyphen in File_Name (e.g., 2228147-ACCOUNT-38171392.zip.gpg)
    const accountId = fileNameVal.split('-')[0] || 'CONTA_DESCONHECIDA';

    items.push({
      id: `apple-${i}-${fileNameVal}`,
      dataType,
      fileName: fileNameVal,
      accountId,
      fileLink,
      fileType,
      gpgSize,
      gpgSha256: gpgSha256 || undefined,
      gpgSha512: gpgSha512 || undefined,
      clearTextSha256: clearTextSha256 || undefined,
      clearTextSha512: clearTextSha512 || undefined,
      expiryDate,
      sourceCsvName: fileName,
    });
  }

  if (items.length === 0) {
    warnings.push('Nenhum registro de arquivo foi identificado na coluna File_Name.');
  }

  return {
    caseNumber,
    sourceFileName: fileName,
    rowCount: items.length,
    items,
    detectedColumns: header,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export interface GoogleManifestMergeResult {
  items: GoogleCloudManifestItem[];
  procedureNumber?: string;
  internalReference?: string;
  declaredDate?: string;
  sourceFiles: string[];
  duplicateCount: number;
  conflicts: Array<{
    fileName: string;
    hashes: Array<{ sourcePdf: string; hash: string }>;
  }>;
}

/**
 * Combines multiple Google Hash PDF results into a unified manifest.
 * Used when Google partitions a large case into multiple documents ([1] to [4]).
 * Identifies duplicate files and flags conflicting hashes.
 */
export function mergeGoogleManifests(
  results: GooglePdfParsedResult[]
): GoogleManifestMergeResult {
  const itemMap = new Map<string, GoogleCloudManifestItem>();
  const allOccurrences = new Map<string, Array<{ sourcePdf: string; hash: string }>>();
  let procedureNumber: string | undefined;
  let internalReference: string | undefined;
  let declaredDate: string | undefined;
  const sourceFiles: string[] = [];
  let duplicateCount = 0;

  for (const res of results) {
    sourceFiles.push(res.sourceFileName);
    if (!procedureNumber && res.procedureNumber) procedureNumber = res.procedureNumber;
    if (!internalReference && res.internalReference) internalReference = res.internalReference;
    if (!declaredDate && res.declaredDate) declaredDate = res.declaredDate;

    for (const item of res.items) {
      const existing = allOccurrences.get(item.fileName) || [];
      existing.push({ sourcePdf: res.sourceFileName, hash: item.declaredHash });
      allOccurrences.set(item.fileName, existing);

      if (!itemMap.has(item.fileName)) {
        itemMap.set(item.fileName, item);
      } else {
        duplicateCount++;
      }
    }
  }

  // Detect conflicts (same filename with different hashes across PDFs)
  const conflicts: Array<{ fileName: string; hashes: Array<{ sourcePdf: string; hash: string }> }> = [];
  for (const [fName, occurrences] of allOccurrences.entries()) {
    const uniqueHashes = new Set(occurrences.map((o) => o.hash.toLowerCase()));
    if (uniqueHashes.size > 1) {
      conflicts.push({ fileName: fName, hashes: occurrences });
    }
  }

  return {
    items: Array.from(itemMap.values()),
    procedureNumber,
    internalReference,
    declaredDate,
    sourceFiles,
    duplicateCount,
    conflicts,
  };
}

export interface ForensicConclusionResult {
  type: 'conclusive_success' | 'divergent' | 'incomplete' | 'extras_only' | 'inconclusive';
  title: string;
  message: string;
  badgeLabel: string;
  badgeClass: string;
}

/**
 * Calculates strict, unambiguous forensic conclusion for cloud validation sessions.
 * Never outputs false positive "todos os arquivos são íntegros" when 0 files were validated.
 */
export function getForensicConclusion(
  summary: {
    totalExpected: number;
    totalDelivered: number;
    totalIntegro: number;
    totalAlterado: number;
    totalAusente: number;
    totalExtra: number;
  },
  provider: 'GOOGLE' | 'APPLE'
): ForensicConclusionResult {
  const providerLabel = provider === 'GOOGLE' ? 'Google LLC' : 'Apple Inc.';
  const { totalExpected, totalDelivered, totalIntegro, totalAlterado, totalAusente, totalExtra } = summary;

  // 1. Inconclusive: files were delivered and items expected, but ZERO files were validated as intact
  if (totalDelivered > 0 && totalIntegro === 0 && totalAlterado === 0) {
    return {
      type: 'inconclusive',
      title: 'CONFERÊNCIA NÃO CONCLUSIVA',
      message: `Foram identificados ${totalExpected} registros no manifesto e ${totalDelivered} arquivos selecionados, porém nenhum arquivo foi associado e validado com sucesso. Verifique a correspondência dos nomes e extensões antes de concluir a análise.`,
      badgeLabel: 'NÃO CONCLUSIVA (0 VALIDADOS)',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    };
  }

  // 2. Cryptographic divergence
  if (totalAlterado > 0) {
    return {
      type: 'divergent',
      title: 'DIVERGÊNCIA CRIPTOGRÁFICA DETECTADA',
      message: `${totalAlterado} arquivo(s) apresentam hash divergente do declarado pela nuvem (${providerLabel}). Os arquivos recebidos encontram-se corrompidos ou sofreram modificação posterior à produção judicial.`,
      badgeLabel: 'DIVERGÊNCIA CRÍTICA DE HASH',
      badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    };
  }

  // 3. Partial delivery (verified files are intact, but some declared are missing)
  if (totalAusente > 0) {
    return {
      type: 'incomplete',
      title: 'CONFERÊNCIA PARCIAL (RESSALVA)',
      message: `${totalIntegro} de ${totalExpected} arquivo(s) declarados foram verificados e são ÍNTEGROS. Contudo, ${totalAusente} arquivo(s) declarados NÃO foram fornecidos nesta seleção pericial.`,
      badgeLabel: 'ENTREGA PARCIAL (COM AUSÊNCIAS)',
      badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    };
  }

  // 4. Extras only (all declared are intact, but extra files exist in selection)
  if (totalExtra > 0) {
    return {
      type: 'extras_only',
      title: 'CONFERÊNCIA COM ARQUIVOS ADICIONAIS',
      message: `Todos os ${totalIntegro} arquivos declarados foram conferidos e são ÍNTEGROS, contudo constam ${totalExtra} arquivo(s) adicionais presentes na mídia que não constam no documento oficial do provedor.`,
      badgeLabel: 'CONFORME COM EXTRAS',
      badgeClass: 'bg-purple-950/40 text-purple-300 border-purple-800',
    };
  }

  // 5. 100% Conclusive & Intact
  return {
    type: 'conclusive_success',
    title: '100% ÍNTEGRO',
    message: `Todos os ${totalIntegro} arquivos entregues coincidem perfeitamente com os hashes declarados pelo provedor judicial (${providerLabel}).`,
    badgeLabel: '100% ÍNTEGRO E CONFORME',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
  };
}

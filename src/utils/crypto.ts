/**
 * HASH VERIFY — Cryptographic Engine
 * Incremental chunked hashing using WebAssembly (hash-wasm)
 * 100% Client-side, zero server transmission, low memory overhead
 */

import {
  createMD5,
  createSHA1,
  createSHA256,
  createSHA512,
  type IHasher,
} from 'hash-wasm';
import { HashAlgorithm, FileMetadata, CryptoVectorTest } from '../types';

export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per slice for optimal throughput & responsive UI

/**
 * Format bytes into human-readable string with exact forensic precision
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(2)} ${units[i]} (${bytes.toLocaleString('pt-BR')} bytes)`;
}

export function formatShortBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(2)} ${units[i]}`;
}

/**
 * Extract metadata from a File object
 */
export function extractFileMetadata(file: File, relativePath?: string): FileMetadata {
  return {
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
    formattedSize: formatBytes(file.size),
    relativePath: relativePath || (file as { webkitRelativePath?: string }).webkitRelativePath || file.name,
  };
}

/**
 * Detect probable hash algorithm from a hash string based on hexadecimal format and length
 */
export function detectProbableAlgorithm(
  hashString: string
): { algorithm: HashAlgorithm | null; isValidHex: boolean; message: string } {
  const trimmed = hashString.trim();
  if (!trimmed) {
    return { algorithm: null, isValidHex: false, message: 'Nenhum valor informado' };
  }

  const isHex = /^[0-9a-fA-F]+$/.test(trimmed);
  if (!isHex) {
    return {
      algorithm: null,
      isValidHex: false,
      message: 'Contém caracteres inválidos (não hexadecimais)',
    };
  }

  const length = trimmed.length;
  switch (length) {
    case 32:
      return { algorithm: 'MD5', isValidHex: true, message: '32 caracteres hexadecimais (provável MD5)' };
    case 40:
      return { algorithm: 'SHA-1', isValidHex: true, message: '40 caracteres hexadecimais (provável SHA-1)' };
    case 64:
      return { algorithm: 'SHA-256', isValidHex: true, message: '64 caracteres hexadecimais (provável SHA-256)' };
    case 128:
      return { algorithm: 'SHA-512', isValidHex: true, message: '128 caracteres hexadecimais (provável SHA-512)' };
    default:
      return {
        algorithm: null,
        isValidHex: true,
        message: `Comprimento incomum (${length} caracteres hexadecimais). Selecione o algoritmo manualmente.`,
      };
  }
}

/**
 * Factory for hasher instances based on requested algorithm
 */
async function getHasher(algorithm: HashAlgorithm): Promise<IHasher> {
  switch (algorithm) {
    case 'MD5':
      return createMD5();
    case 'SHA-1':
      return createSHA1();
    case 'SHA-256':
      return createSHA256();
    case 'SHA-512':
      return createSHA512();
  }
}

/**
 * Compute multiple hashes in a single pass over the file using incremental chunking.
 * Avoids loading the full file into memory and calculates all selected algorithms concurrently.
 */
export async function computeHashes(
  file: File,
  algorithms: HashAlgorithm[],
  onProgress?: (progress: number, bytesProcessed: number, totalBytes: number) => void,
  abortSignal?: AbortSignal
): Promise<Record<HashAlgorithm, string>> {
  if (algorithms.length === 0) {
    throw new Error('Nenhum algoritmo selecionado para cálculo.');
  }

  // Initialize all requested hashers
  const hashers = await Promise.all(
    algorithms.map(async (algo) => ({
      algo,
      instance: await getHasher(algo),
    }))
  );

  for (const h of hashers) {
    h.instance.init();
  }

  const totalSize = file.size;

  // Handle empty file edge case (0 bytes)
  if (totalSize === 0) {
    if (abortSignal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError');
    }
    const results: Partial<Record<HashAlgorithm, string>> = {};
    for (const h of hashers) {
      results[h.algo] = h.instance.digest('hex');
    }
    if (onProgress) onProgress(100, 0, 0);
    return results as Record<HashAlgorithm, string>;
  }

  let offset = 0;
  while (offset < totalSize) {
    if (abortSignal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError');
    }

    const chunkBlob = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunkBlob.arrayBuffer();
    const uint8View = new Uint8Array(buffer);

    for (const h of hashers) {
      h.instance.update(uint8View);
    }

    offset += buffer.byteLength;
    if (onProgress) {
      const percent = Math.min(100, Math.round((offset / totalSize) * 100));
      onProgress(percent, offset, totalSize);
    }

    // Yield control momentarily so the UI thread stays snappy during huge file reads
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const results: Partial<Record<HashAlgorithm, string>> = {};
  for (const h of hashers) {
    results[h.algo] = h.instance.digest('hex').toLowerCase();
  }

  return results as Record<HashAlgorithm, string>;
}

/**
 * Compare two hash strings safely.
 * Normalizes only safe whitespace and casing, never alters internal characters.
 */
export function compareHashes(
  referenceHash: string,
  calculatedHash: string
): { isMatch: boolean; normalizedRef: string; normalizedCalc: string } {
  const normalizedRef = referenceHash.trim().toLowerCase();
  const normalizedCalc = calculatedHash.trim().toLowerCase();

  return {
    isMatch: normalizedRef === normalizedCalc && normalizedRef.length > 0,
    normalizedRef,
    normalizedCalc,
  };
}

/**
 * Generate a local unique verification ID
 */
export function generateLocalVerificationId(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `HV-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Parse hash manifests from common forensic / coreutils / CSV / TXT formats
 * Examples accepted:
 * - SHA256,ARQUIVO
 * - 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8,extracao.ufdr
 * - 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8 *extracao.ufdr
 * - 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8  extracao.ufdr
 * - MD5 (file.txt) = 93b885adfe0da089cdf634904fd59f71 (BSD style)
 */
export interface ParsedManifestEntry {
  fileName: string;
  expectedHash: string;
  algorithm: HashAlgorithm;
  rawLine: string;
}

export function parseHashManifest(content: string): ParsedManifestEntry[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: ParsedManifestEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue; // Skip comments
    }

    // Check BSD style: MD5 (filename.ext) = hash
    const bsdMatch = trimmed.match(/^(MD5|SHA1|SHA256|SHA512)\s*\((.+)\)\s*=\s*([a-fA-F0-9]+)$/i);
    if (bsdMatch) {
      let algo: HashAlgorithm = 'SHA-256';
      const algoStr = bsdMatch[1].toUpperCase();
      if (algoStr === 'MD5') algo = 'MD5';
      else if (algoStr === 'SHA1' || algoStr === 'SHA-1') algo = 'SHA-1';
      else if (algoStr === 'SHA512' || algoStr === 'SHA-512') algo = 'SHA-512';
      entries.push({
        algorithm: algo,
        fileName: bsdMatch[2].trim(),
        expectedHash: bsdMatch[3].trim().toLowerCase(),
        rawLine: line,
      });
      continue;
    }

    // Check CSV: hash,filename or filename,hash or ALGORITHM,filename,hash
    if (trimmed.includes(',') || trimmed.includes(';')) {
      const sep = trimmed.includes(';') ? ';' : ',';
      const parts = trimmed.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2) {
        // Skip header lines like "SHA256,ARQUIVO"
        const upper0 = parts[0].toUpperCase();
        const upper1 = parts[1].toUpperCase();
        if (
          upper0 === 'HASH' ||
          upper0 === 'ALGORITMO' ||
          upper0 === 'ARQUIVO' ||
          upper0 === 'FILENAME' ||
          upper1 === 'ARQUIVO' ||
          upper1 === 'FILENAME'
        ) {
          continue;
        }

        // Determine which part is the hash
        const part0Detection = detectProbableAlgorithm(parts[0]);
        const part1Detection = detectProbableAlgorithm(parts[1]);

        if (part0Detection.isValidHex && part0Detection.algorithm) {
          entries.push({
            fileName: parts[1],
            expectedHash: parts[0].toLowerCase(),
            algorithm: part0Detection.algorithm,
            rawLine: line,
          });
          continue;
        } else if (part1Detection.isValidHex && part1Detection.algorithm) {
          entries.push({
            fileName: parts[0],
            expectedHash: parts[1].toLowerCase(),
            algorithm: part1Detection.algorithm,
            rawLine: line,
          });
          continue;
        } else if (parts.length >= 3) {
          // Check 3 parts: ALGO, FILENAME, HASH
          const part2Detection = detectProbableAlgorithm(parts[2]);
          if (part2Detection.isValidHex && part2Detection.algorithm) {
            entries.push({
              fileName: parts[1],
              expectedHash: parts[2].toLowerCase(),
              algorithm: part2Detection.algorithm,
              rawLine: line,
            });
            continue;
          }
        }
      }
    }

    // Standard GNU coreutils style: HASH  *FILENAME or HASH  FILENAME
    const gnuMatch = trimmed.match(/^([a-fA-F0-9]{32,128})\s+[\*]?(.+)$/);
    if (gnuMatch) {
      const hash = gnuMatch[1];
      const filename = gnuMatch[2].trim();
      const detection = detectProbableAlgorithm(hash);
      entries.push({
        fileName: filename,
        expectedHash: hash.toLowerCase(),
        algorithm: detection.algorithm || 'SHA-256',
        rawLine: line,
      });
      continue;
    }
  }

  return entries;
}

/**
 * Standard NIST / RFC Cryptographic Test Vectors for verification testing
 */
export const OFFICIAL_CRYPTO_TEST_VECTORS: CryptoVectorTest[] = [
  {
    id: 'empty',
    name: 'Arquivo Vazio (0 bytes)',
    description: 'Vetor base obrigatório para validação de entrada sem bytes.',
    input: '',
    expected: {
      MD5: 'd41d8cd98f00b204e9800998ecf8427e',
      'SHA-1': 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      'SHA-256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'SHA-512':
        'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
    },
  },
  {
    id: 'fox',
    name: 'The quick brown fox jumps over the lazy dog',
    description: 'Vetor clássico de teste de hash RFC / NIST (texto ASCII puro).',
    input: 'The quick brown fox jumps over the lazy dog',
    expected: {
      MD5: '9e107d9d372bb6826bd81d3542a419d6',
      'SHA-1': '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
      'SHA-256': 'd7a8fbb307d7809469ca9abced000260492a41a25136756540707b223837158c',
      'SHA-512':
        '07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a309d785436bbb642e93a252a954f23912547d1e8a3b5ed6e1bfd7097821233fa0538f3db854fee6',
    },
  },
  {
    id: 'fox_period',
    name: 'The quick brown fox jumps over the lazy dog.',
    description: 'Demonstração de efeito avalanche (alteração de um único ponto).',
    input: 'The quick brown fox jumps over the lazy dog.',
    expected: {
      MD5: 'e4d909c290d0fb1ca068ffaddf22cbd0',
      'SHA-1': '408d94384216f3d085c2c7f872e1b4b85d5bd94c',
      'SHA-256': 'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b761448c85152e23',
      'SHA-512':
        '91ea65163154683a4f061e6becbb81cca47796185ca47687832fb24b6f13e78f4b5c7971242fa1fa1e7d55f63c4f6f630721f241213f986b8614acbe6c799a46',
    },
  },
];

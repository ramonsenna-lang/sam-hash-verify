/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { HomeDashboard } from './components/HomeDashboard';
import { ValidateHashModule } from './components/ValidateHashModule';
import { GenerateHashModule } from './components/GenerateHashModule';
import { BatchValidationModule } from './components/BatchValidationModule';
import { ForensicExtractionModule } from './components/ForensicExtractionModule';
import { ExtractionManifestModule } from './components/ExtractionManifestModule';
import { CloudValidationModule } from './components/CloudValidationModule';
import { FolderHashModule } from './components/FolderHashModule';
import { FileComparisonModule } from './components/FileComparisonModule';
import { ReportsHistoryModule } from './components/ReportsHistoryModule';
import { CryptoTestsModule } from './components/CryptoTestsModule';
import { SettingsModule } from './components/SettingsModule';
import { SingleValidationRecord } from './types';
import { ShieldCheck, Lock, Award } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [sessionRecords, setSessionRecords] = useState<SingleValidationRecord[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Synchronize dark mode class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.backgroundColor = '#08090B';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.backgroundColor = '#F4F5F8';
    }
  }, [isDarkMode]);

  const handleAddSessionRecord = (record: SingleValidationRecord) => {
    setSessionRecords((prev) => [record, ...prev]);
  };

  const handleClearSessionRecords = () => {
    setSessionRecords([]);
  };

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isDarkMode
          ? 'bg-[#08090B] text-zinc-100'
          : 'bg-[#F4F5F8] text-zinc-900'
      }`}
    >
      {/* Top Header Navigation */}
      <HeaderNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sessionRecordCount={sessionRecords.length}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'inicio' && (
          <HomeDashboard
            onNavigate={setActiveTab}
            sessionRecordCount={sessionRecords.length}
          />
        )}

        {activeTab === 'validar' && (
          <ValidateHashModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'gerar' && (
          <GenerateHashModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'pastas' && (
          <FolderHashModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'lote' && (
          <BatchValidationModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'manifesto' && (
          <ExtractionManifestModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'nuvens' && (
          <CloudValidationModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'extracao' && (
          <ForensicExtractionModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'comparar' && (
          <FileComparisonModule onAddSessionRecord={handleAddSessionRecord} />
        )}

        {activeTab === 'relatorios' && (
          <ReportsHistoryModule
            records={sessionRecords}
            onClearRecords={handleClearSessionRecords}
          />
        )}

        {activeTab === 'configuracoes' && (
          <SettingsModule onThemeChange={setIsDarkMode} />
        )}

        {activeTab === 'testes' && (
          <SettingsModule initialSubTab="testes" onThemeChange={setIsDarkMode} />
        )}
      </main>

      {/* Institutional Forensic Footer with Mandatory Project Credits */}
      <footer
        className={`w-full border-t py-6 px-4 text-xs ${
          isDarkMode
            ? 'bg-[#0B0D10] border-[#1C1F26] text-zinc-400'
            : 'bg-white border-zinc-200 text-zinc-600'
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-bold tracking-wider font-mono text-zinc-300">
              SAM HASH <span className="text-[#F57917]">VERIFY</span>
            </span>
            <span className="hidden sm:inline text-zinc-600">|</span>
            <span>Forensic Integrity System</span>
            <span className="hidden sm:inline text-zinc-600">|</span>
            <span className="text-[11px] text-zinc-400">
              Sistema de Geração e Validação de Integridade Digital
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Processamento 100% Local (Navegador)</span>
            </div>
            <span className="text-zinc-600 hidden sm:inline">•</span>
            <span className="text-zinc-500">Sem envio a servidores</span>
          </div>
        </div>

        {/* Mandatory Developer and Training Context Credit Strip */}
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-zinc-800/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-400">
          <div>
            <span>Desenvolvido pelo <strong className="text-zinc-200">APF Ramon (ramon.grsl)</strong></span>
            <span className="mx-2 text-zinc-600">|</span>
            <span>Polícia Federal — XIV Cellebrite — Turma A — 2026</span>
          </div>
          <div className="text-[10px] text-zinc-500">
            Identificação de contexto de formação profissional sem endosso oficial
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-2 text-[10px] text-zinc-600 text-center sm:text-left leading-relaxed">
          Nota Técnica: O SAM HASH VERIFY atesta a conformidade matemática de funções criptográficas de dispersão (MD5, SHA-1, SHA-256, SHA-512)
          sobre arquivos e pacotes forenses processados localmente. Não substitui procedimentos oficiais de cadeia de custódia física, termo de apreensão ou laudo pericial formal.
        </div>
      </footer>
    </div>
  );
}

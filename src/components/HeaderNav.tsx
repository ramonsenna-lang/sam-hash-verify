import React, { useState } from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Layers,
  FileText,
  HardDrive,
  GitCompare,
  Cpu,
  Home,
  Sun,
  Moon,
  Menu,
  X,
  Lock,
  FileCheck2,
  FolderTree,
  Settings,
  Cloud,
} from 'lucide-react';
import { ForensicLogo } from './ForensicLogo';

interface HeaderNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  sessionRecordCount: number;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onTabChange,
  sessionRecordCount,
  isDarkMode,
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'validar', label: 'Validar Hash', icon: ShieldCheck },
    { id: 'gerar', label: 'Gerar Hash', icon: Fingerprint },
    { id: 'pastas', label: 'Hash de Pastas', icon: FolderTree },
    { id: 'lote', label: 'Lote', icon: Layers },
    { id: 'manifesto', label: 'Manifesto', icon: FileCheck2 },
    { id: 'nuvens', label: 'Validação Nuvens', icon: Cloud },
    { id: 'extracao', label: 'Extrações Forenses', icon: HardDrive },
    { id: 'comparar', label: 'Comparar', icon: GitCompare },
    { id: 'relatorios', label: 'Relatórios', icon: FileText, badge: sessionRecordCount > 0 ? sessionRecordCount : undefined },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  const handleItemClick = (id: string) => {
    onTabChange(id);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#08090B]/95 backdrop-blur-md border-b border-[#262930]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => onTabChange('inicio')}
            className="flex items-center cursor-pointer text-left focus:outline-none"
          >
            <ForensicLogo size="sm" showSubtitle={false} />
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#17191D] text-[#F57917] font-semibold border border-[#262930] shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-[#121418]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F57917]' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#F57917] text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Local Badge & Theme Switcher */}
          <div className="flex items-center gap-3">
            {/* Local Security Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#121418] border border-[#262930] text-[11px] font-mono text-emerald-400">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>100% LOCAL</span>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-[#17191D] hover:bg-[#262930] border border-[#262930] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title={isDarkMode ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-300" />}
            </button>

            {/* Mobile Menu Hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-lg bg-[#17191D] border border-[#262930] text-zinc-400 hover:text-white cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-[#262930] bg-[#0F1115] px-4 py-3 space-y-1 animate-fade-in shadow-2xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#17191D] text-[#F57917] font-semibold border border-[#262930]'
                    : 'text-zinc-300 hover:bg-[#17191D] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#F57917]' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#F57917] text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};

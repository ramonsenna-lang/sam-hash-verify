import React from 'react';

interface ForensicLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

export const ForensicShieldIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'w-10 h-10',
  size = 40,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Glow / Base */}
      <defs>
        <linearGradient id="shieldGrad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9A35" />
          <stop offset="1" stopColor="#F57917" />
        </linearGradient>
        <linearGradient id="shieldDark" x1="32" y1="10" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1C1F26" />
          <stop offset="1" stopColor="#0B0D11" />
        </linearGradient>
      </defs>

      {/* Shield Background */}
      <path
        d="M32 4L10 13V30C10 44 19.5 54.8 32 60C44.5 54.8 54 44 54 30V13L32 4Z"
        fill="url(#shieldDark)"
        stroke="url(#shieldGrad)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Inner Forensic Circuit Accent */}
      <path
        d="M17 18.5L32 12L47 18.5V29C47 39.5 40.5 47.8 32 52.5C23.5 47.8 17 39.5 17 29V18.5Z"
        stroke="#F57917"
        strokeWidth="1.2"
        strokeDasharray="2 2"
        opacity="0.6"
      />

      {/* Fingerprint / Hash Lines inside base of shield */}
      <path
        d="M24 45C26.5 47 29.2 48 32 48C34.8 48 37.5 47 40 45"
        stroke="#F57917"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Center Checkmark */}
      <path
        d="M22 31L28.5 37.5L42 24"
        stroke="#FFFFFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const ForensicLogo: React.FC<ForensicLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
}) => {
  const iconSizes = {
    sm: 32,
    md: 44,
    lg: 56,
    xl: 68,
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const subtitleSizes = {
    sm: 'text-[9px]',
    md: 'text-[11px]',
    lg: 'text-xs',
    xl: 'text-sm',
  };

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      <div className="relative shrink-0 flex items-center justify-center p-1.5 rounded-xl bg-[#17191D] border border-[#262930] shadow-sm">
        <ForensicShieldIcon size={iconSizes[size]} className="shrink-0" />
      </div>

      <div className="flex flex-col justify-center">
        <div className={`font-extrabold tracking-wider leading-none ${titleSizes[size]} text-white`}>
          SAM HASH <span className="text-[#F57917]">VERIFY</span>
        </div>
        {showSubtitle && (
          <div className="flex flex-col mt-1">
            <span
              className={`font-mono font-semibold tracking-widest text-[#F57917] ${subtitleSizes[size]} uppercase leading-none`}
            >
              FORENSIC INTEGRITY SYSTEM
            </span>
            <span className="text-[11px] text-zinc-400 font-normal leading-tight mt-0.5 hidden sm:block">
              Sistema de Geração e Validação de Integridade Digital
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

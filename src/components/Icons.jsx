import React from "react";

const BaseIcon = ({ size, className, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const LogoIcon = ({ size = 24, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>
  </BaseIcon>
);

export const SearchIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </BaseIcon>
);

export const TargetIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </BaseIcon>
);

export const AlertIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </BaseIcon>
);

export const CheckIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <polyline points="20 6 9 17 4 12"/>
  </BaseIcon>
);

export const TrendUpIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </BaseIcon>
);

export const UserIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </BaseIcon>
);

export const ExternalLinkIcon = ({ size = 14, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </BaseIcon>
);

export const CodeIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </BaseIcon>
);

export const BookIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </BaseIcon>
);

export const ZapIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>
  </BaseIcon>
);

export const BarChartIcon = ({ size = 18, className = "" }) => (
  <BaseIcon size={size} className={className}>
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </BaseIcon>
);

export const CodeforcesIcon = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#0066ff" strokeWidth="2"/>
    <text x="7" y="16" fontSize="10" fontWeight="700" fill="#0066ff">CF</text>
  </svg>
);

export const LeetCodeIcon = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#28a745" strokeWidth="2"/>
    <text x="5" y="16" fontSize="10" fontWeight="700" fill="#28a745">LC</text>
  </svg>
);

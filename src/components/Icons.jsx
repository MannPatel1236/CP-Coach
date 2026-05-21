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
    <rect x="1" y="7" width="6" height="14" rx="1" fill="#F6C43D"/>
    <rect x="9" y="3" width="6" height="18" rx="1" fill="#1480C4"/>
    <rect x="17" y="12" width="6" height="9" rx="1" fill="#B11E26"/>
  </svg>
);

export const LeetCodeIcon = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 94 110.92" fill="none" className={className}>
    <path d="M67.5068339,83.0664138 C70.0005384,80.5763786 74.0371402,80.5828822 76.5228362,83.0809398 C79.0085322,85.5789975 79.00204,89.6226456 76.5083355,92.1126808 L65.4351451,103.169577 C55.2192332,113.370744 38.5604663,113.518673 28.1722578,103.513204 C28.112217,103.455678 23.486583,98.9201326 8.22702585,83.9570195 C-1.92478479,74.0028895 -2.93614945,58.0748736 6.61697549,47.8463644 L24.4286944,28.7745461 C33.9100043,18.6218594 51.3874487,17.5122246 62.2279907,26.2789232 L78.4052912,39.3620235 C81.1448956,41.5776292 81.5728103,45.5984975 79.3610657,48.3428842 C77.1493207,51.0872709 73.1354592,51.5159327 70.3958548,49.300327 L54.2186634,36.2173149 C48.5492813,31.6325105 38.631911,32.2621597 33.7398535,37.5006265 L15.9279056,56.5726899 C11.2772073,61.552182 11.7865613,69.5740156 17.1461283,74.8292186 C28.3515339,85.8169393 36.9874071,94.2846214 36.9973988,94.294225 C42.3981571,99.4959838 51.130862,99.418438 56.43358,94.1233737 L67.5068339,83.0664138 Z" fill="#FFA116"/>
    <path d="M40.6069914,72.0014117 C37.086019,72.0014117 34.2317068,69.142117 34.2317068,65.6149982 C34.2317068,62.0878794 37.086019,59.2285847 40.6069914,59.2285847 L87.6247154,59.2285847 C91.1456879,59.2285847 94,62.0878794 94,65.6149982 C94,69.142117 91.1456879,72.0014117 87.6247154,72.0014117 L40.6069914,72.0014117 Z" fill="#B3B3B3"/>
    <path d="M49.4124315,2.02335002 C51.8178981,-0.552320454 55.852269,-0.686893945 58.4234511,1.72277172 C60.9946333,4.13243738 61.1289722,8.17385083 58.7235056,10.7495213 L15.9282277,56.5728697 C11.2773659,61.551984 11.7867168,69.5737689 17.1459309,74.8291832 L36.9094236,94.2091099 C39.4255514,96.6764051 39.4686234,100.719828 37.0056277,103.240348 C34.5426319,105.760868 30.5062548,105.804016 27.990127,103.33672 L8.22654289,83.9567041 C-1.92467414,74.0021005 -2.93603527,58.0741402 6.61751533,47.846311 L49.4124315,2.02335002 Z" fill="#fff"/>
  </svg>
);

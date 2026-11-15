import type { ReactNode } from "react";

const icon = (children: ReactNode, size = 16) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icons = {
  sidebar: icon(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>),
  plus: icon(<path d="M12 5v14M5 12h14" />),
  x: icon(<path d="M6 6l12 12M18 6L6 18" />, 14),
  search: icon(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>, 14),
  scene: icon(<><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 14c1.5-4 3-5 4-2.5s2.5 1.5 4-2.5" /></>),
  folder: icon(<path d="M3 7.500A2.5 2.5 0 0 1 5.5 5H9l2.2 2.500h7.300A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.500h-13A2.5 2.5 0 0 1 3 17z" />),
  folderPlus: icon(<><path d="M3 7.500A2.5 2.5 0 0 1 5.5 5H9l2.2 2.500h7.300A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.500h-13A2.5 2.5 0 0 1 3 17z" /><path d="M12 11v5M9.5 13.500h5" /></>),
  chevron: icon(<path d="M9 6l6 6-6 6" />, 12),
  pencil: icon(<path d="M4 20l4.5-1L20 7.5 16.5 4 5 15.500z" />, 14),
  copy: icon(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.500A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.500v7A2.5 2.5 0 0 0 6.5 16H8" /></>, 14),
  trash: icon(<path d="M4 7h16M9.5 7V4.500h5V7M6.5 7l1 12.500h9l1-12.500M10 11v5M14 11v5" />, 14),
  upload: icon(<path d="M12 16V4M7 9l5-5 5 5M4 16v2.500A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.500V16" />),
  table: icon(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M3 15h18M10 4v16" /></>),
  sigma: icon(<path d="M17 6V4.500H6.500L13 12l-6.5 7.500H17V18" />),
  history: icon(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.100L3.5 8.5" /><path d="M3.5 4v4.500H8M12 7.500V12l3 2" /></>),
  sun: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2.500v2M12 19.500v2M2.5 12h2M19.5 12h2M5.3 5.300l1.4 1.400M17.3 17.300l1.4 1.400M5.3 18.700l1.4-1.400M17.3 6.700l1.4-1.4" /></>),
  cursor: icon(<path d="M5 3.5l5.2 16 2.6-6.7 6.7-2.600z" />),
  hand: icon(<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.500V4a1.5 1.5 0 0 1 3 0v7m0-5.500a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v5.500c0 3.6-2.7 6-6.3 6-2.6 0-4.3-1-5.7-3.200L4.3 13.500a1.5 1.5 0 0 1 2.5-1.600L8 13.5" />),
  rectangle: icon(<rect x="3.5" y="5" width="17" height="14" rx="2.5" />),
  diamond: icon(<path d="M12 3l9 9-9 9-9-9z" />),
  ellipse: icon(<ellipse cx="12" cy="12" rx="9" ry="7.5" />),
  arrow: icon(<path d="M4 12h16M14 6l6 6-6 6" />),
  line: icon(<path d="M4 19L20 5" />),
  draw: icon(<><path d="M4 20l4.5-1L20 7.5 16.5 4 5 15.500z" /><path d="M14 6.500l3.5 3.5" /></>),
  text: icon(<path d="M5 6V4.500h14V6M12 4.500v15M9 19.500h6" />),
  image: icon(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 15.500l-5-5L5.5 20" /></>),
  eraser: icon(<path d="M9 19.500l-5-5a1.5 1.5 0 0 1 0-2.100l8.4-8.400a1.5 1.5 0 0 1 2.1 0l5 5a1.5 1.5 0 0 1 0 2.100L11 19.500zM7.5 9.500l7 7M9 19.500h11" />),
  laser: icon(<><path d="M4 20l9-9" /><path d="M16.5 3v3M16.5 10v3M11.5 8h3M18.5 8h3M13 4.500l1.5 1.500M18.5 10l1.5 1.500M20 4.500L18.5 6" /></>),
  frame: icon(<path d="M7 3v18M17 3v18M3 7h18M3 17h18" />),
  more: icon(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>),
  download: icon(<path d="M12 4v12M7 11l5 5 5-5M4 16v2.500A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.500V16" />),
  library: icon(<path d="M4 5.500A1.5 1.5 0 0 1 5.5 4H10v16H5.500A1.5 1.5 0 0 1 4 18.500zM10 4h3.500A1.5 1.5 0 0 1 15 5.500V20h-5M15 8l3.3-1 3.2 11.5-3.3 1z" />),
  help: icon(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.500a2.5 2.5 0 1 1 3.5 2.300c-.7.4-1 .9-1 1.700M12 16.500v.5" /></>),
  note: icon(<path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5V14l-6 6H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4zM20 14h-4.500a1.5 1.5 0 0 0-1.5 1.500V20" />),
  undo: icon(<path d="M8.5 5L4 9.500l4.5 4.500M4 9.500h10a5.5 5.5 0 0 1 0 11h-3" />),
  redo: icon(<path d="M15.5 5L20 9.5 15.5 14M20 9.500H10a5.5 5.5 0 0 0 0 11h3" />),
  minus: icon(<path d="M5 12h14" />),
  toFront: icon(<><rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" /><path d="M16 8V5.500A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.500v9A1.5 1.5 0 0 0 5.5 16H8" /></>, 14),
  toBack: icon(<><rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" /><path d="M16 8h2.500A1.5 1.5 0 0 1 20 9.500v9a1.5 1.5 0 0 1-1.5 1.500h-9A1.5 1.5 0 0 1 8 18.500V16" /></>, 14),
  alignLeft: icon(<><path d="M4 3v18" /><rect x="8" y="6" width="11" height="4" rx="1" /><rect x="8" y="14" width="7" height="4" rx="1" /></>, 14),
  alignCenterX: icon(<><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>, 14),
  alignRight: icon(<><path d="M20 3v18" /><rect x="5" y="6" width="11" height="4" rx="1" /><rect x="9" y="14" width="7" height="4" rx="1" /></>, 14),
  alignTop: icon(<><path d="M3 4h18" /><rect x="6" y="8" width="4" height="11" rx="1" /><rect x="14" y="8" width="4" height="7" rx="1" /></>, 14),
  alignCenterY: icon(<><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>, 14),
  alignBottom: icon(<><path d="M3 20h18" /><rect x="6" y="5" width="4" height="11" rx="1" /><rect x="14" y="9" width="4" height="7" rx="1" /></>, 14),
  distributeX: icon(<><path d="M4 3v18M20 3v18" /><rect x="9" y="7" width="6" height="10" rx="1" /></>, 14),
  distributeY: icon(<><path d="M3 4h18M3 20h18" /><rect x="7" y="9" width="10" height="6" rx="1" /></>, 14),
  flow: icon(<><rect x="3" y="3.500" width="7" height="5" rx="1.500" /><rect x="14" y="15.500" width="7" height="5" rx="1.500" /><path d="M6.500 8.500V14a4 4 0 0 0 4 4H14" /></>),
  map: icon(<><rect x="3" y="4" width="18" height="16" rx="2.500" /><rect x="12" y="11" width="6" height="6" rx="1" /></>),
  roughNeat: icon(<path d="M3 15c4-8 8-8 12 0 2 4 4 4 6 0" />),
  roughSketch: icon(<><path d="M3 15c4-8 8-8 12 0 2 4 4 4 6 0" /><path d="M3.500 13.500c4-7 7-7.500 11.500 1 2 3.500 4.500 3 6 .500" /></>),
  roughScribble: icon(<><path d="M3 15c4-8 8-8 12 0 2 4 4 4 6 0" /><path d="M2.500 12.500c5-8 8-6 12 2.500 2 3 5 2 6.500-.500" /><path d="M4 17c3-9 7-9 10.500-1 2.500 5 4.500 3 7-1.500" /></>),
  edgeSharp: icon(<><path d="M5 20V5h15" /><path d="M9.500 20h1M14 20h1M20 9.500v1M20 14v1M19.500 20h.500v-.500" strokeDasharray="0" /></>),
  edgeRound: icon(<><path d="M5 20v-8a7 7 0 0 1 7-7h8" /><path d="M9.500 20h1M14 20h1M20 9.500v1M20 14v1M19.500 20h.500v-.500" /></>),
  layerBack: icon(<path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 20h14" />),
  layerDown: icon(<path d="M12 5v14M6.500 13.500 12 19l5.500-5.500" />),
  layerUp: icon(<path d="M12 19V5M6.500 10.500 12 5l5.500 5.500" />),
  layerFront: icon(<path d="M12 20V9M7.500 13.500 12 9l4.500 4.500M5 4h14" />),
  group: icon(<><rect x="4" y="4" width="16" height="16" rx="2.500" strokeDasharray="3 3" /><rect x="8" y="8" width="5" height="5" rx="1" /><rect x="12" y="12" width="4.500" height="4.500" rx="1" /></>),
  ungroup: icon(<><rect x="4" y="4" width="8" height="8" rx="1.500" /><rect x="12.500" y="12.500" width="7.500" height="7.500" rx="1.500" /></>),
  highlighter: icon(<><path d="M9 14.500 15.500 8l3 3-6.500 6.500H9z" /><path d="M14 9.500l-2.500-2.500L17 3l3.500 3.500-3 3M9 17.500l-2 2.500H4l2.500-3.500M5 21h14" /></>),
  lock: icon(<><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  unlock: icon(<><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.500-2" /></>),
  fit: icon(<path d="M4 9V5.500A1.5 1.5 0 0 1 5.500 4H9M15 4h3.500A1.5 1.5 0 0 1 20 5.500V9M20 15v3.500a1.5 1.5 0 0 1-1.500 1.500H15M9 20H5.500A1.5 1.5 0 0 1 4 18.500V15" />),
  sliders: icon(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  command: icon(<path d="M9 9h6v6H9zM9 9V6.500A2.500 2.500 0 1 0 6.500 9zM15 9V6.500A2.500 2.500 0 1 1 17.500 9zM9 15v2.500A2.500 2.500 0 1 1 6.500 15zM15 15v2.500a2.500 2.500 0 1 0 2.500-2.500z" />),
  keyboard: icon(<><rect x="2.500" y="6" width="19" height="12" rx="2.500" /><path d="M6.500 10h.01M10 10h.01M13.500 10h.01M17 10h.01M7 14h10" /></>),
  textLeft: icon(<path d="M4 6h16M4 12h10M4 18h13" />, 14),
  textCenter: icon(<path d="M4 6h16M7 12h10M5.500 18h13" />, 14),
  textRight: icon(<path d="M4 6h16M10 12h10M7 18h13" />, 14),
  restore: icon(<path d="M3.500 12a8.500 8.500 0 1 0 2.600-6.100L3.500 8.500M3.500 4v4.500H8" />, 14),
  clipboard: icon(<><rect x="5" y="5" width="14" height="16" rx="2.500" /><path d="M9 5V4.500A1.500 1.500 0 0 1 10.500 3h3A1.500 1.500 0 0 1 15 4.500V5" /></>),
  moon: icon(<path d="M20 14.500A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.500z" />),
};

/** The Inkboard mark: an ink stroke on a rounded tile. */
export const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="6.5" fill="var(--brand, #2563eb)" />
    <path
      d="M5.5 15.500c1.8-6.5 4-8.5 5.8-4.300s3.4 3.4 7.2-3.7"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="18.3" cy="16.8" r="1.4" fill="#fff" />
  </svg>
);

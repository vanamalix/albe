import type { ReactElement, ReactNode } from 'react';
import type { Tool } from '../state/store';

const S = (props: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {props.children}
  </svg>
);

export const toolIcons: Record<Tool, ReactElement> = {
  view: (
    <S>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </S>
  ),
  mass: (
    <S>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="10" ry="3.6" />
    </S>
  ),
  probe: (
    <S>
      <circle cx="17" cy="7" r="2.2" fill="currentColor" />
      <path d="M15.2 8.4C9 12 6 15 4 20" strokeDasharray="2 2.4" />
    </S>
  ),
  ray: (
    <S>
      <path d="M3 17c6 0 9-3 11-6s4-5 7-5" />
      <path d="M18 4l3 2-2.4 2.6" />
    </S>
  ),
  fan: (
    <S>
      <path d="M3 6h7c3 0 4 2 5 4M3 12h18M3 18h7c3 0 4-2 5-4" />
    </S>
  ),
  select: (
    <S>
      <path d="M5 3l13 7-6 1.6L9.5 18z" />
    </S>
  ),
};

export const IconPlay = () => (
  <S>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </S>
);
export const IconPause = () => (
  <S>
    <path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" />
  </S>
);
export const IconStep = () => (
  <S>
    <path d="M5 4.5v15l10-7.5z" fill="currentColor" />
    <path d="M18.5 4.5v15" strokeWidth="2.4" />
  </S>
);
export const IconReset = () => (
  <S>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </S>
);
export const IconClear = () => (
  <S>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </S>
);
export const IconSliders = () => (
  <S>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </S>
);
export const IconInfo = () => (
  <S>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  </S>
);
export const IconClose = () => (
  <S>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);

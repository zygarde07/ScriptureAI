// Small line icons used across the interface.
// They all share the same props so they are easy to reuse.
function Icon({ children, size = 20, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SidebarIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Icon>
);

export const SendIcon = (p) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const StopIcon = (p) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronIcon = (p) => (
  <Icon {...p}>
    <path d="M7 10l5 5 5-5" />
  </Icon>
);

export const RetryIcon = (p) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
  </Icon>
);

export const MenuIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="M10 6l6 6-6 6" />
  </Icon>
);

// ---- icons for the suggestion cards ----
export const OpenBookIcon = (p) => (
  <Icon {...p}>
    <path d="M3 5.5c3-1.2 6-1.2 9 .8 3-2 6-2 9-.8V19c-3-1.2-6-1.2-9 .8-3-2-6-2-9-.8z" />
    <path d="M12 6.3v13.5" />
  </Icon>
);

export const LotusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5c-2.6 2.8-2.6 6.6 0 9.6 2.6-3 2.6-6.8 0-9.6z" />
    <path d="M11 13.2C7.4 13.4 4.7 11.6 3.5 8.4 6.6 8 9.4 9.6 11 13.2z" />
    <path d="M13 13.2c3.6.2 6.3-1.6 7.5-4.8-3.1-.4-5.9 1.2-7.5 4.8z" />
    <path d="M5 16.5c2 2.2 4.4 3.2 7 3.2s5-1 7-3.2" />
  </Icon>
);

// a seated figure: head, shoulders and folded legs
export const MeditationIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="4.6" r="2" />
    <path d="M12 7.6c-2.2 0-3.8 1.2-4.4 3.2L6.4 14.500h11.200l-1.200-3.700c-.6-2-2.200-3.200-4.400-3.200z" />
    <path d="M4 17.500c2.600-1.500 5-2.500 8-2.500s5.400 1 8 2.500c-2.200 1.800-5 2.500-8 2.500s-5.800-.7-8-2.500z" />
  </Icon>
);

// a bow with an arrow drawn through it
export const BowIcon = (p) => (
  <Icon {...p}>
    <path d="M8 3.500c9 2 9 15 0 17" />
    <path d="M8 3.500v17" />
    <path d="M3 12h17M16.500 8.500L20 12l-3.500 3.500" />
  </Icon>
);

export const BookIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9" />
  </Icon>
);

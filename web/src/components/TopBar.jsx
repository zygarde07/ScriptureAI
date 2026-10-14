import { SidebarIcon, MenuIcon, PlusIcon } from "./icons.jsx";

// `mode` is "hero" (first screen) or "chat" (a conversation is open).
// On phones the "New chat" button shows its label on the first screen and
// shrinks to a "+" button while a conversation is open.
export default function TopBar({ sidebarOpen, onToggleSidebar, onNewChat, mode }) {
  return (
    <header className="topbar" data-mode={mode}>
      <button
        type="button"
        className="icon-btn topbar__menu"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Close conversations" : "Open conversations"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
      >
        {/* a hamburger on phones and tablets, a panel icon on desktop (chosen in CSS) */}
        <MenuIcon className="topbar__menu-hamburger" />
        <SidebarIcon className="topbar__menu-panel" />
      </button>

      <span className="wordmark">
        Scripture<em>AI</em>
      </span>

      {/* An empty spot at the top centre. When a conversation is open, the
          glowing orb shrinks and settles here (see components/orb/Orb.jsx). */}
      <div id="orb-anchor-compact" className="topbar__orb" aria-hidden="true" />

      <button type="button" className="topbar__new" onClick={onNewChat} aria-label="New chat">
        <PlusIcon size={16} />
        <span>New chat</span>
      </button>
    </header>
  );
}

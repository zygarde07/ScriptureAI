import { SidebarIcon, PlusIcon } from "./icons.jsx";

export default function TopBar({ sidebarOpen, onToggleSidebar, onNewChat }) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Close conversations" : "Open conversations"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
      >
        <SidebarIcon />
      </button>

      <span className="wordmark">
        Scripture<em>AI</em>
      </span>

      {/* An empty spot at the top centre. When a conversation is open, the
          glowing orb shrinks and settles here (see components/orb/Orb.jsx). */}
      <div id="orb-anchor-compact" className="topbar__orb" aria-hidden="true" />

      <button type="button" className="topbar__new" onClick={onNewChat}>
        <PlusIcon size={16} />
        <span>New chat</span>
      </button>
    </header>
  );
}

import { useRef } from "react";
import { PlusIcon, CloseIcon } from "./icons.jsx";

// The conversation history. It slides away when the sidebar is closed.
// On a phone it is a drawer: swipe it to the left to close it.
export default function Sidebar({ chats, activeId, onNewChat, onSelect, onDelete, onClose }) {
  // newest conversation first
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  // Swipe-to-close: remember where the finger went down, compare where it lifted.
  const touchStart = useRef(null);
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !onClose) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // a clear leftward swipe that is more sideways than up/down
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) onClose();
  };

  return (
    <aside
      className="sidebar"
      id="sidebar"
      aria-label="Conversations"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sidebar__inner">
        <button type="button" className="new-chat" onClick={onNewChat}>
          <PlusIcon size={18} />
          New chat
        </button>

        <p className="sidebar__label">Recent</p>

        {sorted.length === 0 ? (
          <p className="sidebar__empty">Your conversations will appear here.</p>
        ) : (
          <ul className="history">
            {sorted.map((chat) => (
              <li key={chat.id} className="history__row">
                <button
                  type="button"
                  className="history__item"
                  aria-current={chat.id === activeId ? "true" : undefined}
                  onClick={() => onSelect(chat.id)}
                  title={chat.title}
                >
                  {chat.title}
                </button>
                <button
                  type="button"
                  className="history__delete"
                  aria-label={`Delete conversation: ${chat.title}`}
                  onClick={() => onDelete(chat.id)}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

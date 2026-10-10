import { PlusIcon, CloseIcon } from "./icons.jsx";

// The conversation history. It slides away when the sidebar is closed.
export default function Sidebar({ chats, activeId, onNewChat, onSelect, onDelete }) {
  // newest conversation first
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="sidebar" id="sidebar" aria-label="Conversations">
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

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import useChats from "./hooks/useChats.js";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import Welcome from "./components/Welcome.jsx";
import Thread from "./components/Thread.jsx";
import Composer from "./components/Composer.jsx";
import Orb from "./components/orb/Orb.jsx";
import TempleOverlay from "./components/TempleOverlay.jsx";
import { dur } from "./motion/utils.js";
import "./styles/app.css";

// The whole product on one screen: a sidebar, the chat area and the orb.
export default function App() {
  const chat = useChats();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [composerFocused, setComposerFocused] = useState(false);
  const welcomeRef = useRef(null);
  const composerRef = useRef(null);

  const messages = chat.activeChat ? chat.activeChat.messages : [];
  // "hero" = the empty first screen, "chat" = a conversation is open
  const mode = messages.length > 0 ? "chat" : "hero";

  // The welcome screen stays on screen for a moment while it fades out,
  // so the switch to the conversation feels like one smooth motion.
  const [welcomeMounted, setWelcomeMounted] = useState(mode === "hero");
  useEffect(() => {
    if (mode === "hero") {
      setWelcomeMounted(true);
      return;
    }
    const el = welcomeRef.current;
    if (!el) {
      setWelcomeMounted(false);
      return;
    }
    gsap.to(el, {
      opacity: 0,
      y: -16,
      duration: dur(0.45),
      ease: "power2.in",
      onComplete: () => setWelcomeMounted(false),
    });
  }, [mode]);

  // Escape closes the sidebar when it is a pop-over (small screens).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && window.innerWidth < 900) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeSidebarIfSmall = () => {
    if (window.innerWidth < 900) setSidebarOpen(false);
  };

  const handleNewChat = () => {
    chat.newChat();
    closeSidebarIfSmall();
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  const handleSelect = (id) => {
    chat.selectChat(id);
    closeSidebarIfSmall();
  };

  return (
    <div className="app" data-sidebar={sidebarOpen ? "open" : "closed"}>
      <Sidebar
        chats={chat.chats}
        activeId={chat.activeChat ? chat.activeChat.id : null}
        onNewChat={handleNewChat}
        onSelect={handleSelect}
        onDelete={chat.deleteChat}
      />
      {/* dark layer behind the sidebar on small screens; click to close */}
      <div className="backdrop" onClick={() => setSidebarOpen(false)} />

      <div className="main">
        {/* the decorative temple artwork, behind everything (including the orb) */}
        <TempleOverlay visible={mode === "hero"} anchored={welcomeMounted} />

        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onNewChat={handleNewChat}
        />

        <div className="stage">
          {welcomeMounted && <Welcome ref={welcomeRef} onPick={chat.send} />}
          {mode === "chat" && (
            <Thread
              messages={messages}
              isLoading={chat.isLoading}
              anyLoading={chat.anyLoading}
              onRetry={chat.retry}
            />
          )}
        </div>

        <Composer
          ref={composerRef}
          onSend={chat.send}
          onStop={chat.stop}
          isLoading={chat.isLoading}
          anyLoading={chat.anyLoading}
          onFocusChange={setComposerFocused}
        />

        <Orb
          mode={mode}
          state={chat.isLoading ? "thinking" : composerFocused ? "focus" : "idle"}
          sendTick={chat.sendTick}
          answerTick={chat.answerTick}
        />
      </div>
    </div>
  );
}

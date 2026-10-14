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
import AccessGate from "./components/AccessGate.jsx";
import useAccess from "./hooks/useAccess.js";
import useViewport from "./hooks/useViewport.js";
import { dur } from "./motion/utils.js";
import "./styles/app.css";

// What to show first: the chat, or (only when the server asks for it) the
// access-code screen. On your own computer no code is needed, so you go
// straight to the chat.
export default function App() {
  const { status, unlock } = useAccess();

  if (status === "checking") return <div className="gate gate--blank" />;
  if (status === "waking") return <AccessGate mode="waking" />;
  if (status === "locked") return <AccessGate mode="locked" onSubmit={unlock} />;
  return <ChatApp />;
}

// The whole product on one screen: a sidebar, the chat area and the orb.
function ChatApp() {
  const chat = useChats();
  const { keyboardOpen } = useViewport(); // phone keyboard: keeps the composer visible
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

  // While the drawer is closed on a small screen it sits just off-screen.
  // `inert` stops keyboard users (and screen readers) from reaching its
  // hidden buttons.
  useEffect(() => {
    const apply = () => {
      const drawer = document.getElementById("sidebar");
      if (drawer) drawer.inert = window.innerWidth < 900 && !sidebarOpen;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [sidebarOpen]);

  const handleNewChat = () => {
    chat.newChat();
    closeSidebarIfSmall();
    // On a phone, focusing the box would pop the keyboard up uninvited and
    // hide the suggestions; there the visitor taps the box when ready.
    const touchScreen = window.matchMedia("(pointer: coarse)").matches;
    if (!touchScreen) setTimeout(() => composerRef.current?.focus(), 50);
  };

  const handleSelect = (id) => {
    chat.selectChat(id);
    closeSidebarIfSmall();
  };

  return (
    <div
      className="app"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-keyboard={keyboardOpen ? "open" : "closed"}
    >
      <Sidebar
        chats={chat.chats}
        activeId={chat.activeChat ? chat.activeChat.id : null}
        onNewChat={handleNewChat}
        onSelect={handleSelect}
        onDelete={chat.deleteChat}
        onClose={closeSidebarIfSmall}
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
          mode={mode}
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

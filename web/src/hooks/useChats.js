import { useCallback, useEffect, useRef, useState } from "react";
import { askQuestion } from "../api/client.js";

/*
  All the chat logic lives here, so the components stay simple.

  Conversations are saved in this browser only (localStorage). Nothing
  about them is sent anywhere except the question itself, which goes to
  the backend to be answered.

  A message looks like:
    user:      { id, role: "user", content }
    assistant: { id, role: "assistant", status, content, sources, ... }
      status = "done" | "error" | "stopped"
*/

const STORAGE_KEY = "scriptureai.chats.v1";
const MAX_CHATS = 50;

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return []; // storage blocked or corrupted: start empty
  }
}

function saveChats(chats) {
  try {
    // "fresh" only marks a just-arrived answer (used for its entrance
    // animation), so it is not saved.
    const clean = chats.slice(0, MAX_CHATS).map((chat) => ({
      ...chat,
      messages: chat.messages.map(({ fresh, ...rest }) => rest),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* storage full or blocked: the chat still works, it just won't be remembered */
  }
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

export default function useChats() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(null); // null = the empty "new chat" screen
  const [loadingChatId, setLoadingChatId] = useState(null);
  // These counters go up by one when something happens, so other parts of
  // the page (the orb) can react to the event.
  const [sendTick, setSendTick] = useState(0);
  const [answerTick, setAnswerTick] = useState(0);
  const controllerRef = useRef(null);

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  const activeChat = chats.find((c) => c.id === activeId) || null;

  const addMessage = useCallback((chatId, message) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, message] }
          : chat
      )
    );
  }, []);

  // Asks the backend and adds the reply (or the error) to the chat.
  const run = useCallback(
    async (chatId, question) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoadingChatId(chatId);
      setSendTick((t) => t + 1);

      try {
        const data = await askQuestion(question, controller.signal);
        addMessage(chatId, {
          id: newId(),
          role: "assistant",
          status: "done",
          content: data.answer,
          sources: data.sources,
          fresh: true,
        });
        setAnswerTick((t) => t + 1);
      } catch (err) {
        if (err.name === "AbortError") {
          addMessage(chatId, { id: newId(), role: "assistant", status: "stopped", question });
        } else {
          addMessage(chatId, {
            id: newId(),
            role: "assistant",
            status: "error",
            errorText: err.userMessage || "Something went wrong. Please try again.",
            question,
          });
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setLoadingChatId((current) => (current === chatId ? null : current));
      }
    },
    [addMessage]
  );

  // Sends a new question from the user.
  const send = useCallback(
    (text) => {
      const question = text.trim();
      if (!question || loadingChatId) return;

      const userMessage = { id: newId(), role: "user", content: question };
      let chatId = activeId;

      if (!activeChat) {
        // First message of a new conversation: create it now.
        chatId = newId();
        const now = Date.now();
        const chat = {
          id: chatId,
          title: question.length > 48 ? question.slice(0, 48).trimEnd() + "…" : question,
          createdAt: now,
          updatedAt: now,
          messages: [userMessage],
        };
        setChats((prev) => [chat, ...prev]);
        setActiveId(chatId);
      } else {
        addMessage(chatId, userMessage);
      }

      run(chatId, question);
    },
    [activeChat, activeId, addMessage, loadingChatId, run]
  );

  // Tries the same question again after an error or a stop.
  const retry = useCallback(
    (messageId) => {
      if (!activeChat || loadingChatId) return;
      const failed = activeChat.messages.find((m) => m.id === messageId);
      if (!failed || !failed.question) return;
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat.id
            ? { ...chat, messages: chat.messages.filter((m) => m.id !== messageId) }
            : chat
        )
      );
      run(activeChat.id, failed.question);
    },
    [activeChat, loadingChatId, run]
  );

  // Cancels the request that is in flight.
  const stop = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
  }, []);

  const newChat = useCallback(() => setActiveId(null), []);
  const selectChat = useCallback((id) => setActiveId(id), []);

  const deleteChat = useCallback(
    (id) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) setActiveId(null);
    },
    [activeId]
  );

  return {
    chats,
    activeChat,
    isLoading: loadingChatId !== null && loadingChatId === activeId,
    anyLoading: loadingChatId !== null,
    sendTick,
    answerTick,
    send,
    retry,
    stop,
    newChat,
    selectChat,
    deleteChat,
  };
}

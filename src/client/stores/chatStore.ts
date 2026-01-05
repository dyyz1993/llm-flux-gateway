import { create } from 'zustand';
import type { ChatSession, ChatMessage } from '@shared/types';
import { ChatStorageService } from '@client/services/chatStorage';

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;

  // Actions
  initFromStorage: () => void;
  createSession: (title: string, model: string, keyId: string) => ChatSession;
  deleteSession: (sessionId: string) => void;
  switchSession: (sessionId: string) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string, tokens?: { prompt: number; completion: number }, toolCalls?: any[]) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  clearCurrentSession: () => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentSession: null,

  initFromStorage: () => {
    const data = ChatStorageService.get();

    // Only restore from storage if there's no active session
    // This prevents overwriting a newly created session
    const currentState = get();
    if (currentState.currentSessionId && currentState.currentSession) {
      return;
    }

    set({
      sessions: data.sessions,
      currentSessionId: data.currentSessionId,
      currentSession: data.sessions.find(s => s.id === data.currentSessionId) || null,
    });
  },

  createSession: (title, model, keyId) => {
    const session = ChatStorageService.createSession(title, model, keyId);
    set({
      sessions: [session, ...get().sessions],
      currentSessionId: session.id,
      currentSession: session,
    });
    return session;
  },

  deleteSession: (sessionId) => {
    ChatStorageService.deleteSession(sessionId);
    const data = ChatStorageService.get();
    set({
      sessions: data.sessions,
      currentSessionId: data.currentSessionId,
      currentSession: data.sessions.find(s => s.id === data.currentSessionId) || null,
    });
  },

  switchSession: (sessionId) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (session) {
      ChatStorageService.setCurrentSession(sessionId);
      set({
        currentSessionId: sessionId,
        currentSession: session,
      });
    }
  },

  addMessage: (message) => {
    const { currentSessionId, currentSession } = get();
    if (!currentSessionId || !currentSession) {
      return;
    }

    ChatStorageService.addMessage(currentSessionId, message);

    set({
      currentSession: {
        ...currentSession,
        messages: [...currentSession.messages, message],
        updatedAt: Date.now(),
      },
    });
  },

  updateLastMessage: (content, tokens, toolCalls) => {
    const { currentSession } = get();
    if (!currentSession || currentSession.messages.length === 0) return;

    const messages = [...currentSession.messages];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.role === 'assistant') {
      messages[messages.length - 1] = {
        ...lastMessage,
        content,
        tokens: tokens || lastMessage.tokens,
        toolCalls: toolCalls || lastMessage.toolCalls,
        isStreaming: false,
      };

      const updatedSession = {
        ...currentSession,
        messages,
        updatedAt: Date.now(),
      };

      ChatStorageService.updateLastMessage(currentSession.id, content, tokens, toolCalls);
      set({ currentSession: updatedSession });
    }
  },

  updateSessionTitle: (sessionId, title) => {
    ChatStorageService.updateSessionTitle(sessionId, title);
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
      ),
      currentSession: state.currentSession?.id === sessionId
        ? { ...state.currentSession, title, updatedAt: Date.now() }
        : state.currentSession,
    }));
  },

  clearCurrentSession: () => {
    ChatStorageService.setCurrentSession(null);
    set({
      currentSessionId: null,
      currentSession: null,
    });
  },

  clearAll: () => {
    ChatStorageService.clearAll();
    set({ sessions: [], currentSessionId: null, currentSession: null });
  },
}));

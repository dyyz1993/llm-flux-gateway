import type { ChatStorage, ChatSession, ChatMessage } from '@shared/types';

const STORAGE_KEY = 'llm-flux-gateway:chat-history';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 500;

/**
 * LocalStorage service for chat session persistence
 */
export class ChatStorageService {
  /**
   * Get all chat data from localStorage
   */
  static get(): ChatStorage {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : { sessions: [], currentSessionId: null };
    } catch {
      return { sessions: [], currentSessionId: null };
    }
  }

  /**
   * Save chat data to localStorage
   */
  static save(data: ChatStorage): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save chat history:', e);
    }
  }

  /**
   * Create a new chat session
   */
  static createSession(title: string, model: string, keyId: string): ChatSession {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      keyId,
    };

    const data = this.get();
    data.sessions.unshift(session);
    data.currentSessionId = session.id;

    if (data.sessions.length > MAX_SESSIONS) {
      data.sessions = data.sessions.slice(0, MAX_SESSIONS);
    }

    this.save(data);
    return session;
  }

  /**
   * Delete a chat session
   */
  static deleteSession(sessionId: string): void {
    const data = this.get();
    data.sessions = data.sessions.filter(s => s.id !== sessionId);
    if (data.currentSessionId === sessionId) {
      data.currentSessionId = data.sessions[0]?.id || null;
    }
    this.save(data);
  }

  /**
   * Add a message to a session
   */
  static addMessage(sessionId: string, message: ChatMessage): void {
    const data = this.get();
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session) return;

    session.messages.push(message);
    session.updatedAt = Date.now();

    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }

    this.save(data);
  }

  /**
   * Update the last message in a session (for streaming)
   */
  static updateLastMessage(
    sessionId: string,
    content: string,
    tokens?: { prompt: number; completion: number },
    toolCalls?: any[]
  ): void {
    const data = this.get();
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session || session.messages.length === 0) return;

    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage!.role === 'assistant') {
      session.messages[session.messages.length - 1] = {
        ...lastMessage!,
        content,
        tokens: tokens || lastMessage!.tokens,
        toolCalls: toolCalls || lastMessage!.toolCalls,
        isStreaming: false,
      };
      session.updatedAt = Date.now();
      this.save(data);
    }
  }

  /**
   * Update session title
   */
  static updateSessionTitle(sessionId: string, title: string): void {
    const data = this.get();
    const session = data.sessions.find(s => s.id === sessionId);
    if (session) {
      session.title = title;
      session.updatedAt = Date.now();
      this.save(data);
    }
  }

  /**
   * Set current session
   */
  static setCurrentSession(sessionId: string | null): void {
    const data = this.get();
    data.currentSessionId = sessionId;
    this.save(data);
  }

  /**
   * Clear all chat history
   */
  static clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

import React, { useState } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { useChatStore } from '@client/stores/chatStore';
import type { ChatSession } from '@shared/types';

interface ChatSidebarProps {
  onNewChat: () => void;
  disabled?: boolean;
}

/**
 * Chat session sidebar with history management
 */
export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, disabled }) => {
  const { sessions, currentSessionId, deleteSession, switchSession, updateSessionTitle } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null as any);
  const [editTitle, setEditTitle] = useState('');

  const handleStartEdit = (session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      updateSessionTitle(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="w-64 bg-[#0a0a0a] border-r border-[#262626] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#262626]">
        <button
          onClick={onNewChat}
          disabled={disabled}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
            disabled
              ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs">No chat history</p>
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`group relative p-3 rounded-lg transition-all cursor-pointer ${
                currentSessionId === session.id
                  ? 'bg-indigo-600/20 border border-indigo-600/30'
                  : 'bg-[#111] hover:bg-[#1a1a1a] border border-transparent'
              }`}
              onClick={() => currentSessionId !== session.id && !disabled && switchSession(session.id)}
            >
              {editingId === session.id ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-[#0a0a0a] border border-[#333] text-white text-sm px-2 py-1 rounded focus:outline-none focus:border-indigo-600"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1 hover:bg-emerald-600 rounded transition-colors"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 hover:bg-red-600 rounded transition-colors"
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${
                        currentSessionId === session.id ? 'text-indigo-400' : 'text-gray-300'
                      }`}>
                        {session.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-600">
                          {session.messages.length} messages
                        </span>
                        <span className="text-[10px] text-gray-700">
                          {formatTime(session.updatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleStartEdit(session);
                        }}
                        disabled={disabled}
                        className="p-1 hover:bg-[#262626] rounded transition-colors"
                      >
                        <Edit2 className="w-3 h-3 text-gray-500 hover:text-gray-400" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Delete this chat session?')) {
                            deleteSession(session.id);
                          }
                        }}
                        disabled={disabled}
                        className="p-1 hover:bg-red-600/20 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {sessions.length > 0 && (
        <div className="p-3 border-t border-[#262626]">
          <div className="text-[10px] text-gray-600 text-center">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
};

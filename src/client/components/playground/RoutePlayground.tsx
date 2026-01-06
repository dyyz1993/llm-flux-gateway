import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Wrench, Bug, ChevronUp, Settings, Cpu, Key, Bot } from 'lucide-react';
import { useKeysStore, useRoutesStore, useAssetsStore, useChatStore } from '@client/stores';
import { useAIStream } from '@client/hooks/useAIStream';
import { ToolExecutionService } from '@client/services/toolExecution';
import { protocolTranspilerService, TranspileDebugInfo, ApiFormat } from '@client/services/protocolTranspiler';
import { ModelSelector, ModelSelectorValue } from '@client/components/playground/ModelSelector';
import { FormatSelector } from '@client/components/playground/FormatSelector';
import { ChatSidebar } from '@client/components/playground/ChatSidebar';
import { ChatMessages } from '@client/components/playground/ChatMessages';
import { ChatInput } from '@client/components/playground/ChatInput';
import { SystemPromptPanel } from '@client/components/playground/SystemPromptPanel';
import { DebugPanel } from '@client/components/playground/DebugPanel';
import { TOOL_TEMPLATES } from '@client/components/playground/toolTemplates';
import type { ApiKey, RouteConfig, Asset, Message, ChatMessage, ToolCall } from '@shared/types';
import { Role } from '@shared/types';

/**
 * Helper function to compute available models and patterns for a given key
 */
function computeKeyModels(
  key: ApiKey | undefined,
  routes: RouteConfig[],
  assets: Asset[]
): { models: string[]; patterns: string[] } {
  if (!key || key.routes!.length === 0) {
    return { models: [], patterns: [] };
  }

  const associatedRoutes = key.routes!
    .map(keyRoute => routes.find(r => r.id === keyRoute.routeId))
    .filter((r): r is RouteConfig => r !== undefined && r.isActive);

  const modelPatterns = new Set<string>();
  const exactModels = new Set<string>();
  let hasOverridePatterns = false;

  for (const route of associatedRoutes) {
    for (const override of route.overrides) {
      if (override.field === 'model') {
        hasOverridePatterns = true;
        override.matchValues.forEach(pattern => modelPatterns.add(pattern));
      }
    }
  }

  if (!hasOverridePatterns) {
    for (const route of associatedRoutes) {
      if (route.assetModels && route.assetModels.length > 0) {
        route.assetModels.forEach(model => {
          modelPatterns.add(model);
          exactModels.add(model);
        });
      }
    }

    const associatedAssets = associatedRoutes
      .map(route => assets.find(a => a.id === route.assetId))
      .filter((a): a is Asset => a !== undefined);

    for (const asset of associatedAssets) {
      if (asset.models && asset.models.length > 0) {
        asset.models.forEach(model => {
          modelPatterns.add(model.modelId);
          exactModels.add(model.modelId);
        });
      }
    }
  } else {
    for (const pattern of modelPatterns) {
      if (!pattern.includes('*')) {
        exactModels.add(pattern);
      }
    }
  }

  return {
    models: Array.from(exactModels).sort(),
    patterns: modelPatterns.size > 0 ? Array.from(modelPatterns) : ['*'],
  };
}

/**
 * Main Playground Component with Chat UI
 */
export const RoutePlayground: React.FC = () => {
  // ========== Store Data ==========
  const keys = useKeysStore((state) => state.keys);
  const routes = useRoutesStore((state) => state.routes);
  const assets = useAssetsStore((state) => state.assets);
  const chatStore = useChatStore();

  const activeKeys = useMemo(() => keys.filter(k => k.status === 'active'), [keys]);

  // ========== Local State ==========
  const [selectorValue, setSelectorValue] = useState<ModelSelectorValue>({
    selectedKeyId: activeKeys[0]?.id || '',
    selectedModel: '',
  });
  const [isValid, setIsValid] = useState<boolean>(false);
  const [enableStream, setEnableStream] = useState(true); // Enable streaming by default
  const [enableTools, setEnableTools] = useState(false); // Enable tools (function calling)
  const [, setStreamingContent] = useState(''); // Real-time streaming content
  const [, setStreamingToolCalls] = useState<ToolCall[]>([]); // Real-time streaming tool calls
  const [error, setError] = useState<string | null>(null as any);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null as any);

  // Format selection and debug states
  const [selectedFormat, setSelectedFormat] = useState<ApiFormat>('openai');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<TranspileDebugInfo | null>(null as any);
  const [configCollapsed, setConfigCollapsed] = useState(true); // Config panel collapsed by default

  // ========== Hooks ==========
  const { stream, request, isLoading } = useAIStream();

  // ========== Data Fetching ==========
  useEffect(() => {
    useKeysStore.getState().fetchKeys();
    useRoutesStore.getState().fetchRoutes();
    useAssetsStore.getState().fetchAssets();
    chatStore.initFromStorage();
  }, []);

  // Sync selectorValue with current session's model and keyId
  useEffect(() => {
    const currentSession = chatStore.currentSession;
    if (currentSession && currentSession.model && currentSession.keyId) {
      // Only update if different to avoid unnecessary re-renders
      if (selectorValue.selectedKeyId !== currentSession.keyId ||
          selectorValue.selectedModel !== currentSession.model) {
        setSelectorValue({
          selectedKeyId: currentSession.keyId,
          selectedModel: currentSession.model,
        });
      }
    }
  }, [chatStore.currentSession?.id]); // Only re-run when session ID changes

  // Auto-select first key when keys load
  useEffect(() => {
    if (activeKeys.length > 0 && !selectorValue.selectedKeyId) {
      setSelectorValue(prev => ({ ...prev, selectedKeyId: activeKeys[0]!.id }) as any);
    }
  }, [activeKeys, selectorValue.selectedKeyId]);

  // ========== Compute Models for Selected Key ==========
  const { models: availableModels, patterns } = useMemo(() => {
    const selectedKey = keys.find(k => k.id === selectorValue.selectedKeyId);
    return computeKeyModels(selectedKey, routes, assets);
  }, [selectorValue.selectedKeyId, keys, routes, assets]);

  // ========== Auto-select First Model ==========
  useEffect(() => {
    const selectedKey = keys.find(k => k.id === selectorValue.selectedKeyId);
    const { models, patterns: keyPatterns } = computeKeyModels(selectedKey, routes, assets);

    const hasWildcard = keyPatterns.some(p => p.includes('*'));

    if (!hasWildcard && models.length > 0) {
      setSelectorValue(prev => ({
        ...prev,
        selectedModel: models[0],
      }) as any);
    }
  }, [selectorValue.selectedKeyId, keys, routes, assets]);

  // ========== Get Selected Key ==========
  const selectedKey = useMemo(
    () => keys.find(k => k.id === selectorValue.selectedKeyId),
    [keys, selectorValue.selectedKeyId]
  );

  // ========== Prepare Keys for ModelSelector ==========
  const selectorKeys = useMemo(
    () => activeKeys.map(k => ({
      id: k.id,
      name: k.name,
      hint: `${k.keyToken.slice(0, 12)}...`,
    })),
    [activeKeys]
  );

  // ========== Handlers ==========
  const handleNewChat = () => {
    setError(null);
    setStreamingContent('');
    setStreamingToolCalls([]);

    // Clear current session selection to show empty state
    chatStore.clearCurrentSession();
  };

  const handleSendMessage = async (content: string) => {
    // 🔒 防止并发：如果正在加载，忽略新请求
    if (isLoading) {
      console.warn('[RoutePlayground] Request already in progress, ignoring');
      return;
    }

    if (!selectedKey || !isValid) {
      setError('Please select an API key and model first');
      return;
    }

    setError(null);

    // Create session if needed
    let currentSession = chatStore.currentSession;
    if (!currentSession) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      currentSession = chatStore.createSession(title, selectorValue.selectedModel, selectorValue.selectedKeyId);
      console.log('[RoutePlayground] Created session:', currentSession);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Build message history from session
    const messages: Message[] = currentSession.messages.map(m => {
      const msg: Message = {
        role: m.role as any,
        content: m.content,
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls;
      }
      if (m.name) {
        msg.name = m.name;
      }
      // Important: Copy tool_call_id for tool result messages
      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }

      // 🔧 FIX: If content is an array (Anthropic format), convert to string or handle properly
      // This can happen when user switches between formats (e.g., Anthropic → GLM)
      if (Array.isArray(msg.content)) {
        // Check if this is an Anthropic content block format with tool_use
        const hasToolUse = msg.content.some((block: any) => block.type === 'tool_use');

        if (hasToolUse && msg.tool_calls && msg.tool_calls.length > 0) {
          // If we have tool_calls, use empty string as content (OpenAI format)
          msg.content = '';
        } else {
          // Otherwise, extract text from content blocks
          msg.content = msg.content
            .filter((block: any) => block.type === 'text' || typeof block === 'string')
            .map((block: any) => typeof block === 'string' ? block : (block.text || ''))
            .join('\n');
        }
      }

      return msg;
    });

    // Add current user message to the history
    messages.push({
      role: Role.USER,
      content,
    });

    // Now add to store
    chatStore.addMessage(userMessage);

    // Add system prompt if enabled
    if (systemPrompt) {
      messages.unshift({
        role: Role.SYSTEM,
        content: systemPrompt,
      });
    }

    // Transform request to selected format
    const transpileResult = protocolTranspilerService.buildRequest(
      selectorValue.selectedModel,
      messages,
      selectedFormat,
      enableTools ? Object.values(TOOL_TEMPLATES) : undefined,
      systemPrompt || undefined
    );

    // Store debug info for display
    setDebugInfo(transpileResult);

    // Add assistant placeholder
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    chatStore.addMessage(assistantMessage);

    setStreamingContent('');
    setStreamingToolCalls([]);

    // Accumulate content for final update
    let accumulatedContent = '';
    let accumulatedToolCalls: ToolCall[] = [];
    // Store the tool calls from the first round to display in the final assistant message
    let toolCallsToDisplay: ToolCall[] = [];
    // 🔒 防止 onComplete 重复调用
    const isCompletingRef = { current: false };

    // Helper function to make a streaming request
    const makeStreamingRequest = async (requestMessages: Message[]) => {
      // Always use the user-selected format for consistency
      const provider = selectedFormat;

      await stream({
        apiKey: selectedKey.keyToken,
        model: selectorValue.selectedModel,
        messages: requestMessages,
        provider,
        tools: enableTools ? Object.values(TOOL_TEMPLATES) : undefined,
        onChunk: (content, toolCalls) => {
          // 🔍 DEBUG: Log onChunk calls
          if (toolCalls && toolCalls.length > 0) {
            console.log('[RoutePlayground] onChunk called with toolCalls:', toolCalls);
          }

          // Accumulate content
          if (content) {
            accumulatedContent += content;
            setStreamingContent(accumulatedContent);
          }

          if (toolCalls && toolCalls.length > 0) {
            accumulatedToolCalls = toolCalls;
            setStreamingToolCalls(toolCalls);
          }

          // Update in real-time
          chatStore.updateLastMessage(accumulatedContent, undefined, accumulatedToolCalls);
        },
        onError: (err) => {
          setError(err);
          chatStore.updateLastMessage(`Error: ${err}`, undefined, []);
        },
        onComplete: async (tokens) => {
          // 🔒 防止重复调用
          if (isCompletingRef.current) {
            console.warn('[RoutePlayground] onComplete already called, ignoring');
            return;
          }
          isCompletingRef.current = true;

          // 🔍 DEBUG: Log accumulatedToolCalls state
          console.log('[RoutePlayground] onComplete called, accumulatedToolCalls:', accumulatedToolCalls);

          try {
            // Check if there are tool calls to execute
            if (accumulatedToolCalls.length > 0) {
              console.log('[RoutePlayground] Tool calls detected, executing...', accumulatedToolCalls);

              // ⭐ FIX: Persist tool calls to the first assistant message before creating second one
              chatStore.updateLastMessage(accumulatedContent, undefined, accumulatedToolCalls);

            // Execute tools
            const toolResults = await ToolExecutionService.executeToolCalls(accumulatedToolCalls);
            console.log('[RoutePlayground] Tool results:', toolResults);

            // Add tool result messages to store
            for (const toolResult of toolResults) {
              chatStore.addMessage({
                id: crypto.randomUUID(),
                role: 'tool',
                content: toolResult.content,
                name: toolResult.name,
                toolCallId: toolResult.tool_call_id,
                timestamp: Date.now(),
              } as ChatMessage);
            }

            // Prepare messages for second round
            const messagesWithToolResults = [...requestMessages];
            // Add assistant message with tool calls
            messagesWithToolResults.push({
              role: Role.ASSISTANT,
              content: accumulatedContent || '',
              tool_calls: accumulatedToolCalls,
            });
            // Add tool result messages
            messagesWithToolResults.push(...toolResults);

              // Reset for second round
              accumulatedContent = '';
              accumulatedToolCalls = [];
              isCompletingRef.current = false; // 🔒 重置标志，为第二次请求

              // Add new assistant placeholder for final response
              const finalAssistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
              };
              chatStore.addMessage(finalAssistantMessage);

              // Make second request with tool results
              await makeStreamingRequest(messagesWithToolResults);
            } else {
              // No tool calls in this response
              // Check if this is the final response after tool execution
              // (toolCallsToDisplay would have been set in the first round)
              if (toolCallsToDisplay.length > 0) {
                // This is the final response after tool execution
                // Clear tool calls from display since they belong to the previous message
                console.log('[RoutePlayground] Final response after tool execution, clearing tool calls display');
                chatStore.updateLastMessage(accumulatedContent, tokens, []); // Empty array for final response
                toolCallsToDisplay = [];
              } else {
                // This is a normal response without any tool calls
                chatStore.updateLastMessage(accumulatedContent, tokens, accumulatedToolCalls);
              }
              setStreamingContent('');
              setStreamingToolCalls([]);
            }
          } catch (error) {
            console.error('[RoutePlayground] Error in onComplete:', error);
            setError(error instanceof Error ? error.message : 'Unknown error');
          }
        },
      });
    };

    // Start first request - use streaming or non-streaming based on toggle
    if (enableStream) {
      // Streaming mode
      await makeStreamingRequest(messages);
    } else {
      // Non-streaming mode
      await makeNonStreamingRequest(messages);
    }
  };

  // Helper function to make a non-streaming request
  const makeNonStreamingRequest = async (requestMessages: Message[]) => {
    try {
      const provider = selectedFormat;

      console.log('[RoutePlayground Non-Streaming] Making request with', requestMessages.length, 'messages');

      const result = await request({
        apiKey: selectedKey?.keyToken || '',
        model: selectorValue.selectedModel,
        messages: requestMessages,
        provider,
        tools: enableTools ? Object.values(TOOL_TEMPLATES) : undefined,
        onError: (err) => {
          console.error('[RoutePlayground Non-Streaming] Request error:', err);
          setError(err);
          chatStore.updateLastMessage(`Error: ${err}`, undefined, []);
        },
      });

      console.log('[RoutePlayground Non-Streaming] Received result:', {
        contentLength: result.content?.length || 0,
        toolCallsCount: result.toolCalls?.length || 0,
        hasTokens: !!result.tokens,
        toolCalls: result.toolCalls, // 🔍 DEBUG: Log actual toolCalls
      });

      // Update with the final result
      let accumulatedContent = result.content || '';
      let accumulatedToolCalls = result.toolCalls || [];
      const tokens = result.tokens;

      // 🔍 DEBUG: Log accumulatedToolCalls state
      console.log('[RoutePlayground Non-Streaming] accumulatedToolCalls:', accumulatedToolCalls);

      // Check if there are tool calls to execute
      if (accumulatedToolCalls.length > 0) {
        console.log('[RoutePlayground Non-Streaming] Tool calls detected:', accumulatedToolCalls);

        // Update with first response containing tool calls
        chatStore.updateLastMessage(accumulatedContent, undefined, accumulatedToolCalls);

        // Execute tools
        const toolResults = await ToolExecutionService.executeToolCalls(accumulatedToolCalls);
        console.log('[RoutePlayground Non-Streaming] Tool results:', toolResults);

        // Add tool result messages to store
        for (const toolResult of toolResults) {
          chatStore.addMessage({
            id: crypto.randomUUID(),
            role: 'tool',
            content: toolResult.content,
            name: toolResult.name,
            toolCallId: toolResult.tool_call_id,
            timestamp: Date.now(),
          } as ChatMessage);
        }

        // Prepare messages for second round
        const messagesWithToolResults = [...requestMessages];
        // Add assistant message with tool calls
        messagesWithToolResults.push({
          role: Role.ASSISTANT,
          content: accumulatedContent || '',
          tool_calls: accumulatedToolCalls,
        });
        // Add tool result messages
        messagesWithToolResults.push(...toolResults);

        console.log('[RoutePlayground Non-Streaming] Preparing second round with', messagesWithToolResults.length, 'messages');

        // Add new assistant placeholder for final response
        const finalAssistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        };
        chatStore.addMessage(finalAssistantMessage);

        // Make second request with tool results
        await makeNonStreamingRequest(messagesWithToolResults);
      } else {
        console.log('[RoutePlayground Non-Streaming] No tool calls, finalizing with tokens:', tokens);
        // No tool calls in this response - always clear tool calls display
        // (Either this is a normal response without tools, or the final response after tool execution)
        chatStore.updateLastMessage(accumulatedContent, tokens, []); // Empty array to clear tool calls display
        setStreamingContent('');
        setStreamingToolCalls([]);
      }
    } catch (error) {
      console.error('[RoutePlayground Non-Streaming] Error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // ========== Render ==========
  return (
    <div className="h-[calc(100vh-4rem)] flex gap-6 animate-in fade-in duration-500">
      {/* Sidebar */}
      <ChatSidebar onNewChat={handleNewChat} disabled={isLoading} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-[#262626] bg-[#111]">
          {/* Title Bar */}
          <div className="flex justify-between items-center px-4 py-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Chat Playground
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Debug Toggle */}
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`p-1.5 rounded-md transition-colors ${
                  showDebug ? 'bg-amber-500/20 text-amber-400' : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300'
                }`}
                title="Toggle debug panel"
              >
                <Bug className="w-3.5 h-3.5" />
              </button>

              {/* Config Collapse Toggle */}
              <button
                onClick={() => setConfigCollapsed(!configCollapsed)}
                className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                  configCollapsed ? 'bg-[#1a1a1a] text-gray-500 hover:text-gray-300' : 'bg-indigo-500/20 text-indigo-400'
                }`}
                title={configCollapsed ? 'Show configuration' : 'Hide configuration'}
              >
                {configCollapsed ? (
                  <Settings className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Status Bar - Protocol, Key, Model */}
          <div className="px-4 pb-2 flex flex-wrap items-center gap-3 text-[10px]">
            <span className="text-gray-600">Multi-turn conversations with tools support</span>

            {/* Protocol */}
            <div className="flex items-center gap-1 px-2 py-0.5 bg-[#0a0a0a] rounded border border-[#262626]">
              <Cpu className={`w-3 h-3 ${
                selectedFormat === 'openai' ? 'text-emerald-400' :
                selectedFormat === 'anthropic' ? 'text-amber-400' :
                selectedFormat === 'gemini' ? 'text-blue-400' :
                'text-purple-400'
              }`} />
              <span className="text-gray-500 font-mono">{selectedFormat.toUpperCase()}</span>
            </div>

            {/* Key Name Prefix */}
            {selectedKey && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-[#0a0a0a] rounded border border-[#262626]">
                <Key className="w-3 h-3 text-indigo-400" />
                <span className="text-gray-400 font-mono truncate max-w-[120px]" title={selectedKey.name}>
                  {selectedKey.name.slice(0, 15)}{selectedKey.name.length > 15 ? '...' : ''}
                </span>
              </div>
            )}

            {/* Model */}
            {selectorValue.selectedModel && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-[#0a0a0a] rounded border border-[#262626]">
                <Bot className="w-3 h-3 text-cyan-400" />
                <span className="text-gray-400 font-mono truncate max-w-[200px]" title={selectorValue.selectedModel}>
                  {selectorValue.selectedModel}
                </span>
              </div>
            )}
          </div>

          {/* Collapsible Config Panel */}
          {!configCollapsed && (
            <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex gap-4">
                {/* Left Column: Format, Streaming, Tools */}
                <div className="flex flex-col gap-3">
                  {/* Format Selector */}
                  <FormatSelector
                    value={selectedFormat}
                    onChange={setSelectedFormat}
                    disabled={isLoading}
                  />

                  {/* Streaming & Tools Toggles */}
                  <div className="flex gap-4">
                    {/* Streaming Toggle */}
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                      enableStream
                        ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                        : 'bg-[#1a1a1a] border-[#262626] text-gray-500 hover:text-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enableStream}
                        onChange={(e) => setEnableStream(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                        disabled={isLoading}
                      />
                      <span className="text-sm font-medium">流式响应</span>
                    </label>

                    {/* Tools Toggle */}
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                      enableTools
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-[#1a1a1a] border-[#262626] text-gray-500 hover:text-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enableTools}
                        onChange={(e) => setEnableTools(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                        disabled={isLoading}
                      />
                      <span className="text-sm font-medium">工具调用</span>
                    </label>
                  </div>
                </div>

                {/* Right Column: API Key & Model */}
                <div className="flex-1">
                  <ModelSelector
                    availableKeys={selectorKeys}
                    availableModels={availableModels}
                    patterns={patterns}
                    value={selectorValue}
                    onChange={setSelectorValue}
                    onValidationChange={setIsValid}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* System Prompt */}
        {!configCollapsed && (
          <div className="p-3 border-b border-[#262626] animate-in slide-in-from-top-2 duration-200">
            <SystemPromptPanel onUpdate={setSystemPrompt} disabled={isLoading} />
          </div>
        )}

        {/* Messages */}
        <ChatMessages isLoading={isLoading} />

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-950/10 border-t border-red-500/20">
            <div className="text-red-400 text-sm">{error}</div>
          </div>
        )}

        {/* Tools Indicator */}
        {enableTools && (
          <div className="px-4 py-2 bg-[#0f1410] border-t border-emerald-900/30 flex items-center gap-2">
            <Wrench className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-emerald-400">
              Tools enabled: {Object.values(TOOL_TEMPLATES).length} available
            </span>
          </div>
        )}

        {/* Debug Panel */}
        {showDebug && (
          <DebugPanel
            debugInfo={debugInfo}
            onClear={() => setDebugInfo(null)}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          disabled={!selectedKey || !isValid}
          currentSession={chatStore.currentSession}
        />
      </div>
    </div>
  );
};

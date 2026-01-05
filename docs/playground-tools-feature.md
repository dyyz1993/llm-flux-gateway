# Playground Tools Feature

## Overview

The Playground now supports function calling (tools) to test LLM capabilities with external tool definitions.

## Features

### 1. Tool Selection

- **Enable Tools Checkbox**: Toggle tools functionality on/off
- **Tool Templates**: Choose from 8 pre-defined tool templates:
  - `web_search` - Search the internet for real-time information
  - `calculator` - Execute mathematical calculations
  - `get_weather` - Get weather information for a city
  - `code_interpreter` - Execute Python code
  - `get_current_time` - Get current time and date
  - `database_query` - Execute SQL queries
  - `send_email` - Send emails
  - `file_operations` - File system operations (read, write, delete, list)

### 2. UI Features

- **Collapsible Panel**: Show/hide tool selection interface
- **Visual Selection**: Selected tools are highlighted with indigo border
- **Selected Tools Preview**: Shows all selected tools as tags
- **JSON Schema Preview**: View the complete tool definitions that will be sent
- **Tool Count**: Badge showing number of selected tools

### 3. Request Handling

When tools are enabled and selected, the request body includes:

```typescript
{
  model: "selected-model",
  messages: [{ role: "user", content: "prompt" }],
  stream: true,
  tools: [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the internet...",
        parameters: {
          type: "object",
          properties: { ... },
          required: ["query"]
        }
      }
    }
  ]
}
```

### 4. Response Display

When the LLM makes tool calls, they are displayed in a dedicated panel:

- **Tool Call Header**: Shows number of tool calls with a wrench icon
- **Individual Call Cards**: Each tool call shows:
  - Function name
  - Tool call ID
  - Arguments (expandable JSON view)
- **Formatted JSON**: Arguments are pretty-printed for readability

## Usage Example

1. **Enable Tools**: Check the "Enable Tools" checkbox
2. **Select Tools**: Click on tool cards to select desired functions
3. **Send Request**: Enter a prompt that requires tool usage
4. **View Results**: Check the "Tool Calls" section in the response panel

### Example Prompts

```
// For web_search
"What are the latest news about AI today?"

// For calculator
"Calculate 25 * 4 + 10"

// For get_weather
"What's the weather like in Tokyo?"

// For code_interpreter
"Write a Python function to calculate fibonacci numbers"
```

## File Structure

```
src/client/components/playground/
├── RoutePlayground.tsx       # Main playground component
├── ModelSelector.tsx          # Model selection UI
└── toolTemplates.ts           # Tool definitions
```

## Technical Details

### State Management

```typescript
const [enableTools, setEnableTools] = useState(false);
const [selectedTools, setSelectedTools] = useState<string[]>([]);
const [showToolPanel, setShowToolPanel] = useState(false);
const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
```

### Streaming Tool Call Handling

Tool calls are streamed in chunks. The component merges chunks by index:

```typescript
if (parsed.choices?.[0]?.delta?.tool_calls) {
  setToolCalls(prev => {
    const updated = [...prev];
    newToolCalls.forEach((newCall: ToolCall) => {
      const index = newCall.index ?? updated.length;
      if (!updated[index]) {
        updated[index] = { ...newCall };
      } else {
        // Merge arguments if it's a chunk
        if (newCall.function?.arguments) {
          updated[index].function.arguments += newCall.function.arguments;
        }
      }
    });
    return updated;
  });
}
```

## Future Enhancements

- [ ] Custom tool definitions (user-provided JSON)
- [ ] Tool call execution (actually run the functions)
- [ ] Tool call response handling (send results back to LLM)
- [ ] Multi-turn conversations with tool calls
- [ ] Export/import tool configurations
- [ ] Tool usage analytics

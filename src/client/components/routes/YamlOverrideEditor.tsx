import React, { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { Save, X, FileJson, AlertCircle } from 'lucide-react';
import type { OverrideRule } from '@shared/types';

interface YamlOverrideEditorProps {
  rules: OverrideRule[];
  onSave: (rules: OverrideRule[]) => void;
  onCancel: () => void;
  embedded?: boolean; // When true, hide header and buttons
}

const DEFAULT_YAML = `# Override Rules Configuration
# Maps incoming request parameters to target vendor values
#
# Example:
# - field: model
#   matchValues:
#     - gpt-3.5-turbo
#     - gpt-4
#     - "*"
#   rewriteValue: gemini-1.5-flash
#

`;

export const YamlOverrideEditor: React.FC<YamlOverrideEditorProps> = ({
  rules,
  onSave,
  onCancel,
  embedded = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [yamlText, setYamlText] = useState('');
  const [error, setError] = useState<string | null>(null as any);

  // Convert OverrideRule[] to YAML text
  const rulesToYaml = (rules: OverrideRule[]): string => {
    if (rules.length === 0) {
      return DEFAULT_YAML;
    }
    const yaml = rules.map((rule) => {
      const matchValues = rule.matchValues.map((v) => `    - ${v}`).join('\n');
      return `- field: ${rule.field}
  matchValues:
${matchValues}
  rewriteValue: ${rule.rewriteValue}`;
    }).join('\n\n');
    return `# Override Rules Configuration\n${yaml}\n`;
  };

  // Parse YAML text to OverrideRule[]
  const parseYamlToRules = (yaml: string): OverrideRule[] | null => {
    try {
      if (!yaml.trim()) return [];

      // Filter out empty lines and comments, but preserve structure
      const lines = yaml.split('\n');
      const rules: OverrideRule[] = [];
      let currentRule: Partial<OverrideRule> | null = null;
      let inMatchValues = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || '';
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // New rule starts with "- field:"
        if (trimmed.startsWith('- field:')) {
          // Save previous rule if complete
          if (currentRule && currentRule.field && currentRule.matchValues && currentRule.matchValues.length > 0 && currentRule.rewriteValue) {
            rules.push(currentRule as OverrideRule);
          }
          currentRule = {
            field: trimmed.replace('- field:', '').trim(),
            matchValues: [],
          };
          inMatchValues = false;
        }
        // matchValues: header
        else if (trimmed.startsWith('matchValues:')) {
          inMatchValues = true;
        }
        // Array item "- value"
        else if (trimmed.startsWith('- ') && inMatchValues && currentRule) {
          const value = trimmed.replace('-', '').trim();
          currentRule.matchValues!.push(value);
        }
        // rewriteValue
        else if (trimmed.startsWith('rewriteValue:') && currentRule) {
          currentRule.rewriteValue = trimmed.replace('rewriteValue:', '').trim();
          inMatchValues = false;
        }
      }

      // Save last rule
      if (currentRule && currentRule.field && currentRule.matchValues && currentRule.matchValues.length > 0 && currentRule.rewriteValue) {
        rules.push(currentRule as OverrideRule);
      }

      return rules;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Invalid YAML format';
      setError(errorMsg);
      return null;
    }
  };

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    const initialYaml = rulesToYaml(rules);
    setYamlText(initialYaml);

    const view = new EditorView({
      doc: initialYaml,
      extensions: [
        keymap.of(defaultKeymap),
        yaml(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            setYamlText(newText);
            setError(null);
            // Auto-save in embedded mode
            if (embedded) {
              const parsed = parseYamlToRules(newText);
              if (parsed && parsed.length >= 0) {
                onSave(parsed);
              }
            }
          }
        }),
        EditorView.theme({
          '&': { fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'monospace' },
        }),
      ],
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const parsed = parseYamlToRules(yamlText);
    if (parsed === null) return;
    onSave(parsed);
  };

  return (
    <div className={embedded ? "" : "bg-[#0a0a0a] border border-[#262626] rounded-xl p-4"}>
      {!embedded && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Override Rules (YAML)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={`${embedded ? '' : 'mb-3'} bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-2 rounded-lg text-xs flex items-center gap-2`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg overflow-hidden">
        <div ref={editorRef} className="text-sm" />
      </div>

      {!embedded && (
        <div className="mt-3 bg-[#111] border border-[#262626] rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2 font-semibold">Syntax Guide:</p>
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">
{`# Field: The request parameter to override
- field: model
  # Values that trigger this rule
  matchValues:
    - gpt-3.5-turbo
    - gpt-4
    - "*"
  # The target value to use
  rewriteValue: gemini-1.5-flash`}
          </pre>
        </div>
      )}
    </div>
  );
};

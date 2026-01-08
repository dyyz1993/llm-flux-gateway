import React, { useRef, useEffect, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { bracketMatching, indentUnit, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, Diagnostic } from '@codemirror/lint';
import jsYaml from 'js-yaml';

export type SupportedLanguage = 'yaml' | 'json' | 'jsonl' | 'javascript' | 'text';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (isValid: boolean, errors: string[]) => void;
  language?: SupportedLanguage;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  placeholder?: string;
}

// YAML Linter implementation
const createYamlLinter = (onValidate?: (isValid: boolean, errors: string[]) => void) => linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const text = view.state.doc.toString();
  if (!text.trim()) {
    onValidate?.(true, []);
    return diagnostics;
  }

  try {
    // 尝试解析 YAML，处理反引号 (js-yaml 不原生支持反引号)
    const processedText = text.replace(/`([^`]*)`/g, '"$1"');
    jsYaml.load(processedText);
    onValidate?.(true, []);
  } catch (e: any) {
    const loc = e.mark;
    const message = e.reason || e.message;
    if (loc) {
      diagnostics.push({
        from: Math.min(loc.position, view.state.doc.length),
        to: Math.min(loc.position + 1, view.state.doc.length),
        severity: 'error',
        message: message,
      });
    } else {
      diagnostics.push({
        from: 0,
        to: view.state.doc.length,
        severity: 'error',
        message: message,
      });
    }
    onValidate?.(false, [message]);
  }
  return diagnostics;
});

// Language extension mapping
const getLanguageExtension = (lang: SupportedLanguage, onValidate?: (isValid: boolean, errors: string[]) => void) => {
  switch (lang) {
    case 'yaml':
      return [yaml(), createYamlLinter(onValidate)];
    case 'json':
    case 'jsonl':
      return [javascript({ jsx: false, typescript: false })];
    case 'javascript':
      return [javascript({ jsx: true, typescript: false })];
    default:
      return [];
  }
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  onValidate,
  language = 'yaml',
  readOnly = false,
  minHeight: _minHeight = '300px',
  maxHeight: _maxHeight = '600px',
  className = '',
  placeholder: _placeholder = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());

  // Use a ref for onValidate to avoid re-initializing editor when it changes
  const onValidateRef = useRef(onValidate);
  useEffect(() => {
    onValidateRef.current = onValidate;
  }, [onValidate]);

  // Handle editor changes
  const handleChange = useCallback(
    (update: ViewUpdate) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString();
        onChange(newValue);
      }
    },
    [onChange]
  );

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Delete old view if exists
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentUnit.of('  '),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          {
            key: 'Tab',
            run: insertTab,
          },
        ]),
        oneDark,
        languageCompartment.current.of(getLanguageExtension(language, (isValid, errors) => {
          onValidateRef.current?.(isValid, errors);
        })),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '13px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-scroller': {
            overflow: 'auto',
            height: '100%',
          },
          '.cm-content': {
            padding: '16px',
          },
          '.cm-line': {
            padding: '0',
          },
          '.cm-placeholder': {
            color: '#666',
            fontStyle: 'italic',
          },
        }),
        EditorView.lineWrapping,
        readOnly ? [EditorState.readOnly.of(true)] : [],
        EditorView.updateListener.of(handleChange),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update value externally
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Update language
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: languageCompartment.current.reconfigure(getLanguageExtension(language, (isValid, errors) => {
          onValidateRef.current?.(isValid, errors);
        })),
      });
    }
  }, [language]);

  return (
    <div
      ref={containerRef}
      className={`border border-[#333] rounded-lg h-full ${className}`}
    />
  );
};

// Tab insertion helper
const insertTab: (view: EditorView) => boolean = (view) => {
  if (view.state.readOnly) return false;
  view.dispatch({
    changes: {
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
      insert: '  ',
    },
    userEvent: 'input',
  });
  return true;
};

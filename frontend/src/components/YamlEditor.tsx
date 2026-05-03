import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useState } from 'react'

interface YamlEditorProps {
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  minHeight?: string
  className?: string
}

function createEditorTheme(height: string, isLightTheme: boolean) {
  return EditorView.theme({
    '&': { fontSize: '12.5px', fontFamily: '"JetBrains Mono", "Fira Mono", monospace', height },
    '&.cm-editor': { height },
    '&.cm-focused': {
      outline: '2px solid color-mix(in oklch, var(--ring) 65%, transparent)',
      outlineOffset: '-1px',
    },
    '.cm-scroller': { overflow: 'auto', minHeight: height },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': {
      background: isLightTheme
        ? 'color-mix(in oklch, var(--surface-2) 92%, transparent)'
        : 'transparent',
      border: 'none',
      paddingRight: '6px',
      height: '100%',
      color: 'var(--muted-foreground)',
    },
    '.cm-activeLine': {
      backgroundColor: isLightTheme
        ? 'color-mix(in oklch, var(--accent) 18%, transparent)'
        : 'rgba(255,255,255,0.05)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: isLightTheme
        ? 'color-mix(in oklch, var(--accent) 30%, transparent)'
        : 'color-mix(in oklch, var(--accent) 28%, transparent)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: isLightTheme ? 'var(--foreground)' : 'var(--accent)',
    },
  })
}

export function YamlEditor({ value, onChange, readOnly = false, minHeight = '300px', className }: YamlEditorProps) {
  const [themeName, setThemeName] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeName(document.documentElement.getAttribute('data-theme') || 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const isLightTheme = themeName === 'light'
  const extensions = useMemo(() => [yaml(), createEditorTheme(minHeight, isLightTheme)], [minHeight, isLightTheme])

  return (
    <div className={`rounded-md border border-input overflow-hidden min-h-0 ${className ?? ''}`}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={isLightTheme ? 'light' : oneDark}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: false,
          searchKeymap: false,
        }}
        style={{ height: minHeight, minHeight }}
      />
    </div>
  )
}

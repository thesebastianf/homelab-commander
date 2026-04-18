import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useMemo } from 'react'

interface YamlEditorProps {
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  minHeight?: string
  className?: string
}

const baseTheme = EditorView.theme({
  '&': { fontSize: '12.5px', fontFamily: '"JetBrains Mono", "Fira Mono", monospace' },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': { background: 'transparent', border: 'none', paddingRight: '4px' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
})

export function YamlEditor({ value, onChange, readOnly = false, minHeight = '300px', className }: YamlEditorProps) {
  const extensions = useMemo(() => [yaml(), baseTheme], [])

  return (
    <div className={`rounded-md border border-input overflow-hidden ${className ?? ''}`}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={oneDark}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: false,
          searchKeymap: false,
        }}
        style={{ minHeight }}
      />
    </div>
  )
}

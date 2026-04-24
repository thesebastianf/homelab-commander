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

function createEditorTheme(height: string) {
  return EditorView.theme({
    '&': { fontSize: '12.5px', fontFamily: '"JetBrains Mono", "Fira Mono", monospace', height },
    '&.cm-editor': { height },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': { background: 'transparent', border: 'none', paddingRight: '4px', height: '100%' },
    '.cm-scroller': { overflow: 'auto', minHeight: height },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  })
}

export function YamlEditor({ value, onChange, readOnly = false, minHeight = '300px', className }: YamlEditorProps) {
  const extensions = useMemo(() => [yaml(), createEditorTheme(minHeight)], [minHeight])

  return (
    <div className={`rounded-md border border-input overflow-hidden min-h-0 ${className ?? ''}`}>
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
        style={{ height: minHeight, minHeight }}
      />
    </div>
  )
}

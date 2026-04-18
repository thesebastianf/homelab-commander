import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface ContainerShellDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  containerId?: string
  containerName?: string
  serviceName?: string
  image?: string
}

function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

export function ContainerShellDialog({
  open,
  onOpenChange,
  containerId,
  containerName,
  serviceName,
  image,
}: ContainerShellDialogProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shellLabel = useMemo(() => {
    if (serviceName && containerName) return `${serviceName} (${containerName})`
    return containerName || serviceName || 'Container shell'
  }, [containerName, serviceName])

  useEffect(() => {
    if (!open || !containerId || !hostRef.current) return

    setConnected(false)
    setError(null)

    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      theme: {
        background: '#0b0f14',
        foreground: '#d8dee9',
      },
      scrollback: 3000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(hostRef.current)
    fitAddon.fit()
    term.focus()
    term.write('\u001b[32mConnecting to shell...\u001b[0m\r\n')

    termRef.current = term
    fitRef.current = fitAddon

    const ws = new WebSocket(wsUrl(`/ws/exec/${encodeURIComponent(containerId)}`))
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN || !termRef.current) return
      ws.send(JSON.stringify({ type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows }))
    }

    ws.onopen = () => {
      setConnected(true)
      term.write('\u001b[32mConnected. Interactive shell ready.\u001b[0m\r\n')
      sendResize()
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg?.type === 'error') {
            setError(String(msg.message || 'Shell error'))
            term.write(`\r\n\u001b[31m${msg.message || 'Shell error'}\u001b[0m\r\n`)
            return
          }
        } catch {
          term.write(event.data)
          return
        }
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data))
      }
    }

    ws.onerror = () => {
      setError('Terminal connection failed')
      term.write('\r\n\u001b[31mConnection error\u001b[0m\r\n')
    }

    ws.onclose = () => {
      setConnected(false)
      term.write('\r\n\u001b[33mShell session ended\u001b[0m\r\n')
    }

    const disposeInput = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const onWindowResize = () => {
      fitAddon.fit()
      sendResize()
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      disposeInput.dispose()
      try { ws.close() } catch { /* ignore */ }
      try { term.dispose() } catch { /* ignore */ }
      wsRef.current = null
      termRef.current = null
      fitRef.current = null
    }
  }, [open, containerId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[88vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="font-mono text-sm">Interactive Shell - {shellLabel}</DialogTitle>
              <DialogDescription className="text-xs font-mono truncate">
                {image || 'image unknown'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={connected ? 'default' : 'outline'} className="text-[10px] font-mono">
                {connected ? 'connected' : 'disconnected'}
              </Badge>
              {error && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  error
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="h-full min-h-0 bg-black/90 p-3">
          <div ref={hostRef} className="h-full w-full rounded border border-border/40 overflow-hidden" />
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WandSparkles, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'

interface ComposeAiPanelProps {
  composeContent: string
  envContent: string
  onApplyCompose: (compose: string) => void
  emptyStateHint?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ComposeAiPanel({ composeContent, envContent, onApplyCompose, emptyStateHint }: ComposeAiPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draftCompose, setDraftCompose] = useState('')
  const [redactionMode, setRedactionMode] = useState<'full-local' | 'redacted-remote' | null>(null)

  const generate = useMutation({
    mutationFn: () => api.generateComposeWithAi({ prompt, composeContent, envContent }),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: prompt },
        { role: 'assistant', content: result.message },
      ])
      setDraftCompose(result.composeContent || '')
      setRedactionMode(result.redactionMode)
      setPrompt('')
      toast.success('AI response received')
    },
    onError: (error: any) => toast.error(error.message || 'AI request failed'),
  })

  const validate = useMutation({
    mutationFn: () => api.validateComposeWithAi({ prompt, composeContent, envContent }),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: prompt || 'Validate current compose.yml' },
        { role: 'assistant', content: result.message },
      ])
      setRedactionMode(result.redactionMode)
      setPrompt('')
      toast.success('Compose review complete')
    },
    onError: (error: any) => toast.error(error.message || 'AI validation failed'),
  })

  return (
    <div className="flex h-full flex-col gap-3">
      <Alert className="py-2">
        <ShieldAlert className="w-4 h-4" />
        <AlertDescription className="text-xs">
          Remote providers only receive redacted compose content and env key names. Raw <code>.env</code> values are sent only when a local/private AI endpoint is configured to allow it.
        </AlertDescription>
      </Alert>

      {!composeContent.trim() && emptyStateHint ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {emptyStateHint}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs">Prompt</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] text-xs"
          placeholder="I need a compose file for service abc with PostgreSQL and automatic restarts"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!prompt.trim() || generate.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}
          Generate / Refine Compose
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!composeContent.trim() || validate.isPending}
          onClick={() => validate.mutate()}
        >
          {validate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Validate Current YAML
        </Button>
        {redactionMode && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {redactionMode === 'full-local' ? 'local context' : 'redacted remote context'}
          </Badge>
        )}
      </div>

      {draftCompose ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              Generated Compose Draft
            </div>
            <Button size="sm" onClick={() => onApplyCompose(draftCompose)}>Apply to Editor</Button>
          </div>
          <ScrollArea className="h-32 rounded border bg-background/70 p-2">
            <pre className="font-mono text-[11px] whitespace-pre-wrap">{draftCompose}</pre>
          </ScrollArea>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/10">
        <ScrollArea className="h-full p-3">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ask for a new compose file, request a refinement, or validate the current one.
              </p>
            ) : messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 text-xs ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/60'}`}>
                <p className="mb-1 font-semibold uppercase tracking-wider text-[10px] opacity-80">{message.role}</p>
                <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
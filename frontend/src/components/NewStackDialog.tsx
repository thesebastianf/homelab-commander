import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, Copy } from 'lucide-react'
import type { Stack } from '@/lib/types'
import { toast } from 'sonner'

const STACK_TEMPLATES: Record<string, { label: string; compose: string; env: string }> = {
  blank: {
    label: 'Blank',
    compose: `version: '3.8'\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped\n`,
    env: '',
  },
  nginx: {
    label: 'Nginx Reverse Proxy',
    compose: `version: '3.8'\nservices:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - "80:80"\n      - "443:443"\n    volumes:\n      - ./nginx.conf:/etc/nginx/nginx.conf:ro\n      - certs:/etc/nginx/certs\n    restart: unless-stopped\n\nvolumes:\n  certs:\n`,
    env: '',
  },
  wordpress: {
    label: 'WordPress + MySQL',
    compose: `version: '3.8'\nservices:\n  wordpress:\n    image: wordpress:latest\n    ports:\n      - "8080:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: \${MYSQL_USER}\n      WORDPRESS_DB_PASSWORD: \${MYSQL_PASSWORD}\n      WORDPRESS_DB_NAME: \${MYSQL_DATABASE}\n    volumes:\n      - wp_data:/var/www/html\n    depends_on:\n      - db\n    restart: unless-stopped\n\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}\n      MYSQL_DATABASE: \${MYSQL_DATABASE}\n      MYSQL_USER: \${MYSQL_USER}\n      MYSQL_PASSWORD: \${MYSQL_PASSWORD}\n    volumes:\n      - db_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  wp_data:\n  db_data:\n`,
    env: 'MYSQL_ROOT_PASSWORD=changeme\nMYSQL_DATABASE=wordpress\nMYSQL_USER=wordpress\nMYSQL_PASSWORD=changeme\n',
  },
  postgres: {
    label: 'PostgreSQL + pgAdmin',
    compose: `version: '3.8'\nservices:\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: \${POSTGRES_DB}\n      POSTGRES_USER: \${POSTGRES_USER}\n      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}\n    volumes:\n      - pg_data:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n    restart: unless-stopped\n\n  pgadmin:\n    image: dpage/pgadmin4:latest\n    environment:\n      PGADMIN_DEFAULT_EMAIL: \${PGADMIN_EMAIL}\n      PGADMIN_DEFAULT_PASSWORD: \${PGADMIN_PASSWORD}\n    ports:\n      - "5050:80"\n    depends_on:\n      - postgres\n    restart: unless-stopped\n\nvolumes:\n  pg_data:\n`,
    env: 'POSTGRES_DB=mydb\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=changeme\nPGADMIN_EMAIL=admin@example.com\nPGADMIN_PASSWORD=changeme\n',
  },
  monitoring: {
    label: 'Prometheus + Grafana',
    compose: `version: '3.8'\nservices:\n  prometheus:\n    image: prom/prometheus:latest\n    ports:\n      - "9090:9090"\n    volumes:\n      - prom_data:/prometheus\n    restart: unless-stopped\n\n  grafana:\n    image: grafana/grafana:latest\n    ports:\n      - "3000:3000"\n    environment:\n      GF_SECURITY_ADMIN_PASSWORD: \${GF_ADMIN_PASSWORD}\n    volumes:\n      - grafana_data:/var/lib/grafana\n    depends_on:\n      - prometheus\n    restart: unless-stopped\n\nvolumes:\n  prom_data:\n  grafana_data:\n`,
    env: 'GF_ADMIN_PASSWORD=changeme\n',
  },
}

interface NewStackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stacksBasePath: string
  volumesBasePath: string
  onSave: (stack: Stack) => void
  allStacks: Stack[]
  allContainers: { id: string; name: string; ports?: string[] }[]
}

export function NewStackDialog({ 
  open, 
  onOpenChange, 
  stacksBasePath, 
  volumesBasePath, 
  onSave, 
  allStacks,
  allContainers
}: NewStackDialogProps) {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('blank')
  const [compose, setCompose] = useState(STACK_TEMPLATES.blank.compose)
  const [envFile, setEnvFile] = useState('')

  const handleTemplateChange = (key: string) => {
    setTemplate(key)
    const t = STACK_TEMPLATES[key]
    if (t) {
      setCompose(t.compose)
      setEnvFile(t.env)
    }
  }

  // Port conflict detection
  const newPorts = extractPorts(compose)
  const existingPorts = new Map<number, string>()
  allContainers.forEach(c => {
    c.ports?.forEach(p => {
      const portStr = p.split(':')[0]
      const portNum = parseInt(portStr, 10)
      if (!isNaN(portNum)) existingPorts.set(portNum, c.name)
    })
  })
  allStacks.forEach(s => {
    if (s.name === name) return
    const stackPorts = extractPorts(s.compose || s.composeContent || '')
    stackPorts.forEach(p => existingPorts.set(p, `Stack: ${s.name}`))
  })
  const conflicts = newPorts.filter(p => existingPorts.has(p)).map(p => ({
    port: p,
    usedBy: existingPorts.get(p)!,
  }))

  const handleAutoResolve = () => {
    let updatedCompose = compose
    for (const conflict of conflicts) {
      let newPort = conflict.port + 1
      while (existingPorts.has(newPort) || newPorts.includes(newPort)) newPort++
      const regex = new RegExp(`(["\']?)${conflict.port}:(\\d+)(["\']?)`, 'g')
      updatedCompose = updatedCompose.replace(regex, `$1${newPort}:$2$3`)
    }
    setCompose(updatedCompose)
    toast.info('Port conflicts auto-resolved')
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Stack name is required')
      return
    }

    if (allStacks.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
      toast.error('A stack with this name already exists')
      return
    }

    const newStack: Stack = {
      id: `stack-${Date.now()}`,
      name: name.trim(),
      status: 'stopped',
      services: (compose.match(/^\s{2}\w/gm) || []).length || 1,
      version: 1,
      compose,
      envFile: envFile || undefined,
      stackPath: `${stacksBasePath}/${name.trim().toLowerCase().replace(/\s+/g, '-')}`,
      volumePath: `${volumesBasePath}/${name.trim().toLowerCase().replace(/\s+/g, '-')}`,
      ports: extractPorts(compose),
      versions: [{ id: crypto.randomUUID(), version: 1, description: 'Initial version', createdAt: new Date().toISOString() }]
    }

    onSave(newStack)
    toast.success(`Stack "${name}" created`)
    resetForm()
    onOpenChange(false)
  }

  const resetForm = () => {
    setName('')
    setTemplate('blank')
    setCompose(STACK_TEMPLATES.blank.compose)
    setEnvFile('')
  }

  return (
    <TooltipProvider delayDuration={350}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Stack</DialogTitle>
          <DialogDescription>
            Define a new Docker Compose stack for your homelab
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stack-name">Stack Name</Label>
              <Input
                id="stack-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-stack"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={template} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STACK_TEMPLATES).map(([key, t]) => (
                    <SelectItem key={key} value={key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {name && (
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Stack:</span>
                <Badge variant="outline" className="font-mono text-xs gap-1">
                  {stacksBasePath}/{name.toLowerCase().replace(/\s+/g, '-')}
                  <Copy className="w-3 h-3 cursor-pointer" onClick={() => {
                    navigator.clipboard.writeText(`${stacksBasePath}/${name.toLowerCase().replace(/\s+/g, '-')}`)
                    toast.success('Path copied')
                  }} />
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Volume:</span>
                <Badge variant="outline" className="font-mono text-xs gap-1">
                  {volumesBasePath}/{name.toLowerCase().replace(/\s+/g, '-')}
                  <Copy className="w-3 h-3 cursor-pointer" onClick={() => {
                    navigator.clipboard.writeText(`${volumesBasePath}/${name.toLowerCase().replace(/\s+/g, '-')}`)
                    toast.success('Path copied')
                  }} />
                </Badge>
              </div>
            </div>
          )}

          {conflicts.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  Port conflict{conflicts.length > 1 ? 's' : ''}: {conflicts.map(c => `${c.port} (${c.usedBy})`).join(', ')}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={handleAutoResolve}>
                      Auto-Resolve
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Increment conflicting host ports to next available values</p>
                  </TooltipContent>
                </Tooltip>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>docker-compose.yml</Label>
            <Textarea
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Paste your docker-compose.yml content here..."
            />
          </div>

          <div className="space-y-2">
            <Label>.env (optional)</Label>
            <Textarea
              value={envFile}
              onChange={(e) => setEnvFile(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
              placeholder="KEY=value"
            />
          </div>
        </div>

        <DialogFooter>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>Cancel</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Close dialog and discard unsaved compose changes</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleSave}>Create Stack</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Create stack definition, path mapping, and initial version snapshot</p>
            </TooltipContent>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  )
}

function extractPorts(compose: string): number[] {
  const ports: number[] = []
  // Match host port as either a literal number or ${VAR:-number} default value
  const regex = /["']?(?:\$\{[A-Za-z_][A-Za-z0-9_]*:-([0-9]+)\}|([0-9]+)):[0-9][^"']*/g
  let match
  while ((match = regex.exec(compose)) !== null) {
    const port = parseInt(match[1] ?? match[2], 10)
    if (!isNaN(port) && !ports.includes(port)) {
      ports.push(port)
    }
  }
  return ports
}

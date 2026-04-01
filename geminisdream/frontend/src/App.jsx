import React, { useState, useEffect, useMemo } from 'react'
import { 
  BarChart3, 
  Layers, 
  Box, 
  Terminal, 
  Activity, 
  Settings, 
  Search,
  Bell,
  Cpu,
  Database,
  ShieldAlert,
  ChevronRight,
  HardDrive,
  Network,
  ExternalLink,
  MoreVertical,
  Play,
  RotateCcw,
  Square
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility for tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs))
}

const App = () => {
  const [containers, setContainers] = useState([])
  const [stacks, setStacks] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Real API Integration
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contRes, stackRes] = await Promise.all([
          fetch('/api/containers'),
          fetch('/api/stacks')
        ])
        const contData = await contRes.json()
        const stackData = await stackRes.json()
        setContainers(contData || [])
        setStacks(stackData || [])
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Real-time Event Streaming via WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setEvents(prev => [data, ...prev].slice(0, 50))
    }

    return () => ws.close()
  }, [])

  const filteredContainers = useMemo(() => {
    return containers.filter(c => 
      c.Names[0].toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.Image.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [containers, searchQuery])

  return (
    <div className="flex h-screen w-screen bg-bg text-text overflow-hidden font-sans">
      {/* --- UNIFIED NAVIGATOR --- */}
      <aside className="w-72 glass-sidebar flex flex-col z-20">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Commander</h1>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted" />
            <input 
              type="text" 
              placeholder="Search services..." 
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <nav className="space-y-1 overflow-y-auto flex-1 custom-scrollbar">
            <div className="text-[10px] font-bold text-muted uppercase tracking-widest px-4 mb-2 opacity-50">Infrastructure</div>
            <div className="nav-item active"><Box className="w-4 h-4" /> Nodes</div>
            <div className="nav-item"><Layers className="w-4 h-4" /> Stacks</div>
            
            <div className="pl-6 space-y-1 mt-2">
              {stacks.length > 0 ? stacks.map(s => (
                <div key={s} className="nav-item !py-1.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-dim mr-2" />
                  {s}
                </div>
              )) : (
                <div className="text-[10px] text-muted/50 px-4">No stacks found</div>
              )}
            </div>

            <div className="text-[10px] font-bold text-muted uppercase tracking-widest px-4 mb-2 mt-6 opacity-50">Tools</div>
            <div className="nav-item"><Network className="w-4 h-4" /> Network Graph</div>
            <div className="nav-item"><Database className="w-4 h-4" /> Backups</div>
            <div className="nav-item"><ShieldAlert className="w-4 h-4" /> Policy Center</div>
          </nav>
        </div>

        <div className="p-4 mt-auto border-t border-border bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold">SE</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Sebastian</div>
              <div className="text-[10px] text-muted truncate">admin@hlc.local</div>
            </div>
            <Settings className="w-4 h-4 text-muted hover:text-white cursor-pointer transition-colors" />
          </div>
        </div>
      </aside>

      {/* --- MAIN COMMAND DECK --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-bg to-[#0a0a1a]">
        <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-4 text-sm">
            <Layers className="w-4 h-4 text-muted" />
            <span className="text-muted">Stacks</span>
            <ChevronRight className="w-4 h-4 text-dim" />
            <span className="font-medium">Active Services</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 text-success text-xs font-medium">
              <div className="status-dot bg-success animate-pulse" />
              Operator Online
            </div>
            <button className="p-2 rounded-lg hover:bg-white/5 text-muted hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-bg" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold mb-1">Services Gallery</h2>
                <p className="text-muted text-sm">Real-time status tracking and instance management</p>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-accent/20">
                  <Play className="w-4 h-4 fill-current" /> Up All
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-sm font-medium transition-all">
                  <RotateCcw className="w-4 h-4" /> Restart
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-error/10 hover:bg-error/20 border border-error/20 text-error rounded-lg text-sm font-medium transition-all">
                  <Square className="w-4 h-4 fill-current" /> Down
                </button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-50 animate-pulse">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-48 glass-card" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredContainers.map((container) => (
                  <div key={container.Id} className="glass-card group overflow-hidden hover:border-accent/40 transition-all duration-300">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            container.State === 'running' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                          )}>
                            <Database className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg leading-tight group-hover:text-accent transition-colors">
                              {container.Names[0].replace('/', '')}
                            </h3>
                            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">{container.Image}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <div className="p-1.5 rounded-lg hover:bg-white/5 text-muted cursor-pointer"><MoreVertical className="w-4 h-4" /></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                          <div className="flex items-center gap-2 text-[10px] text-muted mb-1 uppercase font-bold tracking-tighter">
                            <Cpu className="w-3 h-3 text-accent" /> CPU
                          </div>
                          <div className="text-sm font-mono font-bold tracking-widest">{container.Status.includes('Up') ? '8.4%' : '0%'}</div>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                          <div className="flex items-center gap-2 text-[10px] text-muted mb-1 uppercase font-bold tracking-tighter">
                            <HardDrive className="w-3 h-3 text-warning" /> RAM
                          </div>
                          <div className="text-sm font-mono font-bold tracking-widest">{container.Status.includes('Up') ? '128MB' : '0MB'}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex gap-1">
                          <button className="p-2 rounded-lg hover:bg-white/5 text-muted transition-colors"><Terminal className="w-4 h-4" /></button>
                          <button className="p-2 rounded-lg hover:bg-white/5 text-muted transition-colors"><ExternalLink className="w-4 h-4" /></button>
                        </div>
                        <div className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest",
                          container.State === 'running' ? "bg-success/10 text-success border border-success/20" : "bg-dim text-muted border border-border"
                        )}>
                          {container.State}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- INTELLIGENCE SIDECAR --- */}
      <aside className="w-80 border-l border-border bg-black/40 backdrop-blur-xl flex flex-col z-10">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" /> Live Monitor
            </h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
              <div className="text-xs text-muted mb-2 font-medium">Memory Usage Heatmap</div>
              <div className="flex gap-1.5 h-1">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className={cn(
                    "flex-1 rounded-full",
                    i < 8 ? "bg-accent/40" : i < 11 ? "bg-warning/40" : "bg-error/40"
                  )} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 bg-white/5 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted">Audit Timeline</div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
            {events.length > 0 ? events.map((e, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                <div>
                  <div className="text-muted flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold tracking-tight">{new Date().toLocaleTimeString()}</span>
                    <span className="px-1.5 py-0.5 rounded bg-dim text-[8px] uppercase tracking-tighter">{e.Action}</span>
                  </div>
                  <div className="text-white/90 leading-relaxed font-mono">
                    {e.Type} <span className="text-accent underline underline-offset-4 decoration-accent/30">{e.Actor?.Attributes?.name || 'unknown'}</span> was updated.
                  </div>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-xs text-muted italic opacity-40">
                Waiting for WebSocket events...
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export default App

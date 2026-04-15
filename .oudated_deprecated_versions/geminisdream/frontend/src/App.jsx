import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Square,
  Save,
  X,
  Plus,
  Cloud,
  CpuIcon,
  ChevronDown,
  Monitor
} from 'lucide-react'

// --- SHARED COMPONENTS ---
const NavItem = ({ icon: Icon, label, active, onClick, children }) => (
  <div className="group">
    <div 
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <Icon className={`w-4 h-4 ${active ? 'text-accent' : 'text-muted group-hover:text-white'}`} />
      <span className="flex-1">{label}</span>
      {children && <ChevronDown className={`w-3 h-3 transition-transform ${active ? 'rotate-180' : ''}`} />}
    </div>
  </div>
)

const HeatmapRow = ({ label, values }) => (
  <div className="mb-4">
    <div className="flex justify-between items-center mb-1.5 px-1">
      <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-mono text-accent">Active</span>
    </div>
    <div className="flex gap-1.5 h-2">
      {values.map((v, i) => (
        <div 
          key={i} 
          className="flex-1 rounded-sm" 
          style={{ 
            backgroundColor: `hsla(${v > 80 ? '0, 85%, 60%' : v > 50 ? '35, 90%, 55%' : '235, 85%, 65%'}, ${0.2 + (v / 100)})`,
            boxShadow: v > 90 ? '0 0 8px hsla(0, 85%, 60%, 0.4)' : 'none'
          }}
        />
      ))}
    </div>
  </div>
)

const App = () => {
  const [stacks, setStacks] = useState([])
  const [selectedStack, setSelectedStack] = useState(null)
  const [composeContent, setComposeContent] = useState('')
  const [events, setEvents] = useState([])
  const [sysStatus, setSysStatus] = useState({ host: 'connecting...', os: 'unknown' })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedNodes, setExpandedNodes] = useState(['homelab'])
  
  const logEndRef = useRef(null)

  // System Stats Mock Data (Real-time Feel)
  const [cpuUsage, setCpuUsage] = useState([...Array(10)].map(() => [...Array(12)].map(() => Math.random() * 100)))
  const [ramUsage, setRamUsage] = useState([...Array(10)].map(() => [...Array(12)].map(() => Math.random() * 100)))

  const fetchSysStatus = async () => {
    try {
      const res = await fetch('/api/system/status')
      const data = await res.json()
      setSysStatus(data)
    } catch (e) {
      console.error("Failed to fetch system status", e)
    }
  }

  useEffect(() => {
    fetchStacks()
    connectWebSocket()
    fetchSysStatus()
    
    // Auto-refresh status occasionally
    const timer = setInterval(fetchSysStatus, 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedStack) {
      fetchCompose(selectedStack)
    }
  }, [selectedStack])

  const fetchStacks = async () => {
    try {
      const res = await fetch('/api/stacks')
      const data = await res.json()
      setStacks(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch stacks:', err)
      setStacks([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCompose = async (name) => {
    try {
      const res = await fetch(`/api/stacks/compose/${name}`)
      const text = await res.text()
      setComposeContent(text)
    } catch (err) {
      console.error('Failed to fetch compose:', err)
      setComposeContent('# Failed to load compose file.\n# The backend returned a 404 or connection refused.')
    }
  }

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setEvents(prev => [data, ...prev].slice(0, 50))
    }
  }

  const toggleNode = (node) => {
    setExpandedNodes(prev => prev.includes(node) ? prev.filter(n => n !== node) : [...prev, node])
  }

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary overflow-hidden font-sans">
      <div className="bg-glow top-[-10%] left-[-10%]" />
      <div className="bg-glow bottom-[-10%] right-[-10%] opacity-50" />

      {/* --- UNIFIED NAVIGATOR (LEFT SIDEBAR) --- */}
      <aside className="w-80 glass-panel border-r flex flex-col z-20">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">HLC <span className="text-accent underline decoration-accent/30 decoration-2 underline-offset-4">V3</span></h1>
              <div className="text-[9px] font-bold text-muted uppercase tracking-[0.2em] opacity-60">Gemini's Dream</div>
            </div>
          </div>

          <div className="relative mb-8 group">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
            <input 
              type="text" 
              placeholder="Search universe..." 
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-accent/50 focus:bg-white/5 transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 custom-scrollbar space-y-1">
          <NavItem 
            icon={Monitor} 
            label="HomeLab" 
            active={expandedNodes.includes('homelab')} 
            onClick={() => toggleNode('homelab')} 
          />
          
          {expandedNodes.includes('homelab') && (
            <div className="pl-6 pt-1 space-y-1 border-l border-white/5 ml-4">
              <NavItem 
                icon={Box} 
                label="Primary Cluster" 
                active={expandedNodes.includes('node1')}
                onClick={() => toggleNode('node1')}
              />
              {expandedNodes.includes('node1') && (
                <div className="pl-6 pt-1 space-y-1 border-l border-white/5 ml-4">
                  <div className="text-[10px] font-bold text-muted/40 uppercase tracking-widest mb-2 mt-4 px-2">Stacks</div>
                  {stacks.map(s => (
                    <div 
                      key={s} 
                      className={`nav-item !py-1.5 text-xs ${selectedStack === s ? 'active' : ''}`}
                      onClick={() => setSelectedStack(s)}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${selectedStack === s ? 'bg-accent shadow-[0_0_8px_var(--accent)]' : 'bg-white/20'} mr-3`} />
                      {s}
                    </div>
                  ))}
                  {stacks.length === 0 && <div className="text-[10px] text-muted italic px-4 py-2">No stacks discovered</div>}
                </div>
              )}
              <NavItem icon={Database} label="Storage Pool" />
              <NavItem icon={Network} label="Gateway Alpha" />
            </div>
          )}

          <div className="mt-8 mb-4 px-4 text-[10px] font-bold text-muted uppercase tracking-[0.2em] opacity-40">System Core</div>
          <NavItem icon={Activity} label="Fleet Monitor" />
          <NavItem icon={ShieldAlert} label="Policy Control" />
          <NavItem icon={Settings} label="Operator Settings" />
        </nav>

        <div className="p-6 mt-auto bg-white/[0.02] border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-[#4f46e5] flex items-center justify-center text-white text-sm font-black shadow-lg">
                SF
              </div>
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-success rounded-full border-[3px] border-[#020308] status-glow-success" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">Sebastian F.</div>
              <div className="text-[10px] text-muted truncate uppercase tracking-tighter font-mono">System Architect</div>
            </div>
          </div>
        </div>
      </aside>

      {/* --- COMMAND DECK (MAIN EDITOR AREA) --- */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-black/20 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <Layers className="w-5 h-5 text-accent" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] text-muted font-bold uppercase tracking-widest">
                Nodes <ChevronRight className="w-3 h-3" /> Stacks <ChevronRight className="w-3 h-3" />
              </div>
              <div className="text-sm font-bold flex items-center gap-2">
                {selectedStack || 'Deployment Overview'}
                {selectedStack && <div className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[8px] uppercase">YAML V3.8</div>}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 pr-6 border-r border-white/10">
              <div className="flex -space-x-2">
                {[1,2,3].map(i => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 border-bg-primary bg-accent/20 flex items-center justify-center text-[10px] font-bold">U{i}</div>
                ))}
              </div>
              <span className="text-[10px] font-bold text-muted uppercase tracking-tighter">In Sync</span>
            </div>
            
            <div className="flex gap-2">
              {selectedStack && (
                <>
                  <button className="btn-secondary px-3"><RotateCcw className="w-4 h-4" /> Rebuild</button>
                  <button className="btn-primary"><Play className="w-4 h-4 fill-current" /> Deploy</button>
                </>
              )}
              {!selectedStack && <button className="btn-primary"><Plus className="w-4 h-4" /> New Stack</button>}
            </div>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden flex flex-col">
          {selectedStack ? (
            <div className="flex-1 flex flex-col p-8 pb-0">
              <div className="flex-1 glass-card border border-white/5 bg-black/40 flex flex-col overflow-hidden shadow-2xl">
                <div className="h-10 bg-white/5 border-b border-white/5 flex items-center justify-between px-4 shrink-0">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-error/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-warning/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-success/40" />
                  </div>
                  <div className="text-[10px] font-mono text-muted/60 tracking-widest uppercase">docker-compose.yml — modified</div>
                  <div className="flex gap-4">
                    <button className="text-muted hover:text-white transition-colors"><Save className="w-3.5 h-3.5" /></button>
                    <button className="text-muted hover:text-white transition-colors" onClick={() => setSelectedStack(null)}><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex-1 flex overflow-hidden">
                  <div className="w-12 bg-black/20 border-r border-white/5 pt-4 text-right pr-3 text-[10px] font-mono text-muted/30 select-none leading-6">
                    {Array.from({length: 40}).map((_, i) => <div key={i}>{i+1}</div>)}
                  </div>
                  <textarea 
                    className="flex-1 bg-transparent p-4 font-mono text-sm leading-6 resize-none outline-none focus:ring-0 text-text-primary caret-accent custom-scrollbar"
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="h-12 flex items-center justify-between px-2">
                <div className="flex gap-6 text-[9px] font-bold text-muted uppercase tracking-[0.2em] px-4">
                  <span>UTF-8</span>
                  <span>Spaces: 2</span>
                  <span>YAML</span>
                </div>
                <div className="flex gap-1">
                   <div className="px-3 py-1 rounded bg-white/5 text-[10px] font-mono text-muted">Ln 14, Col 22</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-20">
              <div className="grid grid-cols-2 gap-8 max-w-4xl w-full">
                <div className="glass-card p-10 flex flex-col items-center text-center group cursor-pointer hover:bg-accent/5 hover:border-accent/40">
                  <div className="w-16 h-16 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Layers className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-xl font-black mb-2">Deploy Workspace</h3>
                  <p className="text-sm text-muted">Select a stack from the navigator or upload a new YAML configuration.</p>
                </div>
                <div className="glass-card p-10 flex flex-col items-center text-center group cursor-pointer hover:bg-success/5 hover:border-success/40">
                  <div className="w-16 h-16 rounded-3xl bg-success/10 border border-success/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <CpuIcon className="w-8 h-8 text-success" />
                  </div>
                  <h3 className="text-xl font-black mb-2">System Health</h3>
                  <p className="text-sm text-muted">View live metrics and node allocation across your entire cluster.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- INTELLIGENCE SIDECAR (RIGHT SIDEBAR) --- */}
      <aside className="w-96 glass-panel border-l flex flex-col z-10 bg-black/40">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-black text-xs uppercase tracking-[0.3em] flex items-center gap-3">
              <Activity className="w-4 h-4 text-accent" /> Intelligence
            </h2>
            <div className="p-1 px-2 rounded-md bg-white/5 border border-white/10 text-[9px] font-black text-muted uppercase tracking-tighter">Live v4.2</div>
          </div>
          
          <div className="space-y-6">
            <HeatmapRow label="CPU Allocation" values={cpuUsage[0]} />
            <HeatmapRow label="Memory Pressure" values={ramUsage[0]} />
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Audit Timeline</span>
            <MoreVertical className="w-4 h-4 text-muted cursor-pointer" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar font-mono text-[11px]">
            {events.length > 0 ? events.map((e, i) => (
              <div key={i} className="flex gap-4 group">
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  <div className={`w-2 h-2 rounded-full ${e.Action?.includes('start') ? 'bg-success' : 'bg-accent'} active-glow-${e.Action?.includes('start') ? 'success' : 'accent'}`} />
                  <div className="w-[1px] flex-1 bg-white/5 group-last:hidden" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-3 mb-1 text-muted">
                    <span className="font-bold text-accent">[{new Date().toLocaleTimeString()}]</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] uppercase tracking-tighter text-white/50">{e.Action || 'EVENT'}</span>
                  </div>
                  <div className="text-white/80 leading-relaxed border-l-2 border-white/5 pl-3 mt-2 italic">
                    {e.Type} <span className="text-white font-bold">{e.Actor?.Attributes?.name || 'sys-kernel'}</span> transition success.
                  </div>
                </div>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <Terminal className="w-12 h-12 mb-4" />
                <div className="text-xs italic uppercase tracking-widest">Awaiting Pulse...</div>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="p-8 border-t border-white/5 bg-black/20">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Docker Tether</span>
            <span className="text-[10px] font-mono text-accent truncate max-w-[150px]">{sysStatus.host}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Host OS</span>
            <span className="text-[10px] font-mono text-white underline decoration-accent/50 underline-offset-4">{sysStatus.os}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Network Load</span>
            <span className="text-[10px] font-mono text-success">1.2 GB/s</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-accent w-2/3 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
          </div>
        </div>
      </aside>
    </div>
  )
}

export default App

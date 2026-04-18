import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Database, Play, Table2, Search } from 'lucide-react'
import * as api from '@/lib/api'
import { toast } from 'sonner'

interface QueryResult {
  rows: Array<Record<string, unknown>>
  total: number
  limit: number
  offset: number
}

export function DatabaseExplorer() {
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [tableSearch, setTableSearch] = useState('')
  const [queryInput, setQueryInput] = useState('')
  const [queryPage, setQueryPage] = useState(0)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['database', 'stats'],
    queryFn: api.fetchDatabaseStats,
    refetchInterval: 30000,
  })

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['database', 'tables'],
    queryFn: api.fetchDatabaseTables,
  })

  const queryMutation = useMutation({
    mutationFn: ({ query, offset }: { query: string; offset: number }) => api.queryDatabase(query, 100, offset),
    onSuccess: (data) => setQueryResult(data),
    onError: (e: Error) => toast.error(e.message),
  })

  const formatBytesToMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)

  const runQuery = (query: string, page: number) => {
    if (!query.trim()) {
      toast.error('Enter a query')
      return
    }
    queryMutation.mutate({ query, offset: page * 100 })
  }

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName)
    const query = `SELECT * FROM "${tableName}"`
    setQueryInput(query)
    setQueryPage(0)
    runQuery(query, 0)
  }

  useEffect(() => {
    if (!selectedTable && tables.length > 0) {
      handleSelectTable(tables[0].tablename)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables])

  useEffect(() => {
    if (!queryInput.trim()) return
    if (!queryResult) return
    runQuery(queryInput, queryPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryPage])

  const filteredTables = tables.filter((t) =>
    t.tablename.toLowerCase().includes(tableSearch.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold font-mono">Database Explorer</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          <div className="col-span-4 flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Size (MB)</p>
              <p className="text-2xl font-mono font-bold mt-1">{formatBytesToMb(stats.databaseSize)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Tables</p>
              <p className="text-2xl font-mono font-bold mt-1">{stats.tables}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Rows (Query)</p>
              <p className="text-2xl font-mono font-bold mt-1">{(queryResult?.total ?? 0).toLocaleString()}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Connections</p>
              <p className="text-2xl font-mono font-bold mt-1">{stats.connections}</p>
            </Card>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-12 gap-4 min-h-[70vh]">
        <Card className="col-span-12 md:col-span-3 p-0 overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Table2 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Tables</p>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
                placeholder="Filter tables..."
              />
            </div>
          </div>
          <div className="h-[62vh] overflow-y-auto p-2 space-y-1">
            {tablesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              filteredTables.map((table) => (
                <button
                  key={table.tablename}
                  type="button"
                  onClick={() => handleSelectTable(table.tablename)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    selectedTable === table.tablename
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-mono truncate">{table.tablename}</span>
                    <Badge variant="outline" className="text-[10px]">{table.column_count}c</Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="col-span-12 md:col-span-9 space-y-3">
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Query Editor</p>
              <Button
                size="sm"
                onClick={() => {
                  setQueryPage(0)
                  runQuery(queryInput, 0)
                }}
                disabled={queryMutation.isPending}
              >
                {queryMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                Run
              </Button>
            </div>
            <textarea
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="w-full h-36 rounded border border-border bg-background p-2 text-xs font-mono resize-none"
              spellCheck={false}
            />
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {queryResult
                  ? `Showing ${(queryPage * 100) + 1}-${Math.min((queryPage + 1) * 100, queryResult.total)} of ${queryResult.total.toLocaleString()} rows`
                  : 'No query results yet'}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQueryPage((p) => Math.max(0, p - 1))}
                  disabled={queryPage === 0 || !queryResult || queryMutation.isPending}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQueryPage((p) => p + 1)}
                  disabled={!queryResult || (queryPage + 1) * 100 >= queryResult.total || queryMutation.isPending}
                >
                  Next
                </Button>
              </div>
            </div>
            <div className="h-[50vh] overflow-auto">
              {queryMutation.isPending ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : queryResult && queryResult.rows.length > 0 ? (
                <table className="w-full text-xs font-mono">
                  <thead className="bg-muted/40 border-b border-border sticky top-0">
                    <tr>
                      {Object.keys(queryResult.rows[0]).map((key) => (
                        <th key={key} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-muted/20">
                        {Object.values(row).map((value, i) => (
                          <td key={i} className="px-2 py-1.5 whitespace-nowrap max-w-[280px] overflow-hidden text-ellipsis">
                            {value === null ? <span className="text-muted-foreground">NULL</span> : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Select a table on the left or run a SELECT query.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

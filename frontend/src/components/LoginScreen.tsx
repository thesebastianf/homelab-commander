import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { probeAuth, setStoredCredentials } from '@/lib/api'
import { Lock, Eye, EyeOff } from 'lucide-react'

interface LoginScreenProps {
  onAuthenticated: () => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !pass) {
      setError('Username and password are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const ok = await probeAuth(user, pass)
      if (ok) {
        setStoredCredentials(user, pass)
        onAuthenticated()
      } else {
        setError('Invalid username or password.')
      }
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/thc_large_.png"
            alt="Homelab Commander"
            className="w-20 h-20 object-contain"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold font-mono tracking-tight">
              The Homelab Commander
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to continue
            </p>
          </div>
        </div>

        <Card className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="w-4 h-4" />
              <span>Authentication required</span>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hlc-user">Username</Label>
                <Input
                  id="hlc-user"
                  autoComplete="username"
                  value={user}
                  onChange={e => setUser(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hlc-pass">Password</Label>
                <div className="relative">
                  <Input
                    id="hlc-pass"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPass(v => !v)}
                    tabIndex={-1}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

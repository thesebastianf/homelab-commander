export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <img
          src="/thc_large_.png"
          alt="THC Logo"
          className="w-32 h-32 object-contain animate-pulse"
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold font-mono tracking-tight">
            The Homelab Commander
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Initializing dashboard...
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-100" />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-200" />
        </div>
      </div>
    </div>
  )
}

import { BarChart3 } from 'lucide-react'

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
        <BarChart3 className="h-5 w-5" />
      </div>
      <span className="font-display text-lg font-semibold">Indica</span>
    </div>
  )
}

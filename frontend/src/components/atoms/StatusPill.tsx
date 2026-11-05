import type { ReactNode } from 'react'

type Tone = 'green' | 'amber' | 'red' | 'muted' | 'blue'

const tones: Record<Tone, string> = {
  green: 'border-mint/20 bg-mint/10 text-mint',
  amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  red: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  muted: 'border-white/10 bg-white/[0.04] text-slate-400',
  blue: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
}

export function StatusPill({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

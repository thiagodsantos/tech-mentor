import type { ReactNode } from 'react'
import { BookOpen, GraduationCap, History, Settings2, Sparkles } from 'lucide-react'
import type { AppView, CreditsResponse } from '../../types'
import { formatCredits, formatDate } from '../../lib/format'
import { StatusPill } from '../atoms/StatusPill'

type Props = {
  view: AppView
  onNavigate: (view: AppView) => void
  children: ReactNode
  keyConfigured: boolean | null
  credits: CreditsResponse | null
  creditsLoading: boolean
}

const navigation: Array<{ id: AppView; title: string; hint: string; icon: typeof GraduationCap }> = [
  { id: 'tutor', title: 'Novo aprendizado', hint: 'Seu tutor pessoal', icon: GraduationCap },
  { id: 'history', title: 'Biblioteca', hint: 'Aulas anteriores', icon: History },
  { id: 'settings', title: 'Configurações', hint: 'Modelo e conexão', icon: Settings2 },
]

function CreditBadge({ credits, loading }: { credits: CreditsResponse | null; loading: boolean }) {
  const amount = formatCredits(credits?.credits)
  const tone = credits?.status === 'ok' ? 'green' : credits?.status === 'error' ? 'amber' : 'muted'
  return (
    <div className="hidden items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 md:flex" title={credits?.error || (credits?.checked_at ? `Atualizado ${formatDate(credits.checked_at)}` : 'Aguardando a primeira consulta de créditos')}>
      <span className={`h-2 w-2 rounded-full ${credits?.status === 'ok' ? 'bg-mint' : credits?.status === 'error' ? 'bg-amber-300' : 'bg-slate-600'} ${credits?.status === 'ok' ? 'shadow-[0_0_9px_rgba(186,243,106,.6)]' : ''}`} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Créditos OpenRouter</p>
        <p className="mt-0.5 text-xs font-medium text-slate-200">{loading ? 'Atualizando…' : amount ?? (credits?.status === 'error' ? 'Indisponível' : 'Aguardando')}</p>
      </div>
      <StatusPill tone={tone}>{credits?.status === 'ok' ? 'ativo' : credits?.status === 'error' ? 'atenção' : '—'}</StatusPill>
    </div>
  )
}

export function AppShell({ view, onNavigate, children, keyConfigured, credits, creditsLoading }: Props) {
  const active = navigation.find((item) => item.id === view) ?? navigation[0]
  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-line bg-[#0c1016] px-4 py-6 lg:flex">
        <button type="button" onClick={() => onNavigate('tutor')} className="mb-11 flex items-center gap-3 px-2 text-left" aria-label="Tech Mentor, ir para novo aprendizado">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-canvas shadow-[0_0_24px_rgba(186,243,106,.16)]"><BookOpen size={20} strokeWidth={2.4} /></span>
          <span><span className="block text-[15px] font-bold tracking-tight text-white">tech<span className="text-mint">mentor</span></span><span className="mt-0.5 block text-[10px] uppercase tracking-[0.18em] text-slate-500">aprenda com clareza</span></span>
        </button>
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Seu espaço</p>
        <nav aria-label="Navegação principal" className="space-y-1">
          {navigation.map(({ id, title, hint, icon: Icon }) => {
            const selected = view === id
            return (
              <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={selected ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${selected ? 'bg-mint/10 text-mint' : 'bg-white/[0.04] text-slate-500 group-hover:text-slate-300'}`}><Icon size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{hint}</span></span>
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-line bg-gradient-to-br from-[#151d25] to-[#0f141b] p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-mint/10 text-mint"><Sparkles size={16} /></div>
          <p className="text-sm font-semibold text-slate-200">Aprenda no seu ritmo</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">Aulas feitas para transformar curiosidade em prática.</p>
          <button type="button" onClick={() => onNavigate('tutor')} className="mt-4 text-xs font-semibold text-mint hover:text-white">Começar uma aula <span aria-hidden="true">↗</span></button>
        </div>
        <div className="mt-4 flex items-center gap-2 px-2 text-[11px] text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-mint/70" /> Execução local · seus dados ficam no seu ambiente</div>
      </aside>

      <div className="min-h-screen lg:pl-[250px]">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-canvas/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint text-canvas lg:hidden"><BookOpen size={18} /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">Tech Mentor</p><h1 className="truncate text-sm font-semibold text-white sm:text-base">{active.title}</h1></div>
              <span className="hidden text-slate-700 sm:inline">/</span>
              <p className="hidden truncate text-sm text-slate-500 sm:block">{active.hint}</p>
            </div>
            <div className="flex items-center gap-3">
              <CreditBadge credits={credits} loading={creditsLoading} />
              <button type="button" onClick={() => onNavigate('settings')} className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600" aria-label="Abrir configurações da chave">
                <span className={`h-2 w-2 rounded-full ${keyConfigured ? 'bg-mint' : 'bg-amber-300'}`} />
                <span className="hidden sm:inline">{keyConfigured === null ? 'Conectando' : keyConfigured ? 'OpenRouter conectado' : 'Configurar OpenRouter'}</span>
                <Settings2 size={14} className="sm:hidden" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 sm:px-7 sm:pt-9 lg:px-10 lg:pb-12">
          {children}
        </main>
      </div>

      <nav aria-label="Navegação móvel" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-line bg-[#0c1016]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl lg:hidden">
        {navigation.map(({ id, title, icon: Icon }) => {
          const selected = view === id
          return <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={selected ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium ${selected ? 'text-mint' : 'text-slate-500'}`}><Icon size={18} /><span>{title}</span></button>
        })}
      </nav>
    </div>
  )
}

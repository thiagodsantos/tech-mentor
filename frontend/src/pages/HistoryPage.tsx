import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, CircleAlert, Clock3, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import type { Lesson } from '../types'
import { StatusPill } from '../components/atoms/StatusPill'

export function HistoryPage({ onOpenLesson }: { onOpenLesson: (lesson: Lesson) => void }) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  async function loadLessons() {
    setLoading(true)
    setError('')
    try {
      setLessons(await api.getLessons())
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Não foi possível carregar seu histórico.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadLessons() }, [])

  const filtered = useMemo(() => lessons.filter((lesson) => `${lesson.topic} ${lesson.goal} ${lesson.level}`.toLowerCase().includes(query.toLowerCase())), [lessons, query])

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><StatusPill tone="blue"><BookOpen size={12} /> Sua biblioteca</StatusPill><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Tudo que você já aprendeu.</h2><p className="mt-2 text-sm text-slate-500">Suas aulas ficam guardadas para você continuar de onde parou.</p></div>
        <div className="relative w-full sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" /><input aria-label="Buscar aulas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aulas…" className="field-input pl-10" /></div>
      </section>
      <div className="flex items-center justify-between border-b border-line pb-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Aulas salvas</p><span className="text-xs text-slate-500">{loading ? '…' : `${lessons.length} ${lessons.length === 1 ? 'aula' : 'aulas'}`}</span></div>

      {loading ? <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-mint" size={17} /> Carregando sua biblioteca…</div> : error ? (
        <div role="alert" className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-6"><div className="flex items-start gap-3"><CircleAlert size={18} className="mt-0.5 text-amber-300" /><div><h3 className="font-medium text-amber-100">Não foi possível acessar o histórico</h3><p className="mt-1 text-sm text-amber-100/70">{error}</p><button type="button" onClick={() => void loadLessons()} className="mt-4 rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-300/10">Tentar novamente</button></div></div></div>
      ) : lessons.length === 0 ? (
        <div className="flex min-h-[370px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-panel/35 px-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-slate-500"><Sparkles size={21} /></span><h3 className="mt-5 text-lg font-semibold text-slate-200">Sua biblioteca está esperando pela primeira aula</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Quando você gerar uma explicação, ela aparecerá aqui para revisitar sempre que quiser.</p></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel px-5 py-12 text-center text-sm text-slate-500">Nenhuma aula encontrada para “{query}”.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lesson) => (
            <button key={lesson.id} type="button" onClick={() => onOpenLesson(lesson)} className="group flex min-h-[185px] flex-col rounded-2xl border border-line bg-panel p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-[#141b24]">
              <div className="flex w-full items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint/10 text-mint"><BookOpen size={17} /></span><ArrowUpRight size={16} className="text-slate-600 transition group-hover:text-mint" /></div>
              <h3 className="mt-5 line-clamp-2 text-base font-semibold text-slate-100">{lesson.topic}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{lesson.goal}</p>
              <div className="mt-auto flex w-full items-center justify-between gap-2 pt-5"><span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 size={12} />{formatDate(lesson.created_at)}</span><span className="truncate rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-slate-400">{lesson.level}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

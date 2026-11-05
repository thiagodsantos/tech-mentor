import { isValidElement, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { Check, Code2, Copy, Eye, LoaderCircle, MessageCircle, MessageSquarePlus, NotebookPen, Star, Trash2, X } from 'lucide-react'
import { Tabs } from '@base-ui/react/tabs'
import type { Lesson, LessonComplement, LessonFeedback, Note } from '../../types'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { MermaidBlock } from './MermaidBlock'
import { StatusPill } from '../atoms/StatusPill'

type Mode = 'preview' | 'code'
type BlockMode = 'preview' | 'code'

function getText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return getText(node.props.children)
  return ''
}

function CodeFence({ source, language, highlighted }: { source: string; language: string; highlighted: ReactNode }) {
  const [mode, setMode] = useState<BlockMode>('preview')
  const [copied, setCopied] = useState(false)

  if (language === 'mermaid') return <MermaidBlock source={source} />

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="my-5 overflow-hidden rounded-xl border border-line bg-[#0d1219]" aria-label={`Bloco de código${language ? ` ${language}` : ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="text-xs font-medium text-slate-400">{language || 'código'}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMode('preview')} aria-pressed={mode === 'preview'} className={`switch-tab ${mode === 'preview' ? 'switch-tab-active' : ''}`}><Eye size={13} /> Preview</button>
          <button type="button" onClick={() => setMode('code')} aria-pressed={mode === 'code'} className={`switch-tab ${mode === 'code' ? 'switch-tab-active' : ''}`}><Code2 size={13} /> Code</button>
          <button type="button" onClick={copyCode} className="icon-button ml-1" aria-label="Copiar código" title="Copiar código">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6"><code className={mode === 'preview' ? `hljs language-${language}` : ''}>{mode === 'preview' ? highlighted : source}</code></pre>
    </section>
  )
}

function extractCodeChild(children: ReactNode) {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return null
  const props = children.props
  const language = props.className?.match(/language-([\w-]+)/)?.[1] ?? ''
  const source = getText(props.children).replace(/\n$/, '')
  return { language, source, highlighted: props.children }
}

const markdownComponents: Components = {
  pre({ children }) {
    const block = extractCodeChild(children)
    if (!block) return <pre>{children}</pre>
    return <CodeFence {...block} />
  },
  code({ className, children, node: _node, ...props }) {
    return <code className={className} {...props}>{children}</code>
  },
  a({ href, children, node: _node, ...props }) {
    const safeHref = href?.startsWith('https://') || href?.startsWith('http://') ? href : undefined
    return <a href={safeHref} target={safeHref ? '_blank' : undefined} rel={safeHref ? 'noopener noreferrer' : undefined} {...props}>{children}</a>
  },
}

export function MarkdownPanel({ lesson, onLessonUpdated }: { lesson: Lesson; onLessonUpdated: (lesson: Lesson) => void }) {
  const [mode, setMode] = useState<Mode>('preview')
  const [feedback, setFeedback] = useState<LessonFeedback | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(true)
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [noteContent, setNoteContent] = useState('')
  const [includeInRag, setIncludeInRag] = useState(true)
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [noteMessage, setNoteMessage] = useState('')
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [complements, setComplements] = useState<LessonComplement[]>([])
  const [complementsLoading, setComplementsLoading] = useState(false)
  const [complementPrompt, setComplementPrompt] = useState('')
  const [complementSubmitting, setComplementSubmitting] = useState(false)
  const [complementActionId, setComplementActionId] = useState<string | null>(null)
  const [complementError, setComplementError] = useState('')
  const [complementNotice, setComplementNotice] = useState('')
  const content = lesson.content || ''
  const lessonNotes = notes.filter((note) => note.lesson_id === lesson.id)
  const pendingComplements = complements.filter((complement) => complement.status === 'pending')

  useEffect(() => {
    let active = true
    setFeedbackLoading(true)
    setNotesLoading(true)
    setComplementsLoading(true)
    setComplements([])
    setFeedbackError('')
    setNoteError('')
    setComplementError('')
    void api.getFeedback(lesson.id).then((saved) => {
      if (!active) return
      setFeedback(saved)
      setRating(saved?.rating ?? 0)
      setComment(saved?.comment ?? '')
    }).catch((error) => {
      if (active) setFeedbackError(apiErrorMessage(error, 'Não foi possível carregar a avaliação.'))
    }).finally(() => {
      if (active) setFeedbackLoading(false)
    })
    void api.getComplements(lesson.id).then((savedComplements) => {
      if (active) setComplements(savedComplements)
    }).catch((error) => {
      if (active) setComplementError(apiErrorMessage(error, 'Não foi possível carregar os complementos pendentes.'))
    }).finally(() => {
      if (active) setComplementsLoading(false)
    })
    void api.getNotes().then((savedNotes) => {
      if (active) setNotes(savedNotes)
    }).catch((error) => {
      if (active) setNoteError(apiErrorMessage(error, 'Não foi possível carregar suas anotações.'))
    }).finally(() => {
      if (active) setNotesLoading(false)
    })
    return () => { active = false }
  }, [lesson.id])

  async function submitComplement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = complementPrompt.trim()
    if (!prompt) return
    setComplementSubmitting(true)
    setComplementError('')
    setComplementNotice('')
    try {
      const candidate = await api.createComplement(lesson.id, prompt)
      setComplements((current) => [candidate, ...current])
      setComplementPrompt('')
      setComplementNotice('Complemento gerado. Revise e escolha se deseja adicioná-lo ao estudo.')
    } catch (error) {
      setComplementError(apiErrorMessage(error, 'Não foi possível gerar o complemento.'))
    } finally {
      setComplementSubmitting(false)
    }
  }

  async function acceptComplement(candidate: LessonComplement) {
    setComplementActionId(candidate.id)
    setComplementError('')
    setComplementNotice('')
    try {
      const updatedLesson = await api.acceptComplement(lesson.id, candidate.id)
      setComplements((current) => current.map((item) => item.id === candidate.id ? { ...item, status: 'accepted' } : item))
      onLessonUpdated(updatedLesson)
      setComplementNotice('Complemento aceito e incorporado ao estudo e às próximas buscas.')
    } catch (error) {
      setComplementError(apiErrorMessage(error, 'Não foi possível aceitar o complemento.'))
    } finally {
      setComplementActionId(null)
    }
  }

  async function rejectComplement(candidate: LessonComplement) {
    setComplementActionId(candidate.id)
    setComplementError('')
    setComplementNotice('')
    try {
      const updated = await api.rejectComplement(lesson.id, candidate.id)
      setComplements((current) => current.map((item) => item.id === candidate.id ? updated : item))
      setComplementNotice('Resposta descartada; ela não foi adicionada ao estudo.')
    } catch (error) {
      setComplementError(apiErrorMessage(error, 'Não foi possível descartar o complemento.'))
    } finally {
      setComplementActionId(null)
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (rating < 1 || rating > 5) return
    setFeedbackSaving(true)
    setFeedbackError('')
    try {
      const saved = await api.createFeedback(lesson.id, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) })
      setFeedback(saved)
    } catch (error) {
      setFeedbackError(apiErrorMessage(error, 'Não foi possível registrar sua avaliação.'))
    } finally {
      setFeedbackSaving(false)
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = noteContent.trim()
    if (!trimmed) return
    setNoteSaving(true)
    setNoteError('')
    setNoteMessage('')
    try {
      const saved = await api.createNote({ topic: lesson.topic, content: trimmed, lesson_id: lesson.id, include_in_rag: includeInRag })
      setNotes((current) => [saved, ...current])
      setNoteContent('')
      setNoteMessage(saved.include_in_rag ? 'Anotação salva e incluída no contexto das próximas aulas.' : 'Anotação salva sem inclusão no RAG.')
    } catch (error) {
      setNoteError(apiErrorMessage(error, 'Não foi possível salvar a anotação.'))
    } finally {
      setNoteSaving(false)
    }
  }

  async function removeNote(noteId: string) {
    setDeletingNoteId(noteId)
    setNoteError('')
    setNoteMessage('')
    try {
      await api.deleteNote(noteId)
      setNotes((current) => current.filter((note) => note.id !== noteId))
      setNoteMessage('Anotação removida do histórico e do contexto de recuperação.')
    } catch (error) {
      setNoteError(apiErrorMessage(error, 'Não foi possível remover a anotação.'))
    } finally {
      setDeletingNoteId(null)
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-panel shadow-glow">
      <Tabs.Root value={mode} onValueChange={(value) => setMode(value as Mode)} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill tone="green">Aula gerada</StatusPill>
            <span className="text-xs text-slate-500">{formatDate(lesson.created_at)}</span>
          </div>
          <h2 className="break-words text-xl font-semibold tracking-tight text-white sm:text-2xl">{lesson.topic}</h2>
          <p className="mt-1 text-sm text-slate-400">{lesson.level} <span className="mx-1.5 text-slate-600">·</span> {lesson.model}</p>
        </div>
        <Tabs.List className="flex shrink-0 rounded-lg border border-line bg-canvas p-1" aria-label="Visualização da resposta">
          <Tabs.Tab type="button" value="preview" className={`switch-tab ${mode === 'preview' ? 'switch-tab-active' : ''}`}><Eye size={14} /> Preview</Tabs.Tab>
          <Tabs.Tab type="button" value="code" className={`switch-tab ${mode === 'code' ? 'switch-tab-active' : ''}`}><Code2 size={14} /> Code</Tabs.Tab>
        </Tabs.List>
      </header>
      <Tabs.Panel value="code"><pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-6 text-slate-300 sm:p-7"><code>{content}</code></pre></Tabs.Panel>
      <Tabs.Panel value="preview">
        <div className="markdown-content px-5 py-6 sm:px-8 sm:py-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize, rehypeHighlight]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      </Tabs.Panel>
      </Tabs.Root>

      <section className="border-t border-line p-4 sm:p-5" aria-labelledby="lesson-complement-title">
        <div className="flex items-center gap-2"><MessageSquarePlus size={16} className="text-mint" /><h3 id="lesson-complement-title" className="text-sm font-semibold text-white">Quer aprofundar ou esclarecer algo?</h3></div>
        <p className="mt-1 text-xs leading-5 text-slate-500">A resposta considera a aula completa atual e seu novo pedido. Ela só entra no estudo se você aceitar.</p>
        <form onSubmit={submitComplement} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs text-slate-400" htmlFor={`lesson-complement-${lesson.id}`}>Novo prompt<textarea id={`lesson-complement-${lesson.id}`} value={complementPrompt} onChange={(event) => setComplementPrompt(event.target.value)} required maxLength={4000} rows={2} className="field-input mt-1.5 resize-y" placeholder="Ex.: Mostre um exemplo prático e explique cada etapa…" /></label>
          <button type="submit" disabled={!complementPrompt.trim() || complementSubmitting} className="primary-button shrink-0 !px-3 !py-2 text-xs">{complementSubmitting ? <LoaderCircle size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />} {complementSubmitting ? 'Gerando…' : 'Gerar complemento'}</button>
        </form>
        {complementsLoading && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={13} className="animate-spin" /> Buscando respostas pendentes…</p>}
        {complementError && <p role="alert" className="mt-3 text-xs text-rose-300">{complementError}</p>}
        {complementNotice && <p role="status" className="mt-3 text-xs text-mint">{complementNotice}</p>}
        {pendingComplements.map((candidate) => (
          <article key={candidate.id} className="mt-4 overflow-hidden rounded-xl border border-mint/20 bg-mint/[0.025]">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><div><StatusPill tone="amber">Aguardando sua decisão</StatusPill><p className="mt-2 text-xs text-slate-400">Pedido: {candidate.prompt}</p></div><span className="text-[10px] text-slate-600">Resposta sugerida</span></header>
            <div className="markdown-content max-h-56 overflow-y-auto px-4 py-3 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize, rehypeHighlight]} components={markdownComponents}>{candidate.content}</ReactMarkdown>
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              <button type="button" onClick={() => void acceptComplement(candidate)} disabled={complementActionId !== null} className="primary-button !px-3 !py-2 text-xs">{complementActionId === candidate.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Aceitar como complemento</button>
              <button type="button" onClick={() => void rejectComplement(candidate)} disabled={complementActionId !== null} className="secondary-button !px-3 !py-2 text-xs"><X size={14} /> Descartar</button>
            </footer>
          </article>
        ))}
      </section>

      <div className="grid gap-4 border-t border-line p-5 sm:p-7 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-canvas/50 p-4" aria-labelledby="lesson-feedback-title">
          <div className="flex items-center gap-2"><MessageCircle size={16} className="text-mint" /><h3 id="lesson-feedback-title" className="text-sm font-semibold text-white">Como foi esta aula?</h3></div>
          {feedbackLoading ? <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={13} className="animate-spin" /> Carregando avaliação…</p> : feedback ? (
            <div className="mt-4" role="status"><StatusPill tone="green"><Check size={12} /> Avaliação registrada</StatusPill><p className="mt-2 text-sm text-slate-300">Sua nota: {feedback.rating}/5</p>{feedback.comment && <p className="mt-1 text-xs leading-5 text-slate-500">{feedback.comment}</p>}</div>
          ) : (
            <form onSubmit={submitFeedback} className="mt-3 space-y-3">
              <fieldset><legend className="mb-2 text-xs text-slate-400">Avalie a utilidade da explicação</legend><div className="flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} de 5 estrelas`} aria-pressed={rating === value} className={`rounded-md p-1.5 transition ${value <= rating ? 'text-amber-300' : 'text-slate-600 hover:text-amber-200'}`}><Star size={19} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}</div></fieldset>
              <label className="block text-xs text-slate-400" htmlFor={`feedback-comment-${lesson.id}`}>Comentário opcional<textarea id={`feedback-comment-${lesson.id}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={2} className="field-input mt-1.5 resize-y" placeholder="O que ajudou ou pode melhorar?" /></label>
              {feedbackError && <p role="alert" className="text-xs text-rose-300">{feedbackError}</p>}
              <button type="submit" disabled={rating === 0 || feedbackSaving} className="secondary-button !px-3 !py-2 text-xs">{feedbackSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Enviar avaliação</button>
            </form>
          )}
          {feedbackError && feedback && <p role="alert" className="mt-2 text-xs text-rose-300">{feedbackError}</p>}
        </section>

        <section className="rounded-xl border border-line bg-canvas/50 p-4" aria-labelledby="lesson-notes-title">
          <div className="flex items-center gap-2"><NotebookPen size={16} className="text-sky-300" /><h3 id="lesson-notes-title" className="text-sm font-semibold text-white">Minhas anotações</h3></div>
          <form onSubmit={submitNote} className="mt-3 space-y-3">
            <label className="block text-xs text-slate-400" htmlFor={`lesson-note-${lesson.id}`}>Registre uma ideia para lembrar<textarea id={`lesson-note-${lesson.id}`} value={noteContent} onChange={(event) => setNoteContent(event.target.value)} required maxLength={10000} rows={3} className="field-input mt-1.5 resize-y" placeholder="Sua anotação sobre este tema…" /></label>
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-400"><input type="checkbox" checked={includeInRag} onChange={(event) => setIncludeInRag(event.target.checked)} className="mt-1 accent-[#baf36a]" />Usar esta anotação para contextualizar próximas aulas</label>
            {noteError && <p role="alert" className="text-xs text-rose-300">{noteError}</p>}
            {noteMessage && <p role="status" className="text-xs text-mint">{noteMessage}</p>}
            <button type="submit" disabled={!noteContent.trim() || noteSaving} className="secondary-button !px-3 !py-2 text-xs">{noteSaving ? <LoaderCircle size={14} className="animate-spin" /> : <NotebookPen size={14} />} Salvar anotação</button>
          </form>
          {(notesLoading || lessonNotes.length > 0) && <div className="mt-4 space-y-2 border-t border-line pt-3">
            {notesLoading ? <p className="text-xs text-slate-500">Carregando anotações…</p> : lessonNotes.map((note) => <div key={note.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-panel/70 p-3"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{note.content}</p><p className="mt-1 text-[10px] text-slate-600">{note.include_in_rag ? 'Incluída no RAG' : 'Fora do RAG'} · {formatDate(note.created_at)}</p></div><button type="button" onClick={() => void removeNote(note.id)} disabled={deletingNoteId === note.id} className="icon-button shrink-0 text-slate-500 hover:text-rose-300" aria-label="Excluir anotação" title="Excluir anotação">{deletingNoteId === note.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div>)}
          </div>}
        </section>
      </div>
    </article>
  )
}

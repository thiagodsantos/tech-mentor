import { useEffect, useId, useState } from 'react'
import DOMPurify from 'dompurify'

import { Tabs } from '@base-ui/react/tabs'
import { AlertTriangle, Check, Code2, Copy, Eye, LoaderCircle } from 'lucide-react'


type Mode = 'preview' | 'code'

export function MermaidBlock({ source }: { source: string }) {
  const reactId = useId()
  const [mode, setMode] = useState<Mode>('preview')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import('mermaid')
        if (!active) return
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#11161e',
            primaryColor: '#1e2937',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#baf36a',
            lineColor: '#94a3b8',
            secondaryColor: '#17212c',
            tertiaryColor: '#11161e',
            fontFamily: 'DM Sans, sans-serif',
          },
        })
        const { svg: rendered } = await mermaid.render(id, source)
        if (active) setSvg(DOMPurify.sanitize(rendered, { USE_PROFILES: { svg: true, svgFilters: true } }))
      } catch {
        if (active) setError('Não foi possível renderizar este diagrama. Confira a sintaxe ou visualize o código.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void renderDiagram()
    return () => { active = false }
  }, [id, source])

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="my-5 overflow-hidden rounded-xl border border-line bg-[#0d1219]" aria-label="Diagrama Mermaid">
      <Tabs.Root value={mode} onValueChange={(value) => setMode(value as Mode)} className="contents">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> Diagrama
          </div>
          <div className="flex items-center gap-1">
            <Tabs.List className="flex items-center gap-1" aria-label="Visualização do diagrama">
              <Tabs.Tab type="button" value="preview" className={`switch-tab ${mode === 'preview' ? 'switch-tab-active' : ''}`}><Eye size={13} /> Preview</Tabs.Tab>
              <Tabs.Tab type="button" value="code" className={`switch-tab ${mode === 'code' ? 'switch-tab-active' : ''}`}><Code2 size={13} /> Code</Tabs.Tab>
            </Tabs.List>
            <button type="button" onClick={copySource} className="icon-button ml-1" aria-label="Copiar código Mermaid" title="Copiar código Mermaid">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        <Tabs.Panel value="code"><pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-300"><code>{source}</code></pre></Tabs.Panel>
        <Tabs.Panel value="preview">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={16} /> Preparando diagrama…</div>
          ) : error ? (
            <div role="status" className="flex items-start gap-2 p-4 text-sm text-amber-200"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>
          ) : (
            <div className="mermaid-output overflow-x-auto p-5" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </Tabs.Panel>
      </Tabs.Root>
    </section>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/organisms/AppShell'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { TutorPage } from './pages/TutorPage'
import { api, apiErrorMessage } from './lib/api'
import type { AppSettings, AppView, CreditsResponse, Lesson, ModelsResponse } from './types'

export default function App() {
  const [view, setView] = useState<AppView>('tutor')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [modelsResponse, setModelsResponse] = useState<ModelsResponse | null>(null)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditsResponse | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [lessonFromHistory, setLessonFromHistory] = useState<Lesson | null>(null)

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true)
    setSettingsError(null)
    try {
      setSettings(await api.getSettings())
    } catch (error) {
      setSettingsError(apiErrorMessage(error, 'Não foi possível ler as configurações da API.'))
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  const refreshModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const response = await api.getModels()
      setModelsResponse(response)
      setModelsError(response.error)
    } catch (error) {
      setModelsError(apiErrorMessage(error, 'O catálogo de modelos está temporariamente indisponível.'))
      setModelsResponse(null)
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const refreshCredits = useCallback(async () => {
    setCreditsLoading(true)
    try {
      setCredits(await api.getCredits())
    } catch (error) {
      setCredits((current) => current ? { ...current, status: 'error', error: apiErrorMessage(error, 'Não foi possível consultar os créditos.') } : {
        status: 'error', credits: null, checked_at: null,
        error: apiErrorMessage(error, 'Não foi possível consultar os créditos.'),
      })
    } finally {
      setCreditsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSettings()
    void refreshModels()
    void refreshCredits()
  }, [refreshCredits, refreshModels, refreshSettings])

  useEffect(() => {
    const intervalSeconds = settings?.credits_poll_interval_seconds
    if (!intervalSeconds || intervalSeconds < 30) return
    const timer = window.setInterval(() => { void refreshCredits() }, intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [refreshCredits, settings?.credits_poll_interval_seconds])

  async function saveSettings(update: Pick<AppSettings, 'default_model' | 'credits_poll_interval_seconds'>) {
    const updated = await api.updateSettings(update)
    setSettings(updated)
  }

  function credentialChanged(configured: boolean) {
    setSettings((current) => current ? { ...current, openrouter_key_configured: configured } : current)
  }

  function openLesson(lesson: Lesson) {
    setLessonFromHistory(lesson)
    setView('tutor')
  }

  function navigate(nextView: AppView) {
    setView(nextView)
    if (nextView !== 'tutor') setLessonFromHistory(null)
  }

  return (
    <AppShell view={view} onNavigate={navigate} keyConfigured={settings?.openrouter_key_configured ?? null} credits={credits} creditsLoading={creditsLoading}>
      {view === 'tutor' && <TutorPage settings={settings} settingsLoading={settingsLoading} settingsError={settingsError} models={modelsResponse?.data ?? []} modelsLoading={modelsLoading} modelsError={modelsError} lessonFromHistory={lessonFromHistory} onOpenSettings={() => navigate('settings')} onSettingsRefresh={refreshSettings} />}
      {view === 'history' && <HistoryPage onOpenLesson={openLesson} />}
      {view === 'settings' && <SettingsPage settings={settings} settingsLoading={settingsLoading} settingsError={settingsError} onSaveSettings={saveSettings} modelsResponse={modelsResponse} modelsLoading={modelsLoading} modelsError={modelsError} onRefreshModels={refreshModels} credits={credits} creditsLoading={creditsLoading} onRefreshCredits={refreshCredits} onCredentialChanged={credentialChanged} />}
    </AppShell>
  )
}

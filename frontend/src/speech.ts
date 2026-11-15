import { useCallback, useEffect, useRef, useState } from 'react'

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
export const speechSupported = { input: !!SR, output: 'speechSynthesis' in window }

export const plainText = (md: string) =>
  md.replace(/```[\s\S]*?```/g, ' (code omitted) ').replace(/`([^`]+)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>|~-]{1,}/g, ' ').replace(/\s+/g, ' ').trim()

export function useSpeech(lang: string, rate = 1) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const rec = useRef<any>(null)

  const stopListening = useCallback(() => { rec.current?.stop(); setListening(false) }, [])
  const listen = useCallback((onFinal: (t: string) => void, onError?: (e: string) => void) => {
    if (!SR) { onError?.('Speech recognition is not supported in this browser. Use Chrome or Edge.'); return }
    const r = new SR()
    r.lang = lang; r.interimResults = true; r.continuous = false
    let finalText = ''
    r.onresult = (e: any) => {
      let i = ''
      for (const res of e.results) { if (res.isFinal) finalText += res[0].transcript; else i += res[0].transcript }
      setInterim(finalText + i)
    }
    r.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError?.(`Microphone error: ${e.error}`) }
    r.onend = () => { setListening(false); setInterim(''); if (finalText.trim()) onFinal(finalText.trim()) }
    rec.current = r; setListening(true); r.start()
  }, [lang])

  const cancelSpeech = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false) }, [])
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!speechSupported.output) { onEnd?.(); return }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 4000))
    u.lang = lang; u.rate = rate
    const v = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))
    if (v) u.voice = v
    u.onstart = () => setSpeaking(true)
    u.onend = u.onerror = () => { setSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(u)
  }, [lang, rate])

  useEffect(() => () => { rec.current?.abort?.(); window.speechSynthesis?.cancel() }, [])
  return { listening, speaking, interim, listen, stopListening, speak, cancelSpeech }
}

// components/alt/AiAssistant.tsx
'use client'

import { useState, useEffect, useRef, CSSProperties } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const suggestions = [
    'What investments are we currently tracking?',
    'Which fund has the strongest GP alignment?',
    'Compare management fees across our portfolio',
    'What are the biggest risks in our current pipeline?',
    'If you had to rank our opportunities, how would you order them?',
    'What questions should we be asking our GPs?',
  ]

  function formatMessage(content: string): React.ReactNode {
    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // Headers (##)
      if (line.startsWith('## ')) {
        elements.push(
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#0F1E2E', marginTop: 16, marginBottom: 6, letterSpacing: '-.01em', borderBottom: '1px solid #F0EEE8', paddingBottom: 4 }}>
            {line.replace('## ', '')}
          </div>
        )
      }
      // Bold headers (#)
      else if (line.startsWith('# ')) {
        elements.push(
          <div key={i} style={{ fontSize: 14, fontWeight: 800, color: '#0F1E2E', marginTop: 12, marginBottom: 8 }}>
            {line.replace('# ', '')}
          </div>
        )
      }
      // Bullet points
      else if (line.startsWith('- ') || line.startsWith('• ')) {
        const text = line.replace(/^[-•] /, '')
        // Handle **bold** within bullets
        const parts = text.split(/\*\*(.*?)\*\*/g)
        elements.push(
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 4 }}>
            <span style={{ color: '#4A9EE7', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>·</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
              {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
            </span>
          </div>
        )
      }
      // Numbered list
      else if (/^\d+\. /.test(line)) {
        const num = line.match(/^(\d+)\. /)?.[1]
        const text = line.replace(/^\d+\. /, '')
        const parts = text.split(/\*\*(.*?)\*\*/g)
        elements.push(
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ color: '#4A9EE7', fontWeight: 700, flexShrink: 0, minWidth: 18, marginTop: 1, fontSize: 12 }}>{num}.</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
              {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
            </span>
          </div>
        )
      }
      // Empty line
      else if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: 6 }} />)
      }
      // Regular paragraph with **bold** support
      else {
        const parts = line.split(/\*\*(.*?)\*\*/g)
        elements.push(
          <div key={i} style={{ fontSize: 13, color: '#333', lineHeight: 1.7, marginBottom: 2 }}>
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} style={{ color: '#1C2B3A' }}>{part}</strong> : part)}
          </div>
        )
      }
      i++
    }

    return <div>{elements}</div>
  }

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return

    const userMsg: Message = { role: 'user', content, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/alt/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: content, history: messages, sessionId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages([...newMessages, {
        role: 'assistant',
        content: data.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `Sorry, something went wrong: ${(err as Error).message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh', background: '#F4F3F0' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E8E6E0' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F1E2E', letterSpacing: '-.02em', marginBottom: 2 }}>✦ AI Investment Assistant</div>
        <div style={{ fontSize: 11, color: '#aaa' }}>Full portfolio context loaded · Trained on your notes and decisions · Ask anything</div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
            <div style={{ width: 48, height: 48, background: '#0F1E2E', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2B3A', marginBottom: 6, letterSpacing: '-.02em' }}>How can I help?</div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 24, textAlign: 'center' }}>I have full context on all your portfolio funds, documents, and team notes.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 520 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} style={{ padding: '10px 14px', background: '#fff', border: '1px solid #E8E6E0', borderRadius: 8, fontSize: 12, color: '#444', cursor: 'pointer', textAlign: 'left', fontWeight: 500, transition: 'all .1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#4A9EE7'; e.currentTarget.style.color = '#4A9EE7' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E6E0'; e.currentTarget.style.color = '#444' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                {msg.role === 'user' ? (
                  <div style={{ maxWidth: '70%', background: '#0F1E2E', color: '#fff', padding: '10px 14px', borderRadius: '12px 12px 2px 12px', fontSize: 13, lineHeight: 1.6 }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: '85%', background: '#fff', border: '1px solid #E8E6E0', padding: '14px 18px', borderRadius: '12px 12px 12px 2px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    {formatMessage(msg.content)}
                  </div>
                )}
                {msg.timestamp && (
                  <div style={{ fontSize: 10, color: '#ccc' }}>{msg.timestamp}</div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #E8E6E0', padding: '12px 16px', borderRadius: '12px 12px 12px 2px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A9EE7', animation: 'pulse 1s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A9EE7', animation: 'pulse 1s infinite .2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A9EE7', animation: 'pulse 1s infinite .4s' }} />
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '14px 24px', background: '#fff', borderTop: '1px solid #E8E6E0', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your portfolio, market conditions, fund terms... (Enter to send)"
          style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E0DED8', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'none', minHeight: 44, maxHeight: 120, fontFamily: 'inherit', lineHeight: 1.5, color: '#333', background: '#FAFAF8' }}
          rows={1}
          onFocus={e => { e.target.style.borderColor = '#4A9EE7'; e.target.style.background = '#fff' }}
          onBlur={e => { e.target.style.borderColor = '#E0DED8'; e.target.style.background = '#FAFAF8' }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{ padding: '10px 20px', background: !input.trim() || loading ? '#E0DED8' : '#0F1E2E', color: !input.trim() || loading ? '#aaa' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', height: 44, whiteSpace: 'nowrap', letterSpacing: '-.01em' }}
        >
          Send →
        </button>
      </div>
    </div>
  )
}

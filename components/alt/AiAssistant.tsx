// components/alt/AiAssistant.tsx
'use client'

import { useState, useEffect, useRef, CSSProperties } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AiAssistantProps {
  managerId?: string
  managerName?: string
}

export default function AiAssistant({ managerId, managerName }: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Suggested questions
  const suggestions = managerId ? [
    `What are the key risks of this fund?`,
    `How do the terms compare to market standard?`,
    `What are the strongest and weakest aspects of this opportunity?`,
    `Is the return target realistic given the strategy?`,
    `What questions should we ask the GP?`,
  ] : [
    'What is a typical management fee for a PE fund?',
    'How do I evaluate a private credit fund?',
    'What is a good Sharpe ratio for a hedge fund?',
    'Compare our portfolio across asset classes',
    'What are current market conditions for private equity?',
  ]

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return

    const userMessage: Message = { role: 'user', content }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/alt/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: content,
          history: messages,
          managerId: managerId || null,
          sessionId,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setMessages([...newMessages, { role: 'assistant', content: data.text }])
    } catch (err) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: `Error: ${(err as Error).message}. Please try again.`
      }])
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

  // Styles
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 500,
  }

  const headerStyle: CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #e0deda',
    background: '#fff',
  }

  const headerTitleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#111',
    marginBottom: 2,
  }

  const headerSubStyle: CSSProperties = {
    fontSize: 11,
    color: '#aaa',
  }

  const messagesStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: '#fafaf8',
  }

  const emptyStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: 16,
  }

  const emptyTitleStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 500,
    color: '#333',
    textAlign: 'center',
  }

  const suggestionsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    maxWidth: 480,
  }

  const suggestionBtnStyle: CSSProperties = {
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #e0deda',
    borderRadius: 6,
    fontSize: 12,
    color: '#444',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all .1s',
  }

  const messageStyle = (role: 'user' | 'assistant'): CSSProperties => ({
    maxWidth: '80%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? '#0F1E2E' : '#fff',
    color: role === 'user' ? '#fff' : '#111',
    padding: '10px 14px',
    borderRadius: role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    fontSize: 13,
    lineHeight: 1.6,
    border: role === 'assistant' ? '1px solid #e0deda' : 'none',
    whiteSpace: 'pre-wrap',
  })

  const inputAreaStyle: CSSProperties = {
    padding: '12px 16px',
    borderTop: '1px solid #e0deda',
    background: '#fff',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  }

  const inputStyle: CSSProperties = {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #d0cec8',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    resize: 'none',
    minHeight: 40,
    maxHeight: 120,
    fontFamily: 'system-ui,-apple-system,sans-serif',
    lineHeight: 1.5,
  }

  const sendBtnStyle = (disabled: boolean): CSSProperties => ({
    padding: '10px 16px',
    background: disabled ? '#ccc' : '#0F1E2E',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    height: 40,
  })

  const loadingStyle: CSSProperties = {
    alignSelf: 'flex-start',
    background: '#fff',
    border: '1px solid #e0deda',
    borderRadius: '12px 12px 12px 2px',
    padding: '10px 14px',
    fontSize: 13,
    color: '#aaa',
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={headerTitleStyle}>
          {managerId ? `AI Assistant — ${managerName}` : 'AI Assistant'}
        </div>
        <div style={headerSubStyle}>
          {managerId
            ? 'Ask anything about this fund. I have full context from all uploaded documents.'
            : 'Ask anything about alternative investments, market conditions, or your portfolio.'}
        </div>
      </div>

      {/* Messages */}
      <div style={messagesStyle}>
        {messages.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 32 }}>✦</div>
            <div style={emptyTitleStyle}>
              {managerId
                ? `Ask me anything about ${managerName}`
                : 'Ask me anything about alternative investments'}
            </div>
            <div style={suggestionsStyle}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={suggestionBtnStyle}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#1A4A8A')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e0deda')}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} style={messageStyle(msg.role)}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div style={loadingStyle}>Thinking...</div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div style={inputAreaStyle}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything... (Enter to send, Shift+Enter for new line)"
          style={inputStyle}
          rows={1}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={sendBtnStyle(!input.trim() || loading)}
        >
          Send
        </button>
      </div>
    </div>
  )
}

import React, { useRef, useEffect } from 'react';
import { PromptTemplate } from '@my-agent/core';
import { messageTextOf } from '@my-agent/react';
import { Markdown } from '../Markdown';
import { ChoiceCard } from '../ChoiceCard';

function extractChoiceFromMessage(m: any): { question: string; options: any[]; allowCustom?: boolean } | null {
  if (Array.isArray(m.toolInvocations)) {
    const inv = m.toolInvocations.find((ti: any) => ti.toolName === 'ask_user_choice');
    if (inv && (inv.args || inv.result)) {
      const data = inv.args || inv.result;
      if (data?.question && Array.isArray(data?.options)) {
        return { question: data.question, options: data.options, allowCustom: data.allow_custom };
      }
    }
  }
  if (Array.isArray(m.parts)) {
    for (const p of m.parts) {
      if (p.type === 'tool-invocation' && p.toolInvocation?.toolName === 'ask_user_choice') {
        const inv = p.toolInvocation;
        const data = inv.args || inv.result;
        if (data?.question && Array.isArray(data?.options)) {
          return { question: data.question, options: data.options, allowCustom: data.allow_custom };
        }
      }
    }
  }
  return null;
}

interface ChatTabProps {
  messages: any[];
  isLoading: boolean;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e?: React.FormEvent<HTMLFormElement>) => void;
  templates: PromptTemplate[];
  onRunSlashCommand: (command: string) => void;
  renderMessage?: (m: any) => React.ReactNode;
  onSelectChoice?: (optionText: string) => void;
}

export function ChatTab({
  messages,
  isLoading,
  input,
  onInputChange,
  onSubmit,
  templates,
  onRunSlashCommand,
  renderMessage,
  onSelectChoice,
}: ChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Mesaj Listesi */}
      <div
        style={{
          flex: 1,
          padding: 14,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          backgroundColor: '#f8fafc',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 30 }}>
            👋 Merhaba! Pi destekli UI Agent ile arayüzü kontrol edebilirsiniz.
          </div>
        )}

        {messages.map((m: any) => {
          const choice = m.role === 'assistant' ? extractChoiceFromMessage(m) : null;
          const text = messageTextOf(m);
          return (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: m.role === 'user' ? '#2563eb' : '#ffffff',
                color: m.role === 'user' ? '#ffffff' : '#0f172a',
                padding: '8px 12px',
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                maxWidth: '85%',
                fontSize: 13,
                lineHeight: 1.4,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
                wordBreak: 'break-word',
              }}
            >
              {renderMessage
                ? renderMessage(m)
                : m.role === 'assistant'
                  ? (
                    <>
                      {text && <Markdown text={text} />}
                      {choice && (
                        <ChoiceCard
                          question={choice.question}
                          options={choice.options}
                          allowCustom={choice.allowCustom}
                          onSelectOption={(opt) => onSelectChoice?.(opt.value || opt.label)}
                        />
                      )}
                    </>
                  )
                  : (text || m.content || '')}
            </div>
          );
        })}

        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#ffffff',
              color: '#64748b',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              border: '1px solid #e2e8f0',
            }}
          >
            ⏳ Pi Agent çalışıyor...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Hızlı Slash Komut Çipleri */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '6px 10px',
          backgroundColor: '#f1f5f9',
          borderTop: '1px solid #e2e8f0',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', fontWeight: 600 }}>Komutlar:</span>
        {templates.map((tpl: any) => {
          const isSys = tpl.category === 'system';
          return (
            <button
              key={tpl.command}
              type="button"
              onClick={() => onRunSlashCommand(tpl.command)}
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: isSys ? '#eff6ff' : '#ffffff',
                border: isSys ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                color: isSys ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
              }}
              title={`${tpl.description}${tpl.argumentHint ? ' ' + tpl.argumentHint : ''}`}
            >
              {isSys ? '⚡ ' : ''}{tpl.command}
            </button>
          );
        })}
      </div>

      {/* Chat Formu */}
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          padding: 8,
        }}
      >
        <input
          value={input}
          onChange={onInputChange}
          placeholder="Asistana yazın..."
          style={{
            flex: 1,
            border: 'none',
            padding: '8px 12px',
            outline: 'none',
            fontSize: 13,
            backgroundColor: 'transparent',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: input.trim() && !isLoading ? '#2563eb' : '#94a3b8',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 13,
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
          }}
        >
          Gönder
        </button>
      </form>
    </div>
  );
}

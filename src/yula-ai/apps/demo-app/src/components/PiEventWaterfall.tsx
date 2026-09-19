import React, { useRef, useEffect } from 'react';
import { AgentEvent, piEventStream } from '@my-agent/core';

export function PiEventWaterfall({ events }: { events: AgentEvent[] }) {
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div
      style={{
        backgroundColor: '#0a0e17',
        borderRadius: 16,
        padding: 18,
        border: '1px solid #1e293b',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌲</span>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
            Pi prompt() Event Sequence
          </h3>
        </div>
        <button
          onClick={() => piEventStream.clearHistory()}
          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
        >
          Temizle
        </button>
      </div>

      <div
        style={{
          fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 11,
          lineHeight: 1.6,
          minHeight: 160,
          maxHeight: 280,
          overflowY: 'auto',
          color: '#e2e8f0',
        }}
      >
        {events.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
            Henüz olay akışı yok.<br />
            Sağ alttaki 💬 Asistan'dan mesaj yazın veya test butonlarına basın.
          </div>
        ) : (
          events.map((ev, i) => {
            const prefix = i === events.length - 1 ? '└─ ' : '├─ ';
            if (ev.type === 'agent_start') return <div key={i} style={{ color: '#38bdf8' }}>{prefix}🚀 agent_start {ev.prompt ? `"${ev.prompt}"` : ''}</div>;
            if (ev.type === 'turn_start') return <div key={i} style={{ color: '#818cf8' }}>{prefix}🔄 turn_start</div>;
            if (ev.type === 'message_start') return <div key={i} style={{ color: '#cbd5e1' }}>{prefix}💬 message_start [{ev.message.role}]</div>;
            if (ev.type === 'message_end') return <div key={i} style={{ color: '#cbd5e1' }}>{prefix}💬 message_end [{ev.message.role}]</div>;
            if (ev.type === 'tool_execution_start') {
              return (
                <div key={i} style={{ color: '#fbbf24', background: '#1e293b', padding: '1px 4px', borderRadius: 4, margin: '2px 0' }}>
                  {prefix}⚙️ tool_execution_start: <strong>{ev.toolName}</strong> ({JSON.stringify(ev.args)})
                </div>
              );
            }
            if (ev.type === 'tool_execution_end') {
              return (
                <div key={i} style={{ color: ev.isError ? '#f87171' : '#4ade80', background: '#1e293b', padding: '1px 4px', borderRadius: 4, margin: '2px 0' }}>
                  {prefix}{ev.isError ? '❌' : '⚡'} tool_execution_end: {JSON.stringify(ev.result)}
                </div>
              );
            }
            if (ev.type === 'steer_injected') return <div key={i} style={{ color: '#ec4899', fontWeight: 600 }}>{prefix}⚡ steer_injected: "{ev.message}"</div>;
            if (ev.type === 'follow_up_queued') return <div key={i} style={{ color: '#a855f7', fontWeight: 600 }}>{prefix}📥 follow_up_queued: "{ev.message}"</div>;
            if (ev.type === 'session_checkpoint') return <div key={i} style={{ color: '#34d399' }}>{prefix}💾 session_checkpoint: {ev.label}</div>;
            if (ev.type === 'turn_end') return <div key={i} style={{ color: '#818cf8' }}>{prefix}🏁 turn_end</div>;
            if (ev.type === 'agent_end') return <div key={i} style={{ color: '#38bdf8', fontWeight: 600 }}>{prefix}🛑 agent_end</div>;
            return <div key={i} style={{ color: '#94a3b8' }}>{prefix}{ev.type}</div>;
          })
        )}
        <div ref={eventsEndRef} />
      </div>
    </div>
  );
}

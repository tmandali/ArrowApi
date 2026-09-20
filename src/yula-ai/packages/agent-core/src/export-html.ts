/**
 * Standalone HTML Session Export (Reference Pi export-html)
 *
 * Oturum transkriptini, araç çağrılarını, telemetriyi ve hafıza durumunu
 * bağımsız, şık ve dışa aktarılabilir bir HTML belgesi olarak üretir.
 */

import type { SessionDump } from './session-harness';

export function exportSessionToHtml(dump: SessionDump): string {
  const dateStr = new Date(dump.exportedAt).toLocaleString('tr-TR');
  const turnsCount = dump.messages.length;
  const totalTokens = dump.telemetrySummary?.totalTokens ?? 0;
  const cost = dump.telemetrySummary?.totalEstimatedCostUsd ?? 0;

  const messagesHtml = dump.messages
    .map((msg, idx) => {
      const isUser = msg.role === 'user';
      const roleColor = isUser ? '#2563eb' : '#059669';
      const roleBadge = isUser ? 'KULLANICI' : 'ASİSTAN';
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      let toolCallsHtml = '';
      if (msg.parts && Array.isArray(msg.parts)) {
        const calls = msg.parts.filter((p: any) => p.type === 'tool-call' || p.toolName);
        if (calls.length > 0) {
          toolCallsHtml = calls
            .map(
              (c: any) => `
            <div class="tool-call">
              <div class="tool-title">🔧 Araç: <strong>${escapeHtml(c.toolName || c.name || '')}</strong></div>
              <pre class="tool-args">${escapeHtml(JSON.stringify(c.args || c.arguments || {}, null, 2))}</pre>
            </div>
          `,
            )
            .join('');
        }
      }

      return `
        <div class="message-card ${isUser ? 'user-card' : 'assistant-card'}">
          <div class="message-header" style="color: ${roleColor}">
            <span class="badge" style="background: ${roleColor}20; color: ${roleColor}">#${idx + 1} ${roleBadge}</span>
            <span class="timestamp">${msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('tr-TR') : ''}</span>
          </div>
          <div class="message-body">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>
          ${toolCallsHtml}
        </div>
      `;
    })
    .join('\n');

  const memoryHtml =
    dump.memory && dump.memory.length > 0
      ? dump.memory
          .map(
            (m) => `
        <li class="memory-item">
          <strong>${escapeHtml(m.key)}:</strong> ${escapeHtml(JSON.stringify(m.value))} 
          <span class="scope-badge">(${m.scope})</span>
        </li>
      `,
          )
          .join('\n')
      : '<li>Bellek kaydı bulunmuyor.</li>';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Yula AI Oturum Raporu — ${dump.sessionId}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 32px 16px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    .header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .meta-box {
      background: rgba(0,0,0,0.2);
      padding: 12px;
      border-radius: 8px;
    }
    .meta-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; }
    .meta-val { font-size: 18px; font-weight: 600; margin-top: 4px; }
    .message-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .user-card { border-left: 4px solid #2563eb; }
    .assistant-card { border-left: 4px solid #059669; }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .badge { font-size: 11px; font-weight: bold; padding: 4px 8px; border-radius: 4px; }
    .timestamp { font-size: 12px; color: var(--text-muted); }
    .message-body { font-size: 15px; }
    .tool-call {
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      border: 1px solid var(--border);
    }
    .tool-title { font-size: 13px; color: #38bdf8; }
    .tool-args {
      background: #020617;
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      overflow-x: auto;
      margin-top: 8px;
    }
    .section-title { font-size: 20px; margin: 32px 0 16px; }
    .memory-list { list-style: none; padding: 0; }
    .memory-item { background: var(--card-bg); padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border); font-size: 14px; }
    .scope-badge { font-size: 11px; color: #a855f7; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0 0 8px;">🤖 Yula AI Oturum Denetim Raporu</h1>
      <p style="margin: 0; color: var(--text-muted);">Oturum ID: ${dump.sessionId}</p>
      <div class="meta-grid">
        <div class="meta-box"><div class="meta-label">Tarih</div><div class="meta-val">${dateStr}</div></div>
        <div class="meta-box"><div class="meta-label">Toplam Tur</div><div class="meta-val">${turnsCount} mesaj</div></div>
        <div class="meta-box"><div class="meta-label">Toplam Token</div><div class="meta-val">${totalTokens.toLocaleString('tr-TR')}</div></div>
        <div class="meta-box"><div class="meta-label">Tahmini Maliyet</div><div class="meta-val">$${cost.toFixed(4)}</div></div>
      </div>
    </div>

    <h2 class="section-title">Konuşma ve Araç Transkripti</h2>
    ${messagesHtml}

    <h2 class="section-title">Oturum Hafızası (Memory)</h2>
    <ul class="memory-list">
      ${memoryHtml}
    </ul>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

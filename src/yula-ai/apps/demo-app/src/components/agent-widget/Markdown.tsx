import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }: any) => (
            <pre style={{ backgroundColor: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>
              {children}
            </pre>
          ),
          code: ({ children, className }: any) => {
            // Blok-içi kod (pre > code): koyu zeminde çıplak bırak; satır-içi kod: hap stili.
            if (className) return <code className={className}>{children}</code>;
            return (
              <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>
                {children}
              </code>
            );
          },
          table: ({ children }: any) => (
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
          ),
          th: ({ children }: any) => (
            <th style={{ border: '1px solid #cbd5e1', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'left' }}>{children}</th>
          ),
          td: ({ children }: any) => (
            <td style={{ border: '1px solid #e2e8f0', padding: '4px 6px' }}>{children}</td>
          ),
          a: ({ children, href }: any) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
              {children}
            </a>
          ),
          p: ({ children }: any) => <p style={{ margin: '4px 0' }}>{children}</p>,
          ul: ({ children }: any) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
          ol: ({ children }: any) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

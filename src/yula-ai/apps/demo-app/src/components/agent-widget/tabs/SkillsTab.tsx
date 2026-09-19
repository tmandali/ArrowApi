import React from 'react';
import { Skill, PromptTemplate } from '@my-agent/core';

interface SkillsTabProps {
  activeSkills: Skill[];
  templates: PromptTemplate[];
  onRunSlashCommand: (command: string) => void;
}

export function SkillsTab({ activeSkills, templates, onRunSlashCommand }: SkillsTabProps) {
  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        🎯 Pi UI Becerileri (Modular Skills)
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Rotaya ve aktif bileşenlere göre otomatik enjekte edilen uzmanlık kuralları:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {activeSkills.map((sk: Skill) => (
          <div
            key={sk.name}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>✨ {sk.name}</span>
              <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4 }}>
                {sk.applicableComponents?.join(', ') || 'Global'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{sk.description}</div>
            <div style={{ fontSize: 10, color: '#0369a1', background: '#f0f9ff', padding: 6, borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {sk.instructions.trim()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        🛠️ Pi Standart Araç Seti (Standard Tools)
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Ajanın backend ve frontend köprüsünde kullanabildiği 6 çekirdek araç:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {[
          { name: 'dispatch_component_action', desc: 'UI bileşenlerine tip güvenli reaktif komut iletir.', badge: 'UI Bridge' },
          { name: 'inspect_ui_state', desc: 'Aktif bileşenleri ve ring-buffer telemetri olaylarını inceler.', badge: 'Reflection' },
          { name: 'remember_fact', desc: 'Kullanıcı tercihlerini oturum veya kalıcı hafızaya yazar.', badge: 'Memory' },
          { name: 'recall_fact', desc: 'Hafızadaki kullanıcı tercihlerini veya gerçekleri sorgular.', badge: 'Memory' },
          { name: 'forget_fact', desc: 'Hafızadaki bir tercihi veya bilgiyi siler/unutur.', badge: 'Memory' },
          { name: 'time_travel', desc: 'Sayfa durumunu zamanda geri alır (undo) veya ileri sarar (redo).', badge: 'Time-Travel' },
        ].map((tl) => (
          <div
            key={tl.name}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#0f766e', fontSize: 12, fontFamily: 'monospace' }}>
                🔧 {tl.name}
              </span>
              <span style={{ fontSize: 9, background: '#ccfbf1', color: '#0f766e', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                {tl.badge}
              </span>
            </div>
            <div style={{ color: '#64748b', fontSize: 11 }}>{tl.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        ⚡ Pi Hızlı Slash Komutları
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Tek tıkla zenginleştirilmiş komut şablonlarını yürütün:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {templates.map((tpl: PromptTemplate) => (
          <div
            key={tpl.command}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#2563eb', fontSize: 12 }}>
                {tpl.command} {tpl.argumentHint ? `<${tpl.argumentHint}>` : ''}
              </div>
              <div style={{ color: '#64748b', fontSize: 11 }}>{tpl.description}</div>
            </div>
            <button
              onClick={() => onRunSlashCommand(tpl.command)}
              style={{
                padding: '4px 8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              Çalıştır
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

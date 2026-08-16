import React from 'react';
import { ReportProvider } from '../../context/ReportContext';
import { AiChatSidebar } from './AiChatSidebar';
import { ReportView } from './ReportView';

export const AiAgentDemoPage: React.FC = () => {
  return (
    <ReportProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans">
        {/* Sol Panel: AI Chat Sidebar */}
        <AiChatSidebar />

        {/* Sağ Panel: Otomatik Tetiklenen Rapor Ekranı */}
        <ReportView />
      </div>
    </ReportProvider>
  );
};

export default AiAgentDemoPage;

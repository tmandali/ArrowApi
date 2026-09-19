import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AgentProvider } from '@my-agent/react';
import { DemoApp } from './App';

function Root() {
  const [currentRoute, setCurrentRoute] = useState('/');

  return (
    <AgentProvider apiEndpoint="/api/chat" systemName="HeadlessSalesAgent">
      <DemoApp currentRoute={currentRoute} onNavigate={setCurrentRoute} />
    </AgentProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

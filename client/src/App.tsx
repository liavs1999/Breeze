import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { generateId } from 'ai';
import { Header } from './components/Header';
import { KeyPanel } from './components/KeyPanel';
import { ChatPage } from './components/ChatPage';
import { checkSavedKey, loadHealth } from './lib/status';

export function App() {
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);

  useEffect(() => {
    void loadHealth();
    void checkSavedKey();
    const timer = setInterval(() => document.visibilityState === 'visible' && void loadHealth(), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app">
      <Header onOpenKeyPanel={() => setKeyPanelOpen(true)} />
      <Routes>
        <Route path="/" element={<Navigate to={`/c/${generateId()}`} replace />} />
        <Route path="/c/:id" element={<ChatRoute onOpenKeyPanel={() => setKeyPanelOpen(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <KeyPanel opened={keyPanelOpen} onClose={() => setKeyPanelOpen(false)} />
    </div>
  );
}

function ChatRoute({ onOpenKeyPanel }: { onOpenKeyPanel: () => void }) {
  const { id = '' } = useParams();
  // Keyed by id: switching chats starts from a clean state.
  return <ChatPage key={id} chatId={id} onOpenKeyPanel={onOpenKeyPanel} />;
}

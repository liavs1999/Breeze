import { useEffect, useMemo, useState } from 'react';
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
      <div className="sky-aura" aria-hidden />
      <Header onOpenKeyPanel={() => setKeyPanelOpen(true)} />
      <Routes>
        <Route path="/" element={<NewChat />} />
        <Route path="/c/:id" element={<ChatRoute onOpenKeyPanel={() => setKeyPanelOpen(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <KeyPanel opened={keyPanelOpen} onClose={() => setKeyPanelOpen(false)} />
    </div>
  );
}

/**
 * Home: a fresh, empty chat. The id is made when this route mounts, so every visit (logo, "New chat")
 * gets a new one; an id made once in App's render would send later visits back to an old chat.
 */
function NewChat() {
  const id = useMemo(() => generateId(), []);
  return <Navigate to={`/c/${id}`} replace />;
}

function ChatRoute({ onOpenKeyPanel }: { onOpenKeyPanel: () => void }) {
  const { id = '' } = useParams();
  // Keyed by id: switching chats starts from a clean state.
  return <ChatPage key={id} chatId={id} onOpenKeyPanel={onOpenKeyPanel} />;
}

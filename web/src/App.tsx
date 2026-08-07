import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { ConfirmationsPanel } from "./components/ConfirmationsPanel";
import { NotificationBell } from "./components/NotificationBell";

export default function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark">AI COWORK</span>
          <span className="brand-title">オフィスビュー</span>
        </div>
        <div className="topbar-actions">
          <NotificationBell />
        </div>
      </div>

      {selectedProjectId ? (
        <ProjectDetailView
          projectId={selectedProjectId}
          onBack={() => setSelectedProjectId(null)}
        />
      ) : (
        <>
          <ConfirmationsPanel />
          <Dashboard onOpenProject={setSelectedProjectId} />
        </>
      )}
    </div>
  );
}

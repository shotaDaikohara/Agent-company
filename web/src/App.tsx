import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { NotificationBell } from "./components/NotificationBell";
import banner from "./assets/banner.png";

export default function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  return (
    <div className="app">
      <div className="banner" style={{ "--banner-image": `url(${banner})` } as React.CSSProperties}>
        <div className="brand">
          <span className="brand-mark">AI COWORK</span>
          <span className="brand-title">オフィスビュー</span>
        </div>
        <div className="banner-actions">
          <NotificationBell />
        </div>
      </div>

      <div className="app-main">
        {selectedProjectId ? (
          <ProjectDetailView
            projectId={selectedProjectId}
            onBack={() => setSelectedProjectId(null)}
          />
        ) : (
          <Dashboard onOpenProject={setSelectedProjectId} />
        )}
      </div>
    </div>
  );
}

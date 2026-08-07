import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Notification } from "../types";

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    const { notifications } = await api.listNotifications();
    setItems(notifications);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 6000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function handleOpenItem(n: Notification) {
    if (!n.read_at) {
      await api.markNotificationRead(n.id);
      await refresh();
    }
  }

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen((v) => !v)} type="button">
        通知
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="bell-dropdown">
          {items.length === 0 ? (
            <div className="notif-item notif-item-meta">通知はありません</div>
          ) : (
            items.map((n) => (
              <div
                className="notif-item"
                key={n.id}
                onClick={() => handleOpenItem(n)}
                style={{ opacity: n.read_at ? 0.55 : 1 }}
              >
                <div className="notif-item-title">{n.title}</div>
                <div className="notif-item-meta">
                  {n.type} ・ {new Date(n.created_at).toLocaleString("ja-JP")}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export interface ToastNoticeProps {
  tone?: "info" | "success" | "warning" | "danger";
  title: ReactNode;
  description?: ReactNode;
  durationMs?: number;
  onClose?(): void;
}

export function ToastNotice({ tone = "info", title, description, durationMs = 3200, onClose }: ToastNoticeProps) {
  const [visible, setVisible] = useState(Boolean(title || description));

  useEffect(() => {
    if (!title && !description) {
      setVisible(false);
      return;
    }

    setVisible(true);
    if (durationMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [description, durationMs, onClose, title]);

  if (!visible) {
    return null;
  }

  function handleClose() {
    setVisible(false);
    onClose?.();
  }

  return (
    <div style={toastLayerStyle} aria-live={tone === "danger" ? "assertive" : "polite"} aria-atomic="true">
      <section className={`ui-status ui-status--${tone}`} role={tone === "danger" ? "alert" : "status"} style={toastStyle}>
        <div style={toastContentStyle}>
          <strong>{title}</strong>
          {description ? <p style={descriptionStyle}>{description}</p> : null}
        </div>
        <button type="button" className="ui-admin-link" aria-label="关闭提示" onClick={handleClose} style={closeButtonStyle}>
          ×
        </button>
      </section>
    </div>
  );
}

const toastLayerStyle: CSSProperties = {
  position: "fixed",
  top: 18,
  right: 22,
  zIndex: 1200,
  width: "min(420px, calc(100vw - 44px))",
  pointerEvents: "none"
};

const toastStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  margin: 0,
  padding: "14px 16px",
  pointerEvents: "auto",
  boxShadow: "0 18px 48px rgba(24, 35, 50, 0.18)"
};

const toastContentStyle: CSSProperties = {
  minWidth: 0
};

const descriptionStyle: CSSProperties = {
  margin: "4px 0 0"
};

const closeButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  border: 0,
  minHeight: 24,
  minWidth: 24,
  padding: 0,
  fontSize: 20,
  lineHeight: 1,
  textDecoration: "none"
};

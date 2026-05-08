import { useEffect, useState, type ReactNode } from "react";

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
    <div className="ui-toast-layer" aria-live={tone === "danger" ? "assertive" : "polite"} aria-atomic="true">
      <section className={`ui-status ui-status--${tone} ui-toast-notice`} role={tone === "danger" ? "alert" : "status"}>
        <div className="ui-toast-notice__content">
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          type="button"
          className="ui-toast-notice__close"
          aria-label="关闭提示"
          onClick={handleClose}
        >
          &times;
        </button>
      </section>
    </div>
  );
}

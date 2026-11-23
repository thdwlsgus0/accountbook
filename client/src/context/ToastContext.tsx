import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  tone: 'default' | 'error';
}

interface ToastContextValue {
  showToast: (message: string, options?: { action?: ToastAction; tone?: Toast['tone'] }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_MS = 4500;

// 화면 아래에 잠깐 뜨는 알림 ("12,500원 기록했어요 · 되돌리기").
// 한 번에 하나만 보여주고, 새 알림이 오면 바로 바꾼다. 되돌리기 같은 버튼을 하나 달 수 있다.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>();
  const nextId = useRef(1);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>((message, options) => {
    window.clearTimeout(timer.current);
    setToast({ id: nextId.current++, message, action: options?.action, tone: options?.tone ?? 'default' });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  toast.action!.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast는 ToastProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

"use client";

import { useState, createContext, useContext, useCallback } from "react";
import { Check, AlertTriangle, X, Info } from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
}

const ToastContext = createContext<{
  toast: (message: string, type?: Toast["type"], duration?: number) => void;
}>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const config = {
  success: {
    icon: Check,
    title: "C’est fait",
    iconClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    barClass: "bg-emerald-500",
  },
  error: {
    icon: AlertTriangle,
    title: "Action impossible",
    iconClass: "bg-red-50 text-red-600 ring-red-100",
    barClass: "bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    title: "À vérifier",
    iconClass: "bg-orange-50 text-orange-600 ring-orange-100",
    barClass: "bg-orange-500",
  },
  info: {
    icon: Info,
    title: "Information",
    iconClass: "bg-blue-50 text-blue-600 ring-blue-100",
    barClass: "bg-blue-500",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success", duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { id, message, type, duration }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), duration);
  }, []);

  const removeToast = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[9999] flex flex-col items-stretch gap-2.5 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px]"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const item = config[toast.type];
          const Icon = item.icon;
          return (
            <div
              key={toast.id}
              data-testid={`toast-${toast.type}`}
              role={toast.type === "error" ? "alert" : "status"}
              className="pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3.5 text-slate-700 shadow-[0_20px_55px_rgba(6,13,23,0.18)] backdrop-blur-xl animate-slide-up"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${item.iconClass}`}>
                  <Icon size={17} strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-body text-xs font-bold text-slate-900">{item.title}</div>
                  <div className="mt-0.5 font-body text-sm leading-snug text-slate-600">{toast.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Fermer la notification"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-none bg-slate-50 p-0 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
                <div
                  className={`h-full origin-left ${item.barClass}`}
                  style={{ animation: `toast-progress ${toast.duration || 4000}ms linear forwards` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <style jsx global>{`
        @keyframes toast-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid^="toast-"] * { animation: none !important; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

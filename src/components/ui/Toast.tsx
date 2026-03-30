"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success", duration = 4000) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons = { success: Check, error: AlertTriangle, warning: AlertTriangle, info: Info };
  const colors = {
    success: "bg-green-600",
    error: "bg-red-500",
    warning: "bg-orange-500",
    info: "bg-blue-500",
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} data-testid={`toast-${t.type}`} className={`${colors[t.type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm pointer-events-auto animate-slide-up`}>
              <Icon size={18} className="flex-shrink-0" />
              <span className="font-body text-sm flex-1">{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="text-white/60 hover:text-white bg-transparent border-none cursor-pointer p-0"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

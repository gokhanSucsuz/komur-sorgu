'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  Lock, AlertTriangle, AlertCircle, CheckCircle2, Info, X
} from 'lucide-react';

export type AlertType = 'lock' | 'warning' | 'error' | 'success' | 'info';

export interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
  badge?: string;
  confirmText?: string;
  cancelText?: string;
  isConfirm?: boolean;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  message: string;
  type?: AlertType;
  durationMs?: number;
}

interface ActiveModal extends AlertOptions {
  resolve: (val: boolean) => void;
}

interface ActiveToast extends ToastOptions {
  id: string;
  createdAt: number;
}

// Global Event Handlers for direct non-React-hook usage anywhere in the app
let globalModalTrigger: ((item: ActiveModal) => void) | null = null;
let globalToastTrigger: ((toast: ToastOptions) => void) | null = null;

/**
 * Modern modal alert dialog (replaces native window.alert)
 */
export function showAlert(options: string | AlertOptions): Promise<boolean> {
  const opts: AlertOptions =
    typeof options === 'string'
      ? {
          message: options,
          title: options.toLowerCase().includes('kilit')
            ? '🔒 Rota Kullanımda & Kilitli'
            : options.toLowerCase().includes('hata') || options.toLowerCase().includes('silinemedi') || options.toLowerCase().includes('başarısız')
            ? 'İşlem Başarısız'
            : options.toLowerCase().includes('başarı') || options.includes('✓')
            ? 'İşlem Başarılı'
            : 'Bilgilendirme',
          type: options.toLowerCase().includes('kilit')
            ? 'lock'
            : options.toLowerCase().includes('hata') || options.toLowerCase().includes('silinemedi')
            ? 'error'
            : options.toLowerCase().includes('başarı')
            ? 'success'
            : 'info',
          confirmText: 'Anladım',
          isConfirm: false
        }
      : {
          confirmText: 'Anladım',
          isConfirm: false,
          ...options
        };

  return new Promise<boolean>((resolve) => {
    if (globalModalTrigger) {
      globalModalTrigger({ ...opts, resolve });
    } else {
      if (typeof window !== 'undefined') {
        window.alert(opts.message);
      }
      resolve(true);
    }
  });
}

/**
 * Modern confirmation modal dialog (replaces native window.confirm)
 */
export function showConfirm(options: string | AlertOptions): Promise<boolean> {
  const opts: AlertOptions =
    typeof options === 'string'
      ? {
          message: options,
          title: 'Onay Gerekiyor',
          type: 'warning',
          confirmText: 'Evet, Onayla',
          cancelText: 'Vazgeç',
          isConfirm: true
        }
      : {
          confirmText: 'Evet, Onayla',
          cancelText: 'Vazgeç',
          isConfirm: true,
          ...options
        };

  return new Promise<boolean>((resolve) => {
    if (globalModalTrigger) {
      globalModalTrigger({ ...opts, resolve });
    } else {
      const ok = typeof window !== 'undefined' ? window.confirm(opts.message) : false;
      resolve(ok);
    }
  });
}

/**
 * Modern floating toast notification
 */
export function showToast(options: string | ToastOptions): void {
  const opts: ToastOptions =
    typeof options === 'string'
      ? {
          message: options,
          type: options.toLowerCase().includes('başarı') || options.includes('✓')
            ? 'success'
            : options.toLowerCase().includes('kilit')
            ? 'lock'
            : options.toLowerCase().includes('hata')
            ? 'error'
            : 'info'
        }
      : options;

  if (globalToastTrigger) {
    globalToastTrigger(opts);
  }
}

/**
 * Global Alert & Notification System UI Component
 */
export default function GlobalAlertManager() {
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  // Wire global triggers
  useEffect(() => {
    globalModalTrigger = (item: ActiveModal) => {
      setModal(item);
    };

    globalToastTrigger = (toast: ToastOptions) => {
      const id = toast.id || String(Date.now() + Math.random());
      const newToast: ActiveToast = {
        ...toast,
        id,
        createdAt: Date.now(),
        durationMs: toast.durationMs || 3500
      };

      setToasts((prev) => [...prev.slice(-4), newToast]); // En fazla son 5 toast

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.durationMs);
    };

    // Global native window.alert interception:
    // Any legacy or unhandled window.alert() call anywhere in the app will seamlessly
    // render our ultra-modern, stylish modal dialog instead of the ugly browser box.
    const originalAlert = window.alert;
    window.alert = (message?: any) => {
      showAlert(String(message ?? ''));
    };

    return () => {
      globalModalTrigger = null;
      globalToastTrigger = null;
      window.alert = originalAlert;
    };
  }, []);

  const handleModalClose = useCallback(
    (confirmed: boolean) => {
      if (modal) {
        modal.resolve(confirmed);
        setModal(null);
      }
    },
    [modal]
  );

  // ESC key listener to close alert
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal) {
        handleModalClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, handleModalClose]);

  // Remove individual toast
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {/* ======================================================== */}
      {/* 1. FLOATING TOAST NOTIFICATIONS CONTAINER (TOP-RIGHT)   */}
      {/* ======================================================== */}
      <div
        className="fixed top-4 inset-x-0 mx-auto sm:left-auto sm:right-4 z-[10000] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3"
        style={{ perspective: 1000, zIndex: 10000 }}
      >
        {toasts.map((toast) => {
          const type = toast.type || 'info';
          return (
            <div
              key={toast.id}
              className="pointer-events-auto w-full bg-white/95 backdrop-blur-md rounded-2xl border p-3.5 shadow-xl flex items-start gap-3 transition-all duration-300 animate-slide-in"
              style={{
                pointerEvents: 'auto',
                borderColor:
                  type === 'lock'
                    ? '#f59e0b'
                    : type === 'warning'
                    ? '#fbbf24'
                    : type === 'error'
                    ? '#f87171'
                    : type === 'success'
                    ? '#34d399'
                    : '#38bdf8'
              }}
            >
              {/* Icon */}
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs"
                style={{
                  background:
                    type === 'lock'
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : type === 'warning'
                      ? 'linear-gradient(135deg, #f59e0b, #ea580c)'
                      : type === 'error'
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : type === 'success'
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #0284c7, #2563eb)'
                }}
              >
                {type === 'lock' && <Lock className="w-4 h-4" />}
                {type === 'warning' && <AlertTriangle className="w-4 h-4" />}
                {type === 'error' && <AlertCircle className="w-4 h-4" />}
                {type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                {type === 'info' && <Info className="w-4 h-4" />}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pt-0.5">
                {toast.title && (
                  <h5 className="text-xs font-black text-slate-900 truncate">
                    {toast.title}
                  </h5>
                )}
                <p className="text-xs font-medium text-slate-600 mt-0.5 leading-snug break-words">
                  {toast.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* 2. MODAL ALERT & CONFIRM DIALOG                          */}
      {/* ======================================================== */}
      {modal && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          style={{ zIndex: 9999, backgroundColor: 'rgba(2, 6, 23, 0.72)' }}
          onClick={() => {
            // For simple alerts, clicking backdrop closes them
            if (!modal.isConfirm) {
              handleModalClose(true);
            }
          }}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden transform transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Top Accent Gradient Bar */}
            <div
              className="h-2 w-full"
              style={{
                background:
                  modal.type === 'lock'
                    ? 'linear-gradient(90deg, #f59e0b, #ea580c, #d97706)'
                    : modal.type === 'warning'
                    ? 'linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)'
                    : modal.type === 'error'
                    ? 'linear-gradient(90deg, #f87171, #ef4444, #b91c1c)'
                    : modal.type === 'success'
                    ? 'linear-gradient(90deg, #34d399, #10b981, #047857)'
                    : 'linear-gradient(90deg, #38bdf8, #0284c7, #1d4ed8)'
              }}
            />

            {/* Close X Button */}
            <button
              type="button"
              onClick={() => handleModalClose(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-95 z-10"
              title="Kapat (ESC)"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Body */}
            <div className="p-6 sm:p-7 text-center">
              {/* Centered Large Icon Badge */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl relative"
                  style={{
                    background:
                      modal.type === 'lock'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                        : modal.type === 'warning'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : modal.type === 'error'
                        ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                        : modal.type === 'success'
                        ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)'
                        : 'linear-gradient(135deg, #0284c7 0%, #1e40af 100%)',
                    boxShadow:
                      modal.type === 'lock'
                        ? '0 10px 25px rgba(245, 158, 11, 0.35)'
                        : modal.type === 'error'
                        ? '0 10px 25px rgba(239, 68, 68, 0.35)'
                        : '0 10px 25px rgba(15, 23, 42, 0.15)'
                  }}
                >
                  {modal.type === 'lock' && <Lock className="w-8 h-8" />}
                  {modal.type === 'warning' && <AlertTriangle className="w-8 h-8" />}
                  {modal.type === 'error' && <AlertCircle className="w-8 h-8" />}
                  {modal.type === 'success' && <CheckCircle2 className="w-8 h-8" />}
                  {modal.type === 'info' && <Info className="w-8 h-8" />}

                  {/* Subtle ping animation for Lock & Warning */}
                  {(modal.type === 'lock' || modal.type === 'warning') && (
                    <span
                      className="absolute inset-0 rounded-2xl animate-ping opacity-25 pointer-events-none"
                      style={{
                        background: modal.type === 'lock' ? '#f59e0b' : '#fbbf24'
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Title */}
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                {modal.title || (modal.type === 'lock' ? 'Rota Kullanımda & Kilitli' : 'Bilgilendirme')}
              </h3>

              {/* Optional Personnel Badge */}
              {modal.badge && (
                <div className="flex justify-center mt-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Aktif Personel: {modal.badge}</span>
                  </span>
                </div>
              )}

              {/* Message */}
              <div className="mt-3.5 text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line px-1">
                {modal.message}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-2">
                {modal.isConfirm ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleModalClose(false)}
                      className="w-full py-3 px-4 rounded-2xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm transition-all active:scale-95"
                    >
                      {modal.cancelText || 'Vazgeç'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModalClose(true)}
                      className="w-full py-3 px-4 rounded-2xl font-black text-xs sm:text-sm text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{
                        background:
                          modal.type === 'error'
                            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                            : modal.type === 'warning' || modal.type === 'lock'
                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                            : 'linear-gradient(135deg, #0284c7, #2563eb)'
                      }}
                    >
                      {modal.confirmText || 'Evet, Onayla'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleModalClose(true)}
                    className="w-full py-3.5 px-6 rounded-2xl font-black text-xs sm:text-sm text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    style={{
                      background:
                        modal.type === 'lock'
                          ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                          : modal.type === 'error'
                          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                          : modal.type === 'success'
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                          : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)'
                    }}
                  >
                    <span>{modal.confirmText || 'Anladım'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

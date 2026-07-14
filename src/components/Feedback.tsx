// Fini UX partagé : notifications « toast » + boîte de confirmation stylée,
// exposés par un contexte global. Remplace les messages inline dispersés et le
// window.confirm natif (qui faisait « bas de gamme »).

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  titre: string;
  message?: string;
  confirmer?: string;
  annuler?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (message: string, type?: ToastType) => void;
  confirmer: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback doit être utilisé sous <FeedbackProvider>.");
  return ctx;
}

function IconeToast({ type }: { type: ToastType }) {
  const commun = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (type === "success")
    return (
      <svg {...commun}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  if (type === "error")
    return (
      <svg {...commun}>
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    );
  return (
    <svg {...commun}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const compteur = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++compteur.current;
    setToasts((liste) => [...liste, { id, message, type }]);
    setTimeout(() => setToasts((liste) => liste.filter((t) => t.id !== id)), 4200);
  }, []);

  const confirmer = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  function repondre(valeur: boolean) {
    confirmState?.resolve(valeur);
    setConfirmState(null);
  }

  const api = useMemo(() => ({ toast, confirmer }), [toast, confirmer]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="toast-pile" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role="status">
            <span className="toast-ico">
              <IconeToast type={t.type} />
            </span>
            <span>{t.message}</span>
            <button
              className="toast-x"
              aria-label="Fermer"
              onClick={() => setToasts((liste) => liste.filter((x) => x.id !== t.id))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="modal-fond" onClick={() => repondre(false)}>
          <div className="modal-boite" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmState.titre}</h3>
            {confirmState.message && <p>{confirmState.message}</p>}
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => repondre(false)}>
                {confirmState.annuler ?? "Annuler"}
              </button>
              <button
                className={`btn${confirmState.danger ? " danger" : ""}`}
                onClick={() => repondre(true)}
                autoFocus
              >
                {confirmState.confirmer ?? "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

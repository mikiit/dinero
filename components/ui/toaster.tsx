"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { XIcon } from "lucide-react";

type UndoResult = { error?: string } | void;

type ToastInput = {
  message: string;
  /** Makes the toast show an Undo button. May report a failure by returning
   * `{ error }`, which is then shown instead of being lost. */
  undo?: () => Promise<UndoResult> | UndoResult;
  /** Defaults to 7 s with an Undo (time to notice and react), 4 s without. */
  durationMs?: number;
};

type ToastState = ToastInput & { id: number };

const ToastContext = createContext<{ show: (toast: ToastInput) => void }>({
  show: () => {},
});

/**
 * One toast at a time, app-wide: a new one replaces the old. It sits above
 * the phone tab bar (which is 4rem tall) and the home-indicator safe area, so
 * it is never hidden behind navigation - and being a single, shared layer is
 * what lets *every* save and delete offer Undo the same way.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      clearTimer();
      const id = nextId.current++;
      setToast({ ...input, id });
      timer.current = setTimeout(
        () => setToast((current) => (current?.id === id ? null : current)),
        input.durationMs ?? (input.undo ? 7000 : 4000),
      );
    },
    [],
  );

  useEffect(() => clearTimer, []);

  async function handleUndo() {
    if (!toast?.undo) return;
    const undo = toast.undo;
    dismiss();
    try {
      const result = await undo();
      if (result && result.error) {
        show({ message: `Couldn't undo: ${result.error}` });
      }
    } catch {
      show({ message: "Couldn't undo that." });
    }
  }

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg lg:bottom-6"
        >
          <span>{toast.message}</span>
          <div className="flex shrink-0 items-center gap-3">
            {toast.undo && (
              <button type="button" onClick={handleUndo} className="font-medium underline">
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="text-background/70"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

import { XIcon } from "lucide-react";

export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg">
      <span>{message}</span>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={onUndo} className="font-medium underline">
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-background/70"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

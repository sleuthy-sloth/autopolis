import { useEffect, useId, useRef } from 'react';
interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  onFocusFallback?: () => void;
}
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel, onFocusFallback }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef(onFocusFallback);
  fallbackRef.current = onFocusFallback;
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
      else fallbackRef.current?.();
    };
  }, []);
  return (
    <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={e => { e.preventDefault(); onCancel(); }}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      <div className="dialog-actions">
        <button ref={cancelRef} className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
    children: ReactNode;
    className: string;
    label: string;
    onClose: () => void;
}

export function Modal({ children, className, label, onClose }: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className={`modal-native ${className}`}
            aria-label={label}
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            {children}
        </dialog>
    );
}

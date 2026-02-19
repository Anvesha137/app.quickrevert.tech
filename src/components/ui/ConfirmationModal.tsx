import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'primary' | 'success' | 'warning';
    loading?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary',
    loading = false,
}: ConfirmationModalProps) {

    const variants = {
        primary: {
            icon: Info,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20',
        },
        danger: {
            icon: AlertTriangle,
            iconBg: 'bg-red-50',
            iconColor: 'text-red-600',
            button: 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
        },
        success: {
            icon: CheckCircle2,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20',
        },
        warning: {
            icon: AlertTriangle,
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20',
        },
    };

    const currentVariant = variants[variant];
    const Icon = currentVariant.icon;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl"
                    >
                        <button
                            onClick={onClose}
                            className="absolute right-6 top-6 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex flex-col items-center text-center">
                            <div className={cn("mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg rotate-12 transition-transform hover:rotate-0", currentVariant.iconBg)}>
                                <Icon className={cn("h-10 w-10", currentVariant.iconColor)} />
                            </div>

                            <h3 className="mb-2 text-2xl font-black text-slate-800">
                                {title}
                            </h3>
                            <p className="mb-8 text-slate-500 font-medium leading-relaxed">
                                {message}
                            </p>

                            <div className="flex w-full flex-col gap-3 sm:flex-row">
                                <button
                                    onClick={onClose}
                                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
                                >
                                    {cancelLabel}
                                </button>
                                <button
                                    onClick={onConfirm}
                                    disabled={loading}
                                    className={cn(
                                        "flex-[2] rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-xl transition-all active:scale-95 disabled:opacity-50",
                                        currentVariant.button
                                    )}
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                            <span>Processing...</span>
                                        </div>
                                    ) : (
                                        confirmLabel
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

"use client";

import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  isDestructive = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050A10]/80 backdrop-blur-sm">
      <div className="bg-[#0B131E] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full ${isDestructive ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
        </div>
        
        <p className="text-sm text-white/70 mb-8 pl-16">{message}</p>
        
        <div className="flex items-center justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-white hover:bg-white/5 rounded-xl transition"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${isDestructive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-cyan hover:bg-cyan/90 text-[#050A10]'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

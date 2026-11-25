"use client";

import React from "react";
import { Webhook, X } from "lucide-react";
import WebhooksAndApiPanel from "./WebhooksAndApiPanel";

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  campaigns?: { id: string; name: string }[];
}

export default function WebhooksModal({ isOpen, onClose, apiBase, campaigns = [] }: WebhooksModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Webhooks, API Keys & Automation Hub</h2>
              <p className="text-xs text-slate-500">
                Manage global & campaign-wise webhooks, delivery logs, scoped API keys, and inbound triggers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <WebhooksAndApiPanel apiBase={apiBase} campaigns={campaigns} />
        </div>
      </div>
    </div>
  );
}

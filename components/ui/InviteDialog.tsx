"use client";

import { useState } from "react";

interface InviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  inviteUrl: string;
}

export function InviteDialog({ isOpen, onClose, inviteUrl }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState("");

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!email) return;
    setIsSending(true);
    setEmailError("");
    setEmailSuccess(false);

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, inviteUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email. Ensure you have RESEND_API_KEY set.");

      setEmailSuccess(true);
      setEmail("");
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (err: any) {
      setEmailError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1A1A1A] w-full max-w-lg rounded-2xl p-6 shadow-2xl relative border border-[#333]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-semibold text-white mb-1">Invite people</h2>
        <p className="text-gray-400 text-sm mb-6">Invite people to join you for a recording session.</p>

        {/* Section 1: Copy Link */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <h3 className="text-md font-medium text-white">Share a link</h3>
          </div>
          <p className="text-gray-400 text-xs mb-3">Copy the link below and share with others.</p>
          
          <div className="flex items-center gap-3">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="flex-1 bg-[#0F0F0F] text-sm text-gray-300 px-4 py-3 rounded-xl border border-[#333] focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="bg-[#7B5CFF] hover:bg-[#684be3] transition-colors text-white text-sm font-medium px-5 py-3 rounded-xl whitespace-nowrap min-w-[110px]"
            >
              {copySuccess ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-[#333]"></div>
          <span className="mx-4 text-sm text-gray-500">Or</span>
          <div className="flex-1 border-t border-[#333]"></div>
        </div>

        {/* Section 2: Email Invite */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-md font-medium text-white">Invite via email</h3>
          </div>
          <p className="text-gray-400 text-xs mb-3">An email with instructions on how to join will be sent to the invitee.</p>
          
          <div className="flex items-center gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="flex-1 bg-[#0F0F0F] text-sm text-white px-4 py-3 rounded-xl border border-[#333] focus:outline-none focus:border-[#7B5CFF] transition-colors"
            />
            <button
              onClick={handleSendEmail}
              disabled={isSending || !email}
              className="bg-[#7B5CFF] hover:bg-[#684be3] disabled:bg-[#4a3b8c] disabled:cursor-not-allowed transition-colors text-white text-sm font-medium px-5 py-3 rounded-xl whitespace-nowrap min-w-[110px]"
            >
              {isSending ? "Sending..." : emailSuccess ? "Sent!" : "Send invite"}
            </button>
          </div>
          {emailError && <p className="text-red-500 text-xs mt-2">{emailError}</p>}
        </div>
      </div>
    </div>
  );
}

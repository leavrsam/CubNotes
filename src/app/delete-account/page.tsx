"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";

export default function DeleteAccountPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
      if (user?.email) {
        setEmailInput(user.email);
      }
      setLoadingUser(false);
    });
  }, [supabase]);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (currentUser && confirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    if (!currentUser && (!emailInput || !emailInput.includes("@"))) {
      toast.error("Please provide a valid registered email address");
      return;
    }

    setIsDeleting(true);

    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process deletion request");
      }

      setIsSuccess(true);
      toast.success("Account and data successfully deleted");
      
      if (currentUser) {
        await supabase.auth.signOut();
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-red-500/30">
      <div className="max-w-xl mx-auto space-y-8">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to Motif</span>
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            <ShieldAlert size={13} />
            <span>Data Deletion Request</span>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Trash2 size={28} className="text-red-500" />
            Delete Account &amp; Data
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            In compliance with Google Play Store policies and global privacy regulations (GDPR &amp; CCPA), you can request permanent deletion of your Motif account and all associated user data.
          </p>
        </div>

        {/* Success View */}
        {isSuccess ? (
          <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="text-lg font-bold text-white">Deletion Request Completed</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your account and personal data (including notebooks, pages, meeting recordings, audio files, and AI summaries) have been permanently scheduled for immediate purge from our active servers.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
              >
                Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Warning Box */}
            <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/30 text-red-200 text-xs sm:text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold text-red-400">
                <AlertTriangle size={18} className="shrink-0" />
                <span>This action is permanent and cannot be undone</span>
              </div>
              <p className="text-red-200/90 leading-relaxed">
                Deleting your account will permanently destroy:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-red-300/80">
                <li>All your notebooks, sections, documents, and canvas drawings</li>
                <li>All meeting recordings, audio files, and voice notes</li>
                <li>All AI-generated transcripts, action items, and summaries</li>
                <li>Your profile credentials and collaboration access</li>
              </ul>
            </div>

            {/* Deletion Form */}
            <form onSubmit={handleDelete} className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-5">
              
              {loadingUser ? (
                <div className="flex items-center justify-center py-6 text-zinc-500">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span className="text-xs">Checking account session...</span>
                </div>
              ) : currentUser ? (
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs space-y-1">
                    <span className="text-zinc-500">Currently signed in as:</span>
                    <p className="font-semibold text-white">{currentUser.email}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300">
                      Type <span className="font-mono text-red-400 font-bold">DELETE</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 font-mono transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    If you cannot sign in or have uninstalled the application, enter the email address associated with your Motif account to submit a data deletion request:
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Registered Email Address</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@company.com"
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isDeleting || (Boolean(currentUser) && confirmText !== "DELETE")}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing Deletion...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Permanently Delete My Account &amp; Data</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-zinc-500 space-y-2 border-t border-zinc-800/80 pt-6">
          <p>
            Have questions? Contact our privacy team at <a href="mailto:privacy@wolfcubventures.com" className="text-zinc-400 hover:underline">privacy@wolfcubventures.com</a>
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/terms" className="hover:text-zinc-400">Terms of Service</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-zinc-400">Privacy Policy</Link>
          </div>
        </div>

      </div>
    </div>
  );
}

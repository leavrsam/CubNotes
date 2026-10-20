"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  getInviteDetails, 
  acceptCollaborationInvite, 
  InviteDetails 
} from '@/lib/collaborations';
import { 
  BookOpen, 
  Folder, 
  FileText, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params?.token === 'string' ? params.token : Array.isArray(params?.token) ? params.token[0] : '';

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing invitation token.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadInviteData() {
      try {
        const [{ data: authData }, inviteData] = await Promise.all([
          supabase.auth.getUser(),
          getInviteDetails(token),
        ]);

        if (!isMounted) return;

        if (authData?.user) {
          setCurrentUser(authData.user);
        }

        if (!inviteData) {
          setError('This invitation link is invalid, expired, or was revoked by the owner.');
        } else {
          setInvite(inviteData);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Error loading invitation details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInviteData();

    return () => {
      isMounted = false;
    };
  }, [token, supabase]);

  const handleAcceptInvite = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await acceptCollaborationInvite(token);
      if (!res.success) {
        toast.error(res.error || 'Failed to accept invitation');
        setAccepting(false);
        return;
      }

      toast.success(`You are now collaborating on "${res.title || 'the note'}"!`);

      // Determine redirect URL
      let destination = '/';
      if (res.page_id) {
        destination = `/?pageId=${res.page_id}`;
      } else if (res.notebook_id) {
        destination = `/?notebookId=${res.notebook_id}`;
      }

      router.push(destination);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Unexpected error accepting invitation');
      setAccepting(false);
    }
  };

  const ResourceIcon = invite?.resource_type === 'notebook' ? BookOpen : invite?.resource_type === 'section' ? Folder : FileText;
  const resourceTypeLabel = invite?.resource_type === 'notebook' ? 'Notebook' : invite?.resource_type === 'section' ? 'Folder' : 'Page';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-primary-500 selection:text-white">
      {/* Background Glow Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-zinc-800 to-zinc-900 border border-zinc-700/80 p-2.5 shadow-xl flex items-center justify-center mb-3.5">
            <img src="/logo.png" alt="Motif" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span>Motif Collaboration</span>
            <Sparkles size={16} className="text-primary-400" />
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time collaborative spatial notes & audio
          </p>
        </div>

        {/* State 1: Loading */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 size={28} className="animate-spin text-primary-400" />
            <span className="text-sm font-medium">Verifying invitation...</span>
          </div>
        )}

        {/* State 2: Error / Invalid Link */}
        {!loading && error && (
          <div className="py-4 space-y-5 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Invitation Unavailable</h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed px-4">
                {error}
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
            >
              Go to Motif
            </button>
          </div>
        )}

        {/* State 3: Valid Invite */}
        {!loading && invite && (
          <div className="space-y-6">
            
            {/* Invite Summary Card */}
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4.5 space-y-3.5">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Users size={14} className="text-primary-400" />
                <span>
                  <strong className="text-zinc-200">{invite.owner_name}</strong> invited you to collaborate:
                </span>
              </div>

              <div className="flex items-start gap-3 bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3.5">
                <div className="p-2.5 rounded-lg bg-primary-500/10 text-primary-400 border border-primary-500/20 shrink-0 mt-0.5">
                  <ResourceIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                      {resourceTypeLabel}
                    </span>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                      <ShieldCheck size={12} />
                      {invite.permission === 'edit' ? 'Can Edit' : 'View Only'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-100 truncate" title={invite.resource_title}>
                    {invite.resource_title || 'Untitled'}
                  </h3>
                </div>
              </div>
            </div>

            {/* Path A: User is already logged in */}
            {currentUser ? (
              <div className="space-y-3.5">
                <div className="text-center text-xs text-zinc-400">
                  Signed in as <strong className="text-zinc-200">{currentUser.email}</strong>
                </div>

                <button
                  onClick={handleAcceptInvite}
                  disabled={accepting}
                  className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold transition-all shadow-lg shadow-primary-600/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                >
                  {accepting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>{accepting ? 'Joining Collaboration...' : 'Accept & Open Note'}</span>
                </button>

                <div className="text-center">
                  <button
                    onClick={() => router.push(`/login?invite=${token}&switch=true`)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-400 underline transition-colors"
                  >
                    Not you? Sign into a different account
                  </button>
                </div>
              </div>
            ) : (
              /* Path B: User does not have an account yet or is logged out */
              <div className="space-y-3">
                <p className="text-xs text-center text-zinc-400 leading-relaxed px-2">
                  Create a free Motif account or log in to view and contribute to this note in real-time.
                </p>

                <button
                  onClick={() => router.push(`/login?mode=signup&invite=${token}`)}
                  className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold transition-all shadow-lg shadow-primary-600/25 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <span>Create Account & Join</span>
                  <ArrowRight size={15} />
                </button>

                <button
                  onClick={() => router.push(`/login?mode=signin&invite=${token}`)}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/80 text-zinc-200 text-xs font-semibold transition-colors"
                >
                  Already have an account? Sign In
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

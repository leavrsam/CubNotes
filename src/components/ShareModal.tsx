"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Link2, 
  Check, 
  Mail, 
  Users, 
  BookOpen, 
  Folder, 
  FileText, 
  Trash2, 
  Shield, 
  Copy, 
  Loader2,
  Clock,
  UserPlus
} from 'lucide-react';
import { 
  ResourceType, 
  CollaborationPermission, 
  Collaboration, 
  createShareInvite, 
  getCollaborationsForResource, 
  deleteCollaboration, 
  updateCollaborationPermission 
} from '@/lib/collaborations';
import toast from 'react-hot-toast';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceTitle: string;
  currentUserEmail?: string;
}

export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  currentUserEmail,
}: ShareModalProps) {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Link sharing state
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [linkPermission, setLinkPermission] = useState<CollaborationPermission>('edit');
  const [activeShareLink, setActiveShareLink] = useState<string>('');

  // Email invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<CollaborationPermission>('edit');
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  useEffect(() => {
    if (!isOpen || !resourceId) return;

    let isMounted = true;
    setLoading(true);

    getCollaborationsForResource(resourceType, resourceId).then((collabs) => {
      if (!isMounted) return;
      setCollaborations(collabs);
      setLoading(false);

      // Check if there's already an active general share link (collaborator_email is null)
      const existingLinkCollab = collabs.find(c => !c.collaborator_email);
      if (existingLinkCollab && typeof window !== 'undefined') {
        setActiveShareLink(`${window.location.origin}/invite/${existingLinkCollab.invite_token}`);
        setLinkPermission(existingLinkCollab.permission);
      } else {
        setActiveShareLink('');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, resourceId, resourceType]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    setIsCreatingLink(true);
    try {
      const { data, error, inviteLink } = await createShareInvite({
        resourceType,
        resourceId,
        permission: linkPermission,
      });

      if (error || !data) {
        toast.error('Could not create invite link. Please check network connection.');
      } else {
        setActiveShareLink(inviteLink);
        setCollaborations(prev => [data, ...prev]);
        await navigator.clipboard.writeText(inviteLink);
        setCopiedToken(data.invite_token);
        toast.success('Invite link copied to clipboard!');
        setTimeout(() => setCopiedToken(null), 3000);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate invite link');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyExistingLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopiedToken(null), 3000);
    } catch {
      toast.error('Could not copy link automatically.');
    }
  };

  const handleSendEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    if (!email.includes('@') || !email.includes('.')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (email === currentUserEmail?.toLowerCase()) {
      toast.error("You cannot invite yourself.");
      return;
    }

    setIsSendingInvite(true);
    try {
      const { data, error, inviteLink } = await createShareInvite({
        resourceType,
        resourceId,
        collaboratorEmail: email,
        permission: invitePermission,
      });

      if (error || !data) {
        toast.error('Failed to create invitation for this email.');
      } else {
        setCollaborations(prev => [data, ...prev]);
        setInviteEmail('');
        // Copy the invite link to clipboard automatically as well
        try {
          await navigator.clipboard.writeText(inviteLink);
          toast.success(`Invite created for ${email}! Link copied to clipboard.`, { duration: 4000 });
        } catch {
          toast.success(`Invite created for ${email}!`, { duration: 3000 });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Error sending invite.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeCollab = async (collabId: string) => {
    const success = await deleteCollaboration(collabId);
    if (success) {
      setCollaborations(prev => prev.filter(c => c.id !== collabId));
      toast.success('Access revoked');
      // If the general share link was revoked, reset the link state
      const target = collaborations.find(c => c.id === collabId);
      if (target && !target.collaborator_email) {
        setActiveShareLink('');
      }
    } else {
      toast.error('Failed to revoke access');
    }
  };

  const handleTogglePermission = async (collabId: string, current: CollaborationPermission) => {
    const newPerm: CollaborationPermission = current === 'edit' ? 'view' : 'edit';
    const success = await updateCollaborationPermission(collabId, newPerm);
    if (success) {
      setCollaborations(prev => prev.map(c => c.id === collabId ? { ...c, permission: newPerm } : c));
      toast.success(`Permission updated to ${newPerm === 'edit' ? 'Can edit' : 'Can view'}`);
    } else {
      toast.error('Failed to update permission');
    }
  };

  const ResourceIcon = resourceType === 'notebook' ? BookOpen : resourceType === 'section' ? Folder : FileText;
  const resourceTypeLabel = resourceType === 'notebook' ? 'Notebook' : resourceType === 'section' ? 'Folder' : 'Page';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div 
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-zinc-950/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400 border border-primary-500/20 shrink-0">
              <ResourceIcon size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {resourceTypeLabel}
                </span>
                <span className="text-xs text-zinc-400">Collaboration</span>
              </div>
              <h2 className="text-base font-bold text-zinc-100 truncate mt-0.5" title={resourceTitle}>
                Share &ldquo;{resourceTitle || 'Untitled'}&rdquo;
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Section 1: Share via Link */}
          <div className="space-y-2.5 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-primary-400" />
                <span className="text-sm font-semibold text-zinc-200">Shareable Invite Link</span>
              </div>
              <select
                value={linkPermission}
                onChange={(e) => setLinkPermission(e.target.value as CollaborationPermission)}
                className="bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-2.5 py-1 text-xs text-zinc-300 outline-none focus:border-primary-500"
              >
                <option value="edit">Can edit</option>
                <option value="view">Can view</option>
              </select>
            </div>

            <p className="text-xs text-zinc-400">
              Anyone with this link can collaborate. If they don&apos;t have an account, they will be invited to sign up and joined automatically.
            </p>

            {activeShareLink ? (
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={activeShareLink} 
                  className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono select-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopyExistingLink(collaborations.find(c => !c.collaborator_email)?.invite_token || '')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs transition-colors shrink-0 shadow-sm"
                >
                  {copiedToken ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                  <span>{copiedToken ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={isCreatingLink}
                className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isCreatingLink ? (
                  <Loader2 size={14} className="animate-spin text-zinc-400" />
                ) : (
                  <UserPlus size={14} className="text-primary-400" />
                )}
                <span>Create & Copy Share Link</span>
              </button>
            )}
          </div>

          {/* Section 2: Invite by Email */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Mail size={16} className="text-primary-400" />
              <span>Invite by Email</span>
            </label>
            <form onSubmit={handleSendEmailInvite} className="flex gap-2">
              <input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
              />
              <select
                value={invitePermission}
                onChange={(e) => setInvitePermission(e.target.value as CollaborationPermission)}
                className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 outline-none focus:border-primary-500"
              >
                <option value="edit">Can edit</option>
                <option value="view">Can view</option>
              </select>
              <button
                type="submit"
                disabled={isSendingInvite || !inviteEmail.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSendingInvite && <Loader2 size={13} className="animate-spin" />}
                <span>Invite</span>
              </button>
            </form>
          </div>

          {/* Section 3: Collaborators & Invites List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <Users size={14} />
                <span>Who has access</span>
              </div>
              <span>{collaborations.length + 1} people</span>
            </div>

            <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/30">
              {/* You (Owner) */}
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-600/20 text-primary-400 font-bold flex items-center justify-center text-xs border border-primary-500/30 shrink-0">
                    {currentUserEmail ? currentUserEmail.slice(0, 2).toUpperCase() : 'ME'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-200 truncate">
                      {currentUserEmail || 'You'} <span className="text-zinc-500 font-normal">(You)</span>
                    </div>
                    <div className="text-[11px] text-zinc-500">Resource Owner</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-400 px-2 py-1 bg-zinc-800/60 rounded-md border border-zinc-700/50">
                  <Shield size={12} className="text-amber-400" />
                  <span>Owner</span>
                </div>
              </div>

              {/* Active / Pending Collaborators */}
              {loading ? (
                <div className="p-4 flex items-center justify-center text-zinc-500 text-xs gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Loading collaborators...</span>
                </div>
              ) : collaborations.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 text-xs italic">
                  Not shared with anyone yet. Create an invite link or invite by email above!
                </div>
              ) : (
                collaborations.map((collab) => {
                  const isLinkOnly = !collab.collaborator_email;
                  const label = isLinkOnly ? 'Anyone with invite link' : collab.collaborator_email;
                  const isAccepted = collab.status === 'accepted';

                  return (
                    <div key={collab.id} className="flex items-center justify-between p-3 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border ${
                          isAccepted 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {isLinkOnly ? <Link2 size={14} /> : (collab.collaborator_email?.slice(0, 2).toUpperCase() || 'U')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-200 truncate" title={label || undefined}>
                            {label}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            {isAccepted ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Check size={11} /> Accepted
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Clock size={11} /> Pending invite
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePermission(collab.id, collab.permission)}
                          className="px-2 py-1 rounded-md text-xs bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 transition-colors"
                          title="Click to toggle permission"
                        >
                          {collab.permission === 'edit' ? 'Can edit' : 'Can view'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyExistingLink(collab.invite_token)}
                          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                          title="Copy invite link"
                        >
                          {copiedToken === collab.invite_token ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevokeCollab(collab.id)}
                          className="p-1.5 rounded-md hover:bg-red-950/40 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Revoke access"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

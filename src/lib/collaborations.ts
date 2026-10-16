import { createClient } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export type ResourceType = 'notebook' | 'section' | 'page';
export type CollaborationPermission = 'edit' | 'view';
export type CollaborationStatus = 'pending' | 'accepted';

export interface Collaboration {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  owner_id: string;
  collaborator_id?: string | null;
  collaborator_email?: string | null;
  invite_token: string;
  permission: CollaborationPermission;
  status: CollaborationStatus;
  created_at: string;
  accepted_at?: string | null;
}

export interface InviteDetails {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  resource_title: string;
  owner_email: string;
  owner_name: string;
  permission: CollaborationPermission;
  status: CollaborationStatus;
  created_at: string;
}

/**
 * Creates a unique, shareable invitation token.
 */
export function generateInviteToken(): string {
  // Generate a clean alphanumeric token
  return `${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Creates a new collaboration / invite record.
 */
export async function createShareInvite(params: {
  resourceType: ResourceType;
  resourceId: string;
  collaboratorEmail?: string;
  permission?: CollaborationPermission;
}): Promise<{ data: Collaboration | null; error: any; inviteLink: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return { data: null, error: new Error('User not authenticated'), inviteLink: '' };
  }

  const token = generateInviteToken();
  const email = params.collaboratorEmail ? params.collaboratorEmail.trim().toLowerCase() : null;

  try {
    const { data, error } = await supabase
      .from('collaborations')
      .insert({
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        owner_id: userData.user.id,
        collaborator_email: email,
        invite_token: token,
        permission: params.permission || 'edit',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating share invite:', error);
      return { data: null, error, inviteLink: '' };
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteLink = `${origin}/invite/${token}`;

    return { data: data as Collaboration, error: null, inviteLink };
  } catch (err: any) {
    console.error('Exception creating share invite:', err);
    return { data: null, error: err, inviteLink: '' };
  }
}

/**
 * Lists all active collaborations / invites for a given resource.
 */
export async function getCollaborationsForResource(
  resourceType: ResourceType,
  resourceId: string
): Promise<Collaboration[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from('collaborations')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching collaborations:', error);
      return [];
    }

    return (data || []) as Collaboration[];
  } catch (err) {
    console.warn('Exception in getCollaborationsForResource:', err);
    return [];
  }
}

/**
 * Updates an existing collaboration's permission ('edit' or 'view').
 */
export async function updateCollaborationPermission(
  collaborationId: string,
  permission: CollaborationPermission
): Promise<boolean> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from('collaborations')
      .update({ permission })
      .eq('id', collaborationId);

    if (error) {
      console.error('Failed to update permission:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception updating permission:', err);
    return false;
  }
}

/**
 * Deletes or revokes a collaboration / invite.
 */
export async function deleteCollaboration(collaborationId: string): Promise<boolean> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from('collaborations')
      .delete()
      .eq('id', collaborationId);

    if (error) {
      console.error('Failed to delete collaboration:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception deleting collaboration:', err);
    return false;
  }
}

/**
 * Retrieves preview details for an invitation token (safe for prospective users).
 */
export async function getInviteDetails(inviteToken: string): Promise<InviteDetails | null> {
  const supabase = createClient();
  try {
    // 1. Try RPC function
    const { data, error } = await supabase.rpc('get_collaboration_invite_details', {
      token_input: inviteToken,
    });

    if (!error && data && data.length > 0) {
      return data[0] as InviteDetails;
    }

    // 2. Direct fallback query if RPC function hasn't been created yet
    const { data: directData, error: directErr } = await supabase
      .from('collaborations')
      .select('id, resource_type, resource_id, collaborator_email, permission, status, created_at')
      .eq('invite_token', inviteToken)
      .single();

    if (directErr || !directData) {
      return null;
    }

    let title = 'Shared Item';
    if (directData.resource_type === 'notebook') {
      const { data: nb } = await supabase.from('notebooks').select('title').eq('id', directData.resource_id).single();
      if (nb) title = nb.title;
    } else if (directData.resource_type === 'section') {
      const { data: sec } = await supabase.from('sections').select('title').eq('id', directData.resource_id).single();
      if (sec) title = sec.title;
    } else if (directData.resource_type === 'page') {
      const { data: pg } = await supabase.from('pages').select('title').eq('id', directData.resource_id).single();
      if (pg) title = pg.title;
    }

    return {
      id: directData.id,
      resource_type: directData.resource_type,
      resource_id: directData.resource_id,
      resource_title: title,
      owner_email: 'A CubNotes user',
      owner_name: 'Team member',
      permission: directData.permission,
      status: directData.status,
      created_at: directData.created_at,
    };
  } catch (err) {
    console.warn('Exception in getInviteDetails:', err);
    return null;
  }
}

/**
 * Accepts an invitation token using the authenticated user's session.
 */
export async function acceptCollaborationInvite(inviteToken: string): Promise<{
  success: boolean;
  error?: string;
  resource_type?: ResourceType;
  resource_id?: string;
  page_id?: string;
  section_id?: string;
  notebook_id?: string;
  title?: string;
}> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return { success: false, error: 'Please sign in to accept this invitation' };
  }

  try {
    // 1. Try RPC function
    const { data, error } = await supabase.rpc('accept_collaboration_invite', {
      token_input: inviteToken,
    });

    if (!error && data && data.success) {
      return data;
    }

    // 2. Direct fallback update
    const { data: collab, error: fetchErr } = await supabase
      .from('collaborations')
      .select('*')
      .eq('invite_token', inviteToken)
      .single();

    if (fetchErr || !collab) {
      return { success: false, error: 'Invalid invitation link or invitation has expired' };
    }

    const { error: updateErr } = await supabase
      .from('collaborations')
      .update({
        collaborator_id: userData.user.id,
        collaborator_email: userData.user.email || collab.collaborator_email,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', collab.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Resolve IDs
    let page_id = undefined;
    let section_id = undefined;
    let notebook_id = undefined;
    let title = 'Shared Item';

    if (collab.resource_type === 'notebook') {
      notebook_id = collab.resource_id;
      const { data: nb } = await supabase.from('notebooks').select('title').eq('id', notebook_id).single();
      if (nb) title = nb.title;
      const { data: sec } = await supabase.from('sections').select('id').eq('notebook_id', notebook_id).limit(1).single();
      if (sec) {
        section_id = sec.id;
        const { data: pg } = await supabase.from('pages').select('id').eq('section_id', sec.id).limit(1).single();
        if (pg) page_id = pg.id;
      }
    } else if (collab.resource_type === 'section') {
      section_id = collab.resource_id;
      const { data: sec } = await supabase.from('sections').select('title, notebook_id').eq('id', section_id).single();
      if (sec) {
        title = sec.title;
        notebook_id = sec.notebook_id;
        const { data: pg } = await supabase.from('pages').select('id').eq('section_id', section_id).limit(1).single();
        if (pg) page_id = pg.id;
      }
    } else if (collab.resource_type === 'page') {
      page_id = collab.resource_id;
      const { data: pg } = await supabase.from('pages').select('title, section_id').eq('id', page_id).single();
      if (pg) {
        title = pg.title;
        section_id = pg.section_id;
        const { data: sec } = await supabase.from('sections').select('notebook_id').eq('id', section_id).single();
        if (sec) notebook_id = sec.notebook_id;
      }
    }

    return {
      success: true,
      resource_type: collab.resource_type,
      resource_id: collab.resource_id,
      title,
      page_id,
      section_id,
      notebook_id,
    };
  } catch (err: any) {
    console.error('Exception in acceptCollaborationInvite:', err);
    return { success: false, error: err.message || 'Could not accept invitation' };
  }
}

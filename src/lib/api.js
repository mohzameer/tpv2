import { supabase } from './supabase'
import { getGuestId } from './guest'

function generateProjectId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Projects
export async function getProjects() {
  const guestId = getGuestId()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createProject(name) {
  const guestId = getGuestId()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Create project
  const { data, error } = await supabase
    .from('projects')
    .insert({ id: generateProjectId(), name, guest_id: guestId, type: 'native' })
    .select()
    .single()
  if (error) throw error
  
  // If authenticated, create owner entry in project_members
  if (user) {
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: data.id,
        user_id: user.id,
        role: 'owner'
      })
    if (memberError) {
      // If member creation fails, try to clean up project
      await supabase.from('projects').delete().eq('id', data.id)
      throw memberError
    }
  }
  
  return data
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// Documents
export async function getDocuments(projectId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createDocument(projectId, title) {
  const { data, error } = await supabase
    .from('documents')
    .insert({ project_id: projectId, title })
    .select()
    .single()
  if (error) throw error
  
  // Create empty content entry
  await supabase
    .from('document_contents')
    .insert({ document_id: data.id })
  
  return data
}

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}

// Document Contents
export async function getDocumentContent(documentId) {
  const { data, error } = await supabase
    .from('document_contents')
    .select('*')
    .eq('document_id', documentId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function updateDocumentContent(documentId, { notes_content, drawing_content, layout_mode, layout_ratio, text_mode }) {
  const updates = {}
  if (notes_content !== undefined) updates.notes_content = notes_content
  if (drawing_content !== undefined) updates.drawing_content = drawing_content
  if (layout_mode !== undefined) updates.layout_mode = layout_mode
  if (layout_ratio !== undefined) updates.layout_ratio = layout_ratio
  if (text_mode !== undefined) updates.text_mode = text_mode
  
  const { data, error } = await supabase
    .from('document_contents')
    .update(updates)
    .eq('document_id', documentId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================================
// Project Members & Collaboration
// ============================================================================

// Get all members of a project with emails from user_profiles
export async function getProjectMembers(projectId) {
  // First get project members
  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  
  if (membersError) throw membersError
  if (!members || members.length === 0) return []
  
  // Get user profiles for all user_ids
  const userIds = members.map(m => m.user_id).filter(Boolean)
  if (userIds.length === 0) return members
  
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name')
    .in('user_id', userIds)
  
  if (profilesError) {
    console.warn('Failed to fetch user profiles:', profilesError)
    // Return members without emails if profiles fail
    return members
  }
  
  // Create a map of user_id -> profile
  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])
  
  // Merge members with their profiles
  return members.map(member => ({
    ...member,
    email: profileMap.get(member.user_id)?.email || null,
    display_name: profileMap.get(member.user_id)?.display_name || null,
    profile: profileMap.get(member.user_id) || null
  }))
}

// Get current user's role in a project
export async function getUserRole(projectId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // No member record found
    throw error
  }
  
  return data?.role || null
}

// Find user by email (for adding members)
// Uses user_profiles table to lookup user_id from email
export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email')
    .eq('email', email)
    .single()
  
  if (error) {
    // If user not found, return null
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }
  return data ? { id: data.user_id, email: data.email } : null
}

// Add a member to a project by email
export async function addProjectMember(projectId, userEmail, role) {
  // First, get user_id from email
  const userId = await getUserByEmail(userEmail)
  if (!userId || !userId.id) {
    throw new Error(`User with email ${userEmail} not found`)
  }
  
  // Then add as member
  return addProjectMemberById(projectId, userId.id, role)
}

// Add a member to a project by user_id
export async function addProjectMemberById(projectId, userId, role) {
  const { data, error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: userId,
      role: role
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================================
// User Profile Management
// ============================================================================

// Get current user's profile
export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Profile doesn't exist yet
    throw error
  }
  return data
}

// Update user profile (display_name)
export async function updateUserProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', user.id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// ============================================================================
// Guest Project Claiming
// ============================================================================

// Automatically claim guest projects when user authenticates
// This adds the user as 'owner' to all projects with their guest_id that don't have project_members
// Only claims if there are actually guest projects to claim (user was previously a guest)
export async function claimGuestProjects() {
  console.log('[CLAIM] claimGuestProjects called')
  const { data: { user } } = await supabase.auth.getUser()
  console.log('[CLAIM] User check:', { hasUser: !!user, userId: user?.id })
  if (!user) {
    console.log('[CLAIM] No user, returning early')
    return { claimed: 0, error: null }
  }
  
  const guestId = getGuestId()
  console.log('[CLAIM] Guest ID:', guestId ? guestId.substring(0, 10) + '...' : 'null')
  if (!guestId) {
    console.log('[CLAIM] No guest ID, returning early')
    return { claimed: 0, error: null }
  }
  
  try {
    console.log('[CLAIM] Checking if there are any projects with this guest_id...')
    // First, quickly check if there are any projects with this guest_id at all
    // This avoids unnecessary work for fresh logins
    const { data: allProjects, error: fetchError, count } = await supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .eq('guest_id', guestId)
      .limit(1) // Just check if any exist
    
    if (fetchError) {
      console.error('[CLAIM] Error checking for guest projects:', fetchError)
      return { claimed: 0, error: fetchError }
    }
    
    console.log('[CLAIM] Projects found with guest_id:', count || 0)
    if (!count || count === 0) {
      console.log('[CLAIM] No guest projects found - nothing to claim')
      return { claimed: 0, error: null }
    }
    
    // If we get here, there are projects - fetch them all to claim
    console.log('[CLAIM] Found', count, 'project(s) with guest_id, fetching details...')
    const { data: allProjectsFull, error: fetchErrorFull } = await supabase
      .from('projects')
      .select('id')
      .eq('guest_id', guestId)
    
    if (fetchErrorFull) {
      console.error('[CLAIM] Error fetching guest projects:', fetchErrorFull)
      return { claimed: 0, error: fetchErrorFull }
    }
    
    const allProjects = allProjectsFull || []
    console.log('[CLAIM] Processing', allProjects.length, 'project(s)')
    
    // Get all projects that already have members
    const projectIds = allProjects.map(p => p.id)
    console.log('[CLAIM] Checking which projects already have members...')
    const { data: projectsWithMembers } = await supabase
      .from('project_members')
      .select('project_id')
      .in('project_id', projectIds)
    
    const claimedProjectIds = new Set(
      projectsWithMembers?.map(p => p.project_id) || []
    )
    
    // Filter to only projects without members
    const unclaimedProjects = allProjects.filter(
      p => !claimedProjectIds.has(p.id)
    )
    
    console.log('[CLAIM] Unclaimed projects:', unclaimedProjects.length)
    if (unclaimedProjects.length === 0) {
      console.log('[CLAIM] No unclaimed projects')
      return { claimed: 0, error: null }
    }
    
    // Claim all unclaimed projects by adding user as owner
    const membersToInsert = unclaimedProjects.map(project => ({
      project_id: project.id,
      user_id: user.id,
      role: 'owner'
    }))
    
    console.log('[CLAIM] Inserting', membersToInsert.length, 'project_members entries...')
    const { data, error: insertError } = await supabase
      .from('project_members')
      .insert(membersToInsert)
      .select()
    
    if (insertError) {
      console.error('[CLAIM] Error claiming projects:', insertError)
      return { claimed: 0, error: insertError }
    }
    
    console.log('[CLAIM] Successfully claimed', data?.length || 0, 'projects')
    return { claimed: data?.length || 0, error: null }
  } catch (err) {
    console.error('[CLAIM] Error in claimGuestProjects:', err)
    return { claimed: 0, error: err }
  }
}

// Remove a member from a project
export async function removeProjectMember(projectId, userId) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}

// Update a member's role
export async function updateProjectMemberRole(projectId, userId, newRole) {
  const { data, error } = await supabase
    .from('project_members')
    .update({ role: newRole })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

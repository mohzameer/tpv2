import { supabase } from './supabase'
import { getGuestId, hasEverLoggedIn } from './guest'

function generateProjectId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Migrate guest projects to owner when user logs in
export async function migrateGuestProjectsToOwner(userId) {
  try {
    console.log('[api] migrateGuestProjectsToOwner - Starting for userId:', userId)
    const guestId = localStorage.getItem('thinkpost_guest_id')
    console.log('[api] migrateGuestProjectsToOwner - guestId:', guestId)
    if (!guestId) {
      console.log('[api] migrateGuestProjectsToOwner - No guest ID found, skipping migration')
      return
    }
    
    // Update all projects with this guest_id to have owner_id instead
    console.log('[api] migrateGuestProjectsToOwner - Updating projects...')
    const { data, error } = await supabase
      .from('projects')
      .update({ owner_id: userId, guest_id: null })
      .eq('guest_id', guestId)
      .is('owner_id', null)
      .select()
    
    if (error) {
      console.error('[api] migrateGuestProjectsToOwner - Error:', error)
      throw error
    }
    console.log('[api] migrateGuestProjectsToOwner - Migrated projects:', data?.length || 0, data)
  } catch (err) {
    console.error('[api] migrateGuestProjectsToOwner - Failed:', err)
    throw err
  }
}

// Projects
export async function getProjects(userId = null) {
  console.log('[api] getProjects - Starting... userId param:', userId)
  // Get current user session if not provided
  if (userId === null) {
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id
  }
  console.log('[api] getProjects - userId:', userId)
  
  // If user has ever logged in, they must be logged in now
  const hasLoggedIn = hasEverLoggedIn()
  console.log('[api] getProjects - hasEverLoggedIn:', hasLoggedIn)
  if (hasLoggedIn && !userId) {
    console.error('[api] getProjects - User has logged in before but is not logged in now')
    throw new Error('You must be logged in to access projects.')
  }
  
  let query = supabase
    .from('projects')
    .select('*')
  
  // If authenticated, only get projects owned by user (no guest_id projects)
  // If not authenticated (and never logged in), get guest projects
  if (userId) {
    console.log('[api] getProjects - Querying projects with owner_id:', userId)
    query = query.eq('owner_id', userId)
  } else {
    // Only allow guest access if user has never logged in
    try {
      const guestId = getGuestId()
      console.log('[api] getProjects - Querying projects with guest_id:', guestId)
      query = query.eq('guest_id', guestId)
    } catch (err) {
      // getGuestId throws if user has logged in before
      console.error('[api] getProjects - getGuestId failed:', err)
      throw new Error('You must be logged in to access projects.')
    }
  }
  
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('[api] getProjects - Query error:', error)
    throw error
  }
  console.log('[api] getProjects - Found projects:', data?.length || 0, data)
  return data || []
}

export async function createProject(name) {
  // Get current user session
  const { data: { session } = {} } = await supabase.auth.getSession()
  const userId = session?.user?.id
  
  const projectData = {
    id: generateProjectId(),
    name,
    type: 'native'
  }
  
  // If authenticated, set owner_id; otherwise set guest_id (only if never logged in)
  if (userId) {
    projectData.owner_id = userId
  } else {
    // Only allow guest projects if user has never logged in
    try {
      const guestId = getGuestId()
      projectData.guest_id = guestId
    } catch (err) {
      throw new Error('You must be logged in to create projects.')
    }
  }
  
  const { data, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// Documents
export async function getDocuments(projectId, userId = null) {
  console.log('[api] getDocuments - Starting for projectId:', projectId, 'userId param:', userId)
  // First verify the user has access to this project
  if (userId === null) {
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id
  }
  console.log('[api] getDocuments - userId:', userId)
  
  // If user has ever logged in, they must be logged in now
  const hasLoggedIn = hasEverLoggedIn()
  console.log('[api] getDocuments - hasEverLoggedIn:', hasLoggedIn)
  if (hasLoggedIn && !userId) {
    console.error('[api] getDocuments - User has logged in before but is not logged in now')
    throw new Error('You must be logged in to access documents.')
  }
  
  // Check if project exists and user has access
  let projectQuery = supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
  
  if (userId) {
    // Authenticated: only projects with owner_id matching user
    console.log('[api] getDocuments - Verifying project access with owner_id:', userId)
    projectQuery = projectQuery.eq('owner_id', userId)
  } else {
    // Guest: only if never logged in
    try {
      const guestId = getGuestId()
      console.log('[api] getDocuments - Verifying project access with guest_id:', guestId)
      projectQuery = projectQuery.eq('guest_id', guestId)
    } catch (err) {
      console.error('[api] getDocuments - getGuestId failed:', err)
      throw new Error('You must be logged in to access documents.')
    }
  }
  
  const { data: project, error: projectError } = await projectQuery.single()
  
  if (projectError || !project) {
    console.error('[api] getDocuments - Project access denied or not found:', projectError, project)
    throw new Error('Project not found or access denied')
  }
  console.log('[api] getDocuments - Project access verified:', project)
  
  // Get documents for the project
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('[api] getDocuments - Query error:', error)
    throw error
  }
  console.log('[api] getDocuments - Found documents:', data?.length || 0, data)
  return data || []
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

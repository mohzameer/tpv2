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
  const { data: { user } } = await supabase.auth.getUser()
  
  let query = supabase
    .from('projects')
    .select('*')
  
  if (user) {
    // If user is logged in, get projects by owner_id
    query = query.eq('owner_id', user.id)
  } else {
    // If not logged in, get projects by guest_id BUT exclude projects with owner_id
    // This prevents orphaned projects (with both owner_id and guest_id) from showing up
    const guestId = getGuestId()
    query = query
      .eq('guest_id', guestId)
      .is('owner_id', null) // Only get projects that don't have an owner_id
  }
  
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('getProjects: Error:', error)
    throw error
  }
  
  // Safety filter: If user is not logged in, filter out any projects with owner_id
  // This prevents orphaned projects from showing up even if the database query didn't filter them
  let filteredData = data
  if (!user && data) {
    const beforeFilter = data.length
    filteredData = data.filter(p => !p.owner_id)
    if (beforeFilter !== filteredData.length) {
      console.warn('getProjects: Filtered out', beforeFilter - filteredData.length, 'projects with owner_id (orphaned projects)')
    }
  }
  
  return filteredData || []
}

export async function createProject(name) {
  const { data: { user } } = await supabase.auth.getUser()
  const projectData = {
    id: generateProjectId(),
    name,
    type: 'native'
  }
  
  if (user) {
    // If user is logged in, set owner_id
    projectData.owner_id = user.id
  } else {
    // If not logged in, set guest_id
    projectData.guest_id = getGuestId()
  }
  
  const { data, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function claimGuestProjects() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return
  }
  
  const guestId = getGuestId()
  if (!guestId) {
    return
  }
  
  // Check what project is in localStorage (the one user was working on)
  const LAST_VISITED_KEY = 'thinkpost_last_visited'
  const stored = localStorage.getItem(LAST_VISITED_KEY)
  let localStorageProjectId = null
  if (stored) {
    try {
      const data = JSON.parse(stored)
      localStorageProjectId = data.projectId || data.lastProjectId
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // If we have a project ID from localStorage, check what guest_id it has in the database
  let localStorageProject = null
  let localStorageProjectNeedsClaiming = false
  if (localStorageProjectId) {
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, name, guest_id, owner_id')
      .eq('id', localStorageProjectId)
      .single()
    
    if (!projectError && projectData) {
      localStorageProject = projectData
      if (projectData.guest_id !== guestId) {
        console.warn('claimGuestProjects: MISMATCH! Project guest_id in DB:', projectData.guest_id, 'vs localStorage guest_id:', guestId)
      }
      if (projectData.owner_id && projectData.owner_id !== user.id) {
        console.warn('claimGuestProjects: Project already owned by different user:', projectData.owner_id)
        localStorageProjectNeedsClaiming = true // Wrong owner, needs to be reclaimed
      } else if (projectData.owner_id === user.id) {
        localStorageProjectNeedsClaiming = false
      } else if (!projectData.owner_id) {
        localStorageProjectNeedsClaiming = true
      }
    } else if (projectError) {
      console.error('claimGuestProjects: Error fetching project from localStorage:', projectError)
    }
  }
  
  // Check how many projects exist with this specific guest_id
  const { data: existingProjects, error: checkError } = await supabase
    .from('projects')
    .select('id, name, guest_id, owner_id')
    .eq('guest_id', guestId)
    .is('owner_id', null)
  
  if (checkError) {
    console.error('claimGuestProjects: Error checking existing projects:', checkError)
    throw checkError
  }
  
  // If localStorage project needs claiming but wasn't in the query results, add it to the list
  if (localStorageProjectNeedsClaiming && localStorageProject && localStorageProject.guest_id === guestId) {
    const alreadyInList = existingProjects?.find(p => p.id === localStorageProject.id)
    if (!alreadyInList) {
      if (!existingProjects) {
        existingProjects = []
      }
      existingProjects.push(localStorageProject)
    }
  }
  
  // If we have no projects to claim, exit early
  if (!existingProjects || existingProjects.length === 0) {
    return
  }
  
  // Transfer all guest projects to the user
  const { data: updatedProjects, error } = await supabase
    .from('projects')
    .update({ owner_id: user.id, guest_id: null })
    .eq('guest_id', guestId)
    .is('owner_id', null)
    .select()
  
  if (error) {
    console.error('claimGuestProjects: Error updating projects:', error)
    throw error
  }
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

export async function getDocument(documentId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }
  return data
}

// Get document by project_id and document_number
// Works for both text and drawing documents
export async function getDocumentByNumber(projectId, documentNumber) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('document_number', documentNumber)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }
  return data
}

export async function createDocument(projectId, title, documentType = 'text') {
  const { data, error } = await supabase
    .from('documents')
    .insert({ 
      project_id: projectId, 
      title, 
      document_type: documentType,
      notes_content: '[]',
      drawing_content: '{}',
      drawing_files: '{}',
      text_mode: 'text'
    })
    .select()
    .single()
  if (error) throw error
  
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
  // First verify the document belongs to the current user/guest
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get the document with its project to check ownership
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, project_id')
    .eq('id', documentId)
    .single()
  
  if (docError) {
    if (docError.code === 'PGRST116') {
      // Document not found
      return null
    }
    throw docError
  }
  
  if (!document) {
    return null
  }
  
  // Get the project to verify ownership
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('owner_id, guest_id')
    .eq('id', document.project_id)
    .single()
  
  if (projectError || !project) {
    throw new Error('Project not found')
  }
  
  // Verify ownership: user must match owner_id, or if no user, must match guest_id
  if (user) {
    if (project.owner_id !== user.id) {
      console.error('getDocumentContent: Document does not belong to current user. Project owner:', project.owner_id, 'Current user:', user.id)
      throw new Error('Document not found or access denied')
    }
  } else {
    const guestId = getGuestId()
    if (project.guest_id !== guestId) {
      console.error('getDocumentContent: Document does not belong to current guest. Project guest:', project.guest_id, 'Current guest:', guestId)
      throw new Error('Document not found or access denied')
    }
  }
  
  // Now fetch the content from documents table
  // Try to include document_links - if it fails, we'll try without it
  let { data, error } = await supabase
    .from('documents')
    .select('notes_content, drawing_content, drawing_files, text_mode, document_links')
    .eq('id', documentId)
    .single()
  
  // If the query fails with PGRST204 (schema cache) or 400, try without document_links
  if (error && (error.code === 'PGRST204' || error.code === 'PGRST116')) {
    const { data: dataWithoutLinks, error: errorWithoutLinks } = await supabase
      .from('documents')
      .select('notes_content, drawing_content, drawing_files, text_mode')
      .eq('id', documentId)
      .single()
    
    if (errorWithoutLinks) {
      if (errorWithoutLinks.code === 'PGRST116') {
        return null
      }
      throw errorWithoutLinks
    }
    
    if (!dataWithoutLinks) {
      return null
    }
    
    // Set empty array for document_links if we couldn't fetch it
    dataWithoutLinks.document_links = []
    return dataWithoutLinks
  }
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }
  
  if (!data) {
    return null
  }
  
  // Ensure document_links is always an array
  if (!data.document_links || !Array.isArray(data.document_links)) {
    data.document_links = []
  }
  
  return data
}

export async function updateDocumentContent(documentId, { notes_content, drawing_content, text_mode, drawing_files, document_links }) {
  const updates = {}
  if (notes_content !== undefined) updates.notes_content = notes_content
  if (drawing_content !== undefined) updates.drawing_content = drawing_content
  if (text_mode !== undefined) updates.text_mode = text_mode
  if (drawing_files !== undefined) updates.drawing_files = drawing_files
  if (document_links !== undefined) updates.document_links = document_links
  
  // If no updates, return early
  if (Object.keys(updates).length === 0) {
    return { success: true }
  }
  
  // Try to update all fields together
  const { error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', documentId)
  
  if (error) {
    // If it's a schema cache issue with document_links, don't throw - just warn
    if (error.code === 'PGRST204' && document_links !== undefined) {
      // Try updating other fields if there are any
      const updatesWithoutLinks = { ...updates }
      delete updatesWithoutLinks.document_links
      
      if (Object.keys(updatesWithoutLinks).length > 0) {
        const { error: retryError } = await supabase
          .from('documents')
          .update(updatesWithoutLinks)
          .eq('id', documentId)
        
        if (retryError) {
          throw retryError
        } else {
          return { success: false, document_links_skipped: true, error: 'PGRST204' }
        }
      } else {
        // Only document_links was being updated, and it failed
        return { success: false, document_links_skipped: true, error: 'PGRST204' }
      }
    } else {
      throw error
    }
  }
  
  return { success: true }
}

// Update document links
export async function updateDocumentLinks(documentId, links) {
  try {
    
    const { data, error } = await supabase
      .from('documents')
      .update({ document_links: links })
      .eq('id', documentId)
      .select('id, document_links')
      .single()
    
    if (error) {
      throw error
    }
    
    
    return data
  } catch (err) {
    throw err
  }
}

// User Profiles - Last Visited
export async function getUserLastVisited() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('last_project_id, last_doc_id')
    .eq('user_id', user.id)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('getUserLastVisited: Error:', error)
    throw error
  }
  
  if (!data) return null
  
  return {
    projectId: data.last_project_id,
    docId: data.last_doc_id
  }
}

export async function setUserLastVisited(projectId, docId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return
  }
  
  // Get existing profile to preserve display_name and email
  const { data: existing, error: fetchError } = await supabase
    .from('user_profiles')
    .select('display_name, email')
    .eq('user_id', user.id)
    .single()
  
  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('setUserLastVisited: Error fetching existing profile:', fetchError)
  }
  
  const upsertData = {
    user_id: user.id,
    email: existing?.email || user.email || null,
    display_name: existing?.display_name || null,
    last_project_id: projectId,
    last_doc_id: typeof docId === 'number' ? docId : parseInt(docId, 10), // Ensure docId is integer
    updated_at: new Date().toISOString()
  }
  
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(upsertData, {
      onConflict: 'user_id'
    })
    .select()
  
  if (error) {
    console.error('setUserLastVisited: Upsert error:', error)
    throw error
  }
}

// User Profiles - Display Name
export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('email, display_name')
    .eq('user_id', user.id)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createUserProfile(userId, email) {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert({
      user_id: userId,
      email: email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function updateUserDisplayName(displayName) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')
  
  // Get existing profile to preserve last_project_id, last_doc_id, and email
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('last_project_id, last_doc_id, email')
    .eq('user_id', user.id)
    .single()
  
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      email: existing?.email || user.email || null,
      display_name: displayName || null,
      last_project_id: existing?.last_project_id || null,
      last_doc_id: existing?.last_doc_id || null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

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
    // If not logged in, get projects by guest_id
    const guestId = getGuestId()
    query = query.eq('guest_id', guestId)
  }
  
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data
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
  if (!user) return
  
  const guestId = getGuestId()
  if (!guestId) return
  
  // Transfer all guest projects to the user
  const { error } = await supabase
    .from('projects')
    .update({ owner_id: user.id, guest_id: null })
    .eq('guest_id', guestId)
    .is('owner_id', null)
  
  if (error) throw error
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

// User Profiles - Last Visited
export async function getUserLastVisited() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('last_project_id, last_doc_id')
    .eq('user_id', user.id)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null
  
  return {
    projectId: data.last_project_id,
    docId: data.last_doc_id
  }
}

export async function setUserLastVisited(projectId, docId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  
  // Get existing profile to preserve display_name and email
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('display_name, email')
    .eq('user_id', user.id)
    .single()
  
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      email: existing?.email || user.email || null,
      display_name: existing?.display_name || null,
      last_project_id: projectId,
      last_doc_id: docId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
  
  if (error) throw error
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

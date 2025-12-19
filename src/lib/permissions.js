// Permission helper functions for role-based access control

/**
 * Check if user can edit document content (text)
 */
export function canEditText(userRole) {
  return ['owner', 'editor'].includes(userRole);
}

/**
 * Check if user can edit drawing content
 */
export function canEditDrawing(userRole) {
  return userRole === 'owner';
}

/**
 * Check if user can delete documents
 */
export function canDeleteDocument(userRole) {
  return userRole === 'owner';
}

/**
 * Check if user can manage project members (add/remove/change roles)
 */
export function canManageMembers(userRole) {
  return userRole === 'owner';
}

/**
 * Check if user can create documents
 */
export function canCreateDocuments(userRole) {
  return ['owner', 'editor'].includes(userRole);
}

/**
 * Check if user can view a document based on role and is_open status
 */
export function canViewDocument(userRole, isOpen) {
  if (isOpen) return true;
  return ['owner', 'editor'].includes(userRole);
}

/**
 * Check if user can edit document (any content)
 */
export function canEditDocument(userRole) {
  return ['owner', 'editor'].includes(userRole);
}

/**
 * Get permission summary for a role
 */
export function getPermissionSummary(userRole) {
  const permissions = {
    canEditText: canEditText(userRole),
    canEditDrawing: canEditDrawing(userRole),
    canDelete: canDeleteDocument(userRole),
    canManageMembers: canManageMembers(userRole),
    canCreateDocuments: canCreateDocuments(userRole),
  };
  
  return permissions;
}


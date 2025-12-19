import { useState, useEffect } from 'react'
import {
  Modal,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  Select,
  ActionIcon,
  Alert,
  Loader,
  Divider
} from '@mantine/core'
import { IconX, IconUserPlus, IconAlertCircle } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import {
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole
} from '../lib/api'
import MemberList from './MemberList'
import { useAuth } from '../context/AuthContext'

export default function SharingModal({ opened, onClose }) {
  const { project, userRole, members, refreshMembers } = useProjectContext()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('editor')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Only Owners can manage sharing
  if (userRole !== 'owner') {
    return null
  }

  async function handleAddMember() {
    if (!newMemberEmail.trim()) {
      setError('Please enter an email address')
      return
    }

    setError('')
    setSuccess('')
    setAddingMember(true)

    try {
      await addProjectMember(project.id, newMemberEmail.trim(), newMemberRole)
      setSuccess(`Successfully added ${newMemberEmail.trim()} as ${newMemberRole}`)
      setNewMemberEmail('')
      setNewMemberRole('editor')
      await refreshMembers()
    } catch (err) {
      setError(err.message || 'Failed to add member')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm('Are you sure you want to remove this member?')) return

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await removeProjectMember(project.id, userId)
      setSuccess('Member removed successfully')
      await refreshMembers()
    } catch (err) {
      setError(err.message || 'Failed to remove member')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangeRole(userId, newRole) {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await updateProjectMemberRole(project.id, userId, newRole)
      setSuccess('Role updated successfully')
      await refreshMembers()
    } catch (err) {
      setError(err.message || 'Failed to update role')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setNewMemberEmail('')
    setNewMemberRole('editor')
    setError('')
    setSuccess('')
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Share Project"
      size="lg"
      centered
    >
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        {success && (
          <Alert icon={<IconAlertCircle size={16} />} color="green" title="Success">
            {success}
          </Alert>
        )}

        <div>
          <Text size="sm" fw={500} mb="xs">Current Members</Text>
          {loading ? (
            <Loader size="sm" />
          ) : (
            <MemberList
              members={members}
              currentUserId={user?.id}
              onRemoveMember={handleRemoveMember}
              onChangeRole={handleChangeRole}
              canManage={true}
            />
          )}
        </div>

        <Divider />

        <div>
          <Text size="sm" fw={500} mb="xs">Add Member</Text>
          <Group gap="xs" align="flex-end">
            <TextInput
              placeholder="user@example.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMember()
              }}
            />
            <Select
              value={newMemberRole}
              onChange={(value) => setNewMemberRole(value)}
              data={[
                { value: 'editor', label: 'Editor' },
                { value: 'viewer', label: 'Viewer' }
              ]}
              style={{ width: 120 }}
            />
            <Button
              onClick={handleAddMember}
              loading={addingMember}
              disabled={!newMemberEmail.trim()}
            >
              Add
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Enter the email address of the user you want to invite
          </Text>
        </div>
      </Stack>
    </Modal>
  )
}


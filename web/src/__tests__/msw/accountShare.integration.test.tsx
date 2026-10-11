/**
 * MSW integration — the ACCOUNT-SHARE dialog (share-to-user, roles, ACL).
 *
 * Mounts the REAL AccountShareModal against the MSW-mocked `/api` share surface
 * (GET /files/:id/collaborators, POST /files/:id/share) so the full round-trip
 * runs through fetch:
 *
 *   1. Owner sees the "add collaborator" form + roster (owner row).
 *   2. Sharing a named account posts the grant with the chosen role and the new
 *      collaborator appears in the roster.
 *   3. Changing a collaborator's role posts the new role.
 *   4. Revoking removes the collaborator (POST …/share {revoke:true}).
 *   5. A NON-owner does not see the mutating controls (owner-only UI), matching
 *      the server's owner-gate.
 *
 * The security contract is enforced server-side; this test locks the UI to it so
 * a regression that exposes owner-only controls to a non-owner is caught here.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountShareModal from '../../components/AccountShareModal.jsx'
import { server, resetMock, mockState } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const FILE = { id: 'doc1', name: 'Design Notes' }

describe('AccountShareModal (MSW integration)', () => {
  beforeEach(() => { resetMock({ role: 'owner' }) })

  it('owner can share a named account with a role; it appears in the roster', async () => {
    render(<AccountShareModal open file={FILE} me="you@vulos.test" onClose={() => {}} />)

    // The owner row is shown, and the add form (owner-only) is present.
    await waitFor(() => expect(screen.getByText(/you@vulos.test/)).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/name@example.com 或账号 ID/)

    // Pick the "commenter" role in the add-form select, then share with bob.
    const roleSelect = screen.getByLabelText('角色')
    await userEvent.type(input, 'bob@vulos.test')
    fireEvent.change(roleSelect, { target: { value: 'commenter' } })
    fireEvent.click(screen.getByRole('button', { name: /^分享$/ }))

    // The grant hit the server with the commenter role and bob shows up.
    await waitFor(() => expect(screen.getByText('bob@vulos.test')).toBeInTheDocument())
    expect(mockState.calls).toContain('POST /files/doc1/share')
    const bob = mockState.collaborators.doc1.find((c) => c.account_id === 'bob@vulos.test')
    expect(bob).toBeTruthy()
    expect(bob!.role).toBe('commenter')
  })

  it('owner can change a collaborator role and revoke access', async () => {
    // Seed bob as a viewer.
    mockState.collaborators.doc1 = [{ account_id: 'bob@vulos.test', role: 'viewer' }]

    render(<AccountShareModal open file={FILE} me="you@vulos.test" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('bob@vulos.test')).toBeInTheDocument())

    // Change bob's role to editor via his per-row select.
    const rowSelect = screen.getByLabelText(/bob@vulos.test 的角色/)
    fireEvent.change(rowSelect, { target: { value: 'editor' } })
    await waitFor(() =>
      expect(mockState.collaborators.doc1[0].role).toBe('editor'))

    // Revoke bob.
    fireEvent.click(screen.getByRole('button', { name: /移除 bob@vulos.test/ }))
    await waitFor(() =>
      expect(mockState.collaborators.doc1.find((c) => c.account_id === 'bob@vulos.test')).toBeFalsy())
    // The revoke call was made.
    expect(mockState.calls.filter((c) => c === 'POST /files/doc1/share').length).toBeGreaterThanOrEqual(2)
  })

  it('a NON-owner does not see the add form or per-collaborator controls', async () => {
    // The current user is carol, but the file is owned by you@vulos.test.
    mockState.owner = 'you@vulos.test'
    mockState.collaborators.doc1 = [{ account_id: 'bob@vulos.test', role: 'editor' }]

    render(<AccountShareModal open file={FILE} me="carol@vulos.test" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('bob@vulos.test')).toBeInTheDocument())

    // No add form for a non-owner.
    expect(screen.queryByPlaceholderText(/name@example.com 或账号 ID/)).toBeNull()
    // No per-collaborator role select / remove button either.
    expect(screen.queryByLabelText(/bob@vulos.test 的角色/)).toBeNull()
    expect(screen.queryByRole('button', { name: /移除 bob@vulos.test/ })).toBeNull()
  })

  it('surfaces a server rejection (e.g. 403) without granting locally', async () => {
    // Owner UI, but flip the server to reject as if the caller lost ownership.
    mockState.role = 'viewer' // server returns 403 on share
    render(<AccountShareModal open file={FILE} me="you@vulos.test" onClose={() => {}} />)

    // The dialog still renders the form because ownership is inferred from the
    // roster (owner === me here), but the SERVER refuses the write.
    await waitFor(() => expect(screen.getByText(/you@vulos.test/)).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/name@example.com 或账号 ID/)
    await userEvent.type(input, 'mallory@evil.test')
    fireEvent.click(screen.getByRole('button', { name: /^分享$/ }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/owner may perform/i))
    // No local grant happened.
    expect(mockState.collaborators.doc1.find((c) => c.account_id === 'mallory@evil.test')).toBeFalsy()
  })
})

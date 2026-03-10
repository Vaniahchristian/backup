import { useEffect, useState } from 'react'
import { formatDate } from '../../lib/utils'
import { Check, X, Eye, User, Store, RefreshCw, Ban, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { deleteUser } from '../../lib/database'
import SearchBar from '../../components/SearchBar'

// Database types
interface Profile {
  id: string
  email: string
  full_name: string
  phone?: string
  avatar_url?: string
  role: 'tourist' | 'vendor' | 'admin'
  status?: 'active' | 'pending' | 'approved' | 'rejected' | 'suspended'
  suspended_at?: string
  suspension_period?: string
  suspension_end_at?: string
  created_at: string
  updated_at: string
}

interface Vendor {
  id: string
  user_id: string
  business_name: string
  business_description?: string
  business_address?: string
  business_phone?: string
  business_email?: string
  business_website?: string
  business_type?: string
  operating_hours?: string
  years_in_business?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  created_at: string
  updated_at: string
  profiles?: Profile
}

interface Tourist {
  id: string
  user_id: string
  first_name?: string
  last_name?: string
  phone?: string
  emergency_contact?: string
  emergency_phone?: string
  travel_preferences?: string
  dietary_restrictions?: string
  medical_conditions?: string
  created_at: string
  updated_at: string
  profiles?: Profile
}

interface UserWithDetails {
  profile: Profile
  vendor?: Vendor
  tourist?: Tourist
  isVerified: boolean
}

export default function Businesses() {
  const [users, setUsers] = useState<UserWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected' | 'suspended'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Suspension modal state
  const [showSuspendModal, setShowSuspendModal] = useState(false)
  const [suspendTarget, setSuspendTarget] = useState<{type: 'vendor' | 'user', id: string, name: string} | null>(null)
  const [suspendPeriod, setSuspendPeriod] = useState<'1day' | '1week' | '1month' | 'permanent'>('1week')

  // Generic confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject' | 'delete'
    target: {type: 'vendor' | 'user', id: string, name: string}
    action: () => void
  } | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)

      // Fetch only vendor profiles from the database profiles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'vendor') // Only fetch vendors
        .order('created_at', { ascending: false })

      if (profilesError) {
        console.error('Error fetching vendor profiles from database:', profilesError)
        throw profilesError
      }

      // Create user details using only profile data
      const usersWithDetails: UserWithDetails[] = profiles.map(profile => {
        // Use profile status directly
        const profileStatus = profile.status || (profile.role === 'vendor' ? 'pending' : 'active')

        return {
          profile: {
            ...profile,
            status: profileStatus
          },
          vendor: undefined, // Not fetching vendor data
          tourist: undefined, // Not fetching tourist data
          isVerified: (profile.role === 'vendor' && profileStatus === 'approved') || profile.role === 'tourist' || profile.role === 'admin'
        }
      })

      setUsers(usersWithDetails)
    } catch (error) {
      console.error('Error fetching users from database:', error)
      // In a production app, you would show a user-friendly error message here
    } finally {
      setLoading(false)
    }
  }

  const updateVendorStatus = async (profileId: string, status: 'approved' | 'rejected' | 'suspended') => {
    try {
      // Find the user by profile ID
      const user = users.find(u => u.profile.id === profileId)
      if (!user) {
        throw new Error('User not found')
      }

      // Update vendor status in profiles table (primary status)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', profileId)

      if (profileError) {
        console.error('Database error updating profile status:', profileError)
        throw profileError
      }

      // Sync with vendors table if it exists (for backward compatibility)
      try {
        const { error: vendorError } = await supabase
          .from('vendors')
          .update({
            status,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', profileId)

        if (vendorError && !vendorError.message?.includes('Could not find')) {
          console.warn('Could not sync with vendors table (may not exist):', vendorError)
        }
      } catch (vendorSyncError) {
        console.warn('Vendors table sync failed (table may not exist):', vendorSyncError)
      }

      // Update local state to reflect database changes
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.profile.id === profileId
            ? {
                ...u,
                profile: {
                  ...u.profile,
                  status,
                  updated_at: new Date().toISOString()
                },
                isVerified: status === 'approved'
              }
            : u
        )
      )

      setSelectedUser(null)
      console.log(`Vendor ${user.profile.email} ${status} successfully`)
    } catch (error) {
      console.error('Error updating vendor status:', error)
      // You could add a toast notification here for user feedback
    }
  }

  const updateUserStatus = async (userId: string, status: 'active' | 'suspended') => {
    try {
      // Update user status in profiles table (primary)
      const { error } = await supabase
        .from('profiles')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        console.error('Database error updating user status:', error)
        throw error
      }

      // Get user role to determine if we need to sync with tourists table
      const user = users.find(u => u.profile.id === userId)
      if (user?.profile.role === 'tourist') {
        // Sync with tourists table if it exists (for backward compatibility)
        try {
          const { error: touristError } = await supabase
            .from('tourists')
            .update({
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)

          if (touristError && !touristError.message?.includes('Could not find')) {
            console.warn('Could not sync with tourists table (may not exist):', touristError)
          }
        } catch (touristSyncError) {
          console.warn('Tourists table sync failed (table may not exist):', touristSyncError)
        }
      }

      // Update local state to reflect database changes
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.profile.id === userId
            ? {
                ...user,
                profile: {
                  ...user.profile,
                  status,
                  updated_at: new Date().toISOString()
                }
              }
            : user
        )
      )

      setSelectedUser(null)
      console.log(`User ${userId} ${status} successfully`)
    } catch (error) {
      console.error('Error updating user status:', error)
      // You could add a toast notification here for user feedback
    }
  }

  const deleteUserAccount = async (userId: string, userName: string) => {
    try {
      await deleteUser(userId)

      // Update local state to remove the user
      setUsers(prevUsers => prevUsers.filter(user => user.profile.id !== userId))

      setSelectedUser(null)
      console.log(`User ${userName} deleted successfully`)
    } catch (error) {
      console.error('Error deleting user:', error)
      // You could add a toast notification here for user feedback
    }
  }

  const openSuspendModal = (type: 'vendor' | 'user', id: string, name: string) => {
    setSuspendTarget({ type, id, name })
    setSuspendPeriod('1week')
    setShowSuspendModal(true)
  }

  const handleSuspendConfirm = async () => {
    console.log('handleSuspendConfirm called')
    if (!suspendTarget) {
      console.error('No suspend target set')
      return
    }

    console.log('Starting suspension for:', suspendTarget)

    try {
      const now = new Date()
      let suspensionEndAt: Date | null = null

      // Calculate suspension end date based on period
      switch (suspendPeriod) {
        case '1day':
          suspensionEndAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
          break
        case '1week':
          suspensionEndAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
        case '1month':
          suspensionEndAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          break
        case 'permanent':
          suspensionEndAt = null
          break
      }

      // Update user status in profiles table
      console.log('About to update profiles table for user:', suspendTarget.id)

      // Try full update first (with suspension columns)
      let updateSucceeded = false
      try {
        const { error: fullError } = await supabase
          .from('profiles')
          .update({
            status: 'suspended',
            suspended_at: now.toISOString(),
            suspension_period: suspendPeriod,
            suspension_end_at: suspensionEndAt?.toISOString() || null,
            updated_at: now.toISOString()
          })
          .eq('id', suspendTarget.id)

        if (!fullError) {
          updateSucceeded = true
          console.log('Full update succeeded')
        }
      } catch (e) {
        console.log('Full update failed, trying basic update')
      }

      // If full update failed, try basic update
      if (!updateSucceeded) {
        const { error: basicError } = await supabase
          .from('profiles')
          .update({
            status: 'suspended',
            updated_at: now.toISOString()
          })
          .eq('id', suspendTarget.id)

        if (basicError) {
          console.error('Basic update also failed:', basicError)
          throw basicError
        }
        console.log('Basic update succeeded')
      }

      // Sync with vendors table if suspending a vendor
      if (suspendTarget.type === 'vendor') {
        try {
          const { error: vendorError } = await supabase
            .from('vendors')
            .update({
              status: 'suspended',
              updated_at: now.toISOString()
            })
            .eq('user_id', suspendTarget.id)

          if (vendorError && !vendorError.message?.includes('Could not find')) {
            console.warn('Could not sync with vendors table:', vendorError)
          }
        } catch (vendorSyncError) {
          console.warn('Vendors table sync failed:', vendorSyncError)
        }
      }

      // Update local state
      console.log('Updating local state')
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.profile.id === suspendTarget!.id
            ? {
                ...user,
                profile: {
                  ...user.profile,
                  status: 'suspended',
                  updated_at: now.toISOString()
                }
              }
            : user
        )
      )

      setShowSuspendModal(false)
      setSuspendTarget(null)
      console.log(`${suspendTarget?.type} ${suspendTarget?.name} suspended successfully`)
      // alert(`${suspendTarget?.name} has been suspended successfully!`) // Removed temporary alert
    } catch (error) {
      console.error('Error suspending user:', error)
      const errorMessage = error instanceof Error ? error.message :
                          (error && typeof error === 'object' && 'message' in error) ? (error as any).message :
                          JSON.stringify(error)
      console.error(`Failed to suspend user: ${errorMessage}`)
    }
  }

  const showConfirmation = (type: 'approve' | 'reject' | 'delete', target: {type: 'vendor' | 'user', id: string, name: string}, action: () => void) => {
    setConfirmAction({ type, target, action })
    setShowConfirmModal(true)
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return

    try {
      await confirmAction.action()
      setShowConfirmModal(false)
      setConfirmAction(null)
    } catch (error) {
      console.error('Error performing action:', error)
    }
  }

  const filteredUsers = users.filter(user => {
    // Filter by status
    const statusMatch = filter === 'all' ||
      (filter === 'pending' && user.profile.status === 'pending') ||
      (filter === 'verified' && user.isVerified) ||
      (filter === 'rejected' && user.profile.status === 'rejected') ||
      (filter === 'suspended' && user.profile.status === 'suspended')

    // Filter by search term
    const searchMatch = !searchTerm ||
      user.profile.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.profile.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.vendor?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())

    return statusMatch && searchMatch
  })

  const pendingVendorsCount = users.filter(u => u.profile.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Pending Vendors Alert */}
      {pendingVendorsCount > 0 && (
        <div className="mb-6 bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded-lg shadow-sm">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-yellow-600 mr-3" />
            <span className="text-base text-yellow-900 font-semibold">
              {pendingVendorsCount} vendor{pendingVendorsCount > 1 ? 's' : ''} awaiting approval.
            </span>
            <span className="ml-2 text-sm text-yellow-800">Click the <b>Pending</b> filter below to review and approve/reject vendor applications.</span>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Businesses</h1>
            <p className="mt-1 text-base text-gray-600 font-medium">
              Manage businesses from the database – review profiles, verify vendors, and track registrations
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-base font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-6">
        <SearchBar
          onSearch={setSearchTerm}
          initialValue={searchTerm}
          placeholder="Search businesses by name, email, or business name..."
          className="mb-4"
        />
        <div className="flex flex-wrap gap-2 bg-white p-2 rounded-lg border border-gray-200 mb-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === 'all'
                ? 'bg-blue-700 text-white shadow'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            All Businesses ({users.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === 'pending'
                ? 'bg-yellow-500 text-white shadow'
                : 'bg-white text-yellow-900 hover:bg-yellow-100 border border-yellow-300'
            }`}
          >
            Pending ({users.filter(u => u.profile.status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('verified')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === 'verified'
                ? 'bg-green-700 text-white shadow'
                : 'bg-white text-green-900 hover:bg-green-100 border border-green-300'
            }`}
          >
            Verified ({users.filter(u => u.isVerified).length})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === 'rejected'
                ? 'bg-red-700 text-white shadow'
                : 'bg-white text-red-900 hover:bg-red-100 border border-red-300'
            }`}
          >
            Rejected ({users.filter(u => u.profile.status === 'rejected').length})
          </button>
          <button
            onClick={() => setFilter('suspended')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === 'suspended'
                ? 'bg-orange-700 text-white shadow'
                : 'bg-white text-orange-900 hover:bg-orange-100 border border-orange-300'
            }`}
          >
            Suspended ({users.filter(u => u.vendor?.status === 'suspended' || u.profile.status === 'suspended').length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white shadow rounded-2xl border border-gray-100 overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {filteredUsers.map((user) => (
            <li key={user.profile.id} className={`group transition-all duration-150 ${user.profile.status === 'pending' ? 'bg-yellow-100 border-l-4 border-yellow-500' : ''} hover:bg-blue-50/30`}> 
              <div className="px-4 py-5 sm:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex-shrink-0 h-12 w-12">
                    <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                      {user.profile.role === 'vendor' ? (
                        <Store className="h-6 w-6 text-blue-600" />
                      ) : (
                        <User className="h-6 w-6 text-blue-600" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-gray-900 truncate max-w-[180px]">{user.profile.full_name || 'Unnamed User'}</span>
                      {user.vendor && (
                        <span className="text-sm text-gray-500 truncate max-w-[140px]">{user.vendor.business_name}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-sm text-gray-500 truncate max-w-[180px]">{user.profile.email}</span>
                      <span className="text-xs text-gray-400">{formatDate(user.profile.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {user.profile.role === 'vendor' && (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${
                              user.profile.status === 'pending'
                                ? 'bg-yellow-500 text-white border-yellow-700 animate-pulse shadow'
                                : user.profile.status === 'approved'
                                ? 'bg-green-700 text-white border-green-900'
                                : user.profile.status === 'rejected'
                                ? 'bg-red-700 text-white border-red-900'
                                : user.profile.status === 'suspended'
                                ? 'bg-orange-700 text-white border-orange-900'
                                : 'bg-gray-400 text-white border-gray-600'
                            }`}>
                              {user.profile.status === 'pending' ? '⏳ Pending approval' : (user.profile.status || 'Unknown').charAt(0).toUpperCase() + (user.profile.status || 'Unknown').slice(1)}
                            </span>
                      )}
                      {user.profile.role === 'tourist' && (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${user.profile.status === 'suspended' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
                          {user.profile.status === 'suspended' ? 'Suspended' : 'Active'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="text-blue-600 hover:text-blue-900 p-2 rounded-full bg-blue-50 hover:bg-blue-100 transition"
                    title="Review Details"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                  {user.profile.status === 'pending' && user.profile.role === 'vendor' && (
                    <>
                      <button
                        onClick={() => showConfirmation('approve', {type: 'vendor', id: user.profile.id, name: user.vendor?.business_name || user.profile.full_name || 'Vendor'}, () => updateVendorStatus(user.vendor?.id || user.profile.id, 'approved'))}
                        className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors duration-200 shadow"
                        title="Approve Vendor"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </button>
                      <button
                        onClick={() => showConfirmation('reject', {type: 'vendor', id: user.profile.id, name: user.vendor?.business_name || user.profile.full_name || 'Vendor'}, () => updateVendorStatus(user.vendor?.id || user.profile.id, 'rejected'))}
                        className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors duration-200 shadow"
                        title="Reject Vendor"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </button>
                    </>
                  )}
                  {/* Suspend/Resume button - changes based on current status */}
                  {user.profile.role === 'vendor' && user.profile.status !== 'pending' && user.profile.status !== 'rejected' && (
                    <button
                      onClick={() => user.profile.status === 'suspended' ?
                        updateVendorStatus(user.profile.id, 'approved') :
                        openSuspendModal('vendor', user.profile.id, user.profile.full_name || 'Vendor')
                      }
                      className={user.profile.status === 'suspended' ? "text-green-600 hover:text-green-900 p-2 rounded-full bg-green-50 hover:bg-green-100" : "text-orange-600 hover:text-orange-900 p-2 rounded-full bg-orange-50 hover:bg-orange-100"}
                      title={user.profile.status === 'suspended' ? "Resume Vendor" : "Suspend Vendor"}
                    >
                      {user.profile.status === 'suspended' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {/* Suspend/Resume button for tourists */}
                  {user.profile.role === 'tourist' && (
                    <button
                      onClick={() => user.profile.status === 'suspended' ?
                        updateUserStatus(user.profile.id, 'active') :
                        openSuspendModal('user', user.profile.id, user.profile.full_name || 'User')
                      }
                      className={user.profile.status === 'suspended' ? "text-green-600 hover:text-green-900 p-2 rounded-full bg-green-50 hover:bg-green-100" : "text-orange-600 hover:text-orange-900 p-2 rounded-full bg-orange-50 hover:bg-orange-100"}
                      title={user.profile.status === 'suspended' ? "Resume User" : "Suspend User"}
                    >
                      {user.profile.status === 'suspended' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {/* Suspend/Resume button for admins and other roles */}
                  {user.profile.role !== 'vendor' && user.profile.role !== 'tourist' && user.profile.status !== 'pending' && (
                    <button
                      onClick={() => user.profile.status === 'suspended' ?
                        updateUserStatus(user.profile.id, 'active') :
                        openSuspendModal('user', user.profile.id, user.profile.full_name || 'User')
                      }
                      className={user.profile.status === 'suspended' ? "text-green-600 hover:text-green-900 p-2 rounded-full bg-green-50 hover:bg-green-100" : "text-orange-600 hover:text-orange-900 p-2 rounded-full bg-orange-50 hover:bg-orange-100"}
                      title={user.profile.status === 'suspended' ? "Resume User" : "Suspend User"}
                    >
                      {user.profile.status === 'suspended' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {/* Delete button */}
                  <button
                    onClick={() => showConfirmation('delete', {type: 'user', id: user.profile.id, name: user.profile.full_name || (user.profile.role === 'vendor' ? 'Vendor' : 'User')}, () => deleteUserAccount(user.profile.id, user.profile.full_name || (user.profile.role === 'vendor' ? 'Vendor' : 'User')))}
                    className="text-red-600 hover:text-red-900 p-2 rounded-full bg-red-50 hover:bg-red-100 transition"
                    title="Delete User"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No businesses found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'all' ? 'No businesses have registered yet.' : `No businesses match the "${filter}" filter.`}
          </p>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="mt-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Business Details</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Profile Information */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Profile Information</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p><span className="font-medium">Name:</span> {selectedUser.profile.full_name || 'Not provided'}</p>
                  <p><span className="font-medium">Email:</span> {selectedUser.profile.email}</p>
                  <p><span className="font-medium">Phone:</span> {selectedUser.profile.phone || 'Not provided'}</p>
                  <p><span className="font-medium">Role:</span> <span className="capitalize">{selectedUser.profile.role}</span></p>
                  <p><span className="font-medium">Status:</span> <span className={`capitalize ${selectedUser.profile.status === 'suspended' ? 'text-orange-600 font-semibold' : 'text-green-600'}`}>{selectedUser.profile.status || 'active'}</span></p>
                  <p><span className="font-medium">Joined:</span> {formatDate(selectedUser.profile.created_at)}</p>
                  {selectedUser.profile.status === 'suspended' && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-orange-800 text-sm">
                        <strong>Suspended:</strong> {selectedUser.profile.suspended_at ? formatDate(selectedUser.profile.suspended_at) : 'Unknown'}
                      </p>
                      {selectedUser.profile.suspension_period && (
                        <p className="text-orange-700 text-sm">
                          <strong>Period:</strong> {selectedUser.profile.suspension_period === 'permanent' ? 'Permanent' : selectedUser.profile.suspension_period}
                        </p>
                      )}
                      {selectedUser.profile.suspension_end_at && (
                        <p className="text-orange-700 text-sm">
                          <strong>Ends:</strong> {formatDate(selectedUser.profile.suspension_end_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t">
                <h4 className="font-medium text-gray-900 mb-3">Actions</h4>
                <div className="space-y-3">
                  {/* Pending Vendor Actions */}
                  {selectedUser.profile.status === 'pending' && selectedUser.profile.role === 'vendor' && (
                    <div className="flex space-x-3">
                      <button
                        onClick={() => showConfirmation('approve', {type: 'vendor', id: selectedUser.profile.id, name: selectedUser.profile.full_name || 'Vendor'}, () => updateVendorStatus(selectedUser.profile.id, 'approved'))}
                        className="btn-primary flex items-center"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve Vendor
                      </button>
                      <button
                        onClick={() => showConfirmation('reject', {type: 'vendor', id: selectedUser.profile.id, name: selectedUser.profile.full_name || 'Vendor'}, () => updateVendorStatus(selectedUser.profile.id, 'rejected'))}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject Vendor
                      </button>
                    </div>
                  )}

                  {/* Suspend/Resume Actions for Active/Suspended Users */}
                  {(selectedUser.profile.status === 'active' || selectedUser.profile.status === 'approved' || selectedUser.profile.status === 'suspended') && (
                    <div className="flex space-x-3">
                      {selectedUser.profile.status === 'suspended' ? (
                        <button
                          onClick={() => showConfirmation('approve', {type: 'user', id: selectedUser.profile.id, name: selectedUser.profile.full_name || 'User'}, () => updateUserStatus(selectedUser.profile.id, 'active'))}
                          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Resume Account
                        </button>
                      ) : (
                        <button
                          onClick={() => openSuspendModal('user', selectedUser.profile.id, selectedUser.profile.full_name || 'User')}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Suspend Account
                        </button>
                      )}
                    </div>
                  )}

                  {/* Delete Action - Available for all users */}
                  <div className="flex space-x-3">
                    <button
                      onClick={() => showConfirmation('delete', {type: 'user', id: selectedUser.profile.id, name: selectedUser.profile.full_name || 'User'}, () => deleteUserAccount(selectedUser.profile.id, selectedUser.profile.full_name || 'User'))}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete User Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspension Confirmation Modal */}
      {showSuspendModal && suspendTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-xl rounded-xl bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Confirm Suspension</h3>
                <button
                  onClick={() => setShowSuspendModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <Ban className="h-5 w-5 text-red-600 mr-2" />
                    <span className="text-gray-900 font-medium">Suspension Warning</span>
                  </div>
                  <p className="text-gray-700 text-sm mt-1">
                    You are about to suspend <strong>{suspendTarget.name}</strong>.
                    {suspendTarget.type === 'vendor' ? ' This vendor will not be able to access their account or services.' : ' This user will not be able to access their account.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Suspension Period
                  </label>
                  <select
                    value={suspendPeriod}
                    onChange={(e) => setSuspendPeriod(e.target.value as typeof suspendPeriod)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="1day">1 Day</option>
                    <option value="1week">1 Week</option>
                    <option value="1month">1 Month</option>
                    <option value="permanent">Permanent</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {suspendPeriod === 'permanent' ? 'Account will remain suspended until manually unsuspended by an admin.' : `Account will be automatically unsuspended after the selected period.`}
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowSuspendModal(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSuspendConfirm}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Confirm Suspension
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generic Confirmation Modal */}
      {showConfirmModal && confirmAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-xl rounded-xl bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {confirmAction.type === 'approve' ?
                    (users.find(u => u.profile.id === confirmAction.target.id)?.profile.status === 'suspended' ?
                      (confirmAction.target.type === 'vendor' ? 'Confirm Reapproval' : 'Confirm Reactivation') :
                      'Confirm Approval'
                    ) :
                   confirmAction.type === 'reject' ? 'Confirm Rejection' :
                   'Confirm Deletion'}
                </h3>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    {confirmAction.type === 'approve' ? (
                      <Check className="h-5 w-5 text-green-600 mr-2" />
                    ) : confirmAction.type === 'reject' ? (
                      <X className="h-5 w-5 text-red-600 mr-2" />
                    ) : (
                      <Trash2 className="h-5 w-5 text-red-600 mr-2" />
                    )}
                    <span className="text-gray-900 font-medium">
                      {confirmAction.type === 'approve' ?
                        (users.find(u => u.profile.id === confirmAction.target.id)?.profile.status === 'suspended' ?
                          (confirmAction.target.type === 'vendor' ? 'Reapproval Confirmation' : 'Reactivation Confirmation') :
                          'Approval Confirmation'
                        ) :
                       confirmAction.type === 'reject' ? 'Rejection Confirmation' :
                       'Deletion Confirmation'}
                    </span>
                  </div>
                  <p className="text-gray-700 text-sm mt-1">
                    {confirmAction.type === 'approve' ?
                      (confirmAction.target.type === 'vendor' ?
                        `Are you sure you want to ${users.find(u => u.profile.id === confirmAction.target.id)?.profile.status === 'suspended' ? 'reapprove' : 'approve'} ${confirmAction.target.name}? ${users.find(u => u.profile.id === confirmAction.target.id)?.profile.status === 'suspended' ? 'This will restore their vendor privileges.' : 'This will grant them full vendor privileges.'}` :
                        `Are you sure you want to reactivate ${confirmAction.target.name}? This will restore their account access.`
                      ) :
                     confirmAction.type === 'reject' ?
                      `Are you sure you want to reject ${confirmAction.target.name}? This action cannot be undone.` :
                      `Are you sure you want to delete ${confirmAction.target.name}? This action cannot be undone.`
                    }
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAction}
                    className={`flex-1 font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center ${
                      confirmAction.type === 'approve'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {confirmAction.type === 'approve' ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        {users.find(u => u.profile.id === confirmAction.target.id)?.profile.status === 'suspended' ?
                          (confirmAction.target.type === 'vendor' ? 'Confirm Reapproval' : 'Confirm Reactivation') :
                          'Confirm Approval'
                        }
                      </>
                    ) : confirmAction.type === 'reject' ? (
                      <>
                        <X className="h-4 w-4 mr-2" />
                        Confirm Rejection
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Confirm Deletion
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
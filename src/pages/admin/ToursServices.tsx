import { CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useServices, useServiceDeleteRequests } from '../../hooks/hook';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EditServiceModal } from '../../components/EditServiceModal';
import SearchBar from '../../components/SearchBar';
import { formatCurrencyWithConversion } from '../../lib/utils';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useState, useEffect } from 'react';
import { getAllVendors, createTicketType, updateTicketType, deleteTicketType } from '../../lib/database';
import type { Service } from '../../types';

export function ToursServices() {
  const { selectedCurrency, selectedLanguage } = usePreferences()
  const { services, loading, error, updateServiceStatus, updateService, deleteService } = useServices();
  const { deleteRequests, error: deleteRequestsError, updateDeleteRequestStatus } = useServiceDeleteRequests();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [vendors, setVendors] = useState<any[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  console.log('Admin deleteRequests:', deleteRequests);
  console.log('Admin deleteRequests length:', deleteRequests?.length || 0);
  console.log('Admin deleteRequests error:', deleteRequestsError);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const vendorData = await getAllVendors();
        setVendors(vendorData);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      }
    };
    fetchVendors();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading services: {error}</p>
        </div>
        {/* Still show the services management interface even if delete requests fail */}
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Tours Management</h3>
          </div>
          <div className="p-5">
            <p className="text-sm text-yellow-600">Services loaded, but delete requests are temporarily unavailable.</p>
          </div>
        </div>
      </div>
    );
  }

  if (deleteRequestsError) {
    console.warn('Delete requests error (non-blocking):', deleteRequestsError);
    // Show a warning but don't block the entire interface
  }

  // Filter services to only show Tours
  const toursServices = services.filter(service =>
    service.service_categories?.name?.toLowerCase() === 'tours'
  );

  const pendingServices = toursServices.filter(service => service.status === 'pending');
  const approvedServices = toursServices.filter(service => service.status === 'approved');
  const rejectedServices = toursServices.filter(service => service.status === 'rejected');

  // Filter services based on selected vendor and search query
  const vendorFilteredServices = selectedVendor === 'all'
    ? toursServices
    : toursServices.filter(service => service.vendor_id === selectedVendor);

  const filteredServices = searchQuery.trim() === ''
    ? vendorFilteredServices
    : vendorFilteredServices.filter(service =>
        service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.service_categories?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.vendors?.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.vendors?.business_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const vendorFilteredPendingServices = selectedVendor === 'all'
    ? pendingServices
    : pendingServices.filter(service => service.vendor_id === selectedVendor);

  const filteredPendingServices = searchQuery.trim() === ''
    ? vendorFilteredPendingServices
    : vendorFilteredPendingServices.filter(service =>
        service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.service_categories?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.vendors?.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.vendors?.business_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const approveService = async (serviceId: string) => {
    setUpdatingStatus(serviceId);
    try {
      await updateServiceStatus(serviceId, 'approved');
    } catch (err) {
      console.error('Failed to approve service:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const rejectService = async (serviceId: string) => {
    setUpdatingStatus(serviceId);
    try {
      await updateServiceStatus(serviceId, 'rejected');
    } catch (err) {
      console.error('Failed to reject service:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const approveDeleteRequest = async (requestId: string) => {
    setUpdatingStatus(requestId);
    try {
      // Find the request to get the service ID
      const request = deleteRequests.find(r => r.id === requestId);
      if (!request) {
        throw new Error('Delete request not found');
      }

      // Approve the delete request
      await updateDeleteRequestStatus(requestId, 'approved');
      
      // Delete the actual service
      await deleteService(request.service_id);
      
      console.log('Successfully approved delete request and deleted service:', request.service_id);
    } catch (err) {
      console.error('Failed to approve delete request:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const rejectDeleteRequest = async (requestId: string) => {
    setUpdatingStatus(requestId);
    try {
      const reason = prompt('Reason for rejection:');
      if (reason) {
        await updateDeleteRequestStatus(requestId, 'rejected', reason);
      }
    } catch (err) {
      console.error('Failed to reject delete request:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditingService(null);
    setIsEditModalOpen(false);
    setSaveMessage(null);
  };

  const handleDeleteService = async (serviceId: string, serviceTitle: string) => {
    console.log('handleDeleteService called with:', { serviceId, serviceTitle });

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the service "${serviceTitle}"? This action cannot be undone.`
    );

    if (!confirmDelete) {
      console.log('Delete cancelled by user');
      return;
    }

    console.log('Starting service deletion...');
    setUpdatingStatus(serviceId);
    try {
      console.log('Calling deleteService function...');
      await deleteService(serviceId);
      console.log('deleteService completed successfully');
      // The service will be automatically removed from the list by the useServices hook
    } catch (err) {
      console.error('Failed to delete service:', err);
      alert('Failed to delete service. Please try again.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSaveService = async (updatedServiceData: Partial<Service>) => {
    if (!editingService) return;

    setUpdatingStatus(editingService.id);
    setSaveMessage(null); // Clear any previous messages

    try {
      try {
        const original = (editingService as any).ticket_types || [];
        const updated = (updatedServiceData as any).ticket_types;
        if (Array.isArray(updated)) {
          const removed = original.filter((o: any) => o.id && !updated.some((u: any) => u.id === o.id));
          for (const r of removed) {
            if (r.id) await deleteTicketType(r.id);
          }
          for (const t of updated) {
            const payload: any = {
              title: t.title,
              description: t.description,
              price: t.price,
              quantity: t.quantity,
              metadata: t.metadata,
              sale_start: t.sale_start,
              sale_end: t.sale_end
            };
            if (t.id) await updateTicketType(t.id, payload);
            else await createTicketType(editingService.id, payload);
          }
          delete (updatedServiceData as any).ticket_types;
        }
      } catch (ticketErr) {
        console.error('Failed to persist ticket types:', ticketErr);
      }

      await updateService(editingService.id, updatedServiceData);

      // Show success message
      setSaveMessage({ type: 'success', text: 'Service updated successfully!' });

    } catch (err) {
      console.error('Failed to update service:', err);
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update service. Please try again.'
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const pendingDeleteRequests = deleteRequests.filter(request => request.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tours Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and review all tour services</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Pending: {selectedVendor === 'all' ? pendingServices.length : filteredPendingServices.length}</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">Approved: {selectedVendor === 'all' ? approvedServices.length : filteredServices.filter(s => s.status === 'approved').length}</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700">Rejected: {selectedVendor === 'all' ? rejectedServices.length : filteredServices.filter(s => s.status === 'rejected').length}</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700">Delete: {deleteRequestsError ? '—' : pendingDeleteRequests.length}</span>
        </div>
      </div>

      {/* Search & Vendor Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchBar
              placeholder="Search tours by title, description, or vendor..."
              onSearch={setSearchQuery}
              initialValue={searchQuery}
              className="max-w-md"
            />
          </div>
          <select
            id="vendor-filter"
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.business_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Services Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">All Tours</h3>
          <p className="text-xs text-gray-500 mt-0.5">{filteredServices.length} tours found</p>
        </div>
        <div className="p-5">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tour
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Availability
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredServices.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{service.title}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {service.description}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {service.vendors?.business_name || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {service.location}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={service.status} variant="small" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge
                        status={service.status === 'approved' ? 'available' : 'unavailable'}
                        variant="small"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEditService(service)}
                        className="text-blue-600 hover:text-blue-900 mr-2"
                        title="Edit tour"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteService(service.id, service.title)}
                        disabled={updatingStatus === service.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 ml-2"
                        title="Delete tour"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {filteredPendingServices.length > 0 && (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Pending Approval</h3>
            <p className="text-xs text-gray-500 mt-0.5">{filteredPendingServices.length} tours awaiting review</p>
          </div>
          <div className="p-5">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tour</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPendingServices.map((service) => (
                    <tr key={service.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{service.title}</div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {service.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {service.vendors?.business_name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {service.location}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveService(service.id)}
                          disabled={updatingStatus === service.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          {updatingStatus === service.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => rejectService(service.id)}
                          disabled={updatingStatus === service.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                          {updatingStatus === service.id ? 'Rejecting...' : 'Reject'}
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Requests Section */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Delete Requests</h3>
          <p className="text-xs text-gray-500 mt-0.5">{deleteRequestsError ? 'Temporarily unavailable' : `${pendingDeleteRequests.length} pending requests`}</p>
        </div>
        <div className="p-5">
          {deleteRequestsError ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                Delete requests are temporarily unavailable due to a permissions issue.
                Please contact support or run the database migration to fix RLS policies.
              </p>
              <p className="text-yellow-700 text-sm mt-2">
                Error: {deleteRequestsError}
              </p>
            </div>
          ) : pendingDeleteRequests.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending delete requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tour</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comments</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingDeleteRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{request.service?.title}</div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {request.service?.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {request.vendor?.business_name || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge
                          status={request.service?.status === 'approved' ? 'available' : 'unavailable'}
                          variant="small"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {request.reason}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {request.admin_notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(request.requested_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => approveDeleteRequest(request.id)}
                          disabled={updatingStatus === request.id}
                          className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          title="Approve deletion"
                        >
                          <CheckIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => rejectDeleteRequest(request.id)}
                          disabled={updatingStatus === request.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          title="Reject deletion"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EditServiceModal
        service={editingService}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveService}
        isLoading={updatingStatus === editingService?.id}
        saveMessage={saveMessage}
      />
    </div>
  );
}
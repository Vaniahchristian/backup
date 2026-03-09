import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Service } from '../types';

interface EditServiceModalProps {
  service: Service | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedServiceData: Partial<Service>) => Promise<void>;
  isLoading?: boolean;
  saveMessage?: { type: 'success' | 'error'; text: string } | null;
}

export function EditServiceModal({ service, isOpen, onClose, onSave, isLoading, saveMessage }: EditServiceModalProps) {
  const [formData, setFormData] = useState<Partial<Service>>({});
  const [arrayInputs, setArrayInputs] = useState({
    pickup_locations: '',
    dropoff_locations: '',
  });
  // track whether ticket sale dates were manually edited per-ticket
  const [ticketManualFlags, setTicketManualFlags] = useState<Array<{saleStartManual?: boolean; saleEndManual?: boolean}>>([]);

  const isTransportService = service?.category_id === 'cat_transport';

  useEffect(() => {
    if (service) {
      // initialize manual flags for tickets
      const initialTickets = (service as any).ticket_types || [];
      setTicketManualFlags(initialTickets.map((tt: any) => ({
        saleStartManual: !!(tt && tt.sale_start),
        saleEndManual: !!(tt && tt.sale_end),
      })));

      setFormData(({
        title: service.title,
        description: service.description,
        price: service.price,
        currency: service.currency,
        location: service.location,
        duration_hours: service.duration_hours,
        max_capacity: service.max_capacity,
        amenities: service.amenities || [],
        // Common event/activity fields
        event_type: (service as any).event_type || '',
        event_date: (service as any).event_date || undefined,
        event_datetime: (service as any).event_datetime || undefined,
        event_location: (service as any).event_location || (service as any).location || '',
        event_lat: (service as any).event_lat || (service as any).event_lat || undefined,
        event_lon: (service as any).event_lon || (service as any).event_lon || undefined,
        max_participants: (service as any).max_participants || undefined,
        minimum_age: (service as any).minimum_age || undefined,
        registration_deadline: (service as any).registration_deadline || undefined,
        internal_ticketing: (service as any).internal_ticketing || ((service as any).ticket_types?.some((tt: any) => !!(tt.sale_start || tt.sale_end || tt.quantity)) ?? false),
        ticket_types: (service as any).ticket_types || [],
        scan_enabled: (service as any).scan_enabled || false,
        status: service.status || 'draft',
        // Transport-specific fields
        vehicle_type: service.vehicle_type || '',
        vehicle_capacity: service.vehicle_capacity || undefined,
        pickup_locations: service.pickup_locations || [],
        dropoff_locations: service.dropoff_locations || [],
        route_description: service.route_description || '',
        driver_included: service.driver_included || false,
        air_conditioning: service.air_conditioning || false,
        gps_tracking: service.gps_tracking || false,
        fuel_included: service.fuel_included || false,
        tolls_included: service.tolls_included || false,
        insurance_included: service.insurance_included || false,
        license_required: service.license_required || '',
        booking_notice_hours: service.booking_notice_hours || undefined,
        wifi_available: service.wifi_available || false,
        usb_charging: service.usb_charging || false,
        child_seat: service.child_seat || false,
        roof_rack: service.roof_rack || false,
        towing_capacity: service.towing_capacity || false,
        four_wheel_drive: service.four_wheel_drive || false,
        automatic_transmission: service.automatic_transmission || false,
        transport_terms: service.transport_terms || '',
      }) as unknown as Partial<Service>);
    }
  }, [service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSave(formData);
    } catch (error) {
      // Error handling is done in the parent component
    }
  };

  const handleInputChange = (field: keyof Service, value: any) => {
    // If event_datetime changes, shift ticket sale datetimes for tickets that
    // were not manually edited.
    if (field === 'event_datetime') {
      const prevEvent = formData.event_datetime;
      const newEvent = value;
      setFormData(prev => {
        let next = { ...prev, [field]: value } as Partial<Service>;
        try {
          if (prevEvent && newEvent) {
            const delta = new Date(newEvent).getTime() - new Date(prevEvent).getTime();
            const tickets = (prev.ticket_types || []) as any[];
            const shifted = tickets.map((tt, idx) => {
              const flags = ticketManualFlags[idx] || {};
              const out = { ...tt };
              if (out.sale_start) {
                if (!flags.saleStartManual) {
                  const t = new Date(out.sale_start).getTime();
                  out.sale_start = new Date(t + delta).toISOString();
                }
              } else {
                if (!flags.saleStartManual) {
                  out.sale_start = new Date(newEvent).toISOString();
                }
              }
              if (out.sale_end) {
                if (!flags.saleEndManual) {
                  const t2 = new Date(out.sale_end).getTime();
                  out.sale_end = new Date(t2 + delta).toISOString();
                }
              } else {
                if (!flags.saleEndManual) {
                  out.sale_end = new Date(newEvent).toISOString();
                }
              }
              return out;
            });
            next.ticket_types = shifted;
          } else if (!prevEvent && newEvent) {
            // No previous event — initialize missing sale dates to event
            const tickets = (prev.ticket_types || []) as any[];
            next.ticket_types = tickets.map((tt) => ({
              ...tt,
              sale_start: tt.sale_start || new Date(newEvent).toISOString(),
              sale_end: tt.sale_end || new Date(newEvent).toISOString(),
            }));
          }
        } catch (err) {
          // ignore date parsing errors
        }
        return next;
      });
      return;
    }

    // When internal ticketing is enabled, ensure tickets without sale dates get event defaults
    if (field === 'internal_ticketing' && value === true) {
      setFormData(prev => {
        const eventDt = prev.event_datetime || prev.event_date;
        if (!eventDt) return { ...prev, internal_ticketing: true };
        const tickets = (prev.ticket_types || []) as any[];
        const nextTickets = tickets.map((tt) => ({
          ...tt,
          sale_start: tt.sale_start || eventDt,
          sale_end: tt.sale_end || eventDt,
        }));
        return { ...prev, internal_ticketing: true, ticket_types: nextTickets };
      });
      return;
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAmenitiesChange = (amenities: string) => {
    const amenitiesArray = amenities.split(',').map(item => item.trim()).filter(item => item);
    setFormData(prev => ({
      ...prev,
      amenities: amenitiesArray
    }));
  };

  const addToArray = (field: 'pickup_locations' | 'dropoff_locations', value: string) => {
    if (!value.trim()) return;
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), value.trim()]
    }));
    setArrayInputs(prev => ({ ...prev, [field]: '' }));
  };

  const removeFromArray = (field: 'pickup_locations' | 'dropoff_locations', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, i) => i !== index)
    }));
  };

  // Ticket type helpers for structured editor
  const updateTicketType = (index: number, changes: Partial<any>) => {
    setFormData(prev => {
      const list = (prev.ticket_types || []) as any[];
      const next = list.map((t, i) => i === index ? { ...t, ...changes } : t);
      return { ...prev, ticket_types: next };
    });
  };

  // when admin manually edits ticket sale fields, mark them as manual
  const markTicketManual = (index: number, which: 'saleStart' | 'saleEnd') => {
    setTicketManualFlags(prev => {
      const copy = [...(prev || [])];
      copy[index] = { ...(copy[index] || {}), ...(which === 'saleStart' ? { saleStartManual: true } : { saleEndManual: true }) };
      return copy;
    });
  };

  const addTicketType = () => {
    setFormData(prev => {
      const eventDt = prev.event_datetime || prev.event_date;
      const newTicket: any = { title: '', price: 0, quantity: undefined };
      if (eventDt) {
        newTicket.sale_start = eventDt;
        newTicket.sale_end = eventDt;
      }
      return {
        ...prev,
        ticket_types: [ ...(prev.ticket_types || []), newTicket ]
      };
    });
    setTicketManualFlags(prev => ([ ...(prev || []), { saleStartManual: false, saleEndManual: false } ]));
  };

  const removeTicketType = (index: number) => {
    setFormData(prev => ({ ...prev, ticket_types: (prev.ticket_types || []).filter((_, i) => i !== index) }));
    setTicketManualFlags(prev => (prev || []).filter((_, i) => i !== index));
  };

  if (!isOpen || !service) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={onClose}></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Edit Service</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div className={`mb-4 p-3 rounded-md ${
                saveMessage.type === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-800' 
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <div className="flex">
                  <div className="flex-shrink-0">
                    {saveMessage.type === 'success' ? (
                      <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium">{saveMessage.text}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div>
                <label htmlFor="max_participants" className="block text-sm font-medium text-gray-700">Maximum Participants</label>
                <input
                  type="number"
                  id="max_participants"
                  value={formData.max_participants || ''}
                  onChange={(e) => handleInputChange('max_participants' as keyof Service, e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g., 50"
                  className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="minimum_age" className="block text-sm font-medium text-gray-700">Minimum Age</label>
                <input
                  type="number"
                  id="minimum_age"
                  value={formData.minimum_age || ''}
                  onChange={(e) => handleInputChange('minimum_age' as keyof Service, e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g., 18"
                  className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="registration_deadline" className="block text-sm font-medium text-gray-700">Registration Deadline</label>
                <input
                  type="datetime-local"
                  id="registration_deadline"
                  value={formData.registration_deadline ? new Date(formData.registration_deadline).toISOString().slice(0,16) : ''}
                  onChange={(e) => handleInputChange('registration_deadline' as keyof Service, e.target.value)}
                  className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={formData.title || ''}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                    Price
                  </label>
                  <input
                    type="number"
                    id="price"
                    value={formData.price || ''}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value))}
                    min="0"
                    step="0.01"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
                    Currency
                  </label>
                  <select
                    id="currency"
                    value={formData.currency || 'USD'}
                    onChange={(e) => handleInputChange('currency', e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="UGX">UGX</option>
                  </select>
                </div>
              </div>

              {/* Event / Activity-specific fields */}
              {(service?.category_id === 'cat_activities' || (formData.ticket_types && formData.ticket_types.length > 0)) && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Event Details</h4>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label htmlFor="event_type" className="block text-sm font-medium text-gray-700">Event Type</label>
                          <select id="event_type" value={(formData.event_type as any) || ''} onChange={(e) => handleInputChange('event_type' as keyof Service, e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                            <option value="">Select event type</option>
                            <option value="adventure_activity">Adventure Activity</option>
                            <option value="cultural_experience">Cultural Experience</option>
                            <option value="nature_tour">Nature Tour</option>
                            <option value="sports_event">Sports Event</option>
                            <option value="festival">Festival</option>
                            <option value="workshop">Workshop</option>
                            <option value="concert">Concert/Performance</option>
                            <option value="exhibition">Exhibition</option>
                            <option value="other">Other Event</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="event_datetime" className="block text-sm font-medium text-gray-700">Event Date & Time</label>
                          <input
                            type="datetime-local"
                            id="event_datetime"
                            value={formData.event_datetime ? new Date(formData.event_datetime).toISOString().slice(0,16) : ''}
                            onChange={(e) => handleInputChange('event_datetime' as keyof Service, e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </div>
                  </div>
                      <div className="mb-4">
                        <label htmlFor="event_location" className="block text-sm font-medium text-gray-700">Event Location</label>
                        <input
                          id="event_location"
                          type="text"
                          value={(formData.event_location as any) || ''}
                          onChange={(e) => handleInputChange('event_location' as keyof Service, e.target.value)}
                          placeholder="Venue or meeting point"
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!(formData.internal_ticketing)}
                            onChange={(e) => handleInputChange('internal_ticketing' as keyof Service, e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">Enable internal ticketing</span>
                        </label>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Ticket Types</label>
                        <div className="mt-2 space-y-3">
                          {((formData.ticket_types || []) as any[]).map((tt, idx) => (
                            <div key={idx} className="p-3 border border-slate-200 rounded-lg bg-white">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                                  <input className="w-full border border-slate-200 rounded px-3 py-2" value={tt.title || tt.name || ''} onChange={(e) => updateTicketType(idx, { title: e.target.value })} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Price (UGX)</label>
                                  <input className="w-full border border-slate-200 rounded px-3 py-2" type="number" value={tt.price ?? ''} onChange={(e) => updateTicketType(idx, { price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                                  <input className="w-full border border-slate-200 rounded px-3 py-2" type="number" value={tt.quantity ?? ''} onChange={(e) => updateTicketType(idx, { quantity: e.target.value === '' ? undefined : Number(e.target.value) })} />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Sale starts</label>
                                  <input type="datetime-local" className="w-full border border-slate-200 rounded px-3 py-2" value={tt.sale_start ? new Date(tt.sale_start).toISOString().slice(0,16) : ''} onChange={(e) => { updateTicketType(idx, { sale_start: e.target.value || undefined }); markTicketManual(idx, 'saleStart'); }} />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Sale ends</label>
                                  <input type="datetime-local" className="w-full border border-slate-200 rounded px-3 py-2" value={tt.sale_end ? new Date(tt.sale_end).toISOString().slice(0,16) : ''} onChange={(e) => { updateTicketType(idx, { sale_end: e.target.value || undefined }); markTicketManual(idx, 'saleEnd'); }} />
                                </div>
                              </div>

                              <div className="flex justify-between items-center">
                                <div className="text-xs text-slate-500">{tt.description || ''}</div>
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => removeTicketType(idx)} className="px-3 py-1 text-sm bg-red-50 text-red-700 rounded-lg">Remove</button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <div>
                            <button type="button" onClick={addTicketType} className="px-3 py-2 bg-blue-600 text-white rounded-md">Add Ticket Type</button>
                          </div>
                        </div>
                      </div>

                      <div className="mb-4 flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={!!formData.scan_enabled} onChange={(e) => handleInputChange('scan_enabled' as keyof Service, e.target.checked)} />
                          <span className="text-sm text-gray-700">Scan link enabled</span>
                        </label>
                        <div className="ml-auto">
                          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                          <select id="status" value={(formData.status as any) || 'draft'} onChange={(e) => handleInputChange('status' as keyof Service, e.target.value)} className="mt-1 border-gray-300 rounded-md">
                            <option value="draft">Draft</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="inactive">Inactive</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                </div>
              )}

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                  Location
                </label>
                <input
                  type="text"
                  id="location"
                  value={formData.location || ''}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="duration_hours" className="block text-sm font-medium text-gray-700">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    id="duration_hours"
                    value={formData.duration_hours || ''}
                    onChange={(e) => handleInputChange('duration_hours', parseInt(e.target.value))}
                    min="0"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="max_capacity" className="block text-sm font-medium text-gray-700">
                    Max Capacity
                  </label>
                  <input
                    type="number"
                    id="max_capacity"
                    value={formData.max_capacity || ''}
                    onChange={(e) => handleInputChange('max_capacity', parseInt(e.target.value))}
                    min="0"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="amenities" className="block text-sm font-medium text-gray-700">
                  Amenities (comma-separated)
                </label>
                <input
                  type="text"
                  id="amenities"
                  value={formData.amenities?.join(', ') || ''}
                  onChange={(e) => handleAmenitiesChange(e.target.value)}
                  placeholder="WiFi, Parking, Breakfast..."
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Transport-specific fields */}
              {isTransportService && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Transport Service Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="vehicle_type" className="block text-sm font-medium text-gray-700">
                        Vehicle Type
                      </label>
                      <select
                        id="vehicle_type"
                        value={formData.vehicle_type || ''}
                        onChange={(e) => handleInputChange('vehicle_type', e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select vehicle type</option>
                        <option value="sedan">Sedan Car</option>
                        <option value="suv">SUV</option>
                        <option value="van">Van/Minivan</option>
                        <option value="bus">Bus</option>
                        <option value="motorcycle">Motorcycle</option>
                        <option value="bicycle">Bicycle</option>
                        <option value="boat">Boat</option>
                        <option value="helicopter">Helicopter</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="vehicle_capacity" className="block text-sm font-medium text-gray-700">
                        Vehicle Capacity
                      </label>
                      <input
                        type="number"
                        id="vehicle_capacity"
                        value={formData.vehicle_capacity || ''}
                        onChange={(e) => handleInputChange('vehicle_capacity', parseInt(e.target.value) || undefined)}
                        min="1"
                        placeholder="Number of passengers"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="license_required" className="block text-sm font-medium text-gray-700">
                        License Requirements
                      </label>
                      <select
                        id="license_required"
                        value={formData.license_required || ''}
                        onChange={(e) => handleInputChange('license_required', e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">Select license type</option>
                        <option value="none">No license required</option>
                        <option value="car">Car license</option>
                        <option value="motorcycle">Motorcycle license</option>
                        <option value="boat">Boat license</option>
                        <option value="commercial">Commercial license</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="booking_notice_hours" className="block text-sm font-medium text-gray-700">
                        Booking Notice (hours)
                      </label>
                      <input
                        type="number"
                        id="booking_notice_hours"
                        value={formData.booking_notice_hours || ''}
                        onChange={(e) => handleInputChange('booking_notice_hours', parseInt(e.target.value) || undefined)}
                        min="0"
                        placeholder="e.g., 24"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vehicle Features
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.air_conditioning || false}
                          onChange={(e) => handleInputChange('air_conditioning', e.target.checked)}
                          className="mr-2"
                        />
                        Air Conditioning
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.gps_tracking || false}
                          onChange={(e) => handleInputChange('gps_tracking', e.target.checked)}
                          className="mr-2"
                        />
                        GPS Tracking
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.wifi_available || false}
                          onChange={(e) => handleInputChange('wifi_available', e.target.checked)}
                          className="mr-2"
                        />
                        WiFi Available
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.usb_charging || false}
                          onChange={(e) => handleInputChange('usb_charging', e.target.checked)}
                          className="mr-2"
                        />
                        USB Charging
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.child_seat || false}
                          onChange={(e) => handleInputChange('child_seat', e.target.checked)}
                          className="mr-2"
                        />
                        Child Seat Available
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.roof_rack || false}
                          onChange={(e) => handleInputChange('roof_rack', e.target.checked)}
                          className="mr-2"
                        />
                        Roof Rack
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.towing_capacity || false}
                          onChange={(e) => handleInputChange('towing_capacity', e.target.checked)}
                          className="mr-2"
                        />
                        Towing Capacity
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.four_wheel_drive || false}
                          onChange={(e) => handleInputChange('four_wheel_drive', e.target.checked)}
                          className="mr-2"
                        />
                        4WD
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.automatic_transmission || false}
                          onChange={(e) => handleInputChange('automatic_transmission', e.target.checked)}
                          className="mr-2"
                        />
                        Automatic Transmission
                      </label>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="pickup_locations" className="block text-sm font-medium text-gray-700">
                      Pickup Locations
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={arrayInputs.pickup_locations}
                        onChange={(e) => setArrayInputs(prev => ({ ...prev, pickup_locations: e.target.value }))}
                        placeholder="e.g., Entebbe Airport, Kampala City Center"
                        className="flex-1 mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('pickup_locations', arrayInputs.pickup_locations))}
                      />
                      <button
                        type="button"
                        onClick={() => addToArray('pickup_locations', arrayInputs.pickup_locations)}
                        className="px-3 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800"
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(formData.pickup_locations || []).map((location, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                          {location}
                          <button
                            type="button"
                            onClick={() => removeFromArray('pickup_locations', idx)}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="dropoff_locations" className="block text-sm font-medium text-gray-700">
                      Drop-off Locations
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={arrayInputs.dropoff_locations}
                        onChange={(e) => setArrayInputs(prev => ({ ...prev, dropoff_locations: e.target.value }))}
                        placeholder="e.g., Queen Elizabeth National Park, Bwindi Forest"
                        className="flex-1 mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('dropoff_locations', arrayInputs.dropoff_locations))}
                      />
                      <button
                        type="button"
                        onClick={() => addToArray('dropoff_locations', arrayInputs.dropoff_locations)}
                        className="px-3 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800"
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(formData.dropoff_locations || []).map((location, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                          {location}
                          <button
                            type="button"
                            onClick={() => removeFromArray('dropoff_locations', idx)}
                            className="ml-1 text-green-600 hover:text-green-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="route_description" className="block text-sm font-medium text-gray-700">
                      Route Description
                    </label>
                    <textarea
                      id="route_description"
                      value={formData.route_description || ''}
                      onChange={(e) => handleInputChange('route_description', e.target.value)}
                      rows={3}
                      placeholder="Describe the route, stops, and any notable points along the way"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="fuel_included" className="block text-sm font-medium text-gray-700">
                        Fuel Included
                      </label>
                      <select
                        id="fuel_included"
                        value={formData.fuel_included ? 'yes' : 'no'}
                        onChange={(e) => handleInputChange('fuel_included', e.target.value === 'yes')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="no">No - Client pays for fuel</option>
                        <option value="yes">Yes - Fuel included in price</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="tolls_included" className="block text-sm font-medium text-gray-700">
                        Tolls Included
                      </label>
                      <select
                        id="tolls_included"
                        value={formData.tolls_included ? 'yes' : 'no'}
                        onChange={(e) => handleInputChange('tolls_included', e.target.value === 'yes')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="no">No - Client pays tolls</option>
                        <option value="yes">Yes - Tolls included in price</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="insurance_included" className="block text-sm font-medium text-gray-700">
                        Insurance Included
                      </label>
                      <select
                        id="insurance_included"
                        value={formData.insurance_included ? 'yes' : 'no'}
                        onChange={(e) => handleInputChange('insurance_included', e.target.value === 'yes')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="no">No - Client provides insurance</option>
                        <option value="yes">Yes - Insurance included</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="driver_included" className="block text-sm font-medium text-gray-700">
                        Driver Included
                      </label>
                      <select
                        id="driver_included"
                        value={formData.driver_included ? 'yes' : 'no'}
                        onChange={(e) => handleInputChange('driver_included', e.target.value === 'yes')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="no">Self-drive available</option>
                        <option value="yes">Driver included</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="transport_terms" className="block text-sm font-medium text-gray-700">
                      Additional Terms & Conditions
                    </label>
                    <textarea
                      id="transport_terms"
                      value={formData.transport_terms || ''}
                      onChange={(e) => handleInputChange('transport_terms', e.target.value)}
                      rows={3}
                      placeholder="Any additional terms, restrictions, or requirements for transport services"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import type { Service, Booking, Transaction, Flight } from '../types';
import type { ServiceCategory, ServiceDeleteRequest } from '../lib/database';
import { getServices, createService, updateService, deleteService, getFlights, createFlight, updateFlight, deleteFlight, updateFlightStatus as updateFlightStatusDB, getServiceCategories, createServiceDeleteRequest, getServiceDeleteRequests, updateServiceDeleteRequestStatus, deleteServiceDeleteRequest, getAllBookings, getAllVendors, getAllTransactions, getAllTransactionsForAdmin, updateVendorStatus as updateVendorStatusDB, updateBooking } from '../lib/database';
import { supabase } from '../lib/supabaseClient';

// Placeholder hooks - to be updated later
export function useVendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllVendors();
      setVendors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateVendorStatus = async (vendorId: string, status: string) => {
    try {
      // Update the vendor status in the database
      await updateVendorStatusDB(vendorId, status as any);
      // Refresh the vendors list
      await fetchVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  return { vendors, loading, error, refetch: fetchVendors, updateVendorStatus };
}

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllBookings();
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    try {
      await updateBooking(bookingId, { status });
      // No need to refresh - real-time subscription will update the UI
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const updatePaymentStatus = async (bookingId: string, paymentStatus: Booking['payment_status']) => {
    try {
      console.log('Hook: Updating payment status for booking', bookingId, 'to', paymentStatus)
      await updateBooking(bookingId, { payment_status: paymentStatus })
      console.log('Hook: Payment status updated successfully')
      // No need to refresh - real-time subscription will update the UI
    } catch (err) {
      console.error('Hook: Error updating payment status:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchBookings();

    // Set up real-time subscription for all bookings
    const subscription = supabase
      .channel('admin_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings'
      }, async (payload) => {
        console.log('Admin real-time booking change:', payload);
        
        if (payload.eventType === 'INSERT') {
          // For new bookings, refetch to get complete joined data (service, profile)
          await fetchBookings();
        } else if (payload.eventType === 'UPDATE') {
          // For updated bookings, also refetch to get complete joined data
          await fetchBookings();
        } else if (payload.eventType === 'DELETE') {
          setBookings(prev => prev.filter(booking => booking.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { bookings, loading, error, refetch: fetchBookings, updateBookingStatus, updatePaymentStatus };
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllTransactions();
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return { transactions, loading, error, refetch: fetchTransactions };
}

export function useAdminTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllTransactionsForAdmin();
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return { transactions, loading, error, refetch: fetchTransactions };
}

export function useServices(vendorId?: string, options?: { skipInitialFetch?: boolean; includeExpired?: boolean }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getServices(vendorId);

      // Ensure numeric types for price fields returned from DB (supabase may return strings)
      const normalized = (data || []).map((s: any) => {
        const service = { ...s };
        // Coerce top-level price
        if (service.price !== undefined && service.price !== null) {
          if (typeof service.price === 'string') {
            const parsed = parseFloat(service.price);
            service.price = Number.isFinite(parsed) ? parsed : 0;
          } else if (typeof service.price !== 'number') {
            service.price = Number(service.price) || 0;
          }
        } else {
          service.price = 0;
        }

        // Coerce ticket type prices if present
        if (Array.isArray(service.ticket_types)) {
          service.ticket_types = service.ticket_types.map((t: any) => ({
            ...t,
            price: t?.price !== undefined && t?.price !== null ? (typeof t.price === 'string' ? (Number.isFinite(parseFloat(t.price)) ? parseFloat(t.price) : 0) : Number(t.price) || 0) : 0
          }));
        }

        return service as Service;
      });

      // Optionally filter out services that have auto-deactivated (events older than 24h)
      if (options && options.includeExpired === false) {
        const filtered = normalized.filter((service: Service) => {
          const eventDateTimeStr = (service as any).event_datetime || (service as any).event_date;
          if (!eventDateTimeStr) return true;
          const eventDate = new Date(eventDateTimeStr);
          if (isNaN(eventDate.getTime())) return true;
          const now = Date.now();
          const expired = now > eventDate.getTime() + 24 * 60 * 60 * 1000;
          return !expired;
        });
        setServices(filtered);
      } else {
        setServices(normalized);
      }
      // normalized data set into hook state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createNewService = async (serviceData: {
    vendor_id: string
    category_id: string;
    title: string;
    description: string;
    price: number;
    currency?: string;
    images?: string[];
    location?: string;
    duration_hours?: number;
    max_capacity?: number;
    amenities?: string[];

    // Hotel-specific fields
    room_types?: string[]
    check_in_time?: string
    check_out_time?: string
    star_rating?: number
    facilities?: string[]

    // Tour-specific fields
    itinerary?: string[]
    included_items?: string[]
    excluded_items?: string[]
  }) => {
    if (!vendorId) throw new Error('Vendor ID is required to create a service');
    
    try {
      setError(null);
      const newService = await createService(serviceData);
      setServices(prev => [newService, ...prev]);
      return newService;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service');
      throw err;
    }
  };

  const updateServiceStatus = async (serviceId: string, status: Service['status']) => {
    try {
      setError(null);
      
      const updated = await updateService(serviceId, vendorId, { status });
      setServices(prevServices => 
        prevServices.map(service => 
          service.id === serviceId ? updated : service
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service status');
    }
  };

  const updateExistingService = async (serviceId: string, updates: Partial<{
    title: string;
    description: string;
    price: number;
    currency: string;
    images: string[];
    location: string;
    duration_hours: number;
    max_capacity: number;
    amenities: string[];
    category_id: string;
    scan_enabled?: boolean;

    // Hotel-specific fields
    room_types?: string[]
    check_in_time?: string
    check_out_time?: string
    star_rating?: number
    facilities?: string[]

    // Tour-specific fields
    itinerary?: string[]
    included_items?: string[]
    excluded_items?: string[]
  }>) => {
    try {
      setError(null);
      console.log('HOOK: updateExistingService called with:', { serviceId, updates });
      
      const updated = await updateService(serviceId, vendorId, updates);
      
      console.log('HOOK: updateService returned:', { 
        serviceId: updated?.id,
        scan_enabled: updated?.scan_enabled,
        title: updated?.title
      });
      // Detect if DB did not apply expected changes
      try {
        const changedKeys: string[] = [];
        if (updates.title !== undefined && updated?.title !== updates.title) changedKeys.push('title');
        if (updates.description !== undefined && updated?.description !== updates.description) changedKeys.push('description');
        if (updates.price !== undefined && Number(updated?.price) !== Number(updates.price)) changedKeys.push('price');
        if (updates.currency !== undefined && updated?.currency !== updates.currency) changedKeys.push('currency');
        if (changedKeys.length > 0) {
          console.warn('HOOK: updateExistingService detected mismatched fields after update:', { serviceId, changedKeys, sent: updates, returned: updated });
        }
      } catch (e) {
        console.warn('HOOK: error while validating update result:', e);
      }
      
      setServices(prevServices => {
        const newServices = prevServices.map(service => 
          service.id === serviceId ? updated : service
        );
        console.log('HOOK: setServices called, new services array:', newServices.map(s => ({ id: s.id, scan_enabled: s.scan_enabled })));
        return newServices;
      });
      
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service');
      throw err;
    }
  };

  const removeService = async (serviceId: string) => {
    try {
      setError(null);
      await deleteService(serviceId, vendorId);
      setServices(prev => prev.filter(s => s.id !== serviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
      throw err;
    }
  };

  useEffect(() => {
    // If requested to skip initial fetch and vendorId is undefined, do nothing.
    // This allows callers (like vendor pages) to wait until vendor status is resolved
    // before triggering the service fetch to avoid returning global results.
    if (options?.skipInitialFetch && vendorId === undefined) return;

    fetchServices();
  }, [vendorId, options?.skipInitialFetch]);

  return { 
    services, 
    loading, 
    error, 
    refetch: fetchServices, 
    createService: createNewService,
    updateService: updateExistingService,
    updateServiceStatus,
    deleteService: removeService
  };
}

export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlights = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getFlights();
      setFlights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createNewFlight = async (flightData: {
    flight_number: string;
    airline: string;
    departure_airport: string;
    arrival_airport: string;
    departure_city: string;
    arrival_city: string;
    departure_time: string;
    arrival_time: string;
    duration_minutes: number;
    aircraft_type?: string;
    economy_price: number;
    business_price?: number;
    first_class_price?: number;
    currency?: string;
    total_seats: number;
    available_seats: number;
    status?: Flight['status'];
    flight_class?: Flight['flight_class'];
    amenities?: string[];
    baggage_allowance?: string;
  }) => {
    try {
      const flightWithDefaults = {
        ...flightData,
        status: flightData.status || 'active',
        flight_class: flightData.flight_class || 'economy',
        currency: flightData.currency || 'UGX',
        amenities: flightData.amenities || []
      };
      const newFlight = await createFlight(flightWithDefaults);
      setFlights(prev => [...prev, newFlight]);
      return newFlight;
    } catch (err) {
      throw err;
    }
  };

  const updateExistingFlight = async (id: string, updates: Partial<Flight>) => {
    try {
      const updatedFlight = await updateFlight(id, updates);
      setFlights(prev => prev.map(flight =>
        flight.id === id ? updatedFlight : flight
      ));
      return updatedFlight;
    } catch (err) {
      throw err;
    }
  };

  const removeFlight = async (id: string) => {
    try {
      await deleteFlight(id);
      setFlights(prev => prev.filter(flight => flight.id !== id));
    } catch (err) {
      throw err;
    }
  };

  const updateFlightStatus = async (id: string, status: Flight['status']): Promise<Flight> => {
    try {
      const updatedFlight: Flight = await updateFlightStatusDB(id, status);
      setFlights(prev => prev.map(flight =>
        flight.id === id ? updatedFlight : flight
      ));
      return updatedFlight;
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  return {
    flights,
    loading,
    error,
    refetch: fetchFlights,
    createFlight: createNewFlight,
    updateFlight: updateExistingFlight,
    deleteFlight: removeFlight,
    updateFlightStatus
  };
}

// Placeholder hooks - to be updated later
// export function useVendors() {
//   const [vendors, setVendors] = useState<Vendor[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   return { vendors, loading, error, refetch: () => {}, updateVendorStatus: () => {} };
// }

// export function useBookings() {
//   const [bookings, setBookings] = useState<Booking[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   return { bookings, loading, error, refetch: () => {} };
// }

// export function useTransactions() {
//   const [transactions, setTransactions] = useState<Transaction[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   return { transactions, loading, error, refetch: () => {} };
// }

export function useServiceCategories() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getServiceCategories();

      // Filter out flights category
      const filteredData = data.filter(category => category.id !== 'cat_flights');

      // Add artificial delay for better UX (showing loading states)
      await new Promise(resolve => setTimeout(resolve, 1000));

      setCategories(filteredData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories
  };
}

export function useServiceDeleteRequests(vendorId?: string) {
  const [deleteRequests, setDeleteRequests] = useState<ServiceDeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeleteRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('useServiceDeleteRequests: Fetching delete requests for vendorId:', vendorId);
      const data = await getServiceDeleteRequests(vendorId);
      console.log('useServiceDeleteRequests: Fetched data:', data);
      console.log('useServiceDeleteRequests: Data length:', data?.length || 0);
      setDeleteRequests(data);
    } catch (err) {
      console.error('useServiceDeleteRequests: Error fetching delete requests:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createDeleteRequest = async (serviceId: string, vendorId: string, reason: string) => {
    try {
      setError(null);
      const newRequest = await createServiceDeleteRequest(serviceId, vendorId, reason);
      setDeleteRequests(prev => [newRequest, ...prev]);
      return newRequest;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create delete request');
      throw err;
    }
  };

  const updateDeleteRequestStatus = async (requestId: string, status: 'pending' | 'approved' | 'rejected', adminNotes?: string) => {
    try {
      setError(null);
      const updated = await updateServiceDeleteRequestStatus(requestId, status, adminNotes);
      setDeleteRequests(prev =>
        prev.map(request =>
          request.id === requestId ? updated : request
        )
      );
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update delete request status');
      throw err;
    }
  };

  const removeDeleteRequest = async (requestId: string) => {
    try {
      setError(null);
      await deleteServiceDeleteRequest(requestId);
      setDeleteRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete request');
      throw err;
    }
  };

  useEffect(() => {
    fetchDeleteRequests();
  }, [vendorId]);

  return {
    deleteRequests,
    loading,
    error,
    refetch: fetchDeleteRequests,
    createDeleteRequest,
    updateDeleteRequestStatus,
    deleteDeleteRequest: removeDeleteRequest
  };
}

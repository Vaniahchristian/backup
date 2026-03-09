import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Service } from '../../types'
import { useServices, useServiceCategories, useServiceDeleteRequests } from '../../hooks/hook'
import { formatCurrencyWithConversion } from '../../lib/utils'
import { usePreferences } from '../../contexts/PreferencesContext'
import { Plus, X, Search, Map } from 'lucide-react'
import SearchMap from '../../components/SearchMap'
import { supabase } from '../../lib/supabaseClient'
import { uploadServiceImage, deleteServiceImage, removeServiceImage } from '../../lib/imageUpload'
import { createActivationRequest, createTicketType, getTicketTypes, updateTicketType, deleteTicketType } from '../../lib/database'

function formatServicePrice(service: Service, ticketTypes: { [serviceId: string]: any[] }, selectedCurrency: string, selectedLanguage: string) {
  // For events/activities with ticket types, show ticket prices
  if (service.category_id === 'cat_activities' && ticketTypes[service.id]?.length > 0) {
    const ticketPrices = ticketTypes[service.id]
      .map((ticket: any) => ticket.price)
      .filter((price: number) => price > 0);
    
    if (ticketPrices.length > 0) {
      const minPrice = Math.min(...ticketPrices);
      const maxPrice = Math.max(...ticketPrices);
      
      if (minPrice === maxPrice) {
        return formatCurrencyWithConversion(minPrice, service.currency, selectedCurrency, selectedLanguage);
      } else {
        return `${formatCurrencyWithConversion(minPrice, service.currency, selectedCurrency, selectedLanguage)} - ${formatCurrencyWithConversion(maxPrice, service.currency, selectedCurrency, selectedLanguage)}`;
      }
    }
  }
  
  // Fallback to service price
  return formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage);
}

  // Normalize a value from an HTML datetime-local input (e.g. "2026-02-11T21:29")
  // to an ISO UTC string (timestamptz-friendly). If parsing fails, return the
  // original value so the DB-side fallback still has a chance to handle it.
  const normalizeDateTimeLocalToISO = (val?: string | null) => {
    if (!val) return null
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return val
    return d.toISOString()
  }

  // Convert an ISO/timestamptz string to a value suitable for an
  // <input type="datetime-local" /> (format: "yyyy-MM-ddTHH:mm").
  const formatISOToDatetimeLocal = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

export default function VendorServices() {
  const { user } = useAuth()
  const { selectedCurrency, selectedLanguage } = usePreferences()
  const [vendorId, setVendorId] = useState<string | null>(null)
  const [vendorLoading, setVendorLoading] = useState(true)

  const { services, loading, error, createService, updateService, deleteService } = useServices(vendorId || undefined, { skipInitialFetch: vendorLoading })
  const { categories } = useServiceCategories()
  const { deleteRequests, createDeleteRequest } = useServiceDeleteRequests(vendorId || undefined)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [ticketTypes, setTicketTypes] = useState<{ [serviceId: string]: any[] }>({})
  const itemsPerPage = 10

  // Helper: determine if an event is more than 24 hours past its event datetime
  function isPast24HoursAfterEvent(service: Service | any): boolean {
    const eventDateTimeStr = (service as any).event_datetime || (service as any).event_date;
    if (!eventDateTimeStr) return false;
    const eventDate = new Date(eventDateTimeStr);
    if (isNaN(eventDate.getTime())) return false;
    const now = Date.now();
    return now > eventDate.getTime() + 24 * 60 * 60 * 1000;
  }

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategory, debouncedSearchQuery])

  // Check if user is a vendor and set vendorId accordingly
  useEffect(() => {
    const checkVendorStatus = async () => {
      if (!user?.id) {
        setVendorLoading(false)
        return
      }

      try {
        // First check if user has vendor role in profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Error fetching profile:', profileError)
          setVendorId(null)
          setVendorLoading(false)
          return
        }

        if (profile.role !== 'vendor' || profile.status !== 'approved') {
          setVendorId(null)
          setVendorLoading(false)
          return
        }

        // User is an approved vendor, try to get their vendor record
        let vendorIdToUse = user.id // Default fallback

        const { data: vendor, error: vendorError } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (vendorError) {
          console.warn('Could not fetch vendor record:', vendorError)
          
          // Try to create vendor record if it doesn't exist
          const { data: newVendor, error: createError } = await supabase
            .from('vendors')
            .insert([{
              user_id: user.id,
              business_name: 'Business Name',
              business_description: 'Please update your business description',
              business_email: user.email || '',
              status: 'approved'
            }])
            .select('id')
            .single()

          if (createError) {
            if (createError.code === '23505') {
              // Record already exists, try to fetch it again
              console.log('Vendor record already exists, fetching again...')
              const { data: existingVendor, error: fetchError } = await supabase
                .from('vendors')
                .select('id')
                .eq('user_id', user.id)
                .single()
              
              if (!fetchError && existingVendor) {
                vendorIdToUse = existingVendor.id
              } else {
                console.error('Still cannot fetch vendor record after creation attempt:', fetchError)
                // Use user ID as fallback - the updated RLS policy should handle this
                vendorIdToUse = user.id
              }
            } else {
              console.error('Failed to create vendor record:', createError)
              // Use user ID as fallback
              vendorIdToUse = user.id
            }
          } else if (newVendor) {
            vendorIdToUse = newVendor.id
            console.log('Created new vendor record with ID:', vendorIdToUse)
          }
        } else {
          vendorIdToUse = vendor.id
        }

        setVendorId(vendorIdToUse)
      } catch (err) {
        console.error('Failed to check vendor status:', err)
        setVendorId(null)
      } finally {
        setVendorLoading(false)
      }
    }

    checkVendorStatus()
  }, [user?.id])

  // Load ticket types for services when services change
  useEffect(() => {
    const loadTicketTypes = async () => {
      if (!services.length) return

      const ticketData: { [serviceId: string]: any[] } = {}
      
      // Load ticket types for activities only
      const activityServices = services.filter(s => s.category_id === 'cat_activities')
      
      for (const service of activityServices) {
        try {
          const types = await getTicketTypes(service.id)
          ticketData[service.id] = types || []
        } catch (err) {
          console.error(`Failed to load ticket types for service ${service.id}:`, err)
          ticketData[service.id] = []
        }
      }
      
      setTicketTypes(ticketData)
    }

    loadTicketTypes()
  }, [services])

  const onCreate = async (data: Partial<Service>) => {
    if (!vendorId) {
      alert('Vendor account not found. Please contact support.')
      return
    }

    try {
      const created = await createService({
        vendor_id: vendorId!,
        category_id: data.category_id || 'cat_activities',
        title: data.title || '',
        description: data.category_id === 'cat_activities' ? ((data as any).event_description || data.description || '') : (data.description || ''),
        price: Number(data.price) || 0,
        currency: (data.currency as string) || 'UGX',
        images: (data.images as string[]) || [],
        location: data.location || '',
        duration_hours: data.duration_hours || undefined,
        max_capacity: data.max_capacity || undefined,
        amenities: (data.amenities as string[]) || [],

        // Hotel fields
        room_types: data.room_types || [],
        check_in_time: data.check_in_time || '',
        check_out_time: data.check_out_time || '',
        star_rating: data.star_rating || undefined,
        facilities: data.facilities || [],

        // Tour fields
        itinerary: data.itinerary || [],
        included_items: data.included_items || [],
        excluded_items: data.excluded_items || [],
        minimum_age: data.minimum_age || undefined,
        languages_offered: data.languages_offered || [],

        // Transport fields
        vehicle_type: data.vehicle_type || '',
        vehicle_capacity: data.vehicle_capacity || undefined,
        pickup_locations: data.pickup_locations || [],
        dropoff_locations: data.dropoff_locations || [],
        route_description: data.route_description || '',

        // Restaurant fields
        cuisine_type: data.cuisine_type || '',
        opening_hours: data.opening_hours || {},
        menu_items: data.menu_items || [],
        dietary_options: data.dietary_options || [],
        average_cost_per_person: data.average_cost_per_person || undefined,

        // Guide fields
        languages_spoken: data.languages_spoken || [],
        specialties: data.specialties || [],
        certifications: data.certifications || [],
        years_experience: data.years_experience || undefined,
        service_area: data.service_area || '',

        // Shop fields
        shop_type: data.shop_type || '',
        store_size: data.store_size || undefined,
        opening_time: data.opening_time || '',
        closing_time: data.closing_time || '',
        products_offered: data.products_offered || [],
        in_store_pickup: data.in_store_pickup || false,
        online_orders: data.online_orders || false,
        minimum_order_value: data.minimum_order_value || undefined,
        delivery_fee: data.delivery_fee || undefined,
        shop_policies: data.shop_policies || '',
        shop_notes: data.shop_notes || '',

        // Event fields
        event_description: (data as any).event_description || '',
        event_type: data.event_type || '',
  // store as ISO UTC string so DB timestamptz parsing is deterministic
  event_datetime: normalizeDateTimeLocalToISO(data.event_datetime) || null,
        event_location: data.event_location || '',
        max_participants: data.max_participants || undefined,
        registration_deadline: data.registration_deadline || '',
        internal_ticketing: (data as any).internal_ticketing ?? true,
        ticket_types: (data as any).ticket_types || [],
        event_highlights: data.event_highlights || [],
        event_inclusions: data.event_inclusions || [],
        event_prerequisites: data.event_prerequisites || [],
        photography_allowed: data.photography_allowed || false,
        recording_allowed: data.recording_allowed || false,
        group_discounts: data.group_discounts || false,
        transportation_included: data.transportation_included || false,
        meals_included: data.meals_included || false,
        certificates_provided: data.certificates_provided || false,
        event_cancellation_policy: data.event_cancellation_policy || '',

        // General fields
        tags: data.tags || [],
        contact_info: data.contact_info || {},
        booking_requirements: data.booking_requirements || '',
        cancellation_policy: data.cancellation_policy || ''
      } as any)

      try {
        // Persist ticket types (if any) for events
        const tickets = (data as any).ticket_types || []
        if (tickets.length > 0 && created?.id) {
          for (const t of tickets) {
            const payload = {
              title: t.title || t.name || 'Ticket',
              description: t.description || '',
              price: Number(t.price) || 0,
              quantity: Number(t.quantity) || 0,
              metadata: t.metadata || {},
              sale_start: normalizeDateTimeLocalToISO(t.sale_start) || t.sale_start || null,
              sale_end: normalizeDateTimeLocalToISO(t.sale_end) || t.sale_end || null
            }
            await createTicketType(created.id, payload)
          }
        }
      } catch (ticketErr) {
        console.warn('Failed to persist ticket types:', ticketErr)
      }

      setShowForm(false)
    } catch (err) {
      console.error('Failed to create service:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      alert(`Failed to create service: ${errorMessage}`)
    }
  }

  const onUpdate = async (id: string, updates: Partial<Service>) => {
    try {
      // Filter out undefined/null values and only send valid updates
      const validUpdates: any = {}

      // Basic fields
      if (updates.title !== undefined) validUpdates.title = updates.title
      if (updates.description !== undefined) validUpdates.description = updates.description
      if (updates.price !== undefined) validUpdates.price = updates.price
      if (updates.currency !== undefined) validUpdates.currency = updates.currency
      if (updates.images !== undefined) validUpdates.images = updates.images
      if (updates.location !== undefined) validUpdates.location = updates.location
      if (updates.duration_hours !== undefined) validUpdates.duration_hours = updates.duration_hours
      if (updates.max_capacity !== undefined) validUpdates.max_capacity = updates.max_capacity
      if (updates.amenities !== undefined) validUpdates.amenities = updates.amenities
      if (updates.category_id !== undefined) validUpdates.category_id = updates.category_id

      // Hotel fields (note: check_in_time and check_out_time don't exist in database, use check_in_process instead)
      if (updates.room_types !== undefined) validUpdates.room_types = updates.room_types
      if (updates.star_rating !== undefined && updates.star_rating !== null && updates.star_rating >= 1 && updates.star_rating <= 5) {
        validUpdates.star_rating = updates.star_rating
      }
      if (updates.facilities !== undefined) validUpdates.facilities = updates.facilities

      // Tour fields
      if (updates.itinerary !== undefined) validUpdates.itinerary = updates.itinerary
      if (updates.included_items !== undefined) validUpdates.included_items = updates.included_items
      if (updates.excluded_items !== undefined) validUpdates.excluded_items = updates.excluded_items
      if (updates.difficulty_level !== undefined && ['easy', 'moderate', 'challenging', 'difficult'].includes(updates.difficulty_level)) {
        validUpdates.difficulty_level = updates.difficulty_level
      }
      if (updates.minimum_age !== undefined) validUpdates.minimum_age = updates.minimum_age
      if (updates.languages_offered !== undefined) validUpdates.languages_offered = updates.languages_offered

      // Transport fields
      if (updates.vehicle_type !== undefined) validUpdates.vehicle_type = updates.vehicle_type
      if (updates.vehicle_capacity !== undefined) validUpdates.vehicle_capacity = updates.vehicle_capacity
      if (updates.pickup_locations !== undefined) validUpdates.pickup_locations = updates.pickup_locations
      if (updates.dropoff_locations !== undefined) validUpdates.dropoff_locations = updates.dropoff_locations
      if (updates.route_description !== undefined) validUpdates.route_description = updates.route_description
      if (updates.license_required !== undefined) validUpdates.license_required = updates.license_required
      if (updates.booking_notice_hours !== undefined) validUpdates.booking_notice_hours = updates.booking_notice_hours
      if (updates.air_conditioning !== undefined) validUpdates.air_conditioning = updates.air_conditioning
      if (updates.gps_tracking !== undefined) validUpdates.gps_tracking = updates.gps_tracking
      if (updates.fuel_included !== undefined) validUpdates.fuel_included = updates.fuel_included
      if (updates.tolls_included !== undefined) validUpdates.tolls_included = updates.tolls_included
      if (updates.insurance_included !== undefined) validUpdates.insurance_included = updates.insurance_included
      if (updates.driver_included !== undefined) validUpdates.driver_included = updates.driver_included
      if (updates.usb_charging !== undefined) validUpdates.usb_charging = updates.usb_charging
      if (updates.child_seat !== undefined) validUpdates.child_seat = updates.child_seat
      if (updates.roof_rack !== undefined) validUpdates.roof_rack = updates.roof_rack
      if (updates.towing_capacity !== undefined) validUpdates.towing_capacity = updates.towing_capacity
      if (updates.four_wheel_drive !== undefined) validUpdates.four_wheel_drive = updates.four_wheel_drive
      if (updates.automatic_transmission !== undefined) validUpdates.automatic_transmission = updates.automatic_transmission
      if (updates.transport_terms !== undefined) validUpdates.transport_terms = updates.transport_terms
      if (updates.reservations_required !== undefined) validUpdates.reservations_required = updates.reservations_required

      // Restaurant fields
      if (updates.cuisine_type !== undefined) validUpdates.cuisine_type = updates.cuisine_type
      if (updates.opening_hours !== undefined) validUpdates.opening_hours = updates.opening_hours
      if (updates.menu_items !== undefined) validUpdates.menu_items = updates.menu_items
      if (updates.dietary_options !== undefined) validUpdates.dietary_options = updates.dietary_options
      if (updates.average_cost_per_person !== undefined) validUpdates.average_cost_per_person = updates.average_cost_per_person

      // Guide fields
      if (updates.languages_spoken !== undefined) validUpdates.languages_spoken = updates.languages_spoken
      if (updates.specialties !== undefined) validUpdates.specialties = updates.specialties
      if (updates.certifications !== undefined) validUpdates.certifications = updates.certifications
      if (updates.years_experience !== undefined) validUpdates.years_experience = updates.years_experience
      if (updates.service_area !== undefined) validUpdates.service_area = updates.service_area

      // General fields
      if (updates.tags !== undefined) validUpdates.tags = updates.tags
      if (updates.contact_info !== undefined) validUpdates.contact_info = updates.contact_info
      if (updates.booking_requirements !== undefined) validUpdates.booking_requirements = updates.booking_requirements
      if (updates.cancellation_policy !== undefined) validUpdates.cancellation_policy = updates.cancellation_policy

      // Event fields
      if ((updates as any).event_description !== undefined) validUpdates.event_description = (updates as any).event_description
  if (updates.event_type !== undefined) validUpdates.event_type = updates.event_type
  if (updates.event_datetime !== undefined) validUpdates.event_datetime = normalizeDateTimeLocalToISO((updates as any).event_datetime) ?? updates.event_datetime
      if (updates.registration_deadline !== undefined) validUpdates.registration_deadline = updates.registration_deadline
      if (updates.event_location !== undefined) validUpdates.event_location = updates.event_location
      if (updates.max_participants !== undefined) validUpdates.max_participants = updates.max_participants
      if (updates.event_status !== undefined) validUpdates.event_status = updates.event_status
      if (updates.event_highlights !== undefined) validUpdates.event_highlights = updates.event_highlights
      if (updates.event_inclusions !== undefined) validUpdates.event_inclusions = updates.event_inclusions
      if (updates.event_prerequisites !== undefined) validUpdates.event_prerequisites = updates.event_prerequisites
      if (updates.event_cancellation_policy !== undefined) validUpdates.event_cancellation_policy = updates.event_cancellation_policy
      if (updates.certificates_provided !== undefined) validUpdates.certificates_provided = updates.certificates_provided
      if (updates.refreshments_included !== undefined) validUpdates.refreshments_included = updates.refreshments_included
      if (updates.take_home_materials !== undefined) validUpdates.take_home_materials = updates.take_home_materials
      if (updates.photography_allowed !== undefined) validUpdates.photography_allowed = updates.photography_allowed
      if (updates.recording_allowed !== undefined) validUpdates.recording_allowed = updates.recording_allowed
      if (updates.group_discounts !== undefined) validUpdates.group_discounts = updates.group_discounts
      if (updates.transportation_included !== undefined) validUpdates.transportation_included = updates.transportation_included
      if (updates.meals_included !== undefined) validUpdates.meals_included = updates.meals_included
      if (updates.internal_ticketing !== undefined) validUpdates.internal_ticketing = updates.internal_ticketing

      console.log('Valid updates:', validUpdates)

      if (Object.keys(validUpdates).length === 0) {
        console.log('No valid updates to send')
        setEditing(null)
        return
      }

      await updateService(id, validUpdates)

      // Sync ticket types (create/update/delete) if provided
      try {
        const incoming = (updates as any).ticket_types || []
        if (Array.isArray(incoming)) {
          const existing = await getTicketTypes(id)
          const existingById: Record<string, any> = {}
          for (const ex of existing) existingById[ex.id] = ex

          // Create or update incoming
          for (const tt of incoming) {
              const metadata = { ...(tt.metadata || {}) }
              const payload = {
                title: tt.title,
                description: tt.description || '',
                price: Number(tt.price || 0),
                quantity: Number(tt.quantity || 0),
                metadata,
                sale_start: normalizeDateTimeLocalToISO(tt.sale_start) ?? undefined,
                sale_end: normalizeDateTimeLocalToISO(tt.sale_end) ?? undefined
              }
            if (!tt.id || String(tt.id).startsWith('temp-')) {
              try {
                await createTicketType(id, payload)
              } catch (err) {
                console.warn('Failed to create ticket type during sync:', err)
              }
            } else if (existingById[tt.id]) {
              try {
                await updateTicketType(tt.id, payload)
              } catch (err) {
                console.warn('Failed to update ticket type during sync:', err)
              }
              delete existingById[tt.id]
            }
          }

          // Anything left in existingById was removed from incoming -> delete
          for (const exId of Object.keys(existingById)) {
            try {
              await deleteTicketType(exId)
            } catch (err) {
              console.warn('Failed to delete ticket type during sync:', err)
            }
          }
        }
      } catch (syncErr) {
        console.warn('Ticket types sync failed:', syncErr)
      }

      setEditing(null)
    } catch (err) {
      console.error('Failed to update service:', err)
      alert('Failed to update service. Please try again.')
    }
  }

  // Load ticket types for a service and open the edit form
  const handleOpenEdit = async (s: Service) => {
    try {
      // try to fetch ticket types from DB (if any) so the form is fully populated
      const types = await getTicketTypes(s.id)
      // Convert ISO/timestamptz values to datetime-local format for the inputs
      const mapped = (types || []).map((t: any) => ({
        ...t,
        sale_start: formatISOToDatetimeLocal(t.sale_start),
        sale_end: formatISOToDatetimeLocal(t.sale_end)
      }))
      setEditing({ ...s, ticket_types: mapped })
    } catch (err) {
      console.warn('Failed to load ticket types for edit, falling back to service object:', err)
      setEditing(s)
    } finally {
      setShowForm(true)
    }
  }

  const onDelete = async (service: Service) => {
    if (!user) {
      alert('You must be logged in to delete services.')
      return
    }

    if (!vendorId) {
      alert('Vendor account not found. Please contact support.')
      return
    }

    if (service.status === 'approved') {
      // For approved services, create a delete request
      const reason = prompt('Please provide a reason for requesting deletion of this approved service:')
      if (!reason || reason.trim() === '') {
        alert('Reason is required to request service deletion.')
        return
      }

      try {
        await createDeleteRequest(service.id, vendorId, reason.trim())
        alert('Delete request submitted successfully. An admin will review your request.')
      } catch (err) {
        console.error('Failed to create delete request:', err)
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
        alert(`Failed to submit delete request: ${errorMessage}`)
      }
    } else {
      // For non-approved services, delete directly
      if (!confirm('Delete this service?')) return
      try {
        await deleteService(service.id)
      } catch (err) {
        console.error('Failed to delete service:', err)
        alert('Failed to delete service. Please try again.')
      }
    }
  }

  // Filter services based on selected category and search query (memoized for performance)
  const categoryFilteredServices = useMemo(() => 
    selectedCategory === 'all' 
      ? services 
      : services.filter(service => service.category_id === selectedCategory),
    [services, selectedCategory]
  )

  const filteredServices = useMemo(() =>
    debouncedSearchQuery.trim() === ''
      ? categoryFilteredServices
      : categoryFilteredServices.filter(service =>
          service.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          service.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          service.service_categories?.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
        ),
    [categoryFilteredServices, debouncedSearchQuery]
  )

  // Pagination (memoized for performance)
  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(filteredServices.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const paginatedServices = filteredServices.slice(startIndex, startIndex + itemsPerPage)
    return { totalPages, startIndex, paginatedServices }
  }, [filteredServices, currentPage, itemsPerPage])

  const { totalPages, startIndex, paginatedServices } = paginationData

  // Memoize category counts for performance
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: services.length }
    categories.forEach(category => {
      counts[category.id] = services.filter(service => service.category_id === category.id).length
    })
    return counts
  }, [services, categories])

  const pendingDeleteRequests = deleteRequests.filter(request => request.status === 'pending')

  if (vendorLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading vendor information...</div>
      </div>
    )
  }

  if (!vendorId) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="text-gray-500 mb-2">No vendor account found</div>
          <div className="text-sm text-gray-400">Please contact an administrator to set up your vendor account.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in slide-in-from-top duration-500">
        {/* Header */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 backdrop-blur-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">
                      Services
                    </h1>
                    <p className="text-slate-600 text-sm font-medium">
                      {services.length} total services
                      {pendingDeleteRequests.length > 0 && (
                        <span className="ml-2 px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                          {pendingDeleteRequests.length} pending deletion
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <p className="text-slate-500 text-sm leading-relaxed max-w-md">
                  Manage your service offerings, track performance, and engage with your customers.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 lg:flex-shrink-0">
                <button
                  onClick={() => { setEditing(null); setShowForm(true) }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <Plus className="h-5 w-5" />
                  Create New Service
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 backdrop-blur-sm">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Search */}
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Search Services</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by title, description, or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50/50 placeholder:text-slate-400 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Category Filters */}
              <div className="lg:w-96">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Filter by Category</label>
                <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                      selectedCategory === 'all'
                        ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                  >
                    All ({categoryCounts.all})
                  </button>
                  {categories
                    .filter(category => categoryCounts[category.id] > 0)
                    .map((category) => {
                      const count = categoryCounts[category.id]
                      return (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                            selectedCategory === category.id
                              ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                          }`}
                        >
                          {category.name} ({count})
                        </button>
                      )
                    })}
                </nav>
              </div>
            </div>
          </div>
        </div>

      {/* Services List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden backdrop-blur-sm">
        {/* Mobile Card View */}
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-8 py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-slate-500">Loading services...</p>
            </div>
          ) : error ? (
            <div className="px-8 py-16 text-center">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm text-red-600 font-medium">Error loading services</p>
              <p className="text-xs text-slate-500 mt-1">{error}</p>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="px-8 py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No services found</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">Get started by creating your first service offering.</p>
              <button
                onClick={() => { setEditing(null); setShowForm(true) }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <Plus className="h-5 w-5" />
                Create Your First Service
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginatedServices.map(s => (
                <div key={s.id} className="p-5 hover:bg-slate-50/50 transition-colors duration-200 group">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-900 truncate mb-1 group-hover:text-blue-600 transition-colors">
                        {s.title}
                      </h3>
                      <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{s.description}</p>
                    </div>
                    {(() => {
                      const autoDeactivated = isPast24HoursAfterEvent(s);
                      const available = s.status === 'approved' && !autoDeactivated;
                      return (
                        <span className={`flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                          available ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          s.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {available ? 'Live' : s.status === 'rejected' ? 'Rejected' : (autoDeactivated ? 'Unavailable' : 'Pending')}
                        </span>
                      )
                    })()}
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <span className="text-slate-500">{s.service_categories?.name || s.category_id}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-slate-900">{formatServicePrice(s, ticketTypes, selectedCurrency, selectedLanguage)}</span>
                  </div>

                  {s.category_id === 'cat_activities' && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      {s.scan_enabled ? (
                        <a
                          href={`${window.location.origin}/scan/${s.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
                        >
                          View scan link ↗
                        </a>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Scan link inactive</span>
                          <button
                            onClick={async () => {
                              try {
                                await createActivationRequest(s.id, s.vendor_id, user?.id)
                                alert('Activation request submitted.')
                              } catch (err) {
                                console.error('Failed to create activation request:', err)
                                alert('Failed to submit request.')
                              }
                            }}
                            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                          >
                            Request activation
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => { handleOpenEdit(s) }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:shadow-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(s)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-sm border ${
                        s.status === 'approved'
                          ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                          : 'text-red-600 hover:bg-red-50 border-red-200'
                      }`}
                    >
                      {s.status === 'approved' ? 'Request Delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <table className="w-full">
            <thead className="bg-slate-50/50">
              <tr className="border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Service</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Price</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">Loading services...</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-red-500">Error: {error}</td></tr>
              ) : filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <p className="text-sm text-slate-500">No services found.</p>
                    <button onClick={() => { setEditing(null); setShowForm(true) }} className="mt-2 text-sm font-medium text-slate-900 hover:underline">Create your first service →</button>
                  </td>
                </tr>
              ) : (
                paginatedServices.map(s => (
                  <tr key={s.id} className="group hover:bg-slate-50/50 transition-colors duration-200">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{s.title}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs mt-0.5">{s.description}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-slate-600">{s.service_categories?.name || s.category_id}</span>
                      {s.category_id === 'cat_activities' && (
                        <div className="mt-1">
                          {s.scan_enabled ? (
                            <a href={`${window.location.origin}/scan/${s.id}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors">Scan link ↗</a>
                          ) : (
                                <div>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await createActivationRequest(s.id, s.vendor_id, user?.id)
                                        alert('Activation request submitted.')
                                      } catch (err) {
                                        console.error('Failed to create activation request:', err)
                                        alert('Failed to submit request.')
                                      }
                                    }}
                                    className="text-xs text-slate-400 hover:text-slate-600 hover:underline transition-colors"
                                  >
                                    Request scan activation
                                  </button>
                                  {isPast24HoursAfterEvent(s) && (
                                    <div className="text-[11px] text-gray-500 italic mt-1">Auto-deactivated after 24h</div>
                                  )}
                                </div>
                              )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatServicePrice(s, ticketTypes, selectedCurrency, selectedLanguage)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const autoDeactivated = isPast24HoursAfterEvent(s);
                        const available = s.status === 'approved' && !autoDeactivated;
                        return (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                            available ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            s.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {available ? 'Live' : s.status === 'rejected' ? 'Rejected' : (autoDeactivated ? 'Unavailable' : 'Pending')}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={() => { handleOpenEdit(s) }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:shadow-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 hover:shadow-sm border ${
                            s.status === 'approved'
                              ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                              : 'text-red-600 hover:bg-red-50 border-red-200'
                          }`}
                        >
                          {s.status === 'approved' ? 'Request Delete' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Delete Requests */}
      {pendingDeleteRequests.length > 0 && (
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden backdrop-blur-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">Pending Delete Requests</h2>
            <p className="text-sm text-slate-600 mt-1">These services are awaiting admin approval for deletion.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingDeleteRequests.map((request) => (
              <div key={request.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors duration-200">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{request.service?.title}</p>
                  <p className="text-sm text-slate-600 mt-1 truncate max-w-md">{request.reason}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Pending Review
                  </span>
                  <span className="text-xs text-slate-500">{new Date(request.requested_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredServices.length)} of {filteredServices.length} services
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                if (pageNum > totalPages) return null
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <ServiceForm
          initial={editing || undefined}
          vendorId={vendorId}
          onClose={() => setShowForm(false)}
          onSubmit={(payload) => {
            if (editing) {
              onUpdate(editing.id, payload)
            } else {
              onCreate(payload)
            }
            setShowForm(false)
          }}
        />
      )}
      </div>
    </div>
  )
}

function ServiceForm({ initial, vendorId, onClose, onSubmit }: { initial?: Partial<Service>; vendorId: string | null; onClose: () => void; onSubmit: (payload: Partial<Service>) => void }) {
  const { categories } = useServiceCategories()
  const [form, setForm] = useState<Partial<Service>>({
    title: initial?.title || '',
    description: initial?.description || '',
    category_id: initial?.category_id || categories[0]?.id || '',
    price: initial?.price || 0,
    currency: initial?.currency || 'UGX',
    images: initial?.images || [],
    location: initial?.location || '',
    duration_hours: initial?.duration_hours || undefined,
    max_capacity: initial?.max_capacity || undefined,
    amenities: initial?.amenities || [],

    // Hotel fields
    room_types: initial?.room_types || [],
    star_rating: initial?.star_rating || undefined,
    facilities: initial?.facilities || [],
    property_type: initial?.property_type || '',
    total_rooms: initial?.total_rooms || undefined,
    breakfast_included: initial?.breakfast_included || false,
    wifi_available: initial?.wifi_available || false,
    parking_available: initial?.parking_available || false,
    pet_friendly: initial?.pet_friendly || false,
    generator_backup: initial?.generator_backup || false,
    smoking_allowed: initial?.smoking_allowed || false,
    children_allowed: initial?.children_allowed || false,
    disabled_access: initial?.disabled_access || false,
    concierge_service: initial?.concierge_service || false,

    // Tour fields
    itinerary: initial?.itinerary || [],
    included_items: initial?.included_items || [],
    excluded_items: initial?.excluded_items || [],
    difficulty_level: initial?.difficulty_level || undefined,
    minimum_age: initial?.minimum_age || undefined,
    languages_offered: initial?.languages_offered || [],
    best_time_to_visit: initial?.best_time_to_visit || '',
    max_participants: initial?.max_participants || undefined,
    meeting_point: initial?.meeting_point || '',
    end_point: initial?.end_point || '',
    transportation_included: initial?.transportation_included || false,
    meals_included: initial?.meals_included || [],
    guide_included: initial?.guide_included || false,
    accommodation_included: initial?.accommodation_included || false,

    // Transport fields
    vehicle_type: initial?.vehicle_type || '',
    vehicle_capacity: initial?.vehicle_capacity || undefined,
    pickup_locations: initial?.pickup_locations || [],
    dropoff_locations: initial?.dropoff_locations || [],
    route_description: initial?.route_description || '',
    license_required: initial?.license_required || '',
    booking_notice_hours: initial?.booking_notice_hours || undefined,
    transport_terms: initial?.transport_terms || '',
    air_conditioning: initial?.air_conditioning || false,
    gps_tracking: initial?.gps_tracking || false,
    fuel_included: initial?.fuel_included || false,
    tolls_included: initial?.tolls_included || false,
    insurance_included: initial?.insurance_included || false,
    usb_charging: initial?.usb_charging || false,
    child_seat: initial?.child_seat || false,
    roof_rack: initial?.roof_rack || false,
    four_wheel_drive: initial?.four_wheel_drive || false,
    automatic_transmission: initial?.automatic_transmission || false,
    reservations_required: initial?.reservations_required || false,
    driver_included: initial?.driver_included || false,

    // Restaurant fields
    cuisine_type: initial?.cuisine_type || '',
    opening_hours: initial?.opening_hours || {},
    menu_items: initial?.menu_items || [],
    dietary_options: initial?.dietary_options || [],
    average_cost_per_person: initial?.average_cost_per_person || undefined,
    outdoor_seating: initial?.outdoor_seating || false,
    live_music: initial?.live_music || false,
    private_dining: initial?.private_dining || false,
    alcohol_served: initial?.alcohol_served || false,

    // Guide fields
    languages_spoken: initial?.languages_spoken || [],
    specialties: initial?.specialties || [],
    certifications: initial?.certifications || [],
    years_experience: initial?.years_experience || undefined,
    service_area: initial?.service_area || '',
    first_aid_certified: initial?.first_aid_certified || false,

    // Equipment rental fields
    insurance_required: initial?.insurance_required || false,
    delivery_available: initial?.delivery_available || false,
    maintenance_included: initial?.maintenance_included || false,
    training_provided: initial?.training_provided || false,
    cleaning_included: initial?.cleaning_included || false,
    repair_service: initial?.repair_service || false,

    // Event fields
  event_description: (initial as any)?.event_description || '',
  event_datetime: formatISOToDatetimeLocal(initial?.event_datetime || ''),
  registration_deadline: formatISOToDatetimeLocal(initial?.registration_deadline || ''),
    event_location: initial?.event_location || '',
    event_status: initial?.event_status || 'upcoming',
    event_type: initial?.event_type || '',
    event_highlights: initial?.event_highlights || [],
    event_inclusions: initial?.event_inclusions || [],
    event_prerequisites: initial?.event_prerequisites || [],
    certificates_provided: initial?.certificates_provided || false,
    refreshments_included: initial?.refreshments_included || false,
    take_home_materials: initial?.take_home_materials || false,
    photography_allowed: initial?.photography_allowed || false,
    recording_allowed: initial?.recording_allowed || false,
    group_discounts: initial?.group_discounts || false,
    // Ticketing defaults (internal ticketing enabled by default)
    internal_ticketing: (initial as any)?.internal_ticketing ?? true,
    ticket_types: ((initial as any)?.ticket_types || [
      { id: 'temp-ga', title: 'General Admission', description: '', price: initial?.ticket_price || 0, quantity: initial?.max_participants || 100 },
      { id: 'temp-vip', title: 'VIP', description: '', price: (initial?.ticket_price ? (initial.ticket_price * 2) : (initial?.ticket_price || 0)), quantity: 5 }
    ]).map((tt: any) => ({
      ...tt,
  sale_start: tt.sale_start || formatISOToDatetimeLocal(initial?.event_datetime || ''),
  sale_end: tt.sale_end || formatISOToDatetimeLocal(initial?.registration_deadline || '')
    })),

    // Travel agency fields
    customization_available: initial?.customization_available || false,
    emergency_support: initial?.emergency_support || false,
    visa_assistance: initial?.visa_assistance || false,
    group_bookings: initial?.group_bookings || false,
    corporate_accounts: initial?.corporate_accounts || false,
    insurance_brokerage: initial?.insurance_brokerage || false,

    // Flight fields
    flexible_booking: initial?.flexible_booking || false,
    lounge_access: initial?.lounge_access || false,
    priority_boarding: initial?.priority_boarding || false,
    flight_meals_included: initial?.flight_meals_included || false,

    // General fields
    tags: initial?.tags || [],
    contact_info: initial?.contact_info || {},
    booking_requirements: initial?.booking_requirements || '',
    cancellation_policy: initial?.cancellation_policy || ''
  })

  const [uploadingImage, setUploadingImage] = useState(false)
  const [arrayInputs, setArrayInputs] = useState<{[key: string]: string}>({})
  const [showMapModal, setShowMapModal] = useState(false)
  const [mapModalInitialCoords, setMapModalInitialCoords] = useState<{ lat: number; lon: number } | null>(null)

  const update = (k: keyof Service, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  // Ticket types form helpers
  const [ticketPreset, setTicketPreset] = useState<'general' | 'vip' | 'early_general' | 'early_vip' | 'free' | 'custom'>('general')

  const addTicketTypeToForm = () => {
    const current = (form.ticket_types || []) as any[]
    const tempId = `temp-${Date.now()}`
    const basePrice = Number(form.ticket_price || 0)
    const earlyPrice = Number(form.early_bird_price || basePrice)
    const maxParticipants = Number(form.max_participants || 100)

    let newTT: any = { id: tempId, title: 'New Ticket', description: '', price: 0, quantity: 1 }

    switch (ticketPreset) {
      case 'general':
        newTT = { id: tempId, title: 'General Admission', description: '', price: basePrice, quantity: Math.max(1, maxParticipants), sale_start: form.event_datetime || '', sale_end: form.registration_deadline || '' }
        break
      case 'vip':
        newTT = { id: tempId, title: 'VIP', description: '', price: Math.max(1, Math.round(basePrice * 2)), quantity: Math.min(Math.max(1, Math.round(maxParticipants * 0.1)), 50), sale_start: form.event_datetime || '', sale_end: form.registration_deadline || '' }
        break
      case 'early_general':
        newTT = { id: tempId, title: 'Early Bird - General', description: 'Early bird price', price: Math.max(0, earlyPrice), quantity: Math.min(Math.max(1, Math.round(maxParticipants * 0.2)), 100), metadata: { early_bird: true, early_bird_deadline: form.registration_deadline }, sale_start: form.event_datetime || '', sale_end: form.registration_deadline || '' }
        break
      case 'early_vip':
        newTT = { id: tempId, title: 'Early Bird - VIP', description: 'Early bird VIP', price: Math.max(0, Math.round((earlyPrice || basePrice) * 1.8)), quantity: Math.min(Math.max(1, Math.round(maxParticipants * 0.05)), 20), metadata: { early_bird: true, early_bird_deadline: form.registration_deadline }, sale_start: form.event_datetime || '', sale_end: form.registration_deadline || '' }
        break
      case 'free':
        newTT = { id: tempId, title: 'Free', description: 'Free admission', price: 0, quantity: Math.max(1, maxParticipants), metadata: { free: true }, sale_start: form.event_datetime || '', sale_end: form.registration_deadline || '' }
        break
      default:
        newTT = { id: tempId, title: 'New Ticket', description: '', price: basePrice || 0, quantity: 1, sale_start: '', sale_end: '' }
    }

    update('ticket_types', [...current, newTT])
  }

  const updateTicketTypeInForm = (index: number, key: string, value: any) => {
    const current = JSON.parse(JSON.stringify(form.ticket_types || [])) as any[]
    if (!current[index]) return
    current[index][key] = value
    update('ticket_types', current)
  }

  const removeTicketTypeFromForm = (index: number) => {
    const current = (form.ticket_types || []) as any[]
    update('ticket_types', current.filter((_, i) => i !== index))
  }

  const handleImageUpload = async (file: File) => {
    if (!vendorId) {
      alert('Vendor information not loaded. Please try again.')
      return
    }
    
    setUploadingImage(true)
    try {
      const result = await uploadServiceImage(file, initial?.id || 'temp', vendorId)
      if (result.success && result.url) {
        update('images', [...(form.images || []), result.url])
      } else {
        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeImage = async (index: number) => {
    const imageUrl = form.images?.[index]
    if (imageUrl) {
      try {
        // If this is an existing service, remove from both storage and database
        if (initial?.id) {
          const result = await removeServiceImage(initial.id, imageUrl)
          if (!result.success) {
            console.error('Failed to remove image from database:', result.error)
            // Still remove from local state even if database update fails
          }
        } else {
          // For new services, just delete from storage
          await deleteServiceImage(imageUrl)
        }
      } catch (error) {
        console.error('Failed to delete image:', error)
      }
    }
    update('images', (form.images || []).filter((_, i) => i !== index))
  }

  const addToArray = (field: keyof Service, value: string) => {
    if (!value.trim()) return
    const currentArray = (form[field] as string[]) || []
    update(field, [...currentArray, value.trim()])
    setArrayInputs(prev => ({ ...prev, [field]: '' }))
  }

  const removeFromArray = (field: keyof Service, index: number) => {
    const currentArray = (form[field] as string[]) || []
    update(field, currentArray.filter((_, i) => i !== index))
  }

  const renderCategorySpecificFields = () => {
    const selectedCategory = categories.find(cat => cat.id === form.category_id)
    const categoryName = selectedCategory?.name?.toLowerCase() || ''

    switch (categoryName) {
      case 'hotels':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Hotel Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Star Rating</label>
                <select value={form.star_rating || ''} onChange={(e) => update('star_rating', e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select rating</option>
                  <option value="1">1 Star - Budget</option>
                  <option value="2">2 Stars - Basic</option>
                  <option value="3">3 Stars - Standard</option>
                  <option value="4">4 Stars - Comfort</option>
                  <option value="5">5 Stars - Luxury</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Property Type</label>
                <select value={form.property_type || ''} onChange={(e) => update('property_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select property type</option>
                  <option value="boutique">Boutique Hotel</option>
                  <option value="resort">Resort</option>
                  <option value="business">Business Hotel</option>
                  <option value="apartment">Serviced Apartments</option>
                  <option value="lodge">Lodge</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Rooms</label>
                <input type="number" value={form.total_rooms || ''} onChange={(e) => update('total_rooms', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 50" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cancellation Policy</label>
                <select value={form.cancellation_policy || ''} onChange={(e) => update('cancellation_policy', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select policy</option>
                  <option value="free_24h">Free cancellation within 24 hours</option>
                  <option value="free_48h">Free cancellation within 48 hours</option>
                  <option value="free_7d">Free cancellation within 7 days</option>
                  <option value="no_refund">No refund</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Room Types Available</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.room_types || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, room_types: e.target.value }))}
                  placeholder="e.g., Deluxe Suite, Standard Room"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('room_types', arrayInputs.room_types || ''))}
                />
                <button type="button" onClick={() => addToArray('room_types', arrayInputs.room_types || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.room_types || []).map((room, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {room}
                    <button type="button" onClick={() => removeFromArray('room_types', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Hotel Facilities & Amenities</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.facilities || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, facilities: e.target.value }))}
                  placeholder="e.g., Swimming Pool, Restaurant, Spa"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('facilities', arrayInputs.facilities || ''))}
                />
                <button type="button" onClick={() => addToArray('facilities', arrayInputs.facilities || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.facilities || []).map((facility, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {facility}
                    <button type="button" onClick={() => removeFromArray('facilities', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input type="checkbox" checked={form.breakfast_included || false} onChange={(e) => update('breakfast_included', e.target.checked)} className="mr-2" />
                Breakfast included
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.wifi_available || false} onChange={(e) => update('wifi_available', e.target.checked)} className="mr-2" />
                Free WiFi
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.parking_available || false} onChange={(e) => update('parking_available', e.target.checked)} className="mr-2" />
                Parking available
              </label>
            </div>
          </div>
        )

      case 'tour packages':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Tour Package Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Difficulty Level</label>
                <select value={form.difficulty_level || ''} onChange={(e) => update('difficulty_level', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select difficulty</option>
                  <option value="easy">Easy - Suitable for all ages</option>
                  <option value="moderate">Moderate - Some physical activity</option>
                  <option value="challenging">Challenging - Good fitness required</option>
                  <option value="extreme">Extreme - Advanced fitness needed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Best Time to Visit</label>
                <input value={form.best_time_to_visit || ''} onChange={(e) => update('best_time_to_visit', e.target.value)} placeholder="e.g., June-September (Dry season)" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Age</label>
                <input type="number" value={form.minimum_age || ''} onChange={(e) => update('minimum_age', e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Maximum Participants</label>
                <input type="number" value={form.max_participants || ''} onChange={(e) => update('max_participants', e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Languages Offered</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.languages_offered || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, languages_offered: e.target.value }))}
                  placeholder="e.g., English, Swahili, French"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('languages_offered', arrayInputs.languages_offered || ''))}
                />
                <button type="button" onClick={() => addToArray('languages_offered', arrayInputs.languages_offered || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.languages_offered || []).map((lang, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    {lang}
                    <button type="button" onClick={() => removeFromArray('languages_offered', idx)} className="ml-1 text-purple-600 hover:text-purple-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Detailed Itinerary</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.itinerary || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, itinerary: e.target.value }))}
                  placeholder="e.g., Day 1: Kampala City Tour - Visit markets and cultural sites"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('itinerary', arrayInputs.itinerary || ''))}
                />
                <button type="button" onClick={() => addToArray('itinerary', arrayInputs.itinerary || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.itinerary || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('itinerary', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">What's Included</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.included_items || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, included_items: e.target.value }))}
                  placeholder="e.g., Accommodation, Meals, Transport, Guide"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('included_items', arrayInputs.included_items || ''))}
                />
                <button type="button" onClick={() => addToArray('included_items', arrayInputs.included_items || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.included_items || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('included_items', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">What's Excluded</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.excluded_items || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, excluded_items: e.target.value }))}
                  placeholder="e.g., International Flights, Personal Expenses, Travel Insurance"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('excluded_items', arrayInputs.excluded_items || ''))}
                />
                <button type="button" onClick={() => addToArray('excluded_items', arrayInputs.excluded_items || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.excluded_items || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('excluded_items', idx)} className="ml-1 text-red-600 hover:text-red-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Tour Highlights</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.tour_highlights || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, tour_highlights: e.target.value }))}
                  placeholder="e.g., Gorilla Trekking, Nile River Cruise, Cultural Dance Performance"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('tour_highlights', arrayInputs.tour_highlights || ''))}
                />
                <button type="button" onClick={() => addToArray('tour_highlights', arrayInputs.tour_highlights || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.tour_highlights || []).map((highlight, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    {highlight}
                    <button type="button" onClick={() => removeFromArray('tour_highlights', idx)} className="ml-1 text-yellow-600 hover:text-yellow-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">What to Bring</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.what_to_bring || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, what_to_bring: e.target.value }))}
                  placeholder="e.g., Comfortable walking shoes, Sun hat, Insect repellent"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('what_to_bring', arrayInputs.what_to_bring || ''))}
                />
                <button type="button" onClick={() => addToArray('what_to_bring', arrayInputs.what_to_bring || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.what_to_bring || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('what_to_bring', idx)} className="ml-1 text-indigo-600 hover:text-indigo-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Meeting Point</label>
                <input value={form.meeting_point || ''} onChange={(e) => update('meeting_point', e.target.value)} placeholder="e.g., Hotel lobby, Airport" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Point</label>
                <input value={form.end_point || ''} onChange={(e) => update('end_point', e.target.value)} placeholder="e.g., Same as meeting point" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input type="checkbox" checked={form.transportation_included || false} onChange={(e) => update('transportation_included', e.target.checked)} className="mr-2" />
                Transportation included
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.guide_included || false} onChange={(e) => update('guide_included', e.target.checked)} className="mr-2" />
                Professional guide included
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.accommodation_included || false} onChange={(e) => update('accommodation_included', e.target.checked)} className="mr-2" />
                Accommodation included
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Meals Included</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.meals_included || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, meals_included: e.target.value }))}
                  placeholder="e.g., Breakfast, Lunch, Dinner, Snacks"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('meals_included', arrayInputs.meals_included || ''))}
                />
                <button type="button" onClick={() => addToArray('meals_included', arrayInputs.meals_included || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.meals_included || []).map((meal, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                    {meal}
                    <button type="button" onClick={() => removeFromArray('meals_included', idx)} className="ml-1 text-orange-600 hover:text-orange-800">×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )

      case 'transport':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Transport Service Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Vehicle Type</label>
                <select value={form.vehicle_type || ''} onChange={(e) => update('vehicle_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
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
                <label className="block text-sm font-medium text-gray-700">Vehicle Capacity</label>
                <input type="number" value={form.vehicle_capacity || ''} onChange={(e) => update('vehicle_capacity', e.target.value ? Number(e.target.value) : undefined)} placeholder="Number of passengers" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">License Requirements</label>
                <select value={form.license_required || ''} onChange={(e) => update('license_required', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select license type</option>
                  <option value="none">No license required</option>
                  <option value="car">Car license</option>
                  <option value="motorcycle">Motorcycle license</option>
                  <option value="boat">Boat license</option>
                  <option value="commercial">Commercial license</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Booking Notice Period (hours)</label>
                <input type="number" value={form.booking_notice_hours || ''} onChange={(e) => update('booking_notice_hours', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 24" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Vehicle Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.air_conditioning || false} onChange={(e) => update('air_conditioning', e.target.checked)} className="mr-2" />
                  Air Conditioning
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.gps_tracking || false} onChange={(e) => update('gps_tracking', e.target.checked)} className="mr-2" />
                  GPS Tracking
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.wifi_available || false} onChange={(e) => update('wifi_available', e.target.checked)} className="mr-2" />
                  WiFi Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.usb_charging || false} onChange={(e) => update('usb_charging', e.target.checked)} className="mr-2" />
                  USB Charging
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.child_seat || false} onChange={(e) => update('child_seat', e.target.checked)} className="mr-2" />
                  Child Seat Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.roof_rack || false} onChange={(e) => update('roof_rack', e.target.checked)} className="mr-2" />
                  Roof Rack
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.towing_capacity || false} onChange={(e) => update('towing_capacity', e.target.checked)} className="mr-2" />
                  Towing Capacity
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.four_wheel_drive || false} onChange={(e) => update('four_wheel_drive', e.target.checked)} className="mr-2" />
                  4WD
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.automatic_transmission || false} onChange={(e) => update('automatic_transmission', e.target.checked)} className="mr-2" />
                  Automatic Transmission
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Pickup Locations</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.pickup_locations || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, pickup_locations: e.target.value }))}
                  placeholder="e.g., Entebbe Airport, Kampala City Center"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('pickup_locations', arrayInputs.pickup_locations || ''))}
                />
                <button type="button" onClick={() => addToArray('pickup_locations', arrayInputs.pickup_locations || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.pickup_locations || []).map((location, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {location}
                    <button type="button" onClick={() => removeFromArray('pickup_locations', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Drop-off Locations</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.dropoff_locations || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, dropoff_locations: e.target.value }))}
                  placeholder="e.g., Queen Elizabeth National Park, Bwindi Forest"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('dropoff_locations', arrayInputs.dropoff_locations || ''))}
                />
                <button type="button" onClick={() => addToArray('dropoff_locations', arrayInputs.dropoff_locations || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.dropoff_locations || []).map((location, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {location}
                    <button type="button" onClick={() => removeFromArray('dropoff_locations', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Route Description</label>
              <textarea value={form.route_description || ''} onChange={(e) => update('route_description', e.target.value)} placeholder="Describe the route, stops, and any notable points along the way" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Fuel Included</label>
                <select value={form.fuel_included ? 'yes' : 'no'} onChange={(e) => update('fuel_included', e.target.value === 'yes')} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="no">No - Client pays for fuel</option>
                  <option value="yes">Yes - Fuel included in price</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tolls Included</label>
                <select value={form.tolls_included ? 'yes' : 'no'} onChange={(e) => update('tolls_included', e.target.value === 'yes')} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="no">No - Client pays tolls</option>
                  <option value="yes">Yes - Tolls included in price</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Insurance Included</label>
                <select value={form.insurance_included ? 'yes' : 'no'} onChange={(e) => update('insurance_included', e.target.value === 'yes')} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="no">No - Client provides insurance</option>
                  <option value="yes">Yes - Insurance included</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Driver Included</label>
                <select value={form.driver_included ? 'yes' : 'no'} onChange={(e) => update('driver_included', e.target.value === 'yes')} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="no">Self-drive available</option>
                  <option value="yes">Driver included</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Vehicle Photos Required</label>
              <div className="mt-2 text-sm text-gray-600">
                Please upload clear photos of your vehicle from multiple angles, including interior and exterior.
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Additional Terms & Conditions</label>
              <textarea value={form.transport_terms || ''} onChange={(e) => update('transport_terms', e.target.value)} placeholder="Any additional terms, restrictions, or requirements for transport services" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      case 'restaurants':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Restaurant Service Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Cuisine Type</label>
                <select value={form.cuisine_type || ''} onChange={(e) => update('cuisine_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select cuisine type</option>
                  <option value="ugandan">Ugandan</option>
                  <option value="african">African</option>
                  <option value="italian">Italian</option>
                  <option value="french">French</option>
                  <option value="chinese">Chinese</option>
                  <option value="indian">Indian</option>
                  <option value="japanese">Japanese</option>
                  <option value="mexican">Mexican</option>
                  <option value="american">American</option>
                  <option value="fusion">Fusion</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Price Range</label>
                <select value={form.price_range || ''} onChange={(e) => update('price_range', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select price range</option>
                  <option value="budget">Budget (Under $15/person)</option>
                  <option value="moderate">Moderate ($15-30/person)</option>
                  <option value="upscale">Upscale ($30-60/person)</option>
                  <option value="fine_dining">Fine Dining (Over $60/person)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Reservations Required</label>
                <select value={form.reservations_required ? 'yes' : 'no'} onChange={(e) => update('reservations_required', e.target.value === 'yes')} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="no">No - Walk-ins welcome</option>
                  <option value="yes">Yes - Reservations recommended</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Advance Booking (days)</label>
                <input type="number" value={form.advance_booking_days || ''} onChange={(e) => update('advance_booking_days', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 1" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Opening Hours</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600">Monday - Friday</label>
                  <input
                    type="text"
                    placeholder="9:00 AM - 10:00 PM"
                    value={(form.opening_hours as any)?.weekdays || ''}
                    onChange={(e) => update('opening_hours', { ...form.opening_hours, weekdays: e.target.value })}
                    className="mt-1 w-full border rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Saturday - Sunday</label>
                  <input
                    type="text"
                    placeholder="10:00 AM - 11:00 PM"
                    value={(form.opening_hours as any)?.weekends || ''}
                    onChange={(e) => update('opening_hours', { ...form.opening_hours, weekends: e.target.value })}
                    className="mt-1 w-full border rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Dress Code</label>
              <select value={form.dress_code || ''} onChange={(e) => update('dress_code', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                <option value="">Select dress code</option>
                <option value="casual">Casual</option>
                <option value="smart_casual">Smart Casual</option>
                <option value="business_casual">Business Casual</option>
                <option value="formal">Formal</option>
                <option value="none">No dress code</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Dietary Options</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.dietary_options || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, dietary_options: e.target.value }))}
                  placeholder="e.g., Vegetarian, Vegan, Halal, Gluten-free"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('dietary_options', arrayInputs.dietary_options || ''))}
                />
                <button type="button" onClick={() => addToArray('dietary_options', arrayInputs.dietary_options || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.dietary_options || []).map((option, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                    {option}
                    <button type="button" onClick={() => removeFromArray('dietary_options', idx)} className="ml-1 text-orange-600 hover:text-orange-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Special Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.outdoor_seating || false} onChange={(e) => update('outdoor_seating', e.target.checked)} className="mr-2" />
                  Outdoor Seating
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.live_music || false} onChange={(e) => update('live_music', e.target.checked)} className="mr-2" />
                  Live Music
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.private_dining || false} onChange={(e) => update('private_dining', e.target.checked)} className="mr-2" />
                  Private Dining
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.alcohol_served || false} onChange={(e) => update('alcohol_served', e.target.checked)} className="mr-2" />
                  Alcohol Served
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.wifi_available || false} onChange={(e) => update('wifi_available', e.target.checked)} className="mr-2" />
                  WiFi Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.parking_available || false} onChange={(e) => update('parking_available', e.target.checked)} className="mr-2" />
                  Parking Available
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Menu Highlights</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.menu_highlights || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, menu_highlights: e.target.value }))}
                  placeholder="e.g., Grilled Tilapia, Matoke, Rolex"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('menu_highlights', arrayInputs.menu_highlights || ''))}
                />
                <button type="button" onClick={() => addToArray('menu_highlights', arrayInputs.menu_highlights || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.menu_highlights || []).map((highlight, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {highlight}
                    <button type="button" onClick={() => removeFromArray('menu_highlights', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Atmosphere & Experience</label>
              <textarea value={form.restaurant_atmosphere || ''} onChange={(e) => update('restaurant_atmosphere', e.target.value)} placeholder="Describe the ambiance, decor, and overall dining experience" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Special Notes</label>
              <textarea value={form.restaurant_notes || ''} onChange={(e) => update('restaurant_notes', e.target.value)} placeholder="Any additional information tourists should know (e.g., best time to visit, local specialties, etc.)" rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      case 'activities':
        return (
          <div className="space-y-6 border-t pt-6">
            <h4 className="font-semibold text-slate-900 text-lg">Event & Activity Details</h4>

            {/* Basic Event Information */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Basic Information</h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Event Type</label>
                  <select value={form.event_type || ''} onChange={(e) => update('event_type', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
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
                  <label className="block text-sm font-medium text-slate-700">
                    Event Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.event_datetime || ''}
                    onChange={(e) => update('event_datetime', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Event Location <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={form.event_location || ''}
                    onChange={(e) => update('event_location', e.target.value)}
                    placeholder="Specific venue or meeting point"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if ((form as any).event_lat && (form as any).event_lon) {
                        // If coordinates exist, open in view/edit mode
                        setMapModalInitialCoords({ lat: (form as any).event_lat, lon: (form as any).event_lon })
                      } else {
                        // If no coordinates, open in selection mode
                        setMapModalInitialCoords(null)
                      }
                      setShowMapModal(true)
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors border border-blue-600"
                  >
                    <Map size={16} />
                    {(form as any).event_lat && (form as any).event_lon ? 'Edit Location' : 'Select on Map'}
                  </button>
                </div>
              </div>
            </div>

            {/* Capacity & Requirements */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Capacity & Requirements</h5>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Maximum Participants</label>
                  <input
                    type="number"
                    value={form.max_participants || ''}
                    onChange={(e) => update('max_participants', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g., 50"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Minimum Age</label>
                  <input
                    type="number"
                    value={form.minimum_age || ''}
                    onChange={(e) => update('minimum_age', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g., 8"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Registration Deadline</label>
                  <input
                    type="datetime-local"
                    value={form.registration_deadline || ''}
                    onChange={(e) => update('registration_deadline', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Ticketing & Pricing */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Ticketing & Pricing</h5>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={(form as any).internal_ticketing || false}
                    onChange={(e) => update('internal_ticketing', e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-slate-700">Enable internal ticketing</span>
                </label>

                {(form as any).internal_ticketing && (
                  <div className="space-y-3">
                    {/* Ticket types list */}
                    {(form as any).ticket_types?.map((tt: any, idx: number) => (
                      <div key={tt.id || idx} className="p-4 border border-slate-200 rounded-lg bg-white">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                            <input
                              className="w-full border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              value={tt.title || ''}
                              onChange={(e) => updateTicketTypeInForm(idx, 'title', e.target.value)}
                              placeholder="e.g., General Admission"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Price (UGX)</label>
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                type="number"
                                value={(Boolean(tt?.metadata?.free) || ((tt.title || '').toLowerCase().includes('free'))) ? 0 : (tt.price ?? '')}
                                onChange={(e) => {
                                  if (Boolean(tt?.metadata?.free) || ((tt.title || '').toLowerCase().includes('free'))) return
                                  updateTicketTypeInForm(idx, 'price', e.target.value === '' ? '' : Number(e.target.value))
                                }}
                                placeholder="Price"
                                disabled={Boolean(tt?.metadata?.free) || ((tt.title || '').toLowerCase().includes('free'))}
                              />
                              {(Boolean(tt?.metadata?.free) || ((tt.title || '').toLowerCase().includes('free'))) && <div className="text-xs text-green-700 font-medium">Free — price locked</div>}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Available Tickets</label>
                            <input
                              className="w-full border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              type="number"
                              value={tt.quantity ?? ''}
                              onChange={(e) => updateTicketTypeInForm(idx, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Ticket count"
                            />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
                          <input
                            className="w-full border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={tt.description || ''}
                            onChange={(e) => updateTicketTypeInForm(idx, 'description', e.target.value)}
                            placeholder="Description (optional)"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Sale starts</label>
                            <input
                              className="w-full border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              type="datetime-local"
                              value={tt.sale_start || ''}
                              onChange={(e) => updateTicketTypeInForm(idx, 'sale_start', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Sale ends (deadline)</label>
                            <input
                              className="w-full border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              type="datetime-local"
                              value={tt.sale_end || ''}
                              onChange={(e) => updateTicketTypeInForm(idx, 'sale_end', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeTicketTypeFromForm(idx)}
                            className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center gap-3 pt-2">
                      <select
                        value={ticketPreset}
                        onChange={(e) => setTicketPreset(e.target.value as any)}
                        className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="general">General</option>
                        <option value="vip">VIP</option>
                        <option value="free">Free</option>
                        <option value="early_general">Early Bird - General</option>
                        <option value="early_vip">Early Bird - VIP</option>
                        <option value="custom">Custom</option>
                      </select>
                      <button
                        type="button"
                        onClick={addTicketTypeToForm}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={16} /> Add Ticket Type
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Event Details */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Event Details</h5>

              <div>
                <label className="block text-sm font-medium text-slate-700">Event Highlights</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={arrayInputs.event_highlights || ''}
                    onChange={(e) => setArrayInputs(prev => ({ ...prev, event_highlights: e.target.value }))}
                    placeholder="e.g., Live music performance, Traditional dance, Wildlife viewing, Cultural demonstrations"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('event_highlights', arrayInputs.event_highlights || ''))}
                  />
                  <button
                    type="button"
                    onClick={() => addToArray('event_highlights', arrayInputs.event_highlights || '')}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.event_highlights || []).map((highlight, idx) => (
                    <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-800 font-medium">
                      {highlight}
                      <button
                        type="button"
                        onClick={() => removeFromArray('event_highlights', idx)}
                        className="ml-2 text-green-600 hover:text-green-800 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">What's Included</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={arrayInputs.event_inclusions || ''}
                    onChange={(e) => setArrayInputs(prev => ({ ...prev, event_inclusions: e.target.value }))}
                    placeholder="e.g., Entry ticket, Refreshments, Transportation, Guide, Equipment"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('event_inclusions', arrayInputs.event_inclusions || ''))}
                  />
                  <button
                    type="button"
                    onClick={() => addToArray('event_inclusions', arrayInputs.event_inclusions || '')}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.event_inclusions || []).map((inclusion, idx) => (
                    <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">
                      {inclusion}
                      <button
                        type="button"
                        onClick={() => removeFromArray('event_inclusions', idx)}
                        className="ml-2 text-blue-600 hover:text-blue-800 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Prerequisites</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={arrayInputs.event_prerequisites || ''}
                    onChange={(e) => setArrayInputs(prev => ({ ...prev, event_prerequisites: e.target.value }))}
                    placeholder="e.g., Valid ID, Medical certificate, Fitness level, Age restrictions"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('event_prerequisites', arrayInputs.event_prerequisites || ''))}
                  />
                  <button
                    type="button"
                    onClick={() => addToArray('event_prerequisites', arrayInputs.event_prerequisites || '')}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.event_prerequisites || []).map((prereq, idx) => (
                    <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-red-100 text-red-800 font-medium">
                      {prereq}
                      <button
                        type="button"
                        onClick={() => removeFromArray('event_prerequisites', idx)}
                        className="ml-2 text-red-600 hover:text-red-800 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Event Features */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Event Features</h5>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.group_discounts || false}
                      onChange={(e) => update('group_discounts', e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Group Discounts</span>
                  </label>
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.photography_allowed || false}
                      onChange={(e) => update('photography_allowed', e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Photography Allowed</span>
                  </label>
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.recording_allowed || false}
                      onChange={(e) => update('recording_allowed', e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Recording Allowed</span>
                  </label>
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.transportation_included || false}
                      onChange={(e) => update('transportation_included', e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Transportation Included</span>
                  </label>
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form.meals_included && form.meals_included.length > 0)}
                      onChange={(e) => {
                        if (e.target.checked && (!form.meals_included || form.meals_included.length === 0)) {
                          update('meals_included', ['Meals included']);
                        } else if (!e.target.checked) {
                          update('meals_included', []);
                        }
                      }}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Meals Included</span>
                  </label>
                  <label className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.certificates_provided || false}
                      onChange={(e) => update('certificates_provided', e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">Certificates Provided</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Policies */}
            <div className="space-y-4">
              <h5 className="font-medium text-slate-800 text-sm uppercase tracking-wide">Policies</h5>

              <div>
                <label className="block text-sm font-medium text-slate-700">Cancellation Policy</label>
                <textarea
                  value={form.event_cancellation_policy || ''}
                  onChange={(e) => update('event_cancellation_policy', e.target.value)}
                  placeholder="Refund policy and cancellation terms for the event"
                  rows={3}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          </div>
        )

      case 'equipment rental':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Equipment Rental Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Rental Duration</label>
                <select value={form.rental_duration || ''} onChange={(e) => update('rental_duration', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select duration</option>
                  <option value="hourly">Hourly</option>
                  <option value="half_day">Half Day (4 hours)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom Duration</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Security Deposit (UGX)</label>
                <input type="number" value={form.deposit_required || ''} onChange={(e) => update('deposit_required', e.target.value ? Number(e.target.value) : undefined)} placeholder="Amount held as security" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Replacement Value (UGX)</label>
                <input type="number" value={form.replacement_value || ''} onChange={(e) => update('replacement_value', e.target.value ? Number(e.target.value) : undefined)} placeholder="Value for replacement if damaged" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Delivery Radius (km)</label>
                <input type="number" value={form.delivery_radius || ''} onChange={(e) => update('delivery_radius', e.target.value ? Number(e.target.value) : undefined)} placeholder="How far you deliver" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Rental Items</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.rental_items || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, rental_items: e.target.value }))}
                  placeholder="e.g., Mountain Bike, Camping Tent, Kayak, Hiking Boots"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('rental_items', arrayInputs.rental_items || ''))}
                />
                <button type="button" onClick={() => addToArray('rental_items', arrayInputs.rental_items || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.rental_items || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('rental_items', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Usage Instructions</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.usage_instructions || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, usage_instructions: e.target.value }))}
                  placeholder="e.g., Always wear helmet, Check brakes before use, Return with full fuel tank"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('usage_instructions', arrayInputs.usage_instructions || ''))}
                />
                <button type="button" onClick={() => addToArray('usage_instructions', arrayInputs.usage_instructions || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.usage_instructions || []).map((instruction, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    {instruction}
                    <button type="button" onClick={() => removeFromArray('usage_instructions', idx)} className="ml-1 text-yellow-600 hover:text-yellow-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Maintenance Requirements</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.maintenance_requirements || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, maintenance_requirements: e.target.value }))}
                  placeholder="e.g., Clean after use, Check tire pressure, Report any damage immediately"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('maintenance_requirements', arrayInputs.maintenance_requirements || ''))}
                />
                <button type="button" onClick={() => addToArray('maintenance_requirements', arrayInputs.maintenance_requirements || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.maintenance_requirements || []).map((req, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                    {req}
                    <button type="button" onClick={() => removeFromArray('maintenance_requirements', idx)} className="ml-1 text-red-600 hover:text-red-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Rental Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.insurance_required || false} onChange={(e) => update('insurance_required', e.target.checked)} className="mr-2" />
                  Insurance Required
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.delivery_available || false} onChange={(e) => update('delivery_available', e.target.checked)} className="mr-2" />
                  Delivery Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.maintenance_included || false} onChange={(e) => update('maintenance_included', e.target.checked)} className="mr-2" />
                  Maintenance Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.training_provided || false} onChange={(e) => update('training_provided', e.target.checked)} className="mr-2" />
                  Training Provided
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.cleaning_included || false} onChange={(e) => update('cleaning_included', e.target.checked)} className="mr-2" />
                  Cleaning Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.repair_service || false} onChange={(e) => update('repair_service', e.target.checked)} className="mr-2" />
                  Repair Service Available
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Age Requirement</label>
                <input type="number" value={form.minimum_age || ''} onChange={(e) => update('minimum_age', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 18" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">License Requirements</label>
                <select value={form.license_required || ''} onChange={(e) => update('license_required', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select license type</option>
                  <option value="none">No license required</option>
                  <option value="car">Car license</option>
                  <option value="motorcycle">Motorcycle license</option>
                  <option value="boat">Boat license</option>
                  <option value="specialized">Specialized license</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Equipment Condition</label>
              <textarea value={form.equipment_condition || ''} onChange={(e) => update('equipment_condition', e.target.value)} placeholder="Describe the condition of equipment, age, maintenance history, etc." rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Rental Terms & Conditions</label>
              <textarea value={form.rental_terms || ''} onChange={(e) => update('rental_terms', e.target.value)} placeholder="Late fees, damage policy, cancellation terms, etc." rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      case 'events & workshops':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Events & Workshops Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Event Type</label>
                <select value={form.event_type || ''} onChange={(e) => update('event_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select event type</option>
                  <option value="workshop">Workshop</option>
                  <option value="cultural_show">Cultural Show</option>
                  <option value="cooking_class">Cooking Class</option>
                  <option value="art_class">Art Class</option>
                  <option value="music_lesson">Music Lesson</option>
                  <option value="dance_class">Dance Class</option>
                  <option value="language_class">Language Class</option>
                  <option value="photography_workshop">Photography Workshop</option>
                  <option value="craft_workshop">Craft Workshop</option>
                  <option value="business_seminar">Business Seminar</option>
                  <option value="wellness_retreat">Wellness Retreat</option>
                  <option value="other">Other Event</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Event Date & Time</label>
                <input type="datetime-local" value={form.event_datetime || ''} onChange={(e) => update('event_datetime', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Duration (hours)</label>
                <input type="number" value={form.event_duration_hours || ''} onChange={(e) => update('event_duration_hours', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 3" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Maximum Participants</label>
                <input type="number" value={form.max_participants || ''} onChange={(e) => update('max_participants', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 20" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Registration Deadline</label>
                <input type="datetime-local" value={form.registration_deadline || ''} onChange={(e) => update('registration_deadline', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Age</label>
                <input type="number" value={form.minimum_age || ''} onChange={(e) => update('minimum_age', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 16" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Prerequisites</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.prerequisites || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, prerequisites: e.target.value }))}
                  placeholder="e.g., Bring your own notebook, Basic photography skills required, Comfortable clothing"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('prerequisites', arrayInputs.prerequisites || ''))}
                />
                <button type="button" onClick={() => addToArray('prerequisites', arrayInputs.prerequisites || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.prerequisites || []).map((prereq, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                    {prereq}
                    <button type="button" onClick={() => removeFromArray('prerequisites', idx)} className="ml-1 text-orange-600 hover:text-orange-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">What to Bring</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.what_to_bring || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, what_to_bring: e.target.value }))}
                  placeholder="e.g., Notebook and pen, Camera, Comfortable shoes, Water bottle"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('what_to_bring', arrayInputs.what_to_bring || ''))}
                />
                <button type="button" onClick={() => addToArray('what_to_bring', arrayInputs.what_to_bring || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.what_to_bring || []).map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {item}
                    <button type="button" onClick={() => removeFromArray('what_to_bring', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Materials Included</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.materials_included || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, materials_included: e.target.value }))}
                  placeholder="e.g., Handouts, Art supplies, Cooking ingredients, Equipment"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('materials_included', arrayInputs.materials_included || ''))}
                />
                <button type="button" onClick={() => addToArray('materials_included', arrayInputs.materials_included || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.materials_included || []).map((material, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    {material}
                    <button type="button" onClick={() => removeFromArray('materials_included', idx)} className="ml-1 text-purple-600 hover:text-purple-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Learning Outcomes</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.learning_outcomes || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, learning_outcomes: e.target.value }))}
                  placeholder="e.g., Learn basic cooking techniques, Understand local culture, Master photography basics"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('learning_outcomes', arrayInputs.learning_outcomes || ''))}
                />
                <button type="button" onClick={() => addToArray('learning_outcomes', arrayInputs.learning_outcomes || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.learning_outcomes || []).map((outcome, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {outcome}
                    <button type="button" onClick={() => removeFromArray('learning_outcomes', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Instructor Credentials</label>
              <textarea value={form.instructor_credentials || ''} onChange={(e) => update('instructor_credentials', e.target.value)} placeholder="Qualifications, experience, certifications of the instructor(s)" rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Event Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.certificates_provided || false} onChange={(e) => update('certificates_provided', e.target.checked)} className="mr-2" />
                  Certificates Provided
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.refreshments_included || false} onChange={(e) => update('refreshments_included', e.target.checked)} className="mr-2" />
                  Refreshments Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.take_home_materials || false} onChange={(e) => update('take_home_materials', e.target.checked)} className="mr-2" />
                  Take-Home Materials
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.photography_allowed || false} onChange={(e) => update('photography_allowed', e.target.checked)} className="mr-2" />
                  Photography Allowed
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.recording_allowed || false} onChange={(e) => update('recording_allowed', e.target.checked)} className="mr-2" />
                  Recording Allowed
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.group_discounts || false} onChange={(e) => update('group_discounts', e.target.checked)} className="mr-2" />
                  Group Discounts Available
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Event Description</label>
              <textarea value={form.event_description || ''} onChange={(e) => update('event_description', e.target.value)} placeholder="Detailed description of the event, what participants will experience, and any special highlights" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Cancellation Policy</label>
              <textarea value={form.event_cancellation_policy || ''} onChange={(e) => update('event_cancellation_policy', e.target.value)} placeholder="Refund policy, cancellation deadlines, and terms" rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      case 'travel agencies':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Travel Agency Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Years of Experience</label>
                <input type="number" value={form.years_experience || ''} onChange={(e) => update('years_experience', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 10" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Booking Fee (UGX)</label>
                <input type="number" value={form.booking_fee || ''} onChange={(e) => update('booking_fee', e.target.value ? Number(e.target.value) : undefined)} placeholder="Service fee per booking" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">License Number</label>
                <input value={form.license_number || ''} onChange={(e) => update('license_number', e.target.value)} placeholder="Tourism license number" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">IATA Number (if applicable)</label>
                <input value={form.iata_number || ''} onChange={(e) => update('iata_number', e.target.value)} placeholder="International Air Transport Association number" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Certifications</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.certifications || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, certifications: e.target.value }))}
                  placeholder="e.g., UTA Certified, IATA Certified, Sustainable Tourism Certified"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('certifications', arrayInputs.certifications || ''))}
                />
                <button type="button" onClick={() => addToArray('certifications', arrayInputs.certifications || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.certifications || []).map((cert, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {cert}
                    <button type="button" onClick={() => removeFromArray('certifications', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Specializations</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.specializations || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, specializations: e.target.value }))}
                  placeholder="e.g., Adventure Travel, Cultural Tours, Wildlife Safaris, Luxury Travel"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('specializations', arrayInputs.specializations || ''))}
                />
                <button type="button" onClick={() => addToArray('specializations', arrayInputs.specializations || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.specializations || []).map((spec, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    {spec}
                    <button type="button" onClick={() => removeFromArray('specializations', idx)} className="ml-1 text-purple-600 hover:text-purple-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Services Offered</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.services_offered || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, services_offered: e.target.value }))}
                  placeholder="e.g., Tour Planning, Hotel Booking, Flight Reservations, Visa Assistance"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('services_offered', arrayInputs.services_offered || ''))}
                />
                <button type="button" onClick={() => addToArray('services_offered', arrayInputs.services_offered || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.services_offered || []).map((service, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-800">
                    {service}
                    <button type="button" onClick={() => removeFromArray('services_offered', idx)} className="ml-1 text-indigo-600 hover:text-indigo-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Destinations Covered</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.destinations_covered || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, destinations_covered: e.target.value }))}
                  placeholder="e.g., Kampala, Queen Elizabeth National Park, Bwindi Forest, Jinja"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('destinations_covered', arrayInputs.destinations_covered || ''))}
                />
                <button type="button" onClick={() => addToArray('destinations_covered', arrayInputs.destinations_covered || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.destinations_covered || []).map((destination, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {destination}
                    <button type="button" onClick={() => removeFromArray('destinations_covered', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Success Stories</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.success_stories || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, success_stories: e.target.value }))}
                  placeholder="e.g., Successfully organized 500+ gorilla trekking tours, 98% client satisfaction rate"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('success_stories', arrayInputs.success_stories || ''))}
                />
                <button type="button" onClick={() => addToArray('success_stories', arrayInputs.success_stories || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.success_stories || []).map((story, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    {story}
                    <button type="button" onClick={() => removeFromArray('success_stories', idx)} className="ml-1 text-yellow-600 hover:text-yellow-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Agency Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.customization_available || false} onChange={(e) => update('customization_available', e.target.checked)} className="mr-2" />
                  Customization Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.emergency_support || false} onChange={(e) => update('emergency_support', e.target.checked)} className="mr-2" />
                  24/7 Emergency Support
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.insurance_brokerage || false} onChange={(e) => update('insurance_brokerage', e.target.checked)} className="mr-2" />
                  Travel Insurance Brokerage
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.visa_assistance || false} onChange={(e) => update('visa_assistance', e.target.checked)} className="mr-2" />
                  Visa Assistance
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.group_bookings || false} onChange={(e) => update('group_bookings', e.target.checked)} className="mr-2" />
                  Group Bookings
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.corporate_accounts || false} onChange={(e) => update('corporate_accounts', e.target.checked)} className="mr-2" />
                  Corporate Accounts
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Agency Description</label>
              <textarea value={form.agency_description || ''} onChange={(e) => update('agency_description', e.target.value)} placeholder="Tell tourists about your agency's story, mission, and what makes you unique" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Information</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input value={form.emergency_phone || ''} onChange={(e) => update('emergency_phone', e.target.value)} placeholder="Emergency contact phone" className="mt-1 w-full border rounded-md px-3 py-2" />
                <input value={form.website_url || ''} onChange={(e) => update('website_url', e.target.value)} placeholder="Website URL" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </div>
        )

      case 'hostels & guesthouses':
      case 'homestays':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Accommodation Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Property Type</label>
                <select value={form.property_type || ''} onChange={(e) => update('property_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select property type</option>
                  <option value="hostel">Hostel</option>
                  <option value="guesthouse">Guesthouse</option>
                  <option value="homestay">Homestay</option>
                  <option value="boutique_hotel">Boutique Hotel</option>
                  <option value="lodge">Lodge</option>
                  <option value="resort">Resort</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Rooms</label>
                <input type="number" value={form.total_rooms || ''} onChange={(e) => update('total_rooms', e.target.value ? Number(e.target.value) : undefined)} placeholder="Number of rooms available" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Check-in Time</label>
                <input type="time" value={form.check_in_time || ''} onChange={(e) => update('check_in_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Check-out Time</label>
                <input type="time" value={form.check_out_time || ''} onChange={(e) => update('check_out_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Stay (nights)</label>
                <input type="number" value={form.minimum_stay || ''} onChange={(e) => update('minimum_stay', e.target.value ? Number(e.target.value) : undefined)} placeholder="Minimum nights required" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Maximum Guests</label>
                <input type="number" value={form.maximum_guests || ''} onChange={(e) => update('maximum_guests', e.target.value ? Number(e.target.value) : undefined)} placeholder="Maximum number of guests" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Room Types Available</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.room_types || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, room_types: e.target.value }))}
                  placeholder="e.g., Single Room, Double Room, Dormitory, Family Suite"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('room_types', arrayInputs.room_types || ''))}
                />
                <button type="button" onClick={() => addToArray('room_types', arrayInputs.room_types || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.room_types || []).map((type, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    {type}
                    <button type="button" onClick={() => removeFromArray('room_types', idx)} className="ml-1 text-purple-600 hover:text-purple-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Room Amenities</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.room_amenities || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, room_amenities: e.target.value }))}
                  placeholder="e.g., WiFi, Air Conditioning, Hot Water, Mosquito Nets, Towels"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('room_amenities', arrayInputs.room_amenities || ''))}
                />
                <button type="button" onClick={() => addToArray('room_amenities', arrayInputs.room_amenities || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.room_amenities || []).map((amenity, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {amenity}
                    <button type="button" onClick={() => removeFromArray('room_amenities', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Common Area Facilities</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.common_facilities || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, common_facilities: e.target.value }))}
                  placeholder="e.g., Restaurant, Bar, Garden, Swimming Pool, Laundry Service"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('common_facilities', arrayInputs.common_facilities || ''))}
                />
                <button type="button" onClick={() => addToArray('common_facilities', arrayInputs.common_facilities || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.common_facilities || []).map((facility, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-800">
                    {facility}
                    <button type="button" onClick={() => removeFromArray('common_facilities', idx)} className="ml-1 text-indigo-600 hover:text-indigo-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Property Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.parking_available || false} onChange={(e) => update('parking_available', e.target.checked)} className="mr-2" />
                  Parking Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.pet_friendly || false} onChange={(e) => update('pet_friendly', e.target.checked)} className="mr-2" />
                  Pet Friendly
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.breakfast_included || false} onChange={(e) => update('breakfast_included', e.target.checked)} className="mr-2" />
                  Breakfast Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.wifi_available || false} onChange={(e) => update('wifi_available', e.target.checked)} className="mr-2" />
                  WiFi Available
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.generator_backup || false} onChange={(e) => update('generator_backup', e.target.checked)} className="mr-2" />
                  Generator Backup
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.smoking_allowed || false} onChange={(e) => update('smoking_allowed', e.target.checked)} className="mr-2" />
                  Smoking Allowed
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.children_allowed || false} onChange={(e) => update('children_allowed', e.target.checked)} className="mr-2" />
                  Children Allowed
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.disabled_access || false} onChange={(e) => update('disabled_access', e.target.checked)} className="mr-2" />
                  Disabled Access
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.concierge_service || false} onChange={(e) => update('concierge_service', e.target.checked)} className="mr-2" />
                  Concierge Service
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">House Rules</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.house_rules || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, house_rules: e.target.value }))}
                  placeholder="e.g., No loud music after 10 PM, Respect quiet hours, No cooking in rooms"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('house_rules', arrayInputs.house_rules || ''))}
                />
                <button type="button" onClick={() => addToArray('house_rules', arrayInputs.house_rules || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.house_rules || []).map((rule, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                    {rule}
                    <button type="button" onClick={() => removeFromArray('house_rules', idx)} className="ml-1 text-red-600 hover:text-red-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Nearby Attractions</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.nearby_attractions || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, nearby_attractions: e.target.value }))}
                  placeholder="e.g., Local Market, Lake Victoria, Hiking Trails, Cultural Sites"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('nearby_attractions', arrayInputs.nearby_attractions || ''))}
                />
                <button type="button" onClick={() => addToArray('nearby_attractions', arrayInputs.nearby_attractions || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.nearby_attractions || []).map((attraction, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {attraction}
                    <button type="button" onClick={() => removeFromArray('nearby_attractions', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Local Recommendations</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.local_recommendations || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, local_recommendations: e.target.value }))}
                  placeholder="e.g., Best local restaurants, Hidden gems, Safe walking routes, Cultural experiences"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('local_recommendations', arrayInputs.local_recommendations || ''))}
                />
                <button type="button" onClick={() => addToArray('local_recommendations', arrayInputs.local_recommendations || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.local_recommendations || []).map((rec, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    {rec}
                    <button type="button" onClick={() => removeFromArray('local_recommendations', idx)} className="ml-1 text-yellow-600 hover:text-yellow-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Check-in Process</label>
              <textarea value={form.check_in_process || ''} onChange={(e) => update('check_in_process', e.target.value)} placeholder="Describe how guests check in, what they need to bring, any special instructions" rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

          </div>
        )

      case 'flights':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Flight Booking Details</h4>

            {/* Basic Flight Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Flight Number</label>
                <input value={form.flight_number || ''} onChange={(e) => update('flight_number', e.target.value)} placeholder="e.g., QR123" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Airline</label>
                <input value={form.airline || ''} onChange={(e) => update('airline', e.target.value)} placeholder="e.g., Qatar Airways" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Aircraft Type</label>
                <input value={form.aircraft_type || ''} onChange={(e) => update('aircraft_type', e.target.value)} placeholder="e.g., Boeing 777" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Currency</label>
                <select value={form.currency || 'UGX'} onChange={(e) => update('currency', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="UGX">UGX</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Route Information */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Route Information</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Departure City</label>
                  <input value={form.departure_city || ''} onChange={(e) => update('departure_city', e.target.value)} placeholder="e.g., Kampala" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Arrival City</label>
                  <input value={form.arrival_city || ''} onChange={(e) => update('arrival_city', e.target.value)} placeholder="e.g., Nairobi" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Departure Airport</label>
                  <input value={form.departure_airport || ''} onChange={(e) => update('departure_airport', e.target.value)} placeholder="e.g., KIA" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Arrival Airport</label>
                  <input value={form.arrival_airport || ''} onChange={(e) => update('arrival_airport', e.target.value)} placeholder="e.g., JKA" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Schedule</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Departure Time</label>
                  <input type="datetime-local" value={form.departure_time || ''} onChange={(e) => update('departure_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Arrival Time</label>
                  <input type="datetime-local" value={form.arrival_time || ''} onChange={(e) => update('arrival_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
                  <input type="number" value={form.duration_minutes || ''} onChange={(e) => update('duration_minutes', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 120" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Flight Status</label>
                  <select value={form.flight_status || 'active'} onChange={(e) => update('flight_status', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="delayed">Delayed</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Pricing</h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Economy Price</label>
                  <input type="number" value={form.economy_price || ''} onChange={(e) => update('economy_price', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Business Price</label>
                  <input type="number" value={form.business_price || ''} onChange={(e) => update('business_price', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Class Price</label>
                  <input type="number" value={form.first_class_price || ''} onChange={(e) => update('first_class_price', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>
            </div>

            {/* Capacity */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Capacity</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Seats</label>
                  <input type="number" value={form.total_seats || ''} onChange={(e) => update('total_seats', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 200" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Available Seats</label>
                  <input type="number" value={form.available_seats || ''} onChange={(e) => update('available_seats', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 180" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Additional Information</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Flight Class</label>
                  <select value={form.flight_class || 'economy'} onChange={(e) => update('flight_class', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                    <option value="economy">Economy</option>
                    <option value="business">Business</option>
                    <option value="first_class">First Class</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Booking Deadline (hours before)</label>
                  <input type="number" value={form.booking_deadline_hours || ''} onChange={(e) => update('booking_deadline_hours', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 24" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Baggage Allowance</label>
                <input value={form.baggage_allowance || ''} onChange={(e) => update('baggage_allowance', e.target.value)} placeholder="e.g., 20kg checked, 7kg carry-on" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            {/* Flight Amenities */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Flight Amenities</h5>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.flight_amenities || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, flight_amenities: e.target.value }))}
                  placeholder="e.g., WiFi, In-flight Entertainment, Meals, USB Charging"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('flight_amenities', arrayInputs.flight_amenities || ''))}
                />
                <button type="button" onClick={() => addToArray('flight_amenities', arrayInputs.flight_amenities || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.flight_amenities || []).map((amenity, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {amenity}
                    <button type="button" onClick={() => removeFromArray('flight_amenities', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Booking Information */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Booking Information</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Booking Fee (UGX)</label>
                  <input type="number" value={form.booking_fee || ''} onChange={(e) => update('booking_fee', e.target.value ? Number(e.target.value) : undefined)} placeholder="Service fee per booking" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cancellation Policy</label>
                  <input value={form.cancellation_policy || ''} onChange={(e) => update('cancellation_policy', e.target.value)} placeholder="e.g., Free cancellation 24h before" className="mt-1 w-full border rounded-md px-3 py-2" />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Payment Methods</label>
                <div className="flex gap-2">
                  <input
                    value={arrayInputs.payment_methods || ''}
                    onChange={(e) => setArrayInputs(prev => ({ ...prev, payment_methods: e.target.value }))}
                    placeholder="e.g., Credit Card, Mobile Money, Bank Transfer"
                    className="flex-1 border rounded-md px-3 py-2"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('payment_methods', arrayInputs.payment_methods || ''))}
                  />
                  <button type="button" onClick={() => addToArray('payment_methods', arrayInputs.payment_methods || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.payment_methods || []).map((method, idx) => (
                    <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                      {method}
                      <button type="button" onClick={() => removeFromArray('payment_methods', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Flight Features */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Flight Features</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <label className="flex items-center">
                  <input type="checkbox" checked={form.refund_policy || false} onChange={(e) => update('refund_policy', e.target.checked)} className="mr-2" />
                  Refundable Tickets
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.flexible_booking || false} onChange={(e) => update('flexible_booking', e.target.checked)} className="mr-2" />
                  Flexible Booking
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.insurance_included || false} onChange={(e) => update('insurance_included', e.target.checked)} className="mr-2" />
                  Travel Insurance Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.flight_meals_included || false} onChange={(e) => update('flight_meals_included', e.target.checked)} className="mr-2" />
                  Meals Included
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.lounge_access || false} onChange={(e) => update('lounge_access', e.target.checked)} className="mr-2" />
                  Lounge Access
                </label>
                <label className="flex items-center">
                  <input type="checkbox" checked={form.priority_boarding || false} onChange={(e) => update('priority_boarding', e.target.checked)} className="mr-2" />
                  Priority Boarding
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
              <textarea value={form.flight_notes || ''} onChange={(e) => update('flight_notes', e.target.value)} placeholder="Any additional information about the flight booking service" rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      case 'shops':
        return (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium text-gray-900">Shop Details</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Shop Type</label>
                <select value={form.shop_type || ''} onChange={(e) => update('shop_type', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="">Select shop type</option>
                  <option value="boutique">Boutique</option>
                  <option value="souvenir_shop">Souvenir Shop</option>
                  <option value="craft_market">Craft Market</option>
                  <option value="department_store">Department Store</option>
                  <option value="specialty_shop">Specialty Shop</option>
                  <option value="online_store">Online Store</option>
                  <option value="pop_up_shop">Pop-up Shop</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Store Size (sq meters)</label>
                <input type="number" value={form.store_size || ''} onChange={(e) => update('store_size', e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g., 50" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Opening Time</label>
                <input type="time" value={form.opening_time || ''} onChange={(e) => update('opening_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Closing Time</label>
                <input type="time" value={form.closing_time || ''} onChange={(e) => update('closing_time', e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Products & Services</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.products_offered || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, products_offered: e.target.value }))}
                  placeholder="e.g., Handcrafted souvenirs, Local textiles, Traditional crafts"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('products_offered', arrayInputs.products_offered || ''))}
                />
                <button type="button" onClick={() => addToArray('products_offered', arrayInputs.products_offered || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.products_offered || []).map((product, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {product}
                    <button type="button" onClick={() => removeFromArray('products_offered', idx)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Payment Methods</label>
              <div className="flex gap-2">
                <input
                  value={arrayInputs.payment_methods || ''}
                  onChange={(e) => setArrayInputs(prev => ({ ...prev, payment_methods: e.target.value }))}
                  placeholder="e.g., Cash, Mobile Money, Credit Card, Bank Transfer"
                  className="flex-1 border rounded-md px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('payment_methods', arrayInputs.payment_methods || ''))}
                />
                <button type="button" onClick={() => addToArray('payment_methods', arrayInputs.payment_methods || '')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Add</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.payment_methods || []).map((method, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {method}
                    <button type="button" onClick={() => removeFromArray('payment_methods', idx)} className="ml-1 text-green-600 hover:text-green-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input type="checkbox" checked={form.delivery_available || false} onChange={(e) => update('delivery_available', e.target.checked)} className="mr-2" />
                Delivery Available
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.in_store_pickup || false} onChange={(e) => update('in_store_pickup', e.target.checked)} className="mr-2" />
                In-store Pickup
              </label>
              <label className="flex items-center">
                <input type="checkbox" checked={form.online_orders || false} onChange={(e) => update('online_orders', e.target.checked)} className="mr-2" />
                Online Orders
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Order Value</label>
                <input type="number" value={form.minimum_order_value || ''} onChange={(e) => update('minimum_order_value', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Delivery Fee</label>
                <input type="number" value={form.delivery_fee || ''} onChange={(e) => update('delivery_fee', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Shop Policies</label>
              <textarea value={form.shop_policies || ''} onChange={(e) => update('shop_policies', e.target.value)} placeholder="Return policy, exchange terms, special conditions, etc." rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Additional Shop Information</label>
              <textarea value={form.shop_notes || ''} onChange={(e) => update('shop_notes', e.target.value)} placeholder="Any additional information about your shop, special features, or services" rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-slate-200/60 animate-in zoom-in-95 duration-300 flex flex-col">
        <div className="sticky top-0 bg-white backdrop-blur-sm z-10 flex items-center justify-between border-b border-slate-200 px-8 py-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{initial?.id ? 'Edit Service' : 'Create New Service'}</h3>
              <p className="text-sm text-slate-600">Fill in the details to add your service to the platform</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="flex-1 px-8 py-6 space-y-8 overflow-y-auto"
          onSubmit={(e) => { 
            e.preventDefault(); 
            
            if (form.category_id === 'cat_activities') {
              if (!form.event_datetime?.trim()) {
                alert('Event Date & Time is required for events');
                return;
              }
              if (!form.event_location?.trim()) {
                alert('Event Location is required for events');
                return;
              }
            }
            
            onSubmit(form) 
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category_id as any} onChange={(e) => update('category_id', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.id === 'cat_activities' ? 'Events' : category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{form.category_id === 'cat_activities' ? 'Event Title' : 'Title'}</label>
            <input value={form.title as any} onChange={(e) => update('title', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{form.category_id === 'cat_activities' ? 'Event Description' : 'Description'}</label>
            <textarea value={form.category_id === 'cat_activities' ? (form.event_description as any) || '' : (form.description as any)} onChange={(e) => update(form.category_id === 'cat_activities' ? 'event_description' as any : 'description' as any, e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={3} required />
          </div>

          {/* Hide generic pricing/location/capacity fields when creating an Event (category_id === 'cat_activities')
              Event-specific fields (event_datetime, registration_deadline, event_location, ticket_types, etc.) are shown below. */}
          {form.category_id !== 'cat_activities' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input value={form.currency as any} onChange={(e) => update('currency', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input type="number" value={form.price as any} onChange={(e) => update('price', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input value={form.location as any} onChange={(e) => update('location', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (hours)</label>
                  <input type="number" value={form.duration_hours as any} onChange={(e) => update('duration_hours', e.target.value ? Number(e.target.value) : undefined)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
                  <input type="number" value={form.max_capacity as any} onChange={(e) => update('max_capacity', e.target.value ? Number(e.target.value) : undefined)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
            </>
          )}

          

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Images</label>
            <div className="space-y-3">
              <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <div className="text-center">
                  <p className="text-sm text-gray-500">{uploadingImage ? 'Uploading...' : 'Click to upload an image'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file)
                  }}
                  disabled={uploadingImage}
                  className="hidden"
                />
              </label>

              {(form.images as string[]).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(form.images as string[]).map((src, idx) => (
                    <div key={idx} className="relative group">
                      <img loading="lazy" decoding="async" src={src} alt={`Service ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                      <button type="button" onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {renderCategorySpecificFields()}

          <div className="flex justify-end gap-4 pt-8 border-t border-slate-200 bg-slate-50 -mx-8 px-8 py-6 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-8 py-3 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
            >
              {initial?.id ? 'Save Changes' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>

      {/* Map Location Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] border border-slate-200/60 animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="sticky top-0 bg-white backdrop-blur-sm z-10 flex items-center justify-between border-b border-slate-200 px-8 py-6 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
                  <Map className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Select Event Location</h3>
                  <p className="text-sm text-slate-600">Search for and select the event location on the map (OpenStreetMap)</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMapModal(false)
                  setMapModalInitialCoords(null)
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:shadow-sm flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <SearchMap
                initialCoords={mapModalInitialCoords}
                onLocationSelect={(location) => {
                  update('event_location', location.display_name as any)
                  update('event_lat' as any, location.lat)
                  update('event_lon' as any, location.lon)
                  setShowMapModal(false)
                  setMapModalInitialCoords(null)
                }}
                height="500px"
                showSearch={true}
                showLocationEdit={true}
                viewOnly={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

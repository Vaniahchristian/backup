import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { 
  MapPin, 
  Star, 
  Users, 
  Clock, 
  Calendar,
  ArrowLeft,
  Heart,
  Share2,
  ShoppingCart,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp
} from 'lucide-react'
import { createServiceReview, createOrder } from '../lib/database'
import { getDisplayPrice } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { usePreferences } from '../contexts/PreferencesContext'
import { getKpisForCategory, calculateOverallFromKpis, getKpiIcon } from '../lib/reviewKpis'
import type { KpiRatings } from '../lib/reviewKpis'
import CitySearchInput from '../components/CitySearchInput'
import { useServiceDetailQuery, useServiceDetailQueryClient, serviceDetailQueryKey } from '../hooks/useServiceDetailQuery'
import { PageSkeleton } from '../components/SkeletonLoader'

interface ServiceDetail {
  id: string
    slug?: string
    title: string
    description: string
    price: number
    currency: string
    images: string[]
    location: string
    duration_hours: number
    max_capacity: number
    amenities: string[]
    vendors?: {
      business_name: string
      business_description: string
      business_phone: string
      business_email: string
      business_address: string
      id?: string
      user_id?: string
    } | null
    vendor_id?: string
    scan_enabled?: boolean
    service_categories: {
      name: string
    }
  
    // Service-specific fields
    duration_days?: number
    star_rating?: number
    room_types?: string[]
    check_in_time?: string
    check_out_time?: string
    facilities?: string[]
    breakfast_included?: boolean
    wifi_available?: boolean
    parking_available?: boolean
    pet_friendly?: boolean
    generator_backup?: boolean
    smoking_allowed?: boolean
    children_allowed?: boolean
    disabled_access?: boolean
    concierge_service?: boolean
    total_rooms?: number
    minimum_stay?: number
    maximum_guests?: number
    hotel_policies?: string[]
    difficulty_level?: string
    minimum_age?: number
    languages_offered?: string[]
    included_items?: string[]
    excluded_items?: string[]
    itinerary?: string[]
    meeting_point?: string
    end_point?: string
    transportation_included?: boolean
    meals_included?: string[]
    guide_included?: boolean
    accommodation_included?: boolean
    vehicle_type?: string
    vehicle_capacity?: number
    driver_included?: boolean
    air_conditioning?: boolean
    pickup_locations?: string[]
    dropoff_locations?: string[]
    route_description?: string
    license_required?: string
    booking_notice_hours?: number
    gps_tracking?: boolean
    fuel_included?: boolean
    tolls_included?: boolean
    insurance_included?: boolean
    usb_charging?: boolean
    child_seat?: boolean
    roof_rack?: boolean
    towing_capacity?: boolean
    four_wheel_drive?: boolean
    automatic_transmission?: boolean
    reservations_required?: boolean
    transport_terms?: string
    airline?: string
    flight_number?: string
    departure_city?: string
    arrival_city?: string
    flight_class?: string
    cuisine_type?: string
    average_cost_per_person?: number
    outdoor_seating?: boolean
    menu_items?: string[]
    dietary_options?: string[]
    opening_hours?: any
    live_music?: boolean
    private_dining?: boolean
    alcohol_served?: boolean
    activity_type?: string
    skill_level_required?: string
    equipment_provided?: string[]
    languages_spoken?: string[]
    specialties?: string[]
    certifications?: string[]
    years_experience?: number
    service_area?: string
  
    // Event-specific fields
    event_datetime?: string
    event_location?: string
    event_status?: string
    registration_deadline?: string
    max_participants?: number
    event_highlights?: string[]
    event_inclusions?: string[]
    event_prerequisites?: string[]
    group_discounts?: boolean
    photography_allowed?: boolean
    recording_allowed?: boolean
    meals_included_flag?: boolean
    certificates_provided?: boolean
    safety_gear_required?: boolean
    event_notes?: string
}

export default function ServiceDetail() {
  const formatServiceTitle = (service: ServiceDetail, isDesktop = false) => {
    const location = service.event_location || service.location;
    if (!location) return service.title;
    
    const preposition = ['activities', 'events', 'activity', 'event'].includes(service.service_categories?.name?.toLowerCase() || '') ? 'at' : 'in';
    const locationClass = isDesktop ? 'text-lg font-normal text-blue-600' : 'text-sm font-normal text-blue-600';
    
    return (
      <>
        {service.title}{' '}
        <span className={locationClass}>
          {preposition} {location}
        </span>
      </>
    );
  }

  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const queryClient = useServiceDetailQueryClient()
  const { data, isLoading } = useServiceDetailQuery(slug)

  const service = (data?.service ?? null) as ServiceDetail | null
  const reviews = data?.reviews ?? []
  const averageRating = data?.ratingData?.average ?? 0
  const reviewCount = data?.ratingData?.count ?? 0
  const kpiAverages = data?.ratingData?.kpiAverages ?? {}
  const ticketTypes = data?.ticketTypes ?? []

  const [selectedDate, setSelectedDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [guests, setGuests] = useState(1)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [selectedImage, setSelectedImage] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewSuccess, setReviewSuccess] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewForm, setReviewForm] = useState({ name: '', email: '', rating: 0, comment: '', city: '', country: '' })
  const [ticketQuantities, setTicketQuantities] = useState<{ [key: string]: number }>({})
  const [creatingOrder, setCreatingOrder] = useState(false)

  const [hoverRating, setHoverRating] = useState(0)
  const [kpiRatings, setKpiRatings] = useState<KpiRatings>({})
  const [kpiHoverRatings, setKpiHoverRatings] = useState<KpiRatings>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bookingRef = useRef<HTMLDivElement>(null)
  const [mobileBookingOpen, setMobileBookingOpen] = useState(false)
  const [showMobileBookButton, setShowMobileBookButton] = useState(true)
  const { user, profile } = useAuth()
  const { addToCart } = useCart()
  const { selectedCurrency, selectedLanguage } = usePreferences()

  // Currency conversion functions
  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string) => {
    const exchangeRates: { [key: string]: number } = {
      'UGX': 1,
      'USD': 0.00027,
      'EUR': 0.00025,
      'GBP': 0.00021,
      'KES': 0.0023,
      'TZS': 0.00064,
      'BRL': 0.0014,
      'MXN': 0.0054,
      'EGP': 0.0084,
      'MAD': 0.0025,
      'TRY': 0.0089,
      'THB': 0.0077,
      'KRW': 0.33,
      'RUB': 0.019,
      'INR': 0.022,
      'CNY': 0.0019,
      'JPY': 0.039,
      'CAD': 0.00036,
      'AUD': 0.00037,
      'CHF': 0.00024,
      'SEK': 0.0024,
      'NOK': 0.0024,
      'DKK': 0.0017,
      'PLN': 0.0011,
      'CZK': 0.0064,
      'HUF': 0.088,
      'ZAR': 0.0048,
      'NGN': 0.11,
      'GHS': 0.0037,
      'XAF': 0.16,
      'XOF': 0.16
    }

    if (fromCurrency === toCurrency) return amount
    const amountInUGX = fromCurrency === 'UGX' ? amount : amount / exchangeRates[fromCurrency]
    return amountInUGX * (exchangeRates[toCurrency] || 1)
  }

  const formatAmount = (amount: number | string, currency: string) => {
    // Coerce to a finite number; fall back to 0 if invalid so we never render NaN
    let value = Number(amount)
    if (!Number.isFinite(value)) value = 0
    try {
      return new Intl.NumberFormat(selectedLanguage || 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value)
    } catch (error) {
      return `${currency} ${value.toLocaleString()}`
    }
  }

  const formatCurrencyWithConversion = (amount: number | string, serviceCurrency: string) => {
    const numeric = Number(amount)
    const safe = Number.isFinite(numeric) ? numeric : 0
    const convertedAmount = convertCurrency(safe, serviceCurrency, selectedCurrency || 'UGX')
    return formatAmount(convertedAmount, selectedCurrency || 'UGX')
  }

  const ticketsTotal = ticketTypes.reduce((sum: number, t: any) => sum + (Number(t.price || 0) * (ticketQuantities[t.id] || 0)), 0)

  useEffect(() => {
    // Initialize ticket quantities only when ticket types change and
    // when the current quantities don't already match the new set.
    const initial: { [key: string]: number } = {}
    ticketTypes.forEach((t: any) => { initial[t.id] = 0 })

    const initialKeys = Object.keys(initial)
    const currentKeys = Object.keys(ticketQuantities)
    const needsInit = initialKeys.length !== currentKeys.length || initialKeys.some(k => ticketQuantities[k] !== initial[k])

    if (needsInit) {
      setTicketQuantities(initial)
    }
  }, [ticketTypes])

  useEffect(() => {
    // Only set the selected image when it's different from the current one.
    if (service?.images && service.images.length > 0) {
      const first = service.images[0]
      if (first !== selectedImage) {
        setSelectedImage(first)
      }
    }
    // include selectedImage to ensure the guard compares the up-to-date value
  }, [service?.images, selectedImage])

  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollLeft = scrollContainerRef.current.scrollLeft
        const width = scrollContainerRef.current.clientWidth
        const index = Math.round(scrollLeft / width)
        setCurrentImageIndex(Math.min(index, (service?.images?.length || 1) - 1))
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [service?.images?.length])

  // Keep selectedImage in sync with the carousel index so desktop scrolling updates the main selected image
  useEffect(() => {
    if (service?.images && service.images.length > 0) {
      const idx = Math.min(Math.max(0, currentImageIndex), service.images.length - 1)
      const img = service.images[idx]
      if (img && img !== selectedImage) setSelectedImage(img)
    }
  }, [currentImageIndex, service?.images])

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!service) return
    
    // Get category KPIs
    const categoryKpis = getKpisForCategory(service.service_categories?.name || '')
    
    // Check if all KPIs are rated
    const hasKpis = categoryKpis.length > 0
    if (hasKpis) {
      const unrated = categoryKpis.filter(kpi => !kpiRatings[kpi.key] || kpiRatings[kpi.key] === 0)
      if (unrated.length > 0) {
        setReviewError(`Please rate all categories: ${unrated.map(k => k.label).join(', ')}`)
        return
      }
    }
    
    // Calculate overall rating from KPIs if KPIs are provided
    const overallRating = hasKpis ? calculateOverallFromKpis(kpiRatings) : reviewForm.rating
    if (overallRating === 0) { setReviewError('Please select a rating'); return }

    // Use profile data for logged-in users, form data for guests
    const isLoggedIn = !!(user && profile)
    const reviewerName = isLoggedIn ? profile.full_name : reviewForm.name.trim()
    const reviewerEmail = isLoggedIn ? (user.email || profile.email) : (reviewForm.email.trim() || undefined)

    if (!reviewerName) { setReviewError('Please enter your name'); return }
    if (!reviewForm.comment.trim()) { setReviewError('Please share your experience'); return }

    setReviewSubmitting(true)
    setReviewError(null)

    try {
      await createServiceReview(service.id, {
        userId: user?.id,
        visitorName: reviewerName,
        visitorEmail: reviewerEmail,
        rating: overallRating,
        kpiRatings: hasKpis ? kpiRatings : undefined,
        comment: reviewForm.comment.trim(),
        isVerifiedBooking: false,
        reviewerCity: reviewForm.city.trim() || undefined,
        reviewerCountry: reviewForm.country.trim() || undefined,
      })
      setReviewSuccess(true)
      setShowReviewForm(false)
      setReviewForm({ name: '', email: '', rating: 0, comment: '', city: '', country: '' })
      setKpiRatings({})
      setTimeout(() => setReviewSuccess(false), 5000)
      await queryClient.invalidateQueries({ queryKey: serviceDetailQueryKey(slug) })
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setReviewSubmitting(false)
    }
  }

  // Map service category names to booking flow categories
  const mapCategoryToBookingFlow = (categoryName: string): string => {
    const categoryMap: { [key: string]: string } = {
      'hotels': 'hotels',
      'hotel': 'hotels',
      'accommodation': 'hotels',
      'transport': 'transport',
      'transportation': 'transport',
      'car rental': 'transport',
      'tours': 'tours',
      'tour': 'tours',
      'guided tour': 'tours',
      'restaurants': 'restaurants',
      'restaurant': 'restaurants',
      'dining': 'restaurants',
  'activities': 'activities',
  'activity': 'activities',
  'experience': 'activities',
  // Accept public-facing 'events' and 'event' names and normalize to internal 'activities'
  'events': 'activities',
  'event': 'activities',
      'flights': 'flights',
      'flight': 'flights',
      'air travel': 'flights'
    }
    
    return categoryMap[categoryName.toLowerCase()] || 'activities' // Default to activities
  }

  const handleBooking = () => {
    if (!service) return
    
    // For transport services, check for date range
    if (service.service_categories?.name?.toLowerCase() === 'transport') {
      if (!startDate || !endDate) return
    } else if (['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '')) {
      if (!checkInDate || !checkOutDate) return
    } else {
      if (!selectedDate) return
    }
    
    const bookingCategory = mapCategoryToBookingFlow(service.service_categories?.name || 'service')
    
    // Navigate to clean booking URL without query parameters
    const bookingUrl = `/service/${service.slug}/book/${bookingCategory}`
    
    // Pass selected dates and guests via navigation state
    const navigationState = service.service_categories?.name?.toLowerCase() === 'transport' 
      ? { startDate, endDate, guests }
      : ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '')
      ? { checkInDate, checkOutDate, guests, rooms: 1 }
      : { selectedDate, guests }
    
    // Use React Router navigation with state
    navigate(bookingUrl, { state: navigationState })
  }

  // Determine unit text for price (per person/per night/etc.)
  const getUnitLabel = (categoryName: string) => {
    const name = (categoryName || '').toLowerCase()
    if (name === 'transport') return 'per day'
    if (['hotels', 'hotel', 'accommodation'].includes(name)) return 'per night'
    if (name === 'shops') return 'per item'
    if (name === 'restaurants') return 'per meal'
    return 'per person'
  }

  const handleInquiry = () => {
    if (!service) return
    // Navigate to inquiry form
    navigate(`/service/${service.slug}/inquiry`)
  }

  const handleBuyTickets = async () => {
    if (!service) return

    // Build selected ticket lines for order creation
    const items = ticketTypes
      .filter((t: any) => (ticketQuantities[t.id] || 0) > 0)
      .map((t: any) => ({ ticket_type_id: t.id, quantity: ticketQuantities[t.id] || 0, unit_price: Number(t.price || 0) }))

    if (items.length === 0) return

    let order: any = null
    setCreatingOrder(true)
    try {
      // Create an order server-side and navigate to the checkout page for that order
      const userId = user?.id ?? null
      const vendorId = service.vendor_id || service.vendors?.id || null
      order = await createOrder(userId, vendorId, items, service.currency)
      if (order && order.id) {
        navigate(`/checkout/${order.id}`)
      } else {
        // Fallback: show minimal feedback
        // eslint-disable-next-line no-alert
        alert('Failed to create order. Please try again.')
      }
    } catch (err) {
      console.error('Failed to create order for tickets:', err)
      // eslint-disable-next-line no-alert
      alert('Failed to create order. Please try again later.')
    } finally {
      setCreatingOrder(false)
    }
  }

  const handleSaveToCart = () => {
    if (!service) return
    
    // Determine booking data based on service category
    const isAccommodation = ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '')
    const isTransport = service.service_categories?.name?.toLowerCase() === 'transport'
    
    const bookingData = {
      date: isTransport ? startDate : isAccommodation ? checkInDate : selectedDate,
      checkInDate: isAccommodation ? checkInDate : '',
      checkOutDate: isAccommodation ? checkOutDate : '',
      guests: guests,
      rooms: 1,
      roomType: '',
      pickupLocation: '',
      dropoffLocation: '',
      returnTrip: false,
      specialRequests: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      paymentMethod: 'mobile'
    }
    
    // Add to cart with basic service info
    addToCart({
      serviceId: service.id,
      service,
      bookingData,
      category: service.service_categories.name.toLowerCase(),
      totalPrice: totalPrice,
      currency: service.currency
    })
    // Could add a toast notification here
  }

  const openMobileBooking = () => {
    // Scroll booking panel into view and mark it open for mobile highlighting
    try {
      bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setMobileBookingOpen(true)
      setShowMobileBookButton(false)
      // remove highlight after a short delay
      setTimeout(() => setMobileBookingOpen(false), 2200)
    } catch (err) {
      // ignore
    }
  }

  // Hide the mobile Book button when the booking panel is visible in the viewport.
  useEffect(() => {
    if (!bookingRef.current) return
    const el = bookingRef.current
    const obs = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (e && e.isIntersecting) {
        setShowMobileBookButton(false)
      } else {
        setShowMobileBookButton(true)
      }
    }, { root: null, threshold: 0.5 })

    obs.observe(el)
    return () => obs.disconnect()
  }, [bookingRef.current])

  // Get appropriate button text based on category
  const getBookingButtonText = (categoryName: string): string => {
    const categoryTexts: { [key: string]: string } = {
      'hotels': 'Check Availability & Book',
      'transport': 'Check Availability & Book',
      'tours': 'Check Availability & Book',
      'restaurants': 'Check Availability & Book',
      'activities': 'Check Availability & Book',
      'flights': 'Check Availability & Book'
    }

    const mappedCategory = mapCategoryToBookingFlow(categoryName)
    return categoryTexts[mappedCategory] || 'Check Availability & Book'
  }

  // Render category-specific information
  const renderCategorySpecificInfo = (service: ServiceDetail) => {
    const categoryName = service.service_categories?.name?.toLowerCase() || 'service'

    switch (categoryName) {
      case 'hotels':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Accommodation Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.star_rating && (
                <div className="flex items-center">
                  <Star className="h-5 w-5 text-yellow-400 fill-current mr-2" />
                  <span className="text-sm text-gray-600">{service.star_rating} Star Hotel</span>
                </div>
              )}
              {service.total_rooms && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Total Rooms:</span> {service.total_rooms}
                </div>
              )}
              {service.minimum_stay && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Minimum Stay:</span> {service.minimum_stay} nights
                </div>
              )}
              {service.maximum_guests && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Max Guests per Room:</span> {service.maximum_guests}
                </div>
              )}
            </div>

            {/* Hotel Amenities */}
            <div className="mt-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Hotel Amenities</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {service.breakfast_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Breakfast Included</span>
                  </div>
                )}
                {service.wifi_available && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Free WiFi</span>
                  </div>
                )}
                {service.parking_available && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Parking Available</span>
                  </div>
                )}
                {service.pet_friendly && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Pet Friendly</span>
                  </div>
                )}
                {service.generator_backup && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Generator Backup</span>
                  </div>
                )}
                {service.smoking_allowed && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Smoking Allowed</span>
                  </div>
                )}
                {service.children_allowed && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Children Allowed</span>
                  </div>
                )}
                {service.disabled_access && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Disabled Access</span>
                  </div>
                )}
                {service.concierge_service && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Concierge Service</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.room_types && service.room_types.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Room Types:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.room_types.map((room, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                        {room}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.facilities && service.facilities.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Facilities:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.facilities.map((facility, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                        {facility}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.check_in_time && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Check-in Time:</span> {service.check_in_time}
                </div>
              )}
              {service.check_out_time && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Check-out Time:</span> {service.check_out_time}
                </div>
              )}
            </div>

            {/* Hotel Policies */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3">Hotel Policies</h4>
              <div className="text-sm text-gray-600 space-y-2">
                <p>• <span className="font-medium">Check-in:</span> {service.check_in_time || '2:00 PM'}</p>
                <p>• <span className="font-medium">Check-out:</span> {service.check_out_time || '11:00 AM'}</p>
                <p>• Free cancellation up to 24 hours before check-in</p>
                {service.hotel_policies && service.hotel_policies.length > 0 && (
                  <>
                    {service.hotel_policies.map((policy, index) => (
                      <p key={index}>• {policy}</p>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )

      case 'tours':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tour Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.difficulty_level && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">
                    <span className="font-medium">Difficulty:</span> {service.difficulty_level}
                  </span>
                </div>
              )}
              {service.duration_days && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Duration:</span> {service.duration_days} days
                </div>
              )}
              {service.minimum_age && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Minimum Age:</span> {service.minimum_age} years
                </div>
              )}
              {service.meeting_point && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Meeting Point:</span> {service.meeting_point}
                </div>
              )}
              {service.end_point && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">End Point:</span> {service.end_point}
                </div>
              )}
            </div>

            {/* Tour Inclusions */}
            <div className="mt-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Tour Inclusions</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {service.transportation_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Transportation</span>
                  </div>
                )}
                {service.guide_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Professional Guide</span>
                  </div>
                )}
                {service.accommodation_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Accommodation</span>
                  </div>
                )}
                {service.meals_included && service.meals_included.length > 0 && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Meals: {service.meals_included.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.languages_offered && service.languages_offered.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Languages:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.languages_offered.map((lang, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.included_items && service.included_items.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">What's Included:</span>
                  <ul className="text-sm text-gray-600 mt-1 list-disc list-inside">
                    {service.included_items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {service.excluded_items && service.excluded_items.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">What's Not Included:</span>
                  <ul className="text-sm text-gray-600 mt-1 list-disc list-inside">
                    {service.excluded_items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {service.itinerary && service.itinerary.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Itinerary:</span>
                  <ol className="text-sm text-gray-600 mt-1 list-decimal list-inside">
                    {service.itinerary.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )

      case 'transport':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Transport Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.vehicle_type && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Vehicle Type:</span> {service.vehicle_type}
                </div>
              )}
              {service.vehicle_capacity && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Capacity:</span> {service.vehicle_capacity} passengers
                </div>
              )}
              {service.license_required && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">License Required:</span> {service.license_required}
                </div>
              )}
              {service.booking_notice_hours && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Booking Notice:</span> {service.booking_notice_hours} hours
                </div>
              )}
            </div>

            {/* Vehicle Features */}
            <div className="mt-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Vehicle Features</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {service.air_conditioning && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Air Conditioning</span>
                  </div>
                )}
                {service.gps_tracking && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">GPS Tracking</span>
                  </div>
                )}
                {service.usb_charging && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">USB Charging</span>
                  </div>
                )}
                {service.child_seat && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Child Seat</span>
                  </div>
                )}
                {service.roof_rack && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Roof Rack</span>
                  </div>
                )}
                {service.towing_capacity && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Towing Capacity</span>
                  </div>
                )}
                {service.four_wheel_drive && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">4WD</span>
                  </div>
                )}
                {service.automatic_transmission && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Automatic</span>
                  </div>
                )}
              </div>
            </div>

            {/* Service Inclusions */}
            <div className="mt-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Service Inclusions</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {service.driver_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Professional Driver</span>
                  </div>
                )}
                {service.fuel_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Fuel Included</span>
                  </div>
                )}
                {service.tolls_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Tolls Included</span>
                  </div>
                )}
                {service.insurance_included && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Insurance Included</span>
                  </div>
                )}
                {service.reservations_required && (
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm text-gray-600">Reservations Required</span>
                  </div>
                )}
              </div>
            </div>

            {/* Locations */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.pickup_locations && service.pickup_locations.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Pickup Locations:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    {service.pickup_locations.join(', ')}
                  </div>
                </div>
              )}
              {service.dropoff_locations && service.dropoff_locations.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Drop-off Locations:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    {service.dropoff_locations.join(', ')}
                  </div>
                </div>
              )}
            </div>

            {/* Route Description */}
            {service.route_description && (
              <div className="mt-4">
                <span className="text-sm font-medium text-gray-700">Route Description:</span>
                <p className="text-sm text-gray-600 mt-1">{service.route_description}</p>
              </div>
            )}

            {/* Additional Terms */}
            {service.transport_terms && (
              <div className="mt-4">
                <span className="text-sm font-medium text-gray-700">Additional Terms & Conditions:</span>
                <p className="text-sm text-gray-600 mt-1">{service.transport_terms}</p>
              </div>
            )}

            {/* Fuel Policy */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-900 mb-1">Fuel Policy</h4>
              {service.fuel_included ? (
                <p className="text-sm text-gray-600">Fuel is included in your rental — no extra charges for fuel.</p>
              ) : (
                <p className="text-sm text-gray-600">
                  Fuel costs are your responsibility. You'll be charged for fuel used during your rental.
                </p>
              )}
            </div>
          </div>
        )

      case 'flights':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Flight Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.airline && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Airline:</span> {service.airline}
                </div>
              )}
              {service.flight_number && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Flight Number:</span> {service.flight_number}
                </div>
              )}
              {service.departure_city && service.arrival_city && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Route:</span> {service.departure_city} → {service.arrival_city}
                </div>
              )}
              {service.flight_class && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Class:</span> {service.flight_class}
                </div>
              )}
            </div>
          </div>
        )

      case 'restaurants':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Restaurant Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.cuisine_type && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Cuisine:</span> {service.cuisine_type}
                </div>
              )}
              {service.average_cost_per_person && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Average Cost:</span> {formatCurrencyWithConversion(service.average_cost_per_person, service.currency)} per person
                </div>
              )}
              {service.outdoor_seating && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">Outdoor Seating Available</span>
                </div>
              )}
              {service.live_music && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">Live Music</span>
                </div>
              )}
              {service.private_dining && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">Private Dining Available</span>
                </div>
              )}
              {service.alcohol_served && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">Alcohol Served</span>
                </div>
              )}
              {service.reservations_required && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-blue-500 mr-2" />
                  <span className="text-sm text-gray-600">Reservations Required</span>
                </div>
              )}
            </div>

            {service.menu_items && service.menu_items.length > 0 && (
              <div className="mt-4">
                <span className="text-sm font-medium text-gray-700">Popular Menu Items:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {service.menu_items.map((item, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {service.dietary_options && service.dietary_options.length > 0 && (
              <div className="mt-4">
                <span className="text-sm font-medium text-gray-700">Dietary Options:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {service.dietary_options.map((option, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                      {option}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {service.opening_hours && (
              <div className="mt-4">
                <span className="text-sm font-medium text-gray-700">Opening Hours:</span>
                <div className="text-sm text-gray-600 mt-1">
                  {typeof service.opening_hours === 'object' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {Object.entries(service.opening_hours).map(([day, hours]) => (
                        <div key={day} className="capitalize">
                          <span className="font-medium">{day}:</span> {String(hours)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span>{service.opening_hours}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 'activities':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.event_datetime && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Event Date & Time:</span>{' '}
                  {new Date(service.event_datetime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
              {service.event_location && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Event Location:</span> {service.event_location}
                </div>
              )}
              {service.registration_deadline && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Registration Deadline:</span>{' '}
                  {new Date(service.registration_deadline).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
              {service.max_participants && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Maximum Participants:</span> {service.max_participants}
                </div>
              )}
              {service.minimum_age && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Minimum Age:</span> {service.minimum_age} years
                </div>
              )}
              {service.activity_type && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Activity Type:</span> {service.activity_type}
                </div>
              )}
              {service.skill_level_required && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Skill Level:</span> {service.skill_level_required}
                </div>
              )}
              {service.duration_hours && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Duration:</span> {service.duration_hours} hours
                </div>
              )}
              {service.years_experience && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Years of Experience:</span> {service.years_experience}
                </div>
              )}
              {service.service_area && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Service Area:</span> {service.service_area}
                </div>
              )}
              {service.equipment_provided && service.equipment_provided.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Equipment Provided:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.equipment_provided.map((equipment, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                        {equipment}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.languages_spoken && service.languages_spoken.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Languages Spoken:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.languages_spoken.map((language, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                        {language}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.specialties && service.specialties.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Specialties:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.specialties.map((specialty, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {service.certifications && service.certifications.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Certifications:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {service.certifications.map((certification, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                        {certification}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Event Highlights */}
            {service.event_highlights && service.event_highlights.length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Event Highlights</h4>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {service.event_highlights.map((highlight, idx) => (
                    <li key={idx}>{highlight}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* What's Included */}
            {service.event_inclusions && service.event_inclusions.length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">What's Included</h4>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {service.event_inclusions.map((inclusion, idx) => (
                    <li key={idx}>{inclusion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Prerequisites */}
            {service.event_prerequisites && service.event_prerequisites.length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Prerequisites</h4>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {service.event_prerequisites.map((prereq, idx) => (
                    <li key={idx}>{prereq}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Event Features */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {service.group_discounts && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Group Discounts Available</span>
                </div>
              )}
              {service.photography_allowed && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Photography Allowed</span>
                </div>
              )}
              {service.recording_allowed && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Recording Allowed</span>
                </div>
              )}
              {service.transportation_included && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Transportation Included</span>
                </div>
              )}
              {service.meals_included_flag && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Meals Included</span>
                </div>
              )}
              {service.certificates_provided && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-700">Certificates Provided</span>
                </div>
              )}
              {service.safety_gear_required && (
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-yellow-500 mr-2" />
                  <span className="text-sm text-gray-700">Safety Gear Required</span>
                </div>
              )}
              {service.event_notes && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Notes:</span> {service.event_notes}
                </div>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (isLoading) {
    return <PageSkeleton type="serviceDetail" />
  }

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Service not found</h1>
          <p className="text-gray-600 mb-4">The service you're looking for doesn't exist or has been removed.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-700 underline">
            Return to home
          </Link>
        </div>
      </div>
    )
  }

  // Calculate number of days for transport services based on actual time difference
  const calculateDays = (startDate: string, startTime: string, endDate: string, endTime: string): number => {
    if (!startDate || !endDate) return 1
    
    const startDateTime = new Date(`${startDate}T${startTime}`)
    const endDateTime = new Date(`${endDate}T${endTime}`)
    
    const diffTime = Math.abs(endDateTime.getTime() - startDateTime.getTime())
    const diffHours = diffTime / (1000 * 60 * 60)
    
    // Round up to the next day if more than 24 hours
    return Math.ceil(diffHours / 24) || 1
  }

  // Calculate number of nights for accommodation services
  const calculateNights = (checkInDate: string, checkOutDate: string): number => {
    if (!checkInDate || !checkOutDate) return 1
    
    const checkIn = new Date(checkInDate)
    const checkOut = new Date(checkOutDate)
    
    const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    return diffDays || 1
  }

  const totalPrice = service.service_categories?.name?.toLowerCase() === 'transport'
    ? service.price * calculateDays(startDate, startTime, endDate, endTime)
    : ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '')
    ? service.price * calculateNights(checkInDate, checkOutDate)
    : service.price * guests

  // Shared info sections used by both mobile and desktop to keep flow uniform
  const InfoSections = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Centered Info Block Near Image */}
      <div className={isMobile ? 'bg-white border-b px-3 py-3' : 'bg-white border-b mb-8 px-4 py-6'}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-2xl font-semibold text-gray-900 leading-tight truncate">{formatServiceTitle(service, !isMobile)}</h1>
          </div>

          <div className="flex-shrink-0 text-right ml-2">
            <div className={isMobile ? 'text-2xl font-bold text-gray-900 inline-flex items-center' : 'text-2xl font-bold text-gray-900 inline-flex items-center'}>
              <Star className="h-4 w-4 text-yellow-400 fill-current mr-1" />
              <span>{Math.round(averageRating) || 0}</span>
            </div>
            <div className="text-xs text-gray-500">({reviewCount} reviews)</div>
          </div>
        </div>

        {/* Compact CTA row for mobile or inline price for desktop */}
            <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-400">From</div>
            <div className={isMobile ? 'text-lg font-semibold inline-flex items-baseline' : 'text-2xl font-semibold inline-flex items-baseline'}>
              {formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)}
              <span className={isMobile ? 'text-sm font-normal text-gray-500 ml-2 whitespace-nowrap align-middle' : 'text-sm font-normal text-gray-500 ml-2 whitespace-nowrap align-middle'}>{getUnitLabel(service.service_categories?.name || '')}</span>
            </div>
          </div>
        </div>
      </div>

  {/* Main Information Section: About (description), quick info, provider */}
      <div className={isMobile ? 'bg-gray-50 pb-6 px-3' : 'mt-8 space-y-6'}>
        <div className="bg-white rounded-lg p-3">
          <div className="text-sm font-semibold text-gray-900 mb-1">ABOUT</div>
          {service.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-3">{service.description}</p>
          )}
          <p className="text-[10px] text-gray-400 font-semibold mb-2 uppercase tracking-wider">Quick Info</p>
          <div className="space-y-1.5">
            {service.duration_hours && service.service_categories?.name?.toLowerCase() !== 'transport' && (
              <div className="flex items-center text-[11px] text-gray-700">
                <Clock className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
                Duration: {service.duration_hours} hours
              </div>
            )}
            {service.max_capacity && (
              <div className="flex items-center text-[11px] text-gray-700">
                <Users className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
                Up to {service.max_capacity} guests
              </div>
            )}
            <div className="flex items-center text-[11px] text-gray-700">
              <CheckCircle className="h-3.5 w-3.5 text-green-500 mr-1.5" />
              Instant confirmation
            </div>

            {/* Amenities */}
            {service.amenities && service.amenities.length > 0 && (
              <div className="border-t pt-1.5 mt-1.5">
                <p className="text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">What's Included</p>
                <div className="flex flex-wrap gap-1">
                  {service.amenities.map((amenity, index) => (
                    <span key={index} className="inline-flex items-center text-[10px] text-gray-600 bg-gray-50 rounded-full px-2 py-0.5">
                      <CheckCircle className="h-2.5 w-2.5 text-green-500 mr-1 flex-shrink-0" />
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hotel-specific details */}
            {service.service_categories?.name?.toLowerCase() === 'hotels' && (
              <div className="border-t pt-1.5 mt-1.5">
                <p className="text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">Accommodation</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {service.star_rating && (
                    <div className="flex items-center text-gray-700">
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-current mr-1" />
                      {service.star_rating} Star
                    </div>
                  )}
                  {service.total_rooms && <div className="text-gray-700">Rooms: <span className="font-medium">{service.total_rooms}</span></div>}
                  {service.minimum_stay && <div className="text-gray-700">Min. Stay: <span className="font-medium">{service.minimum_stay}n</span></div>}
                  {service.check_in_time && <div className="text-gray-700">In: <span className="font-medium">{service.check_in_time}</span></div>}
                  {service.check_out_time && <div className="text-gray-700">Out: <span className="font-medium">{service.check_out_time}</span></div>}
                </div>
              </div>
            )}

            {/* Provider */}
            {service.vendors && (
              <div className="border-t pt-1.5 mt-1.5">
                <p className="text-[10px] text-gray-400 font-semibold mb-1 uppercase tracking-wider">Provider</p>
                <Link to={`/vendor/${service.vendors.id || service.vendor_id}`} className="block hover:bg-gray-50 rounded-md">
                  <div className="flex items-start space-x-3 px-2 py-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-blue-600">{service.vendors.business_name?.charAt(0) || 'V'}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">{service.vendors.business_name || 'Service Provider'}</h4>
                      <p className="text-gray-600 text-sm mt-0.5 line-clamp-2">{service.vendors.business_description || 'No description available'}</p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 text-xs rounded bg-blue-50 text-blue-600">View Provider Profile</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Reviews Summary & List */}
        <div className="bg-white rounded-lg p-3 border-t-4 border-yellow-400">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-900">Guest Reviews</p>
            <button onClick={() => setShowReviewForm(!showReviewForm)} className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] rounded-md hover:bg-emerald-700 transition-colors font-medium">Write a Review</button>
          </div>

          <div className="flex items-center gap-2.5 bg-gray-50 rounded-lg p-2.5">
              <div className="text-center flex-shrink-0">
              <div className="inline-flex items-center">
                <Star className="h-5 w-5 text-yellow-400 fill-current mr-1" />
                <span className="text-xl font-extrabold text-gray-900">{averageRating || '0'}</span>
              </div>
              <div className="flex items-center gap-0.5 mt-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-2.5 w-2.5 ${i < Math.round(averageRating) ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-0.5">{reviewCount} review{reviewCount !== 1 ? 's' : ''}</p>
            </div>

            {Object.keys(kpiAverages).length > 0 && (
              <div className="flex-1 border-l border-gray-200 pl-2.5 space-y-0.5">
                {getKpisForCategory(service.service_categories?.name || '').map((kpi) => {
                  const avg = kpiAverages[kpi.key]?.average || 0
                  return (
                    <div key={kpi.key} className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-500 w-16 truncate">{kpi.label}</span>
                      <div className="flex-1 bg-gray-200/60 rounded-full h-1 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-400 to-amber-400 rounded-full" style={{ width: `${(avg / 5) * 100}%` }} />
                      </div>
                      <span className="text-[9px] font-bold text-gray-700 w-4 text-right">{avg > 0 ? avg.toFixed(1) : '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reviews list handled below in same order for mobile/desktop */}
        </div>
      </div>
    </>
  )

  // Keep references to certain locals/imports so TypeScript doesn't flag them as unused
  // (these are intentionally referenced here because the detailed review UI lives inside the shared sections)
  ;((): void => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _refs = [
      getKpiIcon,
      // CitySearchInput component may be used in review forms
      CitySearchInput,
      reviews,
      reviewSubmitting,
      reviewSuccess,
      reviewError,
      hoverRating,
      setHoverRating,
      kpiHoverRatings,
      setKpiHoverRatings,
      handleReviewSubmit,
    ]
    void _refs
  })()

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Mobile Image with Header Overlay */}
      <div className="md:hidden w-screen relative left-[50%] right-[50%] -ml-[50vw] -mr-[50vw]">
        <div className="relative h-[95vw] min-h-[400px] max-h-[650px] rounded-b-2xl shadow-lg overflow-hidden">
          {/* Scrollable Image Container */}
          <div 
            ref={scrollContainerRef}
            className="w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth bg-gray-200" 
            style={{ scrollBehavior: 'smooth' }}
          >
            <div className="flex w-full h-full">
              {service.images && service.images.length > 0 ? (
                service.images.map((image, index) => (
                  <div key={index} className="flex-shrink-0 w-full snap-center">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={image}
                      alt={`${service.title} ${index + 1}`}
                      className="w-full h-full object-cover cursor-pointer rounded-b-2xl"
                      style={{ minHeight: 260, maxHeight: 420, objectPosition: 'center' }}
                      onClick={() => { setLightboxIndex(index); setLightboxOpen(true) }}
                    />
                  </div>
                ))
              ) : (
                <div className="flex-shrink-0 w-full snap-center">
                  <img
                    loading="lazy"
                    decoding="async"
                    src="https://images.pexels.com/photos/1320684/pexels-photo-1320684.jpeg"
                    alt={service.title}
                    className="w-full h-full object-cover rounded-b-2xl"
                    style={{ minHeight: 260, maxHeight: 420, objectPosition: 'center' }}
                  />
                </div>
              )}
            </div>
          </div>
          {/* Mobile Header Overlay */}
          <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between z-10">
            <Link to="/" aria-label="Back" className="w-9 h-9 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-md transition-all">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center space-x-2">
              <button className="w-9 h-9 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-md transition-all">
                <Heart className="h-5 w-5" />
              </button>
              <button className="w-9 h-9 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-md transition-all">
                <Share2 className="h-5 w-5" />
              </button>
              <button 
                onClick={handleSaveToCart}
                className="w-9 h-9 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-md transition-all"
              >
                <ShoppingCart className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* Image Counter */}
          {service.images && service.images.length > 0 && (
            <div className="absolute bottom-4 right-4 bg-white text-gray-900 px-3 py-1 rounded-full text-xs z-10 border border-gray-200 shadow-md">
              {currentImageIndex + 1} / {service.images.length}
            </div>
          )}
          {/* Event hero overlay for Activities/Events - compact & mobile-optimized card */}
          {(service.service_categories?.name?.toLowerCase() === 'activities' || service.service_categories?.name?.toLowerCase() === 'events') && (
            <div className="absolute left-2 right-2 bottom-2 z-20">
              <div className="w-full bg-gradient-to-r from-black/90 via-black/60 to-transparent text-white px-2 py-2 rounded-lg shadow-lg border border-white/10 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] uppercase tracking-wide text-gray-200 font-semibold mb-0">{service.service_categories?.name || 'Event'}</div>
                    <h2 className="text-xs font-semibold leading-tight truncate">{service.title}</h2>
                    <div className="mt-0.5 flex items-center text-[10px] text-gray-200 space-x-1">
                      {service.duration_hours && (
                        <div className="flex items-center truncate">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>{service.duration_hours}h</span>
                        </div>
                      )}
                      {(service.location || service.event_location) && (
                        <div className="flex items-center truncate">
                          <MapPin className="h-3 w-3 mr-1" />
                          <span className="truncate">{service.event_location || service.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right pl-1 flex flex-col items-end">
                    <div className="text-[9px] text-gray-300">From</div>
                    <div className="text-base font-semibold">
                      {formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)}
                    </div>
                    <div className="text-[9px] font-normal text-gray-200 whitespace-nowrap align-middle -mt-0.5">
                      {getUnitLabel(service.service_categories?.name || '')}
                    </div>
                    {/* Mobile-only Buy Tickets CTA (smaller button) */}
                    <button
                      onClick={() => {
                        const el = document.querySelector('[data-tickets-section]')
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      aria-label="Buy Tickets"
                      className="mt-1 w-20 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1 rounded shadow-md transition-colors md:hidden sticky bottom-0"
                    >
                      Buy Tickets
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="md:hidden">
        <InfoSections isMobile />
      </div>

      {/* Desktop layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Image Gallery - Desktop */}
            <div className="mb-8 hidden md:block">
              {/* Main Image Display (desktop) - horizontally scrollable so users can browse without opening preview */}
              <div className="relative mb-4">
                <div
                  ref={scrollContainerRef}
                  className="w-full h-[520px] overflow-x-auto snap-x snap-mandatory scroll-smooth hidden md:block"
                  style={{ scrollBehavior: 'smooth' }}
                >
                  <div className="flex w-full h-full">
                    {service.images && service.images.length > 0 ? (
                      service.images.map((image, index) => (
                        <div key={index} className="flex-shrink-0 w-full snap-center">
                          <img
                            loading="lazy"
                            decoding="async"
                            src={image}
                            alt={`${service.title} ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer rounded-lg shadow-lg"
                            onClick={() => { setLightboxIndex(index); setLightboxOpen(true) }}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="flex-shrink-0 w-full snap-center">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={selectedImage || service.images?.[0] || 'https://images.pexels.com/photos/1320684/pexels-photo-1320684.jpeg'}
                          alt={service.title}
                          className="w-full h-full object-cover rounded-lg shadow-lg"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop Header Overlay – inside image */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
                  <Link to="/" aria-label="Back" className="w-9 h-9 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-sm transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <div className="flex items-center gap-2">
                    <button className="w-8 h-8 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-sm transition-colors">
                      <Heart className="h-4 w-4" />
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-sm transition-colors">
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button onClick={handleSaveToCart} className="w-8 h-8 flex items-center justify-center text-gray-900 bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full shadow-sm transition-colors">
                      <ShoppingCart className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Event hero overlay for Activities to mimic Quicket-style layout */}
                {(service.service_categories?.name?.toLowerCase() === 'activities' || service.service_categories?.name?.toLowerCase() === 'events') && (
                  <div className="absolute left-6 bottom-6 max-w-2xl bg-gradient-to-r from-black/70 via-black/40 to-transparent text-white p-6 rounded-lg">
                    <div className="text-sm uppercase tracking-wide text-gray-200 mb-2">{service.service_categories?.name || 'Event'}</div>
                    <h2 className="text-3xl md:text-4xl font-bold leading-tight">{service.title}</h2>
                    <div className="mt-3 flex items-center text-sm text-gray-200 space-x-4">
                      {service.duration_hours && (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          <span>{service.duration_hours} hours</span>
                        </div>
                      )}
                      {service.location && (
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2" />
                          <span>{service.location}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4">
                      <div className="text-sm text-gray-300">From</div>
                      <div className="text-2xl font-semibold inline-flex items-baseline">
                        {formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)}
                        <span className="text-sm font-normal text-gray-200 ml-3 whitespace-nowrap align-middle">{getUnitLabel(service.service_categories?.name || '')}</span>
                      </div>
                    </div>
                  </div>
                )}
                {service.images && service.images.length > 1 && (
                  <div className="absolute bottom-4 right-4 bg-white text-gray-900 px-3 py-1 rounded-full text-sm border border-gray-200 shadow-sm">
                    {(service.images.indexOf(selectedImage || service.images[0]) + 1) || 1}/{service.images.length}
                  </div>
                )}
              </div>

              {/* Thumbnail Gallery - Desktop */}
              {service.images && service.images.length > 1 && (
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {service.images.map((image, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setSelectedImage(image)
                            setLightboxIndex(index)
                            setLightboxOpen(true)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedImage(image)
                              setLightboxIndex(index)
                              setLightboxOpen(true)
                            }
                          }}
                          aria-label={`View image ${index + 1}`}
                          className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                            selectedImage === image ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <img
                            loading="lazy"
                            decoding="async"
                            src={image}
                            alt={`${service.title} ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                  ))}
                </div>
              )}

              <div className="hidden md:block">
                <InfoSections />
              </div>
            </div>

            {/* Category-Specific Information */}
            {renderCategorySpecificInfo(service)}
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <div ref={bookingRef} className={`bg-white rounded-lg shadow-lg p-6 sticky top-8 ${mobileBookingOpen ? 'ring-4 ring-blue-200' : ''} md:overflow-visible`}>
              {(service.service_categories?.name?.toLowerCase() === 'activities' || service.service_categories?.name?.toLowerCase() === 'events') ? (
                  <div data-tickets-section>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Tickets</h3>
                  <div className="space-y-3 mb-4">
                    {ticketTypes.length === 0 && (
                      <div className="text-sm text-gray-500">No ticket types configured for this event.</div>
                    )}
                    {ticketTypes.map((t: any) => {
                      const remaining = (t.quantity || 0) - (t.sold || 0)
                      const soldOut = remaining <= 0
                      const saleStart = t.sale_start || (t.metadata && t.metadata.sale_start)
                      const saleEnd = t.sale_end || (t.metadata && t.metadata.sale_end)
                      const now = new Date()
                      const startOk = !saleStart || new Date(saleStart) <= now
                      const endOk = !saleEnd || new Date(saleEnd) >= now
                      const saleOpen = startOk && endOk

                      return (
                        <div key={t.id} className={`border p-3 rounded-lg ${(soldOut || !saleOpen) ? 'opacity-60' : ''}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{t.title}</div>
                              {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                              <div className="text-sm text-gray-600 mt-1">{formatCurrencyWithConversion(t.price, service.currency)} · {remaining} left</div>
                              {!saleOpen && (
                                <div className="text-xs text-yellow-700 mt-1">
                                  {saleStart && new Date(saleStart) > now && `Sales open from ${new Date(saleStart).toLocaleString()}`}
                                  {saleEnd && new Date(saleEnd) < now && `Sales closed (deadline ${new Date(saleEnd).toLocaleString()})`}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button disabled={soldOut || !saleOpen} onClick={() => setTicketQuantities(q => ({ ...q, [t.id]: Math.max(0, (q[t.id] || 0) - 1) }))} className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50">-</button>
                              <input type="number" min={0} max={t.quantity} value={ticketQuantities[t.id] || 0} onChange={(e) => setTicketQuantities(q => ({ ...q, [t.id]: Math.min(t.quantity, Math.max(0, Number(e.target.value || 0))) }))} className="w-16 text-center border rounded px-2 py-1" disabled={!saleOpen} />
                              <button disabled={soldOut || !saleOpen} onClick={() => setTicketQuantities(q => ({ ...q, [t.id]: Math.min(t.quantity, (q[t.id] || 0) + 1) }))} className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50">+</button>
                            </div>
                          </div>
                          {soldOut && <div className="text-xs text-red-600 mt-2">Sold out</div>}
                        </div>
                      )
                    })}
                  </div>

                  <div className="border-t pt-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Total</span>
                      <span className="font-medium">{formatCurrencyWithConversion(ticketsTotal, service.currency)}</span>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button onClick={handleInquiry} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors border border-gray-300">Contact Provider</button>
                    <button
                      onClick={handleBuyTickets}
                      disabled={ticketsTotal <= 0 || creatingOrder}
                      className={`flex-1 ${(ticketsTotal > 0 && !creatingOrder) ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 cursor-not-allowed'} font-medium py-3 px-4 rounded-lg transition-colors border border-gray-300`}
                    >
                      {creatingOrder ? 'Creating...' : 'Buy Tickets'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-center mb-6">
                    <div className="text-2xl font-bold text-gray-900">{formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)}</div>
                      <div className="text-xs text-gray-500">
                        {service.service_categories?.name?.toLowerCase() === 'transport' ? 'per day' : 
                         ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '') ? 'per night' :
                         service.service_categories?.name?.toLowerCase() === 'shops' ? 'per item' :
                         service.service_categories?.name?.toLowerCase() === 'restaurants' ? 'per meal' : 'per person'}
                      </div>
                  </div>

                  {/* Date & Guest Selection Form */}
                  <div className="space-y-3 mb-6">
                    {service.service_categories?.name?.toLowerCase() === 'transport' ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Pick-up</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                              <input type="date" className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                            </div>
                            <input type="time" className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Drop-off</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                              <input type="date" className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || new Date().toISOString().split('T')[0]} />
                            </div>
                            <input type="time" className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                          </div>
                        </div>
                      </>
                    ) : ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '') ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Check-in</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <input type="date" className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Check-out</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <input type="date" className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} min={checkInDate || new Date().toISOString().split('T')[0]} />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Date</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <input type="date" className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                        </div>
                      </div>
                    )}

                    {service.service_categories?.name?.toLowerCase() !== 'transport' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2 uppercase">Guests</label>
                        <div className="relative">
                          <Users className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <select className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
                            {Array.from({ length: service.max_capacity || 10 }, (_, i) => i + 1).map(num => (<option key={num} value={num}>{num} guest{num > 1 ? 's' : ''}</option>))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Price Calculation */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-6">
                    <div className="flex justify-between items-center mb-2 text-xs">
                      <span className="text-gray-600">
                        {service.service_categories?.name?.toLowerCase() === 'transport' 
                          ? `${formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)} × ${calculateDays(startDate, startTime, endDate, endTime)} day${calculateDays(startDate, startTime, endDate, endTime) > 1 ? 's' : ''}`
                          : ['hotels', 'hotel', 'accommodation'].includes(service.service_categories?.name?.toLowerCase() || '')
                          ? `${formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)} × ${calculateNights(checkInDate, checkOutDate)} night${calculateNights(checkInDate, checkOutDate) > 1 ? 's' : ''}`
                          : `${formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency)} × ${guests} guest${guests > 1 ? 's' : ''}`}
                      </span>
                      <span className="font-medium text-gray-900">{formatCurrencyWithConversion(totalPrice, service.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center font-bold text-sm">
                      <span>Total</span>
                      <span className="text-gray-900">{formatCurrencyWithConversion(totalPrice, service.currency)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-3">
                    <button onClick={handleBooking} disabled={
                      service?.service_categories?.name?.toLowerCase() === 'transport' ? !startDate || !endDate :
                      ['hotels', 'hotel', 'accommodation'].includes(service?.service_categories?.name?.toLowerCase() || '') ? !checkInDate || !checkOutDate :
                      !selectedDate
                    } className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 text-sm rounded-lg transition-colors">{service ? getBookingButtonText(service.service_categories?.name || 'Service') : 'Check Availability & Book'}</button>
                    <button onClick={handleInquiry} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 text-sm rounded-lg transition-colors border border-gray-300">Contact Provider</button>
                  </div>

                  <p className="text-xs text-gray-500 text-center">No charge yet</p>
                </div>
              )}

              {/* show scan link to vendor/admin when enabled */}
              {service.scan_enabled && (user?.id === service.vendors?.user_id) && (
                <div className="mt-4 text-sm text-center">
                  <a href={`/scan/${service.id}`} className="text-blue-600 underline">Open Event Scan Portal</a>
                </div>
              )}
            </div>

            {/* Mobile-only round icon buttons placed below the checkout/summary */}
            <div className="md:hidden mt-4 px-3 flex justify-center gap-3">
              <button
                onClick={() => navigate(-1)}
                aria-label="Go back"
                className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Back to top"
                className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors"
              >
                <ChevronUp className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Book button (replaces global bottom nav on service pages) */}
      <div
        className={`md:hidden fixed left-0 z-50 pointer-events-auto transition-transform duration-500 ease-out ${showMobileBookButton ? 'translate-x-0' : '-translate-x-[110%]'}`}
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <div className="relative">
          {/* Elegant shadow and glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-blue-600/20 to-blue-700/20 blur-xl rounded-2xl transform scale-105"></div>

          {/* Main button container with premium styling */}
          <div className="relative flex w-[calc(100%-8px)] shadow-2xl overflow-hidden rounded-2xl backdrop-blur-sm">
            {/* Left: price + unit - opens/scrolls to booking summary */}
            <button
              onClick={openMobileBooking}
              className="flex-1 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white py-4 px-4 text-left hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 transition-all duration-300 rounded-l-2xl relative overflow-hidden group"
              aria-hidden={!showMobileBookButton}
            >
              {/* Subtle animated background pattern */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

              <div className="relative z-10">
                <div className="text-xs text-blue-100 font-medium uppercase tracking-wider mb-1">From</div>
                <div className="text-xl font-bold leading-none mb-1 text-white drop-shadow-sm">
                  {service ? formatCurrencyWithConversion(getDisplayPrice(service, ticketTypes), service.currency) : '—'}
                </div>
                <div className="text-xs text-blue-200 font-medium">{service ? getUnitLabel(service.service_categories?.name || '') : ''}</div>
              </div>
            </button>

            {/* Right: action - performs booking/navigation */}
            <button
              onClick={() => {
                // If booking summary is already visible, proceed with booking
                if (!showMobileBookButton) {
                  handleBooking()
                } else {
                  // Otherwise, scroll to the booking summary first
                  openMobileBooking()
                }
              }}
              className="w-20 bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 text-white flex items-center justify-center font-bold py-4 px-3 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-300 rounded-r-2xl relative overflow-hidden group shadow-lg"
              aria-hidden={!showMobileBookButton}
            >
              {/* Animated shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>

              <div className="relative z-10 flex flex-col items-center">
                <span className="text-sm leading-tight">Book</span>
                <span className="text-xs opacity-80">Now</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Booking Modal - Removed, replaced with direct navigation */}

      {/* Fullscreen Image Lightbox */}
      {lightboxOpen && service.images && service.images.length > 0 && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setLightboxOpen(false)}>
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
            {lightboxIndex + 1} / {service.images.length}
          </div>

          {/* Prev */}
          {service.images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + service.images.length) % service.images.length) }}
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <img
            loading="eager"
            decoding="async"
            src={service.images[lightboxIndex]}
            alt={`${service.title} ${lightboxIndex + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain select-none"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {service.images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % service.images.length) }}
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

    </div>
  )
}
// Partnership types
import { supabase } from './supabaseClient';
import { formatCurrency } from './utils';
import { creditWallet } from './creditWallet';
import { executeWithCircuitBreaker } from './concurrency';
import type { UserPreferences } from '../types'

/**
 * Lookup country name for an IP address using ipapi.co with a short timeout.
 * Caches results in-memory. Returns null if lookup fails or no country found.
 */
async function lookupCountryByIp(_ip: string): Promise<string | null> {
  // Temporarily disable IP geolocation to avoid CORS issues
  // TODO: Implement a server-side solution for IP geolocation
  return null
}

// Visitor Activity Types
export interface VisitorSession {
  id: string;
  ip_address: string;
  user_id?: string;
  country?: string;
  city?: string;
  device_type?: string;
  browser_info?: string;
  user_agent?: string;
  first_visit_at: string;
  last_visit_at: string;
  visit_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceLike {
  id: string;
  service_id: string;
  visitor_session_id: string;
  user_id?: string;
  ip_address: string;
  liked_at: string;
  created_at: string;
}

export interface ServiceReview {
  id: string;
  service_id: string;
  visitor_session_id?: string;
  user_id?: string;
  ip_address?: string;
  visitor_name: string;
  visitor_email?: string;
  rating: number;
  kpi_ratings?: Record<string, number> | null;
  comment?: string;
  helpful_count: number;
  unhelpful_count: number;
  is_verified_booking: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  rejection_reason?: string;
  reviewer_city?: string;
  reviewer_country?: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
}

export interface VisitorActivity {
  id: string;
  service_id: string;
  vendor_id: string;
  total_views: number;
  unique_visitors: number;
  total_likes: number;
  total_reviews: number;
  approved_reviews: number;
  average_rating: number;
  total_helpful_count: number;
  views_this_month: number;
  likes_this_month: number;
  reviews_this_month: number;
  last_activity_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceViewLog {
  id: string;
  service_id: string;
  visitor_session_id: string;
  user_id?: string;
  ip_address: string;
  referrer?: string;
  viewed_at: string;
}

export interface PartnerRequest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  website?: string;
  message?: string;
  status: string;
  created_at: string;
  type?: 'partner_request' | 'business_referral';
  referrer_name?: string;
  referrer_email?: string;
  referrer_phone?: string;
  contact_person?: string;
  business_location?: string;
}

export interface Partner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  website?: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// User Preferences types
// UserPreferences type is imported from src/types

// Service Delete Request types
export interface ServiceDeleteRequest {
  id: string;
  service_id: string;
  vendor_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  admin_notes?: string;
  service?: any; // Service with category info
  vendor?: any; // Vendor info
}

// User Preferences API
export async function getUserPreferences(): Promise<UserPreferences | null> {
  try {
    // Check if user is authenticated
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      console.error('Session error:', sessionError)
      return null
    }
    if (!session) {
      console.warn('No active session for user preferences query')
      return null
    }

    // Don't manually filter by user_id since RLS will handle it
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .single();

    if (error) {
      // If no preferences found, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Supabase error fetching user preferences:', error)
      throw error;
    }

    return data as UserPreferences;
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    throw error;
  }
}

export async function saveUserPreferences(userId: string, preferences: {
  region: string;
  currency: string;
  language: string;
}): Promise<UserPreferences> {
  try {
    // Use atomic function to prevent race conditions
    const { data, error } = await supabase.rpc('save_user_preferences_atomic', {
      p_user_id: userId,
      p_region: preferences.region,
      p_currency: preferences.currency,
      p_language: preferences.language
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to save user preferences');
    }

    // Fetch the updated preferences to return
    const { data: updatedPrefs, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;
    return updatedPrefs as UserPreferences;
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
}

// Partner Requests API
export async function getPartnerRequests(): Promise<PartnerRequest[]> {
  const { data, error } = await supabase
    .from('partner_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PartnerRequest[];
}

export async function updatePartnerRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('partner_requests')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function createBusinessReferral(referralData: {
  referrer_name: string;
  referrer_email: string;
  referrer_phone?: string;
  name: string; // business name
  email: string; // contact email
  phone?: string; // contact phone
  company?: string; // business name again
  contact_person?: string;
  business_location?: string;
  message?: string; // business description
}): Promise<PartnerRequest> {
  // For now, map the referral data to the existing table structure
  // The referrer information will be included in the message field
  const messageWithReferral = `
Business Referral Submitted

Referrer Information:
- Name: ${referralData.referrer_name}
- Email: ${referralData.referrer_email}
${referralData.referrer_phone ? `- Phone: ${referralData.referrer_phone}` : ''}

Business Information:
- Business Name: ${referralData.name}
- Location: ${referralData.business_location || 'Not specified'}
- Contact Person: ${referralData.contact_person || 'Not specified'}
- Contact Email: ${referralData.email}
${referralData.phone ? `- Contact Phone: ${referralData.phone}` : ''}

Business Description:
${referralData.message || 'No description provided'}

Submitted via DirtTrails referral form.
  `.trim();

  const { data, error } = await supabase
    .from('partner_requests')
    .insert([{
      name: referralData.name,
      email: referralData.email,
      phone: referralData.phone,
      company: referralData.company,
      message: messageWithReferral,
      status: 'pending',
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data as PartnerRequest;
}

// Partners API
export async function getPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Partner[];
}

export async function addPartner(partner: Omit<Partner, 'id' | 'created_at' | 'updated_at'>): Promise<Partner> {
  const { data, error } = await supabase
    .from('partners')
    .insert([{ ...partner }])
    .select()
    .single();
  if (error) throw error;
  return data as Partner;
}

export async function updatePartner(id: string, updates: Partial<Omit<Partner, 'id' | 'created_at' | 'updated_at'>>): Promise<Partner> {
  const { data, error } = await supabase
    .from('partners')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Partner;
}
// Utility to get the first admin profile's ID

/**
 * Fetches the first admin profile's ID from the database.
 * Returns null if not found or on error.
 */
export async function getAdminProfileId(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    if (error || !data) {
      console.error('Error fetching admin profile ID:', error);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error('Exception fetching admin profile ID:', err);
    return null;
  }
}
// Database types
export type UserRole = 'tourist' | 'vendor' | 'admin'
export type UserStatus = 'active' | 'pending' | 'approved' | 'rejected' | 'suspended'
export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type ServiceStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'inactive'
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type TransactionType = 'payment' | 'withdrawal' | 'refund'
export type TransactionStatus = 'pending' | 'approved' | 'completed' | 'failed' | 'rejected'
export type ServiceDeleteRequestStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone?: string
  avatar_url?: string
  role: UserRole
  status?: UserStatus
  created_at: string
  updated_at: string
}

export interface Tourist {
  id: string
  user_id: string
  first_name?: string
  last_name?: string
  phone?: string
  country_code?: string
  tourist_home_city?: string
  tourist_home_country?: string
  emergency_contact?: string
  emergency_phone?: string
  emergency_country_code?: string
  emergency_relationship?: string
  emergency_email?: string
  emergency_address?: string
  travel_preferences?: string
  dietary_restrictions?: string
  medical_conditions?: string
  created_at: string
  updated_at: string
  profiles?: Profile
}

export interface Vendor {
  id: string
  user_id: string
  first_name?: string
  last_name?: string
  business_name: string
  business_description?: string
  business_address?: string
  business_city?: string
  business_phone?: string
  business_phones?: string[]
  // Payment / payout fields
  bank_details?: {
    name?: string
    account_name?: string
    account_number?: string
    branch?: string
    swift?: string
    [key: string]: any
  }
  mobile_money_accounts?: Array<{
    provider?: string
    phone?: string
    country_code?: string
    name?: string
    [key: string]: any
  }>
  crypto_accounts?: Array<{
    currency?: string
    address?: string
    label?: string
    [key: string]: any
  }>
  preferred_payout?: string
  business_email?: string
  business_website?: string
  business_type?: string
  operating_hours?: string
  years_in_business?: string
  business_license?: string
  tax_id?: string
  status: VendorStatus
  approved_at?: string
  approved_by?: string
  created_at: string
  updated_at: string
  profiles?: Profile
}

export interface ServiceCategory {
  id: string
  name: string
  description?: string
  icon?: string
  created_at: string
}

export interface Service {
  id: string
  slug?: string
  vendor_id: string
  category_id: string
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  location?: string
  duration_hours?: number
  max_capacity?: number
  amenities: string[]
  status: ServiceStatus
  approved_at?: string
  approved_by?: string
  created_at: string
  updated_at: string

  // Enhanced general fields
  duration_days?: number
  group_size_min?: number
  group_size_max?: number
  best_time_to_visit?: string
  what_to_bring?: string[]
  age_restrictions?: string
  health_requirements?: string
  accessibility_features?: string[]
  sustainability_certified?: boolean
  eco_friendly?: boolean

  // Hotel-specific fields
  room_types?: string[]
  check_in_time?: string
  check_out_time?: string
  star_rating?: number
  facilities?: string[]
  total_rooms?: number
  room_amenities?: string[]
  nearby_attractions?: string[]
  parking_available?: boolean
  pet_friendly?: boolean
  breakfast_included?: boolean

  // Tour-specific fields
  itinerary?: string[]
  included_items?: string[]
  excluded_items?: string[]
  difficulty_level?: 'easy' | 'moderate' | 'challenging' | 'difficult'
  minimum_age?: number
  languages_offered?: string[]
  tour_highlights?: string[]
  meeting_point?: string
  end_point?: string
  transportation_included?: boolean
  meals_included?: string[]
  guide_included?: boolean

  // Transport-specific fields
  vehicle_type?: string
  vehicle_capacity?: number
  pickup_locations?: string[]
  dropoff_locations?: string[]
  route_description?: string
  driver_included?: boolean
  air_conditioning?: boolean
  gps_tracking?: boolean
  fuel_included?: boolean
  tolls_included?: boolean
  insurance_included?: boolean

  // Restaurant-specific fields
  cuisine_type?: string
  opening_hours?: { [key: string]: string }
  menu_items?: string[]
  dietary_options?: string[]
  average_cost_per_person?: number
  reservations_required?: boolean
  outdoor_seating?: boolean
  live_music?: boolean
  private_dining?: boolean
  alcohol_served?: boolean

  // Guide-specific fields
  languages_spoken?: string[]
  specialties?: string[]
  certifications?: string[]
  years_experience?: number
  service_area?: string
  license_number?: string
  emergency_contact?: string
  first_aid_certified?: boolean
  vehicle_owned?: boolean

  // Activity-specific fields
  activity_type?: string
  skill_level_required?: string
  equipment_provided?: string[]
  safety_briefing_required?: boolean
  weather_dependent?: boolean
  seasonal_availability?: string

  // Rental-specific fields
  rental_items?: string[]
  rental_duration?: string
  deposit_required?: number
  insurance_required?: boolean
  delivery_available?: boolean
  maintenance_included?: boolean

  // Event-specific fields
  event_type?: string
  event_date?: string
  event_duration_hours?: number
  max_participants?: number
  materials_included?: string[]
  prerequisites?: string

  // Agency-specific fields
  services_offered?: string[]
  destinations_covered?: string[]
  booking_fee?: number
  customization_available?: boolean
  emergency_support?: boolean

  // Flight-specific fields
  flight_number?: string
  airline?: string
  departure_airport?: string
  arrival_airport?: string
  departure_city?: string
  arrival_city?: string
  departure_time?: string
  arrival_time?: string
  duration_minutes?: number
  aircraft_type?: string
  business_price?: number
  first_class_price?: number
  total_seats?: number
  available_seats?: number
  flight_class?: 'economy' | 'business' | 'first_class'
  baggage_allowance?: string

  // Enhanced contact and booking info
  tags?: string[]
  contact_info?: { phone?: string; email?: string; website?: string }
  booking_requirements?: string
  cancellation_policy?: string
  website_url?: string
  social_media?: { [key: string]: string }
  emergency_phone?: string
  booking_deadline_hours?: number
  payment_methods?: string[]
  refund_policy?: string

  vendors?: Vendor
  service_categories?: ServiceCategory
}

export interface Flight {
  id: string
  flight_number: string
  airline: string
  departure_airport: string
  arrival_airport: string
  departure_city: string
  arrival_city: string
  departure_time: string
  arrival_time: string
  duration_minutes: number
  aircraft_type?: string
  economy_price: number
  business_price?: number
  first_class_price?: number
  currency: string
  total_seats: number
  available_seats: number
  status: 'active' | 'cancelled' | 'delayed' | 'completed'
  flight_class: 'economy' | 'business' | 'first_class'
  amenities: string[]
  baggage_allowance?: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  service_id: string
  tourist_id?: string // Made optional for guest bookings
  vendor_id: string
  booking_date: string
  service_date?: string
  booking_time?: string
  guests: number
  total_amount: number
  currency: string
  status: BookingStatus
  payment_status: 'pending' | 'paid' | 'refunded'
  special_requests?: string
  payment_reference?: string
  rejection_reason?: string // Reason for rejecting a booking
  created_at: string
  updated_at: string
  services?: Service
  profiles?: Profile
  // Guest booking fields
  guest_name?: string
  guest_email?: string
  guest_phone?: string
  is_guest_booking?: boolean
  // Transport-specific fields
  pickup_location?: string
  dropoff_location?: string
  driver_option?: string
  return_trip?: boolean
  start_time?: string
  end_time?: string
  end_date?: string
}

export interface Wallet {
  id: string
  vendor_id: string
  balance: number
  currency: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  booking_id?: string
  vendor_id?: string
  tourist_id?: string
  amount: number
  currency: string
  transaction_type: 'payment' | 'withdrawal' | 'refund'
  status: TransactionStatus
  payment_method: 'card' | 'mobile_money' | 'bank_transfer'
  reference: string
  payout_meta?: any
  created_at: string
}

export interface Inquiry {
  id: string
  service_id: string
  vendor_id: string
  name: string
  email: string
  phone?: string
  preferred_date?: string
  number_of_guests: number
  message?: string
  contact_method: 'email' | 'phone'
  category_specific_data: Record<string, any>
  status: 'unread' | 'read' | 'responded' | 'archived'
  responded_at?: string
  response_message?: string
  created_at: string
  updated_at: string

  // Relations
  services?: {
    id: string
    title: string
    service_categories?: {
      name: string
    }
  }
  vendors?: Vendor
}

// Service CRUD operations
export async function getServices(vendorId?: string) {
  let query = supabase
    .from('services')
    .select(`
      *,
      vendors (
        id,
        business_name,
        business_description,
        business_email,
        status
      ),
      service_categories (
        id,
        name,
        icon
      ),
      ticket_types (
        id,
        title,
        description,
        price,
        quantity,
        sold,
        metadata,
        sale_start,
        sale_end
      )
    `)

  if (vendorId) {
    // Vendor wants to see their own services (including pending)
    query = query.eq('vendor_id', vendorId)
  } else {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    let isAdmin = false;
    
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      isAdmin = profile?.role === 'admin';
    }

    if (!isAdmin) {
      // Public listings should only include approved/active services
      query = query.in('status', ['approved', 'active'])
    }
    // If admin, don't filter by status - show all services
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching services:', error)
    throw error
  }

  return data || []
}

export async function getServicesByCategory(categoryId: string, excludeServiceId?: string, limit: number = 10) {
  let query = supabase
    .from('services')
    .select(`
      *,
      vendors (
        id,
        business_name,
        business_description,
        business_email,
        status
      ),
      service_categories (
        id,
        name,
        icon
      ),
      ticket_types (
        id,
        title,
        description,
        price,
        quantity,
        sold,
        metadata,
        sale_start,
        sale_end
      )
    `)
    .eq('category_id', categoryId)

  // Check if current user is admin
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    isAdmin = profile?.role === 'admin';
  }

  if (!isAdmin) {
    // Public listings should only include approved/active services
    query = query.in('status', ['approved', 'active'])
  }

  if (excludeServiceId) {
    query = query.neq('id', excludeServiceId)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching services by category:', error)
    throw error
  }

  return data || []
}

export async function getServiceCategories() {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching service categories:', error)
    throw error
  }

  return data || []
}

export async function getServiceById(serviceId: string, options?: { vendorId?: string; includeUnapproved?: boolean }) {
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      service_categories(*),
      vendors(*)
    `)
    .eq('id', serviceId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching service:', error)
    throw error
  }

  if (!data) return data

  // If caller didn't request unapproved services, hide them from public consumers
  if (!options?.includeUnapproved) {
    const status = data.status
    const isOwner = options?.vendorId && data.vendor_id === options.vendorId
    if (!isOwner && status !== 'approved' && status !== 'active') {
      return null
    }
  }

  return data
}

export async function getServiceBySlug(serviceSlug: string, options?: { vendorId?: string; includeUnapproved?: boolean }) {
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      service_categories(*),
      vendors(*)
    `)
    .eq('slug', serviceSlug)
    .maybeSingle()

  if (error) {
    console.error('Error fetching service by slug:', error)
    throw error
  }

  if (!data) return data

  // Hide unapproved services from public consumers unless caller is the owner or explicitly included
  if (!options?.includeUnapproved) {
    const status = data.status
    const isOwner = options?.vendorId && data.vendor_id === options.vendorId
    if (!isOwner && status !== 'approved' && status !== 'active') {
      return null
    }
  }

  return data
}

export async function createService(serviceData: {
  vendor_id: string
  category_id: string
  title: string
  description: string
  price: number
  currency?: string
  images?: string[]
  location?: string
  duration_hours?: number
  max_capacity?: number
  amenities?: string[]

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
  difficulty_level?: 'easy' | 'moderate' | 'challenging' | 'difficult'
  minimum_age?: number
  languages_offered?: string[]

  // Transport-specific fields
  vehicle_type?: string
  vehicle_capacity?: number
  pickup_locations?: string[]
  dropoff_locations?: string[]
  route_description?: string

  // Restaurant-specific fields
  cuisine_type?: string
  opening_hours?: { [key: string]: string }
  menu_items?: string[]
  dietary_options?: string[]
  average_cost_per_person?: number

  // Guide-specific fields
  languages_spoken?: string[]
  specialties?: string[]
  certifications?: string[]
  years_experience?: number
  service_area?: string

  // General metadata
  tags?: string[]
  contact_info?: { phone?: string; email?: string; website?: string }
  booking_requirements?: string
  cancellation_policy?: string

  status?: string
}) {
  try {
    // Try atomic RPC first, fall back to direct insert if RPC fails
    let serviceId: string;
    try {
      const result = await supabase.rpc('create_service_atomic', {
        p_vendor_id: serviceData.vendor_id,
        p_category_id: serviceData.category_id,
        p_title: serviceData.title,
        p_description: serviceData.description,
        p_price: serviceData.price,
        p_currency: serviceData.currency || 'UGX',
        p_images: serviceData.images || [],
        p_location: serviceData.location,
        p_duration_hours: serviceData.duration_hours,
        p_max_capacity: serviceData.max_capacity,
        p_amenities: serviceData.amenities || [],
        p_status: serviceData.status || 'pending'
      });

      if (result.error) throw result.error;

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Failed to create service');
      }

      serviceId = result.data.service_id;
    } catch (rpcError: any) {
      console.warn('RPC create_service_atomic failed, falling back to direct insert:', rpcError?.code || rpcError?.message);

      // Fallback: direct table insert
      const { data: inserted, error: insertError } = await supabase
        .from('services')
        .insert({
          vendor_id: serviceData.vendor_id,
          category_id: serviceData.category_id,
          title: serviceData.title,
          description: serviceData.description,
          price: serviceData.price,
          currency: serviceData.currency || 'UGX',
          images: serviceData.images || [],
          location: serviceData.location || null,
          duration_hours: serviceData.duration_hours || null,
          max_capacity: serviceData.max_capacity || null,
          amenities: serviceData.amenities || [],
          status: serviceData.status || 'pending'
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      serviceId = inserted.id;
    }

    const basicFields = ['vendor_id', 'category_id', 'title', 'description', 'price', 'currency', 'images', 'location', 'duration_hours', 'max_capacity', 'amenities', 'status'];

    // If there are additional fields, update the service with them
    if (Object.keys(serviceData).some(key => !basicFields.includes(key))) {
      // Extract additional fields
      const additionalFields: any = {};
      Object.keys(serviceData).forEach(key => {
        if (!basicFields.includes(key) && serviceData[key as keyof typeof serviceData] !== undefined) {
          const value = serviceData[key as keyof typeof serviceData];
          if (value === '') return; // Skip empty strings
          additionalFields[key] = value;
        }
      });

      if (Object.keys(additionalFields).length > 0) {
        await updateService(serviceId, serviceData.vendor_id, additionalFields);
      }
    }

    // Fetch the complete service with relations
    const { data: service, error: fetchError } = await supabase
      .from('services')
      .select(`
        *,
        vendors (
          id,
          business_name,
          business_description,
          business_email,
          status
        ),
        service_categories (
          id,
          name,
          icon
        )
      `)
      .eq('id', serviceId)
      .single();

    if (fetchError) throw fetchError;
    return service;

  } catch (error) {
    console.error('Error creating service:', error);
    throw error;
  }
}

export async function updateService(serviceId: string, vendorId: string | undefined, updates: Partial<{
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  location: string
  duration_hours: number
  max_capacity: number
  amenities: string[]
  status: string
  category_id: string

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
  difficulty_level?: 'easy' | 'moderate' | 'challenging' | 'difficult'
  minimum_age?: number
  languages_offered?: string[]

  // Transport-specific fields
  vehicle_type?: string
  vehicle_capacity?: number
  pickup_locations?: string[]
  dropoff_locations?: string[]
  route_description?: string

  // Restaurant-specific fields
  cuisine_type?: string
  opening_hours?: { [key: string]: string }
  menu_items?: string[]
  dietary_options?: string[]
  average_cost_per_person?: number

  // Guide-specific fields
  languages_spoken?: string[]
  specialties?: string[]
  certifications?: string[]
  years_experience?: number
  service_area?: string

  // General metadata
  tags?: string[]
  contact_info?: { phone?: string; email?: string; website?: string }
  booking_requirements?: string
  cancellation_policy?: string
}>): Promise<any> {
  try {
    // Whitelist of columns that actually exist in the database
    const validColumns = new Set([
      'title', 'description', 'price', 'currency', 'images', 'location', 'duration_hours',
      'max_capacity', 'amenities', 'status', 'category_id', 'updated_at',
      // Enhanced general fields
      'duration_days', 'group_size_min', 'group_size_max', 'best_time_to_visit', 'what_to_bring',
      'age_restrictions', 'health_requirements', 'accessibility_features', 'sustainability_certified', 'eco_friendly',
      // Hotel fields (note: check_in_time and check_out_time don't exist, but check_in_process does)
      'total_rooms', 'room_amenities', 'nearby_attractions', 'parking_available', 'pet_friendly',
      'breakfast_included', 'star_rating', 'property_type', 'facilities', 'wifi_available',
      'minimum_stay', 'maximum_guests', 'common_facilities', 'generator_backup', 'smoking_allowed',
      'children_allowed', 'disabled_access', 'concierge_service', 'house_rules', 'local_recommendations',
      'check_in_process',
      // Tour fields
      'itinerary', 'included_items', 'excluded_items', 'difficulty_level', 'minimum_age', 'languages_offered',
      'tour_highlights', 'meeting_point', 'end_point', 'transportation_included', 'meals_included',
      'guide_included', 'accommodation_included',
      // Transport fields
      'vehicle_type', 'vehicle_capacity', 'pickup_locations', 'dropoff_locations', 'route_description',
      'license_required', 'booking_notice_hours', 'usb_charging', 'child_seat', 'roof_rack',
      'towing_capacity', 'four_wheel_drive', 'automatic_transmission', 'transport_terms',
      'driver_included', 'air_conditioning', 'gps_tracking', 'fuel_included', 'tolls_included',
      'insurance_included', 'reservations_required',
      // Restaurant fields
      'cuisine_type', 'opening_hours', 'menu_items', 'dietary_options', 'average_cost_per_person',
      'price_range', 'advance_booking_days', 'dress_code', 'menu_highlights', 'restaurant_atmosphere',
      'restaurant_notes', 'outdoor_seating', 'live_music', 'private_dining', 'alcohol_served',
      // Guide fields
      'languages_spoken', 'specialties', 'certifications', 'years_experience', 'service_area',
      'first_aid_certified', 'emergency_contact',
      // Activity fields
      'activity_type', 'skill_level_required', 'equipment_provided', 'safety_briefing_required',
      'weather_dependent', 'seasonal_availability',
      // Equipment rental fields
      'rental_items', 'rental_duration', 'deposit_required', 'insurance_required', 'delivery_available',
      'maintenance_included', 'replacement_value', 'delivery_radius', 'usage_instructions',
      'maintenance_requirements', 'training_provided', 'cleaning_included', 'repair_service',
      'equipment_condition', 'rental_terms',
      // Event fields
      'event_type', 'event_date', 'event_duration_hours', 'max_participants', 'materials_included',
      'prerequisites', 'learning_outcomes', 'instructor_credentials', 'certificates_provided',
      'refreshments_included', 'take_home_materials', 'photography_allowed', 'recording_allowed',
  'group_discounts', 'event_status', 'event_datetime', 'registration_deadline', 'ticket_price',
    'early_bird_price', 'ticket_purchase_link', 'event_location', 'event_highlights',
    'event_inclusions', 'event_prerequisites', 'event_description', 'event_cancellation_policy',
  // Admin-controlled scan/link activation for events
  'scan_enabled',
    // Travel agency fields
    'services_offered', 'destinations_covered', 'booking_fee', 'customization_available',
    'emergency_support', 'website_url', 'social_media', 'emergency_phone', 'booking_deadline_hours',
    'payment_methods', 'refund_policy', 'iata_number', 'specializations', 'success_stories',
    'insurance_brokerage', 'visa_assistance', 'group_bookings', 'corporate_accounts', 'agency_description',
    // Flight fields
    'flight_number', 'airline', 'aircraft_type', 'departure_city', 'arrival_city', 'departure_airport',
    'arrival_airport', 'departure_time', 'arrival_time', 'duration_minutes', 'economy_price',
    'business_price', 'first_class_price', 'total_seats', 'available_seats', 'flight_class',
    'flight_status', 'baggage_allowance', 'flight_amenities', 'flexible_booking', 'lounge_access',
    'priority_boarding', 'flight_meals_included', 'flight_notes',
    // General metadata
    'tags', 'contact_info', 'booking_requirements', 'cancellation_policy'
  ]);

  // Filter updates to only include valid columns
  const filteredUpdates: any = {};
  Object.keys(updates).forEach(key => {
    if (validColumns.has(key) && updates[key as keyof typeof updates] !== undefined) {
      const value = updates[key as keyof typeof updates];
      // Skip empty strings — they cause DB errors on typed columns (timestamps, numerics, etc.)
      if (value === '') return;
      filteredUpdates[key] = value;
    }
  });

  // Always include updated_at
  filteredUpdates.updated_at = new Date().toISOString();

  console.log('Valid updates:', filteredUpdates);

  // Try atomic RPC first, fall back to direct update if RPC fails (e.g. PGRST203 overload issue)
  try {
    const result = await supabase.rpc('update_service_atomic', {
      p_service_id: serviceId,
      p_updates: filteredUpdates,
      p_vendor_id: vendorId
    });

    console.log('updateService: RPC result:', result);

    if (result.error) throw result.error;

    if (!result.data?.success) {
      throw new Error(result.data?.error || 'Failed to update service');
    }
  } catch (rpcError: any) {
    console.warn('RPC update_service_atomic failed, falling back to direct update:', rpcError?.code || rpcError?.message, rpcError);
    
    // Fallback: direct table update
    const updateQuery = supabase
      .from('services')
      .update(filteredUpdates)
      .eq('id', serviceId);

    // If vendorId is provided, also filter by it for authorization
    if (vendorId) {
      updateQuery.eq('vendor_id', vendorId);
    }

    // Use select().single() so we get the updated row back and detect zero-row updates
    const { data: directUpdated, error: directError } = await updateQuery.select().single();
    if (directError) {
      console.error('updateService: direct update error (no rows updated?):', directError);
      throw directError;
    }
    if (!directUpdated) {
      const msg = `updateService: direct update did not return an updated row for ${serviceId}`;
      console.error(msg);
      throw new Error(msg);
    }
    console.log('updateService: direct update succeeded for', serviceId);
  }

  // Fetch the updated service with relations
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      vendors (
        id,
        business_name,
        business_description,
        business_email,
        status
      ),
      service_categories (
        id,
        name,
        icon
      )
    `)
    .eq('id', serviceId)
    .single();

  if (error) throw error;
  console.log('updateService: fetched updated service:', { id: data?.id, title: data?.title });
  // Compare filteredUpdates to returned data for quick mismatch detection
  try {
    const mismatches: string[] = [];
    Object.keys(filteredUpdates).forEach(k => {
      try {
        const sent = filteredUpdates[k as keyof typeof filteredUpdates];
        const got = (data as any)?.[k];
        if (typeof sent === 'object') {
          if (JSON.stringify(sent) !== JSON.stringify(got)) mismatches.push(k);
        } else {
          if (String(sent) !== String(got)) mismatches.push(k);
        }
      } catch (e) {
        mismatches.push(k);
      }
    });
    if (mismatches.length > 0) {
      console.warn('updateService: mismatch between sent updates and DB for keys:', mismatches, { sent: filteredUpdates, got: data });
      // Retry with direct update to ensure changes are applied
      try {
        console.warn('updateService: attempting direct update retry due to mismatch...');
        const directQuery = supabase.from('services').update(filteredUpdates).eq('id', serviceId);
        if (vendorId) directQuery.eq('vendor_id', vendorId);
        const { data: retryData, error: retryError } = await directQuery.select().single();
        if (retryError) {
          console.error('updateService: direct retry error:', retryError);
        } else {
          console.log('updateService: direct retry returned:', { id: retryData?.id, title: retryData?.title });
          return retryData;
        }
      } catch (retryErr) {
        console.error('updateService: error during direct retry:', retryErr);
      }
    }
  } catch (e) {
    console.warn('updateService: error while comparing updates to DB result', e);
  }
  return data;

  } catch (error) {
    console.error('Error updating service:', error);
    throw error;
  }
}

export async function deleteService(serviceId: string, vendorId?: string) {
  console.log('deleteService called with:', { serviceId, vendorId });

  try {
    // Determine if user is admin
    let isAdmin = false;
    if (!vendorId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Unauthorized: User not authenticated');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Unauthorized: Profile not found');
      }

      isAdmin = profile.role === 'admin';
      if (!isAdmin) {
        throw new Error('Unauthorized: Only admins can delete services without vendor context');
      }
    }

    // Use atomic function for service deletion
    const result = await supabase.rpc('delete_service_atomic', {
      p_service_id: serviceId,
      p_vendor_id: vendorId,
      p_is_admin: isAdmin
    });

    if (result.error) throw result.error;

    if (!result.data?.success) {
      throw new Error(result.data?.error || 'Failed to delete service');
    }

    console.log('Service deleted successfully');
  } catch (error) {
    console.error('Error deleting service:', error);
    throw error;
  }
}

// Check service availability for a specific date and number of guests
export async function checkServiceAvailability(serviceId: string, serviceDate: string, guests: number): Promise<{
  available: boolean;
  available_capacity?: number;
  requested_guests?: number;
  max_capacity?: number;
  unlimited_capacity?: boolean;
  error?: string;
}> {
  try {
    const result = await supabase.rpc('check_service_availability', {
      p_service_id: serviceId,
      p_service_date: serviceDate,
      p_requested_guests: guests
    });

    if (result.error) throw result.error;

    return result.data as {
      available: boolean;
      available_capacity?: number;
      requested_guests?: number;
      max_capacity?: number;
      unlimited_capacity?: boolean;
      error?: string;
    };
  } catch (error) {
    console.error('Error checking service availability:', error);
    throw error;
  }
}

// Image upload functions
export async function uploadServiceImage(file: File, serviceId?: string): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${serviceId || 'temp'}_${Date.now()}.${fileExt}`
  const filePath = `services/${fileName}`

  const { error } = await supabase.storage
    .from('service-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error('Error uploading image:', error)
    throw error
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('service-images')
    .getPublicUrl(filePath)

  return publicUrl
}

export async function deleteServiceImage(imageUrl: string): Promise<void> {
  // Extract file path from URL
  const urlParts = imageUrl.split('/')
  const fileName = urlParts[urlParts.length - 1]
  const filePath = `services/${fileName}`

  const { error } = await supabase.storage
    .from('service-images')
    .remove([filePath])

  if (error) {
    console.error('Error deleting image:', error)
    throw error
  }
}

// Flight-related database functions
export async function getFlights(): Promise<Flight[]> {
  const { data, error } = await supabase
    .from('flights')
    .select('*')
    .order('departure_time', { ascending: true })

  if (error) {
    console.error('Error fetching flights:', error)
    throw error
  }

  return data || []
}

export async function getFlightById(id: string): Promise<Flight | null> {
  const { data, error } = await supabase
    .from('flights')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching flight:', error)
    throw error
  }

  return data
}

export async function createFlight(flight: Omit<Flight, 'id' | 'created_at' | 'updated_at'>): Promise<Flight> {
  const { data, error } = await supabase
    .from('flights')
    .insert(flight)
    .select()
    .single()

  if (error) {
    console.error('Error creating flight:', error)
    throw error
  }

  return data
}

export async function updateFlight(id: string, updates: Partial<Flight>): Promise<Flight> {
  const { data, error } = await supabase
    .from('flights')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating flight:', error)
    throw error
  }

  return data
}

export async function deleteFlight(id: string): Promise<void> {
  const { error } = await supabase
    .from('flights')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting flight:', error)
    throw error
  }
}

export async function updateFlightStatus(id: string, status: Flight['status']): Promise<Flight> {
  const { data, error } = await supabase
    .from('flights')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating flight status:', error)
    throw error
  }

  return data
}

// Service Delete Request functions
export async function createServiceDeleteRequest(serviceId: string, vendorId: string, reason: string): Promise<ServiceDeleteRequest> {
  try {
    const { data, error } = await supabase
      .from('service_delete_requests')
      .insert([{
        service_id: serviceId,
        vendor_id: vendorId,
        reason: reason
      }])
      .select(`
        *,
        service:services(*, service_categories(*)),
        vendor:vendors(*)
      `)
      .single()

    if (error) {
      // Check if the error is because the table doesn't exist
      if (error.message?.includes('relation "service_delete_requests" does not exist')) {
        throw new Error('Delete request functionality is not available yet. Please run the database migration first.')
      }
      console.error('Error creating service delete request:', error)
      throw error
    }

    return data
  } catch (err) {
    // If it's our custom error message, re-throw it
    if (err instanceof Error && err.message.includes('Delete request functionality is not available yet')) {
      throw err
    }
    // Otherwise, provide a generic error
    console.error('Error creating service delete request:', err)
    throw new Error('Failed to create delete request. The database table may not exist yet.')
  }
}

// Activation request functions
export async function createActivationRequest(serviceId: string, vendorId: string, requesterId?: string) {
  try {
    const { data, error } = await supabase
      .from('activation_requests')
      .insert([{ service_id: serviceId, vendor_id: vendorId, requester_id: requesterId }])
      .select(`*, service:services(*), vendor:vendors(*)`)
      .single()

    if (error) {
      if (error.message?.includes('relation "activation_requests" does not exist')) {
        throw new Error('Activation request functionality is not available yet. Please run the database migration first.')
      }
      console.error('Error creating activation request:', error)
      throw error
    }

    // Notify admin about the activation request using messages
    const adminId = await getAdminProfileId()
    if (adminId) {
      // Try to find vendor user/profile id
      let vendorProfileId: string | null = null
      try {
        const { data: vendorRecord } = await supabase.from('vendors').select('user_id').eq('id', vendorId).single()
        vendorProfileId = vendorRecord?.user_id || null
      } catch (e) {
        console.warn('Could not fetch vendor record for activation notification', e)
      }

      const subject = `Activation request for service ${data?.service?.title || serviceId}`
      const message = `Vendor ${data?.vendor?.business_name || vendorId} has requested activation for service ${data?.service?.title || serviceId}. Service ID: ${serviceId}`

      if (vendorProfileId) {
        // sendMessage expects sender_id, recipient_id to be profile ids. Use vendor as sender to admin.
        await sendMessage({ sender_id: vendorProfileId, sender_role: 'vendor', recipient_id: adminId, recipient_role: 'admin', subject, message })
      } else {
        // fallback: send system message
        await sendMessage({ sender_id: adminId, sender_role: 'admin', recipient_id: adminId, recipient_role: 'admin', subject, message })
      }
    }

    return data
  } catch (err) {
    if (err instanceof Error && err.message.includes('Activation request functionality is not available yet')) throw err
    console.error('Error creating activation request:', err)
    throw new Error('Failed to create activation request')
  }
}

export async function getActivationRequests(vendorId?: string) {
  try {
    let query = supabase.from('activation_requests').select(`*, service:services(*), vendor:vendors(*)`).order('requested_at', { ascending: false })
    if (vendorId) query = query.eq('vendor_id', vendorId)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error fetching activation requests:', err)
    throw err
  }
}

export async function updateActivationRequestStatus(requestId: string, status: 'pending' | 'approved' | 'rejected', adminId?: string, adminNotes?: string) {
  try {
    const updates: any = { status }
    if (adminId) updates.admin_id = adminId
    if (adminNotes) updates.admin_notes = adminNotes
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase.from('activation_requests').update(updates).eq('id', requestId).select(`*, service:services(*), vendor:vendors(*)`).single()
    if (error) throw error

    // If approved, enable scan_enabled on the service
    if (status === 'approved' && data?.service?.id) {
      await updateService(data.service.id, undefined, { scan_enabled: true } as any)
    }

    return data
  } catch (err) {
    console.error('Error updating activation request status:', err)
    throw err
  }
}

// Event OTP functions
export async function createEventOTP(serviceId: string, ttlMinutes = 30) {
  try {
    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

    const { data, error } = await supabase.from('event_otps').insert([{ service_id: serviceId, otp, expires_at: expiresAt }]).select().single()
    if (error) throw error

    // Notify admin and event organizer via email and SMS
    const service = await getServiceById(serviceId)
    const adminId = await getAdminProfileId()
    let vendorProfileId: string | null = null
    try {
      const { data: vendorRecord } = await supabase.from('vendors').select('user_id').eq('id', service?.vendor_id).single()
      vendorProfileId = vendorRecord?.user_id || null
    } catch (e) {
      console.warn('Could not fetch vendor profile for OTP notification', e)
    }

    // Get admin and vendor contact information
    let adminEmail: string | null = null
    let adminPhone: string | null = null
    let vendorEmail: string | null = null
    let vendorPhone: string | null = null

    if (adminId) {
      try {
        const { data: adminProfile } = await supabase.from('profiles').select('email, phone').eq('id', adminId).single()
        adminEmail = adminProfile?.email || null
        adminPhone = adminProfile?.phone || null
      } catch (e) {
        console.warn('Could not fetch admin profile for OTP notification', e)
      }
    }

    if (vendorProfileId) {
      try {
        const { data: vendorProfile } = await supabase.from('profiles').select('email, phone').eq('id', vendorProfileId).single()
        vendorEmail = vendorProfile?.email || null
        vendorPhone = vendorProfile?.phone || null
      } catch (e) {
        console.warn('Could not fetch vendor profile for OTP notification', e)
      }
    }

    const subject = `OTP for event access: ${service?.title || serviceId}`
    const message = `An OTP was issued for access to event ${service?.title || serviceId}: ${otp}. It expires at ${expiresAt}.`

    // Send email notifications
    if (adminEmail) {
      await sendOTPNotification({ 
        to: adminEmail, 
        subject, 
        message: `Admin notification: ${message}`,
        type: 'email' 
      })
    }

    if (vendorEmail) {
      await sendOTPNotification({ 
        to: vendorEmail, 
        subject, 
        message: `Vendor notification: ${message}`,
        type: 'email' 
      })
    }

    // Send SMS notifications
    if (adminPhone) {
      await sendOTPNotification({ 
        to: adminPhone, 
        message: `Admin notification: ${message}`,
        type: 'sms' 
      })
    }

    if (vendorPhone) {
      await sendOTPNotification({ 
        to: vendorPhone, 
        message: `Vendor notification: ${message}`,
        type: 'sms' 
      })
    }

    // Also send internal messages as backup
    if (adminId) {
      // Send to admin from vendor if vendorProfileId else from admin
      if (vendorProfileId) await sendMessage({ sender_id: vendorProfileId, sender_role: 'vendor', recipient_id: adminId, recipient_role: 'admin', subject, message })
      else await sendMessage({ sender_id: adminId, sender_role: 'admin', recipient_id: adminId, recipient_role: 'admin', subject, message })
    }

    if (vendorProfileId) {
      await sendMessage({ sender_id: adminId || vendorProfileId, sender_role: adminId ? 'admin' : 'vendor', recipient_id: vendorProfileId, recipient_role: 'vendor', subject, message })
    }

    return data
  } catch (err) {
    console.error('Error creating event OTP:', err)
    throw err
  }
}

export async function verifyEventOTP(serviceId: string, otp: string) {
  try {
    const { data: rows, error } = await supabase.from('event_otps').select('*').eq('service_id', serviceId).eq('otp', otp).eq('used', false)
    if (error) throw error
    const found = (rows || []).find((r: any) => new Date(r.expires_at) > new Date())
    if (!found) return { valid: false }

    // mark used
    await supabase.from('event_otps').update({ used: true }).eq('id', found.id)
    return { valid: true }
  } catch (err) {
    console.error('Error verifying event OTP:', err)
    throw err
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-password', {
      body: { password }
    })

    if (error) {
      console.error('Error verifying password:', error)
      return false
    }

    return data?.valid === true
  } catch (err) {
    console.error('Error verifying password:', err)
    return false
  }
}

// Ticketing helpers for event management
export async function createTicketType(serviceId: string, payload: { title: string; description?: string; price: number; quantity: number; metadata?: any; sale_start?: string; sale_end?: string }) {
  try {
    const { data, error } = await supabase.from('ticket_types').insert([{
      service_id: serviceId,
      title: payload.title,
      description: payload.description,
      price: payload.price,
      quantity: payload.quantity,
      metadata: payload.metadata,
      sale_start: payload.sale_start,
      sale_end: payload.sale_end
    }]).select().single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error creating ticket type:', err)
    throw err
  }
}

export async function getTicketTypes(serviceId: string) {
  try {
    const { data, error } = await supabase.from('ticket_types').select('*').eq('service_id', serviceId)
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error fetching ticket types:', err)
    throw err
  }
}

export async function updateTicketType(ticketTypeId: string, payload: { title?: string; description?: string; price?: number; quantity?: number; metadata?: any; sale_start?: string; sale_end?: string }) {
  try {
    const { data, error } = await supabase.from('ticket_types').update({
      title: payload.title,
      description: payload.description,
      price: payload.price,
      quantity: payload.quantity,
      metadata: payload.metadata,
      sale_start: payload.sale_start,
      sale_end: payload.sale_end
    }).eq('id', ticketTypeId).select().single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error updating ticket type:', err)
    throw err
  }
}

export async function deleteTicketType(ticketTypeId: string) {
  try {
    const { error } = await supabase.from('ticket_types').delete().eq('id', ticketTypeId)
    if (error) throw error
    return { success: true }
  } catch (err) {
    console.error('Error deleting ticket type:', err)
    throw err
  }
}

export async function createOrder(userId: string | null, vendorId: string | null, items: { ticket_type_id: string; quantity: number; unit_price: number }[], currency = 'UGX') {
  try {
    const total = items.reduce((s, it) => s + (it.unit_price * it.quantity), 0)

    const { data: order, error: orderError } = await supabase.from('orders').insert([{ user_id: userId, vendor_id: vendorId, total_amount: total, currency, status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]).select().single()
    if (orderError) throw orderError

    const orderItems = items.map(it => ({ order_id: order.id, ticket_type_id: it.ticket_type_id, quantity: it.quantity, unit_price: it.unit_price, total_price: it.unit_price * it.quantity }))
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) throw itemsError

    return order
  } catch (err) {
    console.error('Error creating order:', err)
    throw err
  }
}

export async function confirmOrderAndIssueTickets(orderId: string, payment: { vendor_id: string; tourist_id?: string; amount: number; currency: string; payment_method: string; reference?: string }) {
  return executeWithCircuitBreaker(async () => {
    // Mark order as paid
    const { data: order, error: orderError } = await supabase.from('orders').update({ status: 'paid', reference: payment.reference, updated_at: new Date().toISOString() }).eq('id', orderId).select().single()
    if (orderError) throw orderError

    // Create transaction record
    try {
      await addTransaction({ booking_id: undefined as any, vendor_id: payment.vendor_id, tourist_id: payment.tourist_id, amount: payment.amount, currency: payment.currency, transaction_type: 'payment', status: 'completed', payment_method: payment.payment_method as any, reference: payment.reference || `TKT_${orderId.slice(0,8)}_${Date.now()}` })
    } catch (txErr) {
      console.warn('Failed to add transaction for ticket order:', txErr)
    }

    // Load order items with ticket type information
    const { data: items, error: itemsError } = await supabase.from('order_items').select('*, ticket_types(*)').eq('order_id', orderId)
    if (itemsError) throw itemsError

    const createdTickets: any[] = []
    // Create bookings per service for ALL ticket orders (logged-in and guest)
    // This ensures a booking ID exists for ticket purchases
    const bookingMap: Record<string, string> = {}
    try {
      // Group items by service_id to create bookings
      const groups: Record<string, { qty: number; total: number }> = {}
      for (const it of items || []) {
        const sid = it.ticket_types?.service_id
        if (!sid) continue
        groups[sid] = groups[sid] || { qty: 0, total: 0 }
        groups[sid].qty += it.quantity
        groups[sid].total += (it.unit_price || 0) * it.quantity
      }

      for (const sid of Object.keys(groups)) {
        try {
          const booking = await createBooking({
            service_id: sid,
            booking_date: new Date().toISOString(),
            service_date: new Date().toISOString(),
            guests: groups[sid].qty,
            total_amount: groups[sid].total,
            currency: order.currency,
            status: 'confirmed',
            payment_status: 'paid',
            tourist_id: payment.tourist_id || undefined,
            // For guest bookings, try to get info from order if available, otherwise leave as undefined
            guest_name: !payment.tourist_id ? (order as any).guest_name || null : undefined,
            guest_email: !payment.tourist_id ? (order as any).guest_email || null : undefined,
            guest_phone: !payment.tourist_id ? (order as any).guest_phone || null : undefined
          })
          if (booking && booking.id) bookingMap[sid] = booking.id
        } catch (bkErr) {
          // Log but don't fail ticket issuance if booking creation fails
          console.warn('Failed to create booking for ticket order service', sid, bkErr)
        }
      }
    } catch (err) {
      console.error('Error creating bookings for ticket order:', err)
    }

    // Use atomic ticket booking function for each ticket type
    for (const it of items || []) {
      try {
        const { data, error } = await supabase.rpc('book_tickets_atomic', {
          p_ticket_type_id: it.ticket_type_id,
          p_quantity: it.quantity,
          p_order_id: orderId
        })

        if (error) {
          console.error('Failed to book tickets atomically:', error)
          throw new Error(`Failed to book tickets: ${error.message}`)
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Failed to book tickets')
        }

        console.log(`Successfully booked ${data.tickets_created} tickets for type ${it.ticket_type_id}`)
      } catch (atomicError) {
        console.error('Atomic booking failed, falling back to individual ticket creation:', atomicError)

        // Fallback to individual ticket creation if atomic function fails
        for (let i = 0; i < it.quantity; i++) {
          const code = `TKT-${Math.random().toString(36).slice(2,10).toUpperCase()}`
          try {
            const { data: ticket, error: ticketError } = await supabase.from('tickets').insert([{
              order_id: orderId,
              ticket_type_id: it.ticket_type_id,
              service_id: it.ticket_types.service_id,
              owner_id: order.user_id || null,
              code,
              qr_data: code,
              status: 'issued'
            }]).select().single()

            if (ticketError) {
              console.error('Failed to create individual ticket:', ticketError)
              continue
            }
            createdTickets.push(ticket)
          } catch (indError) {
            console.error('Exception creating individual ticket:', indError)
          }
        }

        // increment sold count (non-atomically as fallback)
        try {
          await supabase.from('ticket_types').update({ sold: (it.quantity) }).eq('id', it.ticket_type_id)
        } catch (incErr) {
          console.warn('Failed to increment sold count:', incErr)
        }
      }
    }

    // Fetch all tickets created for this order
    const { data: allTickets, error: fetchError } = await supabase
      .from('tickets')
      .select('*, ticket_types(*), orders(*)')
      .eq('order_id', orderId)

    if (!fetchError && allTickets) {
      createdTickets.push(...allTickets)
    }

    return { order, tickets: createdTickets }
  }, 'confirmOrderAndIssueTickets')
}

export async function getAvailableTickets(ticketTypeId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_available_tickets', {
      p_ticket_type_id: ticketTypeId
    })

    if (error) {
      console.error('Error getting available tickets:', error)
      // Fallback to manual calculation
      const { data: ticketType, error: fetchError } = await supabase
        .from('ticket_types')
        .select('quantity, sold')
        .eq('id', ticketTypeId)
        .single()

      if (fetchError || !ticketType) {
        console.error('Error fetching ticket type for fallback:', fetchError)
        return 0
      }

      return Math.max(0, ticketType.quantity - ticketType.sold)
    }

    return data || 0
  } catch (err) {
    console.error('Exception getting available tickets:', err)
    return 0
  }
}

export async function markTicketUsed(ticketId: string, usedAt?: string) {
  try {
    const { data, error } = await supabase.from('tickets').update({ status: 'used', used_at: usedAt || new Date().toISOString() }).eq('id', ticketId).select().single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error marking ticket used:', err)
    throw err
  }
}

export async function verifyTicketByCode(code: string, serviceId?: string) {
  return executeWithCircuitBreaker(async () => {
    console.log('Verifying ticket with code:', code, 'for service:', serviceId)

    // Use atomic verification function
    const { data: result, error } = await supabase.rpc('verify_and_use_ticket_atomic', {
      p_ticket_code: code,
      p_service_id: serviceId || null
    })

    if (error) {
      console.error('Database error in atomic verification:', error)
      throw error
    }

    console.log('Atomic verification result:', result)

    if (!result?.success) {
      return {
        valid: false,
        ticket: null,
        message: result?.error || 'Invalid ticket'
      }
    }

    // Fetch full ticket details for the response
    let ticketDetails = null;
    let fetchError = null;

    if (result.ticket_id) {
      // Try to fetch by ticket_id (preferred for new verifications)
      const ticketResult = await supabase
        .from('tickets')
        .select(`
          *,
          ticket_types(*),
          orders(*),
          services(id, title, vendor_id)
        `)
        .eq('id', result.ticket_id)
        .single();
      ticketDetails = ticketResult.data;
      fetchError = ticketResult.error;
    }

    if (!ticketDetails && !fetchError) {
      // Fallback: try to fetch by code (for already used tickets where ticket_id might not be returned)
      console.log('Fetching ticket details by code as fallback');
      const ticketResult = await supabase
        .from('tickets')
        .select(`
          *,
          ticket_types(*),
          orders(*),
          services(id, title, vendor_id)
        `)
        .eq('code', code)
        .single();
      ticketDetails = ticketResult.data;
      fetchError = ticketResult.error;
    }

    if (fetchError) {
      console.error('Error fetching ticket details:', fetchError)
      // Still return success but with minimal info using the code that was verified
      return {
        valid: true,
        ticket: { 
          id: result.ticket_id || 'unknown', 
          code: code, // Use the code that was successfully verified
          status: 'used', 
          used_at: result.used_at || new Date().toISOString(),
          ticket_types: { title: 'Ticket' } // Default type
        },
        already_used: result.already_used,
        message: result.already_used ? 'Ticket verified (previously used)' : 'Ticket verified successfully'
      }
    }

    console.log('Ticket verified successfully via atomic function')
    return {
      valid: true,
      ticket: ticketDetails,
      already_used: result.already_used,
      message: result.already_used ? 'Ticket verified (previously used)' : 'Ticket verified successfully'
    }
  }, 'verifyTicketByCode').catch(async (err: any) => {
    console.error('Error in atomic ticket verification:', err)

    // Fallback to non-atomic verification if atomic function fails
    console.log('Falling back to non-atomic verification')
    return executeWithCircuitBreaker(async () => {
      // Find ticket by code or qr_data
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          ticket_types(*),
          orders(*),
          services(id, title, vendor_id)
        `)
        .or(`code.eq.${code},qr_data.eq.${code}`)
        .single()

      if (error) {
        console.error('Database error in fallback:', error)
        if (error.code === 'PGRST116') { // No rows returned
          throw new Error('Ticket not found')
        }
        throw error
      }

      if (!ticket) {
        throw new Error('Ticket not found')
      }

      console.log('Found ticket in fallback:', {
        id: ticket.id,
        code: ticket.code,
        qr_data: ticket.qr_data,
        status: ticket.status,
        service_id: ticket.service_id,
        order_status: ticket.orders?.status,
        order_id: ticket.order_id
      })

      // Check if ticket is paid/active - be more flexible with status
      // For verification purposes, we allow checking used tickets (verification != usage)
      if (ticket.status !== 'active' && ticket.status !== 'confirmed' && ticket.status !== 'paid' && ticket.status !== 'issued' && ticket.status !== 'used') {
        console.log('Ticket status is:', ticket.status, '- rejecting')
        throw new Error(`Ticket status is ${ticket.status}, not valid`)
      }

      // Check if ticket belongs to the specified service (if provided)
      if (serviceId && ticket.service_id !== serviceId) {
        console.log('Ticket service_id:', ticket.service_id, 'does not match event service_id:', serviceId)
        throw new Error('Ticket does not belong to this event')
      }

      // Check if order is paid - be more flexible with order status
      if (ticket.orders?.status !== 'paid' && ticket.orders?.status !== 'completed' && ticket.orders?.status !== 'confirmed') {
        console.log('Order status is:', ticket.orders?.status, '- rejecting')
        throw new Error(`Order status is ${ticket.orders?.status}, not paid`)
      }

      // Try to mark as used (non-atomically as fallback)
      if (ticket.status !== 'used') {
        try {
          await markTicketUsed(ticket.id)
          console.log('Ticket marked as used in fallback')
        } catch (markError) {
          console.error('Error marking ticket as used in fallback:', markError)
          // Don't fail verification if marking fails
        }
      }

      console.log('Ticket verified successfully via fallback')
      return {
        valid: true,
        ticket: ticket,
        already_used: !!ticket.used_at,
        message: ticket.used_at ? 'Ticket verified (previously used)' : 'Ticket verified successfully'
      }
    }, 'verifyTicketByCode_fallback').catch((fallbackErr: any) => {
      console.error('Fallback verification also failed:', fallbackErr)
      return {
        valid: false,
        ticket: null,
        message: fallbackErr instanceof Error ? fallbackErr.message : 'Invalid ticket'
      }
    })
  })
}

export async function getServiceDeleteRequests(vendorId?: string): Promise<ServiceDeleteRequest[]> {
  try {
    console.log('getServiceDeleteRequests: Called with vendorId:', vendorId);

    let query = supabase
      .from('service_delete_requests')
      .select(`
        *,
        service:services(id, title, description, category_id, service_categories(name, icon)),
        vendor:vendors(id, business_name, user_id)
      `)
      .order('requested_at', { ascending: false })

    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }

    console.log('getServiceDeleteRequests: Executing query...');
    const { data, error } = await query

    if (error) {
      console.error('getServiceDeleteRequests: Query error:', error);
      console.error('getServiceDeleteRequests: Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      // Check if the error is because the table doesn't exist
      if (error.message?.includes('relation "service_delete_requests" does not exist')) {
        console.warn('service_delete_requests table does not exist yet. Returning empty array.')
        return []
      }

      // Check if it's an RLS policy error
      if (error.message?.includes('policy') || error.message?.includes('permission denied') || error.code === 'PGRST116') {
        console.warn('RLS policy blocking access. Returning empty array.')
        return []
      }

      console.error('Error fetching service delete requests:', error)
      // Instead of throwing, return empty array for now
      console.warn('Returning empty array due to error, but continuing execution')
      return []
    }

    console.log('getServiceDeleteRequests: Query successful, returned', data?.length || 0, 'records');
    console.log('getServiceDeleteRequests: Sample data:', data?.[0]);
    return data || []
  } catch (err) {
    console.error('getServiceDeleteRequests: Exception:', err);
    console.error('getServiceDeleteRequests: Exception details:', err);

    // If it's our custom error message, return empty array
    if (err instanceof Error && (err.message.includes('table does not exist') || err.message.includes('RLS policy'))) {
      return []
    }
    console.error('Error fetching service delete requests:', err)
    throw err
  }
}

export async function updateServiceDeleteRequestStatus(
  requestId: string,
  status: ServiceDeleteRequestStatus,
  adminNotes?: string
): Promise<ServiceDeleteRequest> {
  const { data, error } = await supabase
    .from('service_delete_requests')
    .update({
      status: status,
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: (await supabase.auth.getUser()).data.user?.id
    })
    .eq('id', requestId)
    .select(`
      *,
      service:services(*, service_categories(*)),
      vendor:vendors(*)
    `)
    .single()

  if (error) {
    console.error('Error updating service delete request status:', error)
    throw error
  }

  return data
}

export async function deleteServiceDeleteRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('service_delete_requests')
    .delete()
    .eq('id', requestId)

  if (error) {
    console.error('Error deleting service delete request:', error)
    throw error
  }
}

// User management functions
export async function deleteUser(userId: string): Promise<void> {
  try {
    // First, get the user's role to determine what related data to delete
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      throw profileError
    }

    // Delete visitor sessions for this user
    // We need to do this before deleting the user to avoid foreign key constraint issues
    const { error: visitorSessionsError } = await supabase
      .from('visitor_sessions')
      .delete()
      .eq('user_id', userId)

    if (visitorSessionsError) {
      console.error('Error deleting visitor sessions:', visitorSessionsError)
      throw visitorSessionsError
    }

    // Delete service likes for this user
    const { error: serviceLikesError } = await supabase
      .from('service_likes')
      .delete()
      .eq('user_id', userId)

    if (serviceLikesError) {
      console.error('Error deleting service likes:', serviceLikesError)
      throw serviceLikesError
    }

    // Delete related data based on user role
    if (profile.role === 'vendor') {
      // Delete vendor-specific data
      const { error: vendorError } = await supabase
        .from('vendors')
        .delete()
        .eq('user_id', userId)

      if (vendorError) {
        console.error('Error deleting vendor data:', vendorError)
        throw vendorError
      }

      // Delete all services and related data for this vendor
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id')
        .eq('vendor_id', userId)

      if (servicesError) {
        console.error('Error fetching vendor services:', servicesError)
        throw servicesError
      }

      if (services && services.length > 0) {
        const serviceIds = services.map(s => s.id)

        // Delete service images (this will be handled by storage policies)
        // Delete bookings related to these services
        const { error: bookingsError } = await supabase
          .from('bookings')
          .delete()
          .in('service_id', serviceIds)

        if (bookingsError) {
          console.error('Error deleting service bookings:', bookingsError)
          throw bookingsError
        }

        // Delete transactions related to these services
        const { error: transactionsError } = await supabase
          .from('transactions')
          .delete()
          .in('service_id', serviceIds)

        if (transactionsError) {
          console.error('Error deleting service transactions:', transactionsError)
          throw transactionsError
        }

        // Delete the services themselves
        const { error: deleteServicesError } = await supabase
          .from('services')
          .delete()
          .eq('vendor_id', userId)

        if (deleteServicesError) {
          console.error('Error deleting services:', deleteServicesError)
          throw deleteServicesError
        }
      }
    } else if (profile.role === 'tourist') {
      // Delete tourist-specific data
      const { error: touristError } = await supabase
        .from('tourists')
        .delete()
        .eq('user_id', userId)

      if (touristError) {
        console.error('Error deleting tourist data:', touristError)
        throw touristError
      }

      // Delete bookings made by this tourist
      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('tourist_id', userId)

      if (bookingsError) {
        console.error('Error deleting tourist bookings:', bookingsError)
        throw bookingsError
      }

      // Delete transactions made by this tourist
      const { error: transactionsError } = await supabase
        .from('transactions')
        .delete()
        .eq('tourist_id', userId)

      if (transactionsError) {
        console.error('Error deleting tourist transactions:', transactionsError)
        throw transactionsError
      }
    }

    // Finally, delete the user profile
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (deleteProfileError) {
      console.error('Error deleting user profile:', deleteProfileError)
      throw deleteProfileError
    }

    console.log(`User ${userId} and all related data deleted successfully`)
  } catch (error) {
    console.error('Error deleting user:', error)
    throw error
  }
}

// Admin dashboard functions
export async function getAllVendors(): Promise<Vendor[]> {
  console.log('getAllVendors: Function called - using simple query without profiles join')

  // First try a simple query without joins to test RLS
  const { data: simpleData, error: simpleError } = await supabase
    .from('vendors')
    .select('id, user_id, business_name, business_email, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (simpleError) {
    console.error('Error fetching vendors (simple query):', simpleError)
    throw simpleError
  }

  console.log('getAllVendors: Found', simpleData?.length || 0, 'vendors')

  // Return simple data with mock profiles object to match Vendor interface
  // Note: The profiles join is not working due to schema constraints
  return simpleData.map(vendor => ({
    ...vendor,
    business_description: undefined,
    business_address: undefined,
    business_phone: undefined,
    business_website: undefined,
    business_type: undefined,
    operating_hours: undefined,
    years_in_business: undefined,
    business_license: undefined,
    tax_id: undefined,
    approved_at: undefined,
    approved_by: undefined,
    profiles: {
      id: vendor.user_id,
      full_name: vendor.business_name,
      email: vendor.business_email,
      phone: undefined
    }
  })) as Vendor[]

  // If no data from simple query, return empty array
  return []
}

export async function getVendorById(vendorId: string): Promise<Vendor | null> {
  try {
    // First attempt: try joining profiles (may fail in some RLS/schema setups)
    const { data, error } = await supabase
      .from('vendors')
      .select(`
        *,
        profiles (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('id', vendorId)
      .single()

    if (!error && data) {
      return data as Vendor
    }

    // Fallback: simple vendor select without joins (safer for strict RLS setups)
    console.warn('getVendorById: profiles join failed or returned no data, falling back to simple vendor select', error)
    const { data: simpleData, error: simpleError } = await supabase
      .from('vendors')
      .select('id, user_id, business_name, business_email, business_description, business_address, business_phone, status, created_at, updated_at, bank_details, mobile_money_accounts, preferred_payout')
      .eq('id', vendorId)
      .single()

    if (simpleError) {
      console.error('Error fetching vendor by id (simple fallback):', simpleError)
      throw simpleError
    }

    // Construct a Vendor-shaped object with a minimal profiles stub
    const vendor = {
      ...simpleData,
      profiles: {
        id: (simpleData as any)?.user_id,
        full_name: (simpleData as any)?.business_name,
        email: (simpleData as any)?.business_email,
        phone: undefined
      }
    } as Vendor

    return vendor
  } catch (error) {
    console.error('getVendorById error:', error)
    throw error
  }
}

export async function getAllBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      services (
        id,
        title,
        description,
        vendor_id,
        category_id,
        service_categories (
          name
        ),
        vendors (
          business_name
        )
      ),
      profiles (
        id,
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching bookings:', error)
    throw error
  }

  // Transform the data to match the expected Booking interface
  const transformedData = (data || []).map(booking => {
    // Create a new object without the services property to avoid conflicts
    const { services, profiles, ...rest } = booking;
    return {
      ...rest,
      service: services ? {
        id: services.id,
        title: services.title,
        description: services.description,
        vendor_id: services.vendor_id,
        category_id: services.category_id,
        service_categories: services.service_categories,
        vendors: services.vendors
      } : undefined,
      tourist_profile: profiles ? {
        id: profiles.id,
        full_name: profiles.full_name,
        email: profiles.email
      } : undefined
    };
  });

  return transformedData
}

export async function createBooking(booking: Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'vendor_id'> & { vendor_id?: string }): Promise<Booking> {
  console.log('createBooking called with:', booking)

  // Check if this is a guest booking
  const isGuestBooking = !booking.tourist_id

  if (isGuestBooking && (!booking.guest_name || !booking.guest_email || !booking.guest_phone)) {
    throw new Error('Guest name, email, and phone are required for guest bookings')
  }

  // If vendor_id is not provided, fetch it from the service
  let bookingData = { ...booking }
  if (!bookingData.vendor_id && bookingData.service_id) {
    try {
      const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('vendor_id')
        .eq('id', bookingData.service_id)
        .single()

      if (serviceError) {
        console.error('Error fetching service vendor_id:', serviceError)
      } else if (service?.vendor_id) {
        bookingData.vendor_id = service.vendor_id
        console.log('Auto-set vendor_id from service:', service.vendor_id)
      }
    } catch (error) {
      console.error('Exception fetching service vendor_id:', error)
    }
  }

  console.log('Final booking data with vendor_id:', bookingData.vendor_id)

  // Use atomic function to create booking with capacity validation
  // Note: Supabase RPC calls use named parameters, so order in object doesn't matter
  // But we need to ensure the parameter names match exactly
  const result = await supabase.rpc('create_booking_atomic', {
    p_service_id: bookingData.service_id,
    p_vendor_id: bookingData.vendor_id,
    p_booking_date: bookingData.booking_date,
    p_guests: bookingData.guests,
    p_total_amount: bookingData.total_amount,
    p_tourist_id: bookingData.tourist_id || null,
    p_service_date: bookingData.service_date || null,
    p_currency: bookingData.currency || 'UGX',
    p_special_requests: bookingData.special_requests || null,
    p_guest_name: bookingData.guest_name || null,
    p_guest_email: bookingData.guest_email || null,
    p_guest_phone: bookingData.guest_phone || null,
    p_pickup_location: bookingData.pickup_location || null,
    p_dropoff_location: bookingData.dropoff_location || null
  });

  if (result.error) throw result.error;

  if (!result.data?.success) {
    throw new Error(result.data?.error || 'Failed to create booking');
  }

  // Fetch the complete booking with relations
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      services (
        id,
        title,
        vendors (
          id,
          business_name
        )
      ),
      profiles (
        id,
        full_name,
        email
      )
    `)
    .eq('id', result.data.booking_id)
    .single();

  if (error) throw error;

  console.log('Booking created successfully:', data)

  // Send booking confirmation emails asynchronously (don't block on errors)
  sendBookingEmails(data.id).catch(error => {
    console.error('Failed to send booking emails:', error)
    // Don't throw - email failure shouldn't break the booking creation
  })

  return data
}

/**
 * Calls the Supabase edge function to send booking confirmation emails
 * to tourist, vendor, and admin
 */
async function sendBookingEmails(bookingId: string): Promise<void> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase env vars not set, skipping email notification')
      return
    }

    console.log('📧 Calling send-booking-emails edge function for booking:', bookingId)

    // Get current session token for authentication
    const { data: { session } } = await supabase.auth.getSession()
    const authToken = session?.access_token

    // Call the edge function directly with fetch (more reliable than invoke)
    const response = await fetch(`${supabaseUrl}/functions/v1/send-booking-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ booking_id: bookingId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Edge function returned error:', response.status, errorText)
      throw new Error(`Failed to send booking emails: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    console.log('✅ Booking emails sent successfully:', data)
  } catch (error: any) {
    console.error('❌ Error calling send-booking-emails edge function:', error)
    console.error('Error details:', error?.message, error?.stack)
    // Don't throw - email failure shouldn't break the booking creation
  }
}

export async function updateBooking(id: string, updates: Partial<Pick<Booking, 'status' | 'payment_status' | 'rejection_reason'>>): Promise<Booking> {
  try {
    console.log('DB: updateBooking called with id:', id, 'updates:', updates)

    // Direct update to bookings table instead of using non-existent RPC function
    const { data, error } = await supabase
      .from('bookings')
      .update({
        ...(updates.status && { status: updates.status }),
        ...(updates.payment_status && { payment_status: updates.payment_status }),
        ...(updates.rejection_reason !== undefined && { rejection_reason: updates.rejection_reason }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        services (
          id,
          title,
          vendors (
            id,
            business_name
          )
        ),
        profiles (
          id,
          full_name,
          email
        )
      `)
      .single()

    if (error) throw error;

    console.log('DB: Booking updated successfully. New status:', data.status, 'payment_status:', data.payment_status)

    // Check if we need to create a transaction and credit wallets
    // Create transaction and credit wallets when booking is "confirmed AND paid" (after update)
    const finalStatus = data.status;
    const finalPaymentStatus = data.payment_status;
    const shouldCreateTransaction = finalStatus === 'confirmed' && finalPaymentStatus === 'paid';

    console.log('DB: Transaction check - finalStatus:', finalStatus, 'finalPaymentStatus:', finalPaymentStatus, 'shouldCreateTransaction:', shouldCreateTransaction);

    if (shouldCreateTransaction) {
      console.log('[Wallet Debug] Attempting to create payment transaction for booking:', id, {
        vendor_id: data.vendor_id,
        tourist_id: data.tourist_id,
        amount: data.total_amount,
        currency: data.currency,
        transaction_type: 'payment',
        status: 'completed',
        payment_method: 'card',
        reference: `PMT_${id.slice(0, 8)}_${Date.now()}`
      });
      // Check if a payment transaction already exists for this booking
      const { data: existingTransaction, error: transactionCheckError } = await supabase
        .from('transactions')
        .select('id')
        .eq('booking_id', id)
        .eq('transaction_type', 'payment')
        .eq('status', 'completed')
        .single();

      if (transactionCheckError && transactionCheckError.code !== 'PGRST116') { // PGRST116 = no rows returned
        // If table doesn't exist, skip transaction creation
        if (transactionCheckError.message?.includes('relation "transactions" does not exist')) {
          console.warn('Transactions table does not exist. Skipping payment transaction creation.');
        } else {
          console.error('Error checking existing transaction:', transactionCheckError);
        }
      } else {
        // Only create transaction if one doesn't already exist
        if (!existingTransaction) {
          try {
            // Use atomic payment processing function
            const { data: paymentResult, error: paymentError } = await supabase.rpc('process_payment_atomic', {
              p_vendor_id: data.vendor_id,
              p_amount: data.total_amount,
              p_booking_id: id || null,
              p_tourist_id: data.tourist_id || null,
              p_currency: data.currency || 'UGX',
              p_payment_method: 'card',
              p_reference: `PMT_${id.slice(0, 8)}_${Date.now()}`
            });

            if (paymentError) throw paymentError;

            if (!paymentResult?.success) {
              throw new Error(paymentResult?.error || 'Failed to process payment');
            }

            console.log('Created payment transaction and credited wallet for booking:', id);

            // Credit admin wallet (platform fee logic can be added here)
            const adminId = await getAdminProfileId();
            if (adminId) {
              // For now, credit full amount to admin as well. Adjust for fee split if needed.
              await creditWallet(adminId, data.total_amount, data.currency);
            }
          } catch (transactionError) {
            // If transactions table doesn't exist, just log and continue
            if (transactionError instanceof Error && transactionError.message.includes('Transactions table does not exist')) {
              console.warn('Transactions table does not exist. Payment transaction not created.');
            } else {
              console.error('Error creating payment transaction:', transactionError);
              // Don't throw here - the booking update was successful
            }
          }
        }
      }
    }

    // When booking is completed, generate a review token and send review request email
    if (data.status === 'completed') {
      try {
        const reviewToken = await generateReviewToken(id);
        if (reviewToken) {
          const serviceName = data.services?.title || 'the service';
          const vendorName = data.services?.vendors?.business_name || 'the provider';
          const result = await sendReviewRequestEmail(
            id,
            reviewToken.token,
            reviewToken.guest_email,
            reviewToken.guest_name,
            serviceName,
            vendorName
          );
          console.log('Review request generated for booking:', id, 'Review URL:', result.reviewUrl, 'Email sent:', result.sent);
        }
      } catch (reviewError) {
        console.error('Error generating review request (non-blocking):', reviewError);
        // Don't throw - this is non-critical
      }
    }

    return data
  } catch (error) {
    console.error('Error in updateBooking:', error)
    throw error
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  try {
    // First get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }

    if (!transactions || transactions.length === 0) {
      return []
    }

    // Get vendor IDs from transactions
    const vendorIds = transactions.map(t => t.vendor_id).filter(id => id)

    if (vendorIds.length === 0) {
      return transactions
    }

    // Fetch vendor information separately
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('id, business_name, business_email, status')
      .in('id', vendorIds)

    if (vendorsError) {
      console.error('Error fetching vendors for transactions:', vendorsError)
      // Return transactions without vendor info rather than failing
      return transactions
    }

    // Map vendor information to transactions
    const vendorMap = new Map(vendors?.map(v => [v.id, v]) || [])

    const transactionsWithVendors = transactions.map(transaction => ({
      ...transaction,
      vendors: vendorMap.get(transaction.vendor_id) || null
    }))

    return transactionsWithVendors
  } catch (error) {
    console.error('Error in getAllTransactions:', error)
    return []
  }
}

export async function getAllTransactionsForAdmin(): Promise<Transaction[]> {
  try {
    // First check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('User not authenticated')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      throw new Error('Access denied: Admin role required')
    }

    // First get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching admin transactions:', error)
      throw error
    }

    if (!transactions || transactions.length === 0) {
      return []
    }

    // Get vendor IDs from transactions
    const vendorIds = transactions.map(t => t.vendor_id).filter(id => id)

    if (vendorIds.length === 0) {
      return transactions
    }

    // Fetch vendor information separately
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('id, business_name, business_email, status')
      .in('id', vendorIds)

    if (vendorsError) {
      console.error('Error fetching vendors for admin transactions:', vendorsError)
      // Return transactions without vendor info rather than failing
      return transactions
    }

    // Map vendor information to transactions
    const vendorMap = new Map(vendors?.map(v => [v.id, v]) || [])

    const transactionsWithVendors = transactions.map(transaction => ({
      ...transaction,
      vendors: vendorMap.get(transaction.vendor_id) || null
    }))

    return transactionsWithVendors
  } catch (error) {
    console.error('Error in getAllTransactionsForAdmin:', error)
    throw error
  }
}

export async function getAllVendorWallets(): Promise<any[]> {
  try {
    // First get all wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .order('balance', { ascending: false })

    if (walletsError) {
      console.error('Error fetching wallets:', walletsError)
      throw walletsError
    }

    if (!wallets || wallets.length === 0) {
      return []
    }

    // Get vendor IDs from wallets
    const vendorIds = wallets.map(w => w.vendor_id).filter(id => id)

    if (vendorIds.length === 0) {
      return wallets
    }

    // Fetch vendor information separately
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('id, business_name, business_email, status, created_at')
      .in('id', vendorIds)

    if (vendorsError) {
      console.error('Error fetching vendors:', vendorsError)
      // Return wallets without vendor info rather than failing
      return wallets
    }

    // Map vendor information to wallets
    const vendorMap = new Map(vendors?.map(v => [v.id, v]) || [])

    const walletsWithVendors = wallets.map(wallet => ({
      ...wallet,
      vendors: vendorMap.get(wallet.vendor_id) || null
    }))

    return walletsWithVendors
  } catch (error) {
    console.error('Error in getAllVendorWallets:', error)
    return []
  }
}

export async function getAllUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching users:', error)
    throw error
  }

  return data || []
}

export async function updateVendorStatus(vendorId: string, status: VendorStatus): Promise<Vendor> {
  try {
    // Get current user for approved_by field
    const { data: { user } } = await supabase.auth.getUser();

    // Use atomic function to prevent race conditions
    const { data, error } = await supabase.rpc('update_vendor_status_atomic', {
      p_vendor_id: vendorId,
      p_status: status,
      p_approved_by: user?.id || null
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to update vendor status');
    }

    // Fetch the updated vendor with profile info
    const { data: updatedVendor, error: fetchError } = await supabase
      .from('vendors')
      .select(`
        *,
        profiles (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('id', vendorId)
      .single();

    if (fetchError) throw fetchError;
    return updatedVendor;
  } catch (error) {
    console.error('Error updating vendor status:', error);
    throw error;
  }
}

export async function getDashboardStats() {
  try {
    console.log('getDashboardStats: Starting dashboard stats fetch...');

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('getDashboardStats: Auth check - User:', user?.id, 'Error:', authError);

    if (authError || !user) {
      console.error('getDashboardStats: User not authenticated');
      throw new Error('User not authenticated');
    }

    // Check user role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('getDashboardStats: Profile check - Profile:', profile, 'Error:', profileError);

    if (profileError || !profile) {
      console.error('getDashboardStats: Profile not found');
      throw new Error('Profile not found');
    }

    if (profile.role !== 'admin') {
      console.error('getDashboardStats: User is not admin, role:', profile.role);
      throw new Error('Access denied: Admin role required');
    }

    console.log('getDashboardStats: User is admin, proceeding with queries...');

    // Get vendor stats
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('status')

    console.log('getDashboardStats: Vendors query - Data length:', vendors?.length, 'Error:', vendorsError);

    if (vendorsError) {
      console.error('getDashboardStats: Error fetching vendors:', vendorsError);
      throw vendorsError;
    }

    const totalVendors = vendors?.length || 0
    const pendingVendors = vendors?.filter(v => v.status === 'pending').length || 0

    // Get tourist stats
    const { data: tourists, error: touristsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'tourist')

    console.log('getDashboardStats: Tourists query - Data length:', tourists?.length, 'Error:', touristsError);

    if (touristsError) {
      console.error('getDashboardStats: Error fetching tourists:', touristsError);
      throw touristsError;
    }

    const totalTourists = tourists?.length || 0

    // Get service stats
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('status')

    console.log('getDashboardStats: Services query - Data length:', services?.length, 'Error:', servicesError);

    if (servicesError) {
      console.error('getDashboardStats: Error fetching services:', servicesError);
      throw servicesError;
    }

    const totalServices = services?.length || 0
    const pendingServices = services?.filter(s => s.status === 'pending').length || 0

    // Get booking stats
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('status, total_amount')

    console.log('getDashboardStats: Bookings query - Data length:', bookings?.length, 'Error:', bookingsError);

    if (bookingsError) {
      console.error('getDashboardStats: Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    const totalBookings = bookings?.length || 0
    const totalRevenue = bookings?.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0) || 0

    console.log('getDashboardStats: Stats calculated -', {
      totalVendors,
      pendingVendors,
      totalServices,
      pendingServices,
      totalBookings,
      totalRevenue
    });

    // Get recent bookings
    const { data: recentBookings, error: recentBookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        services (
          title,
          vendors (
            business_name
          )
        ),
        profiles (
          full_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('getDashboardStats: Recent bookings query - Data length:', recentBookings?.length, 'Error:', recentBookingsError);

    if (recentBookingsError) {
      console.error('getDashboardStats: Error fetching recent bookings:', recentBookingsError);
      // Don't throw here, just log and continue
    }

    // Get recent vendors
    const { data: recentVendors, error: recentVendorsError } = await supabase
      .from('vendors')
      .select('id, user_id, business_name, business_email, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('getDashboardStats: Recent vendors query - Data length:', recentVendors?.length, 'Error:', recentVendorsError);

    if (recentVendorsError) {
      console.error('getDashboardStats: Error fetching recent vendors:', recentVendorsError);
      // Don't throw here, just log and continue
    }

    // Get total messages for admin
    const { count: totalMessages, error: totalMessagesError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_role', 'admin')

    console.log('getDashboardStats: Total messages query - Count:', totalMessages, 'Error:', totalMessagesError);

    if (totalMessagesError) {
      console.error('getDashboardStats: Error fetching total messages:', totalMessagesError);
      // Don't throw here, just log and continue
    }

    return {
      totalVendors,
      pendingVendors,
      totalTourists,
      totalServices,
      pendingServices,
      totalBookings,
      totalRevenue,
      totalMessages: totalMessages || 0,
      recentBookings: recentBookings || [],
      recentVendors: recentVendors || []
    }
  } catch (error) {
    console.error('getDashboardStats: Exception caught:', error)
    throw error
  }
}

// Message management functions
export async function getAdminMessages(filter?: 'vendor_to_admin' | 'tourist_to_admin' | 'unread') {
  try {
    let query = supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, email),
        recipient:profiles!messages_recipient_id_fkey(id, full_name, email)
      `)
      .eq('recipient_role', 'admin')
      .order('created_at', { ascending: false })

    if (filter === 'vendor_to_admin') {
      query = query.eq('sender_role', 'vendor')
    } else if (filter === 'tourist_to_admin') {
      query = query.eq('sender_role', 'tourist')
    } else if (filter === 'unread') {
      query = query.eq('status', 'unread')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching admin messages:', error)
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getAdminMessages:', error)
    throw error
  }
}

export async function getVendorMessages(vendorId: string, filter?: 'unread' | 'customer' | 'admin') {
  try {
    let query = supabase
      .from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(id, full_name, email)`)
      .order('created_at', { ascending: false })

    if (filter === 'unread') {
      query = query
        .or(`recipient_id.eq.${vendorId},sender_id.eq.${vendorId}`)
        .eq('status', 'unread')
    } else if (filter === 'customer') {
      // Only messages from tourists to vendor
      query = query
        .eq('recipient_id', vendorId)
        .eq('recipient_role', 'vendor')
        .eq('sender_role', 'tourist')
    } else if (filter === 'admin') {
      // All messages between vendor and admin (sent or received)
      query = query.or(`and(sender_id.eq.${vendorId},recipient_role.eq.admin),and(recipient_id.eq.${vendorId},sender_role.eq.admin)`)
    } else {
      // All messages where vendor is involved
      query = query.or(`recipient_id.eq.${vendorId},sender_id.eq.${vendorId}`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching vendor messages:', error)
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getVendorMessages:', error)
    throw error
  }
}

export async function sendMessage(messageData: {
  sender_id: string
  sender_role: string
  recipient_id: string
  recipient_role: string
  subject: string
  message: string
}) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        ...messageData,
        status: 'unread',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error in sendMessage:', error)
    throw error
  }
}

export async function sendOTPNotification(notificationData: {
  to: string
  subject?: string
  message: string
  type: 'email' | 'sms'
}) {
  try {
    const { data, error } = await supabase.functions.invoke('send-otp-notification', {
      body: notificationData
    })

    if (error) {
      console.warn(`Error sending ${notificationData.type} notification:`, error)
      // Don't throw error for notifications - they're supplementary
      return { sent: false, error }
    }

    return { sent: true, data }
  } catch (err) {
    console.warn(`Exception sending ${notificationData.type} notification:`, err)
    // Don't throw error for notifications - they're supplementary
    return { sent: false, error: err }
  }
}

export async function markMessageAsRead(messageId: string) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update({
        status: 'read',
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .select()
      .single()

    if (error) {
      console.error('Error marking message as read:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error in markMessageAsRead:', error)
    throw error
  }
}

export async function replyToMessage(originalMessageId: string, replyData: {
  sender_id: string
  sender_role: string
  recipient_id: string
  recipient_role: string
  subject: string
  message: string
}) {
  try {
    // First, mark the original message as replied
    await supabase
      .from('messages')
      .update({
        status: 'replied',
        updated_at: new Date().toISOString()
      })
      .eq('id', originalMessageId)

    // Then send the reply
    return await sendMessage(replyData)
  } catch (error) {
    console.error('Error in replyToMessage:', error)
    throw error
  }
}
export async function getVendorServices(vendorId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      service_categories (
        id,
        name,
        icon
      )
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching vendor services:', error)
    throw error
  }

  return data || []
}

export async function getVendorBookings(vendorId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      services (
        id,
        title,
        description
      ),
      profiles (
        id,
        full_name,
        email
      )
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching vendor bookings:', error)
    throw error
  }

  return data || []
}

export async function getVendorTransactions(vendorId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      bookings (
        id,
        services (
          title
        )
      )
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching vendor transactions:', error)
    throw error
  }

  return data || []
}

export async function getVendorWallet(vendorId: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('vendor_id', vendorId)
    .single()

  if (error) {
    // If wallet doesn't exist, return a default one
    if (error.code === 'PGRST116') {
      return {
        id: `wallet_${vendorId}`,
        vendor_id: vendorId,
        balance: 0,
        currency: 'UGX',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
    console.error('Error fetching vendor wallet:', error)
    throw error
  }

  return data
}

export async function getVendorStats(vendorId: string) {
  try {
    if (!vendorId) {
      console.error('getVendorStats: vendorId is null or undefined')
      return {
        servicesCount: 0,
        pendingBookings: 0,
        completedBookings: 0,
        balance: 0,
        currency: 'UGX',
        balanceTrend: '+0%',
        balanceStatus: 'healthy' as const,
        pendingBalance: 0,
        messagesCount: 0,
        inquiriesCount: 0,
        recentBookings: [],
        recentTransactions: []
      }
    }

    console.log('getVendorStats: Fetching stats for vendor:', vendorId)

    // Use Promise.allSettled to allow some queries to fail without blocking others
    const results = await Promise.allSettled([
      // Services count
      supabase
        .from('services')
        .select('id, vendor_id, status', { count: 'exact', head: true })
        .eq('vendor_id', vendorId),

      // Bookings stats with count
      supabase
        .from('bookings')
        .select('status', { count: 'exact', head: true })
        .eq('vendor_id', vendorId),

      // Recent bookings
      supabase
        .from('bookings')
        .select(`
          *,
          services (
            title
          ),
          profiles (
            full_name
          )
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(5)
    ])

    // Extract results
    const servicesResult = results[0]
    const bookingsResult = results[1]
    const recentBookingsResult = results[2]

    // Process services count
    let servicesCount = 0
    if (servicesResult.status === 'fulfilled') {
      servicesCount = servicesResult.value.count || 0
    }

    // Process bookings stats
    let pendingBookings = 0
    let completedBookings = 0
    if (bookingsResult.status === 'fulfilled') {
      // We can't get individual counts with the current query, so we'll get them separately
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('status')
        .eq('vendor_id', vendorId)
      
      if (allBookings) {
        pendingBookings = allBookings.filter(b => b.status === 'pending').length
        completedBookings = allBookings.filter(b => b.status === 'completed').length
      }
    }

    // Process recent bookings
    let recentBookings: any[] = []
    if (recentBookingsResult.status === 'fulfilled') {
      recentBookings = recentBookingsResult.value.data || []
    }

    console.log('getVendorStats: Basic stats fetched - services:', servicesCount, 'pending bookings:', pendingBookings, 'completed bookings:', completedBookings)

    // Get wallet - try multiple possibilities due to data inconsistency
    let wallet = null
    const walletAttempts = [vendorId] // Start with vendorId as-is

    // Check if vendorId is a vendor.id or user.id
    const { data: vendorById, error: vendorByIdError } = await supabase
      .from('vendors')
      .select('user_id')
      .eq('id', vendorId)
      .single()

    let vendorByUserId: any = null
    let vendorByUserIdError: any = null

    if (!vendorByIdError && vendorById?.user_id) {
      // vendorId is a vendor.id, add the corresponding user_id
      walletAttempts.push(vendorById.user_id)
    } else {
      // vendorId might be a user.id, try to get the vendor.id
      const result = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', vendorId)
        .single()

      vendorByUserId = result.data
      vendorByUserIdError = result.error

      if (!vendorByUserIdError && vendorByUserId?.id) {
        // vendorId is a user.id, add the corresponding vendor.id
        walletAttempts.push(vendorByUserId.id)
      }
    }

    // Try all possibilities
    for (const attemptId of walletAttempts) {
      try {
        wallet = await getVendorWallet(attemptId)
        if (wallet) break
      } catch (error) {
        // Continue to next attempt
      }
    }

    // Get messages count for vendor - try multiple possibilities
    let finalMessagesCount = 0
    const messageAttempts = [vendorId]

    // Use the same vendor lookup results as above
    if (!vendorByIdError && vendorById?.user_id) {
      messageAttempts.push(vendorById.user_id)
    } else if (!vendorByUserIdError && vendorByUserId?.id) {
      messageAttempts.push(vendorByUserId.id)
    }

    for (const attemptId of messageAttempts) {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', attemptId)
        .eq('recipient_role', 'vendor')

      if (!error && count && count > 0) {
        finalMessagesCount = count
        break
      }
    }

    // Get inquiries count for vendor
    let inquiriesCount = 0
    try {
      inquiriesCount = await getInquiryCount(vendorId)
    } catch (inquiryError) {
      console.warn('Could not fetch inquiry count (table may not exist yet):', inquiryError)
      inquiriesCount = 0
    }

    // Get recent transactions
    let recentTx: any[] = []
    try {
      const { data, error: recentTxError } = await supabase
        .from('transactions')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentTxError) {
        // Check if it's a permission or table not found error
        if (recentTxError.message?.includes('permission denied') || 
            recentTxError.message?.includes('does not exist') ||
            recentTxError.code === 'PGRST116') {
          console.warn('Transactions table not accessible or does not exist:', recentTxError.message)
          recentTx = []
        } else {
          throw recentTxError
        }
      } else {
        recentTx = data || []
      }
    } catch (error) {
      console.warn('Exception fetching recent transactions (table may not exist):', error)
      recentTx = []
    }

    // Calculate balance trend (last 30 days)
    let balanceTrend = '+0%'
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: monthlyTransactions, error: trendError } = await supabase
        .from('transactions')
        .select('amount, transaction_type, created_at')
        .eq('vendor_id', vendorId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('status', 'completed')

      if (!trendError && monthlyTransactions && monthlyTransactions.length > 0) {
        const totalChange = monthlyTransactions.reduce((sum, tx) => {
          // For balance trend, payments increase balance, withdrawals decrease it
          return tx.transaction_type === 'payment' ? sum + tx.amount : 
                 tx.transaction_type === 'withdrawal' ? sum - tx.amount : sum
        }, 0)

        // Calculate percentage change from current balance
        const currentBalance = wallet?.balance || 0
        if (currentBalance > 0) {
          const percentageChange = (totalChange / currentBalance) * 100
          const sign = percentageChange >= 0 ? '+' : ''
          balanceTrend = `${sign}${percentageChange.toFixed(1)}%`
        } else if (totalChange > 0) {
          balanceTrend = `+${totalChange.toLocaleString()}`
        }
      }
    } catch (error) {
      console.warn('Could not calculate balance trend (transactions table may not exist):', error)
      balanceTrend = '+0%'
    }

    // Calculate balance status
    let balanceStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
    const currentBalance = wallet?.balance || 0
    if (currentBalance < 50000) { // Less than UGX 50,000
      balanceStatus = 'critical'
    } else if (currentBalance < 200000) { // Less than UGX 200,000
      balanceStatus = 'warning'
    }

    // Calculate pending balance from incomplete bookings
    let pendingBalance = 0
    try {
      const { data: pendingTransactions, error: pendingError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('vendor_id', vendorId)
        .eq('status', 'pending')
        .eq('transaction_type', 'credit')

      if (!pendingError && pendingTransactions) {
        pendingBalance = pendingTransactions.reduce((sum, tx) => sum + tx.amount, 0)
      }
    } catch (error) {
      console.warn('Could not calculate pending balance:', error)
      pendingBalance = 0
    }

    return {
      servicesCount,
      pendingBookings,
      completedBookings,
      balance: wallet?.balance || 0,
      currency: wallet?.currency || 'UGX',
      balanceTrend,
      balanceStatus,
      pendingBalance,
      messagesCount: finalMessagesCount || 0,
      inquiriesCount,
      recentBookings: recentBookings || [],
      recentTransactions: recentTx || []
    }
  } catch (error) {
    console.error('Error fetching vendor stats:', error)
    throw error
  }
}

// Inquiry functions
export async function createInquiry(inquiryData: {
  service_id: string
  name: string
  email: string
  phone?: string
  preferred_date?: string
  number_of_guests: number
  message?: string
  contact_method: 'email' | 'phone'
  category_specific_data?: Record<string, any>
}): Promise<Inquiry> {
  try {
    // Get the vendor_id from the service
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('vendor_id')
      .eq('id', inquiryData.service_id)
      .single()

    if (serviceError || !service) {
      throw new Error('Service not found')
    }

    const { data, error } = await supabase
      .from('inquiries')
      .insert([{
        service_id: inquiryData.service_id,
        vendor_id: service.vendor_id,
        name: inquiryData.name,
        email: inquiryData.email,
        phone: inquiryData.phone,
        preferred_date: inquiryData.preferred_date,
        number_of_guests: inquiryData.number_of_guests,
        message: inquiryData.message,
        contact_method: inquiryData.contact_method,
        category_specific_data: inquiryData.category_specific_data || {}
      }])
      .select(`
        *,
        services (
          id,
          title,
          service_categories (
            name
          )
        ),
        vendors (
          id,
          business_name,
          business_email
        )
      `)
      .single()

    if (error) {
      console.error('Error creating inquiry:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error in createInquiry:', error)
    throw error
  }
}

export async function getVendorInquiries(vendorId: string): Promise<Inquiry[]> {
  try {
    // First try with vendorId as vendor.id
    let query = supabase
      .from('inquiries')
      .select(`
        *,
        services (
          id,
          title,
          service_categories (
            name
          )
        )
      `)
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })

    let { data, error } = await query

    // If no inquiries found and vendorId might be a user_id, try with vendor record lookup
    if ((!data || data.length === 0) && !error) {
      const { data: vendorRecord, error: vendorError } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', vendorId)
        .single()

      if (!vendorError && vendorRecord) {
        const { data: vendorInquiries, error: vendorInquiriesError } = await supabase
          .from('inquiries')
          .select(`
            *,
            services (
              id,
              title,
              service_categories (
                name
              )
            )
          `)
          .eq('vendor_id', vendorRecord.id)
          .order('created_at', { ascending: false })

        if (!vendorInquiriesError) {
          data = vendorInquiries
          error = vendorInquiriesError
        }
      }
    }

    if (error) {
      console.error('Error fetching vendor inquiries:', error)
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getVendorInquiries:', error)
    throw error
  }
}

export async function updateInquiryStatus(inquiryId: string, status: 'unread' | 'read' | 'responded' | 'archived', responseMessage?: string): Promise<Inquiry> {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (status === 'responded' && responseMessage) {
      updateData.responded_at = new Date().toISOString()
      updateData.response_message = responseMessage
    }

    const { data, error } = await supabase
      .from('inquiries')
      .update(updateData)
      .eq('id', inquiryId)
      .select(`
        *,
        services (
          id,
          title,
          service_categories (
            name
          )
        ),
        vendors (
          id,
          business_name,
          business_email
        )
      `)
      .single()

    if (error) {
      console.error('Error updating inquiry status:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error in updateInquiryStatus:', error)
    throw error
  }
}

export async function getInquiryCount(vendorId: string): Promise<number> {
  try {
    let finalCount = 0
    const inquiryAttempts = [vendorId]

    // Check if vendorId is a vendor.id or user.id
    const { data: vendorById, error: vendorByIdError } = await supabase
      .from('vendors')
      .select('user_id')
      .eq('id', vendorId)
      .single()

    if (!vendorByIdError && vendorById?.user_id) {
      // vendorId is a vendor.id, add the corresponding user_id
      inquiryAttempts.push(vendorById.user_id)
    } else {
      // vendorId might be a user.id, try to get the vendor.id
      const { data: vendorByUserId, error: vendorByUserIdError } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', vendorId)
        .single()

      if (!vendorByUserIdError && vendorByUserId?.id) {
        // vendorId is a user.id, add the corresponding vendor.id
        inquiryAttempts.push(vendorByUserId.id)
      }
    }

    // Try all possibilities
    for (const attemptId of inquiryAttempts) {
      const { count, error } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', attemptId)

      if (!error && count && count > 0) {
        finalCount = count
        break
      }
    }

    return finalCount
  } catch (error) {
    console.error('Error in getInquiryCount:', error)
    throw error
  }
}

// Transaction functions
export async function getTransactions(vendorId: string) {
  try {
    console.log('getTransactions: Querying transactions for vendorId:', vendorId)
    
    // Try RPC function first (if it exists). Some deployments use different parameter names
    // in the SQL function (vendor_id_param, vendor_id, p_vendor_id, etc). Try a few common
    // variants and log the returned error details so we can diagnose 400 responses.
    try {
      const paramCandidates = ['vendor_id_param', 'vendor_id', 'p_vendor_id', 'p_vendor']
      for (const paramName of paramCandidates) {
        try {
          const params: any = {}
          params[paramName] = vendorId
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_vendor_transactions', params)

          if (!rpcError && rpcData) {
            console.log(`getTransactions: Got transactions via RPC (param=${paramName}):`, rpcData.length)
            return rpcData
          }

          // If we got an rpcError object, log details for debugging
          if (rpcError) {
            console.log(`getTransactions: RPC attempt param=${paramName} returned error:`, rpcError)
          }
        } catch (innerErr) {
          // Network-level or unexpected errors from the RPC call
          console.log(`getTransactions: RPC attempt param=${paramName} threw:`, innerErr)
        }
      }
      console.log('getTransactions: RPC attempts exhausted or RPC not available, falling back')
    } catch (rpcErr) {
      console.log('getTransactions: RPC wrapper failed, using fallback', rpcErr)
    }
    
    // Try querying through vendors relationship
    const { data: vendorData, error: vendorError } = await supabase
      .from('vendors')
      .select(`
        id,
        transactions (*)
      `)
      .eq('id', vendorId)
      .single()

    console.log('getTransactions: Vendor query result:', vendorData, 'error:', vendorError)

    if (!vendorError && vendorData?.transactions) {
      console.log('getTransactions: Got transactions through vendor relationship:', vendorData.transactions.length)
      return vendorData.transactions
    }

    // Fallback: direct query (might be blocked by RLS)
    console.log('getTransactions: Using direct query...')
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })

    console.log('getTransactions: Direct query result - data length:', data?.length, 'error:', error)

    if (error) {
      if (error.message?.includes('permission denied') || error.message?.includes('insufficient_privilege')) {
        console.warn('RLS blocking transactions query, returning empty array')
        return []
      }
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getTransactions:', error)
    return []
  }
}

export async function addTransaction(transaction: {
  booking_id?: string
  vendor_id: string
  tourist_id?: string
  amount: number
  currency: string
  transaction_type: 'payment' | 'withdrawal' | 'refund'
  status: 'pending' | 'completed' | 'failed'
  payment_method: 'card' | 'mobile_money' | 'bank_transfer'
  reference: string
  payout_meta?: any
}) {
  try {

    console.log('[Wallet Debug] addTransaction called with:', transaction);
    // Use atomic function to create transaction
    let data: any = null
    let error: any = null

    if (transaction.payout_meta) {
      // Use a helper RPC that accepts payout_meta and inserts it into transactions.payout_meta
      const rpcRes = await supabase.rpc('create_transaction_with_meta_atomic', {
        p_vendor_id: transaction.vendor_id,
        p_amount: transaction.amount,
        p_transaction_type: transaction.transaction_type,
        p_booking_id: transaction.booking_id || null,
        p_tourist_id: transaction.tourist_id || null,
        p_currency: transaction.currency || 'UGX',
        p_status: transaction.status || 'pending',
        p_payment_method: transaction.payment_method || 'card',
        p_reference: transaction.reference || null,
        p_payout_meta: transaction.payout_meta
      })
      data = rpcRes.data
      error = rpcRes.error
    } else {
      const rpcRes = await supabase.rpc('create_transaction_atomic', {
        p_vendor_id: transaction.vendor_id,
        p_amount: transaction.amount,
        p_transaction_type: transaction.transaction_type,
        p_booking_id: transaction.booking_id || null,
        p_tourist_id: transaction.tourist_id || null,
        p_currency: transaction.currency || 'UGX',
        p_status: transaction.status || 'pending',
        p_payment_method: transaction.payment_method || 'card',
        p_reference: transaction.reference || null
      })
      data = rpcRes.data
      error = rpcRes.error
    }

    // Log raw RPC response for easier debugging in browser console
  console.log('[Wallet Debug] create_transaction_atomic response:', { data, error });

    if (error) {
      // If table doesn't exist, throw a more helpful error
      if (error.message?.includes('relation "transactions" does not exist')) {
        throw new Error('Transactions table does not exist. Please run the database migrations first.')
      }
      console.error('Error adding transaction (RPC error):', JSON.stringify(error, Object.getOwnPropertyNames(error)))
      throw error
    }

    if (!data?.success) {
      console.error('Error adding transaction (RPC returned failure):', data)
      throw new Error(data.error || 'Failed to create transaction');
    }

    return data.transaction_id;
  } catch (error) {
    console.error('Error in addTransaction:', error)
    throw error
  }
}

/**
 * Reconcile bookings: find bookings that are confirmed AND paid but have no
 * corresponding completed payment transaction, and create one.
 * If vendorId is provided, limit to that vendor only.
 * Returns the number of transactions created.
 */
export async function reconcileMissingPaymentTransactions(vendorId?: string): Promise<number> {
  try {
    // Build base query
    let query = supabase
      .from('bookings')
      .select('id, vendor_id, tourist_id, total_amount, currency')
      .eq('status', 'confirmed')
      .eq('payment_status', 'paid')

    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }

    const { data: bookings, error: bookingsError } = await query
    if (bookingsError) {
      console.error('Error fetching confirmed+paid bookings for reconciliation:', bookingsError)
      throw bookingsError
    }

    if (!bookings || bookings.length === 0) return 0

    let created = 0

    for (const b of bookings) {
      try {
        // Check existing completed payment transaction for this booking
        const { data: existingTx, error: txCheckError } = await supabase
          .from('transactions')
          .select('id')
          .eq('booking_id', b.id)
          .eq('transaction_type', 'payment')
          .eq('status', 'completed')
          .single()

        if (txCheckError && txCheckError.code !== 'PGRST116') {
          console.warn('Error checking transactions for booking', b.id, txCheckError)
          continue
        }

        if (existingTx) {
          // already has payment
          continue
        }

        // create transaction
        const reference = `PMT_${b.id.slice(0, 8)}_${Date.now()}`
        await addTransaction({
          booking_id: b.id,
          vendor_id: b.vendor_id,
          tourist_id: b.tourist_id,
          amount: b.total_amount,
          currency: b.currency || 'UGX',
          transaction_type: 'payment',
          status: 'completed',
          payment_method: 'card',
          reference
        })
        created += 1
        console.log('Reconciliation: created payment transaction for booking', b.id)
      } catch (err) {
        console.error('Reconciliation: failed for booking', b.id, err)
      }
    }

    return created
  } catch (error) {
    console.error('Error in reconcileMissingPaymentTransactions:', error)
    throw error
  }
}

export async function updateTransactionStatus(transactionId: string, status: 'pending' | 'approved' | 'completed' | 'failed') {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', transactionId)
      .select()
      .single()

    if (error) {
      console.error('Error updating transaction status:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error in updateTransactionStatus:', error)
    throw error
  }
}

export async function getWalletStats(vendorId: string) {
  try {
    const transactions = await getTransactions(vendorId)

    // If no transactions (table doesn't exist or no data), return default stats
    if (!transactions || transactions.length === 0) {
      return {
        totalEarned: 0,
        totalWithdrawn: 0,
        pendingWithdrawals: 0,
        currentBalance: 0,
        currency: 'UGX',
        totalTransactions: 0,
        completedPayments: 0,
        completedWithdrawals: 0,
        pendingWithdrawalsCount: 0
      }
    }

    // Payments for bookings that are paid but not yet completed
    const pendingPayments = transactions.filter((t: Transaction) => t.transaction_type === 'payment' && t.status === 'completed' && t.booking_id)
    // To distinguish, we need to check booking status for each payment
    // We'll fetch all related bookings and map their status
    let completedBookingIds: string[] = [];
    let pendingBookingIds: string[] = [];
    if (pendingPayments.length > 0) {
      const bookingIds = pendingPayments.map((t: Transaction) => t.booking_id).filter(Boolean) as string[];
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, status')
        .in('id', bookingIds);
      if (!bookingsError && bookings) {
        completedBookingIds = bookings.filter((b: any) => b.status === 'completed').map((b: any) => b.id);
        pendingBookingIds = bookings.filter((b: any) => b.status !== 'completed').map((b: any) => b.id);
      }
    }

    // Payments for completed bookings
    const completedPayments = pendingPayments.filter((t: Transaction) => completedBookingIds.includes(t.booking_id!));
    // Payments for bookings not yet completed
    const notCompletedPayments = pendingPayments.filter((t: Transaction) => pendingBookingIds.includes(t.booking_id!));

    const withdrawals = transactions.filter((t: Transaction) => t.transaction_type === 'withdrawal');
    const totalEarned = pendingPayments.reduce((s: number, t: Transaction) => s + t.amount, 0);
    const totalWithdrawn = withdrawals.filter((t: Transaction) => t.status === 'completed').reduce((s: number, t: Transaction) => s + t.amount, 0);
    const pendingWithdrawals = withdrawals.filter((t: Transaction) => t.status === 'pending').reduce((s: number, t: Transaction) => s + t.amount, 0);
    const completedBalance = completedPayments.reduce((s: number, t: Transaction) => s + t.amount, 0) - totalWithdrawn - pendingWithdrawals;
    const pendingBalance = notCompletedPayments.reduce((s: number, t: Transaction) => s + t.amount, 0);
    const currentBalance = completedBalance + pendingBalance;
    const currency = transactions[0]?.currency || 'UGX';

    return {
      totalEarned,
      totalWithdrawn,
      pendingWithdrawals,
      currentBalance,
      completedBalance, // money for completed bookings
      pendingBalance,   // money for paid but not yet completed bookings
      currency,
      totalTransactions: transactions.length,
      completedPayments: completedPayments.length,
      pendingPayments: notCompletedPayments.length,
      completedWithdrawals: withdrawals.filter((t: Transaction) => t.status === 'completed').length,
      pendingWithdrawalsCount: withdrawals.filter((t: Transaction) => t.status === 'pending').length
    }
  } catch (error) {
    console.error('Error in getWalletStats:', error)
    // Return default stats on error
    return {
      totalEarned: 0,
      totalWithdrawn: 0,
      pendingWithdrawals: 0,
      currentBalance: 0,
      currency: 'UGX',
      totalTransactions: 0,
      completedPayments: 0,
      completedWithdrawals: 0,
      pendingWithdrawalsCount: 0
    }
  }
}

export async function requestWithdrawal(vendorId: string, amount: number, currency: string, payout?: { id?: string; type?: string; meta?: any }) {
  try {
    // Get current wallet stats to validate the withdrawal amount
    const walletStats = await getWalletStats(vendorId)

    if (amount > walletStats.currentBalance) {
      throw new Error(`Insufficient balance. Available: ${formatCurrency(walletStats.currentBalance, walletStats.currency)}`)
    }

    if (amount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0')
    }

    // Check if transactions table exists by trying to insert
    const reference = `WD_${Date.now()}_${Math.random().toString(36).slice(2,8)}`

    const payment_method = payout?.type === 'bank' ? 'bank_transfer' : 'mobile_money'

    // Include payout metadata if provided
    const transaction = await addTransaction({
      vendor_id: vendorId,
      amount,
      currency,
      transaction_type: 'withdrawal',
      status: 'pending',
      payment_method: (payment_method as 'card' | 'mobile_money' | 'bank_transfer'),
      reference,
      payout_meta: payout?.meta || (payout ? { type: payout.type } : null)
    })

    // Optionally store payout metadata in a payments_payouts table or attach metadata to the transaction via another RPC.
    // For now, we log it to the console for server-side developers to wire into the processing pipeline.
    if (payout?.meta) {
      console.log('[Wallet Debug] payout metadata provided for withdrawal:', payout.meta)
    }

    return transaction
  } catch (error) {
    console.error('Error in requestWithdrawal:', error)
    throw error
  }
}

// Guest booking support functions
export async function getBookingsForUser(userId: string): Promise<Booking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        services (
          id,
          title,
          description,
          price,
          currency,
          images,
          location,
          vendors (
            business_name,
            business_phone,
            business_email
          )
        )
      `)
      .or(`tourist_id.eq.${userId},and(is_guest_booking.eq.true,guest_email.eq.${await getUserEmail(userId)})`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching bookings:', error)
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getBookingsForUser:', error)
    throw error
  }
}

async function getUserEmail(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data?.email || ''
  } catch (error) {
    console.error('Error getting user email:', error)
    return ''
  }
}

// ============================================================================
// Visitor Activity Analytics
// ============================================================================

export async function getVisitorActivityStats() {
  try {
    // Get all profiles (visitors/tourists)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at, role')
      .eq('role', 'tourist')
    
    if (profilesError) throw profilesError

    // Get all bookings with service and profile info
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, tourist_id, service_id, status, created_at, total_amount, currency')
      .in('status', ['confirmed', 'completed', 'pending'])
    
    if (bookingsError) throw bookingsError

    // Get all services 
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, title')
    
    if (servicesError) throw servicesError

    // Get all reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('id, service_id, user_id, rating, comment, helpful_count, created_at, profiles(full_name), services(title)')
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (reviewsError) throw reviewsError

    // Process data for analytics
    const uniqueVisitorIds = new Set<string>()

    profiles?.forEach((profile: any) => {
      uniqueVisitorIds.add(profile.id)
    })

    // Get top liked services (based on service count)
    const topLikedServices = services
      ?.slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        serviceName: s.title,
        category: '',
        totalLikes: 0,
        avgRating: 0
      })) || []

    // Get recent reviews with formatted data
    const recentReviewsList = reviews
      ?.map((r: any) => ({
        id: r.id,
        serviceName: r.services?.title || 'Unknown Service',
        rating: r.rating || 0,
        comment: r.comment || '',
        visitorName: r.profiles?.full_name || 'Anonymous',
        date: r.created_at || new Date().toISOString(),
        helpful: r.helpful_count || 0
      })) || []

    // Count reviews this month
    const now = new Date()
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
    const reviewsThisMonth = reviews?.filter((r: any) => new Date(r.created_at) >= monthAgo).length || 0

    // Calculate average rating
    const avgRating = reviews && reviews.length > 0
      ? (reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : '0'

    // Calculate average session duration (using booking data as proxy)
    const avgSessionDuration = bookings?.length ? (bookings.length * 0.5).toFixed(1) : '0'
    const bounceRate = bookings?.length ? ((1 - (bookings.filter((b: any) => b.status === 'confirmed').length / bookings.length)) * 100).toFixed(1) : '0'

    return {
      totalVisitors: profiles?.length || 0,
      uniqueVisitors: uniqueVisitorIds.size,
      avgSessionDuration: parseFloat(avgSessionDuration as string),
      bounceRate: parseFloat(bounceRate as string),
      topCountries: [],
      ageGroups: [],
      genderDistribution: { male: 0, female: 0, other: 0 },
      topLikedServices,
      recentReviews: recentReviewsList,
      reviewsThisMonth,
      avgRating: parseFloat(avgRating as string)
    }
  } catch (error) {
    console.error('Error fetching visitor activity stats:', error)
    throw error
  }
}

export async function getVendorActivityStats(vendorId: string) {
  try {
    // Get all services for this vendor
    const { data: vendorServices, error: servicesError } = await supabase
      .from('services')
      .select('id, title')
      .eq('vendor_id', vendorId)
    
    if (servicesError) throw servicesError

    // Get all bookings for this vendor's services
    const { data: vendorBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, tourist_id, service_id, status, created_at, total_amount, currency, profiles(full_name)')
      .in('service_id', vendorServices?.map((s: any) => s.id) || [])
    
    if (bookingsError) throw bookingsError

    // Get visitor sessions and view logs for this vendor's services
    let visitorSessions: any[] = []
    let serviceViewLogs: any[] = []
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('visitor_sessions')
        .select('id, ip_address, country, city, device_type, user_id, first_visit_at, visit_count')
        .order('first_visit_at', { ascending: false })
        .limit(100)
      
      if (!sessionsError && sessionsData) {
        visitorSessions = sessionsData
      } else if (sessionsError) {
        console.warn('Visitor sessions table unavailable:', sessionsError)
      }

      // For sessions missing country info, attempt an IP->country lookup (cached)
      try {
        const sessionsToLookup = visitorSessions.filter((s: any) => (!s.country || s.country === '') && s.ip_address)
        if (sessionsToLookup.length > 0) {
          await Promise.all(sessionsToLookup.map(async (s: any) => {
            try {
              const country = await lookupCountryByIp(s.ip_address)
              if (country) s.country = country
            } catch (err) {
              // ignore lookup errors per-session
            }
          }))
        }
      } catch (err) {
        console.warn('Error during IP->country lookups:', err)
      }

      // Get view logs for services
      const { data: viewLogsData, error: viewLogsError } = await supabase
        .from('service_view_logs')
        .select('id, service_id, visitor_session_id, viewed_at, services(title)')
        .in('service_id', vendorServices?.map((s: any) => s.id) || [])
        .order('viewed_at', { ascending: false })
        .limit(100)
      
      if (!viewLogsError && viewLogsData) {
        serviceViewLogs = viewLogsData
      } else if (viewLogsError) {
        console.warn('Service view logs table unavailable:', viewLogsError)
      }
    } catch (error) {
      console.warn('Error fetching visitor sessions or view logs:', error)
    }

    // Get reviews for this vendor's services
    let vendorReviews: any[] = []
    const { data: reviewsData, error: reviewsError } = await supabase
      .from('service_reviews')
      .select('id, service_id, user_id, rating, comment, helpful_count, created_at, visitor_name, services(title)')
      .in('service_id', vendorServices?.map((s: any) => s.id) || [])
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50)
    
    // Log the error but don't throw - reviews may not be available
    if (reviewsError) {
      console.warn(`Reviews table unavailable for vendor ${vendorId}:`, reviewsError)
      vendorReviews = []
    } else {
      vendorReviews = reviewsData
    }

    // Get unique visitors for this vendor
    const uniqueVisitors = new Set<string>()

    vendorBookings?.forEach((booking: any) => {
      uniqueVisitors.add(booking.user_id)
    })

    // Track visitor countries using service view logs mapped to visitor sessions.
    // Prefer countries from sessions that actually viewed vendor services so the counts reflect relevant visitors.
    const sessionById: Record<string, any> = {}
    visitorSessions.forEach((s: any) => {
      if (s && s.id) sessionById[s.id] = s
    })

    const countryCounts: Record<string, number> = {}

    // Count countries for sessions that viewed this vendor's services
    serviceViewLogs.forEach((log: any) => {
      const sess = sessionById[log.visitor_session_id]
      const country = sess?.country || null
      if (country) {
        countryCounts[country] = (countryCounts[country] || 0) + 1
      }
    })

    // Fallback: if no view-log-derived countries, fall back to counting all recent sessions
    if (Object.keys(countryCounts).length === 0) {
      visitorSessions.forEach((session: any) => {
        if (session && session.country) {
          countryCounts[session.country] = (countryCounts[session.country] || 0) + 1
        }
      })
    }

    // Compute total for percentage calculations (use total counted visitors not total sessions to avoid 0 division)
    const totalCountryCount = Object.values(countryCounts).reduce((s, v) => s + v, 0) || visitorSessions.length || 1

    // Get top countries (sorted)
    const topCountries = Object.entries(countryCounts)
      .map(([country, count]) => ({
        country,
        count: count as number,
        percentage: ((count / totalCountryCount) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Track services checked by visitors
    const serviceCheckedCounts: Record<string, { title: string; count: number }> = {}
    serviceViewLogs.forEach((log: any) => {
      const serviceTitle = log.services?.title || 'Unknown Service'
      if (!serviceCheckedCounts[log.service_id]) {
        serviceCheckedCounts[log.service_id] = { title: serviceTitle, count: 0 }
      }
      serviceCheckedCounts[log.service_id].count += 1
    })

    // Get top services checked
    const servicesChecked = Object.entries(serviceCheckedCounts)
      .map(([id, data]) => ({
        id,
        serviceName: data.title,
        timesChecked: data.count,
        category: '',
        totalLikes: 0,
        avgRating: 0
      }))
      .sort((a, b) => b.timesChecked - a.timesChecked)
      .slice(0, 5)

    // Get top services for this vendor (just first 5)
    const topServices = vendorServices
      ?.slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        serviceName: s.title,
        category: '',
        totalLikes: 0,
        avgRating: 0
      })) || []

    // Get vendor reviews
    const vendorReviewsList = vendorReviews
      ?.map((r: any) => ({
        id: r.id,
        serviceName: r.services?.title || 'Unknown Service',
        rating: r.rating || 0,
        comment: r.comment || '',
        visitorName: r.visitor_name || 'Anonymous',
        date: r.created_at || new Date().toISOString(),
        helpful: r.helpful_count || 0
      })) || []

    // Count reviews this month
    const now = new Date()
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
    const reviewsThisMonth = vendorReviews?.filter((r: any) => new Date(r.created_at) >= monthAgo).length || 0

    // Calculate average rating
    const avgRating = vendorReviews && vendorReviews.length > 0
      ? (vendorReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / vendorReviews.length).toFixed(1)
      : '0'

    // Calculate metrics
    const totalBookings = vendorBookings?.length || 0
    const confirmedBookings = vendorBookings?.filter((b: any) => b.status === 'confirmed').length || 0
    const conversionRate = totalBookings > 0 ? ((confirmedBookings / totalBookings) * 100).toFixed(1) : '0'

    return {
      vendorId,
      totalVisitors: vendorBookings?.length || 0,
      uniqueVisitors: uniqueVisitors.size,
      totalServices: vendorServices?.length || 0,
      totalBookings: confirmedBookings,
      conversionRate: parseFloat(conversionRate as string),
      topCountries,
      ageGroups: [],
      genderDistribution: { male: 0, female: 0, other: 0 },
      topServices,
      servicesChecked,
      visitorSessions: await enhanceVisitorSessions(visitorSessions.slice(0, 10), serviceViewLogs),
      recentReviews: vendorReviewsList,
      reviewsThisMonth,
      avgRating: parseFloat(avgRating as string)
    }
  } catch (error) {
    console.error(`Error fetching vendor activity stats for ${vendorId}:`, error)
    throw error
  }
}

/**
 * Enhance visitor sessions with session duration and pages visited
 */
async function enhanceVisitorSessions(sessions: any[], viewLogs: any[]): Promise<any[]> {
  try {
    // Create a map of IP addresses to their view logs
    const ipViewMap: Record<string, any[]> = {}
    
    viewLogs.forEach((log: any) => {
      const sessionId = log.visitor_session_id
      if (!ipViewMap[sessionId]) {
        ipViewMap[sessionId] = []
      }
      ipViewMap[sessionId].push(log)
    })

    // Enhance sessions with page visit info and session duration
    const enhancedSessions = sessions.map((session: any) => {
      const sessionViews = ipViewMap[session.id] || []
      
      // Calculate session duration (time between first and last view)
      let sessionDuration = 0
      if (sessionViews.length > 1) {
        const firstView = new Date(sessionViews[0].viewed_at).getTime()
        const lastView = new Date(sessionViews[sessionViews.length - 1].viewed_at).getTime()
        sessionDuration = Math.floor((lastView - firstView) / 1000 / 60) // Convert to minutes
      }

      // Get unique pages (services) visited
      const pagesVisited = new Set(sessionViews.map((log: any) => log.service_id))
      const pageCount = pagesVisited.size

      // Calculate time since first visit
      const firstVisit = new Date(session.first_visit_at)
      const now = new Date()
      const daysSinceFirstVisit = Math.floor((now.getTime() - firstVisit.getTime()) / 1000 / 60 / 60 / 24)

      return {
        ...session,
        sessionDuration,
        pagesVisited: pageCount,
        viewCount: sessionViews.length,
        daysSinceFirstVisit,
        ipAddress: session.ip_address || 'Unknown',
        location: `${(session.city && session.city !== '') ? session.city : 'Unknown'}, ${(session.country && session.country !== '') ? session.country : 'Unknown'}`,
        visitedAt: (session.last_visit_at || session.first_visit_at || session.created_at) ? new Date(session.last_visit_at || session.first_visit_at || session.created_at).toISOString() : null
      }
    })

    return enhancedSessions
  } catch (error) {
    console.warn('Error enhancing visitor sessions:', error)
    return sessions // Return original sessions if enhancement fails
  }
}

export async function getAllVendorsWithActivity() {
  try {
    // First, try to get all vendors from profiles with role = 'vendor'
    const { data: vendors, error: vendorsError } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role')
      .eq('role', 'vendor')
    
    if (vendorsError) throw vendorsError

    console.log('Vendors from profiles:', vendors?.length, vendors)

    // If no vendors found, get unique vendor_ids from services table as fallback
    let finalVendors = vendors || []
    
    if (!finalVendors || finalVendors.length === 0) {
      console.log('No vendors found in profiles, checking services table...')
      const { data: serviceVendors, error: serviceVendorsError } = await supabase
        .from('services')
        .select('vendor_id')
      
      if (!serviceVendorsError && serviceVendors) {
        const uniqueVendorIds = [...new Set(serviceVendors.map((s: any) => s.vendor_id))]
        console.log('Unique vendor IDs from services:', uniqueVendorIds)
        
        if (uniqueVendorIds.length > 0) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, role')
            .in('id', uniqueVendorIds)
          
          if (!profileError && profileData) {
            finalVendors = profileData
            console.log('Vendors from services vendor_ids:', finalVendors)
          }
        }
      }
    }

    if (!finalVendors || finalVendors.length === 0) {
      console.log('No vendors found')
      return []
    }

    // Get activity stats for each vendor
    const vendorStats = await Promise.all(
      finalVendors.map(async (vendor: any) => {
        try {
          const stats = await getVendorActivityStats(vendor.id)
          console.log(`Stats for vendor ${vendor.full_name}:`, stats)
          return {
            vendorName: vendor.full_name,
            vendorEmail: vendor.email,
            vendorAvatar: vendor.avatar_url,
            ...stats
          }
        } catch (error) {
          console.error(`Error getting stats for vendor ${vendor.id}:`, error)
          return {
            vendorId: vendor.id,
            vendorName: vendor.full_name,
            vendorEmail: vendor.email,
            vendorAvatar: vendor.avatar_url,
            totalVisitors: 0,
            uniqueVisitors: 0,
            totalServices: 0,
            totalBookings: 0,
            conversionRate: 0,
            avgRating: 0,
            topCountries: [],
            ageGroups: [],
            genderDistribution: { male: 0, female: 0, other: 0 },
            topServices: [],
            recentReviews: [],
            reviewsThisMonth: 0
          }
        }
      })
    )

    console.log('Final vendor stats:', vendorStats)
    return vendorStats
  } catch (error) {
    console.error('Error fetching all vendors activity:', error)
    throw error
  }
}

// ============================================
// Visitor Activity Functions
// ============================================

/**
 * Get or create a visitor session based on IP address
 */
export async function getOrCreateVisitorSession(
  ipAddress: string,
  options?: {
    userId?: string;
    country?: string;
    city?: string;
    deviceType?: string;
    browserInfo?: string;
    userAgent?: string;
  }
): Promise<VisitorSession> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_visitor_session', {
      p_ip_address: ipAddress,
      p_user_id: options?.userId,
      p_country: options?.country,
      p_city: options?.city,
      p_device_type: options?.deviceType,
      p_browser_info: options?.browserInfo,
      p_user_agent: options?.userAgent,
    });

    if (error) throw error;

    // Fetch the created/updated session
    const { data: session, error: fetchError } = await supabase
      .from('visitor_sessions')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;
    return session;
  } catch (err) {
    console.error('Error getting/creating visitor session:', err);
    throw err;
  }
}

/**
 * Record a like on a service
 */
export async function likeService(
  serviceId: string,
  visitorSessionId: string,
  options?: {
    userId?: string;
    ipAddress?: string;
  }
): Promise<ServiceLike> {
  try {
    const { data, error } = await supabase.rpc('record_service_like', {
      p_service_id: serviceId,
      p_visitor_session_id: visitorSessionId,
      p_user_id: options?.userId,
      p_ip_address: options?.ipAddress,
    });

    if (error) throw error;

    // Fetch the created like
    const { data: like, error: fetchError } = await supabase
      .from('service_likes')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;
    return like;
  } catch (err) {
    console.error('Error liking service:', err);
    throw err;
  }
}

/**
 * Remove a like from a service
 */
export async function unlikeService(
  serviceId: string,
  visitorSessionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('remove_service_like', {
      p_service_id: serviceId,
      p_visitor_session_id: visitorSessionId,
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error unliking service:', err);
    throw err;
  }
}

/**
 * Check if a visitor has liked a service
 */
export async function hasVisitorLikedService(
  serviceId: string,
  visitorSessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('service_likes')
      .select('id')
      .eq('service_id', serviceId)
      .eq('visitor_session_id', visitorSessionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return !!data;
  } catch (err) {
    console.error('Error checking if service is liked:', err);
    return false;
  }
}

/**
 * Get all likes for a service
 */
export async function getServiceLikes(serviceId: string): Promise<ServiceLike[]> {
  try {
    const { data, error } = await supabase
      .from('service_likes')
      .select('*')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching service likes:', err);
    throw err;
  }
}

/**
 * Create a review for a service
 */
export async function createServiceReview(
  serviceId: string,
  review: {
    visitorSessionId?: string;
    userId?: string;
    ipAddress?: string;
    visitorName: string;
    visitorEmail?: string;
    rating: number;
    kpiRatings?: Record<string, number>;
    comment?: string;
    isVerifiedBooking?: boolean;
    reviewerCity?: string;
    reviewerCountry?: string;
  }
): Promise<ServiceReview> {
  try {
    // Use the SECURITY DEFINER RPC function to bypass RLS for both
    // guest and logged-in review inserts
    const { data, error } = await supabase.rpc('create_service_review', {
      p_service_id: serviceId,
      p_user_id: review.userId || null,
      p_visitor_session_id: review.visitorSessionId || null,
      p_ip_address: review.ipAddress || null,
      p_visitor_name: review.visitorName,
      p_visitor_email: review.visitorEmail || null,
      p_rating: review.rating,
      p_kpi_ratings: review.kpiRatings || null,
      p_comment: review.comment || null,
      p_is_verified_booking: review.isVerifiedBooking || false,
      p_reviewer_city: review.reviewerCity || null,
      p_reviewer_country: review.reviewerCountry || null,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error creating service review:', err);
    throw err;
  }
}

/**
 * Get approved reviews for a service
 */
export async function getServiceReviews(
  serviceId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<ServiceReview[]> {
  try {
    let query = supabase
      .from('service_reviews')
      .select('*')
      .eq('service_id', serviceId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching service reviews:', err);
    throw err;
  }
}

/**
 * Get visitor activity for a service
 */
export async function getServiceVisitorActivity(serviceId: string): Promise<VisitorActivity | null> {
  try {
    const { data, error } = await supabase
      .from('visitor_activity')
      .select('*')
      .eq('service_id', serviceId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data || null;
  } catch (err) {
    console.error('Error fetching visitor activity:', err);
    return null;
  }
}

/**
 * Log a service view
 */
export async function logServiceView(
  serviceId: string,
  visitorSessionId: string,
  options?: {
    userId?: string;
    ipAddress?: string;
    referrer?: string;
  }
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_service_view', {
      p_service_id: serviceId,
      p_visitor_session_id: visitorSessionId,
      p_user_id: options?.userId,
      p_ip_address: options?.ipAddress,
      p_referrer: options?.referrer,
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error logging service view:', err);
    // Don't throw - this is analytics data, not critical
  }
}

/**
 * Record a service like by a visitor
 */
export async function recordServiceLike(
  serviceId: string,
  visitorSessionId: string,
  options?: {
    userId?: string;
    ipAddress?: string;
  }
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('record_service_like', {
      p_service_id: serviceId,
      p_visitor_session_id: visitorSessionId,
      p_user_id: options?.userId,
      p_ip_address: options?.ipAddress,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error recording service like:', err);
    throw err;
  }
}

/**
 * Remove a service like by a visitor
 */
export async function removeServiceLike(
  serviceId: string,
  visitorSessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('remove_service_like', {
      p_service_id: serviceId,
      p_visitor_session_id: visitorSessionId,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error removing service like:', err);
    throw err;
  }
}

/**
 * Check if a service is liked by a visitor session
 */
export async function checkServiceLiked(
  serviceId: string,
  visitorSessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('service_likes')
      .select('id')
      .eq('service_id', serviceId)
      .eq('visitor_session_id', visitorSessionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return !!data;
  } catch (err) {
    console.error('Error checking if service is liked:', err);
    return false;
  }
}

/**
 * Submit a review for a service
 */
export async function submitServiceReview(
  serviceId: string,
  visitorSessionId: string | null,
  review: {
    visitorName: string;
    visitorEmail?: string;
    rating: number;
    comment?: string;
    userId?: string;
    ipAddress?: string;
  }
): Promise<ServiceReview> {
  try {
    const { data, error } = await supabase
      .from('service_reviews')
      .insert({
        service_id: serviceId,
        visitor_session_id: visitorSessionId,
        user_id: review.userId,
        ip_address: review.ipAddress,
        visitor_name: review.visitorName,
        visitor_email: review.visitorEmail,
        rating: review.rating,
        comment: review.comment,
        status: 'pending', // Reviews start as pending for moderation
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error submitting service review:', err);
    throw err;
  }
}

/**
 * Get visitor activity for all services of a vendor
 */
export async function getVendorVisitorActivity(vendorId: string): Promise<VisitorActivity[]> {
  try {
    const { data, error } = await supabase
      .from('visitor_activity')
      .select(`
        *,
        services:service_id (
          id,
          title,
          slug
        )
      `)
      .eq('vendor_id', vendorId)
      .order('total_views', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching vendor visitor activity:', err);
    throw err;
  }
}

/**
 * Get service activity statistics
 */
export async function getServiceActivityStats(serviceId: string) {
  try {
    const activity = await getServiceVisitorActivity(serviceId);
    const reviews = await getServiceReviews(serviceId, { limit: 5 });
    const likes = await getServiceLikes(serviceId);

    return {
      activity,
      recentReviews: reviews,
      totalLikes: likes.length,
      reviewCount: reviews.length,
      averageRating: activity?.average_rating || 0,
    };
  } catch (err) {
    console.error('Error fetching service activity stats:', err);
    throw err;
  }
}

/**
 * Mark review as helpful
 */
export async function markReviewHelpful(reviewId: string): Promise<ServiceReview> {
  try {
    // Fetch current review
    const { data: review, error: fetchError } = await supabase
      .from('service_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (fetchError) throw fetchError;

    // Update with incremented count
    const { data, error } = await supabase
      .from('service_reviews')
      .update({ helpful_count: (review.helpful_count || 0) + 1 })
      .eq('id', reviewId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error marking review as helpful:', err);
    throw err;
  }
}

/**
 * Mark review as unhelpful
 */
export async function markReviewUnhelpful(reviewId: string): Promise<ServiceReview> {
  try {
    // Fetch current review
    const { data: review, error: fetchError } = await supabase
      .from('service_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (fetchError) throw fetchError;

    // Update with incremented count
    const { data, error } = await supabase
      .from('service_reviews')
      .update({ unhelpful_count: (review.unhelpful_count || 0) + 1 })
      .eq('id', reviewId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error marking review as unhelpful:', err);
    throw err;
  }
}

// App Visit Types and Functions

export interface AppVisit {
  id: string;
  visitor_session_id: string;
  page_path: string;
  page_name?: string;
  referrer?: string;
  ip_address?: string;
  country?: string;
  city?: string;
  user_agent?: string;
  visited_at: string;
}

/**
 * Get app visit statistics for the platform
 */
export async function getAppVisitStats(daysBack: number = 30): Promise<{
  totalVisits: number;
  uniqueVisitors: number;
  topPages: Array<{ page_name: string; count: number }>;
  visitorsByCountry: Array<{ country: string; count: number }>;
  recentVisits: AppVisit[];
}> {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    // Get total visits and unique visitors
    const { data: visits, error: visitsError } = await supabase
      .from('app_visits')
      .select('id, visitor_session_id, page_name, country', { count: 'exact' })
      .gte('visited_at', sinceDate.toISOString());

    if (visitsError) throw visitsError;

    const totalVisits = visits?.length || 0;
    const uniqueVisitors = new Set(
      visits?.map((v) => v.visitor_session_id) || []
    ).size;

    // Get top pages
    const pageStats = new Map<string, number>();
    visits?.forEach((v) => {
      const page = v.page_name || 'Unknown';
      pageStats.set(page, (pageStats.get(page) || 0) + 1);
    });

    const topPages = Array.from(pageStats.entries())
      .map(([page_name, count]) => ({ page_name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get visitors by country
    const countryStats = new Map<string, number>();
    visits?.forEach((v) => {
      const country = v.country || 'Unknown';
      countryStats.set(country, (countryStats.get(country) || 0) + 1);
    });

    const visitorsByCountry = Array.from(countryStats.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Get recent visits
    const { data: recentVisits, error: recentError } = await supabase
      .from('app_visits')
      .select('*')
      .gte('visited_at', sinceDate.toISOString())
      .order('visited_at', { ascending: false })
      .limit(20);

    if (recentError) throw recentError;

    return {
      totalVisits,
      uniqueVisitors,
      topPages,
      visitorsByCountry,
      recentVisits: recentVisits || [],
    };
  } catch (err) {
    console.error('Error fetching app visit stats:', err);
    throw err;
  }
}

/**
 * Get app visit analytics by page
 */
export async function getPageVisitStats(pageName: string, daysBack: number = 30) {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const { data, error } = await supabase
      .from('app_visits')
      .select('*')
      .eq('page_name', pageName)
      .gte('visited_at', sinceDate.toISOString())
      .order('visited_at', { ascending: false });

    if (error) throw error;

    const uniqueVisitors = new Set(data?.map((v) => v.visitor_session_id) || [])
      .size;

    return {
      pageName,
      totalVisits: data?.length || 0,
      uniqueVisitors,
      visits: data || [],
    };
  } catch (err) {
    console.error('Error fetching page visit stats:', err);
    throw err;
  }
}

/**
 * Get visitor journey (page visit sequence)
 */
export async function getVisitorJourney(visitorSessionId: string) {
  try {
    const { data, error } = await supabase
      .from('app_visits')
      .select('*')
      .eq('visitor_session_id', visitorSessionId)
      .order('visited_at', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (err) {
    console.error('Error fetching visitor journey:', err);
    throw err;
  }
}

// =====================================================
// REVIEW TOKEN & REVIEW REQUEST SYSTEM
// =====================================================

export interface ReviewToken {
  id: string;
  booking_id: string;
  service_id: string;
  token: string;
  guest_name: string;
  guest_email: string;
  is_used: boolean;
  expires_at: string;
  created_at: string;
}

/**
 * Generate a unique review token for a completed booking
 */
export async function generateReviewToken(bookingId: string): Promise<ReviewToken | null> {
  try {
    // Fetch the booking with service details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        services (id, title, slug, vendor_id, vendors (id, business_name)),
        profiles (id, full_name, email)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError) throw bookingError;
    if (!booking) throw new Error('Booking not found');

    const guestName = booking.guest_name || booking.profiles?.full_name || 'Guest';
    const guestEmail = booking.guest_email || booking.profiles?.email || '';

    if (!guestEmail) {
      console.warn('No email available for booking', bookingId);
      return null;
    }

    // Generate a random token
    const token = crypto.randomUUID ? crypto.randomUUID() : 
      `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Set expiry to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data, error } = await supabase
      .from('review_tokens')
      .insert({
        booking_id: bookingId,
        service_id: booking.service_id,
        token,
        guest_name: guestName,
        guest_email: guestEmail,
        is_used: false,
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error generating review token:', err);
    return null;
  }
}

/**
 * Validate a review token and return associated data
 */
export async function validateReviewToken(token: string): Promise<{
  valid: boolean;
  tokenData?: ReviewToken;
  booking?: any;
  service?: any;
} | null> {
  try {
    const { data, error } = await supabase
      .from('review_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return { valid: false };
    }

    // Check if already used
    if (data.is_used) {
      return { valid: false, tokenData: data };
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return { valid: false, tokenData: data };
    }

    // Fetch service details
    const { data: service } = await supabase
      .from('services')
      .select(`
        id, title, slug, images, location, price, currency,
        vendors (id, business_name),
        service_categories (id, name)
      `)
      .eq('id', data.service_id)
      .single();

    // Fetch booking details
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', data.booking_id)
      .single();

    return {
      valid: true,
      tokenData: data,
      booking,
      service,
    };
  } catch (err) {
    console.error('Error validating review token:', err);
    return null;
  }
}

/**
 * Submit a review using a review token (verified booking review)
 */
export async function submitReviewWithToken(
  token: string,
  review: {
    rating: number;
    comment: string;
    visitorName?: string;
    kpiRatings?: Record<string, number>;
  }
): Promise<ServiceReview | null> {
  try {
    // Validate token first
    const validation = await validateReviewToken(token);
    if (!validation?.valid || !validation.tokenData) {
      throw new Error('Invalid or expired review token');
    }

    const tokenData = validation.tokenData;

    // Create the review as a verified booking review
    const { data: reviewData, error: reviewError } = await supabase
      .from('service_reviews')
      .insert({
        service_id: tokenData.service_id,
        visitor_name: review.visitorName || tokenData.guest_name,
        visitor_email: tokenData.guest_email,
        rating: review.rating,
        kpi_ratings: review.kpiRatings || null,
        comment: review.comment,
        is_verified_booking: true,
        status: 'approved', // Auto-approve verified booking reviews
      })
      .select('*')
      .single();

    if (reviewError) throw reviewError;

    // Mark token as used
    await supabase
      .from('review_tokens')
      .update({ is_used: true })
      .eq('id', tokenData.id);

    return reviewData;
  } catch (err) {
    console.error('Error submitting review with token:', err);
    throw err;
  }
}

/**
 * Get all pending reviews for admin moderation
 * Uses the admin RPC and filters client-side for pending status
 */
export async function getAllPendingReviews(): Promise<(ServiceReview & { service_title?: string; vendor_name?: string })[]> {
  try {
    const allReviews = await getAllReviewsForAdmin();
    return allReviews.filter(r => r.status === 'pending');
  } catch (err) {
    console.error('Error fetching pending reviews:', err);
    return [];
  }
}

/**
 * Get all reviews for admin (all statuses)
 * Uses SECURITY DEFINER RPC to bypass RLS and ensure all reviews are returned
 */
export async function getAllReviewsForAdmin(): Promise<(ServiceReview & { service_title?: string; vendor_name?: string })[]> {
  try {
    const { data, error } = await supabase.rpc('get_all_reviews_admin');

    if (error) throw error;

    // RPC returns a JSON array or null
    const reviews = data || [];
    return reviews.map((r: any) => ({
      ...r,
      service_title: r.service_title || 'Unknown Service',
      vendor_name: r.vendor_name || 'Unknown Vendor',
    }));
  } catch (err) {
    console.error('Error fetching all reviews:', err);
    return [];
  }
}

/**
 * Approve a review (uses SECURITY DEFINER RPC to bypass RLS)
 */
export async function approveReview(reviewId: string, approvedBy?: string): Promise<ServiceReview> {
  try {
    const { data, error } = await supabase.rpc('admin_approve_review', {
      p_review_id: reviewId,
      p_approved_by: approvedBy || null,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error approving review:', err);
    throw err;
  }
}

/**
 * Reject a review (uses SECURITY DEFINER RPC to bypass RLS)
 */
export async function rejectReview(reviewId: string, reason?: string): Promise<ServiceReview> {
  try {
    const { data, error } = await supabase.rpc('admin_reject_review', {
      p_review_id: reviewId,
      p_reason: reason || 'Review does not meet guidelines',
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error rejecting review:', err);
    throw err;
  }
}

/**
 * Get average rating for a service from approved reviews
 */
export async function getServiceAverageRating(serviceId: string): Promise<{ average: number; count: number; kpiAverages?: Record<string, { average: number; count: number }> }> {
  try {
    const { data, error } = await supabase
      .from('service_reviews')
      .select('rating, kpi_ratings')
      .eq('service_id', serviceId)
      .eq('status', 'approved');

    if (error) throw error;

    const reviews = data || [];
    if (reviews.length === 0) return { average: 0, count: 0 };

    const total = reviews.reduce((sum, r) => sum + r.rating, 0);

    // Calculate KPI averages from all reviews that have kpi_ratings
    const kpiTotals: Record<string, { total: number; count: number }> = {};
    for (const review of reviews) {
      if (review.kpi_ratings && typeof review.kpi_ratings === 'object') {
        for (const [key, value] of Object.entries(review.kpi_ratings as Record<string, number>)) {
          if (value && value > 0) {
            if (!kpiTotals[key]) kpiTotals[key] = { total: 0, count: 0 };
            kpiTotals[key].total += value;
            kpiTotals[key].count += 1;
          }
        }
      }
    }

    const kpiAverages: Record<string, { average: number; count: number }> = {};
    for (const [key, { total: kpiTotal, count: kpiCount }] of Object.entries(kpiTotals)) {
      kpiAverages[key] = {
        average: Math.round((kpiTotal / kpiCount) * 10) / 10,
        count: kpiCount,
      };
    }

    return {
      average: Math.round((total / reviews.length) * 10) / 10,
      count: reviews.length,
      kpiAverages: Object.keys(kpiAverages).length > 0 ? kpiAverages : undefined,
    };
  } catch (err) {
    console.error('Error fetching average rating:', err);
    return { average: 0, count: 0 };
  }
}

/**
 * Send review request email when booking is completed.
 * Uses Supabase Edge Function or a simple fetch to your email API.
 * Falls back to generating a review link the vendor can share manually.
 */
export async function sendReviewRequestEmail(
  bookingId: string,
  reviewToken: string,
  guestEmail: string,
  guestName: string,
  serviceName: string,
  vendorName: string
): Promise<{ sent: boolean; reviewUrl: string }> {
  const baseUrl = window.location.origin;
  const reviewUrl = `${baseUrl}/review/${reviewToken}`;

  try {
    // Try to use Supabase Edge Function for email
    const { error } = await supabase.functions.invoke('send-review-email', {
      body: {
        to: guestEmail,
        guestName,
        serviceName,
        vendorName,
        reviewUrl,
        bookingId,
      },
    });

    if (error) {
      console.warn('Edge function email not available, review link generated:', reviewUrl);
      return { sent: false, reviewUrl };
    }

    return { sent: true, reviewUrl };
  } catch (err) {
    console.warn('Email sending failed, review link generated:', reviewUrl);
    return { sent: false, reviewUrl };
  }
}

// Scan Session Management Functions
export interface ScanSession {
  id: string;
  service_id: string;
  created_by: string;
  start_time: string;
  duration_hours: number;
  end_time: string;
  status: 'active' | 'expired' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export async function createScanSession(serviceId: string, durationHours: number): Promise<ScanSession | null> {
  try {
    const { data, error } = await supabase
      .from('scan_sessions')
      .insert([{
        service_id: serviceId,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        duration_hours: durationHours,
        end_time: new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString(),
        status: 'active'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating scan session:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception creating scan session:', err);
    return null;
  }
}

export async function getActiveScanSession(serviceId: string): Promise<ScanSession | null> {
  try {
    const { data, error } = await supabase
      .from('scan_sessions')
      .select('*')
      .eq('service_id', serviceId)
      .eq('status', 'active')
      .gt('end_time', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No active session found is not an error
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error getting active scan session:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception getting active scan session:', err);
    return null;
  }
}

export async function expireScanSession(sessionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('scan_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      console.error('Error expiring scan session:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception expiring scan session:', err);
    return false;
  }
}

export async function getScanSessionsForService(serviceId: string): Promise<ScanSession[]> {
  try {
    const { data, error } = await supabase
      .from('scan_sessions')
      .select('*')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting scan sessions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception getting scan sessions:', err);
    return [];
  }
}

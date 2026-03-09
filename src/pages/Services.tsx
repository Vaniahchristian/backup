import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Hotel, Map, Utensils, Car, Target, Plane, Search, Heart, MapPin, Star, ShoppingBag } from 'lucide-react'
import { getServiceCategories, getServiceAverageRating } from '../lib/database'
import { useServices } from '../hooks/hook'
import { usePreferences } from '../contexts/PreferencesContext'
import { formatCurrencyWithConversion } from '../lib/utils'
import type { Service } from '../types'

const categories = [
  {
    name: 'Accommodation',
    href: '/category/hotels',
    icon: Hotel,
    description: 'Find the perfect accommodation for your stay',
    color: 'bg-blue-500'
  },
  {
    name: 'Tours',
    href: '/category/tours',
    icon: Map,
    description: 'Explore amazing destinations and experiences',
    color: 'bg-green-500'
  },
  {
    name: 'Restaurants',
    href: '/category/restaurants',
    icon: Utensils,
    description: 'Discover great places to eat and drink',
    color: 'bg-orange-500'
  },
  {
    name: 'Transport',
    href: '/category/transport',
    icon: Car,
    description: 'Get around with reliable transportation',
    color: 'bg-purple-500'
  },
  {
    name: 'Shops',
    href: '/category/shops',
    icon: ShoppingBag,
    description: 'Find unique shops and retail experiences',
    color: 'bg-pink-500'
  },
  {
    name: 'Flights',
    href: '/category/flights',
    icon: Plane,
    description: 'Flights in Uganda',
    color: 'bg-indigo-500'
  },
  {
    name: 'Events',
    href: '/category/events',
    icon: Target,
    description: 'Book exciting activities and adventures',
    color: 'bg-red-500'
  }
]

export default function Services() {
  const [dbCategories, setDbCategories] = useState<Array<{id: string, name: string, icon?: string | React.ComponentType<any>}>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedService, setSelectedService] = useState<Service | null>(null)

  // Use the reactive useServices hook instead of local state
  const { services: allServices, loading: servicesLoading } = useServices(undefined, { includeExpired: false })
  // Use centralized formatting helper from lib/utils

  // Helper function to render icons (handles both string and component icons)
  const renderIcon = (icon: any, className: string = "h-4 w-4") => {
    if (typeof icon === 'string') {
      return <span className={className}>{icon}</span>
    }
    const IconComponent = icon
    return <IconComponent className={className} />
  }

  // Combined loading state
  const isLoading = servicesLoading

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const categories = await getServiceCategories()
      // Sort categories so Events comes last
      const sortedCategories = categories.sort((a, b) => {
        if (a.id === 'cat_activities') return 1
        if (b.id === 'cat_activities') return -1
        return a.name.localeCompare(b.name)
      })
      
      // Add "All" category at the beginning
      const allCategories = [
        { id: 'all', name: 'All', icon: Map },
        ...sortedCategories.map(cat => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon || '📍'
        }))
      ]
      setDbCategories(allCategories)
    } catch (error) {
      console.error('Error fetching categories:', error)
      // Fallback to basic categories if database fetch fails
      setDbCategories([
        { id: 'all', name: 'All', icon: Map },
        { id: 'cat_hotel', name: 'Hotels', icon: Hotel },
        { id: 'cat_tour', name: 'Tours', icon: Map },
        { id: 'cat_restaurant', name: 'Restaurants', icon: Utensils },
        { id: 'cat_transport', name: 'Transport', icon: Car },
        { id: 'cat_flights', name: 'Flights', icon: Plane },
        { id: 'cat_activities', name: 'Events', icon: Target }
      ])
    }
  }

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId)
  }

  // Filter by search query first (across all categories if searching)
  const approvedServices = allServices.filter(service => 
    service.status === 'approved' && 
    (!service.vendors || service.vendors.status !== 'suspended')
  )
  
  const searchFilteredServices = approvedServices.filter((service: Service) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return service.title.toLowerCase().includes(query) ||
           (service.location?.toLowerCase().includes(query) ?? false) ||
           (service.vendors?.business_name.toLowerCase().includes(query) ?? false) ||
           (service.service_categories?.name.toLowerCase().includes(query) ?? false) ||
           (service.description?.toLowerCase().includes(query) ?? false) ||
           // Also check for flight-specific search terms
           query.includes('flight') && service.category_id === 'cat_flights' ||
           query.includes('air') && service.category_id === 'cat_flights' ||
           query.includes('plane') && service.category_id === 'cat_flights' ||
           query.includes('airline') && service.category_id === 'cat_flights' ||
           query.includes('aviation') && service.category_id === 'cat_flights'
  })

  // Apply category filtering only when not searching
  const categoryFilteredServices = searchQuery 
    ? searchFilteredServices 
    : searchFilteredServices.filter(service => {
        if (selectedCategory === 'all') return true
        return service.category_id === selectedCategory
      })

  const currentItems = categoryFilteredServices
  const currentItemCount = currentItems.length

  if (selectedService) {
    return (
      <ServiceDetail 
        service={selectedService} 
        onBack={() => setSelectedService(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Filter Layout */}
      <div className="md:hidden">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Our Services</h1>
            
            {/* Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="I want ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category Filters */}
            <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
              {dbCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(category.id)}
                  className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border flex-shrink-0 min-w-0 ${
                    selectedCategory === category.id
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <span className="text-xs hidden md:inline">{renderIcon(category.icon, "h-4 w-4")}</span>
                  <span>{category.name}</span>
                </button>
              ))}
            </div>

            {/* Results Header */}
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {searchQuery
                  ? `Search results for "${searchQuery}"`
                  : selectedCategory === 'all'
                    ? 'All Services'
                    : dbCategories.find(cat => cat.id === selectedCategory)?.name || selectedCategory}
              </h2>
              <p className="text-gray-600 text-sm">
                {currentItemCount} {searchQuery ? 'result' : 'service'}{currentItemCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <div className="px-4 py-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentItems.map((service: Service) => (
                <ServiceCard 
                  key={service.id} 
                  service={service}
                  onClick={() => setSelectedService(service)}
                />
              ))}
            </div>
          </div>
        )}

        {!isLoading && currentItemCount === 0 && (
          <div className="text-center py-16 px-4">
            <Search className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Desktop Layout - Original Card Layout */}
      <div className="hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Our Services</h1>
            <p className="text-lg text-gray-600">
              Discover and book amazing experiences, accommodations, and transportation services
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <Link
                key={category.name}
                to={category.href}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center mb-4">
                  <div className={`p-3 rounded-lg ${category.color} text-white mr-4 group-hover:scale-110 transition-transform`}>
                    <category.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">{category.name}</h3>
                </div>
                <p className="text-gray-600 text-elegant">{category.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ServiceCardProps {
  service: Service
  onClick: () => void
}
function ServiceCard({ service, onClick }: ServiceCardProps) {
  const [isSaved, setIsSaved] = useState(false)
  const [rating, setRating] = useState<number>(0)
  const [reviewCount, setReviewCount] = useState<number>(0)
  const { selectedCurrency, selectedLanguage } = usePreferences()
  
  // Fetch service rating and review count
  useEffect(() => {
    const fetchRating = async () => {
      try {
        const ratingData = await getServiceAverageRating(service.id)
        setRating(ratingData.average || 0)
        setReviewCount(ratingData.count || 0)
      } catch (error) {
        console.error('Error fetching service rating:', error)
        setRating(0)
        setReviewCount(0)
      }
    }
    fetchRating()
  }, [service.id])
  
  // Provide fallback image if no images exist
  const displayImage = service.images && service.images.length > 0 
    ? service.images[0] 
    : 'https://via.placeholder.com/400x300/f3f4f6/9ca3af?text=No+Image'
  
  return (
    <div 
      onClick={onClick}
      className="group block cursor-pointer"
    >
      <div className="bg-white rounded-2xl overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-100">
        {/* Image Container */}
        <div className="relative">
          <img
            loading="lazy"
            decoding="async"
            src={displayImage}
            alt={service.title}
            className="w-full h-44 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-500"
          />
          
          {/* Save Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsSaved(!isSaved)
            }}
            className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
          >
            <Heart 
              className={`h-5 w-5 transition-colors ${
                isSaved ? 'fill-red-500 text-red-500' : 'text-gray-700'
              }`}
            />
          </button>

          {/* Category Badge */}
          <div className="absolute bottom-3 left-3">
            <span className="bg-white/95 px-3 py-1 rounded-full text-xs font-semibold text-gray-800">
              {service.service_categories?.name || service.category_id}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Location & Rating */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center text-sm text-gray-600 flex-1 min-w-0">
              <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className="truncate">{service.location || 'Location TBA'}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg ml-2">
              <Star className="h-4 w-4 text-emerald-600 fill-current flex-shrink-0" />
              <span className="text-sm font-bold text-emerald-700">{rating > 0 ? rating.toFixed(1) : '0'}</span>
              {reviewCount > 0 && (
                <span className="text-sm text-gray-600 ml-0.5">({reviewCount})</span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-1 group-hover:text-emerald-600 transition-colors line-clamp-2 min-h-[3rem]">
            {service.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {service.description}
          </p>

          {/* Reviews & Vendor */}
          <div className="text-xs text-gray-500 mb-3">
            0 reviews • {service.vendors?.business_name || 'Vendor'}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">From</span>
              <span className="text-lg sm:text-xl font-bold text-gray-900">
              {formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage)}
            </span>
            <span className="text-xs text-gray-500">
              {service.service_categories?.name?.toLowerCase() === 'transport' ? 'per day' : 'per person'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ServiceDetailProps {
  service: Service
  onBack: () => void
}
function ServiceDetail({ service, onBack }: ServiceDetailProps) {
  const [isSaved, setIsSaved] = useState(false)
  const { selectedCurrency, selectedLanguage } = usePreferences()

  // Provide fallback image if no images exist
  const displayImage = service.images && service.images.length > 0 
    ? service.images[0] 
    : 'https://via.placeholder.com/800x400/f3f4f6/9ca3af?text=No+Image'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back Button */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-900 font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to search
          </button>
        </div>
      </div>

      {/* Hero Image */}
      <div className="relative h-96 bg-gray-900">
        <img
          loading="lazy"
          decoding="async"
          src={displayImage}
          alt={service.title}
          className="w-full h-full object-cover opacity-90"
        />
        <button
          onClick={() => setIsSaved(!isSaved)}
          className="absolute top-6 right-6 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
        >
          <Heart 
            className={`h-6 w-6 ${
              isSaved ? 'fill-red-500 text-red-500' : 'text-gray-700'
            }`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm p-8">
              {/* Title & Rating */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    {service.service_categories?.name || service.category_id}
                  </span>
                  <div className="flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full">
                    <Star className="h-4 w-4 text-emerald-600 fill-current" />
                    <span className="text-sm font-bold text-emerald-700">4.5</span>
                    <span className="text-sm text-gray-600">(0 reviews)</span>
                  </div>
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-3">
                  {service.title}
                </h1>
                <div className="flex items-center text-gray-600">
                  <MapPin className="h-5 w-5 mr-2" />
                  <span className="text-lg">{service.location}</span>
                </div>
              </div>

              {/* Description */}
              <div className="mb-8 pb-8 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">About this experience</h2>
                <p className="text-gray-700 text-lg leading-relaxed">
                  {service.description}
                </p>
              </div>

              {/* Vendor Info */}
              <div className="mb-8 pb-8 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Provided by</h2>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-emerald-700">
                      {service.vendors?.business_name?.charAt(0) || 'V'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{service.vendors?.business_name || 'Vendor'}</h3>
                    <p className="text-gray-600">Professional tour operator</p>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Highlights</h2>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <svg className="w-6 h-6 text-emerald-600 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Professional guided experience</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-6 h-6 text-emerald-600 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Free cancellation up to 24 hours before</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-6 h-6 text-emerald-600 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">All equipment and materials included</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-6 h-6 text-emerald-600 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Small group size for personalized attention</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Booking Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-6">
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm text-gray-600">From</span>
                  <span className="text-3xl font-bold text-gray-900">
                    {formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {service.service_categories?.name?.toLowerCase() === 'transport' ? 'per day' : 'per person'}
                </p>
              </div>

              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-semibold text-lg transition-colors mb-4">
                Check availability
              </button>

              <button className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-3 rounded-xl font-semibold transition-colors mb-6">
                Contact Provider
              </button>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-bold text-gray-900 mb-4">What's included</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-emerald-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Professional guide
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-emerald-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    All fees and taxes
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-emerald-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Insurance coverage
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Search, MapPin, Star, SlidersHorizontal, Hotel, Map, Car, Utensils, Target, Plane, ShoppingBag, Package, ChevronDown, X } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { usePreferences } from '../contexts/PreferencesContext'
import { Link } from 'react-router-dom'
import { useServices } from '../hooks/hook'
import { getServiceAverageRating } from '../lib/database'
import type { Service } from '../types'

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const { services: allServices, loading } = useServices(undefined, { includeExpired: false })
  const [filteredServices, setFilteredServices] = useState<Service[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('recommended')
  const [priceRange, setPriceRange] = useState([0, 1000000])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')

  const categoryMapping: { [key: string]: string } = {
    'hotels': 'cat_hotels',
    'tours': 'cat_tour_packages',
    'restaurants': 'cat_restaurants',
    'transport': 'cat_transport',
    'activities': 'cat_activities',
    'events': 'cat_activities',
    'flights': 'cat_flights',
    'shops': 'cat_shops'
  }

  const categoryNames: { [key: string]: string } = {
    'hotels': 'Stays',
    'tours': 'Tours',
    'restaurants': 'Restaurants',
    'transport': 'Transport',
    'activities': 'Events',
    'events': 'Events',
    'flights': 'Flights',
    'shops': 'Shops',
    'services': 'All Services'
  }

  // Category accent colors
  const categoryAccents: { [key: string]: string } = {
    'hotels': 'from-indigo-900 to-indigo-700',
    'tours': 'from-emerald-900 to-teal-700',
    'restaurants': 'from-orange-900 to-amber-700',
    'transport': 'from-slate-900 to-slate-700',
    'activities': 'from-purple-900 to-violet-700',
    'events': 'from-purple-900 to-violet-700',
    'flights': 'from-sky-900 to-cyan-700',
    'shops': 'from-rose-900 to-pink-700',
    'services': 'from-gray-900 to-gray-700'
  }

  const getCategoryFilters = () => {
    if (category === 'services') {
      return [
        { key: 'all', label: 'All' },
        { key: 'flights', label: 'Flights' },
        { key: 'hotels', label: 'Stays' },
        { key: 'tours', label: 'Tours' },
        { key: 'restaurants', label: 'Restaurants' },
        { key: 'transport', label: 'Transport' },
        { key: 'events', label: 'Events' },
        { key: 'shops', label: 'Shops' }
      ]
    } else if (category && categoryMapping[category]) {
      const categoryId = categoryMapping[category]
      switch (categoryId) {
        case 'cat_flights':
          return [
            { key: 'all', label: 'All Flights' },
            { key: 'domestic', label: 'Domestic' },
            { key: 'international', label: 'International' },
            { key: 'business', label: 'Business' },
            { key: 'economy', label: 'Economy' }
          ]
        case 'cat_hotels':
          return [
            { key: 'all', label: 'All Stays' },
            { key: 'budget', label: 'Budget' },
            { key: 'midrange', label: 'Mid-range' },
            { key: 'luxury', label: 'Luxury' },
            { key: 'resort', label: 'Resort' }
          ]
        case 'cat_tour_packages':
          return [
            { key: 'all', label: 'All Tours' },
            { key: 'daytrip', label: 'Day Trips' },
            { key: 'multiday', label: 'Multi-day' },
            { key: 'adventure', label: 'Adventure' },
            { key: 'cultural', label: 'Cultural' }
          ]
        case 'cat_restaurants':
          return [
            { key: 'all', label: 'All Restaurants' },
            { key: 'local', label: 'Local' },
            { key: 'international', label: 'International' },
            { key: 'fine', label: 'Fine Dining' },
            { key: 'casual', label: 'Casual' }
          ]
        case 'cat_transport':
          return [
            { key: 'all', label: 'All Transport' },
            { key: 'taxi', label: 'Taxi' },
            { key: 'bus', label: 'Bus' },
            { key: 'private', label: 'Private Car' },
            { key: 'shuttle', label: 'Shuttle' }
          ]
        case 'cat_activities':
          return [
            { key: 'all', label: 'All Events' },
            { key: 'outdoor', label: 'Outdoor' },
            { key: 'indoor', label: 'Indoor' },
            { key: 'water', label: 'Water Sports' },
            { key: 'cultural', label: 'Cultural' }
          ]
        default:
          return [{ key: 'all', label: 'All' }]
      }
    }
    return [{ key: 'all', label: 'All' }]
  }

  const categoryFilters = getCategoryFilters()
  const categoryName = categoryNames[category || ''] || 'Services'
  const accentGradient = categoryAccents[category || ''] || 'from-gray-900 to-gray-700'

  useEffect(() => {
    if (allServices) {
      let filtered = allServices
      if (category && category !== 'all' && category !== 'services') {
        const targetCategoryId = categoryMapping[category]
        if (targetCategoryId) {
          filtered = allServices.filter(service => service.category_id === targetCategoryId)
        }
      }
      filtered = filtered.filter(service => {
        if (!service.vendors) return service.status !== 'inactive'
        return service.status === 'approved' && service.vendors.status !== 'suspended'
      })
      setFilteredServices(filtered)
    }
  }, [allServices, category])

  useEffect(() => {
    setSelectedCategoryFilter('all')
  }, [category])

  const { t } = usePreferences()

  const searchFilteredServices = filteredServices.filter(service => {
    const matchesSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (service.location?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
                         (service.vendors?.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    const matchesPrice = service.price >= priceRange[0] && service.price <= priceRange[1]
    let matchesCategoryFilter = true
    if (category === 'services') {
      matchesCategoryFilter = selectedCategoryFilter === 'all' ||
                             service.category_id === categoryMapping[selectedCategoryFilter]
    } else {
      matchesCategoryFilter = selectedCategoryFilter === 'all'
    }
    return matchesSearch && matchesPrice && matchesCategoryFilter
  })

  const sortedServices = [...searchFilteredServices].sort((a, b) => {
    switch (sortBy) {
      case 'price-low': return a.price - b.price
      case 'price-high': return b.price - a.price
      default: return 0
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Category header banner */}
      <div className={`bg-gradient-to-r ${accentGradient} py-10 md:py-14`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">Uganda</p>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            {categoryName}
          </h1>
          <p className="text-white/60 mt-2 text-sm md:text-base">
            {sortedServices.length > 0
              ? `${sortedServices.length} option${sortedServices.length !== 1 ? 's' : ''} available`
              : 'Browse available options'}
          </p>
        </div>
      </div>

      {/* Sticky search + filter bar */}
      <div className="bg-white border-b border-gray-100 sticky top-16 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t('search_placeholder')}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="relative hidden md:block">
              <select
                className="appearance-none pl-4 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Filters toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                showFilters
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>

          {/* Sub-category pills */}
          {categoryFilters.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-3 pb-1">
              {categoryFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setSelectedCategoryFilter(filter.key)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                    selectedCategoryFilter === filter.key
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="border-t border-gray-100 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Price Range (UGX)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={priceRange[0]}
                      onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                    />
                    <span className="text-gray-400 text-sm">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Location
                  </label>
                  <div className="relative">
                    <select className="w-full appearance-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option>All locations</option>
                      <option>Kampala</option>
                      <option>Jinja</option>
                      <option>Entebbe</option>
                      <option>Murchison Falls</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Rating
                  </label>
                  <div className="relative">
                    <select className="w-full appearance-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option>Any rating</option>
                      <option>4+ stars</option>
                      <option>3+ stars</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-emerald-600"></div>
          </div>
        ) : sortedServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Search className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-500 text-sm max-w-sm">Try adjusting your search or filters</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-5 px-6 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {sortedServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ServiceCardProps {
  service: Service
}

function ServiceCard({ service }: ServiceCardProps) {
  const [rating, setRating] = useState<number>(0)
  const [reviewCount, setReviewCount] = useState<number>(0)
  const imageUrl = service.images?.[0] || 'https://images.pexels.com/photos/1320684/pexels-photo-1320684.jpeg'

  useEffect(() => {
    const fetchRating = async () => {
      try {
        const ratingData = await getServiceAverageRating(service.id)
        setRating(ratingData.average || 0)
        setReviewCount(ratingData.count || 0)
      } catch {
        setRating(0)
        setReviewCount(0)
      }
    }
    fetchRating()
  }, [service.id])

  const getCategoryBadge = () => {
    switch (service.category_id) {
      case 'cat_hotels': return { label: 'Stay', Icon: Hotel }
      case 'cat_tour_packages': return { label: 'Tour', Icon: Map }
      case 'cat_transport': return { label: 'Transport', Icon: Car }
      case 'cat_restaurants': return { label: 'Restaurant', Icon: Utensils }
      case 'cat_activities': return { label: 'Event', Icon: Target }
      case 'cat_flights': return { label: 'Flight', Icon: Plane }
      case 'cat_shops': return { label: 'Shop', Icon: ShoppingBag }
      default: return { label: 'Service', Icon: Package }
    }
  }

  const getUnitLabel = () => {
    switch (service.category_id) {
      case 'cat_transport': return 'per day'
      case 'cat_hotels': return 'per night'
      case 'cat_shops': return 'per item'
      case 'cat_restaurants': return 'per meal'
      case 'cat_activities': return 'per ticket'
      case 'cat_tour_packages': return 'per guest'
      default: return 'per person'
    }
  }

  const { label, Icon } = getCategoryBadge()

  return (
    <Link to={`/service/${service.slug || service.id}`} className="group block">
      {/* Image */}
      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 relative shadow-sm group-hover:shadow-md transition-shadow duration-300 mb-2.5">
        {/* Category badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white/95 px-2.5 py-1 rounded-full shadow-sm">
          <Icon className="h-3 w-3 text-gray-700" />
          <span className="text-[11px] font-semibold text-gray-800">{label}</span>
        </div>

        <img
          src={imageUrl}
          alt={service.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Rating badge top-right */}
        {(rating > 0 || reviewCount > 0) && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
            <span className="text-[11px] font-semibold text-white">{rating > 0 ? rating.toFixed(1) : '0'}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1 group-hover:text-emerald-700 transition-colors">
          {service.title}
        </h3>

        {service.location && (
          <div className="flex items-center gap-1 mt-0.5 text-gray-500">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="text-xs truncate">{service.location}</span>
          </div>
        )}

        <div className="flex items-baseline gap-1 mt-1.5">
          <span className="text-[10px] text-gray-500">From</span>
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(service.price, service.currency)}
          </span>
          <span className="text-[10px] text-gray-500">{getUnitLabel()}</span>
        </div>

        {reviewCount > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="h-3 w-3 text-emerald-600 fill-emerald-600" />
            <span className="text-xs text-gray-600">{rating.toFixed(1)}</span>
            <span className="text-xs text-gray-400">({reviewCount})</span>
          </div>
        )}
      </div>
    </Link>
  )
}

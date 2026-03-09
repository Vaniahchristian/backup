import { useState, useEffect, useRef } from 'react'
import { Search, X, MapPin, HelpCircle, Shield, FileText, Globe } from 'lucide-react'
import { useServices } from '../hooks/hook'
import { Link } from 'react-router-dom'
import type { Service } from '../types'
import { usePreferences } from '../contexts/PreferencesContext'

// Support content data
const faqCategories = [
  {
    id: 'booking',
    name: 'Booking & Reservations',
    icon: MapPin,
    faqs: [
      {
        question: "How do I book a service?",
        answer: "Browse our categories (hotels, tours, restaurants, transport) and click on any service to view details. Select your preferred options and click 'Book Now' to complete your reservation."
      },
      {
        question: "Can I modify or cancel my booking?",
        answer: "Yes, you can modify or cancel most bookings through your account dashboard. Contact the service provider directly for changes, or reach out to our support team for assistance."
      },
      {
        question: "Can I book for multiple people?",
        answer: "Yes, most services allow you to book for multiple guests. Specify the number of guests during the booking process, and pricing will be adjusted accordingly."
      }
    ]
  },
  {
    id: 'payment',
    name: 'Payment & Billing',
    icon: FileText,
    faqs: [
      {
        question: "What payment methods do you accept?",
        answer: "We accept major credit cards, debit cards, mobile money (MTN/Airtel), and bank transfers. All payments are processed securely through our payment partners."
      },
      {
        question: "Are there any booking fees?",
        answer: "DirtTrails charges a small service fee for bookings, which varies by service type. The fee is clearly displayed before you complete your booking."
      }
    ]
  },
  {
    id: 'account',
    name: 'Account & Access',
    icon: Shield,
    faqs: [
      {
        question: "How do I reset my password?",
        answer: "Click 'Forgot Password' on the login page, enter your email address, and we'll send you a reset link. Follow the instructions in the email to create a new password."
      },
      {
        question: "How do I become a service provider?",
        answer: "Visit our 'Partner With Us' page to learn about becoming a service provider. Complete the registration process and submit required documentation for approval."
      }
    ]
  }
]

const safetyTips = [
  {
    icon: Shield,
    title: "Travel Insurance",
    description: "Always purchase comprehensive travel insurance that covers medical emergencies, trip cancellations, and lost belongings.",
    details: [
      "Medical evacuation coverage",
      "Trip interruption protection",
      "Lost luggage compensation",
      "24/7 emergency assistance"
    ]
  },
  {
    icon: HelpCircle,
    title: "Health Precautions",
    description: "Take necessary health precautions before and during your trip.",
    details: [
      "Consult a travel health clinic",
      "Get recommended vaccinations",
      "Carry necessary medications",
      "Stay hydrated and use sunscreen"
    ]
  },
  {
    icon: MapPin,
    title: "Local Awareness",
    description: "Stay informed about your surroundings and local conditions.",
    details: [
      "Research your destinations",
      "Keep important documents secure",
      "Be aware of local customs",
      "Learn basic local phrases"
    ]
  },
  {
    icon: Shield,
    title: "Service Provider Safety",
    description: "Choose verified service providers and communicate your plans.",
    details: [
      "Book through reputable platforms",
      "Share itinerary with trusted contacts",
      "Verify provider credentials",
      "Read reviews and ratings"
    ]
  }
]

const termsSections = [
  {
    title: "Acceptance of Terms",
    description: "By using DirtTrails, you agree to be bound by these terms and conditions.",
    details: [
      "Access constitutes acceptance",
      "Applicable to all users",
      "Regular review recommended"
    ]
  },
  {
    title: "User Responsibilities",
    description: "Maintain account security and provide accurate information.",
    details: [
      "Secure account credentials",
      "Accurate information required",
      "Report unauthorized access"
    ]
  },
  {
    title: "Booking Terms",
    description: "All bookings subject to availability and provider policies.",
    details: [
      "Subject to availability",
      "Prices may change",
      "Provider-specific policies"
    ]
  }
]

// Combined search result type
type SearchResult = {
  type: 'service' | 'faq' | 'safety' | 'terms' | 'web'
  service?: Service
  faq?: {
    question: string
    answer: string
    category: string
    categoryName: string
  }
  safety?: {
    title: string
    description: string
    details: string[]
  }
  terms?: {
    title: string
    description: string
    details: string[]
  }
  web?: {
    title: string
    url: string
    snippet: string
  }
}

interface GlobalSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { services: allServices } = useServices(undefined, { includeExpired: false })
  const { selectedCurrency, selectedLanguage } = usePreferences()
  // Web search function
  const searchWeb = async (query: string): Promise<SearchResult[]> => {
    try {
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
      const data = await response.json()

      const webResults: SearchResult[] = []

      // Add instant answer if available
      if (data.Answer) {
        webResults.push({
          type: 'web',
          web: {
            title: 'Instant Answer',
            url: data.AnswerURL || '#',
            snippet: data.Answer
          }
        })
      }

      // Add abstract if available
      if (data.Abstract) {
        webResults.push({
          type: 'web',
          web: {
            title: data.Heading || 'Web Result',
            url: data.AbstractURL,
            snippet: data.Abstract
          }
        })
      }

      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
          if (topic.Text && topic.FirstURL) {
            webResults.push({
              type: 'web',
              web: {
                title: topic.Text.split(' - ')[0] || 'Related Topic',
                url: topic.FirstURL,
                snippet: topic.Text
              }
            })
          }
        })
      }

      return webResults
    } catch (error) {
      console.error('Web search error:', error)
      return []
    }
  }

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Search functionality
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setIsLoading(true)

    const performSearch = async () => {
      const searchTerm = query.toLowerCase().trim()
      const combinedResults: SearchResult[] = []

      // Search services
      const serviceResults = allServices.filter((service) => {
        // Search in title
        if (service.title?.toLowerCase().includes(searchTerm)) return true

        // Search in description
        if (service.description?.toLowerCase().includes(searchTerm)) return true

        // Search in location
        if (service.location?.toLowerCase().includes(searchTerm)) return true

        // Search in vendor name
        if (service.vendors?.business_name?.toLowerCase().includes(searchTerm)) return true

        // Search in category name
        if (service.service_categories?.name?.toLowerCase().includes(searchTerm)) return true

        // Search in amenities
        if (service.amenities?.some((amenity: string) => amenity.toLowerCase().includes(searchTerm))) return true

        // Search in tags/keywords (if any)
        if (service.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm))) return true

        return false
      }).map((service: Service) => ({ type: 'service' as const, service }))

      combinedResults.push(...serviceResults)

      // Search FAQs
      const faqResults = faqCategories.flatMap(cat =>
        cat.faqs.filter(faq =>
          faq.question.toLowerCase().includes(searchTerm) ||
          faq.answer.toLowerCase().includes(searchTerm)
        ).map(faq => ({
          type: 'faq' as const,
          faq: { ...faq, category: cat.id, categoryName: cat.name }
        }))
      )

      combinedResults.push(...faqResults)

      // Search safety tips
      const safetyResults = safetyTips.filter(tip =>
        tip.title.toLowerCase().includes(searchTerm) ||
        tip.description.toLowerCase().includes(searchTerm) ||
        tip.details.some(detail => detail.toLowerCase().includes(searchTerm))
      ).map(tip => ({ type: 'safety' as const, safety: tip }))

      combinedResults.push(...safetyResults)

      // Search terms sections
      const termsResults = termsSections.filter(section =>
        section.title.toLowerCase().includes(searchTerm) ||
        section.description.toLowerCase().includes(searchTerm) ||
        section.details.some(detail => detail.toLowerCase().includes(searchTerm))
      ).map(section => ({ type: 'terms' as const, terms: section }))

      combinedResults.push(...termsResults)

      // Search web (only if query is longer than 3 characters to avoid too many API calls)
      if (searchTerm.length > 3) {
        const webResults = await searchWeb(query)
        combinedResults.push(...webResults)
      }

      setTimeout(() => {
        // Limit to 15 results total
        setResults(combinedResults.slice(0, 15))
        setIsLoading(false)
      }, 200) // Small delay for better UX
    }

    performSearch()
  }, [query, allServices])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

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

  const formatAmount = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(selectedLanguage || 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch (error) {
      return `${currency} ${amount.toLocaleString()}`
    }
  }

  const formatCurrencyWithConversion = (amount: number, serviceCurrency: string) => {
    const convertedAmount = convertCurrency(amount, serviceCurrency, selectedCurrency || 'UGX')
    return formatAmount(convertedAmount, selectedCurrency || 'UGX')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 flex items-start justify-center pt-4 sm:pt-16 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden border border-gray-200">
        {/* Search Header */}
        <div className="flex items-center border-b border-gray-200 p-4 sm:p-6 bg-gray-50">
          <div className="flex items-center flex-1 bg-white rounded-lg border border-gray-300 px-4 py-3 sm:py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
            <Search className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search DirtTrails..."
              className="flex-1 text-base sm:text-base outline-none placeholder-gray-500 text-gray-900 bg-transparent min-w-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            onClick={onClose}
            className="ml-3 sm:ml-4 p-2 hover:bg-gray-100 rounded-full transition-colors duration-200 touch-manipulation"
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-[70vh] sm:max-h-[60vh] overflow-y-auto">
          {query.trim() === '' ? (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Search DirtTrails</h3>
              <p className="text-gray-600 max-w-md mx-auto text-sm sm:text-base">Find services, get help, and explore</p>
            </div>
          ) : isLoading ? (
            <div className="p-8 sm:p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-600">Try different keywords or check your spelling</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {results.map((result, index) => {
                if (result.type === 'service' && result.service) {
                  const service = result.service
                  return (
                    <Link
                      key={`service-${service.id}`}
                      to={`/service/${service.slug}`}
                      onClick={onClose}
                      className="block p-4 sm:p-3 hover:bg-gray-50 transition-all duration-200 border-l-4 border-transparent hover:border-blue-400 touch-manipulation"
                    >
                      <div className="flex items-start space-x-3">
                        {/* Service Image */}
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl overflow-hidden shadow-sm border border-gray-200">
                          {service.images && service.images.length > 0 ? (
                            <img
                              src={service.images[0]}
                              alt={service.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <MapPin className="h-5 w-5 text-blue-400" />
                            </div>
                          )}
                        </div>

                        {/* Service Content */}
                        <div className="flex-1 min-w-0">
                          {/* Header with Title and Price */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0 mr-3">
                              <h3 className="text-sm sm:text-sm font-medium text-gray-900 leading-tight mb-1">
                                {service.title}
                              </h3>
                              {service.service_categories?.name && (
                                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                  {service.service_categories.name}
                                </span>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-lg font-medium text-blue-400">
                                {formatCurrencyWithConversion(service.price, service.currency)}
                              </div>
                              {service.duration_hours && (
                                <div className="text-xs text-gray-500 mt-0.5 font-light">
                                  {service.duration_hours}h
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center text-xs text-gray-500 mb-2">
                            <MapPin className="h-3 w-3 mr-1 text-gray-400 flex-shrink-0" />
                            <span className="font-light truncate">{service.location || 'Location not specified'}</span>
                          </div>

                          {/* Vendor */}
                          {service.vendors?.business_name && (
                            <div className="text-xs text-gray-500 font-light">
                              <span className="text-gray-400">by </span>
                              <span className="font-normal text-gray-900">{service.vendors.business_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                }

                if (result.type === 'faq' && result.faq) {
                  const faq = result.faq
                  return (
                    <Link
                      key={`faq-${index}`}
                      to="/help"
                      onClick={onClose}
                      className="block p-4 sm:p-3 hover:bg-gray-50 transition-all duration-200 border-l-4 border-transparent hover:border-green-400 touch-manipulation"
                    >
                      <div className="flex items-start space-x-3">
                        {/* FAQ Icon */}
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shadow-sm border border-gray-200">
                          <HelpCircle className="h-5 w-5 text-green-600" />
                        </div>

                        {/* FAQ Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-sm font-medium text-gray-900 leading-tight mb-2">
                            {faq.question}
                          </h3>

                          {/* Category Badge */}
                          <div className="mb-2">
                            <span className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              FAQ - {faq.categoryName}
                            </span>
                          </div>

                          {/* Answer Preview */}
                          <p className="text-gray-600 text-xs leading-relaxed line-clamp-2 font-light">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                }

                if (result.type === 'safety' && result.safety) {
                  const safety = result.safety
                  return (
                    <Link
                      key={`safety-${index}`}
                      to="/safety"
                      onClick={onClose}
                      className="block p-4 sm:p-3 hover:bg-gray-50 transition-all duration-200 border-l-4 border-transparent hover:border-red-400 touch-manipulation"
                    >
                      <div className="flex items-start space-x-3">
                        {/* Safety Icon */}
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shadow-sm border border-gray-200">
                          <Shield className="h-5 w-5 text-red-600" />
                        </div>

                        {/* Safety Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-sm font-medium text-gray-900 leading-tight mb-2">
                            {safety.title}
                          </h3>

                          {/* Category Badge */}
                          <div className="mb-2">
                            <span className="inline-block bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              Safety Tip
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-gray-600 text-xs leading-relaxed line-clamp-2 font-light">
                            {safety.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                }

                if (result.type === 'terms' && result.terms) {
                  const terms = result.terms
                  return (
                    <Link
                      key={`terms-${index}`}
                      to="/terms"
                      onClick={onClose}
                      className="block p-4 sm:p-3 hover:bg-gray-50 transition-all duration-200 border-l-4 border-transparent hover:border-purple-400 touch-manipulation"
                    >
                      <div className="flex items-start space-x-3">
                        {/* Terms Icon */}
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shadow-sm border border-gray-200">
                          <FileText className="h-5 w-5 text-purple-600" />
                        </div>

                        {/* Terms Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-sm font-medium text-gray-900 leading-tight mb-2">
                            {terms.title}
                          </h3>

                          {/* Category Badge */}
                          <div className="mb-2">
                            <span className="inline-block bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              Terms & Conditions
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-gray-600 text-xs leading-relaxed line-clamp-2 font-light">
                            {terms.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                }

                return null
              })}

              {/* Web Results Section */}
              {results.some(result => result.type === 'web') && (
                <>
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Web Results</h3>
                  </div>
                  {results.filter(result => result.type === 'web').map((result, index) => {
                    if (result.type === 'web' && result.web) {
                      const web = result.web
                      return (
                        <a
                          key={`web-${index}`}
                          href={web.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={onClose}
                          className="block p-4 sm:p-3 hover:bg-gray-50 transition-all duration-200 border-l-4 border-transparent hover:border-orange-400 touch-manipulation"
                        >
                          <div className="flex items-start space-x-3">
                            {/* Web Icon */}
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shadow-sm border border-gray-200">
                              <Globe className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />
                            </div>

                            {/* Web Content */}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm sm:text-sm font-medium text-gray-900 leading-tight mb-2">
                                {web.title}
                              </h3>

                              {/* URL */}
                              <div className="text-xs text-gray-500 mb-2 truncate">
                                {web.url}
                              </div>

                              {/* Snippet */}
                              <p className="text-gray-600 text-xs leading-relaxed line-clamp-2 font-light">
                                {web.snippet}
                              </p>
                            </div>
                          </div>
                        </a>
                      )
                    }
                    return null
                  })}
                </>
              )}

              {results.length >= 15 && (
                <div className="p-4 sm:p-6 text-center border-t border-gray-200 bg-gray-50">
                  <Link
                    to={`/services?q=${encodeURIComponent(query)}`}
                    onClick={onClose}
                    className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors duration-200 touch-manipulation"
                  >
                    View all results for "{query}"
                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
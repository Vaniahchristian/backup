import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Search, MapPin, Star, Heart, MapPin as MapPinIcon, Hotel, Map, Car, Utensils, Target, ShoppingBag, ChevronDown, ChevronRight, Check, Filter } from 'lucide-react'
import { getServiceCategories, getServiceAverageRating, getTicketTypes } from '../lib/database'
import { useServices } from '../hooks/hook'
import { PageSkeleton } from '../components/SkeletonLoader'
import { usePreferences } from '../contexts/PreferencesContext'
import { formatCurrencyWithConversion, getDisplayPrice } from '../lib/utils'
import Money from '../components/Money'
import type { Service } from '../types'

// Playful titles per category. The UI will pick one title per category per day,
// seeded by a per-device random value stored in localStorage so different devices
// see different titles each day.
const CATEGORY_TITLES: Record<string, string[]> = {
  cat_restaurants: [
    'Are you hungry today?',
    'Taste the best in town',
    'Craving something delicious?',
    'Find your next favorite meal',
    'Food that speaks to your soul',
    'Local flavors await',
    'Feed your curiosity (and appetite)',
    'Satisfy your snack attack',
    'Dine like a local tonight',
    'Small plates, big smiles'
  ],
  cat_hotels: [
    'Sleep while you relax',
    'Rest easy, travel happier',
    'Your cozy corner awaits',
    'Dream big, sleep well',
    'Turn down service for your dreams',
    'Beds made for adventure',
    'Home away from home',
    'Pillow fights optional',
    'Wake up somewhere new',
    'Nightly stays, delightful days'
  ],
  cat_transport: [
    'Driving to your next destination made easy...',
    'Hop in — the road is calling',
    'Wheels ready, go explore',
    'Smooth rides, happy travels',
    'Arrive relaxed, not rushed',
    'Fuel your journey',
    'Drive local, discover more',
    'Fast lanes to new places',
    'Your ride, your way',
    'On the move? We got you'
  ],
  cat_tour_packages: [
    'Make memories, not plans',
    'Adventures for every mood',
    'See more, worry less',
    'Pack a day full of stories',
    'Tours that tell a tale',
    'Local guides, big experiences',
    'Take the scenic route today',
    'Your next story starts here',
    'From sunrise to sunset',
    'Bucket-list, meet reality'
  ],
  cat_activities: [
    'Ready for a little adventure?',
    'Fun things to do right now',
    'Make today unforgettable',
    'Activities to spark joy',
    'Try something new today',
    'Thrills, chills, and good vibes',
    'Find your next hobby',
    'Live the moment, book the activity',
    'Playful plans for the curious',
    'Adventure is calling — answer it'
  ],
  cat_shops: [
    'Shop at convenience',
    'Retail therapy, meet your match',
    'Find treasures around the corner',
    'Deals that make you smile',
    'Small shops, big finds',
    'Local goods, global vibes',
    'Bring home a story',
    'Shop slow, live well',
    'Gifts, treats, and little luxuries',
    'Discover something special'
  ]
}

// Simple deterministic hash function returning a 32-bit unsigned int
function simpleHash32(str: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function getDeviceSeed(): string {
  try {
    const key = 'dt_device_seed'
    if (typeof window === 'undefined') return String(Math.random())
    let seed = window.localStorage.getItem(key)
    if (!seed) {
      seed = Math.random().toString(36).slice(2, 10)
      window.localStorage.setItem(key, seed)
    }
    return seed
  } catch (e) {
    return Math.random().toString(36).slice(2, 10)
  }
}

function getDailyTitleForCategory(categoryId: string, fallback: string) {
  // Build a larger pool (≈100) by expanding the base titles with generators
  const pool = getAllTitles(categoryId)
  if (!pool || pool.length === 0) return fallback

  const deviceSeed = getDeviceSeed()
  // Use UTC date (YYYY-MM-DD) to have a new title each day
  const today = new Date().toISOString().slice(0, 10)
  const combined = deviceSeed + '|' + today + '|' + categoryId
  const hash = simpleHash32(combined)
  const idx = hash % pool.length
  return pool[idx]
}

// Generate expanded playful titles for a category by combining templates and modifiers
function getAllTitles(categoryId: string, desired = 100) {
  const base = CATEGORY_TITLES[categoryId] || []

  // Category-specific modifier pools and templates so generated titles match category intent
  const pools: Record<string, {starts: string[]; adjectives: string[]; hooks: string[]; templates: string[]}> = {
    cat_restaurants: {
      starts: ['Taste', 'Savor', 'Try', 'Discover', 'Grab', 'Nibble on', 'Treat yourself to', 'Feast on', 'Sample', 'Dig into'],
      adjectives: ['delicious', 'fresh', 'local', 'spicy', 'sweet', 'mouthwatering', 'comforting', 'authentic', 'seasonal', 'hearty'],
      hooks: ['near you', 'tonight', 'this week', 'for a date', 'after a long day', 'with friends', 'on the go', 'before sunset', 'for two', 'in town'],
      templates: [
        `${'{start}'} {adj} bites {hook}`,
        `${'{adjCap}'} flavors await {hook}`,
        `${'{start}'} the {adj} special {hook}`,
        `${'{start}'} new {adj} spots {hook}`,
        `${'{start}'} something {adj} {hook}`
      ]
    },
    cat_hotels: {
      starts: ['Rest', 'Sleep', 'Relax', 'Unwind', 'Stay', 'Recharge', 'Nestle into', 'Dream at', 'Check into', 'Cozy up at'],
      adjectives: ['cozy', 'calm', 'luxurious', 'quiet', 'comfortable', 'charming', 'peaceful', 'scenic', 'stylish', 'inviting'],
      hooks: ['after a day of exploring', 'tonight', 'this weekend', 'on your trip', 'with a view', 'near the market', 'close to the park', 'for a quick stay', 'during your tour', 'for two'],
      templates: [
        `${'{start}'} and {adj} {hook}`,
        `${'{adjCap}'} stays await {hook}`,
        `${'{start}'} somewhere {adj} {hook}`,
        `${'{start}'} where you can {adj}ly rest {hook}`,
        `${'{start}'} the {adj} corner {hook}`
      ]
    },
    cat_transport: {
      starts: ['Drive', 'Ride', 'Hop in', 'Get moving', 'Hit the road', 'Wheel your way', 'Cruise', 'Commute', 'Set off', 'Go further'],
      adjectives: ['smooth', 'fast', 'reliable', 'comfortable', 'scenic', 'safe', 'convenient', 'affordable', 'direct', 'hassle-free'],
      hooks: ['to your next stop', 'around town', 'to the park', 'to the airport', 'for an adventure', 'between cities', 'with ease', 'on demand', 'for the day', 'when you travel'],
      templates: [
        `${'{start}'} — {adj} rides {hook}`,
        `${'{start}'} to your {adj} destination {hook}`,
        `${'{start}'} the {adj} way {hook}`,
        `${'{start}'} and explore {hook}`,
        `${'{start}'} with {adj} comfort {hook}`
      ]
    },
    cat_tour_packages: {
      starts: ['Explore', 'Journey', 'Discover', 'Venture', 'Wander', 'Take a trip', 'Embark on', 'Tour', 'See', 'Experience'],
      adjectives: ['guided', 'epic', 'local', 'scenic', 'historic', 'immersive', 'unforgettable', 'curated', 'relaxing', 'adventurous'],
      hooks: ['today', 'this season', 'with a guide', 'for memories', 'on foot', 'by boat', 'with friends', 'in comfort', 'for a day', 'for the weekend'],
      templates: [
        `${'{start}'} a {adj} tour {hook}`,
        `${'{start}'} hidden gems {hook}`,
        `${'{start}'} the {adj} route {hook}`,
        `${'{start}'} beyond the guidebook {hook}`,
        `${'{start}'} places you’ll remember {hook}`
      ]
    },
    cat_activities: {
      starts: ['Try', 'Join', 'Book', 'Dive into', 'Get active with', 'Have fun with', 'Experience', 'Take part in', 'Play', 'Give a go'],
      adjectives: ['thrilling', 'relaxing', 'fun', 'outdoor', 'local', 'creative', 'intense', 'gentle', 'family-friendly', 'scenic'],
      hooks: ['today', 'this afternoon', 'this weekend', 'with friends', 'for the family', 'nearby', 'on a sunny day', 'after breakfast', 'before sunset', 'tonight'],
      templates: [
        `${'{start}'} a {adj} activity {hook}`,
        `${'{start}'} adventures {hook}`,
        `${'{start}'} moments that matter {hook}`,
        `${'{start}'} the outdoors {hook}`,
        `${'{start}'} something new {hook}`
      ]
    },
    cat_shops: {
      starts: ['Shop', 'Browse', 'Discover', 'Find', 'Pick up', 'Score', 'Collect', 'Snap up', 'Treat yourself with', 'Unearth'],
      adjectives: ['local', 'handmade', 'unique', 'useful', 'quirky', 'affordable', 'curated', 'giftable', 'artisanal', 'stylish'],
      hooks: ['nearby', 'today', 'for a gift', 'for the trip', 'at the market', 'before you leave', 'for memories', 'in town', 'for your home', 'to bring back'],
      templates: [
        `${'{start}'} {adj} finds {hook}`,
        `${'{start}'} treasures {hook}`,
        `${'{start}'} something special {hook}`,
        `${'{start}'} at the local stalls {hook}`,
        `${'{start}'} gifts and more {hook}`
      ]
    }
  }

  const poolDef = pools[categoryId] || {
    starts: ['Try', 'Discover', 'Find'],
    adjectives: ['great', 'new', 'local'],
    hooks: ['today', 'near you'],
    templates: [`${'{start}'} {adj} picks {hook}`]
  }

  const { starts, adjectives, hooks, templates } = poolDef

  const generated = new Set<string>(base)

  let i = 0
  while (generated.size < desired && i < 10000) {
    const s = starts[i % starts.length]
    const a = adjectives[(i * 7) % adjectives.length]
    const h = hooks[(i * 13) % hooks.length]
    const tmpl = templates[i % templates.length]

    const adjCap = a.charAt(0).toUpperCase() + a.slice(1)
    const composed = tmpl
      .replace('{start}', s)
      .replace('{adj}', a)
      .replace('{adjCap}', adjCap)
      .replace('{hook}', h)

    generated.add(composed)
    i++
  }

  return Array.from(generated).slice(0, desired)
}

// PRNG helper (mulberry32) seeded from a hash to get deterministic shuffles per device+date
function mulberry32(a: number) {
  return function() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministically shuffle categories per device+date
function getDailyCategoryOrder(categoryList: Array<{id: string; name: string}>) {
  const deviceSeed = getDeviceSeed()
  const today = new Date().toISOString().slice(0, 10)
  const seedStr = deviceSeed + '|' + today + '|category-order'
  const seedHash = simpleHash32(seedStr)
  const rnd = mulberry32(seedHash)

  // Copy and shuffle with Fisher-Yates using our PRNG
  const arr = categoryList.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export default function Home() {
  const [heroMediaList, setHeroMediaList] = useState<Array<{ url: string; type: 'image' | 'video' }>>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const slideInterval = useRef<NodeJS.Timeout | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState<boolean>(() => {
    try {
      if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
      const mobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      return !(mobileUA || coarsePointer || prefersReducedMotion)
    } catch (e) {
      return false
    }
  })
  const [categories, setCategories] = useState<Array<{id: string, name: string, icon?: React.ComponentType<any>}>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['all'])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  // When the user refreshes the page multiple times, we may swap the column order.
  // Track a simple refresh counter in localStorage; when it reaches 5 we set
  // swapColumnsOnRefresh=true for that load and reset the counter.
  const [swapColumnsOnRefresh, setSwapColumnsOnRefresh] = useState(false)

  const navigate = useNavigate()

  // Use the reactive useServices hook
  const { services: allServices, loading: servicesLoading } = useServices(undefined, { includeExpired: false })

  const { t } = usePreferences()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen && !(event.target as Element).closest('.category-dropdown')) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDropdownOpen])

  // Combined loading state
  const isLoading = servicesLoading

  // Local control for full-page skeleton timing: keep the full skeleton visible
  // for a maximum of 2 seconds so the page layout appears promptly.
  const [showFullSkeleton, setShowFullSkeleton] = useState(true)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (isLoading) {
      // Ensure we start by showing the full skeleton, but hide it after 2s
      setShowFullSkeleton(true)
      timer = setTimeout(() => setShowFullSkeleton(false), 2000)
    } else {
      // Data loaded — hide full skeleton immediately
      setShowFullSkeleton(false)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isLoading])


  const handleCategorySelect = (categoryId: string) => {
    if (categoryId === 'all') {
      setSelectedCategories(['all'])
    } else {
      setSelectedCategories(prev => {
        if (prev.includes('all')) {
          // If 'all' was selected, replace it with the specific category
          return [categoryId]
        } else if (prev.includes(categoryId)) {
          // Remove the category if it's already selected
          const newSelection = prev.filter(id => id !== categoryId)
          // If no categories selected, default to 'all'
          return newSelection.length === 0 ? ['all'] : newSelection
        } else {
          // Add the category
          return [...prev, categoryId]
        }
      })
    }
  }

  // Category counting helper removed — we no longer display numeric counts next to categories.


  useEffect(() => {
    fetchCategories()
    fetchHeroMediaList()
    
    // Try to enable autoplay on non-mobile devices and when user hasn't requested reduced motion
    const ensureAutoPlay = () => {
      try {
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
        if (prefersReducedMotion || isMobile) return
        setAutoPlayEnabled(true)
        // Try to play any current video after a short delay to ensure DOM is ready
        setTimeout(() => {
          if (videoRef.current) {
            const playPromise = videoRef.current.play()
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                // Autoplay failed, will retry on slide change or user interaction
              })
            }
          }
        }, 100)
      } catch (e) {
        // ignore
      }
    }
    
    // Try autoplay after a brief delay to ensure component is mounted
    setTimeout(ensureAutoPlay, 500)
    
    // Also listen for user interactions as fallback
    const handleUserInteraction = () => {
      ensureAutoPlay()
    }
    
    document.addEventListener('click', handleUserInteraction)
    document.addEventListener('touchstart', handleUserInteraction)
    document.addEventListener('keydown', handleUserInteraction)
    
    return () => {
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
    }
  }, [])

  // Increment a refresh counter stored in localStorage. When it hits 5, toggle
  // the swapColumnsOnRefresh flag for this session and reset the counter.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const key = 'dt_refresh_count'
      let count = Number(window.localStorage.getItem(key) || '0')
      count = count + 1
      // If the user has refreshed 5 times, enable the swap for this load and reset
      if (count >= 5) {
        setSwapColumnsOnRefresh(true)
        window.localStorage.setItem(key, '0')
      } else {
        setSwapColumnsOnRefresh(false)
        window.localStorage.setItem(key, String(count))
      }
    } catch (e) {
      // ignore storage errors and keep default behaviour
      setSwapColumnsOnRefresh(false)
    }
  }, [])

  // Fetch all active hero images/videos from DB
  const fetchHeroMediaList = async () => {
    const { data } = await supabase
      .from('hero_videos')
      .select('url, type')
      .eq('is_active', true)
      .order('order', { ascending: true })
    if (data) setHeroMediaList(data)
  }

  // Carousel effect for hero media
  useEffect(() => {
    if (heroMediaList.length < 2) return

    // Clear any existing interval
    if (slideInterval.current) {
      clearInterval(slideInterval.current)
      slideInterval.current = null
    }

    const currentMedia = heroMediaList[currentSlide]
    if (currentMedia?.type === 'video') {
      // For videos, don't set interval - wait for video to end
      // The video end handler will advance to next slide
      return
    } else {
      // For images, use timer that creates continuous video-like flow
      slideInterval.current = setInterval(() => {
        setCurrentSlide(prev => (prev + 1) % heroMediaList.length)
      }, 1500) // Faster transitions for more continuous feel
    }

    // Cleanup function
    return () => {
      if (slideInterval.current) {
        clearInterval(slideInterval.current)
        slideInterval.current = null
      }
    }
  }, [heroMediaList, currentSlide])

  // Handle video end to move to next slide
  useEffect(() => {
    const currentMedia = heroMediaList[currentSlide]
    if (currentMedia?.type === 'video' && videoRef.current) {
      const video = videoRef.current
      const onEnded = () => {
        setCurrentSlide(prev => (prev + 1) % heroMediaList.length)
      }
      video.addEventListener('ended', onEnded)
      return () => {
        video.removeEventListener('ended', onEnded)
      }
    }
  }, [currentSlide, heroMediaList])

  // Periodic retry for autoplay if it failed initially
  useEffect(() => {
    if (!autoPlayEnabled) return
    
    const retryInterval = setInterval(() => {
      const currentMedia = heroMediaList[currentSlide]
      if (currentMedia?.type === 'video' && videoRef.current && videoRef.current.paused) {
        const playPromise = videoRef.current.play()
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Still failing, will keep retrying
          })
        }
      }
    }, 2000) // Retry every 2 seconds
    
    return () => clearInterval(retryInterval)
  }, [currentSlide, heroMediaList, autoPlayEnabled])

  // Ensure video plays when slide changes to video
  useEffect(() => {
    const currentMedia = heroMediaList[currentSlide]
    if (currentMedia?.type === 'video' && videoRef.current) {
      const video = videoRef.current
      video.currentTime = 0
      
      // Try to play with a small delay to ensure video is ready
      setTimeout(() => {
        const playPromise = video.play()
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Video autoplay failed on slide change, will retry on user interaction:', error)
            // Will be retried when user interacts with page
          })
        }
      }, 100)
    }
  }, [currentSlide, heroMediaList])

  const fetchCategories = async () => {
    try {
      const dbCategories = await getServiceCategories()
      // Filter out flights category
      const filteredCategories = dbCategories.filter(cat => cat.id !== 'cat_flights')
      // Sort categories in custom order: Accommodation, Transport, Events, Tours, Restaurants, Shops
      const sortedCategories = filteredCategories.sort((a, b) => {
        const order: { [key: string]: number } = {
          'cat_hotels': 0,        // Accommodation
          'cat_transport': 1,     // Transport
          'cat_activities': 2,    // Events
          'cat_tour_packages': 3, // Tours
          'cat_restaurants': 4,   // Restaurants
          'cat_shops': 5          // Shops
        }
        const aPriority = order[a.id] ?? 6
        const bPriority = order[b.id] ?? 6
        return aPriority - bPriority
      })
      
      // Force Lucide icons for all main categories, ignore DB icon if string/emoji
      const iconMap: Record<string, any> = {
        cat_hotels: Hotel,
        cat_transport: Car,
        cat_activities: Target,
        cat_tour_packages: Map,
        cat_restaurants: Utensils,
        cat_shops: ShoppingBag
      }
      const allCategories = [
        { id: 'all', name: t('all_listings'), icon: Map },
        ...sortedCategories.map(cat => {
          return {
            id: cat.id,
            name: cat.id === 'cat_activities' ? 'Events' : cat.id === 'cat_hotels' ? 'Homes & Stays' : cat.name,
            icon: iconMap[cat.id] || MapPinIcon
          }
        })
      ]
      setCategories(allCategories)
    } catch (error) {
      console.error('Error fetching categories:', error)
      // Fallback to basic categories if database fetch fails (also filter out flights)
      setCategories([
        { id: 'all', name: t('all_listings'), icon: Map },
        { id: 'cat_hotels', name: 'Homes & Stays', icon: Hotel },
        { id: 'cat_transport', name: 'Transport', icon: Car },
        { id: 'cat_activities', name: 'Events', icon: Target },
        { id: 'cat_tour_packages', name: 'Tours', icon: Map },
        { id: 'cat_restaurants', name: 'Restaurants', icon: Utensils },
        { id: 'cat_shops', name: 'Shops', icon: ShoppingBag }
      ])
    }
  }

  // Currency formatting and conversion is handled centrally by formatCurrencyWithConversion

  const filteredServices = allServices.filter((service: Service) => {
    // First check if service is approved and vendor is not suspended
    const isApproved = service.status === 'approved' && 
                      (!service.vendors || service.vendors.status !== 'suspended')

    const matchesSearch = !searchQuery || (() => {
      const query = searchQuery.toLowerCase();

      // Helper function to safely check if a string contains the query
      const containsQuery = (text: string | undefined | null): boolean => {
        return text ? text.toLowerCase().includes(query) : false;
      };

      // Helper function to safely check if an array contains items that include the query
      const arrayContainsQuery = (arr: string[] | undefined | null): boolean => {
        return arr ? arr.some(item => item.toLowerCase().includes(query)) : false;
      };

      // Search through all relevant fields - prioritize basic fields
      let result = containsQuery(service.title) ||
             containsQuery(service.description) ||
             containsQuery(service.location) ||
             containsQuery(service.vendors?.business_name) ||
             containsQuery(service.service_categories?.name);

      // If no match in basic fields, check additional fields and category synonyms
      if (!result) {
        result = arrayContainsQuery(service.amenities) ||
                 arrayContainsQuery(service.facilities) ||
                 arrayContainsQuery(service.room_amenities) ||
                 arrayContainsQuery(service.nearby_attractions) ||
                 arrayContainsQuery(service.itinerary) ||
                 arrayContainsQuery(service.included_items) ||
                 arrayContainsQuery(service.tour_highlights) ||
                 arrayContainsQuery(service.room_types) ||
                 arrayContainsQuery(service.languages_offered) ||
                 containsQuery(service.property_type) ||
                 containsQuery(service.cuisine_type) ||
                 containsQuery(service.difficulty_level) ||
                 containsQuery(service.vehicle_type) ||
                 containsQuery(service.best_time_to_visit) ||
                 arrayContainsQuery(service.what_to_bring) ||
                 arrayContainsQuery(service.accessibility_features) ||
                 // Category synonyms and common search terms
                 (query.includes('accommodation') && service.category_id === 'cat_hotels') ||
                 (query.includes('hotel') && service.category_id === 'cat_hotels') ||
                 (query.includes('stay') && service.category_id === 'cat_hotels') ||
                 (query.includes('lodging') && service.category_id === 'cat_hotels') ||
                 (query.includes('transport') && service.category_id === 'cat_transport') ||
                 (query.includes('travel') && service.category_id === 'cat_transport') ||
                 (query.includes('ride') && service.category_id === 'cat_transport') ||
                 (query.includes('car') && service.category_id === 'cat_transport') ||
                 (query.includes('shop') && service.category_id === 'cat_shops') ||
                 (query.includes('shopping') && service.category_id === 'cat_shops') ||
                 (query.includes('store') && service.category_id === 'cat_shops') ||
                 (query.includes('restaurant') && service.category_id === 'cat_restaurants') ||
                 (query.includes('food') && service.category_id === 'cat_restaurants') ||
                 (query.includes('eat') && service.category_id === 'cat_restaurants') ||
                 (query.includes('dining') && service.category_id === 'cat_restaurants') ||
                 (query.includes('flight') && service.category_id === 'cat_flights') ||
                 (query.includes('plane') && service.category_id === 'cat_flights') ||
                 (query.includes('air') && service.category_id === 'cat_flights') ||
                 (query.includes('tour') && service.category_id === 'cat_tour_packages') ||
                 (query.includes('safari') && service.category_id === 'cat_tour_packages') ||
                 (query.includes('activity') && service.category_id === 'cat_activities') ||
                 (query.includes('event') && service.category_id === 'cat_activities') ||
                 (query.includes('experience') && service.category_id === 'cat_activities');
      }

      return result;
    })()

    const matchesCategory = selectedCategories.includes('all') ||
                           selectedCategories.includes(service.category_id || '')

    // If there's a search query, ignore category filter; otherwise apply category filter
    const shouldInclude = isApproved && (searchQuery ? matchesSearch : (matchesSearch && matchesCategory))

    return shouldInclude;
  })

  const currentItems = filteredServices
  const currentItemCount = currentItems.length

  // If services are still loading, show the full-page home skeleton, but only
  // while `showFullSkeleton` is true (max ~2s). After that we'll render the
  // page layout and let list-level placeholders handle the remaining loading.
  if (isLoading && showFullSkeleton) {
    return <PageSkeleton type="home" />
  }

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
      {/* Hero Section */}
      <div className="relative min-h-[60vh] md:min-h-[72vh] bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900 overflow-hidden">
        {/* Background media carousel */}
        {heroMediaList.length > 0 && (
          heroMediaList.map((media, idx) => (
            <div
              key={media.url}
              className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${currentSlide === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            >
              {media.type === 'video' ? (
                <video
                  ref={currentSlide === idx ? videoRef : undefined}
                  src={media.url}
                  autoPlay={autoPlayEnabled}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  key={currentSlide === idx ? media.url : undefined}
                />
              ) : (
                <div
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${media.url})` }}
                />
              )}
            </div>
          ))
        )}

        {/* Gradient overlay — strong at bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10 z-20" />

        {/* Hero content + embedded search */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 md:pb-14 px-4 z-30">
          <div className="text-center mb-6 md:mb-8">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-tight mb-3">
              {t('hero_title')}
            </h1>
            <p className="text-base md:text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
              {t('hero_subtitle')}
            </p>
          </div>

          {/* Search bar embedded in hero */}
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl p-2 flex items-center gap-1">
              <div className="flex-1 flex items-center px-3">
                <Search className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
                  className="w-full py-2 text-gray-900 placeholder-gray-400 focus:outline-none text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                    aria-label="Clear search"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Filter Dropdown Trigger */}
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="category-dropdown flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white px-3 md:px-5 py-2.5 rounded-xl font-medium transition-colors text-sm"
                  title="Filter services by category"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {selectedCategories.includes('all')
                      ? 'All'
                      : selectedCategories.length === 1
                        ? categories.find(cat => cat.id === selectedCategories[0])?.name || 'Filter'
                        : `${selectedCategories.length} Selected`}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="category-dropdown absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="font-semibold text-gray-900 text-sm">{t('choose_travel_needs')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('select_one_or_more')}</p>
                    </div>

                    {/* Categories List */}
                    <div className="max-h-60 overflow-y-auto">
                      {/* All Categories Option */}
                      <button
                        onClick={() => {
                          setSelectedCategories(['all'])
                          setIsDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                          selectedCategories.includes('all') ? 'bg-emerald-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            selectedCategories.includes('all')
                              ? 'bg-emerald-600 border-emerald-600'
                              : 'border-gray-300'
                          }`}>
                            {selectedCategories.includes('all') && (
                              <Check className="w-2.5 h-2.5 text-white" />
                            )}
                          </div>
                          <span className={`text-sm ${selectedCategories.includes('all') ? 'text-emerald-700 font-medium' : 'text-gray-700'}`}>
                            {t('show_all_travel_needs')}
                          </span>
                        </div>
                      </button>

                      {/* Individual Categories */}
                      {categories.slice(1).map((category) => (
                        <button
                          key={category.id}
                          onClick={() => handleCategorySelect(category.id)}
                          className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                            selectedCategories.includes(category.id) ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              selectedCategories.includes(category.id)
                                ? 'bg-emerald-600 border-emerald-600'
                                : 'border-gray-300'
                            }`}>
                              {selectedCategories.includes(category.id) && (
                                <Check className="w-2.5 h-2.5 text-white" />
                              )}
                            </div>
                            <span className={`text-sm ${selectedCategories.includes(category.id) ? 'text-emerald-700 font-medium' : 'text-gray-700'}`}>
                              {category.name}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {selectedCategories.includes('all') ? t('all_listings') : `${selectedCategories.length} selected`}
                        </span>
                        <button
                          onClick={() => setIsDropdownOpen(false)}
                          className="text-xs text-emerald-700 font-semibold hover:text-emerald-900"
                        >
                          {t('done')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      {!searchQuery && (
        <div className="border-b border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-4">
              {categories.map((category) => {
                const isActive = category.id === 'all'
                  ? selectedCategories.includes('all')
                  : selectedCategories.includes(category.id) && !selectedCategories.includes('all')
                const Icon = category.icon
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {category.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}


      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 md:pb-20">

        {/* Results Header */}
        <div className="mb-4">
          <div className="mb-3">
              {(searchQuery || !selectedCategories.includes('all')) && (
                <h2 className="text-2xl font-bold text-black">
                  {searchQuery
                    ? `Search results for "${searchQuery}"`
                    : selectedCategories.length === 1
                      ? categories.find(cat => cat.id === selectedCategories[0])?.name || selectedCategories[0]
                      : `${selectedCategories.length} categories selected`}
                </h2>
              )}
            </div>

        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-emerald-600"></div>
          </div>
        ) : (
          // If searching or filtering by categories, show the standard grid of results.
          (searchQuery || !selectedCategories.includes('all')) ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 sm:gap-x-4 gap-y-4 sm:gap-y-6 mb-12">
              {(
                swapColumnsOnRefresh ? [...currentItems].reverse() : currentItems
              ).map((service: Service) => (
                <ServiceCard 
                  key={service.id} 
                  service={service}
                  onClick={() => navigate(`/service/${service.slug || service.id}`)}
                />
              ))}
            </div>
          ) : (
            // Otherwise, show 6 category rows (one row per category). Each row scrolls horizontally if it has more items than fit.
            <div className="space-y-12">
              {getDailyCategoryOrder(categories.slice(1, 7)).map((category) => {
                const servicesForCat = allServices.filter((s: Service) => 
                  s.category_id === category.id && 
                  s.status === 'approved' && 
                  (!s.vendors || s.vendors.status !== 'suspended')
                )
                if (!servicesForCat || servicesForCat.length === 0) return null
                const servicesForCatToRender = swapColumnsOnRefresh ? servicesForCat.slice().reverse() : servicesForCat
                return (
                  <div key={category.id}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                        {getDailyTitleForCategory(category.id, category.name)}
                      </h3>
                      <Link
                        to={`/category/${category.id}`}
                        className="flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors whitespace-nowrap"
                      >
                        View all <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>

                    <div className="relative">
                      <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
                        {servicesForCatToRender.map((service: Service) => (
                          <div key={service.id} className="snap-start flex-shrink-0 w-[68%] sm:w-[46%] md:w-[32%] lg:w-[23%] xl:w-[19%]">
                            <ServiceCard
                              service={service}
                              onClick={() => navigate(`/service/${service.slug || service.id}`)}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Scroll hint arrow (non-interactive) */}
                      <div className="absolute top-1/2 -translate-y-1/2 right-2 pointer-events-none hidden md:block">
                        <div className="bg-white/90 dark:bg-black/60 rounded-full p-1 shadow-sm">
                          <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-200" />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {!isLoading && currentItemCount === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Search className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('no_results')}</h3>
            <p className="text-gray-500 text-base max-w-sm">{t('adjust_search')}</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-6 px-6 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}
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
  const [localTicketTypes, setLocalTicketTypes] = useState<any[]>(service.ticket_types || [])

  // Preferences for currency/language (used for displaying prices on cards)
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

  const imageUrl = service.images?.[0] || 'https://images.pexels.com/photos/1320684/pexels-photo-1320684.jpeg'

  

  // Category-specific helper removed — card now uses a simple, image-first layout.

  // categoryInfo removed from here as the card now shows a standalone image tile with compact info below

  useEffect(() => {
    let mounted = true
    // If the service doesn't include ticket_types but might have ticket types in the DB,
    // fetch them so the card can show the same price as ServiceDetail.
    if ((!service.ticket_types || service.ticket_types.length === 0) && service.id) {
      void (async () => {
        try {
          const types = await getTicketTypes(service.id)
          if (mounted && Array.isArray(types) && types.length > 0) setLocalTicketTypes(types)
        } catch (err) {
          // ignore; leave localTicketTypes as-is (empty)
        }
      })()
    }
    return () => { mounted = false }
  }, [service.id, service.ticket_types])
  // Map category names to friendly badge labels
  const getCategoryBadge = (categoryName?: string) => {
    const name = (categoryName || '').toLowerCase()
    if (['hotels', 'hotel', 'accommodation'].includes(name)) return 'Homes & Stays'
    if (name === 'activities') return 'Events'
    if (name === 'events') return 'Events'
    if (name === 'restaurants') return 'Restaurants'
    if (name === 'shops') return 'Shops'
    if (name === 'transport') return 'Transport'
    return categoryName ? categoryName : 'Service'
  }

  // Get location preposition based on category
  const getLocationPreposition = (categoryName?: string) => {
    const name = (categoryName || '').toLowerCase()
    if (name === 'activities' || name === 'events') return 'At'
    return 'In'
  }

  // Get unit label for price display
  const getUnitLabel = (categoryName?: string) => {
    const name = (categoryName || '').toLowerCase()
    if (name === 'transport') return 'per day'
    if (['hotels', 'hotel', 'accommodation'].includes(name)) return 'per night'
    if (name === 'shops') return 'per item'
    if (name === 'restaurants') return 'per meal'
    if (name === 'events' || name === 'activities') return 'per ticket'
    if (name === 'tour_packages' || name === 'tours') return 'per guest'
    return 'per person'
  }

  // Get location text based on service type
  const getLocationText = (service: Service) => {
    const categoryName = service.service_categories?.name?.toLowerCase()
    const isEventOrActivity = categoryName === 'activities' || categoryName === 'events'
    const isTour = categoryName === 'tour_packages'
    
    let location: string | undefined
    
    if (isEventOrActivity) {
      // For events and activities, check event_location first, then fall back to location
      location = service.event_location || service.location
    } else if (isTour) {
      // For tours, check meeting_point first, then fall back to location
      location = service.meeting_point || service.location
    } else {
      // For other services, use the general location field
      location = service.location
    }
    
    if (!location) return <span className="text-sm">Location TBA</span>
    
    const preposition = getLocationPreposition(service.service_categories?.name)
    
    return (
      <span className="truncate block">
        {preposition} {location}
      </span>
    )
  }

  return (
    <div onClick={onClick} className="group block cursor-pointer">
      <div className="w-full">
        {/* Image tile */}
        <div className="aspect-[4/3] rounded-xl overflow-hidden shadow-sm bg-gray-100 relative group-hover:shadow-md transition-shadow duration-300">
          {/* Category badge */}
          {service.service_categories?.name && (
            <div className="absolute top-3 left-3 px-2 py-1 bg-white/95 rounded-full shadow-sm text-[11px] font-semibold text-gray-800 max-w-[72%] truncate">
              {getCategoryBadge(service.service_categories?.name)}
            </div>
          )}
          <img
            loading="lazy"
            decoding="async"
            src={imageUrl}
            alt={service.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />

          {/* Save Button (kept) */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsSaved(!isSaved) }}
            className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
            aria-label={isSaved ? 'Unsave' : 'Save'}
          >
            <Heart className={`h-4 w-4 transition-colors ${isSaved ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} />
          </button>
        </div>

        {/* Compact info block below the image (Airbnb-like) */}
        <div className="mt-2 px-0">
          <h3 className={`font-semibold text-gray-900 leading-tight mb-0 ${
            service.service_categories?.name?.toLowerCase() === 'tour_packages' || service.service_categories?.name?.toLowerCase() === 'tours'
              ? 'text-[11px] md:text-xs line-clamp-2'
              : 'text-xs md:text-sm line-clamp-1 truncate'
          }`}>
            {service.title}
          </h3>
          <div className="flex items-center justify-between mt-1 mb-1.5">
            <div className="text-gray-500 text-sm truncate pr-2">
              {getLocationText(service)}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-700 flex-shrink-0 ml-2">
              <Star className="h-3 w-3 text-gray-900 fill-current" />
              <span className="leading-none">{rating > 0 ? rating.toFixed(1) : '0'}</span>
              {reviewCount > 0 && <span className="text-xs text-gray-500">({reviewCount})</span>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2 whitespace-nowrap flex-shrink-0">
              <div className="text-sm md:text-base font-normal text-gray-800 leading-none">
                <span className="text-[9px] md:text-[10px] text-gray-500 mr-1">From</span>
                {
                  <Money
                    amount={getDisplayPrice(service, localTicketTypes && localTicketTypes.length > 0 ? localTicketTypes : undefined)}
                    serviceCurrency={service.currency}
                    targetCurrency={selectedCurrency || 'UGX'}
                    locale={selectedLanguage || 'en-US'}
                    className="text-sm md:text-base font-normal text-gray-800 leading-none"
                    currencyClassName="text-[10px] text-gray-600 mr-1"
                    amountClassName="text-[12px] sm:text-[13px] font-semibold text-black"
                  />
                }
                <span className="text-[9px] md:text-[10px] text-gray-500 ml-1 whitespace-nowrap">
                  {getUnitLabel(service.service_categories?.name)}
                </span>
              </div>
            </div>
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
  // Preferences for currency/language
  const { selectedCurrency, selectedLanguage, t } = usePreferences()

  const imageUrl = service.images?.[0] || 'https://images.pexels.com/photos/1320684/pexels-photo-1320684.jpeg'

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
            {t('back_to_search')}
          </button>
        </div>
      </div>

      {/* Hero Image */}
      <div className="relative h-96 bg-gray-900">
        <img
          loading="lazy"
          decoding="async"
          src={imageUrl}
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

              {/* Flight Details */}
              {service.category_id === 'cat_flights' && (
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Flight Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Departure</h3>
                      <div className="space-y-1">
                        <p className="text-gray-700">{service.departure_city} {service.departure_airport ? `(${service.departure_airport})` : ''}</p>
                        <p className="text-gray-600">{service.departure_time ? new Date(service.departure_time).toLocaleString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'TBD'}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Arrival</h3>
                      <div className="space-y-1">
                        <p className="text-gray-700">{service.arrival_city} {service.arrival_airport ? `(${service.arrival_airport})` : ''}</p>
                        <p className="text-gray-600">{service.arrival_time ? new Date(service.arrival_time).toLocaleString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'TBD'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {service.flight_number && (
                      <div>
                        <span className="text-sm text-gray-500">Flight Number</span>
                        <p className="font-semibold">{service.flight_number}</p>
                      </div>
                    )}
                    {service.airline && (
                      <div>
                        <span className="text-sm text-gray-500">Airline</span>
                        <p className="font-semibold">{service.airline}</p>
                      </div>
                    )}
                    {service.aircraft_type && (
                      <div>
                        <span className="text-sm text-gray-500">Aircraft</span>
                        <p className="font-semibold">{service.aircraft_type}</p>
                      </div>
                    )}
                    {service.duration_minutes && (
                      <div>
                        <span className="text-sm text-gray-500">Duration</span>
                        <p className="font-semibold">{Math.floor(service.duration_minutes / 60)}h {service.duration_minutes % 60}m</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                  <span className="text-sm text-gray-600">{t('from')}</span>
                  <span className="text-3xl font-bold text-gray-900">
                    {formatCurrencyWithConversion(service.price, service.currency, selectedCurrency, selectedLanguage)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{t('per_person')}</p>
              </div>

              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-semibold text-lg transition-colors mb-4">
                {t('check_availability')}
              </button>

              <button className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-3 rounded-xl font-semibold transition-colors mb-6">
                {t('contact_vendor')}
              </button>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-bold text-gray-900 mb-4">{t('whats_included')}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-emerald-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('professional_guide')}
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




import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { User, Heart, ShoppingBag, Globe, ChevronDown, Settings, LogOut, Home, HelpCircle, Search, Wallet } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import PreferencesModal from './PreferencesModal'
import MobileBottomNav from './MobileBottomNav'
import GlobalSearchModal from './GlobalSearchModal'
import SupportModal from './SupportModal'
import LoginModal from './LoginModal'
import { usePreferences } from '../contexts/PreferencesContext'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'

const getRegionName = (code: string) => {
  const regionMap: { [key: string]: string } = {
    'UG': 'UGA',
    'US': 'USA',
    'GB': 'GBR',
    'KE': 'KEN',
    'TZ': 'TZA',
    'RW': 'RWA',
    'ZA': 'ZAF',
    'NG': 'NGA',
    'GH': 'GHA',
    'CA-EN': 'CAN',
    'CA-FR': 'CAN',
    'AU': 'AUS',
    'FR': 'FRA',
    'DE': 'DEU',
    'ES': 'ESP',
    'IT': 'ITA',
    'IN': 'IND',
    'SG': 'SGP',
    'MY': 'MYS',
    'ID': 'IDN'
  }
  return regionMap[code] || code
}

export default function PublicLayout() {
  const [showPreferences, setShowPreferences] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
  const navigate = useNavigate()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const userDropdownRef = useRef<HTMLDivElement>(null)
  const guestDropdownRef = useRef<HTMLDivElement>(null)
  // const { categories } = useServiceCategories() // Temporarily commented out
  const { getCartCount } = useCart()
  const { user, profile, signOut } = useAuth()
  const { selectedRegion, selectedCurrency, t } = usePreferences()

  // Map category IDs to navigation items
  const getNavigationItems = (): Array<{name: string, href: string}> => {
    // Return home navigation
    return [
      { name: 'home', href: '/' }
    ]
  }

  const navigation = getNavigationItems()

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        // No dropdown to close anymore
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false)
      }
      if (guestDropdownRef.current && !guestDropdownRef.current.contains(event.target as Node)) {
        setShowGuestDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSignOut = async () => {
    setShowLogoutConfirm(true)
  }

  const confirmSignOut = async () => {
    setShowLogoutConfirm(false)
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const cancelSignOut = () => {
    setShowLogoutConfirm(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {/* Use fixed header so it remains visible even if some ancestor creates a scrolling context */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        location.pathname.includes('/scan/')
          ? 'bg-transparent shadow-none'
          : scrolled
            ? 'bg-white/95 backdrop-blur-md shadow-sm'
            : 'bg-white shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 md:h-[72px]">
            {/* Logo */}
            <Link to="/" className={`flex items-center transition-colors duration-300 ${
              location.pathname.includes('/scan/')
                ? 'text-white drop-shadow-lg'
                : 'text-gray-900'
            }`}>
              <span className="text-2xl font-bold tracking-tight">DirtTrails<span className="text-emerald-500 ml-0.5">.</span></span>
              {location.pathname.includes('/scan/') && (
                <span className="ml-2 text-base font-semibold text-white/90 drop-shadow-lg">
                  Event Verification
                </span>
              )}
            </Link>

            {/* Desktop Navigation */}
            {!location.pathname.includes('/scan/') && (
              <nav className="hidden md:flex items-center space-x-7">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`text-sm font-medium transition-colors ${
                      location.pathname === item.href
                        ? 'text-emerald-600 border-b-2 border-emerald-600'
                        : 'text-gray-700 hover:text-emerald-600'
                    }`}
                  >
                    {t(item.name)}
                  </Link>
                ))}
              </nav>
            )}

            {/* Right side actions */}
            {!location.pathname.includes('/scan/') && (
              <div className="flex items-center space-x-2 md:space-x-4">
                {/* Search Button - Hidden on mobile, only in bottom nav */}
                <button
                  onClick={() => setShowGlobalSearch(true)}
                  className="hidden md:flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  title={t('search')}
                >
                  <Search className="h-5 w-5 text-gray-600" />
                </button>

                <button
                  onClick={() => setShowPreferences(true)}
                  className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                  title={t('preferences')}
                >
                  <Globe className="h-3 w-3 md:h-4 md:w-4 text-gray-600" />
                  {/* Show only the icon in the navbar; keep an sr-only label for accessibility */}
                  <span className="sr-only">{getRegionName(selectedRegion)} • {selectedCurrency}</span>
                </button>

                {/* Cart / Saved icon - visible to all users so guests can save items in-session */}
                <Link to="/saved" className="flex items-center text-gray-700 hover:text-emerald-600 relative p-1.5 rounded-full hover:bg-gray-100 transition-colors">
                  <ShoppingBag className="h-4 w-4 md:h-5 md:w-5" />
                  {getCartCount() > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {getCartCount()}
                    </span>
                  )}
                </Link>

                {/* Sign In Button or User Account Dropdown */}
                {user && profile?.role === 'tourist' ? (
                  <div className="relative" ref={userDropdownRef}>
                    <button
                      onClick={() => setShowUserDropdown(!showUserDropdown)}
                      className="flex items-center p-1.5 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
                        <span className="text-sm font-bold text-white">
                          {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <ChevronDown className={`h-3 w-3 md:h-4 md:w-4 text-gray-500 transition-transform ml-1 ${showUserDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* User Dropdown Menu */}
                    {showUserDropdown && (
                      <div className="fixed right-4 top-20 min-w-48 max-w-64 bg-white rounded-md shadow-lg border border-gray-200 z-[200]">
                        <div className="py-1">
                          <div className="px-4 py-2 border-b border-gray-200">
                            <p className="text-sm font-medium text-gray-900">{t('my_account')}</p>
                            <p className="text-xs text-gray-500 truncate" title={profile?.email}>{profile?.email}</p>
                          </div>
                          <Link
                            to="/"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Home className="h-3.5 w-3.5 mr-2" />
                            {t('home')}
                          </Link>
                          <Link
                            to="/profile"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <User className="h-3.5 w-3.5 mr-2" />
                            {t('profile')}
                          </Link>
                          <Link
                            to="/bookings"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                            {t('bookings')}
                          </Link>
                          <Link
                            to="/saved"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Heart className="h-3.5 w-3.5 mr-2" />
                            {t('saved_items') || 'Saved Items'}
                          </Link>
                          <Link
                            to="/wallet"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Wallet className="h-3.5 w-3.5 mr-2" />
                            My Wallet
                          </Link>
                          <Link
                            to="/settings"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5 mr-2" />
                            {t('settings')}
                          </Link>
                          <Link
                            to="/help"
                            onClick={() => setShowUserDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <HelpCircle className="h-3.5 w-3.5 mr-2" />
                            {t('help_center')}
                          </Link>

                          {/* Divider */}
                          <div className="border-t border-gray-100 my-1"></div>

                          <button
                            onClick={() => {
                              setShowUserDropdown(false)
                              handleSignOut()
                            }}
                            className="flex items-center w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <LogOut className="h-3.5 w-3.5 mr-2" />
                            {t('sign_out')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative" ref={guestDropdownRef}>
                    <button
                      onClick={() => setShowGuestDropdown(!showGuestDropdown)}
                      className="flex items-center p-1.5 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <User className="h-4 w-4 md:h-5 md:w-5 text-gray-700" />
                      <ChevronDown className={`h-3 w-3 md:h-4 md:w-4 text-gray-500 transition-transform ml-1 ${showGuestDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Guest Dropdown Menu */}
                    {showGuestDropdown && (
                      <div className="fixed right-4 top-20 min-w-56 max-w-64 bg-white rounded-md shadow-lg border border-gray-200 z-[200] max-h-96 overflow-y-auto">
                        <div className="py-2">
                          {/* Account Section */}
                          <div className="px-3 py-1.5">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('my_account')}</h4>
                          </div>
                          <Link
                            to="/"
                            onClick={() => setShowGuestDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <Home className="h-3.5 w-3.5 mr-2" />
                            {t('home')}
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setShowGuestDropdown(false)
                              setShowLoginModal(true)
                            }}
                            className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <User className="h-3.5 w-3.5 mr-2" />
                            {t('log_in')}
                          </button>
                          <button
                            onClick={() => {
                              setShowGuestDropdown(false)
                              setShowPreferences(true)
                            }}
                            className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <Globe className="h-3.5 w-3.5 mr-2" />
                            {t('currency_region')}
                          </button>
                          <Link
                            to="/help"
                            onClick={() => setShowGuestDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <HelpCircle className="h-3.5 w-3.5 mr-2" />
                            {t('help_center')}
                          </Link>

                          {/* Divider */}
                          <div className="border-t border-gray-100 my-2"></div>

                          {/* Business Section */}
                          <div className="px-3 py-1.5">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('for_businesses')}</h4>
                          </div>
                          <Link
                            to="/vendor-login"
                            onClick={() => setShowGuestDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                            {t('list_my_business')}
                          </Link>
                          <Link
                            to="/partner"
                            onClick={() => setShowGuestDropdown(false)}
                            className="flex items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer rounded"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                            {t('partner_with')}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </header>

      {/* Preferences Modal */}
      <PreferencesModal
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
      />

      {/* Support Modal */}
      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
      />

      {/* Main Content */}
      {/* Add top padding equal to header height so fixed header doesn't overlap content */}
      <main className={`${location.pathname.includes('/scan/') ? 'pt-0 pb-0' : 'pt-16 pb-16'}`}>
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation - Hidden on scan pages and service detail pages (we render a Book button in the service page) */}
      {!location.pathname.includes('/scan/') && !location.pathname.startsWith('/service/') && (
        <MobileBottomNav
          onSupportClick={() => setShowSupportModal(true)}
          onSearchClick={() => setShowGlobalSearch(true)}
        />
      )}

      {/* Footer */}
      <footer className="hidden md:block bg-gray-950 text-white">
        {/* Top CTA strip */}
        <div className="border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-1">For Businesses</p>
              <p className="text-lg font-bold text-white">Reach thousands of travellers around the world.</p>
            </div>
            <Link
              to="/vendor-login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              List your business
            </Link>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            {/* Brand column */}
            <div className="md:col-span-4">
              <p className="text-2xl font-bold tracking-tight mb-1">DirtTrails<span className="text-emerald-500">.</span></p>
              <p className="text-gray-400 text-sm leading-relaxed mt-3 max-w-xs">
                Discover hidden gems worldwide and create unforgettable experiences with trusted local hosts.
              </p>
              
            </div>

            {/* Links */}
            <div className="md:col-span-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">Explore</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/" className="text-gray-400 hover:text-white transition-colors">Home</Link></li>
                <li><Link to="/category/hotels" className="text-gray-400 hover:text-white transition-colors">Stays</Link></li>
                <li><Link to="/category/tours" className="text-gray-400 hover:text-white transition-colors">Tours</Link></li>
                <li><Link to="/category/events" className="text-gray-400 hover:text-white transition-colors">Events</Link></li>
                <li><Link to="/category/restaurants" className="text-gray-400 hover:text-white transition-colors">Restaurants</Link></li>
                <li><Link to="/category/transport" className="text-gray-400 hover:text-white transition-colors">Transport</Link></li>
                <li><Link to="/category/shops" className="text-gray-400 hover:text-white transition-colors">Shops</Link></li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">Support</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/help" className="text-gray-400 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Contact Us</Link></li>
                <li><Link to="/safety" className="text-gray-400 hover:text-white transition-colors">Safety</Link></li>
                <li><Link to="/terms" className="text-gray-400 hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/travel-insurance" className="text-gray-400 hover:text-white transition-colors">Travel Insurance</Link></li>
                <li><Link to="/visa-processing" className="text-gray-400 hover:text-white transition-colors">Visa Processing</Link></li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">Business</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/vendor-login" className="text-gray-400 hover:text-white transition-colors">List My Business</Link></li>
                <li><Link to="/refer-business" className="text-gray-400 hover:text-white transition-colors">Refer a Business</Link></li>
                <li><Link to="/hospitality-class" className="text-gray-400 hover:text-white transition-colors">Hospitality Class</Link></li>
                <li><Link to="/partner" className="text-gray-400 hover:text-white transition-colors">Partner with Us</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 mt-14 pt-8 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-sm text-gray-600">&copy; {new Date().getFullYear()} DirtTrails. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <Link to="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
              <Link to="/cookies" className="hover:text-gray-400 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Log out?</h3>
            <p className="text-sm text-gray-500 mb-5">Are you sure you want to log out of your account?</p>
            <div className="flex space-x-3">
              <button
                onClick={cancelSignOut}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="flex-1 px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

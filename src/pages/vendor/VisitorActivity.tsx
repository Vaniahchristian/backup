import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useState } from 'react'
import { getVendorActivityStats } from '../../lib/database'

interface ReviewData {
  id: string
  serviceName: string
  rating: number
  comment: string
  visitorName: string
  date: string
  helpful: number
}

interface CountryData {
  country: string
  count: number
  percentage: string
}

interface DemographicData {
  ageGroup: string
  count: number
  percentage: string
}

interface LikeData {
  id: string
  serviceName: string
  category: string
  totalLikes: number
  avgRating: number
  timesChecked?: number
}

interface VendorStats {
  totalVisitors: number
  uniqueVisitors: number
  totalServices: number
  totalBookings: number
  conversionRate: number
  topCountries: CountryData[]
  ageGroups: DemographicData[]
  genderDistribution: { male: number; female: number; other: number }
  topServices: LikeData[]
  servicesChecked: LikeData[]
  visitorSessions: any[]
  recentReviews: ReviewData[]
  reviewsThisMonth: number
  avgRating: number
}

export default function VendorVisitorActivity() {
  const { profile, vendor } = useAuth()
  const vendorId = vendor?.id || profile?.id
  
  const [stats, setStats] = useState<VendorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedService, setExpandedService] = useState<string | null>(null)

  useEffect(() => {
    if (!vendorId) return
    
    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getVendorActivityStats(vendorId)
        setStats(data)
      } catch (err) {
        console.error('Error fetching vendor activity:', err)
        setError('Failed to load activity data')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [vendorId])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-7 w-48 bg-gray-200 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 p-5">
                <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
                <div className="h-7 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 bg-white rounded-xl border border-gray-200" />
            <div className="h-64 bg-white rounded-xl border border-gray-200" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-900">Activity Data Loading</p>
          <p className="text-sm text-gray-500 mt-1">
            {error || 'Loading your visitor activity data. Some data may be unavailable at this time.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Visitor Activity</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor your business performance and visitor engagement
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-blue-500 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Visitors</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.totalVisitors}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.uniqueVisitors} unique</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-emerald-500 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bookings</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.totalBookings}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.conversionRate.toFixed(1)}% conversion</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-violet-500 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Services</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.totalServices}</p>
          <p className="mt-1 text-xs text-gray-500">Active listings</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-amber-500 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Rating</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.avgRating.toFixed(1)}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.reviewsThisMonth} reviews this month</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance Insights */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-5">Performance Insights</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs font-medium text-gray-500">Booking Rate</p>
                <p className="text-xl font-semibold text-gray-900 mt-1">
                  {stats.conversionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.totalBookings} of {stats.totalVisitors} visitors
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs font-medium text-gray-500">Unique Visitors</p>
                <p className="text-xl font-semibold text-gray-900 mt-1">
                  {stats.uniqueVisitors}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {((stats.uniqueVisitors / Math.max(stats.totalVisitors, 1)) * 100).toFixed(0)}% of total
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs font-medium text-gray-500">Avg Rating</p>
                <p className="text-xl font-semibold text-gray-900 mt-1">
                  {stats.avgRating.toFixed(1)} / 5
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.reviewsThisMonth} reviews this month
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs font-medium text-gray-500">Active Services</p>
                <p className="text-xl font-semibold text-gray-900 mt-1">
                  {stats.totalServices}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  All services published
                </p>
              </div>
            </div>
          </div>

          {/* Top Services */}
          {stats.topServices.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Your Services</h2>
              <div className="space-y-2">
                {stats.topServices.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => setExpandedService(expandedService === service.id ? null : service.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{service.serviceName}</p>
                      <p className="text-xs text-gray-500">
                        {service.avgRating > 0 ? `${service.avgRating.toFixed(1)} / 5` : 'No ratings yet'}
                      </p>
                    </div>
                    {expandedService === service.id && (
                      <span className="text-xs text-gray-400">Expanded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most Viewed Services */}
          {stats.servicesChecked && stats.servicesChecked.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Most Viewed Services</h2>
              <div className="space-y-2">
                {stats.servicesChecked.map((service, idx) => (
                  <div key={service.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{service.serviceName}</p>
                      <p className="text-xs text-gray-500">Service views & interactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">{service.timesChecked || 0}</p>
                      <p className="text-xs text-gray-500">views</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visitor Demographics */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-5">Visitor Demographics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Age Groups */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Age Distribution</h3>
                {stats.ageGroups.length > 0 ? (
                  <div className="space-y-3">
                    {stats.ageGroups.map((age, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-gray-600">{age.ageGroup}</p>
                          <p className="text-xs font-medium text-gray-900">{age.count}</p>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${parseFloat(age.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Age data not available</p>
                )}
              </div>

              {/* Gender Distribution */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Gender Distribution</h3>
                <div className="space-y-3">
                  {Object.entries(stats.genderDistribution).map(([gender, count]) => {
                    const total = Object.values(stats.genderDistribution).reduce((a: number, b: number) => a + b, 0);
                    const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
                    const colors: Record<string, string> = {
                      male: 'bg-blue-500',
                      female: 'bg-emerald-500',
                      other: 'bg-amber-400'
                    };
                    const labels: Record<string, string> = {
                      male: 'Male',
                      female: 'Female',
                      other: 'Other'
                    };

                    return (
                      <div key={gender}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-gray-600">{labels[gender]}</p>
                          <p className="text-xs font-medium text-gray-900">{count}</p>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`${colors[gender]} h-1.5 rounded-full`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Reviews */}
          {stats.recentReviews.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Reviews</h2>
              <div className="divide-y divide-gray-100">
                {stats.recentReviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{review.visitorName}</p>
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">
                            {review.rating}/5
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{review.serviceName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(review.date).toLocaleDateString()}
                        </p>
                      </div>
                      {review.helpful > 0 && (
                        <span className="text-xs text-gray-500">{review.helpful} helpful</span>
                      )}
                    </div>
                    {review.comment && (
                      <p className="text-sm text-gray-600 mt-2 pl-0 italic">
                        "{review.comment}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty Reviews */}
          {stats.recentReviews.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Reviews</h2>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-500">No reviews yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Reviews will appear here as visitors rate your services
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Demographics Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Demographics</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Gender</p>
                <div className="flex gap-2">
                  {Object.entries(stats.genderDistribution).map(([gender, count]) => {
                    const total = Object.values(stats.genderDistribution).reduce((a: number, b: number) => a + b, 0);
                    const percentage = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                    const labels: Record<string, string> = {
                      male: 'Male',
                      female: 'Female',
                      other: 'Other'
                    };

                    return (
                      <div key={gender} className="flex-1 bg-gray-50 p-3 rounded-lg text-center">
                        <p className="text-sm font-semibold text-gray-900">{percentage}%</p>
                        <p className="text-xs text-gray-500">{labels[gender]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {stats.ageGroups.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top Age Groups</p>
                  <div className="space-y-2">
                    {stats.ageGroups.slice(0, 3).map((age, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{age.ageGroup}</span>
                        <span className="font-medium text-gray-900">{age.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Visitor Countries */}
          {stats.topCountries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Visitor Countries</h2>
              <div className="space-y-3">
                {stats.topCountries.map((country, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">{country.country}</p>
                      <p className="text-xs font-semibold text-gray-900">{country.count}</p>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full"
                        style={{ width: `${parseFloat(country.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Visitors */}
          {stats.visitorSessions && stats.visitorSessions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Visitors</h2>
                  <div className="space-y-2">
                    {stats.visitorSessions.slice(0, 8).map((session: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-lg bg-gray-50">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {session.location || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {session.visitedAt ? new Date(session.visitedAt).toLocaleString() : (session.last_visit_at ? new Date(session.last_visit_at).toLocaleString() : '')}
                        </p>
                      </div>
                    ))}
                  </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Visitors</span>
                <span className="font-medium text-gray-900">{stats.totalVisitors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Unique Visitors</span>
                <span className="font-medium text-gray-900">{stats.uniqueVisitors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Completed Bookings</span>
                <span className="font-medium text-gray-900">{stats.totalBookings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Active Services</span>
                <span className="font-medium text-gray-900">{stats.totalServices}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2.5 mt-2.5">
                <span className="text-gray-700 font-medium">Conversion Rate</span>
                <span className="font-semibold text-gray-900">{stats.conversionRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

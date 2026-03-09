import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, PlusCircle, TrendingDown, PiggyBank, Wallet as WalletIcon, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePreferences } from '../contexts/PreferencesContext'
import { supabase } from '../lib/supabaseClient'
import { Booking } from '../lib/database'
import { convertCurrency, formatCurrencyWithConversion } from '../lib/utils'

type WalletTopUp = {
  id: string
  amount: number
  currency: string
  note?: string
  payment_method: 'card' | 'mobile_money' | 'bank_transfer'
  reference?: string
  created_at: string
}

type WalletActivity = {
  id: string
  type: 'topup' | 'spend'
  amount: number
  currency: string
  title: string
  created_at: string
}

export default function Wallet() {
  const { user } = useAuth()
  const { selectedCurrency, selectedLanguage } = usePreferences()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [topUps, setTopUps] = useState<WalletTopUp[]>([])
  const [amountInput, setAmountInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'mobile_money' | 'bank_transfer'>('mobile_money')
  const [mobileNumber, setMobileNumber] = useState('')
  const [cardHolderName, setCardHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const displayCurrency = selectedCurrency || 'UGX'
  const storageKey = user ? `dt_wallet_topups_${user.id}` : ''

  useEffect(() => {
    if (user) {
      fetchBookings()
      loadTopUps()
      fetchTopUpsFromDatabase()
    }
  }, [user])

  const loadTopUps = () => {
    if (!storageKey) return

    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        setTopUps([])
        return
      }

      const parsed = JSON.parse(raw) as WalletTopUp[]
      if (Array.isArray(parsed)) {
        setTopUps(parsed)
      }
    } catch {
      setTopUps([])
    }
  }

  const persistTopUps = (nextTopUps: WalletTopUp[]) => {
    if (!storageKey) return
    localStorage.setItem(storageKey, JSON.stringify(nextTopUps))
  }

  const fetchBookings = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          total_amount,
          currency,
          status,
          created_at,
          services (
            title
          )
        `)
        .eq('tourist_id', user?.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBookings((data as unknown as Booking[]) || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load wallet activity')
    } finally {
      setLoading(false)
    }
  }

  const fetchTopUpsFromDatabase = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, currency, payment_method, reference, created_at')
        .eq('tourist_id', user.id)
        .eq('transaction_type', 'payment')
        .ilike('reference', 'WALLET_TOPUP_%')
        .order('created_at', { ascending: false })

      if (error) return

      const normalizedTopUps: WalletTopUp[] = (data || []).map((transaction: any) => ({
        id: transaction.id,
        amount: Number(transaction.amount) || 0,
        currency: transaction.currency || 'UGX',
        payment_method: (transaction.payment_method || 'mobile_money') as 'card' | 'mobile_money' | 'bank_transfer',
        reference: transaction.reference || undefined,
        created_at: transaction.created_at
      }))

      if (normalizedTopUps.length > 0) {
        setTopUps(normalizedTopUps)
        persistTopUps(normalizedTopUps)
      }
    } catch {
      // Keep local data as fallback if DB read fails
    }
  }

  const confirmedSpendBookings = useMemo(
    () => bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed'),
    [bookings]
  )

  const totalSaved = useMemo(
    () => topUps.reduce((sum, topUp) => sum + convertCurrency(topUp.amount, topUp.currency, displayCurrency), 0),
    [topUps, displayCurrency]
  )

  const totalSpent = useMemo(
    () => confirmedSpendBookings.reduce((sum, booking) => sum + convertCurrency(booking.total_amount, booking.currency, displayCurrency), 0),
    [confirmedSpendBookings, displayCurrency]
  )

  const balance = totalSaved - totalSpent

  const activities = useMemo<WalletActivity[]>(() => {
    const topUpActivities = topUps.map((topUp) => ({
      id: `topup-${topUp.id}`,
      type: 'topup' as const,
      amount: topUp.amount,
      currency: topUp.currency,
      title: topUp.note?.trim() ? topUp.note : 'Wallet top up',
      created_at: topUp.created_at
    }))

    const spendActivities = confirmedSpendBookings.map((booking) => {
      const svc = booking.services as any
      const title = Array.isArray(svc) ? svc[0]?.title : svc?.title

      return {
        id: `spend-${booking.id}`,
        type: 'spend' as const,
        amount: booking.total_amount,
        currency: booking.currency,
        title: title || 'Service booking',
        created_at: booking.created_at
      }
    })

    return [...topUpActivities, ...spendActivities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
  }, [topUps, confirmedSpendBookings])

  const handleAddFunds = async () => {
    const amount = Number(amountInput)
    if (!amount || amount <= 0) {
      setError('Enter a valid amount to save')
      return
    }

    if (paymentMethod === 'mobile_money' && !mobileNumber.trim()) {
      setError('Enter your mobile money number to continue')
      return
    }

    if (paymentMethod === 'card') {
      const cleanCardNumber = cardNumber.replace(/\s+/g, '')
      const validCardNumber = /^\d{12,19}$/.test(cleanCardNumber)
      const validExpiry = /^(0[1-9]|1[0-2])\/(\d{2})$/.test(cardExpiry)
      const validCvc = /^\d{3,4}$/.test(cardCvc)

      if (!cardHolderName.trim() || !validCardNumber || !validExpiry || !validCvc) {
        setError('Enter valid card details (card name, number, expiry and CVC) to continue')
        return
      }
    }

    if (paymentMethod === 'bank_transfer' && !bankReference.trim()) {
      setError('Enter your bank transfer reference to continue')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const reference = `WALLET_TOPUP_${Date.now()}_${Math.floor(Math.random() * 1000)}`

      const paymentNote =
        paymentMethod === 'mobile_money'
          ? `Mobile Money (${mobileNumber.trim()})`
          : paymentMethod === 'card'
            ? `Card ending ${cardNumber.replace(/\s+/g, '').slice(-4)}`
            : `Bank transfer (${bankReference.trim()})`

      const nextTopUp: WalletTopUp = {
        id: crypto.randomUUID(),
        amount,
        currency: displayCurrency,
        note: noteInput.trim() ? `${noteInput.trim()} • ${paymentNote}` : paymentNote,
        payment_method: paymentMethod,
        reference,
        created_at: new Date().toISOString()
      }

      const nextTopUps = [nextTopUp, ...topUps]
      setTopUps(nextTopUps)
      persistTopUps(nextTopUps)

      if (user) {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert({
            booking_id: null,
            vendor_id: null,
            tourist_id: user.id,
            amount,
            currency: displayCurrency,
            transaction_type: 'payment',
            status: 'completed',
            payment_method: paymentMethod,
            reference
          })

        if (!insertError) {
          await fetchTopUpsFromDatabase()
        }
      }

      setAmountInput('')
      setNoteInput('')
      setMobileNumber('')
      setCardHolderName('')
      setCardNumber('')
      setCardExpiry('')
      setCardCvc('')
      setBankReference('')
      setSuccess('Funds added to your wallet successfully.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            to="/profile"
            className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 mb-4 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">My Wallet</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">Save money and monitor your service spending in one place.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">Saved</p>
              <PiggyBank className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-semibold text-gray-900">
              {formatCurrencyWithConversion(totalSaved, displayCurrency, displayCurrency, selectedLanguage || 'en-US')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">Spent on services</p>
              <TrendingDown className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-semibold text-gray-900">
              {formatCurrencyWithConversion(totalSpent, displayCurrency, displayCurrency, selectedLanguage || 'en-US')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">Available balance</p>
              <WalletIcon className="h-5 w-5 text-gray-500" />
            </div>
            <p className={`text-2xl sm:text-3xl font-semibold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatCurrencyWithConversion(balance, displayCurrency, displayCurrency, selectedLanguage || 'en-US')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 h-fit">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add funds</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({displayCurrency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(event) => setNoteInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                  placeholder="e.g. Weekend travel budget"
                />
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Payment option</p>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as 'card' | 'mobile_money' | 'bank_transfer')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                >
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              {paymentMethod === 'mobile_money' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(event) => setMobileNumber(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                    placeholder="e.g. +256700000000"
                  />
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Card Name</label>
                    <input
                      type="text"
                      value={cardHolderName}
                      onChange={(event) => setCardHolderName(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                      placeholder="e.g. Visa"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 19)
                        const grouped = digits.replace(/(.{4})/g, '$1 ').trim()
                        setCardNumber(grouped)
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                      placeholder="1234 5678 9012 3456"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                          const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
                          setCardExpiry(formatted)
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                        placeholder="MM/YY"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CVC</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(event) => setCardCvc(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                        placeholder="123"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'bank_transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Reference</label>
                  <input
                    type="text"
                    value={bankReference}
                    onChange={(event) => setBankReference(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
                    placeholder="e.g. TRX-458920"
                  />
                </div>
              )}

              <button
                onClick={handleAddFunds}
                disabled={saving}
                className="w-full min-h-[48px] inline-flex items-center justify-center bg-gray-900 text-white font-medium px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-all duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save to Wallet'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent wallet activity</h2>

            {activities.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                <WalletIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No activity yet. Add funds or make a booking to start tracking.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-gray-200 bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(activity.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className={`text-sm sm:text-base font-semibold ${activity.type === 'topup' ? 'text-green-700' : 'text-gray-900'}`}>
                        {activity.type === 'topup' ? '+' : '-'}
                        {formatCurrencyWithConversion(activity.amount, activity.currency, displayCurrency, selectedLanguage || 'en-US')}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{activity.type === 'topup' ? 'Saved' : 'Spent'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
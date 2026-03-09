import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../lib/utils'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useOrderQuery, useOrderQueryClient, orderQueryKey } from '../hooks/useOrderQuery'
import { PageSkeleton } from '../components/SkeletonLoader'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useOrderQuery(orderId)
  const order = data?.order ?? null
  const items = data?.items ?? []
  const [processing, setProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('mobile_money')
  const [mobileProvider, setMobileProvider] = useState('')
  const [cardNoticeVisible, setCardNoticeVisible] = useState(false)
  const [ticketEmail, setTicketEmail] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const queryClient = useOrderQueryClient()

  const updateTicketQuantity = async (ticketTypeId: string, newQuantity: number) => {
    if (newQuantity < 0 || !orderId) return

    try {
      const existingItem = items.find((it: any) => it.ticket_type_id === ticketTypeId)

      if (existingItem) {
        if (newQuantity === 0) {
          const { error } = await supabase
            .from('order_items')
            .delete()
            .eq('id', existingItem.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('order_items')
            .update({ quantity: newQuantity })
            .eq('id', existingItem.id)
          if (error) throw error
        }
      } else if (newQuantity > 0) {
        // fallback unit_price to existing item price if available
        const fallbackPrice = items.find((it: any) => it.ticket_type_id === ticketTypeId)?.unit_price || 0
        const { error } = await supabase
          .from('order_items')
          .insert({
            order_id: orderId,
            ticket_type_id: ticketTypeId,
            quantity: newQuantity,
            unit_price: fallbackPrice
          })
          .select()
          .single()
        if (error) throw error
      }

      await queryClient.invalidateQueries({ queryKey: orderQueryKey(orderId) })
    } catch (err) {
      console.error('Failed to update ticket quantity (payment page):', err)
      alert('Failed to update ticket quantity. Please try again.')
    }
  }
  
  // Derived totals from current items so UI updates when quantities change
  const subtotalAmount = items.reduce((s: number, it: any) => {
    const unit = Number(it.unit_price ?? it.price ?? 0)
    const qty = Number(it.quantity ?? 0)
    return s + unit * qty
  }, 0)

  const serviceFeesAmount = Math.max(100, Math.round(subtotalAmount * 0.01))
  const totalAmount = subtotalAmount + serviceFeesAmount
  // summary toggle removed — details always visible
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentReference, setPaymentReference] = useState<string | null>(null)
  const [pollingMessage, setPollingMessage] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const paymentChannelRef = useRef<RealtimeChannel | null>(null)
  const backupPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ensure the paymentReference is observed so linters/TS don't flag it as unused.
  useEffect(() => {
    if (paymentReference) console.debug('[Payment] internal reference set', paymentReference)
  }, [paymentReference])

  useEffect(() => {
    return () => {
      console.log('[Payment] unmount cleanup')
      if (paymentChannelRef.current) {
        paymentChannelRef.current.unsubscribe()
        paymentChannelRef.current = null
      }
      if (backupPollRef.current) {
        clearInterval(backupPollRef.current)
        backupPollRef.current = null
      }
    }
  }, [])

  // Prefill phone from order when order data is ready
  useEffect(() => {
    if (!order?.guest_phone) return
    const p = String(order.guest_phone).replace(/^\+256/, '')
    setPhoneNumber(p.startsWith('+') ? p : p)
  }, [order?.guest_phone])

  // Prefill ticket email from order (if available) but keep it editable
  useEffect(() => {
    if (!order?.guest_email) return
    // only autofill when the input is still empty to avoid stomping user edits
    if (!ticketEmail) setTicketEmail(order.guest_email)
  }, [order?.guest_email, ticketEmail])

  const handlePayment = useCallback(async () => {
  if (!orderId || !order) return
  // Use derived totals from items (keeps payment amount in sync with edits)
  const totalWithFee = Math.round(totalAmount)
    const rawPhone = (phoneNumber || order?.guest_phone || '').trim().replace(/^\+256/, '')
    const phone = rawPhone.startsWith('+') ? rawPhone : `+256${rawPhone.replace(/^0/, '')}`

    if (!phone || phone.length < 10) {
      alert('Please enter a valid mobile money phone number (e.g. 0712345678 or +256712345678).')
      return
    }

    setProcessing(true)
    setPollingMessage('')
    setPaymentReference(null)
    try {
      const { data: session } = await supabase.auth.getSession()
                const collectRes = await fetch(`${supabaseUrl}/functions/v1/marzpay-collect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
                  amount: Math.round(totalWithFee),
          phone_number: phone,
          order_id: orderId,
          description: `Order #${order.reference || orderId.slice(0, 8)} payment`,
          user_id: session?.session?.user?.id || undefined,
        }),
      })

      const result = (await collectRes.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        details?: unknown
        data?: { reference: string; status: string }
      }

      if (!collectRes.ok) {
        const msg = result?.error || `Payment initiation failed (${collectRes.status})`
        if (result?.details) console.warn('Payment error details:', result.details)
        throw new Error(msg)
      }
      if (!result?.success || !result?.data?.reference) {
        throw new Error(result?.error || 'Payment initiation failed')
      }

      const ref = result.data.reference
  setPaymentReference(ref)
  // Show the phone confirmation message inside the Pay button while processing
  setPollingMessage('Confirm the payment on your phone. Waiting for confirmation…')

      const cleanup = () => {
        console.log('[Payment] cleanup', { ref })
        if (paymentChannelRef.current) {
          paymentChannelRef.current.unsubscribe()
          paymentChannelRef.current = null
        }
        if (backupPollRef.current) {
          clearInterval(backupPollRef.current)
          backupPollRef.current = null
        }
      }

      const handleCompleted = () => {
        console.log('[Payment] handleCompleted called', { orderId, ref })
        cleanup()
        setPollingMessage('Payment confirmed!')
        // show success dialog — user will be able to go to receipt when they click OK
        setProcessing(false)
        setPaymentSuccess(true)

        // Trigger server-side function to send tickets to the provided email (do not block UX)
        ;(async () => {
          try {
            const recipient = ticketEmail || order?.guest_email
            if (!recipient) {
              console.warn('[Payment] No recipient email available to send tickets')
              return
            }

            console.log('[Payment] Calling send-order-emails edge function', { orderId, recipient })
            const resp = await fetch(`${supabaseUrl}/functions/v1/send-order-emails`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'apikey': supabaseAnonKey,
              },
              body: JSON.stringify({ order_id: orderId, recipient_email: recipient }),
            })

            if (!resp.ok) {
              const text = await resp.text()
              console.error('[Payment] send-order-emails failed:', resp.status, text)
            } else {
              console.log('[Payment] send-order-emails succeeded')
            }
          } catch (e) {
            console.error('[Payment] Error calling send-order-emails:', e)
          }
        })()
      }

      const handleFailed = () => {
        console.log('[Payment] handleFailed called', { ref })
        cleanup()
        setPollingMessage('')
        setPaymentReference(null)
        setProcessing(false)
        alert('Payment was not completed or was declined. Please try again.')
      }

      const checkStatus = async (): Promise<'completed' | 'failed' | null> => {
        try {
          const url = `${supabaseUrl}/functions/v1/marzpay-payment-status?reference=${encodeURIComponent(ref)}`
          console.log('[Payment] checkStatus: fetching', { ref, url: url.replace(supabaseUrl, '...') })
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${supabaseAnonKey}` },
          })
          const raw = await res.text()
          console.log('[Payment] checkStatus: response', {
            ok: res.ok,
            status: res.status,
            body: raw?.slice(0, 300),
          })
          const data = (JSON.parse(raw || '{}') as { status?: string; error?: string })
          const result = data?.status === 'completed' ? 'completed' : data?.status === 'failed' ? 'failed' : null
          console.log('[Payment] checkStatus: parsed', { 'data.status': data?.status, result })
          if (data?.status === 'completed') return 'completed'
          if (data?.status === 'failed') return 'failed'
          return null
        } catch (e) {
          console.error('[Payment] checkStatus: error', e)
          return null
        }
      }

      const channel = supabase
        .channel(`payment_${ref}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'payments',
            filter: `reference=eq.${ref}`,
          },
          (payload) => {
            const row = payload.new as { status: string }
            console.log('[Payment] Realtime UPDATE received', { ref, status: row?.status, payload: payload.new })
            if (row.status === 'completed') handleCompleted()
            else if (row.status === 'failed') handleFailed()
          }
        )
        .subscribe()
      paymentChannelRef.current = channel
      console.log('[Payment] Realtime channel subscribed', { ref })

  const statusOnce = await checkStatus()
      console.log('[Payment] statusOnce (immediate)', { statusOnce, ref })
        if (statusOnce === 'completed') {
          console.log('[Payment] handleCompleted from immediate check')
          handleCompleted()
          return
        }
      if (statusOnce === 'failed') {
        handleFailed()
        return
      }

      backupPollRef.current = setInterval(async () => {
        const status = await checkStatus()
        console.log('[Payment] poll tick', { status, ref, now: new Date().toISOString() })
        if (status === 'completed') {
          console.log('[Payment] handleCompleted from poll')
          handleCompleted()
        } else if (status === 'failed') handleFailed()
      }, 4000)
      console.log('[Payment] backup poll started every 4s, will stop after 120s')
      setTimeout(() => {
        if (backupPollRef.current) {
          clearInterval(backupPollRef.current)
          backupPollRef.current = null
        }
      }, 120000)
    } catch (err) {
      console.error('Payment error:', err)
      setPollingMessage('')
      setPaymentReference(null)
      setProcessing(false)
      alert((err as Error).message || 'Payment failed. Please try again.')
    }
  }, [orderId, order, phoneNumber, navigate])

  if (isLoading) return <PageSkeleton type="payment" />
  if (error || !order) return <div className="p-6">Order not found</div>

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Complete Payment</h1>
          <p className="text-gray-600 font-light text-sm">Choose a payment method and finish your order</p>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6">
          {/* Compact Progress Steps (minimal on mobile) */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center justify-center gap-4 text-sm text-gray-700">
              <div className="flex items-center gap-2 text-xs md:text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">✓</div>
                <div className="hidden md:block font-light">Tickets</div>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">✓</div>
                <div className="hidden md:block font-light text-blue-600">Details</div>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm">
                <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center font-semibold">3</div>
                <div className="hidden md:block font-light">Payment</div>
              </div>
            </div>
          </div>
          <div className="px-4 py-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-700">Order ID <span className="font-mono text-xs text-gray-900 ml-2">{order.reference || `#${order.id.slice(0,8)}`}</span></div>
              </div>
            </div>

            <div className="mt-3"> 
              <div className="bg-white rounded-lg p-3 space-y-2 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Tickets</div>
                  <div>
                    <button type="button" onClick={() => setShowEdit(s => !s)} className="text-sm text-blue-600">{showEdit ? 'Done' : 'Edit'}</button>
                  </div>
                </div>

                <div className="space-y-2 mb-1">
                  {items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-3">
                        <div className="text-gray-700">{item.ticket_type?.title || 'Ticket'}</div>
                        <div className="text-xs text-gray-500">× {item.quantity}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {showEdit ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => updateTicketQuantity(item.ticket_type_id, (item.quantity || 0) - 1)}
                              className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium"
                              disabled={(item.quantity || 0) <= 0}
                            >
                              -
                            </button>
                            <div className="text-sm font-medium min-w-[24px] text-center">{item.quantity}</div>
                            <button
                              onClick={async () => updateTicketQuantity(item.ticket_type_id, (item.quantity || 0) + 1)}
                              className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm font-medium">{formatCurrency(item.unit_price * item.quantity, order.currency)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Service Fee</span>
            <span className="text-sm font-medium text-gray-900">{formatCurrency(serviceFeesAmount, order.currency)}</span>
                {/* Success Dialog */}
                {paymentSuccess && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black opacity-40"></div>
                    <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full p-6 z-10">
                      <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment successful</h2>
                      <p className="text-sm text-gray-700 mb-4">Your receipt is ready. Click OK to view your receipt.</p>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentSuccess(false)
                            navigate(`/tickets/${orderId}`)
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                  </div>

                  {/* Total shown below service fee for clarity */}
                  <div className="mt-3 flex justify-between items-center border-t pt-3">
                    <span className="text-gray-700 text-sm font-medium">Total</span>
                    <span className="text-lg font-semibold text-gray-900">{formatCurrency(totalAmount, order.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="px-6 py-6">
            <h3 className="text-lg font-light text-gray-900 mb-4">Select Payment Method</h3>
            
            <div className="space-y-3">
              {/* Mobile Money Option (compact) */}
              <div className={`flex items-center justify-between p-2 rounded border ${paymentMethod === 'mobile_money' ? 'border-blue-500' : 'border-gray-200'}`}>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="mobile_money"
                    checked={paymentMethod === 'mobile_money'}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value)
                      setCardNoticeVisible(false)
                    }}
                    className="w-4 h-4"
                  />
                  <div className="text-sm font-medium">Mobile Money</div>
                </label>
                <div className="text-sm text-gray-400">→</div>
              </div>

              {/* Mobile Money inputs (compact) */}
              {paymentMethod === 'mobile_money' && (
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Select provider to continue</div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMobileProvider('MTN')} className={`flex-1 py-2 rounded border flex items-center justify-center gap-2 ${mobileProvider === 'MTN' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <rect width="18" height="14" rx="2" fill="#FFD200" />
                          <text x="9" y="10" fill="#000" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">MTN</text>
                        </svg>
                        <span className="text-sm font-medium">MTN</span>
                      </button>
                      <button type="button" onClick={() => setMobileProvider('Airtel')} className={`flex-1 py-2 rounded border flex items-center justify-center gap-2 ${mobileProvider === 'Airtel' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <rect width="18" height="14" rx="2" fill="#E60000" />
                          <text x="9" y="10" fill="#fff" fontSize="6" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">A</text>
                        </svg>
                        <span className="text-sm font-medium">Airtel</span>
                      </button>
                    </div>
                  </div>

                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0712345678 or +256712345678"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none text-sm"
                  />
                </div>
              )}

              {/* Credit/Debit Card - now visible on mobile as requested */}
              <div className="opacity-90">
                <div className="p-2 border border-gray-200 rounded text-sm text-gray-700">Credit/Debit Card (coming soon)</div>

                <div className="mt-3 flex items-center gap-1">
                  {/* Visa (stylized) */}
                  <div className="flex items-center gap-1 px-1 py-0.5 border rounded bg-white">
                    <svg width="20" height="12" viewBox="0 0 28 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect width="28" height="18" rx="3" fill="#1A66FF" />
                      <text x="14" y="12" fill="#fff" fontSize="6" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">VISA</text>
                    </svg>
                  </div>

                  <div className="flex items-center gap-1 px-1 py-0.5 border rounded bg-white">
                    <svg width="20" height="12" viewBox="0 0 28 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect width="28" height="18" rx="3" fill="#fff" />
                      <circle cx="11" cy="9" r="4" fill="#FF5F00" />
                      <circle cx="17" cy="9" r="4" fill="#EB001B" />
                    </svg>
                  </div>

                  <div className="flex items-center gap-1 px-1 py-0.5 border rounded bg-white">
                    <svg width="20" height="12" viewBox="0 0 28 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect width="28" height="18" rx="3" fill="#2E77BC" />
                      <text x="14" y="12" fill="#fff" fontSize="5" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">AMEX</text>
                    </svg>
                  </div>

                  <div className="flex items-center gap-1 px-1 py-0.5 border rounded bg-white">
                    <svg width="20" height="12" viewBox="0 0 28 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect width="28" height="18" rx="3" fill="#F76C1B" />
                      <text x="14" y="12" fill="#fff" fontSize="5" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">DISC</text>
                    </svg>
                  </div>

                  {/* MTN and Airtel icons intentionally removed from card icons row; they remain on the mobile provider buttons above */}
                </div>
              </div>
            </div>

            {cardNoticeVisible && paymentMethod === 'card' && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-light">
                  Card payments are not available yet. Please select Mobile Money to proceed.
                </p>
              </div>
            )}
            {/* Removed the explicit phone confirmation notification and reference from the UI.
                The internal payment reference is still recorded for debugging, but it's not
                displayed to the user during processing to avoid cluttering the payment UI. */}
          </div>

          {/* Email for Tickets */}
          <div className="px-6 py-6 border-b">
            <label className="block text-sm font-light text-gray-900 mb-2">Email to receive tickets</label>
            <input
              type="email"
              value={ticketEmail}
              onChange={(e) => setTicketEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400 font-light text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="px-6 py-4 border-t bg-gray-50 flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/checkout/${orderId}`)}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 font-light text-sm rounded-lg transition-colors border border-gray-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handlePayment}
              disabled={
                processing ||
                paymentMethod === 'card' ||
                (paymentMethod === 'mobile_money' && (!mobileProvider || !phoneNumber.trim()))
              }
              style={{
                backgroundColor:
                  processing ||
                  paymentMethod === 'card' ||
                  !mobileProvider ||
                  !phoneNumber.trim()
                    ? '#d1d5db'
                    : '#3B82F6',
              }}
              className="flex-1 text-white font-light text-sm py-2 px-4 rounded-lg transition-all hover:shadow-lg disabled:cursor-not-allowed"
            >
              {processing ? (
                <span className="flex items-center justify-center gap-2">
                  {/* Larger spinner on mobile, slightly smaller on md+ screens */}
                  <svg className="animate-spin h-10 w-10 md:h-4 md:w-4 text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span className="text-white text-sm">{pollingMessage || 'Processing...'}</span>
                </span>
              ) : (
                'Pay with Mobile Money'
              )}
            </button>
          </div>
        </div>

        {/* Security Info */}
        <div className="text-center text-sm text-gray-600">
          <p className="font-light">Your payment information is secure and encrypted</p>
        </div>
      </div>
    </div>
  )
}
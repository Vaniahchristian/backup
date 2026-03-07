import { useState } from 'react'
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Building } from 'lucide-react'

export default function ContactUs() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    category: 'general'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000))

    setIsSubmitting(false)
    setSubmitted(true)

    // Reset form after 3 seconds
    setTimeout(() => {
      setSubmitted(false)
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: '',
        category: 'general'
      })
    }, 3000)
  }

  const contactMethods = [
    {
      icon: MessageSquare,
      title: 'Live Chat',
      description: 'Chat with our support team',
      details: ['Available 24/7', 'Instant responses', 'Real-time assistance'],
      action: 'Start Chat',
      primary: true
    },
    {
      icon: Mail,
      title: 'Email Support',
      description: 'Send us a detailed message',
      details: ['support@dirtrails.ug', '12-24 hour response', 'Detailed inquiries'],
      action: 'Send Email',
      primary: false
    },
    {
      icon: Phone,
      title: 'Phone Support',
      description: 'Speak directly with our team',
      details: ['+256 759 918649', 'Mon-Fri 8AM-6PM EAT', 'Priority support'],
      action: 'Call Now',
      primary: false
    }
  ]

  const officeInfo = [
    {
      icon: Building,
      title: 'Head Office',
      details: ['Plot Pool Road', 'Makerere MIICHub, Kampala, Uganda', 'P.O. Box ']
    },
    {
      icon: Clock,
      title: 'Business Hours',
      details: ['Monday - Friday: 8:00 AM - 6:00 PM', 'Saturday: 9:00 AM - 4:00 PM', 'Sunday: Closed']
    }
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-black text-white mb-4 tracking-tight antialiased">Contact Us</h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-snug antialiased text-elegant">
              Get in touch with our team. We're here to help you plan your perfect adventure.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Contact Methods */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-black mb-4 tracking-tight antialiased">How can we help you?</h2>
            <p className="text-lg text-gray-600 leading-snug antialiased">Choose the best way to reach our support team</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {contactMethods.map((method, index) => (
              <div key={index} className={`bg-white shadow-sm border p-8 text-center transition-all duration-200 hover:shadow-md ${
                method.primary ? 'border-black bg-gray-50' : 'border-gray-200'
              }`}>
                <div className={`w-16 h-16 flex items-center justify-center mx-auto mb-6 ${
                  method.primary ? 'bg-gray-900' : 'bg-gray-900'
                }`}>
                  <method.icon className={`h-8 w-8 ${
                    method.primary ? 'text-white' : 'text-white'
                  }`} />
                </div>
                <h3 className="text-xl font-bold text-black mb-2 tracking-tight antialiased">{method.title}</h3>
                <p className="text-gray-700 mb-6 leading-snug antialiased">{method.description}</p>
                <ul className="text-sm text-gray-700 space-y-1 mb-6">
                  {method.details.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
                <button className={`w-full py-3 px-6 font-semibold transition-colors ${
                  method.primary
                    ? 'bg-gray-900 text-white hover:bg-gray-800 border border-gray-300'
                    : 'bg-white text-black hover:bg-gray-50 border border-gray-300'
                }`}>
                  {method.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Contact Form */}
          <div className="bg-white shadow-sm border border-gray-200 p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-black text-black mb-2 tracking-tight antialiased">Send us a Message</h2>
              <p className="text-gray-700 leading-snug antialiased">Fill out the form below and we'll get back to you within 24 hours.</p>
            </div>

            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Send className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-black mb-2 tracking-tight antialiased">Message Sent!</h3>
                <p className="text-gray-700 leading-snug antialiased">
                  Thank you for contacting us. We'll get back to you within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2 tracking-tight antialiased">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-black focus:border-black transition-colors"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2 tracking-tight antialiased">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-black focus:border-black transition-colors"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-2 tracking-tight antialiased">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 bg-white text-black focus:ring-2 focus:ring-black focus:border-black transition-colors"
                  >
                    <option value="general">General Inquiry</option>
                    <option value="booking">Booking Support</option>
                    <option value="technical">Technical Support</option>
                    <option value="partnership">Partnership</option>
                    <option value="complaint">Complaint</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-semibold text-gray-700 mb-2 tracking-tight antialiased">
                    Subject *
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    required
                    value={formData.subject}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-black focus:border-black transition-colors"
                    placeholder="Brief description of your inquiry"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2 tracking-tight antialiased">
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-black focus:border-black transition-colors resize-none"
                    placeholder="Please provide details about your inquiry..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gray-900 text-white py-4 px-6 hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold transition-colors border border-gray-300"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Office Information */}
          <div className="space-y-8">
            {officeInfo.map((info, index) => (
              <div key={index} className="bg-white shadow-sm border border-gray-200 p-8">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gray-900 flex items-center justify-center">
                      <info.icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-black mb-3 tracking-tight antialiased">{info.title}</h3>
                    <div className="space-y-1">
                      {info.details.map((detail, idx) => (
                        <p key={idx} className="text-gray-700 leading-snug antialiased">{detail}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Map Placeholder */}
            <div className="bg-white shadow-sm border border-gray-200 p-8">
              <div className="flex items-center justify-center h-64 bg-gray-50">
                <div className="text-center">
                  <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-bold text-black mb-2 tracking-tight antialiased">Find Us</h4>
                  <p className="text-gray-600 leading-snug antialiased">Interactive map coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'https://crypto-casino-production.up.railway.app',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Access token stored in memory via auth store
    // Import lazily to avoid circular deps
    try {
      const raw = sessionStorage.getItem('zw-access-token')
      if (raw) config.headers.Authorization = `Bearer ${raw}`
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const r = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'https://crypto-casino-production.up.railway.app'}/api/auth/refresh`,
          {},
          { withCredentials: true },
        )
        const token = r.data.accessToken as string
        sessionStorage.setItem('zw-access-token', token)
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        sessionStorage.removeItem('zw-access-token')
      }
    }
    return Promise.reject(error)
  },
)

export default api

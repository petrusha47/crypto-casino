/** @type {import('next').NextConfig} */
const BACKEND_URL = 'https://crypto-casino-production.up.railway.app'

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? BACKEND_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? BACKEND_URL,
  },
}

export default nextConfig

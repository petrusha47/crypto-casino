import axios from 'axios'
import { parseStringPromise } from 'xml2js'
import { redis } from '../config/redis'

const CBR_URL = 'https://www.cbr.ru/scripts/XML_daily.asp'
const CACHE_KEY = 'cbr:usd_rate'
const FALLBACK_KEY = 'cbr:usd_rate:last_known'
const CACHE_TTL = 86400

export async function clearCbrCache(): Promise<void> {
  await redis.del(CACHE_KEY)
  await redis.del(FALLBACK_KEY)
}

export async function getUsdToRubRate(): Promise<{ rate: number; fallback: boolean }> {
  const cached = await redis.get(CACHE_KEY)
  if (cached) return { rate: parseFloat(cached), fallback: false }

  try {
    const { data } = await axios.get(CBR_URL, { timeout: 5000 })
    const parsed = await parseStringPromise(data)
    const valuteList = parsed.ValCurs.Valute as Array<Record<string, string[]>>
    const usdEntry = valuteList.find((v) => v.CharCode[0] === 'USD')
    if (!usdEntry) throw new Error('USD not found in CBR response')

    const rate = parseFloat(usdEntry.Value[0].replace(',', '.'))
    await redis.setex(CACHE_KEY, CACHE_TTL, String(rate))
    await redis.set(FALLBACK_KEY, String(rate))
    return { rate, fallback: false }
  } catch {
    const lastKnown = await redis.get(FALLBACK_KEY)
    if (lastKnown) return { rate: parseFloat(lastKnown), fallback: true }
    throw new Error('CBR rate unavailable and no fallback cached')
  }
}

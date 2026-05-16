import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { redis } from '../config/redis'
import { getUsdToRubRate, clearCbrCache } from '../services/cbr.service'

vi.mock('axios')
const mockedAxios = vi.mocked(axios)

const CBR_XML_SAMPLE = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="16.05.2026" name="Foreign Currency Market">
  <Valute ID="R01235">
    <NumCode>840</NumCode>
    <CharCode>USD</CharCode>
    <Nominal>1</Nominal>
    <Name>Доллар США</Name>
    <Value>92,5000</Value>
    <VunitRate>92,5000</VunitRate>
  </Valute>
</ValCurs>`

beforeEach(async () => {
  await clearCbrCache()
  vi.resetAllMocks()
})

describe('getUsdToRubRate', () => {
  it('fetches rate from CBR and returns it', async () => {
    mockedAxios.get = vi.fn().mockResolvedValueOnce({ data: CBR_XML_SAMPLE })

    const result = await getUsdToRubRate()
    expect(result.rate).toBeCloseTo(92.5)
    expect(result.fallback).toBe(false)
  })

  it('returns cached rate on second call without fetching CBR again', async () => {
    mockedAxios.get = vi.fn().mockResolvedValueOnce({ data: CBR_XML_SAMPLE })

    await getUsdToRubRate()
    await getUsdToRubRate()

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  it('returns fallback=true when CBR is unreachable but last-known exists', async () => {
    await redis.set('cbr:usd_rate:last_known', '90.0')
    mockedAxios.get = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    const result = await getUsdToRubRate()
    expect(result.rate).toBe(90.0)
    expect(result.fallback).toBe(true)
  })

  it('throws when CBR unreachable and no fallback cached', async () => {
    mockedAxios.get = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    await expect(getUsdToRubRate()).rejects.toThrow('CBR rate unavailable')
  })
})

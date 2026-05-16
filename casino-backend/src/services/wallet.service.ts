import { TronWeb } from 'tronweb'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '../config/env'
import { prisma } from '../config/prisma'

const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' })

export function encryptPrivateKey(privateKey: string): string {
  const iv = randomBytes(12)
  const key = Buffer.from(env.ENCRYPTION_KEY)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptPrivateKey(encryptedData: string): string {
  const data = Buffer.from(encryptedData, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const key = Buffer.from(env.ENCRYPTION_KEY)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

export function isValidTRC20Address(address: string): boolean {
  return typeof address === 'string' && address.startsWith('T') && address.length === 34
}

export async function getOrCreateDepositAddress(userId: string): Promise<string> {
  const existing = await prisma.depositAddress.findUnique({ where: { userId } })
  if (existing) return existing.trc20Address

  const account = await tronWeb.createAccount()
  const encryptedKey = encryptPrivateKey(account.privateKey)

  await prisma.depositAddress.create({
    data: { userId, trc20Address: account.address.base58, encryptedKey },
  })
  return account.address.base58
}

export async function getAllDepositAddresses(): Promise<{ userId: string; trc20Address: string }[]> {
  return prisma.depositAddress.findMany({ select: { userId: true, trc20Address: true } })
}

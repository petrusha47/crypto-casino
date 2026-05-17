'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'
import { User, GameRound } from '@/types'
import { useAuthStore } from '@/store/auth'

const GAME_LABEL: Record<string, string> = {
  SLOTS: '🎰 Слоты',
  ROULETTE: '🎡 Рулетка',
  BLACKJACK: '♠️ Блэкджек',
}

export default function ProfilePage() {
  const { user: storeUser } = useAuthStore()
  const [user, setUser] = useState<User | null>(storeUser)
  const [rounds, setRounds] = useState<GameRound[]>([])
  const [fetchError, setFetchError] = useState('')
  const [verifyHash, setVerifyHash] = useState('')
  const [verifySeed, setVerifySeed] = useState('')
  const [verifyClient, setVerifyClient] = useState('')
  const [verifyNonce, setVerifyNonce] = useState('1')
  const [verifyResult, setVerifyResult] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api.get<User>('/api/user/me', { signal: controller.signal }),
      api.get<GameRound[]>('/api/user/rounds', { signal: controller.signal }),
    ])
      .then(([userRes, roundsRes]) => {
        setUser(userRes.data)
        setRounds(roundsRes.data)
      })
      .catch((err) => {
        if (!axios.isCancel(err)) setFetchError('Не удалось загрузить профиль')
      })
    return () => controller.abort()
  }, [])

  const verify = () => {
    if (!verifyHash || !verifySeed || !verifyClient || !verifyNonce) return
    setVerifyResult(
      `HMAC-SHA256(serverSeed="${verifySeed}", message="${verifyClient}:${verifyNonce}") → compare with server result`,
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold neon-text-cyan text-center">👤 ПРОФИЛЬ</h1>

      {fetchError && <p className="text-red-400 text-center">{fetchError}</p>}

      {/* User info */}
      {user && (
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-casino-purple/20 border border-casino-purple flex items-center justify-center text-2xl">
              {(user.username[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <p className="text-xl font-bold text-white">{user.username}</p>
              <p className="text-gray-400 text-sm">{user.email}</p>
              <p className="text-xs text-gray-600 mt-1">ID: {user.id}</p>
            </div>
          </div>
        </div>
      )}

      {/* Game history */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">История игр</h2>
        {rounds.length === 0 ? (
          <p className="text-gray-500">Нет сыгранных раундов</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rounds.map((round) => {
              const net = round.winRub - round.betRub
              return (
                <div
                  key={round.id}
                  className="flex items-center justify-between py-2 border-b border-casino-border last:border-0"
                >
                  <div>
                    <p className="text-sm text-white">{GAME_LABEL[round.game] ?? round.game}</p>
                    <p className="text-xs text-gray-500">{new Date(round.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Ставка: {round.betRub} ₽</p>
                    <p className={`text-sm font-bold ${net >= 0 ? 'text-casino-cyan' : 'text-red-400'}`}>
                      {net >= 0 ? '+' : ''}{net} ₽
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Provably fair verifier */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">🔍 Провабли-фэйр верификатор</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Server Seed Hash (до игры)</label>
            <input
              value={verifyHash}
              onChange={(e) => setVerifyHash(e.target.value)}
              className="input-field text-sm font-mono"
              placeholder="sha256 хеш"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Server Seed (после игры)</label>
            <input
              value={verifySeed}
              onChange={(e) => setVerifySeed(e.target.value)}
              className="input-field text-sm font-mono"
              placeholder="раскрытый seed"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Client Seed</label>
              <input
                value={verifyClient}
                onChange={(e) => setVerifyClient(e.target.value)}
                className="input-field text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Nonce</label>
              <input
                type="number"
                value={verifyNonce}
                onChange={(e) => setVerifyNonce(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
          <button onClick={verify} className="btn-cyan w-full">
            Проверить
          </button>
          {verifyResult && (
            <div className="bg-casino-bg border border-casino-border rounded p-3 text-xs font-mono text-gray-300 break-all">
              {verifyResult}
            </div>
          )}
          <p className="text-xs text-gray-600">Формула: HMAC-SHA256(serverSeed, clientSeed:nonce) → float [0,1)</p>
        </div>
      </div>
    </div>
  )
}

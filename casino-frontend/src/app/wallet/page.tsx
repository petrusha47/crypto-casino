import DepositSection from '@/components/wallet/DepositSection'
import WithdrawalForm from '@/components/wallet/WithdrawalForm'
import TransactionList from '@/components/wallet/TransactionList'

export const metadata = { title: 'Кошелёк — ZW Casino' }

export default function WalletPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold neon-text-cyan mb-8 text-center">💳 КОШЕЛЁК</h1>
      <div className="max-w-2xl mx-auto space-y-6">
        <DepositSection />
        <WithdrawalForm />
        <TransactionList />
      </div>
    </div>
  )
}

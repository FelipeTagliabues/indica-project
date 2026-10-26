import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function LogoutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return <button type="button" className="mt-auto flex items-center gap-3 px-3 text-sm text-muted-foreground hover:text-foreground" onClick={async () => { await logout(); navigate('/login', { replace: true }) }}><LogOut className="h-4 w-4" /> Sair</button>
}

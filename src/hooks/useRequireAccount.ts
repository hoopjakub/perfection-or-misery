import { useEffect } from 'react'
import { router } from 'expo-router'
import { useUserStore } from '@/store/userStore'

export function useRequireAccount() {
  const { isGuest, isLoading } = useUserStore()

  useEffect(() => {
    if (!isLoading && isGuest) {
      router.replace('/auth/register')
    }
  }, [isGuest, isLoading])
}
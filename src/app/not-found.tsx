'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Stealth404Decoy } from '@/components/auth/stealth-404-decoy';

export default function NotFound() {
  const router = useRouter();

  const handleUnlock = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sh_stealth_unlocked', 'true');
    }
    router.push('/login');
  };

  return <Stealth404Decoy onUnlock={handleUnlock} />;
}


'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// DevOps functionality has been moved to Settings > Services
export default function DevOpsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/settings/services');
  }, [router]);

  return (
    <div className="container mx-auto py-6 text-center">
      <p className="text-muted-foreground">Redirecting to Services...</p>
    </div>
  );
}

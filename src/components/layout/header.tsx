"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QrCode, ArrowRightLeft } from 'lucide-react';
import type { Role } from '@/types';
import { Button } from '@/components/ui/button';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  let role: Role = null;
  if (pathname.startsWith('/manager')) {
    role = 'manager';
  } else if (pathname.startsWith('/worker')) {
    role = 'worker';
  }

  const roleText = role === 'manager' ? '관리자 모드' : role === 'worker' ? '작업자 모드' : '역할 선택';

  const handleSwitchRole = () => {
    router.push('/');
  };
  
  return (
    <header className="bg-card shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-full">
                <QrCode className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
                <h1 className="text-xl sm:text-2xl font-bold font-headline text-foreground">CBM Vision</h1>
                <p className="text-sm text-muted-foreground">{roleText}</p>
            </div>
        </Link>
        {role && (
          <Button 
              onClick={handleSwitchRole}
              variant="outline"
              aria-label="Switch role"
          >
              <ArrowRightLeft className="w-4 h-4 mr-0 sm:mr-2"/>
              <span className="hidden sm:inline">역할 전환</span>
          </Button>
        )}
      </div>
    </header>
  );
};

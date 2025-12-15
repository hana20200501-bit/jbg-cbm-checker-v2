"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Users,
    Ship,
    FileText,
    Settings,
    Menu,
    X,
    ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// 네비게이션 아이템
const NAV_ITEMS = [
    { href: '/admin', label: '대시보드', icon: LayoutDashboard },
    { href: '/admin/customers', label: '고객 DB', icon: Users },
    { href: '/admin/voyages', label: '항차 관리', icon: Ship },
    { href: '/admin/invoice', label: '인보이스', icon: FileText },
    { href: '/admin/settings', label: '설정', icon: Settings },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background">
            {/* 모바일 헤더 */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b z-50 flex items-center px-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(true)}
                >
                    <Menu className="w-5 h-5" />
                </Button>
                <span className="ml-3 font-bold text-lg">🚢 장보고 ERP</span>
            </header>

            {/* 모바일 사이드바 오버레이 */}
            {isSidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* 사이드바 */}
            <aside
                className={cn(
                    "fixed top-0 left-0 h-full w-64 bg-card border-r z-50 transition-transform duration-200",
                    "lg:translate-x-0",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {/* 로고 */}
                <div className="h-14 flex items-center justify-between px-4 border-b">
                    <Link href="/admin" className="font-bold text-lg flex items-center gap-2">
                        🚢 장보고 ERP
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* 네비게이션 */}
                <nav className="p-4 space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href ||
                            (item.href !== '/admin' && pathname.startsWith(item.href));
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsSidebarOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* 하단 정보 */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        메인으로 돌아가기
                    </Link>
                </div>
            </aside>

            {/* 메인 콘텐츠 */}
            <main className={cn(
                "min-h-screen transition-all duration-200",
                "lg:ml-64",
                "pt-14 lg:pt-0"
            )}>
                {children}
            </main>
        </div>
    );
}

"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Ship, FileText, Package, TrendingUp, DollarSign } from 'lucide-react';

// 대시보드 통계 카드
const StatCard = ({
    title,
    value,
    subValue,
    icon: Icon,
    color,
}: {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ElementType;
    color: string;
}) => (
    <Card>
        <CardContent className="p-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                    {subValue && (
                        <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
                    )}
                </div>
                <div className={`p-3 rounded-full ${color}`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>
        </CardContent>
    </Card>
);

// 빠른 액션 카드
const QuickAction = ({
    title,
    description,
    href,
    icon: Icon,
}: {
    title: string;
    description: string;
    href: string;
    icon: React.ElementType;
}) => (
    <Link href={href}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6">
                <Icon className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </CardContent>
        </Card>
    </Link>
);

export default function AdminDashboardPage() {
    // 실제로는 Firestore에서 데이터 로드
    const stats = {
        totalCustomers: 47,
        activeVoyages: 2,
        pendingInvoices: 12,
        totalCbm: 234.5,
        monthlyRevenue: 15420,
        completedShipments: 156,
    };

    return (
        <div className="p-6 space-y-8">
            {/* 헤더 */}
            <div>
                <h1 className="text-2xl font-bold">대시보드</h1>
                <p className="text-muted-foreground mt-1">
                    장보고 익스프레스 관리 시스템에 오신 것을 환영합니다.
                </p>
            </div>

            {/* 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                    title="등록 고객"
                    value={stats.totalCustomers}
                    subValue="명"
                    icon={Users}
                    color="bg-blue-500"
                />
                <StatCard
                    title="진행 중 항차"
                    value={stats.activeVoyages}
                    subValue="건"
                    icon={Ship}
                    color="bg-orange-500"
                />
                <StatCard
                    title="발행 대기 인보이스"
                    value={stats.pendingInvoices}
                    subValue="건"
                    icon={FileText}
                    color="bg-purple-500"
                />
                <StatCard
                    title="이번 달 총 CBM"
                    value={stats.totalCbm.toFixed(1)}
                    subValue="m³"
                    icon={Package}
                    color="bg-green-500"
                />
                <StatCard
                    title="이번 달 매출"
                    value={`$${stats.monthlyRevenue.toLocaleString()}`}
                    icon={DollarSign}
                    color="bg-emerald-500"
                />
                <StatCard
                    title="완료된 배송"
                    value={stats.completedShipments}
                    subValue="건"
                    icon={TrendingUp}
                    color="bg-cyan-500"
                />
            </div>

            {/* 빠른 액션 */}
            <div>
                <h2 className="text-lg font-semibold mb-4">빠른 작업</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <QuickAction
                        title="새 항차 생성"
                        description="새로운 선적 일정을 등록합니다"
                        href="/admin/voyages/new"
                        icon={Ship}
                    />
                    <QuickAction
                        title="고객 DB 관리"
                        description="고객 정보를 조회하고 수정합니다"
                        href="/admin/customers"
                        icon={Users}
                    />
                    <QuickAction
                        title="인보이스 작성"
                        description="새 인보이스를 발행합니다"
                        href="/admin/invoice"
                        icon={FileText}
                    />
                </div>
            </div>

            {/* 최근 활동 (추후 구현) */}
            <div>
                <h2 className="text-lg font-semibold mb-4">최근 활동</h2>
                <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                        <p>최근 활동 내역이 여기에 표시됩니다.</p>
                        <p className="text-sm mt-1">(Firestore 연동 후 활성화 예정)</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

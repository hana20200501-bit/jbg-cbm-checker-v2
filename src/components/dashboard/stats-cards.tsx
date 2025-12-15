
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, Box, CheckCircle2 } from 'lucide-react';
import type { ShipperWithBoxData } from '@/types';

const StatCard = ({ title, value, icon: Icon, progress }: { title: string, value: string, icon: React.ElementType, progress?: number }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {progress !== undefined && (
        <>
          <p className="text-xs text-muted-foreground">
            {`${Math.round(progress)}% 완료`}
          </p>
          <Progress value={progress} className="h-2 mt-2" />
        </>
      )}
    </CardContent>
  </Card>
);

interface StatsCardsProps {
    shippers: ShipperWithBoxData[];
    isLoading: boolean;
    error: any;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ shippers, isLoading, error }) => {
    const dashboardStats = useMemo(() => {
        if (isLoading || error || shippers.length === 0) {
          return { totalShipperGroups: 0, confirmedShipperGroups: 0, totalBoxes: 0, completedBoxes: 0, overallProgress: 0 };
        }
        
        const grouped = shippers.reduce((acc, shipper) => {
            const key = shipper.uniqueNumber || '개별 등록';
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(shipper);
            return acc;
        }, {} as Record<string, ShipperWithBoxData[]>);
        
        const totalShipperGroups = Object.keys(grouped).length;
        
        const confirmedShipperGroups = Object.values(grouped).filter(groupShippers => 
            groupShippers.every(s => s.isConfirmed)
        ).length;

        const totalBoxes = shippers.reduce((sum, s) => sum + s.boxes.length, 0);
        const completedBoxes = shippers.reduce((sum, s) => sum + s.completedBoxes, 0);
        const overallProgress = totalBoxes > 0 ? (completedBoxes / totalBoxes) * 100 : 0;
        
        return {
          totalShipperGroups,
          confirmedShipperGroups,
          totalBoxes,
          completedBoxes,
          overallProgress,
        };
      }, [shippers, isLoading, error]);

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card><CardHeader><CardTitle>로딩 중...</CardTitle></CardHeader><CardContent><div className="h-10"></div></CardContent></Card>
                <Card><CardHeader><CardTitle>로딩 중...</CardTitle></CardHeader><CardContent><div className="h-10"></div></CardContent></Card>
                <Card><CardHeader><CardTitle>로딩 중...</CardTitle></CardHeader><CardContent><div className="h-10"></div></CardContent></Card>
            </div>
        )
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard
                title="확인 완료 / 총 화주 그룹"
                value={`${dashboardStats.confirmedShipperGroups} / ${dashboardStats.totalShipperGroups} 개`}
                icon={Users}
            />
            <StatCard
                title="총 박스"
                value={`${dashboardStats.completedBoxes} / ${dashboardStats.totalBoxes} 개`}
                icon={Box}
            />
            <StatCard
                title="전체 진행률"
                value={`${dashboardStats.overallProgress.toFixed(1)}%`}
                icon={CheckCircle2}
                progress={dashboardStats.overallProgress}
            />
        </div>
    );
}

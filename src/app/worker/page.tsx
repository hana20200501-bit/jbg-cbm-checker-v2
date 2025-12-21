
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ShipperWithBoxData, Shipment, ShipmentStatus } from '@/types';
import { useShippers } from '@/hooks/use-shippers';
import { useShipments, useVoyages } from '@/hooks/use-erp-data';
import { isFirebaseConfigured } from '@/lib/firebase';
import { updateShipmentCbm } from '@/lib/firestore-service';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ServerCrash, Image as ImageIcon, ArrowUpCircle, AlertTriangle, Ship, Package, Ruler } from 'lucide-react';
import Image from 'next/image';
import { Checkbox } from '@/components/ui/checkbox';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { Button } from '@/components/ui/button';
import { cn, getChosung } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const SCROLL_POSITION_KEY = 'worker_scroll_position';

export default function WorkerViewPage() {
  const router = useRouter();
  const { shippers, isLoading, error } = useShippers();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const isRestored = useRef(false);

  useEffect(() => {
    // Restore scroll position only once when shippers data is loaded
    if (!isLoading && !isRestored.current) {
      const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
      if (savedPosition) {
        const y = parseInt(savedPosition, 10);
        if (!isNaN(y)) {
          setTimeout(() => window.scrollTo(0, y), 0);
        }
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        isRestored.current = true;
      }
    }
  }, [isLoading, shippers]);

  useEffect(() => {
    // Listen for scroll events to show/hide the "scroll to top" button
    const handleScroll = () => {
      setShowTopButton(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredShippers = useMemo(() => {
    let shippersToFilter = [...shippers];

    // 1. Filter by urgent status
    if (showUrgentOnly) {
      shippersToFilter = shippersToFilter.filter(s => s.isUrgent);
    }

    // 2. Filter by completion status
    if (showCompletedOnly) {
      shippersToFilter = shippersToFilter.filter(s => {
        return s.boxes.length > 0 && s.completedBoxes === s.boxes.length;
      });
    }

    // 3. Filter by search term
    const lowercasedTerm = searchTerm.toLowerCase();
    if (searchTerm.trim()) {
      shippersToFilter = shippersToFilter.filter(s => {
        const chosungName = getChosung(s.nameKr).toLowerCase();
        return (s.uniqueNumber && s.uniqueNumber.toLowerCase().includes(lowercasedTerm)) ||
          (s.nameKr && s.nameKr.toLowerCase().includes(lowercasedTerm)) ||
          (chosungName.includes(lowercasedTerm)) ||
          (s.nameEn && s.nameEn.toLowerCase().includes(lowercasedTerm)) ||
          (s.contact && s.contact.toLowerCase().includes(lowercasedTerm)) ||
          (s.boxFeature1 && s.boxFeature1.toLowerCase().includes(lowercasedTerm)) ||
          (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(lowercasedTerm)) ||
          (s.region && s.region.toLowerCase().includes(lowercasedTerm))
      });
    }

    return shippersToFilter;
  }, [searchTerm, shippers, showCompletedOnly, showUrgentOnly]);

  const groupedAndSortedShippers = useMemo(() => {
    const grouped = filteredShippers.reduce((acc, shipper) => {
      const key = shipper.uniqueNumber || shipper.id; // Group by uniqueNumber, or by shipper ID if no uniqueNumber
      if (!acc[key]) {
        acc[key] = { shippers: [], isGroupCompleted: true };
      }
      acc[key].shippers.push(shipper);

      const isShipperCompleted = shipper.boxes.length > 0 && shipper.completedBoxes === shipper.boxes.length;
      if (!isShipperCompleted) {
        acc[key].isGroupCompleted = false;
      }
      return acc;
    }, {} as Record<string, { shippers: ShipperWithBoxData[], isGroupCompleted: boolean }>);

    return Object.entries(grouped)
      .sort(([, aData], [, bData]) => {
        const isAUrgent = aData.shippers.some(s => s.isUrgent);
        const isBUrgent = bData.shippers.some(s => s.isUrgent);

        if (isAUrgent && !isBUrgent) return -1;
        if (!isAUrgent && isBUrgent) return 1;

        if (aData.isGroupCompleted !== bData.isGroupCompleted) {
          return aData.isGroupCompleted ? 1 : -1;
        }

        const aName = aData.shippers[0].uniqueNumber || aData.shippers[0].nameKr;
        const bName = bData.shippers[0].uniqueNumber || bData.shippers[0].nameKr;
        return aName.localeCompare(bName);
      })
      .map(([groupName, data]) => {
        const shippersInGroup = data.shippers.sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
          return a.nameKr.localeCompare(b.nameKr, 'ko');
        });
        return {
          groupName,
          shippersInGroup,
          isGroupCompleted: data.isGroupCompleted,
        } as { groupName: string, shippersInGroup: ShipperWithBoxData[], isGroupCompleted: boolean };
      });

  }, [filteredShippers]);

  const handleSelectShipper = (shipperId: string) => {
    // Save current scroll position before navigating
    sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
    router.push(`/worker/${shipperId}`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /> <span className="ml-2">화주 목록을 불러오는 중...</span></div>;
    }
    if (error) {
      return <div className="text-center text-destructive p-8 bg-card rounded-lg shadow-sm"><ServerCrash className="w-8 h-8 mx-auto mb-2" /><span>데이터 로딩 중 오류가 발생했습니다.</span></div>;
    }
    if (shippers.length > 0 && groupedAndSortedShippers.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-8 bg-card rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-foreground">표시할 목록이 없습니다.</h3>
          <p className="mt-2 text-sm">검색어나 필터를 확인해주세요.</p>
        </div>
      );
    }
    if (groupedAndSortedShippers.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-8 bg-card rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-foreground">데이터가 없습니다.</h3>
          <p className="mt-2 text-sm">관리자가 화주를 등록하면 목록이 여기에 표시됩니다.</p>
        </div>
      );
    }
    return groupedAndSortedShippers.map(({ groupName, shippersInGroup, isGroupCompleted }) => {
      const totalBoxesInGroup = shippersInGroup.reduce((sum, shipper) => sum + shipper.boxes.length, 0);
      const representativeShipper = shippersInGroup[0];
      const representativeContact = representativeShipper?.contact || '연락처 없음';
      const representativeRegion = representativeShipper?.region || null;

      const displayHeader = `연락처: ${representativeContact} (Total: ${totalBoxesInGroup} Box)`;

      return (
        <Card
          key={groupName}
          className={cn(
            "mb-6 overflow-hidden transition-all",
            isGroupCompleted ? "border-2 border-primary/50" : "border-black border-[3px]"
          )}
        >
          <div className="px-4 py-2 border-b bg-muted">
            <h3 className="font-extrabold text-xl text-foreground">{displayHeader}</h3>
            {representativeRegion && (
              <p className="font-bold text-primary text-md">{representativeRegion}</p>
            )}
          </div>
          <div className="space-y-3 p-3">
            {shippersInGroup.map(shipper => {
              const isShipperCompleted = shipper.boxes.length > 0 && shipper.completedBoxes === shipper.boxes.length;
              const isPartiallyCompleted = !isShipperCompleted && shipper.completedBoxes > 0;
              const progress = shipper.boxes.length > 0 ? (shipper.completedBoxes / shipper.boxes.length) * 100 : 0;
              const representativeImage = shipper.imageUrl || shipper.representativeBoxImageUrl;

              return (
                <button
                  key={shipper.id}
                  onClick={() => handleSelectShipper(shipper.id)}
                  className={cn(
                    "w-full text-left p-4 rounded-lg shadow-md border hover:border-primary hover:bg-primary/5 transition-all duration-150 flex items-center gap-4",
                    shipper.isUrgent && "border-destructive border-2 bg-destructive/5",
                    isPartiallyCompleted && "bg-pink-50",
                    isShipperCompleted ? "bg-primary/10 border-primary/50" : "bg-card"
                  )}
                >
                  {representativeImage ? (
                    <Image src={representativeImage} alt={shipper.nameKr} width={64} height={64} className="w-16 h-16 object-cover rounded-md flex-shrink-0 bg-muted" data-ai-hint="package" />
                  ) : (
                    <div className="w-16 h-16 rounded-md flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}

                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-2">
                        {shipper.isUrgent && <AlertTriangle className="w-6 h-6 text-destructive animate-pulse mt-1" />}
                        <div>
                          <p className="font-extrabold text-foreground text-xl leading-tight">{shipper.nameKr}</p>
                          <p className="font-semibold text-muted-foreground text-base leading-tight">{shipper.nameEn}</p>
                        </div>
                      </div>
                      {isShipperCompleted && (
                        <div className="flex items-center text-green-700 font-bold text-xs bg-green-100 px-2.5 py-1 rounded-full">
                          <span>완료</span>
                        </div>
                      )}
                    </div>
                    <div className="text-base text-muted-foreground mt-2 space-y-1 text-left">
                      <p className="text-primary font-bold"><span className="font-extrabold text-foreground">특징:</span> {shipper.boxFeature1 || '없음'}</p>
                      <p className="text-destructive font-bold"><span className="font-extrabold text-foreground">송장:</span> {shipper.invoiceNumber || '없음'}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Progress value={progress} className="h-2" />
                      <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">{shipper.completedBoxes} / {shipper.boxes.length}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )
    });
  };

  return (
    <main ref={mainRef} className="container mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold font-headline text-foreground">작업자 CBM 입력</h2>
        <p className="text-muted-foreground mt-1">전체 목록에서 화주를 선택하거나, 검색하여 필터링하세요.</p>
      </div>

      <StatsCards shippers={shippers} isLoading={isLoading} error={error} />

      <div className="py-4 bg-background z-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
          <Input
            type="search"
            placeholder="화주, 고유넘버, 특징, 초성(ㅇㅎㅁ) 등으로 검색..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-16 p-4 pl-14 text-lg rounded-lg border-[3px] border-black focus:border-primary bg-white placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center space-x-4 mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="show-completed" checked={showCompletedOnly} onCheckedChange={(checked) => setShowCompletedOnly(!!checked)} />
            <Label
              htmlFor="show-completed"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              완료된 목록만 보기
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="show-urgent" checked={showUrgentOnly} onCheckedChange={(checked) => setShowUrgentOnly(!!checked)} />
            <Label
              htmlFor="show-urgent"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              긴급 목록만 보기
            </Label>
          </div>
        </div>
      </div>

      <div className="relative">
        {renderContent()}
      </div>

      {showTopButton && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-lg z-50"
          size="icon"
        >
          <ArrowUpCircle className="w-6 h-6" />
          <span className="sr-only">Go to top</span>
        </Button>
      )}
    </main>
  );
};

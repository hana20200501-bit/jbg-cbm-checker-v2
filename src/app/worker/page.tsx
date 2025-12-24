"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Shipment, Voyage } from '@/types';
import { useShipments, useVoyages } from '@/hooks/use-erp-data';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ServerCrash, Image as ImageIcon, ArrowUpCircle, AlertTriangle, Ship, Package, Ruler, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn, getChosung } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const SCROLL_POSITION_KEY = 'worker_scroll_position';

export default function WorkerViewPage() {
  const router = useRouter();

  // 📌 ERP Data Hook Integration
  const { voyages, loading: voyagesLoading } = useVoyages();
  const [activeVoyageId, setActiveVoyageId] = useState<string>('');

  // Auto-select latest voyage
  useEffect(() => {
    const saved = sessionStorage.getItem('activeVoyageId');
    if (saved && voyages.find(v => v.id === saved)) {
      setActiveVoyageId(saved);
    } else if (voyages.length > 0) {
      // Sort by date desc
      const sorted = [...voyages].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
      setActiveVoyageId(sorted[0].id);
    }
  }, [voyages]);

  const handleVoyageChange = (val: string) => {
    setActiveVoyageId(val);
    sessionStorage.setItem('activeVoyageId', val);
  };

  const { shipments, loading: shipmentsLoading, error } = useShipments(activeVoyageId);

  const [searchTerm, setSearchTerm] = useState('');
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const isRestored = useRef(false);

  // 📌 Worker Identity
  const [workerName, setWorkerName] = useState('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('workerName');
    if (saved) setWorkerName(saved);
    else setIsNameModalOpen(true);
  }, []);

  const handleNameSubmit = () => {
    if (!tempName.trim()) return;
    sessionStorage.setItem('workerName', tempName.trim());
    setWorkerName(tempName.trim());
    setIsNameModalOpen(false);
  };

  // Scroll Restoration
  useEffect(() => {
    if (!shipmentsLoading && !isRestored.current && shipments.length > 0) {
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
  }, [shipmentsLoading, shipments]);

  useEffect(() => {
    const handleScroll = () => {
      setShowTopButton(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 📌 Filter Logic
  const filteredShipments = useMemo(() => {
    let result = [...shipments];

    // 1. Filter by urgent (Not supported in Shipment yet? Maybe 'isUrgent' field missing?)
    // Assuming no Urgent field in Shipment for now, or use 'feature' text check
    if (showUrgentOnly) {
      // result = result.filter(s => s.feature?.includes('긴급')); 
      // FIXME: Add isUrgent to Shipment if needed.
    }

    // 2. Filter by completion status (CBM Done)
    if (showCompletedOnly) {
      result = result.filter(s => s.totalCbm && s.totalCbm > 0);
    }

    // 3. Filter by search term
    const lowercasedTerm = searchTerm.toLowerCase();
    if (searchTerm.trim()) {
      result = result.filter(s => {
        const nameKr = s.customerName || s.rawName || '';
        const chosungName = getChosung(nameKr).toLowerCase();
        const podStr = s.podCode ? s.podCode.toString() : '';
        const invoice = s.invoice || '';
        const feature = s.feature || '';

        return (
          nameKr.toLowerCase().includes(lowercasedTerm) ||
          chosungName.includes(lowercasedTerm) ||
          podStr.includes(lowercasedTerm) ||
          invoice.toLowerCase().includes(lowercasedTerm) ||
          feature.toLowerCase().includes(lowercasedTerm)
        );
      });
    }

    // Sort by POD Code
    result.sort((a, b) => (a.podCode || 9999) - (b.podCode || 9999));

    return result;
  }, [searchTerm, shipments, showCompletedOnly, showUrgentOnly]);

  const handleSelectShipment = (shipmentId: string) => {
    sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
    router.push(`/worker/${shipmentId}`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    if (shipmentsLoading || voyagesLoading) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /> <span className="ml-2">데이터를 불러오는 중...</span></div>;
    }
    if (error) {
      return <div className="text-center text-destructive p-8 bg-card rounded-lg shadow-sm"><ServerCrash className="w-8 h-8 mx-auto mb-2" /><span>데이터 로딩 중 오류가 발생했습니다.</span></div>;
    }
    if (activeVoyageId && shipments.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-8 bg-card rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-foreground">화물 데이터가 없습니다.</h3>
          <p className="mt-2 text-sm">관리자가 화물을 Import 했는지 확인해주세요.</p>
        </div>
      );
    }
    if (filteredShipments.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-8 bg-card rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-foreground">검색 결과가 없습니다.</h3>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filteredShipments.map(shipment => {
          const totalBoxes = shipment.qty || 1;
          const completedBoxes = shipment.boxDimensions?.length || 0; // Warning: boxDimensions might be aggregated
          // Assuming boxDimensions items represents boxes? 
          // Wait, boxDimensions has 'quantity' inside.
          // totalMeasuredBoxes = boxDimensions.reduce((sum, b) => sum + b.quantity, 0);
          const measuredBoxes = (shipment.boxDimensions || []).reduce((sum, b) => sum + b.quantity, 0);

          const progress = totalBoxes > 0 ? (measuredBoxes / totalBoxes) * 100 : 0;
          const isCompleted = measuredBoxes >= totalBoxes && totalBoxes > 0;
          const isPartiallyCompleted = measuredBoxes > 0 && !isCompleted;

          return (
            <button
              key={shipment.id}
              onClick={() => handleSelectShipment(shipment.id)}
              className={cn(
                "w-full text-left p-4 rounded-lg shadow-md border hover:border-primary hover:bg-primary/5 transition-all duration-150 flex items-center gap-4",
                isPartiallyCompleted && "bg-pink-50",
                isCompleted ? "bg-primary/10 border-primary/50" : "bg-card"
              )}
            >
              <div className="w-16 h-16 rounded-md flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground font-bold text-lg select-none">
                {shipment.podCode || '?'}
              </div>

              <div className="flex-grow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-extrabold text-foreground text-xl leading-tight">
                      {shipment.customerName || shipment.rawName}
                    </p>
                    <p className="font-semibold text-muted-foreground text-sm leading-tight mt-1">
                      {shipment.feature || '특징 없음'}
                    </p>
                  </div>
                  {isCompleted && (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">완료</Badge>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <Progress value={progress} className="h-2 flex-grow" />
                  <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
                    {measuredBoxes} / {totalBoxes}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <main ref={mainRef} className="container mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-headline text-foreground">작업자 CBM 입력</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">항차를 선택하고 화물을 관리하세요.</p>
            {workerName && (
              <Badge variant="outline" className="text-xs text-primary border-primary cursor-pointer" onClick={() => setIsNameModalOpen(true)}>
                👮 작업자: {workerName}
              </Badge>
            )}
          </div>
        </div>
        <div className="w-full sm:w-auto min-w-[200px]">
          <Select value={activeVoyageId} onValueChange={handleVoyageChange}>
            <SelectTrigger>
              <SelectValue placeholder="항차 선택" />
            </SelectTrigger>
            <SelectContent>
              {voyages.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="py-4 bg-background z-10 sticky top-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
          <Input
            type="search"
            placeholder="화주명, POD, 특징, 송장번호..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-14 p-4 pl-14 text-lg rounded-lg border-2 border-slate-200 focus:border-primary bg-white shadow-sm"
          />
        </div>
        <div className="flex items-center space-x-4 mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="show-completed" checked={showCompletedOnly} onCheckedChange={(checked) => setShowCompletedOnly(!!checked)} />
            <Label htmlFor="show-completed" className="text-sm font-medium">
              완료된 목록만 보기
            </Label>
          </div>
        </div>
      </div>

      <div className="relative min-h-[300px]">
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

      {/* Identity Modal */}
      <Dialog open={isNameModalOpen} onOpenChange={(open) => {
        // Prevent closing if no name set yet
        if (!open && !workerName) return;
        setIsNameModalOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>작업자 확인</DialogTitle>
            <DialogDescription>작업 이력을 남기기 위해 성함을 입력해주세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>성함 (또는 닉네임)</Label>
              <Input
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                placeholder="예: 김철수"
                onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleNameSubmit} disabled={!tempName.trim()}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

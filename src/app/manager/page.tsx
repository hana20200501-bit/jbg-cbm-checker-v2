
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ShipperWithBoxData, Voyage } from '@/types';
import { useShippers } from '@/hooks/use-shippers';
import { useVoyages } from '@/hooks/use-erp-data';
import { Button } from '@/components/ui/button';
import { PlusCircle, ClipboardList, Download, Trash2, Loader2, ServerCrash, ArrowUp, ArrowDown, Search, Eye, FilePenLine, Image as ImageIcon, Flame, CheckCircle, Settings, ChevronDown, Users, Ship, FileText, PackageCheck, Receipt, Banknote, MapPin } from 'lucide-react';
import NewShipperForm from '@/components/manager/new-shipper-form';
import BulkImportModal from '@/components/manager/bulk-import-modal';
import BulkDeleteModal from '@/components/manager/bulk-delete-modal';
import ShipperDetailsModal from '@/components/manager/shipper-details-modal';
import GroupDetailsModal from '@/components/manager/group-details-modal';
import EditShipperModal from '@/components/manager/edit-shipper-modal';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { deleteAllDataAction, deleteMultipleShippersAction, deleteSingleShipperAction, updateShipperConfirmationStatusAction, updateShipperUrgentStatusAction, updateShipperArrivedStatusAction, updateShipperPaidStatusAction } from '@/app/actions';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn, getChosung } from '@/lib/utils';
import Image from 'next/image';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type SortKey = 'progress' | 'boxCount' | 'nameKr' | 'region' | 'isUrgent';

export default function ManagerDashboardPage() {
  const router = useRouter();
  const { shippers, isLoading, error } = useShippers();
  const { toast } = useToast();

  // 🆕 항차 관리
  const { voyages, loading: voyagesLoading } = useVoyages(['READY', 'CLOSING', 'CLOSED']);
  const [activeVoyageId, setActiveVoyageId] = useState<string | null>(null);

  // 📌 sessionStorage에서 활성 항차 복원 & 저장
  useEffect(() => {
    const saved = sessionStorage.getItem('activeVoyageId');
    if (saved) setActiveVoyageId(saved);
  }, []);

  useEffect(() => {
    if (activeVoyageId) {
      sessionStorage.setItem('activeVoyageId', activeVoyageId);
    }
  }, [activeVoyageId]);

  const activeVoyage = voyages.find(v => v.id === activeVoyageId);

  const [isNewShipperModalOpen, setIsNewShipperModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [selectedShipper, setSelectedShipper] = useState<ShipperWithBoxData | null>(null);
  const [groupToView, setGroupToView] = useState<{ name: string; shippers: ShipperWithBoxData[] } | null>(null);
  const [shipperToEdit, setShipperToEdit] = useState<ShipperWithBoxData | null>(null);
  const [shipperToDelete, setShipperToDelete] = useState<ShipperWithBoxData | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('progress');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>('all'); // 지역 필터

  // 고유 지역 목록 추출
  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    shippers.forEach(s => {
      if (s.region) regions.add(s.region);
    });
    return Array.from(regions).sort();
  }, [shippers]);

  const handleModalClose = () => {
    setIsNewShipperModalOpen(false);
    setIsBulkImportModalOpen(false);
    setShipperToEdit(null);
    setIsBulkDeleteModalOpen(false);
  };

  const handleToggleUrgent = async (shipperId: string, currentStatus: boolean) => {
    try {
      const result = await updateShipperUrgentStatusAction(shipperId, !currentStatus);
      if (result.success) {
        toast({ title: "상태 변경됨", description: "화주의 긴급 상태가 변경되었습니다." });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `긴급 상태 변경에 실패했습니다: ${errorMessage}`
      });
    }
  };

  const handleToggleConfirmation = async (shipperIds: string[], currentStatus: boolean) => {
    try {
      const result = await updateShipperConfirmationStatusAction(shipperIds, !currentStatus);
      if (result.success) {
        toast({ title: "상태 변경됨", description: "화물 확인 상태가 변경되었습니다." });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `확인 상태 변경에 실패했습니다: ${errorMessage}`
      });
    }
  };

  // 입고 확인 토글
  const handleToggleArrived = async (shipperId: string, currentStatus: boolean) => {
    try {
      const result = await updateShipperArrivedStatusAction(shipperId, !currentStatus);
      if (result.success) {
        toast({
          title: !currentStatus ? "📦 입고 확인됨" : "입고 취소됨",
          description: !currentStatus ? "화물이 창고에 입고되었습니다." : "입고 상태가 취소되었습니다."
        });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `입고 상태 변경에 실패했습니다: ${errorMessage}`
      });
    }
  };

  // 인보이스 생성 (CBM 데이터와 함께 인보이스 에디터로 이동)
  const handleCreateInvoice = (shipper: ShipperWithBoxData) => {
    // CBM 데이터를 쿼리 파라미터로 전달
    const params = new URLSearchParams({
      name: shipper.nameKr,
      nameEn: shipper.nameEn || '',
      contact: shipper.contact || '',
      region: shipper.region || '',
      cbm: shipper.totalCbm.toFixed(4),
      boxes: shipper.boxes.length.toString(),
    });
    router.push(`/admin/invoice?${params.toString()}`);
  };

  // 결제 상태 토글
  const handleTogglePaid = async (shipperId: string, currentStatus: boolean) => {
    try {
      const result = await updateShipperPaidStatusAction(shipperId, !currentStatus);
      if (result.success) {
        toast({
          title: !currentStatus ? "💰 결제 완료" : "결제 취소됨",
          description: !currentStatus ? "결제가 확인되었습니다." : "결제 상태가 취소되었습니다."
        });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `결제 상태 변경에 실패했습니다: ${errorMessage}`
      });
    }
  };

  const handleDeleteShipper = async () => {
    if (!shipperToDelete) return;

    try {
      const result = await deleteSingleShipperAction(shipperToDelete.id);
      if (result.success) {
        toast({ title: "삭제 완료", description: "화주 정보가 성공적으로 삭제되었습니다." });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `화주 정보 삭제에 실패했습니다: ${errorMessage}`
      });
    } finally {
      setShipperToDelete(null);
    }
  };

  const handleSortKeyChange = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const handleToggleSortDirection = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }

  const groupedShippers = useMemo(() => {
    const lowercasedTerm = searchTerm.toLowerCase();
    let filteredShippers = !searchTerm.trim()
      ? [...shippers]
      : shippers.filter(s => {
        const chosungName = getChosung(s.nameKr).toLowerCase();
        return (s.uniqueNumber && s.uniqueNumber.toLowerCase().includes(lowercasedTerm)) ||
          (s.nameKr && s.nameKr.toLowerCase().includes(lowercasedTerm)) ||
          (chosungName.includes(lowercasedTerm)) ||
          (s.nameEn && s.nameEn.toLowerCase().includes(lowercasedTerm)) ||
          (s.boxFeature1 && s.boxFeature1.toLowerCase().includes(lowercasedTerm)) ||
          (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(lowercasedTerm)) ||
          (s.region && s.region.toLowerCase().includes(lowercasedTerm))
      });

    // 지역 필터 적용
    if (regionFilter !== 'all') {
      filteredShippers = filteredShippers.filter(s => s.region === regionFilter);
    }

    const grouped = filteredShippers.reduce((acc, shipper) => {
      const key = shipper.uniqueNumber || '개별 등록';
      if (!acc[key]) {
        acc[key] = { shippers: [], totalGroupBoxes: 0, totalGroupCompletedBoxes: 0 };
      }
      acc[key].shippers.push(shipper);
      acc[key].totalGroupBoxes += shipper.boxes.length;
      acc[key].totalGroupCompletedBoxes += shipper.completedBoxes;
      return acc;
    }, {} as Record<string, { shippers: ShipperWithBoxData[], totalGroupBoxes: number, totalGroupCompletedBoxes: number }>);

    let groupEntries = Object.entries(grouped);

    // Main Sorting Logic
    groupEntries.sort(([, aData], [, bData]) => {
      // Define group statuses
      const isACbmCompleted = aData.totalGroupBoxes > 0 && aData.totalGroupCompletedBoxes === aData.totalGroupBoxes;
      const isBCbmCompleted = bData.totalGroupBoxes > 0 && bData.totalGroupCompletedBoxes === bData.totalGroupBoxes;
      const isAConfirmed = aData.shippers.every(s => s.isConfirmed);
      const isBConfirmed = bData.shippers.every(s => s.isConfirmed);

      const getStatusRank = (isCbmCompleted: boolean, isConfirmed: boolean): number => {
        if (isCbmCompleted && isConfirmed) return 3; // 3. 최종 완료 (초록)
        if (isCbmCompleted && !isConfirmed) return 1; // 1. CBM 완료 (파랑)
        return 2; // 2. 진행 중 (검정)
      };

      const rankA = getStatusRank(isACbmCompleted, isAConfirmed);
      const rankB = getStatusRank(isBCbmCompleted, isBConfirmed);

      if (rankA !== rankB) {
        return sortDirection === 'desc' ? rankA - rankB : rankB - rankA;
      }

      // Secondary Sort (user selected)
      let secondaryCompare = 0;
      switch (sortKey) {
        case 'isUrgent':
          const aIsUrgent = aData.shippers.some(s => s.isUrgent);
          const bIsUrgent = bData.shippers.some(s => s.isUrgent);
          if (aIsUrgent && !bIsUrgent) secondaryCompare = -1;
          else if (!aIsUrgent && bIsUrgent) secondaryCompare = 1;
          break;
        case 'boxCount':
          secondaryCompare = aData.totalGroupBoxes - bData.totalGroupBoxes;
          break;
        case 'progress':
          const progressA = aData.totalGroupBoxes > 0 ? aData.totalGroupCompletedBoxes / aData.totalGroupBoxes : 0;
          const progressB = bData.totalGroupBoxes > 0 ? bData.totalGroupCompletedBoxes / bData.totalGroupBoxes : 0;
          secondaryCompare = progressA - progressB;
          break;
        case 'nameKr':
          const nameA = aData.shippers[0]?.uniqueNumber || '';
          const nameB = bData.shippers[0]?.uniqueNumber || '';
          secondaryCompare = nameA.localeCompare(nameB, 'ko');
          break;
        case 'region':
          const regionA = aData.shippers[0]?.region || '';
          const regionB = bData.shippers[0]?.region || '';
          secondaryCompare = regionA.localeCompare(regionB, 'ko');
          break;
      }

      // For progress sort, we keep the existing direction logic. For others, it depends on the primary rank sort.
      if (sortKey !== 'progress') {
        return sortDirection === 'asc' ? secondaryCompare : -secondaryCompare;
      }
      return sortDirection === 'asc' ? secondaryCompare : -secondaryCompare;
    });

    groupEntries.forEach(([, data]) => {
      if (data.shippers) {
        data.shippers.sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
          return a.nameKr.localeCompare(b.nameKr, 'ko');
        });
      }
    });

    return groupEntries.map(([groupName, data]) => ({
      name: groupName,
      ...data,
    }));

  }, [shippers, sortKey, sortDirection, searchTerm, regionFilter]);

  const handleExportExcel = async () => {
    if (shippers.length === 0) {
      toast({
        variant: "destructive",
        title: "내보내기 실패",
        description: "내보낼 데이터가 없습니다.",
      });
      return;
    }
    setIsExporting(true);
    try {
      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shippers }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`서버에서 엑셀 파일 생성에 실패했습니다: ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cbm-vision-export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "엑셀 내보내기 완료",
        description: "데이터가 엑셀 파일로 저장되었습니다.",
      });

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "내보내기 실패",
        description: err.message || "알 수 없는 오류가 발생했습니다.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteSelectedShippers = async (shipperIds: string[]) => {
    const result = await deleteMultipleShippersAction(shipperIds);
    if (result.success) {
      if (result.count === shipperIds.length) {
        toast({
          title: "삭제 성공",
          description: `${result.count}개의 화주 정보가 성공적으로 삭제되었습니다.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "부분 삭제",
          description: `${result.count}개 삭제 성공, ${shipperIds.length - result.count}개 삭제 실패.`,
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "오류",
        description: `일괄 삭제 중 오류가 발생했습니다: ${result.error}`,
      });
    }
    return result;
  };

  const handleDeleteAllData = async () => {
    const result = await deleteAllDataAction();
    if (result.success) {
      toast({ title: "전체 삭제 완료", description: "모든 데이터가 성공적으로 삭제되었습니다." });
    } else {
      toast({ variant: "destructive", title: "삭제 실패", description: `서버에서 오류가 발생했습니다: ${result.error}` });
    }
    return result;
  }

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /> <span className="ml-2">데이터를 불러오는 중...</span></div>;
    }
    if (error) {
      return <div className="text-center text-destructive p-8 bg-card rounded-lg shadow-sm"><ServerCrash className="w-8 h-8 mx-auto mb-2" /><span>데이터 로딩 중 오류가 발생했습니다.</span></div>;
    }
    if (shippers.length === 0) {
      return (
        <div className="text-center text-muted-foreground p-8 bg-card rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-foreground">데이터가 없습니다.</h3>
          <p className="mt-2 text-sm">신규 화주를 등록하거나 엑셀 데이터를 가져오세요.</p>
        </div>
      );
    }
    if (groupedShippers.length === 0) {
      return <p className="text-center p-6 text-muted-foreground">검색 결과가 없습니다.</p>;
    }
    return groupedShippers.map((group) => {
      const { name, shippers, totalGroupBoxes, totalGroupCompletedBoxes } = group;
      const representativeRegion = shippers[0]?.region || '';

      const isCbmCompleted = totalGroupBoxes > 0 && totalGroupCompletedBoxes === totalGroupBoxes;
      const isGroupConfirmed = shippers.every(s => s.isConfirmed);
      const isFinalCompletion = isCbmCompleted && isGroupConfirmed;

      const groupHeaderText = `고유넘버: ${name} (Total ${totalGroupBoxes} Box)`;

      const cardBorderColor = isFinalCompletion ? "border-green-500" : isCbmCompleted ? "border-blue-500" : "border-black";

      return (
        <Card key={name} className={cn("mb-6 overflow-hidden border-2", cardBorderColor)}>
          <div className="bg-muted px-4 py-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div className='flex items-center gap-4 flex-wrap'>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`confirm-${name}`}
                    checked={isGroupConfirmed}
                    onCheckedChange={() => handleToggleConfirmation(shippers.map(s => s.id), isGroupConfirmed)}
                    aria-label="그룹 확인 완료"
                  />
                  <h3 className="font-extrabold text-xl text-foreground">{groupHeaderText}</h3>
                </div>
                {isCbmCompleted && (
                  <span className={cn("font-bold px-2 py-1 rounded text-xs", isFinalCompletion ? "bg-green-600 text-white" : "bg-blue-500 text-white")}>
                    {isFinalCompletion ? "최종 완료" : "CBM 완료"}
                  </span>
                )}
                {representativeRegion && <p className="font-bold text-primary text-md">{representativeRegion}</p>}
              </div>
              <Button onClick={() => setGroupToView(group)} variant="ghost" size="icon" aria-label="그룹 상세 보기">
                <Eye className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="space-y-4 p-4">
            {shippers.map(shipper => {
              const representativeImage = shipper.imageUrl || shipper.representativeBoxImageUrl;
              const progress = shipper.boxes.length > 0 ? (shipper.completedBoxes / shipper.boxes.length) * 100 : 0;
              return (
                <div key={shipper.id} className={cn("bg-card p-4 rounded-lg shadow-md border flex flex-col sm:flex-row items-start gap-4 relative", shipper.isUrgent && "border-destructive border-2")}>

                  {shipper.isUrgent && (
                    <div className="absolute -top-3 -left-3 bg-destructive text-destructive-foreground rounded-full p-1.5 z-10">
                      <Flame className="w-5 h-5" />
                    </div>
                  )}

                  {representativeImage ? (
                    <Image src={representativeImage} alt={shipper.nameKr} width={80} height={80} className="w-20 h-20 object-cover rounded-md flex-shrink-0 bg-muted" data-ai-hint="package" />
                  ) : (
                    <div className="w-20 h-20 rounded-md flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}

                  <div className="flex-grow">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-grow">
                        <p className="font-extrabold text-foreground text-xl">{shipper.nameKr} / {shipper.nameEn}</p>
                      </div>
                      <div className="flex items-center justify-center gap-0 flex-shrink-0">
                        <Button onClick={() => handleToggleUrgent(shipper.id, !!shipper.isUrgent)} variant="ghost" size="icon" className={cn(shipper.isUrgent && "text-destructive hover:text-destructive")} aria-label="긴급 지정">
                          <Flame className="w-5 h-5" />
                        </Button>
                        <Button onClick={() => setShipperToEdit(shipper)} variant="ghost" size="icon" aria-label="수정하기">
                          <FilePenLine className="w-5 h-5" />
                        </Button>
                        <Button onClick={() => setShipperToDelete(shipper)} variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="삭제하기">
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-base text-muted-foreground mt-2 space-y-1 text-left">
                      <p><span className="font-bold text-foreground">특징:</span> {shipper.boxFeature1 || '-'}</p>
                      <p><span className="font-bold text-foreground">송장:</span> {shipper.invoiceNumber || '-'}</p>
                      <p className="font-bold text-primary"><span className="font-bold text-foreground">총 CBM:</span> {shipper.totalCbm.toFixed(4)} m³</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">{shipper.completedBoxes} / {shipper.boxes.length}</span>
                      <Progress value={progress} className="h-2 flex-grow" />
                    </div>

                    {/* ⭐ 입고 확인 및 인보이스 버튼 영역 */}
                    <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
                      {/* 입고 확인 토글 */}
                      <Button
                        variant={shipper.isArrived ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleToggleArrived(shipper.id, !!shipper.isArrived)}
                        className={cn(
                          shipper.isArrived && "bg-emerald-600 hover:bg-emerald-700"
                        )}
                      >
                        <PackageCheck className="w-4 h-4 mr-1" />
                        {shipper.isArrived ? "입고 완료" : "입고 확인"}
                      </Button>

                      {/* CBM 측정 완료 시 인보이스 생성 버튼 표시 */}
                      {progress === 100 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateInvoice(shipper)}
                          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          인보이스 생성
                        </Button>
                      )}

                      {/* CBM 완료 후 결제 확인 버튼 */}
                      {progress === 100 && (
                        <Button
                          variant={shipper.isPaid ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTogglePaid(shipper.id, !!shipper.isPaid)}
                          className={cn(
                            shipper.isPaid && "bg-amber-500 hover:bg-amber-600"
                          )}
                        >
                          <Banknote className="w-4 h-4 mr-1" />
                          {shipper.isPaid ? "결제 완료" : "결제 확인"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )
    });
  };

  return (
    <main className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-between items-center">
          <h2 className="text-xl font-bold font-headline text-foreground sm:text-2xl">
            관리자 대시보드
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsNewShipperModalOpen(true)}>
              <PlusCircle />
              신규 화주 등록
            </Button>
            <Button onClick={() => setIsBulkImportModalOpen(true)} className="bg-green-600 hover:bg-green-700">
              <ClipboardList />
              엑셀/시트 붙여넣기
            </Button>
            <Button onClick={handleExportExcel} variant="secondary" disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download />}
              엑셀로 내보내기
            </Button>
            <Button onClick={() => setIsBulkDeleteModalOpen(true)} variant="destructive">
              <Trash2 />
              일괄 삭제
            </Button>

            {/* ERP 관리 드롭다운 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700">
                  <Settings className="w-4 h-4 mr-2" />
                  ERP 관리
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-purple-600">ERP 시스템</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/admin/customers')} className="cursor-pointer">
                  <Users className="w-4 h-4 mr-2" />
                  고객 DB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/admin/voyages')} className="cursor-pointer">
                  <Ship className="w-4 h-4 mr-2" />
                  항차 관리
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/admin/invoice')} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2" />
                  인보이스
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-6">
          <StatsCards shippers={shippers} isLoading={isLoading} error={error} />
        </div>

        {/* 🆕 활성 항차 선택 (ERP 연동) */}
        <Card className="mb-6 p-4 border-2 border-primary/30 bg-primary/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Ship className="w-6 h-6 text-primary" />
              <div>
                <h3 className="font-bold text-lg">활성 항차</h3>
                <p className="text-sm text-muted-foreground">
                  {activeVoyage ? `${activeVoyage.name} (${activeVoyage.status})` : '항차를 선택하세요'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={activeVoyageId || ''} onValueChange={(v) => setActiveVoyageId(v)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="항차 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {voyagesLoading ? (
                    <SelectItem value="loading" disabled>로딩 중...</SelectItem>
                  ) : voyages.length === 0 ? (
                    <SelectItem value="none" disabled>등록된 항차 없음</SelectItem>
                  ) : (
                    voyages.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.status})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {activeVoyageId && (
                <>
                  <Button
                    onClick={() => router.push(`/admin/voyages/${encodeURIComponent(activeVoyageId)}`)}
                    variant="outline"
                    size="sm"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    상세
                  </Button>
                  <Button
                    onClick={() => router.push('/worker/cbm')}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    <PackageCheck className="w-4 h-4 mr-1" />
                    CBM 측정
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <div className="p-4 bg-muted/80 rounded-lg border">
          <div className="text-sm text-muted-foreground mb-4 p-2 bg-background/70 rounded-md">
            <p><span className="font-bold text-foreground">정렬 순서 (내림차순):</span> 1. CBM 완료 (파랑) → 2. 진행 중 (검정) → 3. 최종 완료 (초록)</p>
            <p>하위 정렬 기준은 아래 옵션을 따릅니다.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="화주, 고유넘버, 특징, 초성(ㅇㅎㅁ) 등으로 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-12 text-base pl-12 rounded-lg border-2 border-border focus:border-primary bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sort-select" className="text-base font-medium text-foreground shrink-0">하위 정렬:</Label>
              <Select value={sortKey} onValueChange={(value) => handleSortKeyChange(value as SortKey)}>
                <SelectTrigger id="sort-select" className="w-full h-12 text-base rounded-lg border-2 border-border focus:border-primary bg-background">
                  <SelectValue placeholder="정렬 기준" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">진행상황</SelectItem>
                  <SelectItem value="boxCount">박스 수량</SelectItem>
                  <SelectItem value="nameKr">이름순</SelectItem>
                  <SelectItem value="region">지역명</SelectItem>
                  <SelectItem value="isUrgent">긴급순</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleToggleSortDirection} variant="ghost" className="h-12 w-12 border-2 border-border bg-background hover:bg-accent/20">
                {sortDirection === 'desc' ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
                <span className="sr-only">Sort direction</span>
              </Button>
            </div>

            {/* 지역 필터 */}
            {uniqueRegions.length > 0 && (
              <div className="flex items-center gap-2 mt-4 sm:mt-0 sm:ml-4">
                <Label htmlFor="region-filter" className="text-base font-medium text-foreground shrink-0 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  지역:
                </Label>
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger id="region-filter" className="w-40 h-12 text-base rounded-lg border-2 border-border focus:border-primary bg-background">
                    <SelectValue placeholder="지역 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {uniqueRegions.map(region => (
                      <SelectItem key={region} value={region}>{region}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

      </div>

      {isNewShipperModalOpen && (
        <NewShipperForm
          isOpen={isNewShipperModalOpen}
          onClose={handleModalClose}
        />
      )}

      {isBulkImportModalOpen && (
        <BulkImportModal
          isOpen={isBulkImportModalOpen}
          onClose={handleModalClose}
        />
      )}

      {isBulkDeleteModalOpen && (
        <BulkDeleteModal
          isOpen={isBulkDeleteModalOpen}
          onClose={handleModalClose}
          shippers={shippers}
          onDeleteSelected={handleDeleteSelectedShippers}
          onDeleteAll={handleDeleteAllData}
        />
      )}

      {selectedShipper && (
        <ShipperDetailsModal
          shipper={selectedShipper}
          isOpen={!!selectedShipper}
          onClose={() => setSelectedShipper(null)}
        />
      )}

      {groupToView && (
        <GroupDetailsModal
          group={groupToView}
          isOpen={!!groupToView}
          onClose={() => setGroupToView(null)}
        />
      )}

      {shipperToEdit && (
        <EditShipperModal
          shipper={shipperToEdit}
          isOpen={!!shipperToEdit}
          onClose={() => setShipperToEdit(null)}
        />
      )}

      {shipperToDelete && (
        <AlertDialog open={!!shipperToDelete} onOpenChange={() => setShipperToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                '{shipperToDelete.nameKr}' 화주와 관련된 모든 데이터(박스, 이미지 등)가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>아니요</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteShipper}>예, 삭제합니다</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div className="relative">
        {renderContent()}
      </div>
    </main>
  );
}

"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Ship, Plus, Calendar, Package, DollarSign,
    ChevronRight, Loader2, Search, Filter, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Voyage, VoyageStatus } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
// Firestore 연동
import { useVoyages } from '@/hooks/use-erp-data';
import { createVoyage, deleteVoyage } from '@/lib/firestore-service';
import { isFirebaseConfigured } from '@/lib/firebase';

// 상태별 스타일
const STATUS_STYLES: Record<VoyageStatus, { bg: string; text: string; label: string }> = {
    READY: { bg: 'bg-blue-100', text: 'text-blue-700', label: '준비 중' },
    CLOSING: { bg: 'bg-orange-100', text: 'text-orange-700', label: '마감 임박' },
    CLOSED: { bg: 'bg-red-100', text: 'text-red-700', label: '마감 완료' },
    SAILING: { bg: 'bg-purple-100', text: 'text-purple-700', label: '운항 중' },
    ARRIVED: { bg: 'bg-green-100', text: 'text-green-700', label: '도착 완료' },
};

// 샘플 데이터 (개발용)
const SAMPLE_VOYAGES: Voyage[] = [
    {
        id: '2025-12-01-1',
        name: '2025-12-01 1차',
        status: 'READY',
        departureDate: { seconds: new Date('2025-12-15').getTime() / 1000, nanoseconds: 0 },
        cutoffDate: { seconds: new Date('2025-12-10').getTime() / 1000, nanoseconds: 0 },
        totalShipments: 23,
        totalCbm: 45.6,
        totalAmount: 5928,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
    {
        id: '2025-11-15-2',
        name: '2025-11-15 2차',
        status: 'SAILING',
        departureDate: { seconds: new Date('2025-11-28').getTime() / 1000, nanoseconds: 0 },
        cutoffDate: { seconds: new Date('2025-11-23').getTime() / 1000, nanoseconds: 0 },
        totalShipments: 31,
        totalCbm: 67.2,
        totalAmount: 8736,
        createdAt: { seconds: Date.now() / 1000 - 86400 * 15, nanoseconds: 0 },
    },
    {
        id: '2025-11-01-1',
        name: '2025-11-01 1차',
        status: 'ARRIVED',
        departureDate: { seconds: new Date('2025-11-15').getTime() / 1000, nanoseconds: 0 },
        arrivalDate: { seconds: new Date('2025-11-25').getTime() / 1000, nanoseconds: 0 },
        cutoffDate: { seconds: new Date('2025-11-10').getTime() / 1000, nanoseconds: 0 },
        totalShipments: 28,
        totalCbm: 52.3,
        totalAmount: 6799,
        createdAt: { seconds: Date.now() / 1000 - 86400 * 30, nanoseconds: 0 },
    },
];

// Voyage 카드 컴포넌트
const VoyageCard = ({ voyage, onDelete }: { voyage: Voyage; onDelete?: (voyage: Voyage) => void }) => {
    const status = STATUS_STYLES[voyage.status];
    const departureDate = new Date(voyage.departureDate.seconds * 1000);
    const cutoffDate = new Date(voyage.cutoffDate.seconds * 1000);

    return (
        <Card className="hover:shadow-lg transition-all cursor-pointer group relative">
            {/* 삭제 버튼 */}
            {onDelete && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 z-10"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(voyage);
                    }}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            )}

            <Link href={`/admin/voyages/${voyage.id}`}>
                <CardContent className="p-5">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-full bg-primary/10">
                                <Ship className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{voyage.name}</h3>
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full font-medium",
                                    status.bg, status.text
                                )}>
                                    {status.label}
                                </span>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>

                    {/* 날짜 정보 */}
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>마감: {cutoffDate.toLocaleDateString('ko-KR')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>출항: {departureDate.toLocaleDateString('ko-KR')}</span>
                        </div>
                    </div>

                    {/* 통계 */}
                    <div className="grid grid-cols-3 gap-2 pt-4 border-t">
                        <div className="text-center">
                            <p className="text-lg font-bold text-primary">{voyage.totalShipments}</p>
                            <p className="text-xs text-muted-foreground">화물 건수</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-primary">{voyage.totalCbm.toFixed(1)}</p>
                            <p className="text-xs text-muted-foreground">총 CBM</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-primary">${voyage.totalAmount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">예상 금액</p>
                        </div>
                    </div>
                </CardContent>
            </Link>
        </Card>
    );
};

// 새 항차 생성 모달
const NewVoyageModal = ({
    isOpen,
    onClose,
    onCreate,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: any) => void;
}) => {
    const [formData, setFormData] = useState({
        cutoffDate: '',    // 마감일 (먼저 입력)
        name: '',          // 항차명
        voyageNumber: '1', // 차수
        departureDate: '', // 출항일 (마감일 + 5일 자동 계산)
    });

    // 마감일 변경 시 자동 항차명 및 출항일 생성
    const handleCutoffDateChange = (date: string) => {
        if (!date) {
            setFormData(prev => ({ ...prev, cutoffDate: date }));
            return;
        }

        // 출항일 = 마감일 + 5일 (기본값)
        const cutoff = new Date(date);
        const departure = new Date(cutoff);
        departure.setDate(departure.getDate() + 5);
        const departureStr = departure.toISOString().split('T')[0];

        // 자동 항차명 생성: YYYY-MM-DD N차
        const autoName = `${date} ${formData.voyageNumber}차`;

        setFormData(prev => ({
            ...prev,
            cutoffDate: date,
            departureDate: departureStr,
            name: autoName,
        }));
    };

    // 차수 변경 시 항차명 업데이트
    const handleVoyageNumberChange = (num: string) => {
        setFormData(prev => ({
            ...prev,
            voyageNumber: num,
            name: prev.cutoffDate ? `${prev.cutoffDate} ${num}차` : prev.name,
        }));
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.departureDate || !formData.cutoffDate) return;
        onCreate({
            name: formData.name,
            departureDate: formData.departureDate,
            cutoffDate: formData.cutoffDate,
        });
        setFormData({ cutoffDate: '', name: '', voyageNumber: '1', departureDate: '' });
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Ship className="w-5 h-5" />
                        새 항차 생성
                    </DialogTitle>
                    <DialogDescription>
                        새로운 선적 일정을 등록합니다. 마감일을 먼저 선택하세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 1. 입고 마감일 (먼저 입력) */}
                    <div>
                        <Label htmlFor="cutoffDate" className="text-base font-semibold">
                            ① 입고 마감일 *
                        </Label>
                        <Input
                            id="cutoffDate"
                            type="date"
                            value={formData.cutoffDate}
                            onChange={(e) => handleCutoffDateChange(e.target.value)}
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            화물 입고 마감 날짜를 선택하세요
                        </p>
                    </div>

                    {/* 2. 항차명 (자동 생성, 수정 가능) */}
                    <div>
                        <Label htmlFor="name" className="text-base font-semibold">
                            ② 항차명 *
                        </Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="2025-12-01 1차"
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            마감일 선택 시 자동 생성됩니다
                        </p>
                    </div>

                    {/* 3. 차수 */}
                    <div>
                        <Label htmlFor="voyageNumber" className="text-base font-semibold">
                            ③ 차수
                        </Label>
                        <Input
                            id="voyageNumber"
                            value={formData.voyageNumber}
                            onChange={(e) => handleVoyageNumberChange(e.target.value)}
                            placeholder="1"
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            항차 번호를 입력하세요 (예: 1, 2, 3...)
                        </p>
                    </div>

                    {/* 출항일 (자동 계산, 읽기 전용 표시) */}
                    {formData.departureDate && (
                        <div className="p-3 bg-muted rounded-md">
                            <p className="text-sm text-muted-foreground">
                                <span className="font-medium">출항 예정일:</span> {formData.departureDate}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                (마감일 + 5일 기준)
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!formData.name || !formData.departureDate || !formData.cutoffDate}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        생성
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function VoyagesPage() {
    const { toast } = useToast();

    // Firestore 항차 데이터 (실시간 구독)
    const { voyages: firestoreVoyages, loading: voyagesLoading } = useVoyages();

    // 샘플 데이터 (Firebase 미설정 시 Fallback)
    const [localVoyages, setLocalVoyages] = useState<Voyage[]>(SAMPLE_VOYAGES);

    // 실제 사용할 항차 목록
    // Firebase가 구성되어 있으면 항상 Firestore 데이터 사용 (빈 배열이어도)
    const voyages = isFirebaseConfigured
        ? firestoreVoyages
        : localVoyages;

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'ARRIVED'>('ALL');
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [voyageToDelete, setVoyageToDelete] = useState<Voyage | null>(null);

    // 필터링된 항차 목록 (준비중 = READY/CLOSING/CLOSED/SAILING, 완료 = ARRIVED)
    const filteredVoyages = useMemo(() => {
        return voyages.filter(v => {
            const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase());
            let matchesStatus = true;
            if (statusFilter === 'READY') {
                // 준비중 = ARRIVED 이외 모두
                matchesStatus = v.status !== 'ARRIVED';
            } else if (statusFilter === 'ARRIVED') {
                matchesStatus = v.status === 'ARRIVED';
            }
            return matchesSearch && matchesStatus;
        });
    }, [voyages, searchTerm, statusFilter]);

    // 새 항차 생성 (Firestore 연동)
    const handleCreateVoyage = async (data: any) => {
        setIsCreating(true);
        console.log('[createVoyage] Input data:', data);
        console.log('[createVoyage] isFirebaseConfigured:', isFirebaseConfigured);

        try {
            const newVoyage: Omit<Voyage, 'id' | 'createdAt' | 'totalShipments' | 'totalCbm' | 'totalAmount'> = {
                name: data.name,
                status: 'READY',
                departureDate: { seconds: new Date(data.departureDate).getTime() / 1000, nanoseconds: 0 },
                cutoffDate: { seconds: new Date(data.cutoffDate).getTime() / 1000, nanoseconds: 0 },
            };

            console.log('[createVoyage] Prepared voyage:', newVoyage);

            if (isFirebaseConfigured) {
                const voyageId = await createVoyage(newVoyage);
                console.log('[createVoyage] Firestore created ID:', voyageId);
                toast({ title: "✅ 생성 완료", description: `${data.name} 항차가 생성되었습니다.` });
            } else {
                // 로컬 Fallback
                const localNewVoyage: Voyage = {
                    id: `voyage-${Date.now()}`,
                    ...newVoyage,
                    totalShipments: 0,
                    totalCbm: 0,
                    totalAmount: 0,
                    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
                };
                setLocalVoyages(prev => [localNewVoyage, ...prev]);
                toast({ title: "✅ 생성 완료 (Demo)", description: `${data.name} 항차가 생성되었습니다.` });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            console.error('[createVoyage] Error:', error);
            toast({
                variant: "destructive",
                title: "❌ 생성 실패",
                description: errorMessage
            });
        } finally {
            setIsCreating(false);
        }
    };

    // 항차 삭제 핸들러
    const handleDeleteVoyage = async () => {
        if (!voyageToDelete) return;

        try {
            if (isFirebaseConfigured) {
                await deleteVoyage(voyageToDelete.id);
                toast({ title: "삭제 완료", description: `${voyageToDelete.name} 항차가 삭제되었습니다.` });
            } else {
                setLocalVoyages(prev => prev.filter(v => v.id !== voyageToDelete.id));
                toast({ title: "삭제 완료 (Demo)", description: `${voyageToDelete.name} 항차가 삭제되었습니다.` });
            }
        } catch (error) {
            console.error('[deleteVoyage] Error:', error);
            toast({ variant: "destructive", title: "삭제 실패" });
        }
        setVoyageToDelete(null);
    };

    return (
        <div className="p-6 space-y-6">
            {/* 헤더 */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Ship className="w-6 h-6 text-primary" />
                        항차 관리
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        총 {voyages.length}개 항차
                    </p>
                </div>
                <Button onClick={() => setIsNewModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    새 항차 생성
                </Button>
            </div>

            {/* 필터 */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="항차명 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    <Button
                        variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('ALL')}
                    >
                        전체
                    </Button>
                    <Button
                        variant={statusFilter === 'READY' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('READY')}
                        className={statusFilter === 'READY' ? '' : 'text-blue-600'}
                    >
                        준비중
                    </Button>
                    <Button
                        variant={statusFilter === 'ARRIVED' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('ARRIVED')}
                        className={statusFilter === 'ARRIVED' ? '' : 'text-green-600'}
                    >
                        완료
                    </Button>
                </div>
            </div>

            {/* 항차 목록 */}
            {filteredVoyages.length === 0 ? (
                <Card className="p-12 text-center">
                    <Ship className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg">
                        {searchTerm || statusFilter !== 'ALL' ? '검색 결과가 없습니다' : '등록된 항차가 없습니다'}
                    </h3>
                    <p className="text-muted-foreground mt-2">
                        {searchTerm || statusFilter !== 'ALL'
                            ? '다른 검색어나 필터를 시도해보세요.'
                            : '새 항차를 생성해주세요.'}
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVoyages.map(voyage => (
                        <VoyageCard
                            key={voyage.id}
                            voyage={voyage}
                            onDelete={(v) => setVoyageToDelete(v)}
                        />
                    ))}
                </div>
            )}

            {/* 새 항차 모달 */}
            <NewVoyageModal
                isOpen={isNewModalOpen}
                onClose={() => setIsNewModalOpen(false)}
                onCreate={handleCreateVoyage}
            />

            {/* 항차 삭제 확인 다이얼로그 */}
            <AlertDialog open={!!voyageToDelete} onOpenChange={() => setVoyageToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>항차를 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            '{voyageToDelete?.name}' 항차가 삭제됩니다.
                            <span className="block mt-2 text-red-500 font-medium">
                                이 항차에 등록된 화물 데이터는 별도로 남아있습니다.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteVoyage}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

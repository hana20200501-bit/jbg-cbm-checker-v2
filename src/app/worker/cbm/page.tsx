"use client";

/**
 * 항차별 CBM 측정 작업자 페이지
 * 
 * 📌 기능:
 * - 활성 항차 선택
 * - 해당 항차의 화물 목록 표시
 * - CBM 측정 입력
 * - Shipment 상태 업데이트
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Ship, Package, Search, Calculator, CheckCircle2,
    Loader2, AlertCircle, ChevronRight, Ruler
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Voyage, Shipment, ShipmentStatus } from '@/types';
import { useVoyages, useShipments } from '@/hooks/use-erp-data';
import { updateShipmentCbm } from '@/lib/firestore-service';
import { isFirebaseConfigured } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// 상태별 스타일
const STATUS_STYLES: Record<ShipmentStatus, { bg: string; text: string; label: string }> = {
    PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: '대기' },
    CBM_DONE: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'CBM 완료' },
    INVOICED: { bg: 'bg-purple-100', text: 'text-purple-700', label: '청구됨' },
    PAID: { bg: 'bg-green-100', text: 'text-green-700', label: '결제완료' },
    DELIVERED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '배송완료' },
    CANCELLED: { bg: 'bg-red-100', text: 'text-red-700', label: '취소' },
};

// 샘플 데이터 (Firestore 미설정 시 Fallback)
const SAMPLE_VOYAGES: Voyage[] = [
    {
        id: '2025-12-01-1',
        name: '2025-12-01 1차',
        status: 'READY',
        departureDate: { seconds: new Date('2025-12-15').getTime() / 1000, nanoseconds: 0 },
        cutoffDate: { seconds: new Date('2025-12-10').getTime() / 1000, nanoseconds: 0 },
        totalShipments: 5,
        totalCbm: 0,
        totalAmount: 0,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
];

const SAMPLE_SHIPMENTS: Shipment[] = [
    {
        id: 'ship-1',
        voyageId: '2025-12-01-1',
        customerId: '고관영',
        customerName: '고관영',
        customerPodCode: 1,
        items: [],
        subtotal: 0,
        discountPercent: 0,
        discountAmount: 0,
        shippingFee: 0,
        packingFee: 0,
        customsFee: 0,
        otherFee: 0,
        totalAmount: 0,
        currency: 'USD',
        isPaid: false,
        status: 'PENDING',
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
    {
        id: 'ship-2',
        voyageId: '2025-12-01-1',
        customerId: '명랑방콕(BKK)',
        customerName: '명랑방콕(BKK)',
        customerPodCode: 2,
        items: [],
        subtotal: 0,
        discountPercent: 10,
        discountAmount: 0,
        shippingFee: 0,
        packingFee: 0,
        customsFee: 0,
        otherFee: 0,
        totalAmount: 0,
        currency: 'USD',
        isPaid: false,
        status: 'PENDING',
        memo: '단골 10%',
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
];

// CBM 측정 모달
const CbmMeasureModal = ({
    isOpen,
    onClose,
    shipment,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    shipment: Shipment | null;
    onSave: (shipmentId: string, cbm: number) => void;
}) => {
    const [length, setLength] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [quantity, setQuantity] = useState('1');

    const cbm = useMemo(() => {
        const l = parseFloat(length) / 100 || 0; // cm → m
        const w = parseFloat(width) / 100 || 0;
        const h = parseFloat(height) / 100 || 0;
        const q = parseInt(quantity) || 1;
        return (l * w * h * q);
    }, [length, width, height, quantity]);

    const handleSave = () => {
        if (!shipment || cbm <= 0) return;
        onSave(shipment.id, cbm);
        setLength('');
        setWidth('');
        setHeight('');
        setQuantity('1');
        onClose();
    };

    if (!shipment) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Ruler className="w-5 h-5" />
                        CBM 측정 - {shipment.customerName}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs text-muted-foreground">가로 (cm)</label>
                            <Input
                                type="number"
                                value={length}
                                onChange={(e) => setLength(e.target.value)}
                                placeholder="100"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">세로 (cm)</label>
                            <Input
                                type="number"
                                value={width}
                                onChange={(e) => setWidth(e.target.value)}
                                placeholder="60"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">높이 (cm)</label>
                            <Input
                                type="number"
                                value={height}
                                onChange={(e) => setHeight(e.target.value)}
                                placeholder="50"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground">박스 수량</label>
                        <Input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="1"
                        />
                    </div>

                    <div className="bg-primary/10 rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground">계산된 CBM</p>
                        <p className="text-3xl font-bold text-primary">{cbm.toFixed(4)} m³</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button onClick={handleSave} disabled={cbm <= 0}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        저장
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function WorkerCbmPage() {
    const { toast } = useToast();

    // Firestore 데이터
    const { voyages: firestoreVoyages, loading: voyagesLoading } = useVoyages(['READY', 'CLOSING', 'CLOSED']);

    // 실제 사용할 항차 목록
    const voyages = isFirebaseConfigured && firestoreVoyages.length > 0
        ? firestoreVoyages
        : SAMPLE_VOYAGES;

    // 선택된 항차
    const [selectedVoyageId, setSelectedVoyageId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // 화물 데이터
    const { shipments: firestoreShipments, loading: shipmentsLoading } = useShipments(selectedVoyageId);
    const [localShipments, setLocalShipments] = useState<Shipment[]>(SAMPLE_SHIPMENTS);

    const shipments = isFirebaseConfigured && firestoreShipments.length > 0
        ? firestoreShipments
        : localShipments.filter(s => s.voyageId === selectedVoyageId);

    // CBM 모달
    const [measureModal, setMeasureModal] = useState<{ isOpen: boolean; shipment: Shipment | null }>({
        isOpen: false,
        shipment: null,
    });

    // 필터링된 화물
    const filteredShipments = useMemo(() => {
        if (!searchTerm.trim()) return shipments;
        const term = searchTerm.toLowerCase();
        return shipments.filter(s =>
            s.customerName.toLowerCase().includes(term) ||
            s.customerPodCode?.toString().includes(term)
        );
    }, [shipments, searchTerm]);

    // CBM 저장
    const handleSaveCbm = async (shipmentId: string, cbm: number) => {
        try {
            if (isFirebaseConfigured && selectedVoyageId) {
                await updateShipmentCbm(selectedVoyageId, shipmentId, cbm, []);
                toast({ title: "CBM 저장 완료", description: `${cbm.toFixed(4)} m³` });
            } else {
                // 로컬 업데이트
                setLocalShipments(prev => prev.map(s =>
                    s.id === shipmentId ? { ...s, totalCbm: cbm, status: 'CBM_DONE' as ShipmentStatus } : s
                ));
                toast({ title: "CBM 저장 완료 (Demo)", description: `${cbm.toFixed(4)} m³` });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "저장 실패" });
        }
    };

    // 통계
    const stats = useMemo(() => ({
        total: shipments.length,
        pending: shipments.filter(s => s.status === 'PENDING').length,
        done: shipments.filter(s => s.status === 'CBM_DONE' || s.status === 'INVOICED').length,
        totalCbm: shipments.reduce((sum, s) => sum + (s.totalCbm || 0), 0),
    }), [shipments]);

    // 항차 미선택 시
    if (!selectedVoyageId) {
        return (
            <div className="p-4 space-y-4 max-w-lg mx-auto">
                <div className="text-center py-8">
                    <Ship className="w-12 h-12 mx-auto text-primary mb-4" />
                    <h1 className="text-2xl font-bold">CBM 측정</h1>
                    <p className="text-muted-foreground">작업할 항차를 선택하세요</p>
                </div>

                {voyagesLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {voyages.map(voyage => (
                            <Card
                                key={voyage.id}
                                className="cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => setSelectedVoyageId(voyage.id)}
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Ship className="w-5 h-5 text-primary" />
                                        <div>
                                            <p className="font-semibold">{voyage.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {voyage.totalShipments}건 / {voyage.totalCbm.toFixed(2)} CBM
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const selectedVoyage = voyages.find(v => v.id === selectedVoyageId);

    return (
        <div className="p-4 space-y-4 max-w-lg mx-auto">
            {/* 헤더 */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setSelectedVoyageId(null)}>
                    ← 뒤로
                </Button>
                <div>
                    <h1 className="font-bold">{selectedVoyage?.name}</h1>
                    <p className="text-sm text-muted-foreground">CBM 측정</p>
                </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-4 gap-2">
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">전체</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
                    <p className="text-xs text-muted-foreground">대기</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{stats.done}</p>
                    <p className="text-xs text-muted-foreground">완료</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{stats.totalCbm.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">CBM</p>
                </Card>
            </div>

            {/* 검색 */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="고객명 또는 POD로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* 화물 목록 */}
            {shipmentsLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : filteredShipments.length === 0 ? (
                <Card className="p-8 text-center">
                    <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">화물이 없습니다</p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filteredShipments.map(shipment => {
                        const statusStyle = STATUS_STYLES[shipment.status];
                        return (
                            <Card
                                key={shipment.id}
                                className={cn(
                                    "cursor-pointer hover:shadow-md transition-shadow",
                                    shipment.status === 'PENDING' ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-green-400'
                                )}
                                onClick={() => setMeasureModal({ isOpen: true, shipment })}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                <span className="font-bold text-primary">
                                                    {shipment.customerPodCode || '?'}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-semibold">{shipment.customerName}</p>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Badge className={cn("text-xs", statusStyle.bg, statusStyle.text)}>
                                                        {statusStyle.label}
                                                    </Badge>
                                                    {shipment.memo && (
                                                        <span className="text-xs">{shipment.memo}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {shipment.totalCbm ? (
                                                <p className="text-lg font-bold text-primary">
                                                    {shipment.totalCbm.toFixed(2)} <span className="text-xs">CBM</span>
                                                </p>
                                            ) : (
                                                <Button size="sm" variant="outline">
                                                    <Calculator className="w-4 h-4 mr-1" />
                                                    측정
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* CBM 측정 모달 */}
            <CbmMeasureModal
                isOpen={measureModal.isOpen}
                onClose={() => setMeasureModal({ isOpen: false, shipment: null })}
                shipment={measureModal.shipment}
                onSave={handleSaveCbm}
            />
        </div>
    );
}

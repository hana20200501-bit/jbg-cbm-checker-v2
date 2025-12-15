"use client";

/**
 * 📌 Manual Adjustment UI Component
 * 
 * 수동 할인/추가 비용 관리 UI
 * 
 * 🎯 기능:
 * - 할인/추가 비용 추가
 * - 기존 조정 목록 표시
 * - 조정 삭제 (확인 포함)
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Plus, Minus, Trash2, DollarSign, AlertTriangle,
    Gift, Percent, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ManualAdjustment, PricingLayer } from '@/types';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// =============================================================================
// 조정 유형 설정
// =============================================================================

const ADJUSTMENT_TYPES: Record<ManualAdjustment['type'], {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    defaultSign: 'positive' | 'negative';
}> = {
    DAMAGE_DISCOUNT: {
        label: '손상 할인',
        icon: AlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        defaultSign: 'negative',
    },
    VIP_DISCOUNT: {
        label: 'VIP 할인',
        icon: Gift,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        defaultSign: 'negative',
    },
    SPECIAL_FEE: {
        label: '특별 비용',
        icon: DollarSign,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        defaultSign: 'positive',
    },
    PENALTY: {
        label: '패널티',
        icon: AlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        defaultSign: 'positive',
    },
    OTHER: {
        label: '기타',
        icon: Percent,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        defaultSign: 'negative',
    },
};

// =============================================================================
// Props
// =============================================================================

interface ManualAdjustmentPanelProps {
    pricing: PricingLayer;
    onAddAdjustment: (adjustment: Omit<ManualAdjustment, 'id' | 'createdAt'>) => void;
    onRemoveAdjustment: (adjustmentId: string) => void;
    disabled?: boolean;
}

// =============================================================================
// 조정 추가 모달
// =============================================================================

const AddAdjustmentModal = ({
    isOpen,
    onClose,
    onAdd,
}: {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (adjustment: Omit<ManualAdjustment, 'id' | 'createdAt'>) => void;
}) => {
    const [type, setType] = useState<ManualAdjustment['type']>('DAMAGE_DISCOUNT');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount === 0) return;

        const config = ADJUSTMENT_TYPES[type];
        const finalAmount = config.defaultSign === 'negative'
            ? -Math.abs(numAmount)
            : Math.abs(numAmount);

        onAdd({
            type,
            amount: finalAmount,
            reason: reason || config.label,
            createdBy: 'admin', // TODO: 실제 사용자 ID
        });

        // 초기화
        setType('DAMAGE_DISCOUNT');
        setAmount('');
        setReason('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>수동 조정 추가</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <Label>조정 유형</Label>
                        <Select
                            value={type}
                            onValueChange={(v) => setType(v as ManualAdjustment['type'])}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(ADJUSTMENT_TYPES).map(([key, config]) => (
                                    <SelectItem key={key} value={key}>
                                        <div className="flex items-center gap-2">
                                            <config.icon className="w-4 h-4" />
                                            {config.label}
                                            {config.defaultSign === 'negative' ? ' (-)' : ' (+)'}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>금액 (USD)</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="50"
                                className="pl-9"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {ADJUSTMENT_TYPES[type].defaultSign === 'negative'
                                ? '할인 금액 (자동으로 음수 처리)'
                                : '추가 금액 (자동으로 양수 처리)'}
                        </p>
                    </div>

                    <div>
                        <Label>사유</Label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={ADJUSTMENT_TYPES[type].label}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!amount || parseFloat(amount) === 0}
                    >
                        추가
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =============================================================================
// 메인 컴포넌트
// =============================================================================

export function ManualAdjustmentPanel({
    pricing,
    onAddAdjustment,
    onRemoveAdjustment,
    disabled = false,
}: ManualAdjustmentPanelProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">수동 조정</CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsModalOpen(true)}
                        disabled={disabled}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        추가
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {pricing.manualAdjustments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        수동 조정 없음
                    </p>
                ) : (
                    <>
                        {pricing.manualAdjustments.map((adj) => {
                            const config = ADJUSTMENT_TYPES[adj.type];
                            const Icon = config.icon;

                            return (
                                <div
                                    key={adj.id}
                                    className={cn(
                                        "flex items-center justify-between p-2 rounded-lg",
                                        config.bgColor
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className={cn("w-4 h-4", config.color)} />
                                        <div>
                                            <p className="text-sm font-medium">{adj.reason}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {adj.createdBy}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "font-bold",
                                            adj.amount < 0 ? "text-green-600" : "text-red-600"
                                        )}>
                                            {adj.amount < 0 ? '-' : '+'}${Math.abs(adj.amount)}
                                        </span>
                                        {!disabled && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                onClick={() => onRemoveAdjustment(adj.id)}
                                            >
                                                <X className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* 합계 */}
                        <div className="pt-2 border-t flex justify-between items-center">
                            <span className="text-sm font-medium">수동 조정 합계</span>
                            <span className={cn(
                                "font-bold",
                                pricing.manualTotal < 0 ? "text-green-600" : "text-red-600"
                            )}>
                                {pricing.manualTotal < 0 ? '-' : '+'}${Math.abs(pricing.manualTotal)}
                            </span>
                        </div>
                    </>
                )}
            </CardContent>

            {/* 조정 추가 모달 */}
            <AddAdjustmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={onAddAdjustment}
            />
        </Card>
    );
}

// =============================================================================
// 가격 요약 카드
// =============================================================================

interface PricingSummaryProps {
    pricing: PricingLayer;
    customerName?: string;
}

export function PricingSummary({ pricing, customerName }: PricingSummaryProps) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                    {customerName ? `${customerName} 가격` : '가격 요약'}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {/* CBM */}
                <div className="flex justify-between text-sm">
                    <span>CBM</span>
                    <span className="font-mono">{pricing.baseCbm.toFixed(3)} m³</span>
                </div>

                {/* 기본 금액 */}
                <div className="flex justify-between text-sm">
                    <span>기본 금액 ({pricing.baseCbm} × ${pricing.pricePerCbm})</span>
                    <span className="font-mono">${pricing.baseAmount.toFixed(2)}</span>
                </div>

                {/* Master 할인 */}
                {pricing.masterDiscountRate > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                        <span>
                            {pricing.masterDiscountReason || `기본 할인 ${pricing.masterDiscountRate * 100}%`}
                        </span>
                        <span className="font-mono">-${pricing.masterDiscountAmount.toFixed(2)}</span>
                    </div>
                )}

                {/* 자동 소계 */}
                <div className="flex justify-between text-sm border-t pt-2">
                    <span>자동 계산 소계</span>
                    <span className="font-mono font-bold">${pricing.autoTotal.toFixed(2)}</span>
                </div>

                {/* 수동 조정 */}
                {pricing.manualTotal !== 0 && (
                    <div className={cn(
                        "flex justify-between text-sm",
                        pricing.manualTotal < 0 ? "text-green-600" : "text-red-600"
                    )}>
                        <span>수동 조정</span>
                        <span className="font-mono">
                            {pricing.manualTotal < 0 ? '-' : '+'}${Math.abs(pricing.manualTotal).toFixed(2)}
                        </span>
                    </div>
                )}

                {/* 최종 금액 */}
                <div className="flex justify-between text-lg border-t pt-2 font-bold">
                    <span>최종 금액</span>
                    <span className="text-primary">${pricing.finalTotal.toFixed(2)}</span>
                </div>
            </CardContent>
        </Card>
    );
}

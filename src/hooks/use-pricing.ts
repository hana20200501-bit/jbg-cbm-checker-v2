/**
 * 📌 Financial Engine: Pricing Hook
 * 
 * Sprint 1: CBM → Price 자동 계산 시스템
 * 
 * 🎯 핵심 기능:
 * 1. CBM 변경 시 자동 재계산 (autoTotal)
 * 2. Master 할인율 적용 (Missionary, VIP 등)
 * 3. Manual Adjustments 유지 (Discount Persistence!)
 * 4. 가격 변동 히스토리 추적
 */

import { useState, useCallback, useMemo } from 'react';
import type { Customer, PricingLayer, ManualAdjustment } from '@/types';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

// =============================================================================
// 상수
// =============================================================================

/** 기본 CBM 단가 (USD) */
export const DEFAULT_PRICE_PER_CBM = 100;

/** 할인 유형별 기본 할인율 */
export const DISCOUNT_RATES: Record<string, number> = {
    'MISSIONARY': 0.10,      // 선교사 10%
    'VIP': 0.05,             // VIP 5%
    'BULK': 0.15,            // 대량 15%
    'LONG_TERM': 0.07,       // 장기 고객 7%
};

// =============================================================================
// 유틸리티: 고객 할인율 추출
// =============================================================================

/**
 * 고객 정보에서 Master 할인율 추출
 * 
 * @param customer - 고객 정보
 * @returns { rate: number, reason: string }
 */
export function extractMasterDiscount(customer: Customer | null): {
    rate: number;
    reason: string | undefined;
} {
    if (!customer) return { rate: 0, reason: undefined };

    // discountPercent가 있으면 직접 사용
    if (customer.discountPercent && customer.discountPercent > 0) {
        return {
            rate: customer.discountPercent / 100,
            reason: customer.discountInfo,
        };
    }

    // discountInfo에서 키워드 검색
    const info = (customer.discountInfo || '').toLowerCase();

    if (info.includes('선교') || info.includes('missionary')) {
        return { rate: DISCOUNT_RATES.MISSIONARY, reason: '선교사 할인 10%' };
    }
    if (info.includes('vip')) {
        return { rate: DISCOUNT_RATES.VIP, reason: 'VIP 할인 5%' };
    }
    if (info.includes('대량') || info.includes('bulk')) {
        return { rate: DISCOUNT_RATES.BULK, reason: '대량 할인 15%' };
    }

    return { rate: 0, reason: undefined };
}

// =============================================================================
// 핵심: Pricing 계산 함수
// =============================================================================

/**
 * Split-Pricing 구조 가격 계산
 * 
 * 📌 Discount Persistence 보장:
 * - autoTotal: CBM 변경 시 재계산됨
 * - manualAdjustments: 절대 자동 삭제 안 됨!
 * - finalTotal: autoTotal + manualTotal
 */
export function calculateFullPricing(
    baseCbm: number,
    pricePerCbm: number = DEFAULT_PRICE_PER_CBM,
    customer: Customer | null,
    manualAdjustments: ManualAdjustment[] = []
): PricingLayer {
    // 1. Master 할인율 추출
    const { rate: masterDiscountRate, reason: masterDiscountReason } =
        extractMasterDiscount(customer);

    // 2. 자동 계산 (CBM 변경 시 재계산됨)
    const baseAmount = baseCbm * pricePerCbm;
    const masterDiscountAmount = baseAmount * masterDiscountRate;
    const autoTotal = baseAmount - masterDiscountAmount;

    // 3. 수동 조정 합계 (📌 절대 자동 삭제 안 됨!)
    const manualTotal = manualAdjustments.reduce((sum, adj) => sum + adj.amount, 0);

    // 4. 최종 금액
    const finalTotal = autoTotal + manualTotal;

    return {
        baseCbm,
        pricePerCbm,
        masterDiscountRate,
        masterDiscountReason,
        baseAmount,
        masterDiscountAmount,
        autoTotal,
        manualAdjustments,
        manualTotal,
        finalTotal,
        priceHistory: [],
    };
}

// =============================================================================
// React Hook: usePricing
// =============================================================================

interface UsePricingOptions {
    customer: Customer | null;
    initialCbm?: number;
    initialAdjustments?: ManualAdjustment[];
    pricePerCbm?: number;
    onPriceChange?: (pricing: PricingLayer) => void;
}

interface UsePricingReturn {
    pricing: PricingLayer;
    updateCbm: (newCbm: number) => void;
    addAdjustment: (adjustment: Omit<ManualAdjustment, 'id' | 'createdAt'>) => void;
    removeAdjustment: (adjustmentId: string) => void;
    recalculate: () => void;
}

/**
 * usePricing Hook
 * 
 * 📌 CBM 변경 시 자동 재계산
 * 📌 Manual Adjustments 유지 (Discount Persistence!)
 * 
 * @example
 * ```tsx
 * const { pricing, updateCbm, addAdjustment } = usePricing({
 *   customer: selectedCustomer,
 *   initialCbm: 0,
 * });
 * 
 * // 작업자가 CBM 업데이트
 * updateCbm(1.8);
 * // → autoTotal 자동 재계산
 * // → manualAdjustments 유지됨!
 * 
 * // Admin이 수동 할인 추가
 * addAdjustment({ type: 'DAMAGE_DISCOUNT', amount: -50, reason: '손상' });
 * // → finalTotal에 반영
 * ```
 */
export function usePricing({
    customer,
    initialCbm = 0,
    initialAdjustments = [],
    pricePerCbm = DEFAULT_PRICE_PER_CBM,
    onPriceChange,
}: UsePricingOptions): UsePricingReturn {
    // 상태
    const [cbm, setCbm] = useState(initialCbm);
    const [adjustments, setAdjustments] = useState<ManualAdjustment[]>(initialAdjustments);

    // Pricing 계산 (Memoized)
    const pricing = useMemo(() =>
        calculateFullPricing(cbm, pricePerCbm, customer, adjustments),
        [cbm, pricePerCbm, customer, adjustments]
    );

    // CBM 업데이트 (자동 재계산 트리거)
    const updateCbm = useCallback((newCbm: number) => {
        setCbm(newCbm);
        // onPriceChange는 useEffect에서 호출
    }, []);

    // 수동 조정 추가 (📌 Discount Persistence!)
    const addAdjustment = useCallback((
        adjustment: Omit<ManualAdjustment, 'id' | 'createdAt'>
    ) => {
        const newAdjustment: ManualAdjustment = {
            ...adjustment,
            id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
        };
        setAdjustments(prev => [...prev, newAdjustment]);
    }, []);

    // 수동 조정 삭제
    const removeAdjustment = useCallback((adjustmentId: string) => {
        setAdjustments(prev => prev.filter(a => a.id !== adjustmentId));
    }, []);

    // 강제 재계산
    const recalculate = useCallback(() => {
        // 현재 값으로 재계산 (customer 변경 시 등)
        const newPricing = calculateFullPricing(cbm, pricePerCbm, customer, adjustments);
        onPriceChange?.(newPricing);
    }, [cbm, pricePerCbm, customer, adjustments, onPriceChange]);

    return {
        pricing,
        updateCbm,
        addAdjustment,
        removeAdjustment,
        recalculate,
    };
}

// =============================================================================
// Firestore 업데이트용 유틸리티
// =============================================================================

/**
 * Shipment 가격 업데이트 시 사용할 데이터 생성
 */
export function preparePricingUpdate(pricing: PricingLayer): {
    totalCbm: number;
    subtotal: number;
    discountPercent: number;
    discountAmount: number;
    totalAmount: number;
} {
    return {
        totalCbm: pricing.baseCbm,
        subtotal: pricing.baseAmount,
        discountPercent: pricing.masterDiscountRate * 100,
        discountAmount: pricing.masterDiscountAmount + Math.abs(pricing.manualTotal),
        totalAmount: pricing.finalTotal,
    };
}

/**
 * 가격 변동 히스토리 항목 생성
 */
export function createPriceHistoryEntry(
    field: string,
    oldValue: number,
    newValue: number,
    changedBy: string = 'system'
): PricingLayer['priceHistory'][0] {
    return {
        changedAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
        changedBy,
        field,
        oldValue,
        newValue,
    };
}

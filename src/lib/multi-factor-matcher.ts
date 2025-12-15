/**
 * Multi-Factor Matching Engine
 * 
 * 📌 Production-Grade Stress Test 대응
 * 
 * 매칭 우선순위:
 * 1. PHONE_MATCH (95%) - 전화번호 일치 시 이름이 달라도 연결
 * 2. EXACT_NAME (100%) - 정확한 이름 일치
 * 3. FUZZY_NAME (70-90%) - 유사 이름 + 지역 일치
 * 4. NO_MATCH (0%) - 신규 고객
 */

import type {
    Customer,
    MatchConfidence,
    MatchFactor,
    DuplicateGroup,
    EnhancedStagingRecord,
    MatchStatus,
    StagingRecord,
} from '@/types';

// =============================================================================
// 전화번호 정규화
// =============================================================================

/**
 * 전화번호를 정규화 (숫자만 추출)
 */
export function normalizePhone(phone: string | undefined): string {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

/**
 * 전화번호 포맷 검증 (최소 8자리)
 */
export function isValidPhone(phone: string | undefined): boolean {
    const normalized = normalizePhone(phone);
    return normalized.length >= 8;
}

// =============================================================================
// 이름 정규화 및 유사도
// =============================================================================

/**
 * 이름 정규화 (공백, 괄호 내용 제거 등)
 */
export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '')           // 공백 제거
        .replace(/\([^)]*\)/g, '')     // 괄호 내용 제거
        .replace(/[-_.]/g, '');        // 하이픈, 점, 언더바 제거
}

/**
 * Levenshtein Distance 기반 문자열 유사도 (0-1)
 */
export function calculateSimilarity(s1: string, s2: string): number {
    const a = normalizeName(s1);
    const b = normalizeName(s2);

    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const maxLen = Math.max(a.length, b.length);
    return (maxLen - matrix[b.length][a.length]) / maxLen;
}

// =============================================================================
// Multi-Factor Matching Engine
// =============================================================================

/**
 * Multi-Factor 매칭 수행
 * 
 * @param inputName 입력된 이름
 * @param inputPhone 입력된 전화번호
 * @param inputRegion 입력된 지역
 * @param customers 고객 DB
 * @returns 최적 매칭 결과
 */
export function performMultiFactorMatch(
    inputName: string,
    inputPhone: string | undefined,
    inputRegion: string | undefined,
    customers: Customer[]
): {
    matchedCustomer: Customer | null;
    confidence: MatchConfidence;
    status: MatchStatus;
} {
    const normalizedInputPhone = normalizePhone(inputPhone);
    const normalizedInputName = normalizeName(inputName);

    let bestMatch: Customer | null = null;
    let bestConfidence: MatchConfidence = {
        score: 0,
        factors: [],
        explanation: '',
        nameScore: 0,
        phoneScore: 0,
        regionScore: 0,
    };

    for (const customer of customers) {
        const factors: MatchFactor[] = [];
        let score = 0;

        // 1. 전화번호 매칭 (최우선!)
        const customerPhone = normalizePhone(customer.phone);
        const phoneMatch = normalizedInputPhone.length >= 8 &&
            customerPhone.length >= 8 &&
            (customerPhone.includes(normalizedInputPhone) ||
                normalizedInputPhone.includes(customerPhone));

        if (phoneMatch) {
            factors.push('PHONE_MATCH');
            score = Math.max(score, 0.95);
        }

        // 2. 이름 매칭
        const nameScore = calculateSimilarity(inputName, customer.name);

        if (nameScore === 1) {
            factors.push('EXACT_NAME');
            score = Math.max(score, 1.0);
        } else if (nameScore >= 0.7) {
            factors.push('FUZZY_NAME');
            score = Math.max(score, nameScore * 0.9);
        }

        // 3. 지역 매칭 (보조)
        let regionScore = 0;
        if (inputRegion && customer.region) {
            const inputRegionNorm = inputRegion.toLowerCase().replace(/\s+/g, '');
            const customerRegionNorm = customer.region.toLowerCase().replace(/\s+/g, '');

            if (inputRegionNorm === customerRegionNorm ||
                inputRegionNorm.includes(customerRegionNorm) ||
                customerRegionNorm.includes(inputRegionNorm)) {
                factors.push('REGION_MATCH');
                regionScore = 1;
                // 이름이 유사하고 지역도 일치하면 신뢰도 상승
                if (nameScore >= 0.5) {
                    score = Math.max(score, (nameScore + 0.1) * 0.9);
                }
            }
        }

        // 4. 전화번호 + 이름 차이 = CONFLICT 가능
        // (전화번호 일치하지만 이름이 많이 다른 경우)

        if (score > bestConfidence.score) {
            bestMatch = customer;
            bestConfidence = {
                score,
                factors,
                explanation: factors.join(', '),
                nameScore,
                phoneScore: phoneMatch ? 1 : 0,
                regionScore,
            };
        }
    }

    // Status 결정
    let status: MatchStatus;
    if (bestConfidence.score >= 0.95) {
        status = 'VERIFIED';
    } else if (bestConfidence.score >= 0.7) {
        status = 'SIMILAR';
    } else {
        status = 'NEW_CUSTOMER';
    }

    return {
        matchedCustomer: bestMatch,
        confidence: bestConfidence,
        status,
    };
}

// =============================================================================
// 중복 그룹 감지
// =============================================================================

/**
 * 동일 고객으로 추정되는 행들을 그룹화
 * 
 * @param records 파싱된 레코드들
 * @returns 중복 그룹 목록
 */
export function detectDuplicateGroups(
    records: Array<{ rowIndex: number; name: string; phone?: string; quantity: number }>
): DuplicateGroup[] {
    const groups = new Map<string, DuplicateGroup>();
    const phoneGroups = new Map<string, number[]>(); // phone -> rowIndices

    // 1단계: 전화번호로 그룹화
    for (const record of records) {
        const phone = normalizePhone(record.phone);
        if (phone.length >= 8) {
            const existing = phoneGroups.get(phone) || [];
            existing.push(record.rowIndex);
            phoneGroups.set(phone, existing);
        }
    }

    // 2단계: 그룹 생성
    let groupId = 0;
    for (const [phone, rowIndices] of phoneGroups.entries()) {
        if (rowIndices.length > 1) {
            const relevantRecords = records.filter(r => rowIndices.includes(r.rowIndex));
            const primaryRow = relevantRecords[0];

            const group: DuplicateGroup = {
                groupId: `dup-${++groupId}`,
                primaryRowIndex: primaryRow.rowIndex,
                memberRowIndices: rowIndices,
                matchedCustomer: null, // 나중에 매칭
                confidence: {
                    score: 0.95,
                    factors: ['PHONE_MATCH'],
                    explanation: `전화번호 동일 (${phone})`,
                    nameScore: 0,
                    phoneScore: 1,
                    regionScore: 0,
                },
                mergedQuantity: relevantRecords.reduce((sum, r) => sum + r.quantity, 0),
            };

            groups.set(group.groupId, group);
        }
    }

    return Array.from(groups.values());
}

// =============================================================================
// Enhanced Parsing with Multi-Factor
// =============================================================================

/**
 * 기존 StagingRecord를 EnhancedStagingRecord로 변환
 */
export function enhanceStagingRecord(
    record: StagingRecord,
    customers: Customer[],
    duplicateGroups: DuplicateGroup[]
): EnhancedStagingRecord {
    // 중복 그룹 확인
    const duplicateGroup = duplicateGroups.find(g =>
        g.memberRowIndices.includes(record.rowIndex)
    );

    // Multi-Factor 매칭
    const { matchedCustomer, confidence, status } = performMultiFactorMatch(
        record.edited.name,
        record.edited.phone,
        record.edited.region,
        customers
    );

    // 중복 그룹의 고객 정보 공유
    if (duplicateGroup && duplicateGroup.matchedCustomer) {
        return {
            ...record,
            matchStatus: 'VERIFIED',
            matchedCustomer: duplicateGroup.matchedCustomer,
            confidence: duplicateGroup.confidence,
            duplicateGroupId: duplicateGroup.groupId,
            isSelected: true,
            isResolved: true,
        };
    }

    return {
        ...record,
        matchStatus: status,
        matchedCustomer,
        confidence,
        duplicateGroupId: duplicateGroup?.groupId,
        isSelected: status === 'VERIFIED',
        isResolved: status === 'VERIFIED',
    };
}

/**
 * Pricing 계산 유틸리티
 */
export function calculatePricing(
    cbm: number,
    pricePerCbm: number,
    masterDiscountRate: number,
    manualAdjustments: { amount: number }[]
): {
    baseAmount: number;
    masterDiscountAmount: number;
    autoTotal: number;
    manualTotal: number;
    finalTotal: number;
} {
    const baseAmount = cbm * pricePerCbm;
    const masterDiscountAmount = baseAmount * masterDiscountRate;
    const autoTotal = baseAmount - masterDiscountAmount;
    const manualTotal = manualAdjustments.reduce((sum, adj) => sum + adj.amount, 0);
    const finalTotal = autoTotal + manualTotal;

    return {
        baseAmount,
        masterDiscountAmount,
        autoTotal,
        manualTotal,
        finalTotal,
    };
}

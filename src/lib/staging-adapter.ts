/**
 * StagingRecord → StagingItem 변환 어댑터
 * 기존 데이터 구조를 새 StagingGrid 컴포넌트에 맞게 변환
 */

import type { StagingRecord, Customer } from '@/types';
import type { StagingItem, StagingMatchStatus, WarningFlag, CustomerSnapshot } from '@/types/staging';

/**
 * 고객 정보를 스냅샷으로 변환
 */
export function createCustomerSnapshot(customer: Customer): CustomerSnapshot {
    return {
        id: customer.id,
        name: customer.name,
        podCode: customer.podCode,
        phone: customer.phone,
        region: customer.region,
        address: customer.addressDetail,
        discountRate: (customer as any).discountRate,
        capturedAt: new Date(),
    };
}

/**
 * 기존 MatchStatus → 새 StagingMatchStatus 변환
 */
export function convertMatchStatus(status: string): StagingMatchStatus {
    switch (status) {
        case 'VERIFIED':
            return 'VERIFIED';
        case 'NEW_CUSTOMER':
            return 'NEW';
        case 'UNTRACKED':
            return 'UNTRACKED';
        default:
            return 'NEW';
    }
}

/**
 * 전화번호 불일치 체크
 */
export function checkPhoneMismatch(
    parsedPhone: string | undefined,
    customerPhone: string | undefined
): boolean {
    if (!parsedPhone || !customerPhone) return false;

    // 숫자만 추출하여 비교
    const normalize = (p: string) => p.replace(/[^0-9]/g, '');
    const p1 = normalize(parsedPhone);
    const p2 = normalize(customerPhone);

    // 둘 다 있는데 다르면 불일치
    return p1.length > 0 && p2.length > 0 && p1 !== p2;
}

/**
 * StagingRecord → StagingItem 변환
 */
export function convertToStagingItem(record: StagingRecord, index: number): StagingItem {
    // 경고 플래그 계산
    const warningFlags: WarningFlag[] = [];

    if (record.matchedCustomer && record.raw.phone) {
        if (checkPhoneMismatch(record.raw.phone, record.matchedCustomer.phone)) {
            warningFlags.push('PHONE_MISMATCH');
        }
    }

    // 매칭 상태 변환
    let matchStatus = convertMatchStatus(record.matchStatus);

    // 경고 플래그가 있으면 WARNING으로 변경
    // 📌 단, 사용자가 명시적으로 연결한 경우(isResolved:true)는 VERIFIED 유지
    if (warningFlags.length > 0 && matchStatus === 'VERIFIED' && !record.isResolved) {
        matchStatus = 'WARNING';
    }

    // 고객 스냅샷
    const linkedCustomer = record.matchedCustomer
        ? createCustomerSnapshot(record.matchedCustomer)
        : null;

    return {
        id: record.stagingId,
        rowIndex: record.rowIndex,
        parsed: {
            name: record.raw.name,
            phone: record.raw.phone,
            arrivalDate: (record as any).arrivalDate,
            courier: (record as any).courier,
            qty: record.raw.quantity || 1,
            weight: (record as any).weight,
            nationality: (record as any).nationality,
            classification: (record as any).classification,
            feature: (record as any).feature,
            invoice: (record as any).invoice,
            cargoCategory: (record as any).cargoCategory,
            cargoDesc: (record as any).cargoDesc,
        },
        edited: {
            name: record.edited.name,
            phone: record.edited.phone,
            qty: record.raw.quantity || 1,
        },
        matchStatus,
        linkedCustomer,
        warningFlags,
        isEdited: record.edited.name !== record.raw.name,
        isArchived: false,
    };
}

/**
 * StagingRecord[] → StagingItem[] 일괄 변환
 */
export function convertRecordsToItems(records: StagingRecord[]): StagingItem[] {
    return records.map((record, index) => convertToStagingItem(record, index));
}

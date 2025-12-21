// =============================================================================
// 📌 Staging Grid Types (Production Ready - 15+5 Master Feature)
// =============================================================================

/**
 * 매칭 상태
 */
export type StagingMatchStatus =
    | 'VERIFIED'    // ✅ 정확 일치 (고객 DB 연결됨)
    | 'NEW'         // ➕ 신규 고객 (미등록)
    | 'WARNING'     // ⚠️ 경고 (이름 일치하나 전화번호 불일치 등)
    | 'UNTRACKED';  // ⏸️ 추적 안함 (Agency 등)

/**
 * 경고 플래그
 */
export type WarningFlag =
    | 'PHONE_MISMATCH'     // 전화번호 불일치
    | 'REGION_MISMATCH'    // 지역 불일치
    | 'DUPLICATE_NAME'     // 동일 이름 중복
    | 'DUPLICATE_POD';     // POD Code 중복

/**
 * Customer Snapshot (저장 시점의 고객 정보 - Immutable)
 */
export interface CustomerSnapshot {
    id: string;
    name: string;
    podCode: number;
    phone?: string;
    region?: string;
    address?: string;
    discountRate?: number;
    capturedAt: Date;
}

/**
 * Staging Item (파싱된 한 행 데이터)
 */
export interface StagingItem {
    // 식별자
    id: string;
    rowIndex: number;

    // 원본 파싱 데이터 (수정 불가 - 엑셀에서 온 그대로)
    parsed: {
        name: string;
        phone?: string;
        arrivalDate?: string;
        courier?: string;
        qty: number;
        weight?: number;
        nationality?: string;      // 'k' | 'c'
        classification?: string;   // 'customer' | 'agency'
        feature?: string;
        invoice?: string;
        cargoCategory?: string;
        cargoDesc?: string;
        rawCells?: string[];       // 원본 셀 값 전체
    };

    // 편집된 데이터 (Admin 수정 가능)
    edited: {
        name: string;
        phone?: string;
        qty: number;
    };

    // 매칭 결과
    matchStatus: StagingMatchStatus;
    linkedCustomer: CustomerSnapshot | null;
    warningFlags: WarningFlag[];

    // 유사 후보 (1-click link용)
    similarCandidates?: Array<{
        customer: CustomerSnapshot;
        similarity: number;
    }>;

    // 상태
    isEdited: boolean;
    isArchived: boolean;
}

/**
 * Staging Session 통계
 */
export interface StagingStats {
    total: number;
    verified: number;
    newCustomer: number;
    warning: number;
    untracked: number;
    archived: number;
}

/**
 * Shipment Record (최종 저장되는 화물 데이터)
 * 📌 Snapshot Fields 포함 - Master DB 변경과 무관하게 저장 시점 정보 보존
 */
export interface ShipmentRecord {
    id: string;
    voyageId: string;

    // ===== 📌 SNAPSHOT (불변 - 저장 시점의 고객 정보) =====
    customerNameSnapshot: string;
    customerPhoneSnapshot: string;
    customerAddressSnapshot: string;
    customerRegionSnapshot: string;
    podCode: number;
    discountRateSnapshot: number;

    // 고객 관계 (null = 미연결)
    customerId: string | null;

    // 화물 정보
    qty: number;
    weight?: number;
    arrivalDate?: string;
    courier?: string;
    cargoCategory?: string;
    cargoDesc?: string;
    invoice?: string;

    // 상태
    status: 'PENDING' | 'MEASURED' | 'INVOICED' | 'PAID';
    warningFlags: WarningFlag[];

    // Audit
    originalRawRow: string;
    createdAt: Date;
    createdBy: string;
    updatedAt?: Date;
    deleted: boolean;
    deletedAt?: Date;
}

/**
 * Customer Master (고객 원장)
 */
export interface CustomerMaster {
    id: string;
    name: string;
    nameEn?: string;
    podCode: number;
    phone?: string;
    region?: string;
    addressDetail?: string;
    discountRate?: number;
    discountInfo?: string;
    memo?: string;
    isActive: boolean;
    stats: {
        count: number;
        totalAmount: number;
        totalCbm: number;
    };
    createdAt: Date;
    updatedAt?: Date;
}

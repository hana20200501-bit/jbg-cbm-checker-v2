
import type { Timestamp } from 'firebase/firestore';

export interface Shipper {
  id: string; // Unique ID for the shipper
  uniqueNumber?: string; // User-defined unique number for grouping
  nameKr: string;
  nameEn: string;
  contact?: string;
  boxFeature1?: string;
  invoiceNumber?: string;
  imageUrl?: string | null;
  region?: string; // 지역명
  isUrgent?: boolean; // 긴급 화주 여부
  isConfirmed?: boolean; // 관리자 확인 여부 (CBM 측정 완료)
  isArrived?: boolean; // 창고 입고 확인 여부
  isPaid?: boolean; // 결제 완료 여부
  createdAt: Timestamp | { seconds: number, nanoseconds: number };
}

export interface Box {
  id: string; // Unique ID for each box
  shipperId: string; // Foreign key linking to the Shipper
  boxNumber: number; // e.g., Box 1, Box 2
  customName?: string; // Optional custom name for the box
  width: string;
  length: string;
  height: string;
  cbm: number;
  imageUrl?: string | null; // URL for the uploaded image of the box
}


// This is a client-side-only type, for combining data for the UI
export interface ShipperWithBoxData extends Shipper {
  boxes: Box[];
  totalCbm: number;
  completedBoxes: number;
  createdAtTimestamp: number; // for sorting
  representativeBoxImageUrl?: string | null;
}

export type Role = 'manager' | 'worker' | 'admin' | null;

// =============================================================================
// 물류 ERP 시스템 타입 정의 (Logistics ERP System Types)
// =============================================================================
// 
// 📌 데이터 관계도:
// 
//   [MASTER DATA - 영구 보관]
//   └── customers (고객 원장) ─────────────────┐
//                                               │ 1:N 참조
//   [TRANSACTION DATA - 항차별 관리]            │
//   └── voyages (항차)                          │
//       └── shipments (화물) ──────────────────┘
//           └── items[] (인보이스 항목)
//
// =============================================================================

/**
 * 항차 상태 (Voyage Status)
 */
export type VoyageStatus =
  | 'READY'      // 준비 중 (데이터 입력 가능)
  | 'CLOSING'    // 마감 임박 (D-3)
  | 'CLOSED'     // 마감 완료 (입력 불가)
  | 'SAILING'    // 운항 중
  | 'ARRIVED';   // 도착 완료

/**
 * 항차 (Voyage) - 선적 단위
 * Collection: `voyages`
 * Document ID: Auto-generated
 */
export interface Voyage {
  id: string;
  name: string;                 // 항차명 (예: "2025-12-01 1차")
  status: VoyageStatus;

  // 일정
  departureDate: Timestamp | { seconds: number; nanoseconds: number };  // 출항일
  arrivalDate?: Timestamp | { seconds: number; nanoseconds: number };   // 도착 예정일
  cutoffDate: Timestamp | { seconds: number; nanoseconds: number };     // 마감일 (입고 마감)

  // 통계 (실시간 계산 또는 캐싱)
  totalShipments: number;       // 총 화물 건수
  totalCbm: number;             // 총 CBM
  totalAmount: number;          // 총 금액

  // 작업자 공개 설정
  isVisibleToWorker?: boolean;  // 작업자에게 보이기 여부 (기본: false)

  // 메타데이터
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number };
  createdBy?: string;
}

/**
 * 배송 상태 (Shipment Status)
 * 📌 워크플로우: DRAFT → APPROVED → PENDING → CBM_DONE → INVOICED → PAID → DELIVERED
 */
export type ShipmentStatus =
  | 'DRAFT'       // 📌 NEW: Import 직후 (관리자 검토 필요)
  | 'APPROVED'    // 📌 NEW: 승인됨 (CBM 측정 가능)
  | 'PENDING'     // CBM 측정 대기 (구 Pending)
  | 'CBM_DONE'    // CBM 측정 완료 (구 Measured)
  | 'INVOICED'    // 인보이스 발행 완료
  | 'PAID'        // 결제 완료
  | 'DELIVERED'   // 배송 완료
  | 'CANCELLED';  // 취소됨

/**
 * 고객 통계 (Customer Statistics)
 * 엑셀 컬럼: 이용횟수, 누적금액
 */
export interface CustomerStats {
  count: number;        // 이용횟수
  totalAmount: number;  // 누적금액 (USD)
  totalCbm: number;     // 누적 CBM
  lastOrderDate?: Timestamp | { seconds: number; nanoseconds: number };
}

/**
 * 고객 원장 (Customer Master) ⭐ MASTER DATA
 * Collection: `customers`
 * 
 * ⚠️ Document ID = 한글 이름 (예: "김철수(지방)")
 *    → 구글 시트에서 이름으로 바로 조회 가능!
 * 
 * 📌 영구 보관 데이터. 최초 1회 엑셀 업로드 후 추가/수정만 발생.
 */
export interface Customer {
  // ⚠️ id = 한글 이름 (Document ID와 동일)
  id: string;               // Document ID = 한글 이름 (예: "김철수(지방)")

  // 기본 정보 (엑셀 컬럼: 이름, ENG name)
  name: string;             // 이름 (한글) - Document ID와 동일
  nameEn?: string;          // ENG name (영문)

  // TrackPod 연동 (엑셀 컬럼: No. = POD) ⚠️ 필수!
  podCode: number;          // No. = POD (TrackPod 연동 Key, 필수!)

  // 연락처 (엑셀 컬럼: Contact)
  phone: string;            // Contact (연락처)

  // 주소 정보 (엑셀 컬럼: 동네, 상세주소, 홈배터)
  region: string;           // 동네 (예: "BKK", "Toul Kork", "Camko")
  addressDetail?: string;   // 상세주소
  homeBatter?: string;      // 홈배터 (예: "4 Toul fork", "3 Grand Jt")

  // 할인/메모 (엑셀 컬럼: 할인정보, 배송메모, 배송처)
  discountInfo?: string;    // 할인정보 (예: "선교사할인 10%", "5% 급결제")
  discountPercent?: number; // 자동 계산용 할인율 (%)
  deliveryMemo?: string;    // 배송메모 (예: "항공 1개 가능", "12월에만 30% 할인적용")
  deliveryPlace?: string;   // 배송처 (예: "항도그 가능 $9", "macro cambodia")

  // 통계 (엑셀 컬럼: 이용횟수, 누적금액)
  stats: CustomerStats;

  // ========================================================================
  // 📌 NEW: Preferences & Admin Notes (Customer 360)
  // ========================================================================
  preferences?: {
    frequentCourier?: string;    // 자주 사용하는 택배사
    memo?: string;               // 관리자 비공개 메모 (VIP 고객 노트 등)
    priority?: 'VIP' | 'NORMAL' | 'WATCH';  // 고객 우선순위
  };

  // ========================================================================
  // 📌 NEW: Financial Pipeline Data (Customer 360)
  // ========================================================================
  financials?: {
    currentCredit?: number;      // 현재 미수금 (USD)
    unpaidInvoices?: number;     // 미결제 인보이스 수
    lastPaymentDate?: Timestamp | { seconds: number; nanoseconds: number };
    creditLimit?: number;        // 신용 한도 (USD)
  };

  // 메타데이터
  isActive: boolean;        // 활성 여부 (삭제 대신 비활성화)
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number };
}

/**
 * 인보이스 항목 (Invoice Line Item)
 */
export interface InvoiceItem {
  id: string;
  description: string;      // 품명/설명
  quantity: number;         // 수량
  cbm: number;              // 부피 (m³)
  weight?: number;          // 무게 (kg)
  unitPrice: number;        // 단가 (USD/CBM)
  amount: number;           // 금액

  // CBM Checker 연동 (기존 시스템)
  boxIds?: string[];        // 연결된 Box ID 목록
  shipperRef?: string;      // 연결된 Shipper ID (기존 시스템)
}

/**
 * 고객 스냅샷 (Customer Snapshot) ⭐ IMMUTABLE
 * 
 * 📌 Shipment 생성 시점의 고객 정보 복사본
 * 📌 Master DB 변경되어도 과거 인보이스는 이 값 사용!
 * 
 * @example
 * 김철수가 2024-12에 프놈펜→씨엠립 이사
 * → 2024-11 인보이스는 여전히 프놈펜 주소 표시 (snapshot)
 * → 2024-12 인보이스는 씨엠립 주소 표시 (새 snapshot)
 */
export interface CustomerSnapshot {
  customerName: string;           // 고객명 (한글)
  customerNameEn?: string;        // 고객명 (영문)
  customerPodCode: number;        // TrackPod No.
  customerPhone: string;          // 연락처
  customerRegion: string;         // 지역
  customerAddress?: string;       // 상세주소
  discountRate: number;           // 생성 시점 할인율 (0.0~1.0)
  discountReason?: string;        // 할인 사유
}

/**
 * 화물/인보이스 (Shipment) ⭐ TRANSACTION DATA
 * Collection: `shipments` (Root Collection)
 * Document ID: Auto-generated
 * 
 * 📌 반드시 Voyage에 종속됨. voyageId 필수.
 * 📌 Customer 참조를 통해 고객 정보 연결.
 * 📌 snapshot은 생성 시점의 불변 데이터!
 */
export interface Shipment {
  id: string;

  // 🔗 필수 관계
  voyageId: string;         // ⭐ 소속 항차 ID (필수!)
  customerId: string | null; // ⭐ 고객 ID (null = UNTRACKED)

  // ========================================================================
  // 📌 SNAPSHOT: 저장 시점의 고객 정보 (History Protection)
  // 📌 고객이 주소를 변경해도 기존 인보이스는 변하지 않음!
  // ========================================================================
  snapshot: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerRegion: string;
    discountRate: number;
    capturedAt: Timestamp | { seconds: number; nanoseconds: number };
  } | null;

  // 기존 호환성: 고객 정보 직접 필드 (이전 코드 지원)
  customerName: string;
  customerPodCode?: number;
  customerPhone?: string;
  customerRegion?: string;
  customerAddress?: string;

  // ========================================================================
  // 📌 원본 Excel 데이터 (Full Archiving)
  // ========================================================================
  arrivalDate?: string;       // 입고일짜
  courier?: string;           // 택배사
  rawName: string;            // 수령인 이름 (내용)
  qty: number;                // 수량(BOX)
  weight?: number;            // 중량(KG)
  nationality?: string;       // 국적 (k/c)
  classification?: string;    // 분류 (customer/agency)
  feature?: string;           // 특징
  invoice?: string;           // 송장
  cargoCategory?: string;     // 카테고리
  cargoDesc?: string;         // 화물 설명
  podCode?: number;           // No. 컬럼 (엑셀 순번)

  // 📌 경고 플래그 (매칭 시 불일치 표시용)
  warningFlag?: 'PHONE_MISMATCH' | 'REGION_MISMATCH' | null;

  // ========================================================================
  // 📌 AUDIT FIELDS: 추적 및 디버깅용
  // ========================================================================
  originalRawRow?: string;    // 원본 Excel 행 JSON (디버깅용)
  validationErrors?: string[]; // 검증 에러 목록
  hasError?: boolean;         // 에러 상태 플래그

  // CBM 측정 데이터
  totalCbm?: number;
  boxDimensions?: {
    length: number;
    width: number;
    height: number;
    quantity: number;
  }[];

  // 인보이스 항목
  items?: InvoiceItem[];

  // 금액 계산
  subtotal?: number;
  discountPercent?: number;
  discountAmount?: number;
  shippingFee?: number;
  packingFee?: number;
  customsFee?: number;
  otherFee?: number;
  totalAmount?: number;

  // 결제 정보
  currency?: 'USD' | 'KRW' | 'KHR';
  isPaid?: boolean;
  paidAt?: Timestamp | { seconds: number; nanoseconds: number };
  paymentMethod?: 'Cash' | 'Bank' | 'Card' | 'Other';

  // 상태 관리
  status: ShipmentStatus;

  // 인보이스 정보
  invoiceNumber?: string;
  invoicePdfUrl?: string;

  // 메모
  memo?: string;

  // ========================================================================
  // 📌 SOFT DELETE: 삭제 시 즉시 삭제하지 않음 (Safety Net)
  // ========================================================================
  deleted?: boolean;
  deletedAt?: Timestamp | { seconds: number; nanoseconds: number };
  deletedBy?: string;

  // ========================================================================
  // 📌 메타데이터 (Audit)
  // ========================================================================
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number };
  createdBy?: string;           // Admin UID
}

/**
 * TrackPod 내보내기용 데이터
 */
export interface TrackPodExportData {
  no: number;               // pod_code
  clientName: string;       // 고객명
  phone: string;            // 연락처
  address: string;          // 주소
  items: string;            // 품목 설명
  cbm: number;              // 총 CBM
  amount: number;           // 금액
}

/**
 * 인보이스 에디터 로컬 상태
 */
export interface InvoiceEditorState {
  customer: Customer | null;
  items: InvoiceItem[];
  discountPercent: number;
  shippingFee: number;
  packingFee: number;
  customsFee: number;
  otherFee: number;
  memo: string;
  isDirty: boolean;         // 수정 여부
}

/**
 * 은행 정보 (인보이스 하단 표시용)
 */
export interface BankInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  swiftCode?: string;
}

// =============================================================================
// Staging & Import 시스템 타입 정의 (Phase 1)
// =============================================================================
//
// 📌 Staging 개념:
//   Raw Data → Staging Area → Verification → Final Import
//   절대 Raw 데이터를 직접 저장하지 않음!
//
// =============================================================================

/**
 * 매칭 상태 (Match Status) - Exact Match Only Policy
 * 
 * VERIFIED: 이름 정확 일치 (고객 DB와 연결됨)
 * NEW_CUSTOMER: 매칭되는 고객 없음 (신규 등록 필요)
 * UNTRACKED: 필터 외 항목 (저장되지만 매칭 안함)
 */
export type MatchStatus =
  | 'VERIFIED'      // ✅ 이름 정확 일치
  | 'NEW_CUSTOMER'  // ➕ 신규 고객
  | 'UNTRACKED';    // ⏸️ 필터 외 항목

/**
 * 충돌 유형 (Conflict Type)
 */
export type ConflictType =
  | 'PHONE_MISMATCH'    // 연락처 불일치
  | 'ADDRESS_MISMATCH'  // 주소 불일치
  | 'REGION_MISMATCH'   // 지역 불일치
  | 'MULTIPLE';         // 여러 항목 불일치

/**
 * 충돌 해결 방식 (Conflict Resolution)
 */
export type ConflictResolution =
  | 'UPDATE_MASTER'   // 마스터 DB 업데이트
  | 'USE_ONCE'        // 이번 건만 사용
  | 'PENDING';        // 미결정

/**
 * 유사 매칭 후보 (Similar Match Candidate)
 */
export interface SimilarCandidate {
  customer: Customer;
  similarity: number;  // 0.0 ~ 1.0
  matchReason: string; // "이름 유사", "연락처 일치" 등
}

/**
 * Staging 레코드 (단일 화물 데이터)
 * 
 * 📌 절대 DB에 저장되지 않음 - 클라이언트 상태로만 존재
 */
export interface StagingRecord {
  // 식별자
  stagingId: string;          // 임시 ID (저장 시 실제 ID로 교체)
  rowIndex: number;           // 원본 행 번호 (디버깅용)

  // 원본 데이터 (Raw - 수정 불가)
  raw: {
    name: string;
    phone?: string;
    region?: string;
    address?: string;
    description?: string;
    quantity?: number;
    memo?: string;
  };

  // 편집된 데이터 (Admin이 수정 가능)
  edited: {
    name: string;
    phone?: string;
    region?: string;
    address?: string;
  };

  // 매칭 결과
  matchStatus: MatchStatus;
  matchedCustomer: Customer | null;
  similarCandidates: SimilarCandidate[];

  // ========================================================================
  // 📌 Visual Diff: 불일치 표시용
  // ========================================================================
  warningFlag?: 'PHONE_MISMATCH' | 'REGION_MISMATCH' | null;
  phoneMismatch?: boolean;    // 전화번호 불일치 (빨간색 표시용)
  regionMismatch?: boolean;   // 지역 불일치

  // ========================================================================
  // 📌 Error State: 파싱/검증 에러
  // ========================================================================
  parseError?: string;        // 파싱 에러 메시지
  hasError?: boolean;         // 에러 플래그
  validationErrors?: string[]; // 검증 에러 목록

  // ========================================================================
  // 📌 Inline Editing 상태
  // ========================================================================
  isEditing?: boolean;
  editField?: 'name' | 'qty' | 'note';

  // 선택 상태
  isSelected: boolean;
  isResolved: boolean;        // 매칭 완료 여부

  // 타임스탬프
  createdAt: number;
}

/**
 * Staging 세션 (전체 Import 작업)
 */
export interface StagingSession {
  sessionId: string;
  voyageId: string;
  voyageName: string;

  // 레코드
  records: StagingRecord[];

  // 통계 (Exact Match Only - 단순화)
  stats: {
    total: number;
    verified: number;
    newCustomer: number;
    untracked: number;
  };

  // 메타
  rawText: string;            // 원본 붙여넣기 데이터
  parsedHeaders: string[];    // 파싱된 헤더
  createdAt: number;
  lastModifiedAt: number;
}

/**
 * Import 결과 (저장 완료 후)
 */
export interface ImportResult {
  success: boolean;
  savedCount: number;
  skippedCount: number;
  newCustomersCreated: number;
  masterDbUpdated: number;
  errors: {
    stagingId: string;
    message: string;
  }[];
}

// =============================================================================
// Production-Grade Pricing & Matching System
// =============================================================================

/**
 * 수동 조정 항목 (Manual Adjustment)
 * 
 * 📌 CBM 변경 시에도 삭제되지 않음!
 * 📌 자동 계산과 분리하여 관리
 */
export interface ManualAdjustment {
  id: string;
  type: 'DAMAGE_DISCOUNT' | 'VIP_DISCOUNT' | 'SPECIAL_FEE' | 'PENALTY' | 'OTHER';
  amount: number;           // 금액 (음수: 할인, 양수: 추가)
  reason: string;           // 사유
  createdBy: string;        // 생성자
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
}

/**
 * 가격 계산 레이어 (Pricing Layer)
 * 
 * 📌 autoTotal: CBM 변경 시 자동 재계산
 * 📌 manualAdjustments: 절대 자동 삭제 안 됨
 * 📌 finalTotal: autoTotal + sum(adjustments)
 */
export interface PricingLayer {
  // 기본 정보
  baseCbm: number;              // 측정된 CBM
  pricePerCbm: number;          // CBM당 단가 (기본 $100)

  // 마스터 할인 (Customer DB에서 가져옴)
  masterDiscountRate: number;   // 예: 0.10 (선교사 10%)
  masterDiscountReason?: string; // 예: "Missionary 10% Off"

  // 자동 계산 금액
  baseAmount: number;           // baseCbm × pricePerCbm
  masterDiscountAmount: number; // baseAmount × masterDiscountRate
  autoTotal: number;            // baseAmount - masterDiscountAmount

  // 수동 조정 (Persistent)
  manualAdjustments: ManualAdjustment[];
  manualTotal: number;          // sum(manualAdjustments.amount)

  // 최종 금액
  finalTotal: number;           // autoTotal + manualTotal

  // 이력
  priceHistory: {
    changedAt: Timestamp | { seconds: number; nanoseconds: number };
    changedBy: string;
    field: string;
    oldValue: number;
    newValue: number;
  }[];
}

/**
 * 매칭 요소 (Match Factor)
 * 
 * Multi-Factor Matching에서 각 요소의 기여도
 */
export type MatchFactor =
  | 'EXACT_NAME'      // 이름 정확 일치 (100%)
  | 'PHONE_MATCH'     // 전화번호 일치 (95%)
  | 'FUZZY_NAME'      // 이름 유사도 (70-90%)
  | 'REGION_MATCH'    // 지역 일치 (추가 가중치)
  | 'POD_CODE_MATCH'; // POD 코드 일치 (95%)

/**
 * 매칭 신뢰도 (Match Confidence)
 * 
 * 📌 복수의 Factor 조합으로 최종 confidence 결정
 */
export interface MatchConfidence {
  score: number;              // 0.0 ~ 1.0
  factors: MatchFactor[];     // 매칭에 기여한 요소들
  explanation: string;        // "전화번호 일치, 이름 유사"

  // 상세 점수
  nameScore: number;          // 이름 유사도 (0-1)
  phoneScore: number;         // 전화번호 일치 (0 or 1)
  regionScore: number;        // 지역 일치 (0 or 1)
}

/**
 * 중복 그룹 (Duplicate Group)
 * 
 * 같은 고객으로 추정되는 여러 행 그룹화
 */
export interface DuplicateGroup {
  groupId: string;
  primaryRowIndex: number;    // 대표 행
  memberRowIndices: number[]; // 그룹 멤버 행들
  matchedCustomer: Customer | null;
  confidence: MatchConfidence;
  mergedQuantity: number;     // 합산된 수량
}

/**
 * Enhanced Staging Record (Stress Test 대응)
 */
export interface EnhancedStagingRecord extends StagingRecord {
  // 추가 매칭 정보
  confidence: MatchConfidence;
  duplicateGroupId?: string;  // 중복 그룹 ID

  // 원본 행 보존 (병합 시)
  mergedFrom?: number[];      // 병합된 원본 행 인덱스들

  // Pricing (측정 후)
  pricing?: PricingLayer;
}
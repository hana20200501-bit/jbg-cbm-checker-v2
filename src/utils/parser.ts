/**
 * 📌 FOUNDATION LAYER: Multi-Factor Parser
 * 
 * Production-Grade Stress Test 대응 파서
 * 
 * 🎯 핵심 로직:
 * 1. Phone Match → Name Match 우선순위 (Row 1 vs Row 2 해결)
 * 2. Discount Persistence 구조 (수동 할인 유지)
 * 3. TrackPod Export를 위한 Master DB 참조 보장
 * 
 * @example
 * ```
 * // Dirty Data 예시:
 * [Row 1] CJ  10  Lee Hanna(SiemReap)  150.0  010-9999-8888
 * [Row 2] 용차  5   Lee Han-na         50.0   010-9999-8888
 * 
 * // 결과: 둘 다 Master DB의 "Rev. Lee Han-na (Siem Reap)" 로 매칭
 * // 이유: 전화번호가 동일 (010-9999-8888)
 * ```
 */

import type { Customer, MatchStatus, StagingRecord, SimilarCandidate } from '@/types';

// =============================================================================
// 타입 정의
// =============================================================================

/**
 * 매칭 결과 (MatchResult)
 */
export interface MatchResult {
    status: MatchStatus;
    matchedCustomer: Customer | null;
    similarCandidates: SimilarCandidate[];
    confidence: number;      // 0.0 ~ 1.0
    matchFactors: string[];  // 어떤 요소로 매칭되었는지
}

/**
 * 파싱된 행 데이터
 */
export interface ParsedItem {
    rowIndex: number;
    courier?: string;
    qty: number;
    rawName: string;
    weight?: number;
    phone?: string;
    region?: string;
    desc?: string;
    rawCells: string[];
}

/**
 * 파싱 결과
 */
export interface ParseResult {
    success: boolean;
    items: ParsedItem[];
    detectedFormat: 'TAB' | 'SPACE' | 'MIXED';
    hasHeader: boolean;
    headers?: string[];
    warnings: string[];
}

// =============================================================================
// 상수: 택배사 목록
// =============================================================================

const COURIER_PATTERNS = [
    '로젠', 'CJ', '씨제이', '한진', '우체국', '롯데', '쿠팡',
    '경동', '대신', '합동', '건영', '천일', '용차', '직배',
    'LOGEN', 'HANJIN', 'COUPANG', 'POST', 'YongCha', 'Unknown',
    '택배', '배송', '퀵', '화물',
];

// 📌 전화번호 패턴 (확장됨)
const PHONE_PATTERNS = [
    /01[0-9]-?\d{3,4}-?\d{4}/,             // 한국 휴대폰 (010, 011, 017, etc)
    /02-?\d{3,4}-?\d{4}/,                   // 서울 유선
    /0[3-6][1-9]-?\d{3,4}-?\d{4}/,          // 지방 유선 (031, 032, 041...)
    /070-?\d{3,4}-?\d{4}/,                  // 인터넷 전화
    /050[0-9]-?\d{3,4}-?\d{4}/,             // 안심번호
    /0[1-9]{2}\s?\d{3}\s?\d{3,4}/,          // 캄보디아 (070, 010, 012...)
    /\+855\s?\d{2,3}\s?\d{3}\s?\d{3,4}/,    // 캄보디아 국제
    /\+82\s?\d{1,2}\s?\d{3,4}\s?\d{4}/,     // 한국 국제
    /\d{10,11}/,                            // 하이픈 없는 전화번호 (fallback)
];

// =============================================================================
// 유틸리티: 정규화 함수
// =============================================================================

/**
 * 전화번호 정규화 (숫자만 추출)
 * 📌 Secondary Key로 사용
 */
export function normalizePhone(phone: string | undefined): string {
    if (!phone) return '';
    return phone.replace(/[^0-9]/g, '');
}

/**
 * 이름 정규화 (비교용)
 */
export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '')           // 공백 제거
        .replace(/\([^)]*\)/g, '')     // 괄호 내용 제거 (지역명 등)
        .replace(/[-_.,]/g, '');       // 특수문자 제거
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

/**
 * 택배사 이름인지 확인
 */
export function isCourier(text: string): boolean {
    const upper = text.toUpperCase();
    return COURIER_PATTERNS.some(c =>
        upper.includes(c.toUpperCase()) || c.toUpperCase().includes(upper)
    );
}

/**
 * 전화번호 추출
 */
export function extractPhone(text: string): string | undefined {
    for (const pattern of PHONE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[0];
    }
    return undefined;
}

// =============================================================================
// 📌 CORE: Multi-Factor Matching Engine
// =============================================================================

/**
 * Multi-Factor 고객 매칭
 * 
 * 🎯 우선순위:
 * 1. PHONE_MATCH (95% confidence) - 전화번호 일치 시 이름이 달라도 연결!
 * 2. EXACT_NAME (100% confidence) - 정확한 이름 일치
 * 3. FUZZY_NAME (70-90%) - 유사 이름 + 지역 일치
 * 4. NEW_CUSTOMER (0%) - 매칭 실패
 * 
 * @param inputName - 입력된 이름 (예: "Lee Hanna(SiemReap)")
 * @param inputPhone - 입력된 전화번호 (예: "010-9999-8888")
 * @param inputRegion - 입력된 지역 (선택)
 * @param customers - 고객 DB 목록
 * @returns MatchResult
 */
export function performMultiFactorMatch(
    inputName: string,
    inputPhone: string | undefined,
    inputRegion: string | undefined,
    customers: Customer[]
): MatchResult {
    const normalizedInputPhone = normalizePhone(inputPhone);
    const normalizedInputName = normalizeName(inputName);

    let bestMatch: Customer | null = null;
    let bestConfidence = 0;
    let matchFactors: string[] = [];
    const similarCandidates: SimilarCandidate[] = [];

    for (const customer of customers) {
        if (!customer.isActive) continue;

        const factors: string[] = [];
        let score = 0;

        // =======================================================================
        // 🔥 Step 1: PHONE MATCH (최우선!)
        // "Row 1 vs Row 2" 시나리오 해결
        // =======================================================================
        const customerPhone = normalizePhone(customer.phone);
        const phoneMatch = normalizedInputPhone.length >= 8 &&
            customerPhone.length >= 8 &&
            (customerPhone.includes(normalizedInputPhone) ||
                normalizedInputPhone.includes(customerPhone));

        if (phoneMatch) {
            factors.push('PHONE_MATCH');
            score = Math.max(score, 0.95); // 전화번호 일치 = 95% 신뢰도
        }

        // =======================================================================
        // Step 2: NAME MATCH
        // =======================================================================
        const nameScore = calculateSimilarity(inputName, customer.name);

        if (nameScore === 1) {
            factors.push('EXACT_NAME');
            score = Math.max(score, 1.0);
        } else if (nameScore >= 0.7) {
            factors.push('FUZZY_NAME');
            score = Math.max(score, nameScore * 0.9);

            // 유사 후보로 추가
            if (!phoneMatch && nameScore < 0.95) {
                similarCandidates.push({
                    customer,
                    similarity: nameScore,
                    matchReason: `이름 유사도 ${Math.round(nameScore * 100)}%`
                });
            }
        }

        // =======================================================================
        // Step 3: REGION MATCH (보조)
        // =======================================================================
        if (inputRegion && customer.region) {
            const inputRegionNorm = inputRegion.toLowerCase().replace(/\s+/g, '');
            const customerRegionNorm = customer.region.toLowerCase().replace(/\s+/g, '');

            if (inputRegionNorm === customerRegionNorm ||
                inputRegionNorm.includes(customerRegionNorm) ||
                customerRegionNorm.includes(inputRegionNorm)) {
                factors.push('REGION_MATCH');
                // 이름이 유사하고 지역도 일치하면 신뢰도 상승
                if (nameScore >= 0.5) {
                    score = Math.max(score, (nameScore + 0.1) * 0.9);
                }
            }
        }

        // 최고 점수 갱신
        if (score > bestConfidence) {
            bestMatch = customer;
            bestConfidence = score;
            matchFactors = [...factors];
        }
    }

    // Status 결정
    let status: MatchStatus;
    if (bestConfidence >= 0.95) {
        status = 'VERIFIED';
    } else if (bestConfidence >= 0.7) {
        status = 'SIMILAR';
    } else {
        status = 'NEW_CUSTOMER';
    }

    return {
        status,
        matchedCustomer: bestMatch,
        similarCandidates: similarCandidates.slice(0, 3), // 상위 3개만
        confidence: bestConfidence,
        matchFactors,
    };
}

// =============================================================================
// 📌 중복 그룹 감지 (전화번호 기반)
// =============================================================================

/**
 * 동일 전화번호를 가진 행들을 그룹화
 * 
 * @example
 * Row 1: Lee Hanna / 010-9999-8888
 * Row 2: Lee Han-na / 010-9999-8888
 * → 같은 그룹으로 묶임
 */
export function detectDuplicateGroups(
    items: ParsedItem[]
): Map<string, ParsedItem[]> {
    const phoneGroups = new Map<string, ParsedItem[]>();

    for (const item of items) {
        const phone = normalizePhone(item.phone);
        if (phone.length >= 8) {
            const existing = phoneGroups.get(phone) || [];
            existing.push(item);
            phoneGroups.set(phone, existing);
        }
    }

    // 2개 이상인 그룹만 반환
    const duplicates = new Map<string, ParsedItem[]>();
    for (const [phone, group] of phoneGroups.entries()) {
        if (group.length > 1) {
            duplicates.set(phone, group);
        }
    }

    return duplicates;
}

// =============================================================================
// 📌 메인 파서: parseGoogleSheetData
// =============================================================================

/**
 * 구글 시트에서 복사한 데이터를 파싱 (비동기 + 배치 처리)
 * 
 * 📌 개선사항:
 * - Ghost Row 필터링 (빈 행, 공백/쉼표만 있는 행 제거)
 * - 확장된 전화번호 패턴
 * - 50행마다 UI Thread 양보 (Async Batching)
 * 
 * @param rawText - 붙여넣기한 원본 텍스트
 * @returns Promise<ParseResult>
 */
export async function parseGoogleSheetData(rawText: string): Promise<ParseResult> {
    const warnings: string[] = [];

    // 📌 FIX: Ghost Row 필터링 (빈 행, 공백/쉼표만 있는 행 제거)
    const lines = rawText
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
            // 빈 줄 제거
            if (!line) return false;
            // 공백, 탭, 쉼표만 있는 줄 제거
            if (/^[\s,\t]*$/.test(line)) return false;
            return true;
        });

    if (lines.length === 0) {
        return { success: false, items: [], detectedFormat: 'TAB', hasHeader: false, warnings: ['빈 데이터'] };
    }

    // 포맷 감지
    const hasTab = rawText.includes('\t');
    const detectedFormat = hasTab ? 'TAB' : 'SPACE';

    // 행 분할 함수 (모든 셀에 trim 적용)
    const splitRow = (row: string): string[] => {
        if (row.includes('\t')) {
            return row.split('\t').map(s => s.trim()).filter(Boolean);
        }
        return row.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    };

    // 첫 번째 행이 헤더인지 확인
    const firstRowCells = splitRow(lines[0]);
    const headerKeywords = ['이름', 'name', '수량', 'qty', '택배', '중량', 'weight', '비고', 'courier', '특징', '송장'];
    const hasHeader = firstRowCells.some(cell =>
        headerKeywords.some(kw => cell.toLowerCase().includes(kw))
    );

    const dataStartIndex = hasHeader ? 1 : 0;
    const headers = hasHeader ? firstRowCells : undefined;

    const items: ParsedItem[] = [];
    const BATCH_SIZE = 50; // 📌 50행마다 UI Thread 양보

    for (let i = dataStartIndex; i < lines.length; i++) {
        // 📌 Async Batching: 50행마다 UI 스레드 양보
        if ((i - dataStartIndex) > 0 && (i - dataStartIndex) % BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const cells = splitRow(lines[i]);
        if (cells.length === 0) continue;

        const item: ParsedItem = {
            rowIndex: i + 1,
            qty: 1,
            rawName: '',
            rawCells: cells,
        };

        // 스마트 파싱
        let foundName = false;

        for (let j = 0; j < cells.length; j++) {
            const cell = cells[j];

            // 택배사 감지
            if (!item.courier && isCourier(cell)) {
                item.courier = cell;
                continue;
            }

            // 수량 감지 (순수 정수, 1~999)
            if (item.qty === 1 && /^\d+$/.test(cell)) {
                const num = parseInt(cell);
                if (num >= 1 && num <= 999) {
                    item.qty = num;
                    continue;
                }
            }

            // 중량 감지 (소수점 숫자)
            if (!item.weight && /^\d+\.?\d*$/.test(cell)) {
                const num = parseFloat(cell);
                if (num > 0 && num < 10000) {
                    item.weight = num;
                    continue;
                }
            }

            // 전화번호 감지
            const phone = extractPhone(cell);
            if (phone) {
                item.phone = phone;
                continue;
            }

            // 이름 감지
            if (!foundName && cell.length >= 2 && !/^\d+\.?\d*$/.test(cell) && !isCourier(cell)) {
                // 한글 또는 영문 이름 패턴
                const hasKorean = /[가-힣]/.test(cell);
                const hasEnglishName = /^(Mr|Ms|Mrs|Miss)?\.?\s*[A-Z][a-z]+/.test(cell);

                if (hasKorean || hasEnglishName || cell.length >= 3) {
                    item.rawName = cell;
                    foundName = true;

                    // 이름에서 지역 추출 (괄호 안)
                    const regionMatch = cell.match(/\(([^)]+)\)/);
                    if (regionMatch) {
                        item.region = regionMatch[1];
                    }
                    continue;
                }
            }

            // 나머지는 비고로
            if (foundName && cell.length > 0) {
                item.desc = item.desc ? `${item.desc} ${cell}` : cell;
            }
        }

        // 이름을 못 찾은 경우
        if (!item.rawName) {
            for (const cell of cells) {
                if (cell && !/^\d+\.?\d*$/.test(cell) && !isCourier(cell)) {
                    item.rawName = cell;
                    break;
                }
            }
        }

        // 📌 FIX: 비고 + 전체 셀에서 전화번호 재검색
        if (!item.phone) {
            // 모든 셀 합쳐서 전화번호 추출 시도
            const allText = cells.join(' ');
            item.phone = extractPhone(allText);
        }

        if (item.rawName) {
            items.push(item);
        } else {
            warnings.push(`Row ${i + 1}: 이름을 찾을 수 없음`);
        }
    }

    return {
        success: items.length > 0,
        items,
        detectedFormat,
        hasHeader,
        headers,
        warnings,
    };
}

// =============================================================================
// 📌 DISCOUNT PERSISTENCE: 가격 계산 로직
// =============================================================================

/**
 * Split-Pricing 구조 가격 계산
 * 
 * 📌 핵심 설계:
 * - autoTotal: CBM 변경 시 자동 재계산
 * - manualAdjustments: CBM 변경되어도 절대 삭제 안 됨! ← 여기가 Discount Persistence!
 * - finalTotal: autoTotal + sum(manualAdjustments)
 * 
 * @example
 * 선교사 할인 10% + 손상 할인 $50
 * 
 * CBM 업데이트 전: 1.5 CBM
 * - autoTotal = 1.5 × $100 × 0.9 = $135
 * - manualAdjustments = [-$50]
 * - finalTotal = $135 - $50 = $85
 * 
 * CBM 업데이트 후: 1.8 CBM
 * - autoTotal = 1.8 × $100 × 0.9 = $162 ← 재계산됨
 * - manualAdjustments = [-$50] ← 그대로 유지!
 * - finalTotal = $162 - $50 = $112
 */
export function calculatePricing(
    baseCbm: number,
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
    // 자동 계산 (CBM 변경 시 재계산됨)
    const baseAmount = baseCbm * pricePerCbm;
    const masterDiscountAmount = baseAmount * masterDiscountRate;
    const autoTotal = baseAmount - masterDiscountAmount;

    // 📌 수동 조정 합계 (절대 자동으로 삭제되지 않음!)
    // 이것이 "Discount Persistence" 로직의 핵심!
    const manualTotal = manualAdjustments.reduce((sum, adj) => sum + adj.amount, 0);

    // 최종 금액
    const finalTotal = autoTotal + manualTotal;

    return {
        baseAmount,
        masterDiscountAmount,
        autoTotal,
        manualTotal,
        finalTotal,
    };
}

// =============================================================================
// 📌 TrackPod Export 무결성 보장
// =============================================================================

/**
 * TrackPod Export용 데이터 생성
 * 
 * 🔒 규칙: 항상 Master DB의 값을 사용!
 * - Name: customer.name (NOT rawName)
 * - Address: customer.addressDetail (NOT raw input)
 * - Phone: customer.phone
 */
export function prepareTrackPodExport(
    shipmentId: string,
    rawName: string,        // 사용 안 함
    matchedCustomer: Customer
): {
    no: number;
    clientName: string;
    phone: string;
    address: string;
} {
    // 📌 무조건 Master DB 값 사용 (raw input 무시!)
    return {
        no: matchedCustomer.podCode,
        clientName: matchedCustomer.name, // NOT rawName!
        phone: matchedCustomer.phone || '',
        address: matchedCustomer.addressDetail || matchedCustomer.region || '',
    };
}

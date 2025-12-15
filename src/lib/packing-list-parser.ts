/**
 * 패킹리스트 스마트 파서 (Smart Parser for Packing List)
 * 
 * 구글 시트에서 복사한 Raw 데이터를 지능적으로 파싱합니다.
 * 
 * 📌 지원하는 데이터 형식:
 * - 탭(`\t`) 구분 데이터
 * - 연속 공백 구분 데이터
 * - 헤더 유/무 모두 처리
 * 
 * 📌 자동 감지 컬럼:
 * - courier: 택배사 (로젠, 쿠팡, CJ, 용차, 우체국...)
 * - qty: 수량 (숫자)
 * - raw_name: 수령인 이름 (가장 중요!)
 * - weight: 중량 (소수점 포함 숫자)
 * - desc: 화물 설명/비고
 */

// =============================================================================
// 타입 정의
// =============================================================================

export interface ParsedRow {
    rowIndex: number;
    courier?: string;      // 택배사
    qty: number;           // 수량
    rawName: string;       // 수령인 이름 (원본)
    weight?: number;       // 중량
    desc?: string;         // 비고/설명
    phone?: string;        // 전화번호 (desc에서 추출)
    region?: string;       // 지역 (이름에서 추출 또는 별도 컸럼)
    rawCells: string[];    // 원본 셀 데이터
}

export interface ParseResult {
    success: boolean;
    rows: ParsedRow[];
    detectedFormat: 'TAB' | 'SPACE' | 'MIXED';
    hasHeader: boolean;
    headers?: string[];
    warnings: string[];
}

// =============================================================================
// 상수: 택배사 목록 (패턴 인식용)
// =============================================================================

const COURIER_PATTERNS = [
    // 한국 택배사
    '로젠', 'CJ', '씨제이', '한진', '우체국', '롯데', '쿠팡',
    '경동', '대신', '합동', '건영', '천일', '용차', '직배',
    // 영문
    'LOGEN', 'HANJIN', 'COUPANG', 'POST',
    // 기타
    '택배', '배송', '퀵', '화물',
];

// 전화번호 패턴 (한국/캄보디아)
const PHONE_PATTERNS = [
    /01[0-9]-?\d{3,4}-?\d{4}/,           // 한국 휴대폰
    /0[2-6][0-9]-?\d{3,4}-?\d{4}/,       // 한국 유선
    /0[1-9]{2}\s?\d{3}\s?\d{3,4}/,       // 캄보디아 (070, 010, 012...)
    /\+855\s?\d{2,3}\s?\d{3}\s?\d{3,4}/, // 캄보디아 국제
];

// 중량 패턴 (숫자.소수)
const WEIGHT_PATTERN = /^\d+\.?\d*$/;

// 수량 패턴 (정수)
const QTY_PATTERN = /^\d+$/;

// =============================================================================
// 유틸리티 함수
// =============================================================================

/**
 * 문자열이 택배사 이름인지 확인
 */
const isCourier = (text: string): boolean => {
    const upper = text.toUpperCase();
    return COURIER_PATTERNS.some(c =>
        upper.includes(c.toUpperCase()) || c.toUpperCase().includes(upper)
    );
};

/**
 * 문자열에서 전화번호 추출
 */
const extractPhone = (text: string): string | undefined => {
    for (const pattern of PHONE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[0];
    }
    return undefined;
};

/**
 * 문자열이 수령인 이름으로 보이는지 확인
 * - 한글 포함
 * - 숫자만은 아님
 * - 택배사 아님
 */
const looksLikeName = (text: string): boolean => {
    if (!text || text.length < 2) return false;

    // 순수 숫자면 이름 아님
    if (/^\d+\.?\d*$/.test(text)) return false;

    // 택배사 이름이면 제외
    if (isCourier(text)) return false;

    // 한글 포함 여부
    const hasKorean = /[가-힣]/.test(text);

    // 영문 이름 패턴 (Mr, Ms, 대문자 시작)
    const hasEnglishName = /^(Mr|Ms|Mrs|Miss)?\.?\s*[A-Z][a-z]+/.test(text);

    return hasKorean || hasEnglishName;
};

/**
 * 행 데이터 분할 (탭 또는 연속 공백)
 */
const splitRow = (row: string): string[] => {
    // 먼저 탭으로 분할 시도
    if (row.includes('\t')) {
        return row.split('\t').map(s => s.trim()).filter(Boolean);
    }

    // 연속 공백(2개 이상)으로 분할
    return row.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
};

// =============================================================================
// 메인 파서 함수
// =============================================================================

/**
 * 구글 시트에서 복사한 패킹리스트 데이터를 파싱
 */
export function parseGoogleSheetData(rawText: string): ParseResult {
    const warnings: string[] = [];
    const lines = rawText.trim().split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        return { success: false, rows: [], detectedFormat: 'TAB', hasHeader: false, warnings: ['빈 데이터'] };
    }

    // 포맷 감지
    const hasTab = rawText.includes('\t');
    const detectedFormat = hasTab ? 'TAB' : 'SPACE';

    // 첫 번째 행이 헤더인지 확인
    const firstRowCells = splitRow(lines[0]);
    const headerKeywords = ['이름', 'name', '수량', 'qty', '택배', '중량', 'weight', '비고', 'courier'];
    const hasHeader = firstRowCells.some(cell =>
        headerKeywords.some(kw => cell.toLowerCase().includes(kw))
    );

    const dataStartIndex = hasHeader ? 1 : 0;
    const headers = hasHeader ? firstRowCells : undefined;

    // 컬럼 인덱스 추론 (헤더가 있는 경우)
    let nameColIdx = -1;
    let qtyColIdx = -1;
    let courierColIdx = -1;
    let weightColIdx = -1;
    let descColIdx = -1;

    if (headers) {
        headers.forEach((h, i) => {
            const lower = h.toLowerCase();
            if (lower.includes('이름') || lower.includes('name') || lower.includes('수령')) nameColIdx = i;
            else if (lower.includes('수량') || lower.includes('qty') || lower.includes('박스')) qtyColIdx = i;
            else if (lower.includes('택배') || lower.includes('courier')) courierColIdx = i;
            else if (lower.includes('중량') || lower.includes('weight') || lower.includes('kg')) weightColIdx = i;
            else if (lower.includes('비고') || lower.includes('desc') || lower.includes('memo') || lower.includes('설명')) descColIdx = i;
        });
    }

    const rows: ParsedRow[] = [];

    for (let i = dataStartIndex; i < lines.length; i++) {
        const cells = splitRow(lines[i]);
        if (cells.length === 0) continue;

        let parsedRow: ParsedRow = {
            rowIndex: i + 1,
            qty: 1,
            rawName: '',
            rawCells: cells,
        };

        // 헤더 기반 파싱
        if (headers && nameColIdx >= 0) {
            parsedRow.rawName = cells[nameColIdx] || '';
            parsedRow.qty = parseInt(cells[qtyColIdx]) || 1;
            parsedRow.courier = cells[courierColIdx];
            parsedRow.weight = parseFloat(cells[weightColIdx]) || undefined;
            parsedRow.desc = cells[descColIdx];
        }
        // 스마트 파싱 (헤더 없음)
        else {
            // 패턴: 보통 [택배사] [수량] [이름] [중량?] [비고?]
            // 또는: [이름] [수량] [중량] [비고]

            let foundName = false;

            for (let j = 0; j < cells.length; j++) {
                const cell = cells[j];

                // 택배사 감지
                if (!parsedRow.courier && isCourier(cell)) {
                    parsedRow.courier = cell;
                    continue;
                }

                // 수량 감지 (순수 정수, 1~999)
                if (!parsedRow.qty || parsedRow.qty === 1) {
                    if (QTY_PATTERN.test(cell)) {
                        const num = parseInt(cell);
                        if (num >= 1 && num <= 999) {
                            parsedRow.qty = num;
                            continue;
                        }
                    }
                }

                // 중량 감지 (소수점 숫자)
                if (!parsedRow.weight && WEIGHT_PATTERN.test(cell)) {
                    const num = parseFloat(cell);
                    if (num > 0 && num < 10000) {
                        parsedRow.weight = num;
                        continue;
                    }
                }

                // 이름 감지 (가장 중요!)
                // "택배사 뒤에 보통 이름이 온다" 규칙 적용
                if (!foundName && looksLikeName(cell)) {
                    parsedRow.rawName = cell;
                    foundName = true;
                    continue;
                }

                // 나머지는 비고로
                if (foundName && cell.length > 0) {
                    parsedRow.desc = parsedRow.desc ? `${parsedRow.desc} ${cell}` : cell;
                }
            }

            // 이름을 못 찾은 경우: 첫 번째 비숫자 셀을 이름으로
            if (!parsedRow.rawName) {
                for (const cell of cells) {
                    if (cell && !/^\d+\.?\d*$/.test(cell) && !isCourier(cell)) {
                        parsedRow.rawName = cell;
                        break;
                    }
                }
            }
        }

        // 비고에서 전화번호 추출
        if (parsedRow.desc) {
            const phone = extractPhone(parsedRow.desc);
            if (phone) {
                parsedRow.phone = phone;
            }
        }

        // 이름이 있는 경우만 추가
        if (parsedRow.rawName) {
            rows.push(parsedRow);
        } else {
            warnings.push(`Row ${i + 1}: 이름을 찾을 수 없음`);
        }
    }

    return {
        success: rows.length > 0,
        rows,
        detectedFormat,
        hasHeader,
        headers,
        warnings,
    };
}

/**
 * 파싱된 이름 정규화 (괄호 내용 유지)
 */
export function normalizeParsedName(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, ' ')  // 다중 공백 제거
        .replace(/\s*\(\s*/g, '(')  // 괄호 앞 공백 제거
        .replace(/\s*\)\s*/g, ')'); // 괄호 뒤 공백 제거
}

/**
 * 중복 이름 그룹화 (같은 고객의 여러 화물)
 */
export function groupByCustomer(rows: ParsedRow[]): Map<string, ParsedRow[]> {
    const groups = new Map<string, ParsedRow[]>();

    for (const row of rows) {
        const normalized = normalizeParsedName(row.rawName).toLowerCase();
        const existing = groups.get(normalized) || [];
        existing.push(row);
        groups.set(normalized, existing);
    }

    return groups;
}

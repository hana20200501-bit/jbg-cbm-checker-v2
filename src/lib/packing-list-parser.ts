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

import { ParsedRow } from '@/types';

// =============================================================================
// 타입 정의
// =============================================================================

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

// 📌 전화번호 패턴 (확장됨 - Fix for "Rigid Regex")
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

// 중량 패턴 (숫자.소수)
const WEIGHT_PATTERN = /^\d+\.?\d*$/;

// 수량 패턴 (정수)
const QTY_PATTERN = /^\d+$/;

// =============================================================================
// 유틸리티 함수
// =============================================================================

/**
 * HTML 태그 제거 및 보이지 않는 문자(Zero-width space) 정제
 * Checks for HTML Infection (#3) and Invisible Garbage (#1)
 */
const cleanCellText = (text: string): string => {
    if (!text) return '';
    // 1. HTML Tags removal
    let clean = text.replace(/<[^>]*>/g, ' ');
    // 2. Invisible chars removal (Zero-width space, etc)
    // 3. Trim
    clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    // 4. Formula Zombies (#6) - Remove #N/A, #REF!
    if (clean.startsWith('#') && (clean.includes('N/A') || clean.includes('REF!'))) {
        return '';
    }
    return clean;
};

/**
 * 엑셀 날짜 시리얼 넘버 또는 다양한 날짜 포맷 파싱
 * Checks for Date Chaos (#2)
 */
const parseExcelDate = (text: string): string => {
    const clean = cleanCellText(text);
    if (!clean) return '';

    // 1. Excel Serial Number (e.g. 45293)
    if (/^\d{5}$/.test(clean)) {
        const serial = parseInt(clean, 10);
        // Excel base date: Dec 30, 1899
        const date = new Date(1899, 11, 30);
        date.setDate(date.getDate() + serial);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 2. YYYY.MM.DD or YYYY-MM-DD or MM/DD
    const datePattern = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/;
    const match = clean.match(datePattern);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    return clean; // Fallback
};

/**
 * 문자열이 택배사 이름인지 확인
 */
const isCourier = (text: string): boolean => {
    const clean = cleanCellText(text).toUpperCase();
    return COURIER_PATTERNS.some(c =>
        clean.includes(c.toUpperCase()) || c.toUpperCase().includes(clean)
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
    const clean = cleanCellText(text);
    if (!clean || clean.length < 2) return false;

    // 순수 숫자면 이름 아님
    if (/^\d+\.?\d*$/.test(clean)) return false;

    // 택배사 이름이면 제외
    if (isCourier(clean)) return false;

    // 한글 포함 여부
    const hasKorean = /[가-힣]/.test(clean);

    // 영문 이름 패턴 (Mr, Ms, 대문자 시작)
    const hasEnglishName = /^(Mr|Ms|Mrs|Miss)?\.?\s*[A-Z][a-z]+/.test(clean);

    return hasKorean || hasEnglishName;
};

/**
 * 행 데이터 분할 (탭 또는 연속 공백)
 * 📌 주의: 빈 셀도 유지해야 컬럼 인덱스가 밀리지 않음!
 */
const splitRow = (row: string): string[] => {
    // 먼저 탭으로 분할 시도
    if (row.includes('\t')) {
        // 📌 빈 셀 유지 (filter 제거) - trim만 하고 빈 문자열 유지
        return row.split('\t').map(cleanCellText);
    }

    // 연속 공백(2개 이상)으로 분할 - 이 경우는 빈 셀 구분이 어려워 filter 유지
    return row.split(/\s{2,}/).map(cleanCellText).filter(Boolean);
};

// =============================================================================
// 메인 파서 함수
// =============================================================================

/**
 * 구글 시트에서 복사한 패킹리스트 데이터를 파싱 (비동기 + 배치 처리)
 * 
 * 📌 개선사항:
 * - Ghost Row 필터링 (빈 행, 공백/쉼표만 있는 행 제거)
 * - 확장된 전화번호 패턴
 * - 50행마다 UI Thread 양보 (Async Batching)
 */
export async function parseGoogleSheetData(rawText: string): Promise<ParseResult> {
    const warnings: string[] = [];

    // 📌 Ghost Row 필터링
    const lines = rawText
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
            if (!line) return false;
            if (/^[\s,\t]*$/.test(line)) return false;
            return true;
        });

    if (lines.length === 0) {
        return { success: false, rows: [], detectedFormat: 'TAB', hasHeader: false, warnings: ['빈 데이터'] };
    }

    // 포맷 감지
    const hasTab = rawText.includes('\t');
    const detectedFormat = hasTab ? 'TAB' : 'SPACE';

    // 첫 번째 행이 헤더인지 확인
    const firstRowCells = splitRow(lines[0]);

    // Fuzzy Matching for Headers (#4 Header Typos)
    const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');

    const headerKeywords = [
        '이름', 'name', '수량', 'qty', 'box', '택배', '중량', 'weight', '비고', 'courier',
        '내용', '입고', '국적', '분류', '특징', '송장', '카테고리', '화물', 'no'
    ];

    const hasHeader = firstRowCells.some(cell => {
        const norm = normalizeHeader(cell);
        return headerKeywords.some(kw => norm.includes(kw));
    });

    const dataStartIndex = hasHeader ? 1 : 0;
    const headers = hasHeader ? firstRowCells : undefined;

    // 컬럼 인덱스 추론 (헤더가 있는 경우)
    let voyageSequenceColIdx = -1;  // 📌 차수 (NEW!)
    let noColIdx = -1;
    let arrivalDateColIdx = -1;
    let nameColIdx = -1;
    let qtyColIdx = -1;
    let courierColIdx = -1;
    let weightColIdx = -1;
    let nationalityColIdx = -1;
    let classificationColIdx = -1;
    let featureColIdx = -1;
    let invoiceColIdx = -1;
    let cargoCategoryColIdx = -1;
    let cargoDescColIdx = -1;
    let descColIdx = -1;

    if (headers) {
        headers.forEach((h, i) => {
            const norm = normalizeHeader(h);
            const lower = h.toLowerCase().trim();

            // 📌 차수 (NEW!)
            if (norm.includes('차수') || norm.includes('seq')) voyageSequenceColIdx = i;

            // Fuzzy Header Matching(#4)
            else if (norm.includes('no') || lower === 'no.' || lower === '#') noColIdx = i;
            else if (norm.includes('입고') || norm.includes('date') || norm.includes('arrival')) arrivalDateColIdx = i;
            else if (norm.includes('이름') || norm.includes('name') || norm.includes('수령')) nameColIdx = i;
            else if (norm.includes('수량') || norm.includes('qty') || norm.includes('box') || norm.includes('count')) qtyColIdx = i;
            else if (norm.includes('택배') || norm.includes('courier') || norm.includes('dlv')) courierColIdx = i;
            else if (norm.includes('중량') || norm.includes('weight') || norm.includes('kg')) weightColIdx = i;
            else if (norm.includes('국적') || norm.includes('nation') || norm.includes('country')) nationalityColIdx = i;
            else if (norm.includes('분류') || norm.includes('class') || norm.includes('type')) classificationColIdx = i;
            else if (norm.includes('특징') || norm.includes('feature') || norm.includes('mark')) featureColIdx = i;
            else if (norm.includes('송장') || norm.includes('invoice') || norm.includes('inv')) invoiceColIdx = i;
            else if (norm.includes('카테고리') || norm.includes('category') || norm.includes('cat')) cargoCategoryColIdx = i;
            else if (norm.includes('화물') || norm.includes('내용') || norm.includes('item') || norm.includes('desc')) cargoDescColIdx = i;
            else if (norm.includes('비고') || norm.includes('note') || norm.includes('memo') || norm.includes('remark')) descColIdx = i;
        });
    }

    const rows: ParsedRow[] = [];
    const BATCH_SIZE = 50; // 📌 50행마다 UI Thread 양보

    for (let i = dataStartIndex; i < lines.length; i++) {
        // 📌 Async Batching: 50행마다 UI 스레드 양보
        if ((i - dataStartIndex) > 0 && (i - dataStartIndex) % BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const cells = splitRow(lines[i]);
        // 📌 모든 셀이 빈 경우만 건너뛰기
        if (cells.every(c => !c)) continue;

        let parsedRow: ParsedRow = {
            rowIndex: i + 1,
            qty: 1,
            rawName: '',
            rawCells: cells,
        };

        // 헤더 기반 파싱
        if (headers && (nameColIdx >= 0 || cells.length > 3)) {
            // 📌 차수 (NEW!)
            if (voyageSequenceColIdx >= 0) parsedRow.voyageSequence = cells[voyageSequenceColIdx];
            // 순번
            if (noColIdx >= 0 && cells[noColIdx]) {
                parsedRow.no = parseInt(cells[noColIdx].replace(/[^\d]/g, '')) || undefined;
            }
            // 입고일자 (#2 Date Chaos Fix)
            if (arrivalDateColIdx >= 0) parsedRow.arrivalDate = parseExcelDate(cells[arrivalDateColIdx]);

            // 택배사
            if (courierColIdx >= 0) parsedRow.courier = cells[courierColIdx];
            // 수령인 이름 (내용)
            if (nameColIdx >= 0) parsedRow.rawName = cells[nameColIdx] || '';
            // 수량
            if (qtyColIdx >= 0) {
                const qtyStr = cells[qtyColIdx]?.replace(/[^\d]/g, '');
                parsedRow.qty = parseInt(qtyStr) || 1;
            }
            // 중량
            if (weightColIdx >= 0) {
                const weightStr = cells[weightColIdx]?.replace(/[^\d.]/g, '');
                parsedRow.weight = parseFloat(weightStr) || undefined;
            }
            // 국적
            if (nationalityColIdx >= 0) parsedRow.nationality = cells[nationalityColIdx]?.toLowerCase();
            // 분류
            if (classificationColIdx >= 0) parsedRow.classification = cells[classificationColIdx]?.toLowerCase();
            // 특징
            if (featureColIdx >= 0) parsedRow.feature = cells[featureColIdx];
            // 송장
            if (invoiceColIdx >= 0) parsedRow.invoice = cells[invoiceColIdx];
            // 카테고리
            if (cargoCategoryColIdx >= 0) parsedRow.cargoCategory = cells[cargoCategoryColIdx];
            // 화물 설명
            if (cargoDescColIdx >= 0) parsedRow.cargoDesc = cells[cargoDescColIdx];
            // 비고
            if (descColIdx >= 0) parsedRow.desc = cells[descColIdx];

            // 전화번호 추출: 특징 -> 비고 -> 화물설명 순 (#7 Hidden Phone Fix)
            if (!parsedRow.phone && parsedRow.feature) parsedRow.phone = extractPhone(parsedRow.feature);
            if (!parsedRow.phone && parsedRow.desc) parsedRow.phone = extractPhone(parsedRow.desc);
            if (!parsedRow.phone && parsedRow.cargoDesc) parsedRow.phone = extractPhone(parsedRow.cargoDesc);
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

        // 📌 FIX: 비고 + 전체 셀에서 전화번호 재검색
        if (!parsedRow.phone) {
            const allText = cells.join(' ');
            const phone = extractPhone(allText);
            if (phone) parsedRow.phone = phone;
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

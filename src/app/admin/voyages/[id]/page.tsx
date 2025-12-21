"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Ship, ArrowLeft, Calendar, Package, Upload, Check, X as XIcon,
    AlertTriangle, HelpCircle, UserPlus, RefreshCw, Save, Loader2,
    Edit3, Trash2, MoreHorizontal, CheckCircle2, XCircle, AlertCircle,
    ChevronDown, Search, FileSpreadsheet, ArrowRight, Undo2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseGoogleSheetData, type ParsedRow } from '@/lib/packing-list-parser';
import type {
    Customer, Voyage, VoyageStatus,
    MatchStatus, StagingRecord, ConflictType, ConflictResolution, SimilarCandidate
} from '@/types';
import { useToast } from "@/hooks/use-toast";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// Firestore 서비스
import { saveCustomer, saveShipmentsBatch, updateCustomerStats, approveShipment, approveAllShipments } from '@/lib/firestore-service';
import { useCustomers, useShipments } from '@/hooks/use-erp-data';
import { isFirebaseConfigured } from '@/lib/firebase';
// Multi-Factor Matcher
import {
    performMultiFactorMatch,
    detectDuplicateGroups,
    normalizePhone,
    normalizeName as normalizeNameMF,
} from '@/lib/multi-factor-matcher';
import type { MatchConfidence, DuplicateGroup, EnhancedStagingRecord } from '@/types';
// 📌 NEW: StagingGrid 컴포넌트 및 어댑터
import { StagingGrid } from '@/components/voyage/StagingGrid';
import { convertRecordsToItems } from '@/lib/staging-adapter';
import type { StagingItem } from '@/types/staging';

// =============================================================================
// 상수 및 설정
// =============================================================================

const STATUS_CONFIG: Record<MatchStatus, {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    label: string;
    description: string;
}> = {
    VERIFIED: {
        icon: CheckCircle2,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        label: '확인됨',
        description: '고객 DB와 정확히 일치'
    },
    NEW_CUSTOMER: {
        icon: UserPlus,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        label: '신규',
        description: '등록되지 않은 고객'
    },
    UNTRACKED: {
        icon: XIcon,
        color: 'text-slate-400',
        bgColor: 'bg-slate-50',
        label: '비추적',
        description: '필터 외 항목 (저장됨)'
    },
};

const VOYAGE_STATUS_STYLES: Record<VoyageStatus, { bg: string; text: string; label: string }> = {
    READY: { bg: 'bg-blue-100', text: 'text-blue-700', label: '준비 중' },
    CLOSING: { bg: 'bg-orange-100', text: 'text-orange-700', label: '마감 임박' },
    CLOSED: { bg: 'bg-red-100', text: 'text-red-700', label: '마감 완료' },
    SAILING: { bg: 'bg-purple-100', text: 'text-purple-700', label: '운항 중' },
    ARRIVED: { bg: 'bg-green-100', text: 'text-green-700', label: '도착 완료' },
};

// =============================================================================
// 샘플 고객 DB (Production에서는 Firestore)
// =============================================================================

const MASTER_CUSTOMERS: Customer[] = [
    { id: '고관영', name: '고관영', nameEn: 'Ko Kyung Ah', podCode: 1, phone: '070 985 209', region: 'BKK', addressDetail: '2A Embassy Castel', stats: { count: 4, totalAmount: 118, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '명랑방콕(BKK)', name: '명랑방콕(BKK)', nameEn: 'Myung Rang', podCode: 2, phone: '092 240 030', region: 'BKK', addressDetail: 'myungrang cambodia', discountInfo: '단골 10%', stats: { count: 102, totalAmount: 7412, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '민경호', name: '민경호', nameEn: 'Min kyeong ho', podCode: 3, phone: '070 935 720', region: 'BKK', addressDetail: 'KB Daehan Specialized Bank', stats: { count: 0, totalAmount: 0, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '김성삼', name: '김성삼', podCode: 7, phone: '089 770 074', region: 'Toul Kork', addressDetail: '#1804, De castle Diamond', discountInfo: '단골할인 5%', stats: { count: 2, totalAmount: 1758, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '김창영(Home)', name: '김창영(Home)', podCode: 11, phone: '097 866 2408', region: 'BKK', stats: { count: 3, totalAmount: 349, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '송해진', name: '송해진', nameEn: 'Song Ha jin', podCode: 25, phone: '097 999 2785', region: '5 Sen Sok', discountInfo: '특별 5%', stats: { count: 13, totalAmount: 4086, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
    { id: '안은성', name: '안은성', nameEn: 'Ahn Eun Sung', podCode: 26, phone: '011 698 282', region: 'Toul Kork', stats: { count: 0, totalAmount: 0, totalCbm: 0 }, isActive: true, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } },
];

// =============================================================================
// 유틸리티 함수
// =============================================================================

// Levenshtein Distance 기반 유사도 (0~1)
const calculateSimilarity = (s1: string, s2: string): number => {
    const a = s1.toLowerCase().replace(/\s+/g, '');
    const b = s2.toLowerCase().replace(/\s+/g, '');

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
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }

    const maxLen = Math.max(a.length, b.length);
    return (maxLen - matrix[b.length][a.length]) / maxLen;
};

// 이름 정규화
const normalizeName = (name: string): string => {
    return name.replace(/\s+/g, '').replace(/\([^)]*\)/g, '').toLowerCase();
};

// ⚠️ normalizePhone은 multi-factor-matcher에서 import됨

// =============================================================================
// 충돌 해결 모달
// =============================================================================

const ConflictResolutionModal = ({
    isOpen,
    onClose,
    record,
    onResolve,
}: {
    isOpen: boolean;
    onClose: () => void;
    record: StagingRecord | null;
    onResolve: (stagingId: string, resolution: ConflictResolution) => void;
}) => {
    if (!record || !record.conflict) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="w-5 h-5" />
                        데이터 충돌 해결
                    </DialogTitle>
                    <DialogDescription>
                        고객 "{record.raw.name}"의 정보가 기존 데이터와 다릅니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 충돌 내역 */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="p-2 text-left">항목</th>
                                    <th className="p-2 text-left">기존 DB</th>
                                    <th className="p-2 text-left">입력 데이터</th>
                                </tr>
                            </thead>
                            <tbody>
                                {record.conflict.fields.map((field, idx) => (
                                    <tr key={idx} className="border-t">
                                        <td className="p-2 font-medium">{field.field}</td>
                                        <td className="p-2 text-muted-foreground">{field.masterValue || '-'}</td>
                                        <td className="p-2 text-amber-600 font-medium">{field.importedValue || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 선택 옵션 */}
                    <div className="space-y-3">
                        <Button
                            variant="outline"
                            className="w-full justify-start h-auto py-3"
                            onClick={() => onResolve(record.stagingId, 'UPDATE_MASTER')}
                        >
                            <div className="text-left">
                                <div className="font-medium">마스터 DB 업데이트</div>
                                <div className="text-xs text-muted-foreground">
                                    고객 DB의 정보를 새 데이터로 변경합니다.
                                </div>
                            </div>
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full justify-start h-auto py-3"
                            onClick={() => onResolve(record.stagingId, 'USE_ONCE')}
                        >
                            <div className="text-left">
                                <div className="font-medium">이번 건만 사용</div>
                                <div className="text-xs text-muted-foreground">
                                    이 화물에만 새 데이터를 사용하고, 고객 DB는 유지합니다.
                                </div>
                            </div>
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>나중에 결정</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =============================================================================
// 신규 고객 등록 모달
// =============================================================================

const NewCustomerModal = ({
    isOpen,
    onClose,
    defaultData,
    nextPodCode,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    defaultData: { name: string; phone?: string; region?: string };
    nextPodCode: number;
    onSave: (customer: Customer) => void;
}) => {
    const [formData, setFormData] = useState({
        name: defaultData.name,
        podCode: nextPodCode.toString(),
        phone: defaultData.phone || '',
        region: defaultData.region || '',
        addressDetail: '',
    });

    useEffect(() => {
        setFormData({
            name: defaultData.name,
            podCode: nextPodCode.toString(),
            phone: defaultData.phone || '',
            region: defaultData.region || '',
            addressDetail: '',
        });
    }, [defaultData, nextPodCode]);

    const handleSubmit = () => {
        const newCustomer: Customer = {
            id: formData.name,
            name: formData.name,
            podCode: parseInt(formData.podCode),
            phone: formData.phone,
            region: formData.region,
            addressDetail: formData.addressDetail || undefined,
            stats: { count: 0, totalAmount: 0, totalCbm: 0 },
            isActive: true,
            createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
        };
        onSave(newCustomer);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-purple-600" />
                        신규 고객 등록
                    </DialogTitle>
                    <DialogDescription>
                        고객 DB에 새 고객을 등록하고 이 화물에 연결합니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <Label>고객명 (Document ID) *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            이 이름이 고객 DB의 고유 키가 됩니다.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>POD No. *</Label>
                            <Input
                                type="number"
                                value={formData.podCode}
                                onChange={(e) => setFormData(prev => ({ ...prev, podCode: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>연락처 *</Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <Label>동네 *</Label>
                        <Input
                            value={formData.region}
                            onChange={(e) => setFormData(prev => ({ ...prev, region: e.target.value }))}
                            placeholder="BKK, Toul Kork, Sen Sok..."
                        />
                    </div>

                    <div>
                        <Label>상세 주소</Label>
                        <Input
                            value={formData.addressDetail}
                            onChange={(e) => setFormData(prev => ({ ...prev, addressDetail: e.target.value }))}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!formData.name || !formData.podCode || !formData.phone || !formData.region}
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        등록 및 연결
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =============================================================================
// 저장 확인 모달
// =============================================================================

const ImportConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    stats,
    isLoading,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    stats: { verified: number; conflict: number; resolved: number; total: number };
    isLoading: boolean;
}) => {
    const canImport = stats.verified > 0 || stats.resolved > 0;
    const importCount = stats.verified + stats.resolved;

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>화물 데이터 Import 확인</AlertDialogTitle>
                    <AlertDialogDescription>
                        다음 내용으로 항차에 화물을 등록합니다.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span>전체 데이터:</span>
                        <strong>{stats.total}건</strong>
                    </div>
                    <div className="flex justify-between text-green-600">
                        <span>✅ 확인됨 (바로 저장):</span>
                        <strong>{stats.verified}건</strong>
                    </div>
                    <div className="flex justify-between text-amber-600">
                        <span>⚠️ 충돌 해결됨:</span>
                        <strong>{stats.resolved}건</strong>
                    </div>
                    <hr />
                    <div className="flex justify-between font-bold">
                        <span>Import 예정:</span>
                        <strong className="text-primary">{importCount}건</strong>
                    </div>
                </div>

                {stats.total - importCount > 0 && (
                    <div className="text-sm text-orange-600 bg-orange-50 p-3 rounded-lg">
                        ⚠️ {stats.total - importCount}건은 Import되지 않습니다. (미해결 충돌/신규/유사 매칭)
                    </div>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} disabled={!canImport || isLoading}>
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        {importCount}건 Import
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

// =============================================================================
// 메인 페이지 컴포넌트
// =============================================================================

export default function VoyageImportPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    // 📌 URL 디코딩 필수! (한글 voyageId 지원)
    const voyageId = decodeURIComponent(params.id as string);

    // Firestore 고객 데이터 (실시간 구독)
    const { customers: firestoreCustomers, loading: customersLoading } = useCustomers(true);

    // 샘플 데이터 (Firebase 미설정 시 Fallback)
    const [localCustomers, setLocalCustomers] = useState<Customer[]>(MASTER_CUSTOMERS);

    // 실제 사용할 고객 목록
    const masterCustomers = isFirebaseConfigured && firestoreCustomers.length > 0
        ? firestoreCustomers
        : localCustomers;

    // 🆕 Import된 Shipments 실시간 구독
    const { shipments: importedShipments, loading: shipmentsLoading } = useShipments(voyageId);
    const [approving, setApproving] = useState(false);

    // 상태
    const [rawText, setRawText] = useState('');
    const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([]);
    const [filterStatus, setFilterStatus] = useState<MatchStatus | 'ALL'>('ALL');
    const [editingId, setEditingId] = useState<string | null>(null);

    // 📌 엑셀 스타일 필터 (전체 표시 후 필터링)
    const [filterName, setFilterName] = useState(''); // 이름 검색
    const [filterNationality, setFilterNationality] = useState<'all' | 'k' | 'c'>('all'); // 기본: 전체
    const [filterClassification, setFilterClassification] = useState<'all' | 'customer' | 'agency' | 'hana' | 'gmarket' | 'coupang' | 'noname'>('all'); // 기본: 전체

    // 모달 상태
    const [conflictModal, setConflictModal] = useState<{ isOpen: boolean; record: StagingRecord | null }>({ isOpen: false, record: null });
    const [newCustomerModal, setNewCustomerModal] = useState<{ isOpen: boolean; data: { name: string; phone?: string; region?: string } }>({ isOpen: false, data: { name: '' } });
    const [importConfirmModal, setImportConfirmModal] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // 다음 POD 코드
    const nextPodCode = useMemo(() => {
        const maxPod = Math.max(...masterCustomers.map(c => c.podCode), 0);
        return maxPod + 1;
    }, [masterCustomers]);

    // 항차 정보
    const voyage: Voyage = {
        id: voyageId,
        name: decodeURIComponent(voyageId).replace(/-/g, '.') || '2025-12-01 1차',
        status: 'READY',
        departureDate: { seconds: new Date('2025-12-15').getTime() / 1000, nanoseconds: 0 },
        cutoffDate: { seconds: new Date('2025-12-10').getTime() / 1000, nanoseconds: 0 },
        totalShipments: 0,
        totalCbm: 0,
        totalAmount: 0,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    };

    // ==========================================================================
    // 핵심 매칭 로직 (Exact Match Only Policy)
    // ==========================================================================

    const performMatching = useCallback((name: string, phone?: string, region?: string, address?: string): {
        status: MatchStatus;
        matchedCustomer: Customer | null;
        similarCandidates: SimilarCandidate[];
        warningFlag?: 'PHONE_MISMATCH' | 'REGION_MISMATCH' | null;
    } => {
        // 📌 Exact Match Only: 이름 정확 일치만!
        // Fuzzy 매칭 없음 (고객이 수동으로 Kim1, Kim2 등 관리)

        const trimmedName = name.trim().toLowerCase();

        // 정확한 이름 매칭 (대소문자 무시, 공백 trim)
        const exactMatch = masterCustomers.find(c =>
            c.name.trim().toLowerCase() === trimmedName
        );

        if (exactMatch) {
            // 이름 일치! 추가 정보 불일치는 경고만 표시
            let warningFlag: 'PHONE_MISMATCH' | 'REGION_MISMATCH' | null = null;

            if (phone && exactMatch.phone) {
                const inputPhone = phone.replace(/[^0-9]/g, '');
                const dbPhone = exactMatch.phone.replace(/[^0-9]/g, '');
                if (inputPhone.length >= 6 && dbPhone.length >= 6 && inputPhone !== dbPhone) {
                    warningFlag = 'PHONE_MISMATCH';
                }
            }

            return {
                status: 'VERIFIED',
                matchedCustomer: exactMatch,
                similarCandidates: [],
                warningFlag
            };
        }

        // 매칭 없음 -> 신규 고객
        return {
            status: 'NEW_CUSTOMER',
            matchedCustomer: null,
            similarCandidates: [],
            warningFlag: null
        };
    }, [masterCustomers]);

    // ==========================================================================
    // 데이터 파싱 (Multi-Factor Matcher 사용)
    // ==========================================================================

    const handleParse = useCallback(() => {
        if (!rawText.trim()) {
            setStagingRecords([]);
            return;
        }

        // 스마트 파서 실행
        const parseResult = parseGoogleSheetData(rawText);

        if (!parseResult.success) {
            toast({
                variant: "destructive",
                title: "파싱 실패",
                description: parseResult.warnings.join(', ') || '데이터를 분석할 수 없습니다.'
            });
            return;
        }

        // 파싱 결과 표시
        const formatInfo = parseResult.hasHeader ? '헤더 감지됨' : '스마트 감지';

        // 1단계: 중복 그룹 감지 (전화번호 기반)
        const duplicateGroups = detectDuplicateGroups(
            parseResult.rows.map(r => ({
                rowIndex: r.rowIndex,
                name: r.rawName,
                phone: r.phone,
                quantity: r.qty,
            }))
        );

        // 2단계: 중복 그룹에 고객 매칭
        for (const group of duplicateGroups) {
            const primaryRow = parseResult.rows.find(r => r.rowIndex === group.primaryRowIndex);
            if (primaryRow) {
                const { matchedCustomer, confidence } = performMultiFactorMatch(
                    primaryRow.rawName,
                    primaryRow.phone,
                    primaryRow.region,
                    masterCustomers
                );
                group.matchedCustomer = matchedCustomer;
                group.confidence = confidence;
            }
        }

        // 3단계: 각 행에 대해 매칭 수행
        const records: StagingRecord[] = [];
        const seenPhones = new Map<string, StagingRecord>(); // 전화번호로 중복 체크

        for (const row of parseResult.rows) {
            const normalizedPhone = normalizePhone(row.phone);

            // 중복 그룹 확인
            const duplicateGroup = duplicateGroups.find(g =>
                g.memberRowIndices.includes(row.rowIndex)
            );

            // Multi-Factor 매칭 수행
            const { matchedCustomer, confidence, status } = performMultiFactorMatch(
                row.rawName,
                row.phone,
                row.region,
                masterCustomers
            );

            // 📌 이름 정규화 함수 (비교용)
            const normalizeName = (n: string) => n?.trim().replace(/\s+/g, '').toLowerCase() || '';
            const currentName = normalizeName(row.rawName);

            // 초기 매칭 결과
            let finalMatchedCustomer = matchedCustomer;
            let finalStatus = status;

            // 전화번호가 같은 이전 레코드가 있으면 고객과 연결 시도
            // 📌 단, 이름도 일치해야 VERIFIED!
            if (normalizedPhone && seenPhones.has(normalizedPhone)) {
                const prevRecord = seenPhones.get(normalizedPhone)!;
                if (prevRecord.matchedCustomer) {
                    const prevCustomerName = normalizeName(prevRecord.matchedCustomer.name);
                    // 이름이 일치하면 VERIFIED, 아니면 NEW_CUSTOMER (수동 확인 필요)
                    if (currentName === prevCustomerName) {
                        finalMatchedCustomer = prevRecord.matchedCustomer;
                        finalStatus = 'VERIFIED';
                    } else {
                        // 이름 불일치 - 후보는 제시하되 자동 매칭 안함
                        finalMatchedCustomer = null;
                        finalStatus = 'NEW_CUSTOMER';
                    }
                }
            }

            // 중복 그룹의 고객 우선 적용 (이름 비교 포함)
            if (duplicateGroup?.matchedCustomer) {
                const groupCustomerName = normalizeName(duplicateGroup.matchedCustomer.name);
                if (currentName === groupCustomerName) {
                    finalMatchedCustomer = duplicateGroup.matchedCustomer;
                    finalStatus = 'VERIFIED';
                } else {
                    // 이름 불일치 - 후보만 제시
                    finalMatchedCustomer = null;
                    finalStatus = 'NEW_CUSTOMER';
                }
            }

            // 📌 Smart Scope: 국적/분류 필터 확인
            // 필터 범위 밖이면 UNTRACKED로 설정 (저장은 하되 매칭 안함)
            const rowNationality = row.nationality?.toLowerCase() || '';
            const rowClassification = row.classification?.toLowerCase() || '';

            const isInNationalityScope = filterNationality === 'all' || rowNationality === filterNationality || !rowNationality;
            const isInClassificationScope = filterClassification === 'all' || rowClassification === filterClassification || !rowClassification;
            const isInScope = isInNationalityScope && isInClassificationScope;

            // 필터 범위 밖이면 UNTRACKED
            if (!isInScope) {
                finalStatus = 'UNTRACKED';
                finalMatchedCustomer = null;
            }

            const record: StagingRecord = {
                stagingId: `stg-${row.rowIndex}-${Date.now()}`,
                rowIndex: row.rowIndex,
                raw: {
                    name: row.rawName,
                    phone: row.phone,
                    region: row.region,
                    description: row.desc,
                    quantity: row.qty,
                    memo: row.courier ? `택배: ${row.courier}${row.weight ? `, 중량: ${row.weight}kg` : ''}` : undefined,
                },
                edited: {
                    name: row.rawName,
                    phone: row.phone,
                    region: row.region,
                },
                matchStatus: finalStatus,
                matchedCustomer: finalMatchedCustomer,
                similarCandidates: [],
                isSelected: finalStatus === 'VERIFIED',
                isResolved: finalStatus === 'VERIFIED' || finalStatus === 'UNTRACKED',
                createdAt: Date.now(),
            };

            // 국적/분류 정보 추가 저장 (raw에 확장)
            (record as any).nationality = rowNationality;
            (record as any).classification = rowClassification;
            (record as any).arrivalDate = row.arrivalDate;
            (record as any).cargoCategory = row.cargoCategory;
            (record as any).cargoDesc = row.cargoDesc;
            (record as any).feature = row.feature;
            (record as any).invoice = row.invoice;  // 📌 송장 추가
            (record as any).courier = row.courier;
            (record as any).weight = row.weight;

            records.push(record);

            // 전화번호 인덱스 업데이트
            if (normalizedPhone && !seenPhones.has(normalizedPhone)) {
                seenPhones.set(normalizedPhone, record);
            }
        }

        setStagingRecords(records);

        // 경고 메시지 처리
        if (parseResult.warnings.length > 0) {
            console.warn('Parser warnings:', parseResult.warnings);
        }

        // 중복 그룹 정보 표시
        const duplicateCount = duplicateGroups.reduce((sum, g) => sum + g.memberRowIndices.length - 1, 0);

        // 📌 단순화된 stats (Exact Match Only)
        const stats = {
            verified: records.filter(r => r.matchStatus === 'VERIFIED').length,
            newCustomer: records.filter(r => r.matchStatus === 'NEW_CUSTOMER').length,
            untracked: records.filter(r => r.matchStatus === 'UNTRACKED').length,
        };

        const trackedCount = records.length - stats.untracked;

        toast({
            title: `파싱 완료 (${formatInfo})`,
            description: `${records.length}건 저장 (✅${stats.verified} 매칭, ➕${stats.newCustomer} 신규, ${stats.untracked} 비추적)`
        });
    }, [rawText, masterCustomers, toast, filterNationality, filterClassification]);

    // ==========================================================================
    // 레코드 조작
    // ==========================================================================

    // 이름 수정 후 재매칭
    const handleEditName = useCallback((stagingId: string, newName: string) => {
        setStagingRecords(prev => prev.map(record => {
            if (record.stagingId !== stagingId) return record;

            const matchResult = performMatching(
                newName,
                record.raw.phone,
                record.raw.region,
                record.raw.address
            );

            return {
                ...record,
                edited: { ...record.edited, name: newName },
                matchStatus: matchResult.status,
                matchedCustomer: matchResult.matchedCustomer,
                similarCandidates: [],
                warningFlag: matchResult.warningFlag,
                isSelected: matchResult.status === 'VERIFIED',
                isResolved: matchResult.status === 'VERIFIED',
            };
        }));
        setEditingId(null);
    }, [performMatching]);

    // 유사 매칭 선택
    const handleSelectSimilar = useCallback((stagingId: string, customer: Customer) => {
        setStagingRecords(prev => prev.map(record => {
            if (record.stagingId !== stagingId) return record;
            return {
                ...record,
                matchStatus: 'VERIFIED',
                matchedCustomer: customer,
                similarCandidates: [],
                isSelected: true,
                isResolved: true,
            };
        }));
    }, []);

    // 충돌 해결
    const handleResolveConflict = useCallback((stagingId: string, resolution: ConflictResolution) => {
        setStagingRecords(prev => prev.map(record => {
            if (record.stagingId !== stagingId || !record.conflict) return record;
            return {
                ...record,
                conflict: { ...record.conflict, resolution },
                isSelected: true,
                isResolved: true,
            };
        }));
        setConflictModal({ isOpen: false, record: null });
        toast({ title: "충돌 해결됨", description: resolution === 'UPDATE_MASTER' ? "마스터 DB가 업데이트됩니다." : "이번 건만 새 데이터를 사용합니다." });
    }, [toast]);

    // 신규 고객 등록 (Firestore 연동)
    const handleNewCustomerSave = useCallback(async (customer: Customer) => {
        // Firestore에 저장
        if (isFirebaseConfigured) {
            try {
                await saveCustomer(customer);
            } catch (e) {
                console.error('Customer save failed:', e);
                toast({ variant: "destructive", title: "고객 등록 실패" });
                return;
            }
        } else {
            // 로컬 상태에 추가 (Fallback)
            setLocalCustomers(prev => [...prev, customer]);
        }

        // 해당 레코드 업데이트
        setStagingRecords(prev => prev.map(record => {
            const normalizedNewName = normalizeName(customer.name);
            const normalizedRecordName = normalizeName(record.edited.name);

            if (normalizedNewName === normalizedRecordName ||
                normalizedNewName.includes(normalizedRecordName) ||
                normalizedRecordName.includes(normalizedNewName)) {
                return {
                    ...record,
                    matchStatus: 'VERIFIED',
                    matchedCustomer: customer,
                    similarCandidates: [],
                    isSelected: true,
                    isResolved: true,
                };
            }
            return record;
        }));

        toast({ title: "고객 등록 완료", description: `${customer.name} (POD #${customer.podCode})` });
    }, [toast]);

    // 레코드 삭제
    const handleDeleteRecord = useCallback((stagingId: string) => {
        setStagingRecords(prev => prev.filter(r => r.stagingId !== stagingId));
    }, []);

    // 전체 재매칭
    const handleRematchAll = useCallback(() => {
        setStagingRecords(prev => {
            // 📌 중복 체크 제거: 패킹리스트에서는 같은 이름이 날짜별로 여러 번 나올 수 있음
            return prev.map(record => {
                // UNTRACKED 상태는 재매칭하지 않음
                if (record.matchStatus === 'UNTRACKED') {
                    return record;
                }

                const matchResult = performMatching(
                    record.edited.name,
                    record.edited.phone,
                    record.edited.region,
                    record.edited.address
                );

                return {
                    ...record,
                    matchStatus: matchResult.status,
                    matchedCustomer: matchResult.matchedCustomer,
                    similarCandidates: matchResult.similarCandidates,
                    conflict: matchResult.conflict,
                    isSelected: matchResult.status === 'VERIFIED',
                    isResolved: matchResult.status === 'VERIFIED',
                };
            });
        });
        toast({ title: "전체 재매칭 완료" });
    }, [performMatching, toast]);

    // ==========================================================================
    // Import 실행
    // ==========================================================================

    const handleImport = useCallback(async () => {
        setIsImporting(true);
        try {
            // 📌 Save All 정책: 모든 레코드 저장 (UNTRACKED 포함)
            const toImport = stagingRecords;

            if (toImport.length === 0) {
                toast({ variant: "destructive", title: "저장할 데이터 없음" });
                return;
            }

            // 1. 마스터 DB 업데이트 (UPDATE_MASTER resolution인 경우)
            const masterUpdates = toImport.filter(r => r.conflict?.resolution === 'UPDATE_MASTER');
            for (const record of masterUpdates) {
                if (record.matchedCustomer && isFirebaseConfigured) {
                    try {
                        await saveCustomer({
                            ...record.matchedCustomer,
                            phone: record.raw.phone || record.matchedCustomer.phone,
                            region: record.raw.region || record.matchedCustomer.region,
                            addressDetail: record.raw.address || record.matchedCustomer.addressDetail,
                        });
                    } catch (e) {
                        console.error('Master update failed:', e);
                    }
                }
            }

            // 2. shipments 컬렉션에 화물 추가
            const shipmentsData = toImport.map(r => ({
                customerId: r.matchedCustomer?.id || r.edited.name,
                customerName: r.matchedCustomer?.name || r.edited.name,
                podCode: r.matchedCustomer?.podCode || 0,
                quantity: r.raw.quantity || 1,
                description: r.raw.description,
                memo: r.raw.memo,
            }));

            if (isFirebaseConfigured) {
                const result = await saveShipmentsBatch(voyageId, shipmentsData);

                if (result.errors.length > 0) {
                    console.error('Import errors:', result.errors);
                }

                toast({
                    title: "Import 완료!",
                    description: `${result.savedCount}건이 항차에 추가되었습니다.${result.errors.length > 0 ? ` (오류: ${result.errors.length}건)` : ''}`
                });
            } else {
                // Firebase 미설정 시 시뮬레이션
                await new Promise(r => setTimeout(r, 1000));
                toast({
                    title: "Import 완료! (Demo)",
                    description: `${toImport.length}건이 저장되었습니다. (Firebase 미연결)`
                });
            }

            // 성공한 레코드 제거
            setStagingRecords(prev => prev.filter(r => !toImport.some(i => i.stagingId === r.stagingId)));
            setImportConfirmModal(false);

        } catch (error) {
            console.error('Import error:', error);
            toast({ variant: "destructive", title: "Import 실패", description: String(error) });
        } finally {
            setIsImporting(false);
        }
    }, [stagingRecords, voyageId, toast]);

    // ==========================================================================
    // 필터링 및 통계
    // ==========================================================================

    // 📌 엑셀 스타일 필터링 (모든 필터 조합)
    const filteredRecords = useMemo(() => {
        return stagingRecords.filter(record => {
            // 상태 필터
            if (filterStatus !== 'ALL' && record.matchStatus !== filterStatus) return false;

            // 이름 검색 필터
            if (filterName.trim()) {
                const searchTerm = filterName.toLowerCase();
                const recordName = (record.edited?.name || record.raw?.name || '').toLowerCase();
                if (!recordName.includes(searchTerm)) return false;
            }

            // 국적 필터
            const recordNationality = ((record as any).nationality || '').toLowerCase();
            if (filterNationality !== 'all' && recordNationality !== filterNationality) return false;

            // 분류 필터
            const recordClassification = ((record as any).classification || '').toLowerCase();
            if (filterClassification !== 'all' && recordClassification !== filterClassification) return false;

            return true;
        });
    }, [stagingRecords, filterStatus, filterName, filterNationality, filterClassification]);

    const stats = useMemo(() => ({
        total: stagingRecords.length,
        verified: stagingRecords.filter(r => r.matchStatus === 'VERIFIED').length,
        newCustomer: stagingRecords.filter(r => r.matchStatus === 'NEW_CUSTOMER').length,
        untracked: stagingRecords.filter(r => r.matchStatus === 'UNTRACKED').length,
        selected: stagingRecords.filter(r => r.isSelected && r.isResolved).length,
        // 📌 ImportConfirmModal에서 필요한 속성 추가
        resolved: stagingRecords.filter(r => r.isResolved && r.matchStatus !== 'VERIFIED').length,
        conflict: stagingRecords.filter(r => !r.isResolved && r.matchStatus !== 'VERIFIED' && r.matchStatus !== 'UNTRACKED').length,
    }), [stagingRecords]);

    const voyageStatus = VOYAGE_STATUS_STYLES[voyage.status];

    // ==========================================================================
    // 렌더링
    // ==========================================================================

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
            {/* 헤더 */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/admin/voyages')}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <Ship className="w-6 h-6 text-primary" />
                        <h1 className="text-xl sm:text-2xl font-bold">{voyage.name}</h1>
                        <Badge className={cn(voyageStatus.bg, voyageStatus.text)}>{voyageStatus.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        패킹리스트 Import · 마감: {new Date(voyage.cutoffDate.seconds * 1000).toLocaleDateString('ko-KR')}
                    </p>
                </div>
            </div>

            {/* Step 1: 데이터 입력 */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                        패킹리스트 붙여넣기
                    </CardTitle>
                    <CardDescription>
                        구글 시트에서 헤더 포함하여 복사한 후 아래에 붙여넣으세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Textarea
                        placeholder={`이름\tContact\t동네\t상세주소\t물품\t수량\t메모
고관영\t070 985 209\tBKK\t2A Embassy\t가전\t2\t
명랑방콕\t092 240 030\tBKK\tmyungrang\t식품\t5\t할인고객`}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        rows={6}
                        className="font-mono text-sm"
                    />
                    <div className="flex gap-3">
                        <Button onClick={handleParse} disabled={!rawText.trim()}>
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            데이터 분석
                        </Button>
                        {stagingRecords.length > 0 && (
                            <Button variant="outline" onClick={() => { setRawText(''); setStagingRecords([]); }}>
                                <Undo2 className="w-4 h-4 mr-2" />
                                초기화
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Step 2: Staging Area */}
            {stagingRecords.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                                데이터 검증 (Staging Area)
                            </CardTitle>
                            <Button variant="outline" size="sm" onClick={handleRematchAll}>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                전체 재매칭
                            </Button>
                        </div>
                        <CardDescription>
                            각 행의 매칭 상태를 확인하고 필요시 수정하세요. 확인된 데이터만 Import됩니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* 📌 StagingGrid has its own tabs, removed duplicate tabs here */}

                        {/* 📌 엑셀 스타일 필터 */}
                        <div className="flex flex-wrap items-center gap-4 p-3 border rounded-lg bg-slate-50">
                            <span className="text-sm font-medium text-slate-700">🔍 필터:</span>

                            {/* 이름 검색 */}
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder="이름 검색..."
                                    value={filterName}
                                    onChange={(e) => setFilterName(e.target.value)}
                                    className="w-[150px] h-8"
                                />
                            </div>

                            {/* 국적 필터 */}
                            <div className="flex items-center gap-2">
                                <Label className="text-sm">국적</Label>
                                <Select value={filterNationality} onValueChange={(v: 'all' | 'k' | 'c') => setFilterNationality(v)}>
                                    <SelectTrigger className="w-[100px] h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">전체</SelectItem>
                                        <SelectItem value="k">🇰🇷 한국</SelectItem>
                                        <SelectItem value="c">🇰🇭 캄보디아</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* 분류 필터 */}
                            <div className="flex items-center gap-2">
                                <Label className="text-sm">분류</Label>
                                <Select value={filterClassification} onValueChange={(v: 'all' | 'customer' | 'agency' | 'hana' | 'gmarket' | 'coupang' | 'noname') => setFilterClassification(v)}>
                                    <SelectTrigger className="w-[120px] h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">전체</SelectItem>
                                        <SelectItem value="customer">👤 Customer</SelectItem>
                                        <SelectItem value="agency">🏢 Agency</SelectItem>
                                        <SelectItem value="hana">🟣 Hana</SelectItem>
                                        <SelectItem value="gmarket">🟢 Gmarket</SelectItem>
                                        <SelectItem value="coupang">🟡 Coupang</SelectItem>
                                        <SelectItem value="noname">⚪ 무기명</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* 필터 결과 표시 */}
                            <span className="text-xs text-slate-600 ml-auto">
                                표시: <strong>{filteredRecords.length}</strong> / {stagingRecords.length}건
                            </span>

                            {/* 필터 초기화 */}
                            {(filterName || filterNationality !== 'all' || filterClassification !== 'all' || filterStatus !== 'ALL') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                        setFilterName('');
                                        setFilterNationality('all');
                                        setFilterClassification('all');
                                        setFilterStatus('ALL');
                                    }}
                                >
                                    초기화
                                </Button>
                            )}
                        </div>

                        {/* 📌 NEW: StagingGrid 컴포넌트 */}
                        <StagingGrid
                            items={convertRecordsToItems(filteredRecords)}
                            customers={masterCustomers}
                            onUpdateItem={(id, updates) => {
                                // 이름 수정 처리
                                if (updates.name) {
                                    handleEditName(id, updates.name);
                                }
                            }}
                            onArchiveItem={(id) => {
                                // 아카이브 처리 (TODO)
                                console.log('Archive:', id);
                            }}
                            onQuickRegister={(item) => {
                                // 신규 등록 모달 열기
                                setNewCustomerModal({
                                    isOpen: true,
                                    data: {
                                        name: item.edited.name,
                                        phone: item.parsed.phone,
                                        region: ''
                                    }
                                });
                            }}
                            onLinkCustomer={(itemId, customerId) => {
                                // 고객 연결 처리
                                const customer = masterCustomers.find(c => c.id === customerId);
                                if (customer) {
                                    setStagingRecords(prev => prev.map(r =>
                                        r.stagingId === itemId
                                            ? {
                                                ...r,
                                                matchedCustomer: customer,
                                                matchStatus: 'VERIFIED' as const,
                                                edited: { ...r.edited, name: customer.name },  // 이름도 업데이트
                                                isSelected: true,
                                                isResolved: true,
                                            }
                                            : r
                                    ));
                                    toast({ title: '고객 연결 완료', description: `${customer.name} (#${customer.podCode})` });
                                }
                            }}
                            onSaveAll={() => {
                                // Import 확인 모달 열기
                                setImportConfirmModal(true);
                            }}
                            isSaving={false}
                        />
                    </CardContent>
                </Card>
            )}

            {/* 🆕 Step 3: Import된 Shipments 목록 (검토 및 승인) */}
            {importedShipments.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold">3</span>
                                    Import된 화물 목록
                                    <Badge variant="secondary">{importedShipments.length}건</Badge>
                                </CardTitle>
                                <CardDescription>
                                    데이터를 검토하고 승인하세요. 승인된 화물만 CBM 측정이 가능합니다.
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={approving || importedShipments.filter(s => s.status === 'DRAFT').length === 0}
                                    onClick={async () => {
                                        setApproving(true);
                                        try {
                                            const count = await approveAllShipments(voyageId);
                                            toast({ title: "전체 승인 완료", description: `${count}건이 승인되었습니다.` });
                                        } catch (e) {
                                            toast({ variant: "destructive", title: "승인 실패" });
                                        } finally {
                                            setApproving(false);
                                        }
                                    }}
                                >
                                    {approving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                    전체 승인 ({importedShipments.filter(s => s.status === 'DRAFT').length}건)
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {shipmentsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted">
                                        <tr>
                                            <th className="px-3 py-2 text-left">상태</th>
                                            <th className="px-3 py-2 text-left">고객명</th>
                                            <th className="px-3 py-2 text-left">POD</th>
                                            <th className="px-3 py-2 text-center">수량</th>
                                            <th className="px-3 py-2 text-center">액션</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importedShipments.map(shipment => (
                                            <tr key={shipment.id} className="border-t hover:bg-muted/50">
                                                <td className="px-3 py-2">
                                                    {shipment.status === 'DRAFT' ? (
                                                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">📝 검토중</Badge>
                                                    ) : shipment.status === 'APPROVED' ? (
                                                        <Badge variant="secondary" className="bg-green-100 text-green-800">✅ 승인됨</Badge>
                                                    ) : (
                                                        <Badge variant="secondary">{shipment.status}</Badge>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 font-medium">{shipment.snapshot?.customerName || shipment.customerName}</td>
                                                <td className="px-3 py-2 text-muted-foreground">#{shipment.snapshot?.customerPodCode || shipment.customerPodCode}</td>
                                                <td className="px-3 py-2 text-center">{shipment.quantity || 1}</td>
                                                <td className="px-3 py-2 text-center">
                                                    {shipment.status === 'DRAFT' && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 text-xs"
                                                            onClick={async () => {
                                                                try {
                                                                    await approveShipment(shipment.id);
                                                                    toast({ title: "승인 완료" });
                                                                } catch (e) {
                                                                    toast({ variant: "destructive", title: "승인 실패" });
                                                                }
                                                            }}
                                                        >
                                                            <Check className="w-3 h-3 mr-1" />
                                                            승인
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="mt-3 text-xs text-muted-foreground">
                            📌 DRAFT: 검토 필요 | ✅ APPROVED: CBM 측정 가능
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 모달들 */}
            <ConflictResolutionModal
                isOpen={conflictModal.isOpen}
                onClose={() => setConflictModal({ isOpen: false, record: null })}
                record={conflictModal.record}
                onResolve={handleResolveConflict}
            />

            <NewCustomerModal
                isOpen={newCustomerModal.isOpen}
                onClose={() => setNewCustomerModal({ isOpen: false, data: { name: '' } })}
                defaultData={newCustomerModal.data}
                nextPodCode={nextPodCode}
                onSave={handleNewCustomerSave}
            />

            <ImportConfirmModal
                isOpen={importConfirmModal}
                onClose={() => setImportConfirmModal(false)}
                onConfirm={handleImport}
                stats={stats}
                isLoading={isImporting}
            />
        </div>
    );
}

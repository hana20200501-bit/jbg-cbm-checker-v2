"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Users, Upload, Search, Plus, Edit2, Trash2,
    Loader2, CheckCircle, AlertCircle, FileSpreadsheet,
    Phone, MapPin, Percent, X, Save, Hash, Truck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Customer, CustomerStats } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
// 🔥 Firestore 연동
import { useCustomers } from '@/hooks/use-erp-data';
import { saveCustomer, deactivateCustomer, deactivateCustomers, deactivateAllCustomers, saveCustomersBatch } from '@/lib/firestore-service';
import { isFirebaseConfigured } from '@/lib/firebase';
import { CustomerTable } from '@/components/customer/CustomerTable';

// 기본 통계
const defaultStats: CustomerStats = {
    count: 0,
    totalAmount: 0,
    totalCbm: 0,
};

// 샘플 데이터 (개발용 - 실제로는 Firestore에서 로드)
// ⚠️ id = 한글 이름 (Document ID)
const SAMPLE_CUSTOMERS: Customer[] = [
    {
        id: '고관영',  // Document ID = 한글 이름!
        name: '고관영',
        nameEn: 'Ko Kyung Ah',
        podCode: 1,  // No. = POD (필수!)
        phone: '070 985 209',
        region: 'BKK',
        addressDetail: '2A Embassy Castel',
        discountInfo: '할인정보 없음',
        discountPercent: 0,
        deliveryMemo: '',
        stats: { count: 4, totalAmount: 118, totalCbm: 0 },
        isActive: true,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
    {
        id: '명랑방콕(BKK)',
        name: '명랑방콕(BKK)',
        nameEn: 'Myung Rang(BKK)',
        podCode: 2,
        phone: '092 240 030',
        region: 'BKK',
        addressDetail: 'myungrang cambodia',
        discountInfo: '단골할인 10%',
        discountPercent: 10,
        deliveryMemo: '항동 1개 가능 / $9.19',
        stats: { count: 102, totalAmount: 7412, totalCbm: 0 },
        isActive: true,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
    {
        id: '민경호',
        name: '민경호',
        nameEn: 'Min kyeong ho',
        podCode: 3,
        phone: '070 935 720',
        region: 'BKK',
        addressDetail: 'KB Daehan Specialized Bank',
        discountInfo: '',
        deliveryMemo: '',
        stats: { count: 0, totalAmount: 0, totalCbm: 0 },
        isActive: true,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
    },
];

// 고객 카드 컴포넌트
const CustomerCard = ({
    customer,
    onView,
    onEdit,
    onDelete
}: {
    customer: Customer;
    onView: () => void;  // 📌 NEW: 상세 페이지 이동
    onEdit: () => void;
    onDelete: () => void;
}) => (
    <Card
        className={cn(
            "hover:shadow-md transition-shadow cursor-pointer",
            !customer.isActive && "opacity-50"
        )}
        onClick={onView}  // 📌 카드 클릭 시 상세 페이지로 이동
    >
        <CardContent className="p-4">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg truncate">{customer.name}</h3>
                        <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                            #{customer.podCode}
                        </span>
                        {/* 📌 Priority Badge */}
                        {customer.preferences?.priority === 'VIP' && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">⭐ VIP</span>
                        )}
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3" />
                            <span>{customer.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">
                                {[customer.region, customer.addressDetail].filter(Boolean).join(' - ')}
                            </span>
                        </div>
                        {customer.discountInfo && (
                            <div className="flex items-center gap-2 text-green-600">
                                <Percent className="w-3 h-3" />
                                <span>{customer.discountInfo}</span>
                            </div>
                        )}
                        {customer.deliveryMemo && (
                            <div className="flex items-center gap-2 text-orange-600">
                                <Truck className="w-3 h-3" />
                                <span className="truncate">{customer.deliveryMemo}</span>
                            </div>
                        )}
                    </div>

                    {/* 통계 */}
                    <div className="flex gap-4 mt-3 pt-3 border-t text-xs">
                        <div>
                            <span className="text-muted-foreground">이용:</span>{' '}
                            <span className="font-semibold">{customer.stats.count}회</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">누적:</span>{' '}
                            <span className="font-semibold">${customer.stats.totalAmount.toLocaleString()}</span>
                        </div>
                        {/* 📌 미수금 표시 */}
                        {(customer.financials?.currentCredit ?? 0) > 0 && (
                            <div className="text-red-600">
                                <span>미수금:</span>{' '}
                                <span className="font-semibold">${customer.financials?.currentCredit?.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                        <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
);

// 엑셀 Import 모달
const ExcelImportModal = ({
    isOpen,
    onClose,
    onImport,
}: {
    isOpen: boolean;
    onClose: () => void;
    onImport: (data: string) => void;
}) => {
    const [pasteData, setPasteData] = useState('');
    const [previewData, setPreviewData] = useState<any[]>([]);

    const handlePaste = (value: string) => {
        setPasteData(value);

        // 탭/줄바꿈으로 파싱
        const lines = value.trim().split('\n');
        if (lines.length > 1) {
            const headers = lines[0].split('\t');
            const rows = lines.slice(1).map(line => {
                const cells = line.split('\t');
                const row: any = {};
                headers.forEach((h, i) => {
                    row[h.trim()] = cells[i]?.trim() || '';
                });
                return row;
            });
            setPreviewData(rows.slice(0, 5)); // 미리보기 5개만
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5" />
                        엑셀 데이터 붙여넣기
                    </DialogTitle>
                    <DialogDescription>
                        엑셀에서 고객 데이터를 복사하여 아래에 붙여넣으세요.
                        첫 번째 행은 헤더(이름, 연락처, 지역, 주소, 할인메모)로 인식됩니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="paste-area">데이터 붙여넣기</Label>
                        <Textarea
                            id="paste-area"
                            placeholder="엑셀에서 복사한 데이터를 여기에 붙여넣으세요..."
                            value={pasteData}
                            onChange={(e) => handlePaste(e.target.value)}
                            rows={6}
                            className="font-mono text-sm"
                        />
                    </div>

                    {previewData.length > 0 && (
                        <div>
                            <Label>미리보기 (최대 5개)</Label>
                            <div className="border rounded-md overflow-x-auto mt-2">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted">
                                        <tr>
                                            {Object.keys(previewData[0]).map((key) => (
                                                <th key={key} className="p-2 text-left font-medium">{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.map((row, i) => (
                                            <tr key={i} className="border-t">
                                                {Object.values(row).map((val, j) => (
                                                    <td key={j} className="p-2">{String(val)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                총 {pasteData.trim().split('\n').length - 1}개 행이 감지되었습니다.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button onClick={() => onImport(pasteData)} disabled={!pasteData.trim()}>
                        <Upload className="w-4 h-4 mr-2" />
                        가져오기
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// 고객 편집/추가 모달
const CustomerEditModal = ({
    customer,
    isOpen,
    onClose,
    onSave,
}: {
    customer: Customer | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<Customer>) => void;
}) => {
    const [formData, setFormData] = useState({
        name: customer?.name || '',
        nameEn: customer?.nameEn || '',
        podCode: customer?.podCode?.toString() || '',
        phone: customer?.phone || '',
        region: customer?.region || '',
        addressDetail: customer?.addressDetail || '',
        discountInfo: customer?.discountInfo || '',
        discountPercent: customer?.discountPercent?.toString() || '',
        deliveryMemo: customer?.deliveryMemo || '',
    });

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        // ⚠️ Document ID = 한글 이름
        const customerId = formData.name.trim();
        if (!customerId) return;

        onSave({
            id: customerId,  // Document ID = 이름!
            name: formData.name,
            nameEn: formData.nameEn || undefined,
            podCode: parseInt(formData.podCode) || 0,
            phone: formData.phone,
            region: formData.region,
            addressDetail: formData.addressDetail || undefined,
            discountInfo: formData.discountInfo || undefined,
            discountPercent: formData.discountPercent ? parseFloat(formData.discountPercent) : undefined,
            deliveryMemo: formData.deliveryMemo || undefined,
        });
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{customer ? '고객 정보 수정' : '신규 고객 등록'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label htmlFor="name">고객명 *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                placeholder="김철수(프놈펜)"
                            />
                        </div>

                        <div>
                            <Label htmlFor="podCode">TrackPod No.</Label>
                            <Input
                                id="podCode"
                                type="number"
                                value={formData.podCode}
                                onChange={(e) => handleChange('podCode', e.target.value)}
                                placeholder="101"
                            />
                        </div>

                        <div>
                            <Label htmlFor="phone">연락처</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                placeholder="010-1234-5678"
                            />
                        </div>

                        <div>
                            <Label htmlFor="region">동네 *</Label>
                            <Input
                                id="region"
                                value={formData.region}
                                onChange={(e) => handleChange('region', e.target.value)}
                                placeholder="BKK, Toul Kork, Camko"
                            />
                        </div>

                        <div>
                            <Label htmlFor="discountPercent">할인율 (%)</Label>
                            <Input
                                id="discountPercent"
                                type="number"
                                value={formData.discountPercent}
                                onChange={(e) => handleChange('discountPercent', e.target.value)}
                                placeholder="10"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label htmlFor="nameEn">영문 이름 (ENG name)</Label>
                            <Input
                                id="nameEn"
                                value={formData.nameEn}
                                onChange={(e) => handleChange('nameEn', e.target.value)}
                                placeholder="Ko Kyung Ah"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label htmlFor="addressDetail">상세 주소</Label>
                            <Input
                                id="addressDetail"
                                value={formData.addressDetail}
                                onChange={(e) => handleChange('addressDetail', e.target.value)}
                                placeholder="2A Embassy Castel"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label htmlFor="discountInfo">할인 정보</Label>
                            <Input
                                id="discountInfo"
                                value={formData.discountInfo}
                                onChange={(e) => handleChange('discountInfo', e.target.value)}
                                placeholder="선교사할인 10%, 5% 급결제"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label htmlFor="deliveryMemo">배송 메모</Label>
                            <Textarea
                                id="deliveryMemo"
                                value={formData.deliveryMemo}
                                onChange={(e) => handleChange('deliveryMemo', e.target.value)}
                                placeholder="항공 1개 가능 / $9.19"
                                rows={2}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
                        <Save className="w-4 h-4 mr-2" />
                        저장
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function CustomersPage() {
    const { toast } = useToast();
    const router = useRouter();

    // 🔥 Firestore 고객 데이터 (실시간 구독)
    const { customers: firestoreCustomers, loading: customersLoading } = useCustomers(false); // false = 비활성 포함

    // 샘플 데이터 (Firebase 미설정 시 Fallback)
    const [localCustomers, setLocalCustomers] = useState<Customer[]>(SAMPLE_CUSTOMERS);

    // 실제 사용할 고객 목록
    const customers = isFirebaseConfigured && firestoreCustomers.length > 0
        ? firestoreCustomers
        : localCustomers;

    // 상태
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

    // 🗑️ 선택삭제 / 전체삭제 상태
    const [customersToDelete, setCustomersToDelete] = useState<Customer[]>([]);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

    // 필터링된 고객 목록
    const filteredCustomers = useMemo(() => {
        const activeCustomers = customers.filter(c => c.isActive);
        if (!searchTerm.trim()) return activeCustomers;

        const term = searchTerm.toLowerCase();
        return activeCustomers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.nameEn?.toLowerCase().includes(term) ||
            c.phone?.includes(term) ||
            c.region?.toLowerCase().includes(term) ||
            c.podCode.toString().includes(term)
        );
    }, [customers, searchTerm]);

    // 엑셀 import 처리
    const handleImport = async (data: string) => {
        setIsLoading(true);
        try {
            const lines = data.trim().split('\n');
            const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());

            console.log('[handleImport] Headers:', headers);

            // 컬럼 매핑 (엑셀 양식에 맞게 - 유연한 매칭)
            const noIdx = headers.findIndex(h => h === 'no' || h === 'no.' || h.includes('번호'));
            const nameIdx = headers.findIndex(h => h.includes('이름') || h === '이 름' || h === '성함');
            const nameEnIdx = headers.findIndex(h => h.includes('eng') || h.includes('영문') || h.includes('영어'));
            const phoneIdx = headers.findIndex(h => h.includes('contact') || h.includes('연락') || h.includes('전화') || h.includes('핸드폰'));
            const podIdx = headers.findIndex(h => h === 'pod' || h.includes('동네') || h.includes('지역'));
            const homeBatterIdx = headers.findIndex(h => h.includes('홈배터') || h.includes('홈배') || h.includes('carrier'));
            const addressIdx = headers.findIndex(h => h.includes('상세') || h.includes('주소') || h.includes('address'));
            const discountInfoIdx = headers.findIndex(h => h.includes('할인정보') || h.includes('할인') || h.includes('discount'));
            const countIdx = headers.findIndex(h => h.includes('이용') || h.includes('횟수') || h.includes('count'));
            const amountIdx = headers.findIndex(h => h.includes('누적') || h.includes('금액') || h.includes('amount'));
            const deliveryMemoIdx = headers.findIndex(h => h.includes('배송메모') || h.includes('메모') || h.includes('memo'));
            const deliveryPlaceIdx = headers.findIndex(h => h.includes('배송처') || h.includes('배달처'));

            console.log('[handleImport] Column indices:', { noIdx, nameIdx, nameEnIdx, phoneIdx, podIdx, homeBatterIdx, addressIdx });

            const newCustomers: Customer[] = [];
            const errors: string[] = [];

            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split('\t');
                const name = cells[nameIdx]?.trim();

                if (!name) {
                    console.log(`[handleImport] Row ${i}: 이름 없음, 스킵`);
                    continue;
                }

                // podCode 파싱 (No. 컬럼 또는 POD 컬럼)
                let podCode = 0;
                if (noIdx >= 0 && cells[noIdx]) {
                    podCode = parseInt(cells[noIdx].replace(/[^\d]/g, '')) || 0;
                }
                if (podCode === 0 && podIdx >= 0 && cells[podIdx]) {
                    podCode = parseInt(cells[podIdx].replace(/[^\d]/g, '')) || 0;
                }
                if (podCode === 0) {
                    podCode = i; // 기본값: 행 번호
                }

                const customerData: Record<string, any> = {
                    id: name,  // Document ID = 이름!
                    name,
                    podCode,
                    phone: phoneIdx >= 0 ? cells[phoneIdx]?.trim() || '' : '',
                    region: podIdx >= 0 ? cells[podIdx]?.trim() || '' : '',
                    stats: {
                        count: countIdx >= 0 ? parseInt(cells[countIdx]) || 0 : 0,
                        totalAmount: amountIdx >= 0 ? parseFloat(cells[amountIdx]?.replace(/[^\d.]/g, '')) || 0 : 0,
                        totalCbm: 0,
                    },
                    isActive: true,
                    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
                };

                // 옵셔널 필드 - 값이 있을 때만 추가 (Firestore는 undefined 허용 안함)
                const nameEnValue = nameEnIdx >= 0 ? cells[nameEnIdx]?.trim() : '';
                if (nameEnValue) customerData.nameEn = nameEnValue;

                const homeBatterValue = homeBatterIdx >= 0 ? cells[homeBatterIdx]?.trim() : '';
                if (homeBatterValue) customerData.homeBatter = homeBatterValue;

                const addressValue = addressIdx >= 0 ? cells[addressIdx]?.trim() : '';
                if (addressValue) customerData.addressDetail = addressValue;

                const discountValue = discountInfoIdx >= 0 ? cells[discountInfoIdx]?.trim() : '';
                if (discountValue) {
                    customerData.discountInfo = discountValue;
                    // 할인율 자동 파싱 (e.g., "10%", "선교사할인 10%")
                    const percentMatch = discountValue.match(/(\d+)\s*%/);
                    if (percentMatch) {
                        customerData.discountPercent = parseInt(percentMatch[1]);
                    }
                }

                // 배송메모 (테이블에 표시되는 필드!)
                const deliveryMemoValue = deliveryMemoIdx >= 0 ? cells[deliveryMemoIdx]?.trim() : '';
                if (deliveryMemoValue) customerData.deliveryMemo = deliveryMemoValue;

                // 배송처 (배송메모와 별도)
                const deliveryPlaceValue = deliveryPlaceIdx >= 0 ? cells[deliveryPlaceIdx]?.trim() : '';
                if (deliveryPlaceValue) customerData.deliveryPlace = deliveryPlaceValue;

                newCustomers.push(customerData as Customer);
            }

            console.log(`[handleImport] Parsed ${newCustomers.length} customers`);

            if (newCustomers.length === 0) {
                toast({
                    variant: "destructive",
                    title: "가져오기 실패",
                    description: "유효한 데이터가 없습니다. 헤더에 '이름' 컬럼이 있는지 확인하세요.",
                });
                return;
            }

            // 🚀 Firestore에 Batch 저장 (빠른 성능!)
            if (isFirebaseConfigured) {
                const result = await saveCustomersBatch(newCustomers);

                if (result.errors.length > 0) {
                    toast({
                        variant: "destructive",
                        title: "일부 저장 실패",
                        description: `${result.saved}명 저장, ${result.errors.length}명 실패: ${result.errors.slice(0, 3).join(', ')}...`,
                    });
                } else {
                    toast({
                        title: "✅ 가져오기 완료",
                        description: `${result.saved}명의 고객이 Firestore에 저장되었습니다.`,
                    });
                }
            } else {
                // 로컬 Fallback
                setLocalCustomers(prev => [...prev, ...newCustomers]);
                toast({
                    title: "가져오기 완료 (Demo)",
                    description: `${newCustomers.length}명의 고객이 등록되었습니다.`,
                });
            }

            setIsImportModalOpen(false);
        } catch (error) {
            console.error('[handleImport] Error:', error);
            toast({
                variant: "destructive",
                title: "가져오기 실패",
                description: "데이터 형식을 확인해주세요. 탭으로 구분된 데이터인지 확인하세요.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 고객 저장 (Firestore 연동)
    const handleSaveCustomer = async (data: Partial<Customer>) => {
        setIsLoading(true);
        try {
            const customerData: Customer = {
                id: data.name || '',
                name: data.name || '',
                podCode: data.podCode || 0,
                phone: data.phone || '',
                region: data.region || '',
                stats: editingCustomer?.stats || defaultStats,
                isActive: true,
                createdAt: editingCustomer?.createdAt || { seconds: Date.now() / 1000, nanoseconds: 0 },
                ...data,
            };

            if (isFirebaseConfigured) {
                await saveCustomer(customerData);
                toast({
                    title: editingCustomer ? "수정 완료" : "등록 완료",
                    description: `${customerData.name}님이 저장되었습니다.`
                });
            } else {
                // 로컬 Fallback
                if (editingCustomer) {
                    setLocalCustomers(prev => prev.map(c =>
                        c.id === editingCustomer.id ? customerData : c
                    ));
                } else {
                    setLocalCustomers(prev => [...prev, customerData]);
                }
                toast({ title: editingCustomer ? "수정 완료" : "등록 완료", description: "(Firebase 미연결)" });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "저장 실패" });
        } finally {
            setIsLoading(false);
            setEditingCustomer(null);
        }
    };

    // 고객 삭제 (비활성화) - Firestore 연동
    const handleDeleteCustomer = async () => {
        if (!customerToDelete) return;

        try {
            if (isFirebaseConfigured) {
                await deactivateCustomer(customerToDelete.id);
            } else {
                setLocalCustomers(prev => prev.map(c =>
                    c.id === customerToDelete.id ? { ...c, isActive: false } : c
                ));
            }
            toast({ title: "삭제 완료", description: "고객이 비활성화되었습니다." });
        } catch (error) {
            toast({ variant: "destructive", title: "삭제 실패" });
        }
        setCustomerToDelete(null);
    };

    // 🗑️ 선택삭제 핸들러
    const handleBulkDelete = async () => {
        if (customersToDelete.length === 0) return;

        setIsLoading(true);
        try {
            if (isFirebaseConfigured) {
                const customerNames = customersToDelete.map(c => c.id);
                const count = await deactivateCustomers(customerNames);
                toast({ title: "선택삭제 완료", description: `${count}명의 고객이 비활성화되었습니다.` });
            } else {
                const ids = new Set(customersToDelete.map(c => c.id));
                setLocalCustomers(prev => prev.map(c =>
                    ids.has(c.id) ? { ...c, isActive: false } : c
                ));
                toast({ title: "선택삭제 완료 (Demo)", description: `${customersToDelete.length}명의 고객이 비활성화되었습니다.` });
            }
        } catch (error) {
            console.error('[handleBulkDelete] Error:', error);
            toast({ variant: "destructive", title: "선택삭제 실패", description: "일부 고객 삭제에 실패했습니다." });
        } finally {
            setIsLoading(false);
            setCustomersToDelete([]);
        }
    };

    // 🗑️ 전체삭제 핸들러  
    const handleDeleteAll = async () => {
        setIsLoading(true);
        try {
            if (isFirebaseConfigured) {
                const count = await deactivateAllCustomers();
                toast({ title: "전체삭제 완료", description: `${count}명의 고객이 비활성화되었습니다.` });
            } else {
                setLocalCustomers(prev => prev.map(c => ({ ...c, isActive: false })));
                toast({ title: "전체삭제 완료 (Demo)", description: "모든 고객이 비활성화되었습니다." });
            }
        } catch (error) {
            console.error('[handleDeleteAll] Error:', error);
            toast({ variant: "destructive", title: "전체삭제 실패" });
        } finally {
            setIsLoading(false);
            setShowDeleteAllConfirm(false);
        }
    };

    return (
        <main className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
            {/* 헤더 */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        고객 DB 관리
                    </h1>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        엑셀 가져오기
                    </Button>
                </div>
            </div>

            {/* 📌 HIGH-PERFORMANCE CUSTOMER TABLE */}
            <div className="flex-1 min-h-[600px] border rounded-lg overflow-hidden">
                <CustomerTable
                    customers={customers.filter(c => c.isActive)}
                    onEdit={(customer) => { setEditingCustomer(customer); setIsEditModalOpen(true); }}
                    onDelete={(customer) => setCustomerToDelete(customer)}
                    onBulkDelete={(selected) => setCustomersToDelete(selected)}
                    onDeleteAll={() => setShowDeleteAllConfirm(true)}
                    isLoading={isLoading || customersLoading}
                />
            </div>

            {/* 모달들 */}
            <ExcelImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImport}
            />

            <CustomerEditModal
                customer={editingCustomer}
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setEditingCustomer(null); }}
                onSave={handleSaveCustomer}
            />

            <AlertDialog open={!!customerToDelete} onOpenChange={() => setCustomerToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>고객을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            '{customerToDelete?.name}' 고객을 비활성화합니다.
                            이 고객의 이전 거래 내역은 유지됩니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteCustomer}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 🗑️ 선택삭제 확인 다이얼로그 */}
            <AlertDialog open={customersToDelete.length > 0} onOpenChange={() => setCustomersToDelete([])}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{customersToDelete.length}명의 고객을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            선택된 고객들이 비활성화됩니다. 이전 거래 내역은 유지됩니다.
                            <div className="mt-2 max-h-24 overflow-y-auto text-xs">
                                {customersToDelete.slice(0, 10).map(c => c.name).join(', ')}
                                {customersToDelete.length > 10 && ` 외 ${customersToDelete.length - 10}명...`}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                            {customersToDelete.length}명 삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 🗑️ 전체삭제 확인 다이얼로그 */}
            <AlertDialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600">⚠️ 전체 고객을 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            현재 활성화된 모든 고객({customers.filter(c => c.isActive).length}명)이 비활성화됩니다.
                            <span className="block mt-2 font-semibold text-red-500">이 작업은 되돌릴 수 없습니다!</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteAll} className="bg-red-600 hover:bg-red-700">
                            전체 삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}

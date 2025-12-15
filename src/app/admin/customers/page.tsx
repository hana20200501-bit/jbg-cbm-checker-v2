"use client";

import React, { useState, useMemo, useCallback } from 'react';
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
import { saveCustomer, deactivateCustomer } from '@/lib/firestore-service';
import { isFirebaseConfigured } from '@/lib/firebase';

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
    onEdit,
    onDelete
}: {
    customer: Customer;
    onEdit: () => void;
    onDelete: () => void;
}) => (
    <Card className={cn(
        "hover:shadow-md transition-shadow",
        !customer.isActive && "opacity-50"
    )}>
        <CardContent className="p-4">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg truncate">{customer.name}</h3>
                        <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                            #{customer.podCode}
                        </span>
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
                    </div>
                </div>

                <div className="flex flex-col gap-1">
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

            // 컬럼 매핑 (엑셀 양식에 맞게)
            const noIdx = headers.findIndex(h => h === 'no' || h === 'no.');
            const nameIdx = headers.findIndex(h => h.includes('이름') || h === '이 름');
            const nameEnIdx = headers.findIndex(h => h.includes('eng') || h.includes('영문'));
            const phoneIdx = headers.findIndex(h => h.includes('contact') || h.includes('연락'));
            const regionIdx = headers.findIndex(h => h.includes('동네') || h.includes('pod'));
            const addressIdx = headers.findIndex(h => h.includes('상세') || h.includes('주소'));
            const discountInfoIdx = headers.findIndex(h => h.includes('할인정보') || h.includes('할인'));
            const deliveryMemoIdx = headers.findIndex(h => h.includes('배송메모') || h.includes('배송'));
            const countIdx = headers.findIndex(h => h.includes('이용') || h.includes('횟수'));
            const amountIdx = headers.findIndex(h => h.includes('누적') || h.includes('금액'));

            const newCustomers: Customer[] = [];

            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split('\t');
                const name = cells[nameIdx]?.trim();

                if (!name) continue;

                // ⚠️ Document ID = 한글 이름!
                newCustomers.push({
                    id: name,  // Document ID = 이름!
                    name,
                    nameEn: cells[nameEnIdx]?.trim() || undefined,
                    podCode: parseInt(cells[noIdx]) || i,  // No. = POD (필수!)
                    phone: cells[phoneIdx]?.trim() || '',
                    region: cells[regionIdx]?.trim() || '',
                    addressDetail: cells[addressIdx]?.trim() || undefined,
                    discountInfo: cells[discountInfoIdx]?.trim() || undefined,
                    deliveryMemo: cells[deliveryMemoIdx]?.trim() || undefined,
                    stats: {
                        count: parseInt(cells[countIdx]) || 0,
                        totalAmount: parseFloat(cells[amountIdx]) || 0,
                        totalCbm: 0,
                    },
                    isActive: true,
                    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
                });
            }

            // TODO: Firestore에 저장
            setCustomers(prev => [...prev, ...newCustomers]);

            toast({
                title: "가져오기 완료",
                description: `${newCustomers.length}명의 고객이 등록되었습니다.`,
            });

            setIsImportModalOpen(false);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "가져오기 실패",
                description: "데이터 형식을 확인해주세요.",
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

    return (
        <main className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
            {/* 헤더 */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        고객 DB 관리
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        총 {customers.filter(c => c.isActive).length}명의 활성 고객
                    </p>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        엑셀 가져오기
                    </Button>
                    <Button onClick={() => { setEditingCustomer(null); setIsEditModalOpen(true); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        신규 등록
                    </Button>
                </div>
            </div>

            {/* 검색 */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                    placeholder="이름, 연락처, 지역, TrackPod No.로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-12"
                />
                {searchTerm && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setSearchTerm('')}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* 고객 목록 */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : filteredCustomers.length === 0 ? (
                <Card className="p-12 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg">
                        {searchTerm ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'}
                    </h3>
                    <p className="text-muted-foreground mt-2">
                        {searchTerm ? '다른 검색어를 시도해보세요.' : '엑셀 가져오기 또는 신규 등록을 이용하세요.'}
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCustomers.filter(c => c.isActive).map(customer => (
                        <CustomerCard
                            key={customer.id}
                            customer={customer}
                            onEdit={() => { setEditingCustomer(customer); setIsEditModalOpen(true); }}
                            onDelete={() => setCustomerToDelete(customer)}
                        />
                    ))}
                </div>
            )}

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
        </main>
    );
}

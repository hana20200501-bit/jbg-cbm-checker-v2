"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, FileDown, Trash2, Plus, Search, Loader2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { InvoiceItem, InvoiceEditorState, Customer, BankInfo } from '@/types';

// 장보고 익스프레스 은행 정보
const BANK_INFO: BankInfo = {
    bankName: 'ABA Bank',
    accountNumber: '001-234-567-890',
    accountHolder: 'Jangbogo Express Co., Ltd.',
    swiftCode: 'AABORKHPP',
};

// 기본 단가 (USD/CBM)
const DEFAULT_UNIT_PRICE = 130;

// 새 항목 생성 헬퍼
const createNewItem = (): InvoiceItem => ({
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    description: '',
    quantity: 1,
    cbm: 0,
    unitPrice: DEFAULT_UNIT_PRICE,
    amount: 0,
});

// 금액 계산 헬퍼
const calculateAmount = (item: InvoiceItem): number => {
    return item.quantity * item.cbm * item.unitPrice;
};

// Editable Cell 컴포넌트
const EditableCell = ({
    value,
    onChange,
    type = 'text',
    className,
    align = 'left',
}: {
    value: string | number;
    onChange: (value: string) => void;
    type?: 'text' | 'number';
    className?: string;
    align?: 'left' | 'center' | 'right';
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(String(value));

    const handleBlur = () => {
        setIsEditing(false);
        onChange(localValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            onChange(localValue);
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
            setLocalValue(String(value));
        }
    };

    if (isEditing) {
        return (
            <Input
                type={type}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                autoFocus
                className={cn("h-8 text-sm", className)}
                style={{ textAlign: align }}
            />
        );
    }

    return (
        <div
            onClick={() => {
                setIsEditing(true);
                setLocalValue(String(value));
            }}
            className={cn(
                "cursor-pointer hover:bg-primary/10 px-2 py-1.5 rounded min-h-[32px] flex items-center",
                align === 'right' && "justify-end",
                align === 'center' && "justify-center",
                className
            )}
        >
            {type === 'number' && typeof value === 'number' ? value.toFixed(4) : value}
        </div>
    );
};

export default function InvoiceEditorPage() {
    const router = useRouter();

    // 상태 관리
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([createNewItem()]);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [shippingFee, setShippingFee] = useState(0);
    const [packingFee, setPackingFee] = useState(0);
    const [customsFee, setCustomsFee] = useState(0);
    const [otherFee, setOtherFee] = useState(0);
    const [memo, setMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // 금액 계산
    const calculations = useMemo(() => {
        const subtotal = items.reduce((sum, item) => sum + calculateAmount(item), 0);
        const discountAmount = subtotal * (discountPercent / 100);
        const totalFees = shippingFee + packingFee + customsFee + otherFee;
        const totalAmount = subtotal - discountAmount + totalFees;
        const totalCbm = items.reduce((sum, item) => sum + (item.quantity * item.cbm), 0);

        return {
            subtotal,
            discountAmount,
            totalFees,
            totalAmount,
            totalCbm,
        };
    }, [items, discountPercent, shippingFee, packingFee, customsFee, otherFee]);

    // 아이템 업데이트 핸들러
    const handleItemChange = useCallback((itemId: string, field: keyof InvoiceItem, value: string) => {
        setItems(prevItems => prevItems.map(item => {
            if (item.id !== itemId) return item;

            const updatedItem = { ...item };
            if (field === 'description') {
                updatedItem.description = value;
            } else {
                const numValue = parseFloat(value) || 0;
                (updatedItem as any)[field] = numValue;
            }
            updatedItem.amount = calculateAmount(updatedItem);
            return updatedItem;
        }));
    }, []);

    // 아이템 추가
    const handleAddItem = () => {
        setItems(prev => [...prev, createNewItem()]);
    };

    // 아이템 삭제
    const handleRemoveItem = (itemId: string) => {
        if (items.length <= 1) return;
        setItems(prev => prev.filter(item => item.id !== itemId));
    };

    // 저장 핸들러
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // TODO: Firestore에 저장 + PDF 생성
            console.log('Saving invoice...', { customer, items, calculations });
            await new Promise(resolve => setTimeout(resolve, 1000)); // 시뮬레이션
            alert('저장 완료! (PDF 생성 기능 구현 예정)');
        } catch (error) {
            console.error('Save failed:', error);
            alert('저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        뒤로
                    </Button>
                    <h1 className="text-2xl font-bold">인보이스 에디터</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" disabled>
                        <FileDown className="w-4 h-4 mr-2" />
                        PDF 다운로드
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        저장
                    </Button>
                </div>
            </div>

            {/* 인보이스 본문 */}
            <Card className="border-2">
                {/* 상단: 회사 정보 & 고객 정보 */}
                <CardHeader className="border-b bg-muted/50">
                    <div className="flex flex-col lg:flex-row justify-between gap-6">
                        {/* Shipper (발송인) */}
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-primary mb-2">SHIPPER (발송인)</h2>
                            <div className="text-sm space-y-1">
                                <p className="font-bold text-xl">🚢 장보고 익스프레스</p>
                                <p>Jangbogo Express Co., Ltd.</p>
                                <p>서울특별시 강남구 테헤란로 123</p>
                                <p>Tel: +82-2-1234-5678</p>
                                <p>Email: info@jangbogo.com</p>
                            </div>
                        </div>

                        {/* Consignee (수취인) */}
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-primary mb-2">CONSIGNEE (수취인)</h2>
                            {customer ? (
                                <div className="text-sm space-y-1">
                                    <p className="font-bold text-xl">{customer.name}</p>
                                    {customer.nameEn && <p>{customer.nameEn}</p>}
                                    <p>{customer.addressFull || customer.region}</p>
                                    <p>Tel: {customer.phone || '-'}</p>
                                    {customer.discountRule && (
                                        <p className="text-green-600 font-medium">💡 {customer.discountRule}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="고객명 검색..."
                                            value={customerSearchTerm}
                                            onChange={(e) => setCustomerSearchTerm(e.target.value)}
                                            className="flex-1"
                                        />
                                        <Button variant="outline" size="icon">
                                            <Search className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground">고객을 검색하여 선택하세요.</p>
                                </div>
                            )}
                        </div>

                        {/* Invoice Info */}
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-primary mb-2">INVOICE</h2>
                            <div className="text-sm space-y-1">
                                <p><span className="font-medium">Invoice No:</span> JBG-{new Date().getFullYear()}-XXXX</p>
                                <p><span className="font-medium">Date:</span> {new Date().toLocaleDateString('ko-KR')}</p>
                                <p><span className="font-medium">Currency:</span> USD</p>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                {/* 중단: Editable Data Grid */}
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-primary text-primary-foreground">
                                <tr>
                                    <th className="p-3 text-left w-12">#</th>
                                    <th className="p-3 text-left min-w-[200px]">품명 (Description)</th>
                                    <th className="p-3 text-center w-20">수량</th>
                                    <th className="p-3 text-right w-28">CBM (m³)</th>
                                    <th className="p-3 text-right w-28">단가 ($/CBM)</th>
                                    <th className="p-3 text-right w-32">금액 (USD)</th>
                                    <th className="p-3 text-center w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => (
                                    <tr key={item.id} className="border-b hover:bg-muted/30">
                                        <td className="p-2 text-muted-foreground">{index + 1}</td>
                                        <td className="p-1">
                                            <EditableCell
                                                value={item.description}
                                                onChange={(v) => handleItemChange(item.id, 'description', v)}
                                                className="w-full"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <EditableCell
                                                value={item.quantity}
                                                onChange={(v) => handleItemChange(item.id, 'quantity', v)}
                                                type="number"
                                                align="center"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <EditableCell
                                                value={item.cbm}
                                                onChange={(v) => handleItemChange(item.id, 'cbm', v)}
                                                type="number"
                                                align="right"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <EditableCell
                                                value={item.unitPrice}
                                                onChange={(v) => handleItemChange(item.id, 'unitPrice', v)}
                                                type="number"
                                                align="right"
                                            />
                                        </td>
                                        <td className="p-2 text-right font-bold text-primary">
                                            ${calculateAmount(item).toFixed(2)}
                                        </td>
                                        <td className="p-1 text-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => handleRemoveItem(item.id)}
                                                disabled={items.length <= 1}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 항목 추가 버튼 */}
                    <div className="p-4 border-b">
                        <Button variant="outline" onClick={handleAddItem} className="w-full">
                            <Plus className="w-4 h-4 mr-2" />
                            항목 추가
                        </Button>
                    </div>

                    {/* 하단: 합계 & 은행 정보 */}
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* 은행 정보 */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg border-b pb-2">💳 Payment Information</h3>
                            <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-2">
                                <p><span className="font-medium">Bank:</span> {BANK_INFO.bankName}</p>
                                <p><span className="font-medium">Account No:</span> {BANK_INFO.accountNumber}</p>
                                <p><span className="font-medium">Account Holder:</span> {BANK_INFO.accountHolder}</p>
                                <p><span className="font-medium">SWIFT Code:</span> {BANK_INFO.swiftCode}</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="memo">메모 (비고)</Label>
                                <Textarea
                                    id="memo"
                                    placeholder="고객에게 전달할 메모..."
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>

                        {/* 금액 합계 */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg border-b pb-2">📊 Summary</h3>
                            <div className="space-y-3">
                                {/* 총 CBM */}
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Total CBM:</span>
                                    <span className="font-bold">{calculations.totalCbm.toFixed(4)} m³</span>
                                </div>

                                {/* 소계 */}
                                <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span className="font-bold">${calculations.subtotal.toFixed(2)}</span>
                                </div>

                                {/* 할인 */}
                                <div className="flex justify-between items-center gap-2">
                                    <span className="flex items-center gap-2">
                                        Discount:
                                        <Input
                                            type="number"
                                            value={discountPercent}
                                            onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                                            className="w-16 h-7 text-sm text-center"
                                            min={0}
                                            max={100}
                                        />
                                        <span>%</span>
                                    </span>
                                    <span className="text-green-600 font-medium">-${calculations.discountAmount.toFixed(2)}</span>
                                </div>

                                {/* 추가 비용들 */}
                                <div className="flex justify-between items-center gap-2">
                                    <span>Shipping Fee:</span>
                                    <div className="flex items-center gap-1">
                                        <span>$</span>
                                        <Input
                                            type="number"
                                            value={shippingFee}
                                            onChange={(e) => setShippingFee(parseFloat(e.target.value) || 0)}
                                            className="w-20 h-7 text-sm text-right"
                                            min={0}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center gap-2">
                                    <span>Packing Fee:</span>
                                    <div className="flex items-center gap-1">
                                        <span>$</span>
                                        <Input
                                            type="number"
                                            value={packingFee}
                                            onChange={(e) => setPackingFee(parseFloat(e.target.value) || 0)}
                                            className="w-20 h-7 text-sm text-right"
                                            min={0}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center gap-2">
                                    <span>Customs Fee:</span>
                                    <div className="flex items-center gap-1">
                                        <span>$</span>
                                        <Input
                                            type="number"
                                            value={customsFee}
                                            onChange={(e) => setCustomsFee(parseFloat(e.target.value) || 0)}
                                            className="w-20 h-7 text-sm text-right"
                                            min={0}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center gap-2">
                                    <span>Other Fee:</span>
                                    <div className="flex items-center gap-1">
                                        <span>$</span>
                                        <Input
                                            type="number"
                                            value={otherFee}
                                            onChange={(e) => setOtherFee(parseFloat(e.target.value) || 0)}
                                            className="w-20 h-7 text-sm text-right"
                                            min={0}
                                        />
                                    </div>
                                </div>

                                {/* 총액 */}
                                <div className="border-t-2 border-primary pt-3 mt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xl font-bold">TOTAL:</span>
                                        <span className="text-3xl font-bold text-primary">
                                            ${calculations.totalAmount.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}

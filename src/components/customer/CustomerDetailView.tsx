'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowLeft, Phone, MapPin, Tag, TrendingUp, FileText, Package, History, DollarSign, CheckSquare, Square, Download, RefreshCw, Edit2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types';
import type { ShipmentHistoryItem, CustomerInvoice, CustomerHistory } from '@/lib/customer-service';
import {
    getCustomerHistory,
    getCustomerInvoices,
    calculateCustomerStats,
    generateInvoice,
    updateCustomerPreferences,
} from '@/lib/customer-service';

// =============================================================================
// Types
// =============================================================================

type TabKey = 'active' | 'history' | 'invoices';

interface CustomerDetailViewProps {
    customer: Customer;
    onBack: () => void;
    onRefresh?: () => void;
}

// =============================================================================
// 📌 CUSTOMER DETAIL VIEW - Command Center Layout
// =============================================================================

export function CustomerDetailView({
    customer,
    onBack,
    onRefresh,
}: CustomerDetailViewProps) {
    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------
    const [activeTab, setActiveTab] = useState<TabKey>('active');
    const [history, setHistory] = useState<CustomerHistory>({ shipments: [], totalCount: 0, hasMore: false });
    const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
    const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
    const [editingMemo, setEditingMemo] = useState(false);
    const [memoValue, setMemoValue] = useState(customer.preferences?.memo || '');

    // ---------------------------------------------------------------------------
    // Data Loading
    // ---------------------------------------------------------------------------
    useEffect(() => {
        loadData();
    }, [customer.id]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [historyData, invoicesData] = await Promise.all([
                getCustomerHistory(customer.id),
                getCustomerInvoices(customer.id),
            ]);
            setHistory(historyData);
            setInvoices(invoicesData);
        } catch (error) {
            console.error('Failed to load customer data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Tab Filtering
    // ---------------------------------------------------------------------------
    const filteredShipments = useMemo(() => {
        if (activeTab === 'active') {
            return history.shipments.filter(s => s.status === 'IN_WAREHOUSE' || s.status === 'SHIPPED');
        } else if (activeTab === 'history') {
            return history.shipments;
        }
        return [];
    }, [history.shipments, activeTab]);

    // ---------------------------------------------------------------------------
    // Selection Handlers
    // ---------------------------------------------------------------------------
    const toggleSelection = useCallback((id: string) => {
        setSelectedShipments(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        const uninvoiced = filteredShipments.filter(s => s.status !== 'INVOICED').map(s => s.id);
        setSelectedShipments(new Set(uninvoiced));
    }, [filteredShipments]);

    const clearSelection = useCallback(() => {
        setSelectedShipments(new Set());
    }, []);

    // ---------------------------------------------------------------------------
    // Invoice Generation
    // ---------------------------------------------------------------------------
    const handleGenerateInvoice = async () => {
        if (selectedShipments.size === 0) return;

        setIsGeneratingInvoice(true);
        try {
            const result = await generateInvoice(customer.id, Array.from(selectedShipments));
            if (result.success) {
                alert(`✅ 인보이스 생성 완료! ${result.invoiceId}`);
                clearSelection();
                loadData(); // Refresh data
            } else {
                alert(`❌ 인보이스 생성 실패: ${result.error}`);
            }
        } catch (error) {
            console.error('Invoice generation failed:', error);
        } finally {
            setIsGeneratingInvoice(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Memo Save
    // ---------------------------------------------------------------------------
    const handleSaveMemo = async () => {
        const success = await updateCustomerPreferences(customer.id, {
            preferences: { ...customer.preferences, memo: memoValue }
        });
        if (success) {
            setEditingMemo(false);
            onRefresh?.();
        }
    };

    // ---------------------------------------------------------------------------
    // Stats Calculation
    // ---------------------------------------------------------------------------
    const stats = useMemo(() => {
        const totalCbm = history.shipments.reduce((sum, s) => sum + (s.workerMeasuredCbm || 0), 0);
        const totalRevenue = history.shipments.reduce((sum, s) => sum + (s.price || 0), 0);
        const uninvoicedCount = history.shipments.filter(s => s.status !== 'INVOICED').length;
        return { totalCbm, totalRevenue, uninvoicedCount };
    }, [history.shipments]);

    // ---------------------------------------------------------------------------
    // Priority Badge
    // ---------------------------------------------------------------------------
    const PriorityBadge = ({ priority }: { priority?: string }) => {
        if (priority === 'VIP') return <Badge className="bg-yellow-500 text-black">⭐ VIP</Badge>;
        if (priority === 'WATCH') return <Badge variant="destructive">⚠️ WATCH</Badge>;
        return null;
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* ===== HEADER ===== */}
            <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-1" /> 뒤로
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {customer.name}
                            <span className="text-sm text-gray-500">({customer.nameEn})</span>
                            <PriorityBadge priority={customer.preferences?.priority} />
                        </h1>
                        <p className="text-sm text-gray-500">
                            #{customer.podCode} · {customer.region}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={loadData}>
                    <RefreshCw className="w-4 h-4 mr-1" /> 새로고침
                </Button>
            </div>

            {/* ===== MAIN CONTENT: Split Screen ===== */}
            <div className="flex-1 flex overflow-hidden">
                {/* ----- LEFT PANEL: Profile & Stats ----- */}
                <div className="w-80 border-r bg-white overflow-y-auto p-4 space-y-4">
                    {/* Contact Info */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">연락처 정보</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-gray-400" />
                                <span>{customer.phone || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gray-400" />
                                <span>{customer.addressDetail || customer.region || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-gray-400" />
                                <span>{customer.discountInfo || '할인 없음'}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 📌 WHALE RADAR - Big Stats */}
                    <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-1">
                                💎 Whale Radar
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-2xl font-bold">
                                    {customer.stats?.totalCbm?.toFixed(2) || stats.totalCbm.toFixed(2)} m³
                                </div>
                                <div className="text-xs text-blue-100">Total CBM</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold">
                                    ${customer.stats?.totalAmount?.toLocaleString() || stats.totalRevenue.toLocaleString()}
                                </div>
                                <div className="text-xs text-blue-100">Total Revenue</div>
                            </div>
                            <div className="pt-2 border-t border-blue-400/30">
                                <div className="text-lg font-semibold">{customer.stats?.count || history.totalCount}회</div>
                                <div className="text-xs text-blue-100">이용 횟수</div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Financials */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-1">
                                <DollarSign className="w-4 h-4" /> 미수금 현황
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-bold text-red-600">
                                ${customer.financials?.currentCredit?.toLocaleString() || 0}
                            </div>
                            <div className="text-xs text-gray-500">
                                미결제 인보이스: {customer.financials?.unpaidInvoices || stats.uninvoicedCount}건
                            </div>
                        </CardContent>
                    </Card>

                    {/* 📝 Admin Memo */}
                    <Card>
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm">📝 관리자 메모</CardTitle>
                            {!editingMemo ? (
                                <Button variant="ghost" size="sm" onClick={() => setEditingMemo(true)}>
                                    <Edit2 className="w-3 h-3" />
                                </Button>
                            ) : (
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={handleSaveMemo}>
                                        <Save className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingMemo(false)}>
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            {editingMemo ? (
                                <textarea
                                    value={memoValue}
                                    onChange={(e) => setMemoValue(e.target.value)}
                                    className="w-full text-sm border rounded p-2 min-h-[80px]"
                                    placeholder="비공개 메모..."
                                />
                            ) : (
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                    {customer.preferences?.memo || '(메모 없음)'}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ----- RIGHT PANEL: Data Lake ----- */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Tabs */}
                    <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
                        {[
                            { key: 'active' as TabKey, label: '📦 Active Cargo', icon: Package },
                            { key: 'history' as TabKey, label: '📜 History Log', icon: History },
                            { key: 'invoices' as TabKey, label: '💰 Invoices', icon: FileText },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                                    activeTab === tab.key
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}

                        {/* Selection Actions */}
                        {selectedShipments.size > 0 && activeTab !== 'invoices' && (
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-sm text-blue-600 font-medium">
                                    {selectedShipments.size}건 선택
                                </span>
                                <Button
                                    size="sm"
                                    onClick={handleGenerateInvoice}
                                    disabled={isGeneratingInvoice}
                                >
                                    <FileText className="w-4 h-4 mr-1" />
                                    {isGeneratingInvoice ? '생성 중...' : '인보이스 생성'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={clearSelection}>
                                    선택 해제
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-auto p-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                로딩 중...
                            </div>
                        ) : activeTab === 'invoices' ? (
                            /* ----- INVOICES TAB ----- */
                            <div className="space-y-2">
                                {invoices.length === 0 ? (
                                    <div className="text-center text-gray-400 py-8">
                                        인보이스 내역이 없습니다
                                    </div>
                                ) : (
                                    invoices.map(inv => (
                                        <Card key={inv.id} className="p-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium">{inv.invoiceNumber}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {inv.createdAt.toLocaleDateString()} · {inv.shipmentIds.length}건
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold">${inv.totalAmount.toLocaleString()}</div>
                                                    <Badge variant={inv.status === 'PAID' ? 'default' : 'secondary'}>
                                                        {inv.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </Card>
                                    ))
                                )}
                            </div>
                        ) : (
                            /* ----- SHIPMENTS TABLE ----- */
                            <div className="bg-white border rounded overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-2 py-2 text-center w-10">
                                                <button onClick={selectAll} className="text-gray-400 hover:text-blue-500">
                                                    <CheckSquare className="w-4 h-4" />
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-left">날짜</th>
                                            <th className="px-3 py-2 text-left">항차</th>
                                            <th className="px-3 py-2 text-left">품목</th>
                                            <th className="px-2 py-2 text-center">수량</th>
                                            <th className="px-2 py-2 text-center font-medium text-blue-600">CBM</th>
                                            <th className="px-2 py-2 text-right">금액</th>
                                            <th className="px-3 py-2 text-center">상태</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredShipments.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="py-8 text-center text-gray-400">
                                                    데이터가 없습니다
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredShipments.map(item => {
                                                const isSelected = selectedShipments.has(item.id);
                                                const isInvoiced = item.status === 'INVOICED';

                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className={cn(
                                                            'border-b hover:bg-gray-50 transition-colors',
                                                            isSelected && 'bg-blue-50',
                                                            isInvoiced && 'text-gray-400'
                                                        )}
                                                    >
                                                        <td className="px-2 py-2 text-center">
                                                            <button
                                                                onClick={() => !isInvoiced && toggleSelection(item.id)}
                                                                disabled={isInvoiced}
                                                                className={isInvoiced ? 'opacity-30' : ''}
                                                            >
                                                                {isSelected ? (
                                                                    <CheckSquare className="w-4 h-4 text-blue-500" />
                                                                ) : (
                                                                    <Square className="w-4 h-4 text-gray-300" />
                                                                )}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-2">{item.date}</td>
                                                        <td className="px-3 py-2 text-xs text-gray-500">{item.voyageId?.slice(0, 8)}...</td>
                                                        <td className="px-3 py-2 font-medium">{item.itemName}</td>
                                                        <td className="px-2 py-2 text-center">{item.qty}</td>
                                                        <td className="px-2 py-2 text-center font-bold text-blue-600">
                                                            {item.workerMeasuredCbm?.toFixed(3) || '-'}
                                                        </td>
                                                        <td className="px-2 py-2 text-right">
                                                            ${item.price?.toLocaleString() || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <Badge
                                                                variant={
                                                                    item.status === 'INVOICED' ? 'default' :
                                                                        item.status === 'SHIPPED' ? 'secondary' : 'outline'
                                                                }
                                                                className="text-[10px]"
                                                            >
                                                                {item.status === 'IN_WAREHOUSE' && '📦 입고'}
                                                                {item.status === 'SHIPPED' && '🚢 배송중'}
                                                                {item.status === 'INVOICED' && `💰 ${item.invoiceNumber || '청구완료'}`}
                                                                {item.status === 'DELIVERED' && '✅ 완료'}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CustomerDetailView;

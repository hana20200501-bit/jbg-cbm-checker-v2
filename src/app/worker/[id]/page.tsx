"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useShipment } from '@/hooks/use-erp-data';
import { updateShipmentCbm } from '@/lib/firestore-service';
import type { Shipment } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, ServerCrash, PlusCircle, Trash2, Camera, Copy, ClipboardCheck, X, Check, ArrowUpCircle, CopyPlus } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { cn } from '@/lib/utils';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { doc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type BoxDimension = NonNullable<Shipment['boxDimensions']>[number];

type LocalBox = {
    tempId: string; // React Key
    id?: string;    // ERP Box ID
    width: string;  // String for input handling
    length: string;
    height: string;
    quantity: number; // Usually 1
    memo?: string;
    imageUrl?: string;

    isNew?: boolean;
    newImageFile?: File;
    newImagePreview?: string;
    imageToDelete?: string | null;
    cbm: number;
};

type ReplicationState = {
    sourceBox: LocalBox;
    sourceIndex: number;
} | null;

const DimensionInput = ({ label, id, onChange, ...props }: { label: string; id: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="flex-1 flex flex-col gap-1.5 h-24">
        <label htmlFor={id} className="block text-center text-sm font-medium text-muted-foreground">{label}</label>
        <Input
            id={id}
            type="text"
            inputMode="decimal"
            className="w-full h-full text-2xl font-bold p-3 text-center"
            onChange={onChange}
            {...props}
        />
    </div>
);

const InfoField: React.FC<{ label: string; value?: string; valueClassName?: string }> = ({ label, value, valueClassName }) => (
    <div className="flex items-baseline">
        <span className="text-sm font-extrabold w-24 shrink-0 text-black">{label}</span>
        <span className={cn("text-sm font-bold", valueClassName)}>{value || ''}</span>
    </div>
);

const SavingOverlay = () => (
    <div className="fixed inset-0 bg-black/60 z-[100] flex flex-col items-center justify-center backdrop-blur-sm">
        <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
        <p className="text-white text-lg font-semibold">데이터 저장 중...</p>
    </div>
);

export default function CBMInputPage() {
    const router = useRouter();
    const params = useParams();
    const shipmentId = params.id as string;
    const { shipment, loading: shipmentLoading } = useShipment(shipmentId);
    const { toast } = useToast();

    const [localBoxes, setLocalBoxes] = useState<LocalBox[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const [copiedDimensions, setCopiedDimensions] = useState<{ width: string; length: string; height: string } | null>(null);
    const [boxToDelete, setBoxToDelete] = useState<LocalBox | null>(null);
    const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
    const [boxToViewImage, setBoxToViewImage] = useState<LocalBox | null>(null);

    // 🛡️ Revenue Guard State
    const [cbmWarning, setCbmWarning] = useState<{ isOpen: boolean; type: 'HIGH' | 'LOW'; message: string; onConfirm: () => void } | null>(null);

    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());

    const [isAddBoxModalOpen, setIsAddBoxModalOpen] = useState(false);
    const [addBoxQuantity, setAddBoxQuantity] = useState(1);
    const [showTopButton, setShowTopButton] = useState(false);

    const [replicationState, setReplicationState] = useState<ReplicationState>(null);
    const [replicationQuantity, setReplicationQuantity] = useState(1);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeBoxIdForUpload = useRef<string | null>(null);
    const mainRef = useRef<HTMLElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Initialize from Shipment
    useEffect(() => {
        if (shipment && localBoxes.length === 0) {
            if (shipment.boxDimensions && shipment.boxDimensions.length > 0) {
                setLocalBoxes(shipment.boxDimensions.map((b, idx) => ({
                    tempId: b.id || `existing-${idx}-${Date.now()}`,
                    id: b.id,
                    width: b.width.toString(),
                    length: b.length.toString(),
                    height: b.height.toString(),
                    quantity: b.quantity,
                    memo: b.memo,
                    imageUrl: b.imageUrl,
                    cbm: (b.width * b.length * b.height) / 1000000,
                    isNew: false
                })));
            }
        }
    }, [shipment]);

    useEffect(() => {
        if (editingBoxId && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [editingBoxId]);

    useEffect(() => {
        const handleScroll = () => setShowTopButton(window.scrollY > 300);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleInputChange = (tempId: string, field: 'width' | 'length' | 'height' | 'memo', value: string) => {
        let finalValue = value;
        if (field !== 'memo') {
            finalValue = value.replace(/[^0-9.]/g, ''); // 숫자만 허용
        }

        setLocalBoxes(prev => {
            return prev.map(box => {
                if (box.tempId !== tempId) return box;

                const updated = { ...box, [field]: finalValue };
                if (field !== 'memo') {
                    const w = parseFloat(updated.width) || 0;
                    const l = parseFloat(updated.length) || 0;
                    const h = parseFloat(updated.height) || 0;
                    updated.cbm = (w * l * h) / 1000000;
                }
                return updated;
            });
        });
    };

    const handleCopyDimensions = (tempId: string) => {
        const box = localBoxes.find(b => b.tempId === tempId);
        if (box && box.width && box.length && box.height) {
            setCopiedDimensions({ width: box.width, length: box.length, height: box.height });
            setIsSelectionMode(true);
            toast({ title: "치수 복사됨", description: "적용할 다른 박스들을 선택해주세요." });
        } else {
            toast({ variant: 'destructive', title: '복사 실패', description: '치수가 모두 입력된 박스만 복사할 수 있습니다.' });
        }
    };

    const handleToggleSelection = (tempId: string) => {
        setSelectedBoxIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(tempId)) newSet.delete(tempId);
            else newSet.add(tempId);
            return newSet;
        });
    };

    const handleApplyToSelected = () => {
        if (!copiedDimensions) return;
        setLocalBoxes(prev => prev.map(box => {
            if (selectedBoxIds.has(box.tempId)) {
                const w = parseFloat(copiedDimensions.width) || 0;
                const l = parseFloat(copiedDimensions.length) || 0;
                const h = parseFloat(copiedDimensions.height) || 0;
                return {
                    ...box,
                    width: copiedDimensions.width,
                    length: copiedDimensions.length,
                    height: copiedDimensions.height,
                    cbm: (w * l * h) / 1000000
                };
            }
            return box;
        }));
        setIsSelectionMode(false);
        setSelectedBoxIds(new Set());
        toast({ title: '적용 완료', description: `${selectedBoxIds.size}개 박스에 적용되었습니다.` });
    };

    const handleAddNewBox = () => {
        const newItems: LocalBox[] = [];
        for (let i = 0; i < addBoxQuantity; i++) {
            newItems.push({
                tempId: `new-${Date.now()}-${i}`,
                width: '', length: '', height: '', quantity: 1, cbm: 0,
                isNew: true,
                memo: '',
            });
        }
        setLocalBoxes(prev => [...prev, ...newItems]);
        setIsAddBoxModalOpen(false);
        setAddBoxQuantity(1);
        toast({ title: "박스 추가됨" });
    };

    const handleDeleteBox = (tempId: string) => {
        setBoxToDelete(localBoxes.find(b => b.tempId === tempId) || null);
    };

    const confirmDeleteBox = () => {
        if (!boxToDelete) return;
        const box = boxToDelete;

        // Mark logic: if it has ID (existing), we should note it to delete from array?
        // Actually we just filter it out from localBoxes. 
        // Upon Save, we overwrite the whole array to Firestore.
        // But Images? If existing image, we should delete it. 
        // We can do it optimistically or wait for save?
        // Step 4164 logic deleted mostly immediately or marked.
        // For images, if we remove from array, we lose reference to delete.
        // So we should delete image NOW if confirm?

        if (box.imageUrl) {
            // We can try to delete image, but if user cancels discard changes...
            // Better to just track 'pendingDeletes'? 
            // For simplicity, let's just delete the record from UI. 
            // Orphaned images in Storage are acceptable for now or handle cleanup later.
        }

        setLocalBoxes(prev => prev.filter(b => b.tempId !== box.tempId));
        setBoxToDelete(null);
        toast({ title: "박스 삭제됨" });
    };

    // Replication Logic
    const handleReplicateClick = (tempId: string) => {
        const idx = localBoxes.findIndex(b => b.tempId === tempId);
        if (idx === -1) return;
        setReplicationState({ sourceBox: localBoxes[idx], sourceIndex: idx });
        setReplicationQuantity(1);
    };

    const handleApplyReplication = () => {
        if (!replicationState) return;
        const { sourceBox, sourceIndex } = replicationState;

        setLocalBoxes(prev => {
            const next = [...prev];
            const count = Math.min(replicationQuantity, next.length - 1 - sourceIndex);
            for (let i = 0; i < count; i++) {
                const targetIdx = sourceIndex + 1 + i;
                next[targetIdx] = {
                    ...next[targetIdx],
                    width: sourceBox.width,
                    length: sourceBox.length,
                    height: sourceBox.height,
                    cbm: sourceBox.cbm
                };
            }
            return next;
        });
        setReplicationState(null);
        toast({ title: "복제 완료" });
    };

    // Image Logic
    const handleCameraClick = (tempId: string) => {
        activeBoxIdForUpload.current = tempId;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const tempId = activeBoxIdForUpload.current;
        if (!file || !tempId) return;

        try {
            const compressed = await imageCompression(file, { maxSizeMB: 0.2, maxWidthOrHeight: 800, useWebWorker: true });
            const preview = URL.createObjectURL(compressed);

            setLocalBoxes(prev => prev.map(b => {
                if (b.tempId === tempId) {
                    return { ...b, newImageFile: compressed, newImagePreview: preview, imageToDelete: b.imageUrl };
                }
                return b;
            }));
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: '이미지 처리 실패' });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            activeBoxIdForUpload.current = null;
        }
    };

    const handleRemoveImage = (tempId: string) => {
        setLocalBoxes(prev => prev.map(b => {
            if (b.tempId === tempId) {
                return { ...b, newImageFile: undefined, newImagePreview: undefined, imageUrl: undefined, imageToDelete: b.imageUrl };
            }
            return b;
        }));
        setBoxToViewImage(null);
    }

    // SAVE
    const performSave = async () => {
        if (!shipment) return;
        setIsSaving(true);
        try {
            // Process Images
            const finalBoxes = await Promise.all(localBoxes.map(async (box, idx) => {
                let finalUrl = box.imageUrl;

                // 1. Delete old if replaced/removed
                if (box.imageToDelete) {
                    try {
                        const refDel = ref(storage, box.imageToDelete);
                        await deleteObject(refDel);
                    } catch (e) { console.warn("Delete img failed", e); }
                }

                // 2. Upload new
                if (box.newImageFile) {
                    const safeId = box.id || `box${idx}_${Date.now()}`;
                    const storageRef = ref(storage, `box-images/${shipmentId}/${safeId}`);
                    const uploaded = await uploadBytes(storageRef, box.newImageFile);
                    finalUrl = await getDownloadURL(uploaded.ref);
                }

                return {
                    id: box.id || `box-${idx}-${Date.now()}`, // Ensure ID
                    length: parseFloat(box.length) || 0,
                    width: parseFloat(box.width) || 0,
                    height: parseFloat(box.height) || 0,
                    quantity: box.quantity || 1,
                    memo: box.memo,
                    imageUrl: finalUrl,
                };
            }));

            const totalCbm = finalBoxes.reduce((sum, b) => sum + ((b.width * b.length * b.height) / 1000000) * b.quantity, 0);
            const workerName = sessionStorage.getItem('workerName') || 'Guest';
            await updateShipmentCbm(shipment.voyageId, shipmentId, totalCbm, finalBoxes, workerName);

            toast({ title: "저장 완료!", description: "ERP에 데이터가 업데이트되었습니다." });
            router.push('/worker');

        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: "저장 실패", description: "다시 시도해주세요." });
        } finally {
            setIsSaving(false);
            setCbmWarning(null);
        }
    };

    const handleSave = async () => {
        // 🔒 Revenue Guard: CBM Sanity Check
        const calculatedCbm = localBoxes.reduce((sum, b) => {
            const w = parseFloat(b.width) || 0;
            const l = parseFloat(b.length) || 0;
            const h = parseFloat(b.height) || 0;
            const qty = b.quantity || 1;
            return sum + ((w * l * h) / 1000000) * qty;
        }, 0);

        if (calculatedCbm > 5.0) {
            setCbmWarning({
                isOpen: true,
                type: 'HIGH',
                message: `총 CBM이 ${calculatedCbm.toFixed(2)}입니다. (일반적인 박스 범위를 초과함)`,
                onConfirm: performSave
            });
            return;
        }

        if (calculatedCbm > 0 && calculatedCbm < 0.005) {
            setCbmWarning({
                isOpen: true,
                type: 'LOW',
                message: `총 CBM이 ${calculatedCbm.toFixed(4)}입니다. (너무 작음)`,
                onConfirm: performSave
            });
            return;
        }

        await performSave();
    };

    if (shipmentLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin mr-2" /> 로딩중...</div>;
    if (!shipment) return <div className="p-8 text-center"><ServerCrash className="mx-auto mb-2" />화물을 찾을 수 없습니다.</div>;

    return (
        <>
            {isSaving && <SavingOverlay />}
            <main ref={mainRef} className="container mx-auto p-4 sm:p-6 space-y-6 pb-28">
                <div className="flex items-center mb-4">
                    <Button variant="ghost" onClick={() => router.back()} className="mr-2 px-0 hover:bg-transparent">
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold">{shipment.customerName || shipment.rawName}</h1>
                        <p className="text-sm text-muted-foreground">{shipment.podCode ? `POD: ${shipment.podCode}` : ''} {shipment.invoice ? `/ ${shipment.invoice}` : ''}</p>
                    </div>
                </div>

                {/* Similar UI to before */}
                <div className="flex justify-end gap-2 mb-4">
                    {!isSelectionMode && (
                        <Button onClick={() => setIsAddBoxModalOpen(true)}>
                            <PlusCircle className="mr-2 w-4 h-4" /> 박스 추가
                        </Button>
                    )}
                    {isSelectionMode && (
                        <>
                            <Button variant="secondary" onClick={() => { setIsSelectionMode(false); setSelectedBoxIds(new Set()); }}>취소</Button>
                            <Button onClick={handleApplyToSelected}>선택 적용 ({selectedBoxIds.size})</Button>
                        </>
                    )}
                </div>

                <div className="space-y-4">
                    {localBoxes.map(box => (
                        <Card key={box.tempId} className={cn("relative overflow-hidden transition-all", selectedBoxIds.has(box.tempId) ? "ring-2 ring-primary" : "")}>
                            {isSelectionMode && (
                                <div className="absolute inset-0 z-10 bg-transparent cursor-pointer" onClick={() => handleToggleSelection(box.tempId)} />
                            )}
                            <CardHeader className="flex-row justify-between items-center py-3">
                                <div className="flex items-center gap-2 z-20">
                                    {editingBoxId === box.tempId ? (
                                        <Input
                                            ref={nameInputRef}
                                            value={box.memo || ''}
                                            onChange={e => handleInputChange(box.tempId, 'memo', e.target.value)}
                                            onBlur={() => setEditingBoxId(null)}
                                            className="h-8 w-32"
                                        />
                                    ) : (
                                        <span onClick={() => setEditingBoxId(box.tempId)} className="font-bold underline cursor-pointer">
                                            {box.memo || 'No Name'}
                                        </span>
                                    )}
                                </div>
                                <div className="z-20 flex items-center gap-2">
                                    <span className="font-mono font-bold text-primary">{box.cbm.toFixed(4)} m³</span>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteBox(box.tempId)} className="text-destructive h-8 w-8">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    <DimensionInput label="가로" id={`w-${box.tempId}`} value={box.width} onChange={e => handleInputChange(box.tempId, 'width', e.target.value)} disabled={isSelectionMode} />
                                    <DimensionInput label="세로" id={`l-${box.tempId}`} value={box.length} onChange={e => handleInputChange(box.tempId, 'length', e.target.value)} disabled={isSelectionMode} />
                                    <DimensionInput label="높이" id={`h-${box.tempId}`} value={box.height} onChange={e => handleInputChange(box.tempId, 'height', e.target.value)} disabled={isSelectionMode} />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleCameraClick(box.tempId)} disabled={isSelectionMode}>
                                        <Camera className="w-4 h-4 mr-1" /> {box.newImagePreview || box.imageUrl ? '사진 변경' : '사진'}
                                    </Button>
                                    <Button variant="outline" size="sm" title="치수 복사" onClick={() => handleCopyDimensions(box.tempId)} disabled={isSelectionMode}><Copy className="w-4 h-4" /></Button>
                                    <Button variant="outline" size="sm" title="아래로 복제" onClick={() => handleReplicateClick(box.tempId)} disabled={isSelectionMode}><CopyPlus className="w-4 h-4" /></Button>
                                </div>
                                {(box.newImagePreview || box.imageUrl) && (
                                    <div className="mt-2 relative h-24 w-full bg-black rounded-md overflow-hidden cursor-pointer" onClick={() => setBoxToViewImage(box)}>
                                        <Image src={box.newImagePreview || box.imageUrl!} alt="box" fill className="object-cover" />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Floating Save Button */}
                <div className="fixed bottom-6 left-0 right-0 px-6 z-50">
                    <Button className="w-full h-14 text-lg shadow-xl" onClick={handleSave} disabled={isSaving}>
                        <Check className="mr-2" /> 저장 및 완료
                    </Button>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} capture="environment" />

                {/* Modals for Add, Replicate, Delete, ViewImage - Keep them roughly same or simplified */}

                <Dialog open={isAddBoxModalOpen} onOpenChange={setIsAddBoxModalOpen}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>박스 추가</DialogTitle></DialogHeader>
                        <div className="flex items-center gap-4">
                            <Label>수량</Label>
                            <Input type="number" value={addBoxQuantity} onChange={e => setAddBoxQuantity(Number(e.target.value))} min={1} />
                        </div>
                        <DialogFooter>
                            <Button onClick={handleAddNewBox}>추가</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={!!replicationState} onOpenChange={() => setReplicationState(null)}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>연속 복제</DialogTitle></DialogHeader>
                        <Input type="number" value={replicationQuantity} onChange={e => setReplicationQuantity(Number(e.target.value))} min={1} />
                        <DialogFooter><Button onClick={handleApplyReplication}>적용</Button></DialogFooter>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={!!boxToDelete} onOpenChange={() => setBoxToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDeleteBox}>삭제</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <Dialog open={!!boxToViewImage} onOpenChange={() => setBoxToViewImage(null)}>
                    <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
                        <div className="flex-1 relative bg-black">
                            {boxToViewImage && (boxToViewImage.newImagePreview || boxToViewImage.imageUrl) && (
                                <Image src={boxToViewImage.newImagePreview || boxToViewImage.imageUrl!} alt="view" fill className="object-contain" />
                            )}
                        </div>
                        <div className="p-4 flex justify-between bg-white">
                            <Button variant="destructive" onClick={() => boxToViewImage && handleRemoveImage(boxToViewImage.tempId)}>사진 삭제</Button>
                            <Button onClick={() => setBoxToViewImage(null)}>닫기</Button>
                        </div>
                    </DialogContent>
                </Dialog>

            </main>

            {/* 🛡️ CBM Guard Alert */}
            <AlertDialog open={!!cbmWarning} onOpenChange={(open) => !open && setCbmWarning(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>⚠️ CBM 수치 확인</AlertDialogTitle>
                        <AlertDialogDescription className="flex flex-col gap-2">
                            <span className="font-bold text-red-600">
                                {cbmWarning?.message}
                            </span>
                            <span>
                                입력한 치수가 정확한지 다시 한번 확인해주세요.
                                {cbmWarning?.type === 'HIGH' && " (컨테이너 크기 수준입니다)"}
                                {cbmWarning?.type === 'LOW' && " (너무 작은 수치입니다)"}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소 (다시 입력)</AlertDialogCancel>
                        <AlertDialogAction onClick={() => cbmWarning?.onConfirm()} className="bg-red-600 hover:bg-red-700">
                            네, 맞습니다 (저장)
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

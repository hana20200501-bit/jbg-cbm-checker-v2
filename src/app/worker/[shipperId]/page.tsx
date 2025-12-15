
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useShippers } from '@/hooks/use-shippers';
import type { Box } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, Loader2, ServerCrash, PlusCircle, Trash2, Camera, Copy, ClipboardCheck, X, Check, ArrowUpCircle, Expand, CopyPlus } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { db, storage, BOX_COLLECTION } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { writeBatch, doc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';


type LocalBox = Box & {
    isNew?: boolean; // A flag to identify newly added boxes client-side
    newImageFile?: File;
    newImagePreview?: string;
    imageToDelete?: string | null;
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
        <p className="text-white text-lg font-semibold">Updating data, please wait...</p>
    </div>
);


export default function CBMInputPage() {
  const router = useRouter();
  const { shipperId } = useParams<{ shipperId: string }>();
  const { shippers, isLoading: shippersLoading } = useShippers();
  const { toast } = useToast();

  const [localBoxes, setLocalBoxes] = useState<LocalBox[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedDimensions, setCopiedDimensions] = useState<{width: string; length: string; height: string} | null>(null);
  const [boxToDelete, setBoxToDelete] = useState<LocalBox | null>(null);
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [boxToViewImage, setBoxToViewImage] = useState<LocalBox | null>(null);
  
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

  const shipper = useMemo(() => shippers.find(s => s.id === shipperId), [shippers, shipperId]);

  useEffect(() => {
    if (shipper && localBoxes.length === 0) {
      const sortedBoxes = [...shipper.boxes].sort((a, b) => a.boxNumber - b.boxNumber);
      setLocalBoxes(sortedBoxes.map(b => ({ ...b, isNew: false, newImageFile: undefined, newImagePreview: undefined, imageToDelete: null })));
    }
  }, [shipper, localBoxes.length]);


  useEffect(() => {
    if (editingBoxId && nameInputRef.current) {
        nameInputRef.current.focus();
        nameInputRef.current.select();
    }
  }, [editingBoxId]);
  
  useEffect(() => {
    const handleScroll = () => {
      setShowTopButton(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []); 


  const handleInputChange = (boxId: string, field: 'width' | 'length' | 'height' | 'customName', value: string) => {
    let finalValue = value;
    if (field !== 'customName') {
        finalValue = value.replace(/[^0-9.]/g, '');
        if (parseFloat(finalValue) < 0) return;
    }

    setLocalBoxes(prevBoxes => {
      const newBoxes = [...prevBoxes];
      const boxIndex = newBoxes.findIndex(b => b.id === boxId);
      if (boxIndex === -1) return prevBoxes;

      const updatedBox = { ...newBoxes[boxIndex], [field]: finalValue };
      
      if (field !== 'customName') {
        const w = parseFloat(updatedBox.width) || 0;
        const l = parseFloat(updatedBox.length) || 0;
        const h = parseFloat(updatedBox.height) || 0;
        updatedBox.cbm = (w > 0 && l > 0 && h > 0) ? (w * l * h / 1000000) : 0;
      }
      
      newBoxes[boxIndex] = updatedBox;
      return newBoxes;
    });
  };

  const handleCopyDimensions = (boxId: string) => {
    const box = localBoxes.find(b => b.id === boxId);
    if (box && box.width && box.length && box.height) {
      setCopiedDimensions({ width: box.width, length: box.length, height: box.height });
      setIsSelectionMode(true);
    } else {
      toast({ variant: 'destructive', title: '복사 실패', description: '치수가 모두 입력된 박스만 복사할 수 있습니다.' });
    }
  };
  
  const handleToggleSelection = (boxId: string) => {
    setSelectedBoxIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(boxId)) {
            newSet.delete(boxId);
        } else {
            newSet.add(boxId);
        }
        return newSet;
    });
  };
  
  const handleCancelSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedBoxIds(new Set());
    setCopiedDimensions(null);
  };
  
  const handleApplyToSelected = () => {
    if (!copiedDimensions) return;
    if (selectedBoxIds.size === 0) {
        toast({ variant: 'destructive', title: '적용 실패', description: '적용할 박스를 하나 이상 선택해주세요.' });
        return;
    }

    setLocalBoxes(prevBoxes => {
        return prevBoxes.map(box => {
            if (selectedBoxIds.has(box.id)) {
                const w = parseFloat(copiedDimensions.width) || 0;
                const l = parseFloat(copiedDimensions.length) || 0;
                const h = parseFloat(copiedDimensions.height) || 0;
                const cbm = (w > 0 && l > 0 && h > 0) ? (w * l * h / 1000000) : 0;
                return { ...box, ...copiedDimensions, cbm };
            }
            return box;
        });
    });

    toast({ title: '적용 완료', description: `${selectedBoxIds.size}개의 박스에 치수가 적용되었습니다.` });
    handleCancelSelectionMode();
  }

  const handleAddNewBox = () => {
    if (!shipper || addBoxQuantity < 1) return;
  
    const newBoxes: LocalBox[] = [];
    const highestBoxNumber = localBoxes.length > 0
      ? Math.max(...localBoxes.map(b => b.boxNumber))
      : 0;

    for (let i = 0; i < addBoxQuantity; i++) {
        const newBox: LocalBox = {
            id: `new-${Date.now()}-${Math.random()}-${i}`,
            isNew: true,
            shipperId: shipper.id,
            boxNumber: highestBoxNumber + i + 1,
            width: '',
            length: '',
            height: '',
            cbm: 0,
            customName: '',
        };
        newBoxes.push(newBox);
    }
    
    setLocalBoxes(prevBoxes => [...prevBoxes, ...newBoxes]);
  
    toast({ title: "박스 추가됨", description: `${addBoxQuantity}개의 새 박스가 목록 하단에 추가되었습니다.` });
    setIsAddBoxModalOpen(false);
    setAddBoxQuantity(1);
  };
  
  const handleDeleteBox = async (boxId: string) => {
    setBoxToDelete(localBoxes.find(b => b.id === boxId) || null);
  };

  const confirmDeleteBox = async () => {
    if (!boxToDelete || !db) return;

    if (boxToDelete.isNew) {
        setLocalBoxes(prev => prev.filter(b => b.id !== boxToDelete.id));
        toast({ title: "박스 삭제됨", description: "추가했던 박스가 목록에서 삭제되었습니다."});
        setBoxToDelete(null);
        return;
    }
  
    setIsSaving(true);
    try {
        const boxRef = doc(db, BOX_COLLECTION, boxToDelete.id);
        
        if (boxToDelete.imageUrl && storage) {
            try {
                const imageRef = ref(storage, boxToDelete.imageUrl);
                await deleteObject(imageRef);
            } catch (storageError: any) {
                 if (storageError.code !== 'storage/object-not-found') {
                    console.error(`Failed to delete image for box ${boxToDelete.id}:`, storageError);
                }
            }
        }
        
        await deleteDoc(boxRef);
        setLocalBoxes(prev => prev.filter(b => b.id !== boxToDelete.id));
        toast({ title: "박스 삭제됨", description: "박스가 데이터베이스에서 영구적으로 삭제되었습니다."});
    } catch(error) {
        console.error("박스 삭제 중 오류 발생:", error);
        toast({ variant: "destructive", title: "오류", description: "박스 삭제에 실패했습니다."});
    } finally {
        setIsSaving(false);
        setBoxToDelete(null);
    }
  }

  const handleReplicateClick = (boxId: string) => {
    const boxIndex = localBoxes.findIndex(b => b.id === boxId);
    const sourceBox = localBoxes[boxIndex];
    if (sourceBox && sourceBox.width && sourceBox.length && sourceBox.height) {
      setReplicationState({ sourceBox, sourceIndex: boxIndex });
      setReplicationQuantity(1);
    } else {
      toast({ variant: 'destructive', title: '복제 실패', description: '치수가 모두 입력된 박스만 복제할 수 있습니다.' });
    }
  };

  const handleApplyReplication = () => {
    if (!replicationState) return;

    const { sourceBox, sourceIndex } = replicationState;
    const { width, length, height } = sourceBox;
    const w = parseFloat(width) || 0;
    const l = parseFloat(length) || 0;
    const h = parseFloat(height) || 0;
    const cbm = (w > 0 && l > 0 && h > 0) ? (w * l * h / 1000000) : 0;
    
    setLocalBoxes(prevBoxes => {
      const newBoxes = [...prevBoxes];
      const targetCount = Math.min(replicationQuantity, newBoxes.length - 1 - sourceIndex);

      for (let i = 0; i < targetCount; i++) {
        const targetIndex = sourceIndex + 1 + i;
        newBoxes[targetIndex] = { ...newBoxes[targetIndex], width, length, height, cbm };
      }
      return newBoxes;
    });

    toast({ title: '복제 완료', description: `${replicationQuantity}개의 박스에 치수가 적용되었습니다.` });
    setReplicationState(null);
  };
  
  const handleCameraClick = (boxId: string) => {
    activeBoxIdForUpload.current = boxId;
    fileInputRef.current?.click();
  };

  const handleImageDelete = (box: LocalBox) => {
    setLocalBoxes(prevBoxes => prevBoxes.map(b => {
        if (b.id === box.id) {
            const urlToDelete = b.imageUrl || null;
            return {
                ...b,
                newImageFile: undefined, 
                newImagePreview: undefined,
                imageUrl: undefined,
                imageToDelete: urlToDelete, 
            };
        }
        return b;
    }));
    setBoxToViewImage(null);
    toast({ title: "사진 삭제됨", description: "완료 버튼을 누르면 최종 저장됩니다." });
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const boxId = activeBoxIdForUpload.current;
    if (!file || !boxId) return;
    
    try {
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedFile);

      setLocalBoxes(prevBoxes => prevBoxes.map(b => {
        if (b.id === boxId) {
          if (b.newImagePreview) {
              URL.revokeObjectURL(b.newImagePreview);
          }
          const urlToDelete = b.imageUrl;
          return {
            ...b,
            newImageFile: compressedFile,
            newImagePreview: previewUrl,
            imageUrl: undefined, 
            imageToDelete: urlToDelete,
          };
        }
        return b;
      }));
      toast({ title: "사진 준비됨", description: "새로운 사진이 준비되었습니다. 완료 시 저장됩니다."});

    } catch (error: any) {
      console.error("Image compression failed:", error);
      toast({ variant: "destructive", title: "압축 실패", description: `오류가 발생했습니다: ${error.message}` });
    } finally {
      if(fileInputRef.current) fileInputRef.current.value = "";
      activeBoxIdForUpload.current = null;
    }
  };
  
  const handleNavigateBack = () => {
    router.back();
  }

  const handleBoxNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setEditingBoxId(null);
    }
  };

  const handleDimensionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentField: 'width' | 'length' | 'height', boxId: string) => {
    if (e.key !== 'Enter') return;
  
    e.preventDefault();
  
    let nextFieldId = '';
    if (currentField === 'width') {
      nextFieldId = `length-${boxId}`;
    } else if (currentField === 'length') {
      nextFieldId = `height-${boxId}`;
    }
  
    if (nextFieldId) {
      const nextInput = document.getElementById(nextFieldId);
      nextInput?.focus();
      (nextInput as HTMLInputElement)?.select();
    } else {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSubmit = async () => {
    if (!shipper || !db) return;
    setIsSaving(true);

    try {
        const uploadPromises: Promise<void>[] = [];
        const processedBoxes = [...localBoxes]; 

        for (let i = 0; i < processedBoxes.length; i++) {
            const box = processedBoxes[i];
            let finalImageUrl = box.imageUrl;

            if (box.imageToDelete && !box.newImageFile) {
                const deletePromise = (async () => {
                    try {
                        const oldImageRef = ref(storage, box.imageToDelete!);
                        await deleteObject(oldImageRef);
                    } catch (err: any) {
                        if (err.code !== 'storage/object-not-found') console.error(`Old image delete failed: ${box.imageToDelete}`, err);
                    }
                })();
                uploadPromises.push(deletePromise);
                finalImageUrl = undefined;
            }
            
            if (box.newImageFile) {
                const uploadPromise = (async () => {
                    if (box.imageToDelete) { 
                        try {
                            const oldImageRef = ref(storage, box.imageToDelete);
                            await deleteObject(oldImageRef);
                        } catch (err: any) {
                            if (err.code !== 'storage/object-not-found') console.error(`Old image delete failed for ${box.imageToDelete}:`, err);
                        }
                    }
                    
                    const newImageId = doc(collection(db, 'id-generator')).id;
                    const storageRef = ref(storage, `box-images/${shipperId}/${newImageId}-${Date.now()}`);
                    const snapshot = await uploadBytes(storageRef, box.newImageFile);
                    finalImageUrl = await getDownloadURL(snapshot.ref);
                    
                    processedBoxes[i] = { ...processedBoxes[i], imageUrl: finalImageUrl };
                })();
                uploadPromises.push(uploadPromise);
            }
        }
      
        await Promise.all(uploadPromises);

        const batch = writeBatch(db);
        for (const box of processedBoxes) {
            const { newImageFile, newImagePreview, imageToDelete, id, isNew, ...firestoreBoxData } = box;
            
            const updateData: any = { 
              ...firestoreBoxData,
              imageUrl: box.imageUrl === undefined ? null : box.imageUrl,
            };

            if (box.isNew) {
                const newBoxRef = doc(collection(db, BOX_COLLECTION));
                batch.set(newBoxRef, updateData);
            } else {
                const boxRef = doc(db, BOX_COLLECTION, box.id);
                batch.update(boxRef, updateData);
            }
        }

        await batch.commit();

        toast({ title: "저장 완료", description: "모든 변경사항이 안전하게 저장되었습니다." });
        router.push('/worker');

    } catch (error) {
      console.error("Failed to save changes", error);
      toast({ variant: "destructive", title: "저장 실패", description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다." });
    } finally {
        setIsSaving(false);
    }
  };
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  if (shippersLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">데이터를 불러오는 중...</span>
      </div>
    );
  }

  if (!shipper) {
    return (
        <div className="flex flex-col justify-center items-center h-screen text-center p-4">
            <ServerCrash className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold">화주 정보를 찾을 수 없습니다.</h2>
            <p className="text-muted-foreground">목록으로 돌아가 다시 시도해주세요.</p>
            <Button variant="outline" onClick={() => router.push('/worker')} className="mt-6">
                <ArrowLeft className="w-4 h-4 mr-1" />
                화주 목록으로 돌아가기
            </Button>
        </div>
    );
  }

  const maxReplicationQty = replicationState ? localBoxes.length - 1 - replicationState.sourceIndex : 0;

  return (
    <>
      {isSaving && <SavingOverlay />}
      <main ref={mainRef} className="container mx-auto p-4 sm:p-6 space-y-6 pb-28">
        {isSelectionMode && (
          <div className="fixed inset-0 bg-black/40 z-40" />
        )}
        
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        
        <AlertDialog open={!!boxToDelete} onOpenChange={() => setBoxToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>이 박스를 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                이 작업은 데이터베이스에서 박스 정보를 영구적으로 삭제하며, 되돌릴 수 없습니다. 관련된 사진도 함께 삭제됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>아니요</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteBox} disabled={isSaving}>
                {isSaving ? '삭제중...' : '예, 삭제합니다'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isAddBoxModalOpen} onOpenChange={setIsAddBoxModalOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>추가할 박스 수량</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="box-quantity" className="text-right">
                          수량
                      </Label>
                      <Input
                          id="box-quantity"
                          type="number"
                          value={addBoxQuantity}
                          onChange={(e) => setAddBoxQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="col-span-3"
                          min="1"
                      />
                  </div>
              </div>
              <DialogFooter>
                  <DialogClose asChild>
                      <Button type="button" variant="secondary">취소</Button>
                  </DialogClose>
                  <Button type="button" onClick={handleAddNewBox}>추가</Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={!!replicationState} onOpenChange={() => setReplicationState(null)}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>연속 복제할 수량 입력</DialogTitle>
                  <DialogDescription>
                    {`박스 #${replicationState?.sourceBox.boxNumber}의 치수를 아래 박스들에 적용합니다. 최대 ${maxReplicationQty}개까지 가능합니다.`}
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="replication-quantity" className="text-right">
                          수량
                      </Label>
                      <Input
                          id="replication-quantity"
                          type="number"
                          value={replicationQuantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 1;
                            setReplicationQuantity(Math.max(1, Math.min(val, maxReplicationQty)));
                          }}
                          className="col-span-3"
                          min="1"
                          max={maxReplicationQty}
                      />
                  </div>
              </div>
              <DialogFooter>
                  <DialogClose asChild>
                      <Button type="button" variant="secondary">취소</Button>
                  </DialogClose>
                  <Button type="button" onClick={handleApplyReplication} disabled={maxReplicationQty === 0}>적용</Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!boxToViewImage} onOpenChange={() => setBoxToViewImage(null)}>
            <DialogContent className="max-w-full w-full h-[75vh] p-0 sm:max-w-3xl sm:h-[80vh] flex flex-col">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>{boxToViewImage?.customName || `박스 #${boxToViewImage?.boxNumber}`}</DialogTitle>
                </DialogHeader>
                {boxToViewImage && (boxToViewImage.newImagePreview || boxToViewImage.imageUrl) && (
                    <div className="relative w-full flex-grow bg-black">
                        <Image src={boxToViewImage.newImagePreview || boxToViewImage.imageUrl!} alt="Box image preview" layout="fill" objectFit="contain" />
                    </div>
                )}
                 <DialogFooter className="p-4 border-t sm:justify-between gap-2 mt-auto">
                    <Button type="button" variant="destructive" onClick={() => boxToViewImage && handleImageDelete(boxToViewImage)}>
                        <Trash2 className="w-4 h-4 mr-2"/>
                        사진 삭제
                    </Button>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">닫기</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <div className="flex items-center">
          <Button variant="ghost" onClick={handleNavigateBack} className="mr-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            목록으로
          </Button>
        </div>
        
        {isSelectionMode && (
            <div className="sticky top-4 w-full z-[60] bg-background p-4 rounded-lg shadow-lg flex flex-col items-center justify-center gap-2">
                <span className="font-bold text-lg">{selectedBoxIds.size}개 박스 선택됨</span>
                <div className="flex w-full gap-2">
                    <Button variant="outline" onClick={handleCancelSelectionMode} className="w-full">
                        <X className="w-4 h-4 mr-2" />
                        취소
                    </Button>
                    <Button onClick={handleApplyToSelected} className="bg-blue-600 hover:bg-blue-700 w-full">
                        <ClipboardCheck className="w-4 h-4 mr-2" />
                        선택한 박스에 적용
                    </Button>
                </div>
            </div>
        )}


        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            {(shipper.imageUrl || shipper.representativeBoxImageUrl) && (
              <Image src={(shipper.imageUrl || shipper.representativeBoxImageUrl)!} alt={shipper.nameKr} width={96} height={96} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg bg-muted flex-shrink-0" data-ai-hint="package" />
            )}
            <div className="flex-grow space-y-2">
              <CardTitle className="text-black">{shipper.nameKr} / {shipper.nameEn}</CardTitle>
              <CardDescription>총 {localBoxes.length}개 박스의 CBM을 입력하세요.</CardDescription>
              <div className="border-t pt-2 space-y-1">
                  <InfoField label="연락처" value={shipper.contact} valueClassName="text-black" />
                  <InfoField label="특징" value={shipper.boxFeature1} valueClassName="text-primary" />
                  <InfoField label="송장번호" value={shipper.invoiceNumber} valueClassName="text-destructive font-bold" />
                  {shipper.region && <InfoField label="지역명" value={shipper.region} valueClassName="text-black" />}
              </div>
            </div>
            <div className="flex-shrink-0">
              <Button onClick={() => setIsAddBoxModalOpen(true)} disabled={isSaving}>
                <PlusCircle className="w-4 h-4 mr-2" />
                박스 추가
              </Button>
            </div>
          </CardHeader>
        </Card>
        
        <div className="space-y-4">
          {localBoxes.map((box) => (
            <div key={box.id} className="relative">
              {isSelectionMode && (
                  <div 
                      className="absolute inset-0 bg-black/30 z-50 flex items-center justify-center rounded-lg"
                      onClick={() => handleToggleSelection(box.id)}
                  >
                      <div className={cn(
                          "w-20 h-20 rounded-full border-4 border-white bg-black/30 flex items-center justify-center cursor-pointer transition-all duration-200",
                          selectedBoxIds.has(box.id) && "bg-blue-600 border-blue-500"
                      )}>
                          {selectedBoxIds.has(box.id) && <Check className="w-12 h-12 text-white" />}
                      </div>
                  </div>
              )}
              <Card className={cn(isSelectionMode && "pointer-events-none")}>
                <CardHeader className="flex-row justify-between items-start pb-3">
                  <div className="flex items-center gap-4">
                    {editingBoxId === box.id ? (
                      <Input
                        ref={nameInputRef}
                        value={box.customName ?? `박스 #${box.boxNumber}`}
                        onChange={(e) => handleInputChange(box.id, 'customName', e.target.value)}
                        onBlur={() => setEditingBoxId(null)}
                        onKeyDown={handleBoxNameKeyDown}
                        className="h-9"
                      />
                    ) : (
                      <CardTitle
                        className="text-lg cursor-pointer hover:bg-muted p-1 rounded-md"
                        onClick={() => !isSelectionMode && setEditingBoxId(box.id)}
                      >
                        {box.customName || `박스 #${box.boxNumber}`}
                      </CardTitle>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-primary">{box.cbm.toFixed(4)} m³</p>
                      <Button type="button" onClick={() => handleDeleteBox(box.id)} variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isSaving || isSelectionMode}>
                        <Trash2 className="w-5 h-5"/>
                        <span className="sr-only">Delete box {box.boxNumber}</span>
                      </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-4">
                    <div className="flex-1 flex gap-2">
                        <DimensionInput label="가로(cm)" id={`width-${box.id}`} value={box.width} onChange={e => handleInputChange(box.id, 'width', e.target.value)} onKeyDown={(e) => handleDimensionKeyDown(e, 'width', box.id)} disabled={isSelectionMode} />
                        <DimensionInput label="세로(cm)" id={`length-${box.id}`} value={box.length} onChange={e => handleInputChange(box.id, 'length', e.target.value)} onKeyDown={(e) => handleDimensionKeyDown(e, 'length', box.id)} disabled={isSelectionMode} />
                        <DimensionInput label="높이(cm)" id={`height-${box.id}`} value={box.height} onChange={e => handleInputChange(box.id, 'height', e.target.value)} onKeyDown={(e) => handleDimensionKeyDown(e, 'height', box.id)} disabled={isSelectionMode} />
                    </div>
                    
                    <div className="flex-shrink-0 w-full sm:w-auto flex items-stretch gap-2">
                        {box.newImagePreview || box.imageUrl ? (
                           <button
                                type="button"
                                className="relative group w-24 h-24"
                                onClick={() => setBoxToViewImage(box)}
                                disabled={isSelectionMode}
                            >
                                <Image src={box.newImagePreview || box.imageUrl!} alt={`Box ${box.boxNumber} image`} fill className="object-cover rounded-md" />
                            </button>
                        ) : (
                            <Button 
                              type="button"
                              onClick={() => handleCameraClick(box.id)} 
                              variant="outline" 
                              className="w-24 h-24 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              disabled={isSelectionMode}
                            >
                                <>
                                  <Camera className="w-8 h-8" />
                                  <span className="text-xs font-semibold">사진 추가</span>
                                </>
                            </Button>
                        )}
                        <div className="flex flex-col items-stretch justify-center gap-2">
                            <Button type="button" onClick={() => handleCopyDimensions(box.id)} variant="outline" className="h-full flex-1" disabled={isSelectionMode}>
                                <Copy className="w-4 h-4 mr-2" /> Copy
                            </Button>
                            <Button type="button" onClick={() => handleReplicateClick(box.id)} variant="outline" className="h-full flex-1" disabled={isSelectionMode}>
                                <CopyPlus className="w-4 h-4 mr-2" /> 복제
                            </Button>
                        </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {showTopButton && (
          <Button
              onClick={scrollToTop}
              className="fixed bottom-24 right-6 w-12 h-12 rounded-full shadow-lg z-50"
              size="icon"
          >
              <ArrowUpCircle className="w-6 h-6" />
              <span className="sr-only">Go to top</span>
          </Button>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 border-t z-50 backdrop-blur-sm">
        <Button onClick={handleSubmit} className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg" disabled={isSaving || isSelectionMode}>
            <CheckCircle className="w-5 h-5 mr-2" />
            작업 완료 및 목록으로 돌아가기
        </Button>
      </div>
    </>
  );
};

    
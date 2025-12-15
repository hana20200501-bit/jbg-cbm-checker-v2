
"use client";

import React from 'react';
import type { ShipperWithBoxData } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { ImageIcon, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShipperDetailsModalProps {
  shipper: ShipperWithBoxData;
  isOpen: boolean;
  onClose: () => void;
}

const InfoField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <div className="bg-muted/50 p-3 rounded-md">
        <p className="text-xs text-muted-foreground font-semibold">{label}</p>
        <p className="text-foreground">{value || '-'}</p>
    </div>
);

const ShipperDetailsModal: React.FC<ShipperDetailsModalProps> = ({ shipper, isOpen, onClose }) => {
    const { toast } = useToast();

    const handleCopyAll = () => {
        if (!shipper || shipper.boxes.length === 0) {
            toast({
                variant: "destructive",
                title: "복사할 데이터 없음",
                description: "복사할 박스 정보가 없습니다.",
            });
            return;
        }

        const textToCopy = shipper.boxes
            .sort((a,b) => a.boxNumber - b.boxNumber)
            .map(box => {
                const width = box.width || '0';
                const length = box.length || '0';
                const height = box.height || '0';
                return `${width}\t${length}\t${height}`;
            }).join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({
                title: "전체 복사 완료",
                description: `총 ${shipper.boxes.length}개 박스의 치수 정보가 클립보드에 복사되었습니다.`,
            });
        }).catch(err => {
            console.error('Could not copy text: ', err);
            toast({
                variant: "destructive",
                title: "복사 실패",
                description: "클립보드에 복사하는 중 오류가 발생했습니다.",
            });
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{shipper.nameKr} ({shipper.nameEn})</DialogTitle>
                    <DialogDescription>
                        화주 상세 정보 {shipper.uniqueNumber && `(고유넘버: ${shipper.uniqueNumber})`}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-sm">
                        <InfoField label="연락처" value={shipper.contact} />
                        <InfoField label="박스 특징" value={shipper.boxFeature1} />
                        <InfoField label="송장번호" value={shipper.invoiceNumber} />
                        <InfoField label="지역명" value={shipper.region} />
                    </div>
                    
                    <h3 className="text-lg font-semibold text-foreground mb-2">박스 목록 ({shipper.boxes.length}개)</h3>
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-center">이름/번호</TableHead>
                                    <TableHead className="text-center">사진</TableHead>
                                    <TableHead className="text-center">가로 (cm)</TableHead>
                                    <TableHead className="text-center">세로 (cm)</TableHead>
                                    <TableHead className="text-center">높이 (cm)</TableHead>
                                    <TableHead className="text-center">CBM (m³)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shipper.boxes.length > 0 ? shipper.boxes.sort((a,b) => a.boxNumber - b.boxNumber).map(box => (
                                    <TableRow key={box.id}>
                                        <TableCell className="text-center font-semibold">{box.customName || `박스 #${box.boxNumber}`}</TableCell>
                                        <TableCell className="text-center">
                                            {box.imageUrl ? (
                                                <a href={box.imageUrl} target="_blank" rel="noopener noreferrer">
                                                    <Image src={box.imageUrl} alt={`Box ${box.boxNumber}`} width={40} height={40} className="w-10 h-10 object-cover rounded-md mx-auto" />
                                                </a>
                                            ) : (
                                                <div className="w-10 h-10 flex items-center justify-center mx-auto text-muted-foreground">
                                                    <ImageIcon className="w-5 h-5" />
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">{box.width || '-'}</TableCell>
                                        <TableCell className="text-center">{box.length || '-'}</TableCell>
                                        <TableCell className="text-center">{box.height || '-'}</TableCell>
                                        <TableCell className="text-center font-bold text-primary">{box.cbm.toFixed(4)}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="p-4 text-center text-muted-foreground">
                                            이 화주에게 등록된 박스가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter className="mt-4 pt-4 border-t sm:justify-between">
                     <Button type="button" onClick={handleCopyAll}>
                        <Copy className="w-4 h-4 mr-2" />
                        전체 복사 (가로/세로/높이)
                    </Button>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">닫기</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ShipperDetailsModal;

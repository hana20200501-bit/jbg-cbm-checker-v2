
"use client";

import React, { useEffect } from 'react';
import type { ShipperWithBoxData } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { ImageIcon, Copy } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from '@/hooks/use-toast';

interface GroupDetailsModalProps {
  group: { name: string; shippers: ShipperWithBoxData[] };
  isOpen: boolean;
  onClose: () => void;
}

const InfoField: React.FC<{ label: string; value?: string | number }> = ({ label, value }) => (
    <div className="bg-muted/50 p-3 rounded-md">
        <p className="text-xs text-muted-foreground font-semibold">{label}</p>
        <p className="text-foreground">{value || '-'}</p>
    </div>
);


const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({ group, isOpen, onClose }) => {
    const { toast } = useToast();

    if (!group) return null;

    const totalBoxes = group.shippers.reduce((acc, s) => acc + s.boxes.length, 0);
    const totalCbmOfGroup = group.shippers.reduce((acc, s) => acc + s.totalCbm, 0);

    const representativeShipper = group.shippers[0];

    const handleCopyNames = React.useCallback(() => {
        if (!group || !group.shippers || group.shippers.length === 0) {
            toast({
                variant: "destructive",
                title: "복사할 이름 없음",
                description: "그룹에 화주 정보가 없습니다.",
            });
            return;
        }

        const firstName = group.shippers[0].nameKr;
        
        navigator.clipboard.writeText(firstName).then(() => {
            toast({
                title: "이름 복사 완료",
                description: `'${firstName}' 이름이 클립보드에 복사되었습니다.`,
            });
        }).catch(err => {
            toast({
                variant: "destructive",
                title: "복사 실패",
                description: "이름 복사 중 오류가 발생했습니다.",
            });
        });
    }, [group, toast]);

    const handleCopyInvoices = React.useCallback(() => {
        if (!group || group.shippers.length === 0) {
            toast({
                variant: "destructive",
                title: "복사할 송장번호 없음",
                description: "그룹에 화주 정보가 없습니다.",
            });
            return;
        }

        const invoicesToCopy = group.shippers.flatMap(shipper => 
            shipper.boxes.map(() => shipper.invoiceNumber || '없음')
        );
        
        const textToCopy = invoicesToCopy.join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({
                title: "송장번호 복사 완료",
                description: `${invoicesToCopy.length}개의 송장번호가 클립보드에 복사되었습니다.`,
            });
        }).catch(err => {
            toast({
                variant: "destructive",
                title: "복사 실패",
                description: "송장번호 복사 중 오류가 발생했습니다.",
            });
        });
    }, [group, toast]);

    const handleCopyDimensions = React.useCallback(() => {
        if (!group || totalBoxes === 0) {
            toast({
                variant: "destructive",
                title: "복사할 데이터 없음",
                description: "그룹에 복사할 박스 치수 정보가 없습니다.",
            });
            return;
        }

        const textToCopy = group.shippers
            .flatMap(shipper => 
                shipper.boxes
                    .sort((a, b) => a.boxNumber - b.boxNumber)
                    .map(box => {
                        const width = box.width || '0';
                        const length = box.length || '0';
                        const height = box.height || '0';
                        return `${width}\t${length}\t${height}`;
                    })
            )
            .join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({
                title: "CBM(치수) 복사 완료",
                description: `총 ${totalBoxes}개 박스의 가로/세로/높이 정보가 클립보드에 복사되었습니다.`,
            });
        }).catch(err => {
            toast({
                variant: "destructive",
                title: "복사 실패",
                description: "치수 복사 중 오류가 발생했습니다.",
            });
        });
    }, [group, totalBoxes, toast]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isOpen) return;

            if (event.altKey) {
                switch (event.key) {
                    case '1':
                        event.preventDefault();
                        handleCopyNames();
                        break;
                    case '2':
                        event.preventDefault();
                        handleCopyInvoices();
                        break;
                    case '3':
                        event.preventDefault();
                        handleCopyDimensions();
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, handleCopyNames, handleCopyInvoices, handleCopyDimensions]);
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
                <DialogHeader>
                    {representativeShipper && (
                        <>
                            <DialogTitle>{representativeShipper.nameKr} ({representativeShipper.nameEn})</DialogTitle>
                            <DialogDescription>
                                화주 상세 정보 (고유넘버: {group.name})
                            </DialogDescription>
                        </>
                    )}
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 text-sm">
                   {representativeShipper && (
                    <>
                        <InfoField label="연락처" value={representativeShipper.contact} />
                        <InfoField label="지역명" value={representativeShipper.region} />
                        <InfoField label="총 박스 수량" value={`${totalBoxes} 개`} />
                        <InfoField label="총 CBM" value={`${totalCbmOfGroup.toFixed(4)} m³`} />
                    </>
                   )}
                </div>
                
                <ScrollArea className="flex-grow border rounded-lg">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted z-10">
                            <TableRow>
                                <TableHead className="text-center w-[100px]">사진</TableHead>
                                <TableHead className="w-[200px]">화주/특징</TableHead>
                                <TableHead className="w-[150px]">송장번호</TableHead>
                                <TableHead className="text-center w-[80px]">수량</TableHead>
                                <TableHead className="text-center w-[100px]">가로 (cm)</TableHead>
                                <TableHead className="text-center w-[100px]">세로 (cm)</TableHead>
                                <TableHead className="text-center w-[100px]">높이 (cm)</TableHead>
                                <TableHead className="text-center w-[120px]">CBM (m³)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {group.shippers.map((shipper) => (
                                <React.Fragment key={shipper.id}>
                                    {shipper.boxes.length > 0 ? shipper.boxes.sort((a,b) => a.boxNumber - b.boxNumber).map((box, boxIndex) => (
                                        <TableRow key={box.id}>
                                            <TableCell className="text-center p-1">
                                                {box.imageUrl ? (
                                                    <a href={box.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                                                        <Image src={box.imageUrl} alt={`Box ${box.boxNumber}`} width={48} height={48} className="w-12 h-12 object-cover rounded-md mx-auto" data-ai-hint="package" />
                                                    </a>
                                                ) : (
                                                    <div className="w-12 h-12 flex items-center justify-center mx-auto text-muted-foreground bg-muted rounded-md">
                                                        <ImageIcon className="w-5 h-5" />
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="p-3">
                                                <p className="font-semibold text-foreground">{shipper.nameKr}</p>
                                                <p className="text-sm text-primary">{shipper.boxFeature1 || '-'}</p>
                                                <p className="text-xs text-muted-foreground">{box.customName || `박스 #${box.boxNumber}`}</p>
                                            </TableCell>
                                            <TableCell className="text-sm">{shipper.invoiceNumber || '없음'}</TableCell>
                                            <TableCell className="text-center">{boxIndex === 0 ? shipper.boxes.length : ''}</TableCell>
                                            <TableCell className="text-center">{box.width || '-'}</TableCell>
                                            <TableCell className="text-center">{box.length || '-'}</TableCell>
                                            <TableCell className="text-center">{box.height || '-'}</TableCell>
                                            <TableCell className="text-center font-bold text-primary">{box.cbm.toFixed(4)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="p-4 text-center text-muted-foreground">
                                               <strong>{shipper.nameKr}</strong>: 이 화주에게 등록된 박스가 없습니다.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>

                <DialogFooter className="mt-4 pt-4 border-t sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={handleCopyNames}>
                            <Copy className="w-4 h-4 mr-2" />
                            이름 복사
                        </Button>
                        <Button type="button" onClick={handleCopyInvoices}>
                            <Copy className="w-4 h-4 mr-2" />
                            송장번호 복사
                        </Button>
                        <Button type="button" onClick={handleCopyDimensions}>
                            <Copy className="w-4 h-4 mr-2" />
                            CBM 복사 (가로/세로/높이)
                        </Button>
                    </div>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">닫기</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default GroupDetailsModal;

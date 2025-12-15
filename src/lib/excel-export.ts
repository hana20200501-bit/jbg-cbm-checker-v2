
"use server";

import ExcelJS from 'exceljs';
import type { ShipperWithBoxData } from '@/types';

// Helper function to download an image from a URL and return it as a buffer.
// Includes error handling for failed downloads.
async function downloadImage(url: string): Promise<{ buffer: Buffer; extension: 'jpeg' | 'png' } | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch image: ${response.statusText} from ${url}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Basic check for image type based on magic numbers.
        const extension = (buffer.subarray(0, 4).toString('hex').startsWith('ffd8')) ? 'jpeg' : 'png';

        return { buffer, extension };
    } catch (error) {
        console.error(`Error downloading image from ${url}:`, error);
        return null;
    }
}

export async function generateExcelBuffer(shippers: ShipperWithBoxData[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("CBM 데이터");

    // 1. Set up headers
    worksheet.columns = [
        { header: "고유넘버", key: "uniqueNumber", width: 15 },
        { header: "화주명(한글)", key: "nameKr", width: 20 },
        { header: "화주명(영문)", key: "nameEn", width: 20 },
        { header: "연락처", key: "contact", width: 15 },
        { header: "특징", key: "boxFeature1", width: 15 },
        { header: "송장번호", key: "invoiceNumber", width: 15 },
        { header: "지역명", key: "region", width: 15 },
        { header: "총 박스", key: "boxCount", width: 10, style: { alignment: { horizontal: 'center' } } },
        { header: "이름/번호", key: "boxName", width: 15, style: { alignment: { horizontal: 'center' } } },
        { header: "가로(cm)", key: "width", width: 10, style: { numFmt: '0.00', alignment: { horizontal: 'right' } } },
        { header: "세로(cm)", key: "length", width: 10, style: { numFmt: '0.00', alignment: { horizontal: 'right' } } },
        { header: "높이(cm)", key: "height", width: 10, style: { numFmt: '0.00', alignment: { horizontal: 'right' } } },
        { header: "CBM (m³)", key: "cbm", width: 12, style: { numFmt: '0.0000', alignment: { horizontal: 'right' } } },
        { header: "사진", key: "image", width: 20 },
    ];
    
    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 20;
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
        };
    });

    // 2. Prepare all image data in advance
    const imagePromises = shippers.flatMap(shipper =>
        shipper.boxes.map(async box => ({
            boxId: box.id,
            imageData: box.imageUrl ? await downloadImage(box.imageUrl) : null,
        }))
    );
    const resolvedImages = await Promise.all(imagePromises);
    const imageMap = new Map(resolvedImages.map(img => [img.boxId, img.imageData]));

    // 3. Add data rows and images
    let currentRowIndex = 1;

    for (const shipper of shippers) {
        const startRowForMerge = currentRowIndex + 1;

        if (shipper.boxes.length > 0) {
            for (const box of shipper.boxes.sort((a, b) => a.boxNumber - b.boxNumber)) {
                currentRowIndex++;
                const isFirstBoxRow = (currentRowIndex === startRowForMerge);

                const row = worksheet.addRow({
                    uniqueNumber: isFirstBoxRow ? shipper.uniqueNumber : '',
                    nameKr: isFirstBoxRow ? shipper.nameKr : '',
                    nameEn: isFirstBoxRow ? shipper.nameEn : '',
                    contact: isFirstBoxRow ? shipper.contact : '',
                    boxFeature1: isFirstBoxRow ? shipper.boxFeature1 : '',
                    invoiceNumber: isFirstBoxRow ? shipper.invoiceNumber : '',
                    region: isFirstBoxRow ? shipper.region : '',
                    boxCount: isFirstBoxRow ? shipper.boxes.length : '',
                    boxName: box.customName || `박스 #${box.boxNumber}`,
                    width: box.width ? parseFloat(box.width) : null,
                    length: box.length ? parseFloat(box.length) : null,
                    height: box.height ? parseFloat(box.height) : null,
                    cbm: box.cbm > 0 ? box.cbm : null,
                });
                
                row.height = 80;
                row.alignment = { vertical: 'middle' };

                // Add image from the pre-downloaded map
                const imageData = imageMap.get(box.id);
                if (imageData) {
                    try {
                        const imageId = workbook.addImage({
                            buffer: imageData.buffer,
                            extension: imageData.extension,
                        });
                        worksheet.addImage(imageId, {
                            tl: { col: 13.05, row: currentRowIndex - 1 + 0.05 },
                            ext: { width: 75, height: 75 }
                        });
                    } catch (e) {
                         console.error(`Failed to add image for box ${box.id} to worksheet`, e);
                    }
                }
            }
        } else {
            // Add shipper row even if there are no boxes
            currentRowIndex++;
            const row = worksheet.addRow({
                uniqueNumber: shipper.uniqueNumber,
                nameKr: shipper.nameKr,
                nameEn: shipper.nameEn,
                contact: shipper.contact,
                boxFeature1: shipper.boxFeature1,
                invoiceNumber: shipper.invoiceNumber,
                region: shipper.region,
                boxCount: 0,
            });
            row.height = 20;
            row.alignment = { vertical: 'middle' };
        }

        // Merge cells for shipper-level info
        const endRowForMerge = currentRowIndex;
        if (endRowForMerge > startRowForMerge) {
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
                worksheet.mergeCells(`${col}${startRowForMerge}:${col}${endRowForMerge}`);
            });
        }
    }

    // 4. Write to buffer and return
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
}

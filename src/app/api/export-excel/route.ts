
import { NextResponse } from 'next/server';
import { generateExcelBuffer } from '@/lib/excel-export';
import type { ShipperWithBoxData } from '@/types';

export async function POST(request: Request) {
  try {
    const { shippers } = (await request.json()) as { shippers: ShipperWithBoxData[] };

    if (!shippers || !Array.isArray(shippers)) {
      return new NextResponse('Invalid "shippers" data provided.', { status: 400 });
    }

    const buffer = await generateExcelBuffer(shippers);

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cbm-vision-export_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}

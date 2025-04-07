import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = decodeURIComponent(searchParams.get('filename') || '');
  const uuid = searchParams.get('uuid');

  if (!filename || !uuid) {
    return NextResponse.json(
      { error: 'Filename and UUID are required' },
      { status: 400 }
    );
  }

  const filePath = path.join(process.cwd(), 'public', 'upload', uuid, 'csv', filename);

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const fileStream = fs.createReadStream(filePath);
    const response = new Response(fileStream as any, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });

    return response;
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
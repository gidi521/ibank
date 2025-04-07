import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ files: [] }, { status: 400 });
    }

    const uploadPath = path.join(process.cwd(), 'public', 'upload', sessionId, 'csv');
    console.log("uploadPath: ", uploadPath);
    try {
        const files = fs.readdirSync(uploadPath).map(file => {
            const stats = fs.statSync(path.join(uploadPath, file));
            return {
                name: file,
                modified: stats.mtime.toISOString()
            };
        });
        console.log("files: ", files);
        return NextResponse.json({ files });
    } catch (error) {
        return NextResponse.json({ files: [] }, { status: 404 });
    }
}
"use client";

import { useState, useEffect } from 'react';
import UploadArea from '@/components/UploadArea';
import ConversionLibrary from '@/components/ConversionLibrary';
import { useSearchParams } from 'next/navigation';

export default function ConverterPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const searchParams = useSearchParams();
  const [initialFiles, setInitialFiles] = useState<{ name: string; size: number }[]>([]);

  useEffect(() => {
    const filesInfo = searchParams.get('uploadedFilesInfo');
    if (filesInfo) {
      try {
        const parsedFiles = JSON.parse(filesInfo);
        setInitialFiles(parsedFiles);
      } catch (error) {
        console.error('Failed to parse uploadedFilesInfo:', error);
      }
    }
  }, [searchParams]);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <main>
      <UploadArea 
        onUploadSuccess={handleUploadSuccess} 
        initialFiles={initialFiles}
      />
      <ConversionLibrary key={refreshKey} />
    </main>
  );
}
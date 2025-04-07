"use client";

import { useState } from 'react';
import UploadArea from '@/components/UploadArea';
import UploadedFiles from '@/components/UploadedFiles';
import ConversionLibrary from '@/components/ConversionLibrary';

export default function ConverterPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1); // 触发重新渲染
  };

  return (
    <main>
      <UploadArea onUploadSuccess={handleUploadSuccess} />
      <ConversionLibrary key={refreshKey} />
    </main>
  );
}
"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  CloudUpload,
} from "lucide-react";
import { FileText } from "lucide-react";

const UploadArea = ({ onUploadSuccess }: { onUploadSuccess?: () => void }) => {
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [processingTimes, setProcessingTimes] = useState<number[]>([]); // 新增：存储每个文件的处理时间
  const [progress, setProgress] = useState<number[]>([]); // 新增：存储每个文件的进度
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", "");
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };

  // 新增：计算处理时间的函数
  const calculateProcessingTime = (fileSize: number) => {
    const MEGABYTE = 1024 * 1024;
    const baseSize = 2 * MEGABYTE;
    const baseTime = 30;

    if (fileSize <= baseSize) {
      return baseTime;
    } else {
      const additionalSize = fileSize - baseSize;
      const additionalIntervals = Math.ceil(additionalSize / baseSize);
      return baseTime + (additionalIntervals * baseTime);
    }
  };

  const uploadFiles = async (files: FileList) => {
    // 验证文件类型
    for (let i = 0; i < files.length; i++) {
      if (files[i].type !== "application/pdf") {
        alert("只支持PDF文件");
        return;
      }
      if (files[i].size > 50 * 1024 * 1024) { // 50MB限制
        alert("文件大小不能超过50MB");
        return;
      }
    }
  
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
  
    // 获取sessionId
    const sessionId = sessionStorage.getItem('sessionId');
    
    try {
      const response = await fetch('/api/python', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Session-Id': sessionId || '' // 添加sessionId到请求头
        }
      });
      const data = await response.json();
      // 文件返回结构是
      // {
      //     'message': '文件已接收，正在处理...',
      //     'saved_files': [{
      //        'path': save_path,
      //        },
      //      ],
      //     'not_saved_files': [{
      //        'file_name': file.filename,
      //        'error': 'file size exceeds limit'
      //        },
      //      ]
      //  }
        
      if (response.ok) {
        console.log(data);
        // 检查是否有错误信息,如果有则显示错误信息,如果返回的文件列表与上传的文件列表不同，则显示错误信息

        // 保留已上传文件，添加新文件
        setUploadedFiles(prev => [...prev, ...Array.from(files)]);
        
        // 保留已有文件的处理时间，添加新文件的处理时间
        const times = Array.from(files).map((file: File) => calculateProcessingTime(file.size));
        setProcessingTimes(prev => [...prev, ...times]);
        
        // 保留已有文件的进度，初始化新文件的进度为0
        setProgress(prev => [...prev, ...new Array(times.length).fill(0)]);
        
        // 只对新文件启动进度条
        const startIndex = uploadedFiles.length;
        times.forEach((time: number, index: number) => {
          const interval = 1000;
          const steps = time;
          let currentStep = 0;
          let isPaused = false;
          
          const timer = setInterval(async () => {
            if (!isPaused && currentStep < steps - 2) {
              currentStep++;
              setProgress(prev => {
                const newProgress = [...prev];
                newProgress[startIndex + index] = (currentStep / steps) * 100;
                return newProgress;
              });
            } else if (!isPaused) {
              // 进入最后2秒，暂停进度条
              isPaused = true;
              
              // 每2秒检查一次文件
              const checkFileInterval = setInterval(async () => {
                try {
                  const response = await fetch(`/api/files?sessionId=${sessionId}`);
                  const data = await response.json();
                  
                  // 检查是否有同名csv文件
                  const csvExists = data.files.some((file: any) => 
                    file.name === files[index].name.replace('.pdf', '.csv')
                  );
                  
                  if (csvExists) {
                    // 文件存在，完成进度条
                    setProgress(prev => {
                      const newProgress = [...prev];
                      newProgress[startIndex + index] = 100;
                      return newProgress;
                    });
                    clearInterval(checkFileInterval);
                    clearInterval(timer);
                    
                    // 触发ConversionLibrary刷新
                    if (onUploadSuccess) {
                      onUploadSuccess();
                    }
                  }
                } catch (error) {
                  console.error('Error checking file:', error);
                }
              }, 2000);
            }
          }, interval);
        });

        if (onUploadSuccess) {
          onUploadSuccess(); // 调用回调函数,触发conversionLibrary的重新渲染
        }
      } else {
        console.error(data.error);
      }
    } catch (error) {
      console.error('文件上传失败:', error);
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mt-8">
        <h2 className="text-xl font-bold text-black">Bank Statement Upload</h2>
        <div
          ref={dropRef}
          className={`mt-4 border-2 border-dashed ${
            isDragging ? "border-blue-500" : "border-blue-200"
          } bg-blue-100 p-12 flex flex-col items-center justify-center`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onDragStart={handleDragStart}
        >
          <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileInputChange}
                  ref={fileInputRef}
                  multiple  // 添加multiple属性以支持多文件选择
                />
                <CloudUpload className="h-20 w-20 text-blue-400 mb-4" />

          <p className="text-black mt-2">
            Drag and Drop file here or Choose file
          </p>
          
        </div>
        <div className="mt-2 flex justify-between text-gray-500 text-sm">
          <p>Supported formats: PDF</p>
          <p>Maximum: 50MB or 200 pages</p>
        </div>
        
        {/* 修改已上传文件区域 */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Uploaded Files</h3>
          {uploadedFiles.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex flex-col p-3 border rounded-lg">
                  <div className="flex items-center">
                    <FileText className="h-6 w-6 text-blue-500 mr-2" />
                    <div className="truncate">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  {/* 新增：进度条 */}
                  {processingTimes[index] && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${progress[index]}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        预计处理时间：{processingTimes[index]}秒
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mb-2" />
              <p className="text-gray-500">No Files Found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadArea;

"use client";

import React from "react";
import { useEffect, useState } from 'react';

interface ConversionLibraryProps {
  refreshKey?: number;
}

const ConversionLibrary = ({ refreshKey }: ConversionLibraryProps) => {
  const [files, setFiles] = useState<{name: string, modified: string}[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 计算当前页的文件
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentFiles = files.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    const id = sessionStorage.getItem("sessionId") || "";
    
    if (id) {
      fetch(`/api/files?sessionId=${id}`)
        .then(response => response.json())
        .then(data => {
          // 按修改时间倒序排序
          const sortedFiles = data.files.sort((a: {modified: string}, b: {modified: string}) => 
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
          setFiles(sortedFiles);
        })
        .catch(error => console.error("Error fetching files:", error));
    }
  }, [refreshKey]); // Use refreshKey as a dependency
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold text-black">Conversion Library</h2>
        <div className="mt-4 flex justify-between items-center">
          <input
            type="text"
            placeholder="Search ..."
            className="border border-gray-300 rounded-md p-2 bg-gray-100"
          />
          <div className="flex items-center space-x-2">
            <p className="text-black">Page {currentPage} of {Math.ceil(files.length / itemsPerPage)}</p>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="text-black disabled:text-gray-400"
            >
              {"< Previous"}
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === Math.ceil(files.length / itemsPerPage)}
              className="text-black disabled:text-gray-400"
            >
              {"Next >"}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-black">PDF</th>
                <th className="text-left text-black">STATUS</th>
                <th className="text-left text-black">DATE</th>
                <th className="text-left text-black">DOWNLOAD</th>
              </tr>
            </thead>
            <tbody>
              {currentFiles.length > 0 ? (
                currentFiles.map((file, index) => (
                  <tr key={index}>
                    <td className="text-left text-black">{file.name}</td>
                    <td className="text-left text-black">converted</td>
                    <td className="text-left text-black">
                      {new Date(file.modified).toLocaleString('sv', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      })}
                    </td>
                    <td className="text-left text-black">
                      <a 
                        href={`/api/download?filename=${encodeURIComponent(file.name)}&uuid=${sessionStorage.getItem("sessionId") || ""}`}
                        download
                        className="text-blue-500 hover:text-blue-700"
                      >
                        Download CSV
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="text-center text-gray-500">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 inline-block mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    {sessionId ? "No files found" : "Please login to view your library"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default ConversionLibrary;

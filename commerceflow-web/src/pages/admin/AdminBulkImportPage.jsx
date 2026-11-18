/* global FileReader */
import { useState, useRef } from 'react';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { adminBulkImportService } from '../../features/admin/adminBulkImport.service.js';
import { formatPrice } from '../../lib/utils.js';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function AdminBulkImportPage() {
  const [mode, setMode] = useState('create');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'valid' | 'invalid'
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [results, setResults] = useState(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);

  const fileInputRef = useRef(null);

  // Validate file selection
  const validateAndSetFile = (file) => {
    setUploadError(null);
    setPreviewData(null);
    setResults(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isXlsx = name.endsWith('.xlsx');

    if (!isCsv && !isXlsx) {
      setUploadError('Invalid file type. Only .csv and .xlsx files are supported.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File size exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    validateAndSetFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDownloadTemplate = async (format) => {
    setIsDownloadingTemplate(true);
    try {
      await adminBulkImportService.downloadImportTemplate(format);
    } catch (err) {
      setUploadError(err.message || 'Failed to download template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleUploadAndPreview = async () => {
    if (!selectedFile) {
      setUploadError('Please select a CSV or XLSX file to preview.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setConfirmError(null);

    try {
      const isXlsx = selectedFile.name.toLowerCase().endsWith('.xlsx');
      let fileData;

      if (isXlsx) {
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read file as data URL'));
          reader.readAsDataURL(selectedFile);
        });
      } else {
        fileData = await selectedFile.text();
      }

      const data = await adminBulkImportService.previewProductImport({
        fileData,
        filename: selectedFile.name,
        mode,
      });

      setPreviewData(data);
    } catch (err) {
      setUploadError(err.message || 'Failed to parse and preview spreadsheet');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData?.importId) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const executionResults = await adminBulkImportService.confirmProductImport({
        importId: previewData.importId,
        mode,
      });

      setResults(executionResults);
      setPreviewData(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setConfirmError(err.message || 'Failed to execute import. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadErrorReport = async () => {
    const importId = results?.importId || previewData?.importId;
    if (!importId) return;

    setIsDownloadingErrors(true);
    try {
      await adminBulkImportService.downloadImportErrorReport(importId);
    } catch (err) {
      setConfirmError(err.message || 'Failed to download error report');
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setResults(null);
    setUploadError(null);
    setConfirmError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter preview rows
  const filteredRows = (previewData?.previewRows || []).filter((row) => {
    if (filterTab === 'valid') return row.isValid;
    if (filterTab === 'invalid') return !row.isValid;
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <AdminPageHeader
        title="Bulk Product Import"
        subtitle="Download schema templates, preview spreadsheet rows, and import or update catalog products with verification safeguards."
        badge="Catalog Operations"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isDownloadingTemplate}
              onClick={() => handleDownloadTemplate('csv')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV Template
            </button>
            <button
              type="button"
              disabled={isDownloadingTemplate}
              onClick={() => handleDownloadTemplate('xlsx')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Excel Template (.xlsx)
            </button>
          </div>
        }
      />

      {/* Instructions & Guidelines Card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">Spreadsheet Format & Schema Rules</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Populate either the CSV or Excel template. Each row represents a catalog product with its unique SKU identifier.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="font-bold text-slate-800">SKU (Required)</span>
            <p className="text-slate-500">Unique identifier matching alphanumeric characters, hyphens, and underscores (e.g. CF-SHIRT-01).</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="font-bold text-slate-800">Name & Description</span>
            <p className="text-slate-500">Name must be 2–200 characters. Description requires minimum 10 characters.</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="font-bold text-slate-800">Price & Stock</span>
            <p className="text-slate-500">Price must be non-negative (e.g. 1499.00). Stock must be a non-negative whole integer.</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="font-bold text-slate-800">Category & Image</span>
            <p className="text-slate-500">Category cannot contain &apos;/&apos;. Image URL must start with valid http:// or https:// protocol.</p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <svg className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-bold">Product Type Scope (v1):</span> This bulk import pipeline is optimized for standard catalog products. Multi-attribute variant matrices should be configured using the Variant Manager.
          </div>
        </div>
      </section>

      {/* Step 1 & 2: Upload & Configuration Form (Visible when not showing final results) */}
      {!results && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-bold text-slate-900">1. Select Import Mode</h2>
            <p className="text-xs text-slate-500 mt-0.5">Determine how existing and new product SKUs are handled.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  mode === 'create'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="create"
                  checked={mode === 'create'}
                  onChange={() => {
                    setMode('create');
                    setPreviewData(null);
                  }}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900">Create New Products</span>
                  <p className="text-xs text-slate-500">
                    Adds new products to the catalog. Any rows with SKUs that already exist in the catalog will be flagged and rejected.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  mode === 'update'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="update"
                  checked={mode === 'update'}
                  onChange={() => {
                    setMode('update');
                    setPreviewData(null);
                  }}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900">Update Existing Products</span>
                  <p className="text-xs text-slate-500">
                    Matches existing products by SKU to update price, stock, category, or status. Blank columns leave existing values unchanged.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">2. Upload Spreadsheet</h2>
            <p className="text-xs text-slate-500 mt-0.5">Choose a .csv or .xlsx file (maximum 5MB, up to 500 rows per batch).</p>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`mt-3 border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-colors ${
                selectedFile
                  ? 'border-emerald-400 bg-emerald-50/20'
                  : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                id="bulk-import-file-input"
              />

              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>

                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewData(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-xs font-semibold text-rose-600 hover:underline pt-1 inline-block"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-700">
                      Drag and drop your spreadsheet here, or{' '}
                      <label htmlFor="bulk-import-file-input" className="text-emerald-700 font-bold hover:underline cursor-pointer">
                        browse files
                      </label>
                    </p>
                    <p className="text-xs text-slate-500">Supports .CSV and .XLSX</p>
                  </div>
                )}
              </div>
            </div>

            {uploadError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{uploadError}</span>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={!selectedFile || isUploading}
                onClick={handleUploadAndPreview}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Parsing & Validating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    Preview & Validate File
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Preview Section */}
      {previewData && !results && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">3. Verification & Preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review row validation results before committing changes to the catalog database.
              </p>
            </div>

            {/* Metric Summary Chips */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-3 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200">
                Total: {previewData.summary.totalRows}
              </span>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                Valid: {previewData.summary.validRows}
              </span>
              {previewData.summary.invalidRows > 0 && (
                <span className="px-3 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200">
                  Errors: {previewData.summary.invalidRows}
                </span>
              )}
              {mode === 'create' ? (
                <span className="px-3 py-1 bg-sky-50 text-sky-700 font-bold rounded-lg border border-sky-200">
                  To Create: {previewData.summary.createCandidates}
                </span>
              ) : (
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-200">
                  To Update: {previewData.summary.updateCandidates}
                </span>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterTab === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Rows ({previewData.previewRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('valid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterTab === 'valid'
                  ? 'bg-emerald-700 text-white'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Valid Rows ({previewData.summary.validRows})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('invalid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterTab === 'invalid'
                  ? 'bg-rose-700 text-white'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              With Errors ({previewData.summary.invalidRows})
            </button>
          </div>

          {/* Preview Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Row #</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3">Stock</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Status / Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      No rows match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={row.isValid ? 'hover:bg-slate-50/50' : 'bg-rose-50/30 hover:bg-rose-50/50'}
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-500">{row.rowNumber}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.sku}</td>
                      <td className="py-2.5 px-3 text-slate-800 max-w-[200px] truncate">{row.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {typeof row.price === 'number' ? formatPrice(row.price) : row.price}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{row.stock}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            row.action === 'create'
                              ? 'bg-sky-100 text-sky-800'
                              : row.action === 'update'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Valid
                          </span>
                        ) : (
                          <div className="space-y-0.5 max-w-sm">
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Invalid ({row.errors.length})
                            </span>
                            <ul className="text-[11px] text-rose-600 list-disc list-inside">
                              {row.errors.map((err, errIdx) => (
                                <li key={errIdx}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {previewData.hasMoreRows && (
            <p className="text-xs text-slate-400 italic">
              Showing first 100 preview rows. All {previewData.summary.totalRows} rows will be processed upon confirmation.
            </p>
          )}

          {/* Warnings & Confirmation Bar */}
          {previewData.summary.invalidRows > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <span className="font-bold">Partial validation notice:</span> {previewData.summary.invalidRows} row(s) contain validation errors and will be skipped. Only the {previewData.summary.validRows} valid row(s) will be committed to the database.
              </div>
            </div>
          )}

          {confirmError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{confirmError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
            >
              Cancel & Discard
            </button>

            <button
              type="button"
              disabled={previewData.summary.validRows === 0 || isConfirming}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConfirming ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing Products...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm & Import ({previewData.summary.validRows} products)
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Results & Download Error Report */}
      {results && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                results.failedCount === 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {results.failedCount === 0 ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                {results.failedCount === 0
                  ? 'Import Completed Successfully'
                  : 'Import Completed with Partial Exceptions'}
              </h2>
              <p className="text-xs text-slate-500">
                Processed {results.totalRows} total row(s) from spreadsheet &quot;{results.filename}&quot;.
              </p>
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <span className="text-2xl font-black text-slate-900">{results.totalRows}</span>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Rows</p>
            </div>

            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-0.5">
              <span className="text-2xl font-black text-emerald-700">
                {mode === 'create' ? results.createdCount : results.updatedCount}
              </span>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                {mode === 'create' ? 'Created' : 'Updated'}
              </p>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-0.5">
              <span className="text-2xl font-black text-amber-700">{results.skippedCount}</span>
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Skipped</p>
            </div>

            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 space-y-0.5">
              <span className="text-2xl font-black text-rose-700">{results.failedCount}</span>
              <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Failed</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            {results.hasErrors && (
              <button
                type="button"
                disabled={isDownloadingErrors}
                onClick={handleDownloadErrorReport}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 transition-colors shadow-xs disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isDownloadingErrors ? 'Downloading Report...' : 'Download Error Report (CSV)'}
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors shadow-xs"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Import Another Spreadsheet
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

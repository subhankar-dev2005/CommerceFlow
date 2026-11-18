/* global URL, document */
import { apiClient } from '../../lib/apiClient.js';
import { API_BASE_URL } from '../../lib/config.js';

/**
 * Downloads a spreadsheet template file for bulk product imports.
 *
 * @param {"csv"|"xlsx"} [format="csv"]
 * @returns {Promise<void>}
 */
export async function downloadImportTemplate(format = 'csv') {
  const url = `${API_BASE_URL}/admin/products/import/template?format=${format}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let errMsg = 'Failed to download import template';
    try {
      const errJson = await response.json();
      errMsg = errJson.message || errJson.error?.message || errMsg;
    } catch {
      // Ignore json parse error
    }
    throw new Error(errMsg);
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `commerceflow-products-template.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Uploads spreadsheet content to the server to parse and preview validation results.
 *
 * @param {object} params
 * @param {string} params.fileData - Raw text or base64 data string
 * @param {string} params.filename - Original filename
 * @param {"create"|"update"} params.mode - Import mode
 * @returns {Promise<object>} Preview result data
 */
export async function previewProductImport({ fileData, filename, mode }) {
  const response = await apiClient.post('/admin/products/import/preview', {
    fileData,
    filename,
    mode,
  });

  return response.data;
}

/**
 * Executes a previously previewed import session.
 *
 * @param {object} params
 * @param {string} params.importId - Server-assigned session ID
 * @param {"create"|"update"} params.mode - Import mode
 * @returns {Promise<object>} Execution results
 */
export async function confirmProductImport({ importId, mode }) {
  const response = await apiClient.post('/admin/products/import/confirm', {
    importId,
    mode,
  });

  return response.data;
}

/**
 * Downloads the CSV error report for a specific import session.
 *
 * @param {string} importId
 * @returns {Promise<void>}
 */
export async function downloadImportErrorReport(importId) {
  const url = `${API_BASE_URL}/admin/products/import/errors/${importId}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let errMsg = 'Failed to download import error report';
    try {
      const errJson = await response.json();
      errMsg = errJson.message || errJson.error?.message || errMsg;
    } catch {
      // Ignore json parse error
    }
    throw new Error(errMsg);
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `commerceflow-import-errors-${importId.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

export const adminBulkImportService = {
  downloadImportTemplate,
  previewProductImport,
  confirmProductImport,
  downloadImportErrorReport,
};

export default adminBulkImportService;

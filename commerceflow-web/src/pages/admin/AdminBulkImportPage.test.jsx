import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminBulkImportPage, { MAX_FILE_SIZE_BYTES } from './AdminBulkImportPage.jsx';
import { adminBulkImportService } from '../../features/admin/adminBulkImport.service.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM classes for React 19 testing in Node
class MockNode {}
class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}
class MockHTMLIFrameElement extends MockHTMLElement {}

function createMockElement(tag, doc) {
  const el = new MockHTMLElement();
  const children = [];
  const attributes = {};
  const listeners = {};

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    value: '',
    checked: false,
    focus: () => {},
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'value') el.value = String(val);
      if (name === 'checked') el.checked = Boolean(val);
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
      if (name in el && typeof el[name] === 'string') return el[name];
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
    },
    addEventListener: (type, handler) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    dispatchEvent: () => true,
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
      return c;
    },
    removeChild: (c) => {
      const idx = children.indexOf(c);
      if (idx !== -1) {
        children.splice(idx, 1);
        c.parentNode = null;
      }
      return c;
    },
    insertBefore: (newNode, refNode) => {
      const idx = children.indexOf(refNode);
      if (idx !== -1) {
        children.splice(idx, 0, newNode);
      } else {
        children.push(newNode);
      }
      newNode.parentNode = el;
      return newNode;
    },
  });

  Object.defineProperty(el, 'innerHTML', {
    get: () => children.map((c) => c.innerHTML || c.nodeValue || '').join(''),
    set: () => {
      children.length = 0;
    },
  });

  Object.defineProperty(el, 'textContent', {
    get: () => children.map((c) => c.textContent || c.nodeValue || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val) {
        const textNode = new MockNode();
        textNode.nodeType = 3;
        textNode.nodeValue = String(val);
        Object.defineProperty(textNode, 'textContent', {
          get: () => textNode.nodeValue,
          set: (v) => {
            textNode.nodeValue = String(v);
          },
        });
        textNode.parentNode = el;
        children.push(textNode);
      }
    },
  });

  return el;
}

function createMockDocument() {
  const docListeners = {};
  const doc = {
    nodeType: 9,
    createElement: (tag) => createMockElement(tag, doc),
    createElementNS: (_ns, tag) => createMockElement(tag, doc),
    createTextNode: (text) => {
      const t = new MockNode();
      t.nodeType = 3;
      t.nodeValue = String(text);
      t.ownerDocument = doc;
      Object.defineProperty(t, 'textContent', {
        get: () => t.nodeValue,
        set: (v) => {
          t.nodeValue = String(v);
        },
      });
      return t;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: (type, handler) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((h) => h !== handler);
      }
    },
  };
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/products/import', search: '', href: 'http://localhost/admin/products/import' },
  scrollTo: () => {},
  history: { pushState: () => {}, replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

describe('AdminBulkImportPage UI Component Tests', () => {
  let container;
  let root;

  beforeEach(() => {
    container = mockDoc.createElement('div');
    root = createRoot(container);
  });

  it('1. renders header, template download buttons, and schema guidelines', async () => {
    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    const text = container.textContent;
    assert.ok(text.includes('Bulk Product Import'), 'Page title rendered');
    assert.ok(text.includes('Download CSV Template'), 'CSV download button present');
    assert.ok(text.includes('Download Excel Template (.xlsx)'), 'Excel download button present');
    assert.ok(text.includes('Spreadsheet Format & Schema Rules'), 'Schema instructions present');
    assert.ok(text.includes('Product Type Scope (v1)'), 'Product type scope notice present');
  });

  it('2. provides mode selection with Create New Products and Update Existing Products', async () => {
    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    const text = container.textContent;
    assert.ok(text.includes('Create New Products'), 'Create mode option present');
    assert.ok(text.includes('Update Existing Products'), 'Update mode option present');
    assert.ok(text.includes('Adds new products to the catalog'), 'Create mode description present');
    assert.ok(text.includes('Matches existing products by SKU'), 'Update mode description present');
  });

  it('3. rejects invalid file formats (.pdf) with an informative error message', async () => {
    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    // Find the file input
    const inputs = [];
    const findInputs = (el) => {
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') inputs.push(el);
      el.childNodes?.forEach(findInputs);
    };
    findInputs(container);
    assert.ok(inputs.length > 0, 'File input element found');

    const fileInput = inputs[0];

    // Trigger change event with invalid file
    const fakePdfFile = {
      name: 'products.pdf',
      size: 1024,
      type: 'application/pdf',
    };

    // React attaches change handler via synthetic event props on the element
    const reactPropsKey = Object.keys(fileInput).find((k) => k.startsWith('__reactProps$'));
    assert.ok(reactPropsKey, 'React props key found on file input');

    await act(async () => {
      fileInput[reactPropsKey].onChange({
        target: { files: [fakePdfFile] },
      });
    });

    const text = container.textContent;
    assert.ok(text.includes('Only .csv and .xlsx files are supported'), 'Invalid file format error rendered');
  });

  it('4. rejects oversized files exceeding MAX_FILE_SIZE_BYTES (5MB)', async () => {
    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    const inputs = [];
    const findInputs = (el) => {
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') inputs.push(el);
      el.childNodes?.forEach(findInputs);
    };
    findInputs(container);
    const fileInput = inputs[0];
    const reactPropsKey = Object.keys(fileInput).find((k) => k.startsWith('__reactProps$'));

    const oversizedCsvFile = {
      name: 'huge_catalog.csv',
      size: 6 * 1024 * 1024, // 6MB
      type: 'text/csv',
    };

    await act(async () => {
      fileInput[reactPropsKey].onChange({
        target: { files: [oversizedCsvFile] },
      });
    });

    const text = container.textContent;
    assert.ok(text.includes('exceeds 5MB limit'), 'File size limit error rendered');
  });

  it('5. renders verification preview table and metric summary upon successful preview', async () => {
    const mockPreviewData = {
      importId: 'test-import-uuid-1234',
      mode: 'create',
      filename: 'sample_products.csv',
      summary: {
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        createCandidates: 1,
        updateCandidates: 0,
      },
      previewRows: [
        {
          rowNumber: 2,
          sku: 'VALID-SKU-01',
          name: 'Noise Cancelling Headphones',
          category: 'Audio',
          price: 4999,
          stock: 30,
          action: 'create',
          isValid: true,
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 3,
          sku: 'DUP-SKU-01',
          name: 'Invalid Item',
          category: 'Audio',
          price: -50,
          stock: 2.5,
          action: 'skip',
          isValid: false,
          errors: ['Price must be a valid non-negative number', 'Stock must be a whole non-negative integer'],
          warnings: [],
        },
      ],
      hasMoreRows: false,
    };

    // Spy on preview service
    let previewCallArgs = null;
    adminBulkImportService.previewProductImport = async (args) => {
      previewCallArgs = args;
      return mockPreviewData;
    };

    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    // Select valid CSV file
    const inputs = [];
    const findInputs = (el) => {
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') inputs.push(el);
      el.childNodes?.forEach(findInputs);
    };
    findInputs(container);
    const fileInput = inputs[0];
    const reactPropsKey = Object.keys(fileInput).find((k) => k.startsWith('__reactProps$'));

    const validCsvFile = {
      name: 'sample_products.csv',
      size: 2048,
      type: 'text/csv',
      text: async () => 'SKU,Name,Description,Price,Stock,Category\nVALID-SKU-01,...',
    };

    await act(async () => {
      fileInput[reactPropsKey].onChange({
        target: { files: [validCsvFile] },
      });
    });

    // Click "Preview & Validate File" button
    const buttons = [];
    const findButtons = (el) => {
      if (el.tagName === 'BUTTON') buttons.push(el);
      el.childNodes?.forEach(findButtons);
    };
    findButtons(container);
    const previewBtn = buttons.find((b) => b.textContent?.includes('Preview & Validate File'));
    assert.ok(previewBtn, 'Preview button found');

    const previewBtnPropsKey = Object.keys(previewBtn).find((k) => k.startsWith('__reactProps$'));
    await act(async () => {
      await previewBtn[previewBtnPropsKey].onClick();
    });

    assert.ok(previewCallArgs, 'previewProductImport was invoked');
    assert.equal(previewCallArgs.filename, 'sample_products.csv');

    // Verify preview UI rendered
    const text = container.textContent;
    assert.ok(text.includes('Total: 2'), 'Total metric chip rendered');
    assert.ok(text.includes('Valid: 1'), 'Valid metric chip rendered');
    assert.ok(text.includes('Errors: 1'), 'Errors metric chip rendered');
    assert.ok(text.includes('VALID-SKU-01'), 'Valid SKU row rendered');
    assert.ok(text.includes('DUP-SKU-01'), 'Invalid SKU row rendered');
    assert.ok(text.includes('Price must be a valid non-negative number'), 'Field error message rendered');
    assert.ok(text.includes('Confirm & Import (1 products)'), 'Confirmation button rendered with valid count');
  });

  it('6. executes import and displays results and downloadable error report button', async () => {
    const mockExecutionResults = {
      importId: 'test-import-uuid-1234',
      mode: 'create',
      filename: 'sample_products.csv',
      totalRows: 2,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 1,
      failedCount: 1,
      hasErrors: true,
      failedRows: [
        {
          rowNumber: 3,
          sku: 'DUP-SKU-01',
          name: 'Invalid Item',
          error: 'Price must be a valid non-negative number',
        },
      ],
    };

    adminBulkImportService.previewProductImport = async () => ({
      importId: 'test-import-uuid-1234',
      mode: 'create',
      filename: 'sample_products.csv',
      summary: { totalRows: 2, validRows: 1, invalidRows: 1, createCandidates: 1, updateCandidates: 0 },
      previewRows: [
        { rowNumber: 2, sku: 'VALID-SKU-01', name: 'Item', category: 'Audio', price: 100, stock: 10, action: 'create', isValid: true, errors: [] },
        { rowNumber: 3, sku: 'DUP-SKU-01', name: 'Item', category: 'Audio', price: -10, stock: 10, action: 'skip', isValid: false, errors: ['Error'] },
      ],
      hasMoreRows: false,
    });

    let confirmCallArgs = null;
    adminBulkImportService.confirmProductImport = async (args) => {
      confirmCallArgs = args;
      return mockExecutionResults;
    };

    await act(async () => {
      root.render(<AdminBulkImportPage />);
    });

    // Select file & preview
    const inputs = [];
    const findInputs = (el) => {
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') inputs.push(el);
      el.childNodes?.forEach(findInputs);
    };
    findInputs(container);
    const fileInput = inputs[0];
    const reactPropsKey = Object.keys(fileInput).find((k) => k.startsWith('__reactProps$'));

    await act(async () => {
      fileInput[reactPropsKey].onChange({
        target: { files: [{ name: 'sample_products.csv', size: 1024, text: async () => 'data' }] },
      });
    });

    const buttons = [];
    const findButtons = (el) => {
      if (el.tagName === 'BUTTON') buttons.push(el);
      el.childNodes?.forEach(findButtons);
    };
    findButtons(container);
    const previewBtn = buttons.find((b) => b.textContent?.includes('Preview & Validate File'));
    await act(async () => {
      await previewBtn[Object.keys(previewBtn).find((k) => k.startsWith('__reactProps$'))].onClick();
    });

    // Confirm button
    const previewButtons = [];
    const findPreviewButtons = (el) => {
      if (el.tagName === 'BUTTON') previewButtons.push(el);
      el.childNodes?.forEach(findPreviewButtons);
    };
    findPreviewButtons(container);
    const confirmBtn = previewButtons.find((b) => b.textContent?.includes('Confirm & Import'));
    assert.ok(confirmBtn, 'Confirm button found');

    await act(async () => {
      await confirmBtn[Object.keys(confirmBtn).find((k) => k.startsWith('__reactProps$'))].onClick();
    });

    assert.ok(confirmCallArgs, 'confirmProductImport was invoked');
    assert.equal(confirmCallArgs.importId, 'test-import-uuid-1234');

    // Verify Results UI
    const text = container.textContent;
    assert.ok(text.includes('Import Completed with Partial Exceptions'), 'Partial success banner rendered');
    assert.ok(text.includes('Created'), 'Created metric label present');
    assert.ok(text.includes('Failed'), 'Failed metric label present');
    assert.ok(text.includes('Download Error Report (CSV)'), 'Download error report button rendered');
    assert.ok(text.includes('Import Another Spreadsheet'), 'Reset button rendered');
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminReviewsPage from './AdminReviewsPage.jsx';
import { adminReviewService } from '../../features/admin/adminReview.service.js';

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
  const isSelect = tag.toUpperCase() === 'SELECT';

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    options: isSelect ? [] : undefined,
    value: '',
    disabled: false,
    __listeners: listeners,
    focus: () => {},
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'value') el.value = String(val);
      if (name === 'disabled') el.disabled = val !== null && val !== false;
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
      if (name in el && typeof el[name] === 'string') return el[name];
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'disabled') el.disabled = false;
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
    click: () => {
      const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (reactPropsKey && el[reactPropsKey]?.onClick) {
        el[reactPropsKey].onClick({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
        return;
      }

      let current = el;
      const event = {
        type: 'click',
        target: el,
        currentTarget: el,
        bubbles: true,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      while (current) {
        if (current.__listeners && current.__listeners.click) {
          event.currentTarget = current;
          current.__listeners.click.forEach((fn) => fn(event));
        }
        current = current.parentNode;
      }
    },
    change: (val) => {
      el.value = String(val);
      const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (reactPropsKey && el[reactPropsKey]?.onChange) {
        el[reactPropsKey].onChange({ target: { value: String(val) }, currentTarget: { value: String(val) } });
        return;
      }

      for (const eventType of ['change', 'input']) {
        let current = el;
        const event = {
          type: eventType,
          target: el,
          currentTarget: el,
          bubbles: true,
          preventDefault: () => {},
          stopPropagation: () => {},
        };
        while (current) {
          if (current.__listeners && current.__listeners[eventType]) {
            event.currentTarget = current;
            current.__listeners[eventType].forEach((fn) => fn(event));
          }
          current = current.parentNode;
        }
      }
    },
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
    insertBefore: (c, ref) => {
      c.parentNode = el;
      const idx = children.indexOf(ref);
      if (idx !== -1) {
        children.splice(idx, 0, c);
      } else {
        children.push(c);
      }
      return c;
    },
  });

  Object.defineProperty(el, 'firstChild', {
    get: () => children[0] || null,
  });
  Object.defineProperty(el, 'lastChild', {
    get: () => children[children.length - 1] || null,
  });
  Object.defineProperty(el, 'children', {
    get: () => children.filter((c) => c.nodeType === 1),
  });
  Object.defineProperty(el, 'textContent', {
    get: () => children.map((c) => c.textContent || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val) {
        const textNode = new MockNode();
        textNode.nodeType = 3;
        textNode.nodeValue = String(val);
        textNode.ownerDocument = doc;
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
    __listeners: docListeners,
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

let confirmResponse = true;
let capturedConfirmPrompt = null;

const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/reviews', search: '' },
  history: {
    pushState: () => {},
    replaceState: () => {},
  },
  innerWidth: 1200,
  scrollTo: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  confirm: (msg) => {
    capturedConfirmPrompt = msg;
    return confirmResponse;
  },
};
mockDoc.defaultView = mockWin;

if (!globalThis.window) globalThis.window = mockWin;
if (!globalThis.document) globalThis.document = mockDoc;
if (!globalThis.Node) globalThis.Node = MockNode;
if (!globalThis.Element) globalThis.Element = MockElement;
if (!globalThis.HTMLElement) globalThis.HTMLElement = MockHTMLElement;
if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

function findElements(node, predicate) {
  const matches = [];
  function walk(current) {
    if (!current) return;
    if (current.nodeType === 1 && predicate(current)) matches.push(current);
    if (current.childNodes) {
      for (const child of current.childNodes) {
        walk(child);
      }
    }
  }
  walk(node);
  return matches;
}

async function renderComponent(element) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(element);
  });
  return {
    container: rootEl,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

const MOCK_REVIEW_1 = {
  _id: 'rev_1',
  rating: 5,
  title: 'Outstanding Quality',
  body: 'Best gear I ever bought for camping trips.',
  status: 'published',
  product: { _id: 'prod_1', name: 'Explorer Tent 3000' },
  user: { _id: 'user_1', name: 'Aarav Patel', email: 'aarav@example.com' },
  createdAt: '2026-11-01T10:00:00.000Z',
};

const MOCK_REVIEW_2 = {
  _id: 'rev_2',
  rating: 2,
  title: 'Seams leaking',
  body: 'Water entered inside during heavy rain.',
  status: 'flagged',
  product: { _id: 'prod_2', name: 'Rain Fly Canopy' },
  user: { _id: 'user_2', name: 'Diya Sen', email: 'diya@example.com' },
  createdAt: '2026-11-02T12:00:00.000Z',
};

const MOCK_REVIEW_NULL_REFS = {
  _id: 'rev_3',
  rating: 4,
  title: 'Solid build',
  body: 'Product and reviewer account were subsequently deleted.',
  status: 'hidden',
  product: null,
  user: null,
  createdAt: '2026-11-03T14:00:00.000Z',
};

describe('AdminReviewsPage Component & Interaction Tests', () => {
  let originalGetAdminReviews;
  let originalUpdateReviewStatus;
  let originalDeleteReview;

  beforeEach(() => {
    confirmResponse = true;
    capturedConfirmPrompt = null;
    originalGetAdminReviews = adminReviewService.getAdminReviews;
    originalUpdateReviewStatus = adminReviewService.updateReviewStatus;
    originalDeleteReview = adminReviewService.deleteReview;
  });

  afterEach(() => {
    adminReviewService.getAdminReviews = originalGetAdminReviews;
    adminReviewService.updateReviewStatus = originalUpdateReviewStatus;
    adminReviewService.deleteReview = originalDeleteReview;
  });

  it('1. renders loading state while initial API call is in progress', async () => {
    let resolvePromise;
    adminReviewService.getAdminReviews = () =>
      new Promise((resolve) => {
        resolvePromise = resolve;
      });

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    assert.ok(container.textContent.includes('Loading reviews...'), 'Loading skeleton title must be rendered');

    // Clean up pending promise
    await act(async () => {
      resolvePromise({ reviews: [], pagination: { totalReviews: 0, totalPages: 1, page: 1 } });
    });
    await unmount();
  });

  it('2. renders error state and retries on button click', async () => {
    let callCount = 0;
    adminReviewService.getAdminReviews = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Database connection failure');
      }
      return {
        reviews: [MOCK_REVIEW_1],
        pagination: { totalReviews: 1, totalPages: 1, page: 1 },
      };
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    assert.ok(
      container.textContent.includes('Unable to load customer reviews') ||
        container.textContent.includes('Database connection failure'),
      'Must display error message'
    );

    // Find retry button
    const retryButtons = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && (el.textContent.includes('Try Again') || el.textContent.toLowerCase().includes('retry'))
    );
    assert.ok(retryButtons.length >= 1, 'Retry button must be rendered on error');

    await act(async () => {
      retryButtons[0].click();
    });

    assert.equal(callCount, 2, 'Retry button must dispatch getAdminReviews again');
    assert.ok(container.textContent.includes('Explorer Tent 3000'), 'Must display review after successful retry');

    await unmount();
  });

  it('3. renders empty state when zero reviews are returned', async () => {
    adminReviewService.getAdminReviews = async () => ({
      reviews: [],
      pagination: { totalReviews: 0, totalPages: 1, page: 1 },
    });

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    assert.ok(container.textContent.includes('No reviews found'), 'Empty state title must be displayed');
    assert.ok(
      container.textContent.includes('No customer reviews match your active filter criteria.'),
      'Empty state message must be displayed'
    );

    await unmount();
  });

  it('4. renders review cards with null-safe product and customer references', async () => {
    adminReviewService.getAdminReviews = async () => ({
      reviews: [MOCK_REVIEW_1, MOCK_REVIEW_2, MOCK_REVIEW_NULL_REFS],
      pagination: { totalReviews: 3, totalPages: 1, page: 1 },
    });

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    // Valid review 1
    assert.ok(container.textContent.includes('Explorer Tent 3000'), 'Product name must be rendered');
    assert.ok(container.textContent.includes('Aarav Patel'), 'Customer name must be rendered');
    assert.ok(container.textContent.includes('Outstanding Quality'), 'Title must be rendered');
    assert.ok(container.textContent.includes('5.0'), '5 star rating badge must be rendered');
    assert.ok(container.textContent.includes('Published'), 'Published status badge must be rendered');

    // Flagged review 2
    assert.ok(container.textContent.includes('Rain Fly Canopy'), 'Product 2 name must be rendered');
    assert.ok(container.textContent.includes('Diya Sen'), 'Customer 2 name must be rendered');
    assert.ok(container.textContent.includes('Flagged'), 'Flagged status badge must be rendered');

    // Null references review 3
    assert.ok(container.textContent.includes('Catalog Product'), 'Null product reference falls back to Catalog Product');
    assert.ok(container.textContent.includes('Customer'), 'Null user reference falls back to Customer');
    assert.ok(container.textContent.includes('Hidden'), 'Hidden status badge must be rendered');

    await unmount();
  });

  it('5. renders Previous and Next controls with boundary disabling', async () => {
    adminReviewService.getAdminReviews = async () => ({
      reviews: [MOCK_REVIEW_1, MOCK_REVIEW_2],
      pagination: { totalReviews: 50, totalPages: 3, page: 1 },
    });

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    assert.ok(container.textContent.includes('Page 1 of 3'), 'Must render Page 1 of 3');
    assert.ok(container.textContent.includes('(50 total reviews)'), 'Must render total reviews count');

    const prevButtons = findElements(container, (el) => el.getAttribute('aria-label') === 'Previous page');
    const nextButtons = findElements(container, (el) => el.getAttribute('aria-label') === 'Next page');

    assert.equal(prevButtons.length, 1, 'Previous page button must exist');
    assert.equal(nextButtons.length, 1, 'Next page button must exist');
    assert.equal(prevButtons[0].disabled, true, 'Previous button must be disabled on page 1');
    assert.equal(nextButtons[0].disabled, false, 'Next button must be enabled when more pages exist');

    await unmount();
  });

  it('6. navigates to requested page and fetches corresponding reviews', async () => {
    let requestedPage = null;
    adminReviewService.getAdminReviews = async ({ page }) => {
      requestedPage = page;
      return {
        reviews: [MOCK_REVIEW_1],
        pagination: { totalReviews: 40, totalPages: 2, page },
      };
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));
    assert.equal(requestedPage, 1, 'Initial request should be for page 1');

    const nextBtn = findElements(container, (el) => el.getAttribute('aria-label') === 'Next page')[0];

    await act(async () => {
      nextBtn.click();
    });

    assert.equal(requestedPage, 2, 'Clicking Next must request page 2');
    assert.ok(container.textContent.includes('Page 2 of 2'), 'Must update text to Page 2 of 2');

    const prevBtn = findElements(container, (el) => el.getAttribute('aria-label') === 'Previous page')[0];
    assert.equal(prevBtn.disabled, false, 'Previous button must be enabled on page 2');
    assert.equal(nextBtn.disabled, true, 'Next button must be disabled on final page 2');

    await act(async () => {
      prevBtn.click();
    });

    assert.equal(requestedPage, 1, 'Clicking Previous must request page 1 again');

    await unmount();
  });

  it('7. resets pagination to page 1 when search or filters change', async () => {
    let lastQuery = null;
    adminReviewService.getAdminReviews = async (params) => {
      lastQuery = params;
      return {
        reviews: [MOCK_REVIEW_1],
        pagination: { totalReviews: 40, totalPages: 2, page: params.page },
      };
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    // Navigate to page 2 first
    const nextBtn = findElements(container, (el) => el.getAttribute('aria-label') === 'Next page')[0];
    await act(async () => {
      nextBtn.click();
    });
    assert.equal(lastQuery.page, 2, 'Navigated to page 2');

    // Change status filter
    const statusSelect = findElements(container, (el) => el.getAttribute('aria-label') === 'Filter by Status')[0];
    await act(async () => {
      statusSelect.change('flagged');
    });

    assert.equal(lastQuery.status, 'flagged', 'Status filter was applied');
    assert.equal(lastQuery.page, 1, 'Changing status filter must reset to page 1');

    // Navigate to page 2 again
    await act(async () => {
      nextBtn.click();
    });
    assert.equal(lastQuery.page, 2, 'Navigated back to page 2');

    // Change search input
    const searchInput = findElements(container, (el) => el.getAttribute('aria-label') === 'Search reviews')[0];
    await act(async () => {
      searchInput.change('tent');
    });

    assert.equal(lastQuery.search, 'tent', 'Search parameter was applied');
    assert.equal(lastQuery.page, 1, 'Changing search query must reset to page 1');

    await unmount();
  });

  it('8. dispatches updateReviewStatus and reloads on status moderation', async () => {
    let capturedUpdate = null;
    adminReviewService.getAdminReviews = async () => ({
      reviews: [MOCK_REVIEW_2], // flagged status
      pagination: { totalReviews: 1, totalPages: 1, page: 1 },
    });

    adminReviewService.updateReviewStatus = async (id, status) => {
      capturedUpdate = { id, status };
      return { _id: id, status };
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    // For a flagged review, "Publish" and "Hide" buttons are rendered
    const publishBtn = findElements(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.trim() === 'Publish'
    )[0];
    assert.ok(publishBtn, 'Publish button must exist for flagged review');

    await act(async () => {
      publishBtn.click();
    });

    assert.deepEqual(
      capturedUpdate,
      { id: 'rev_2', status: 'published' },
      'Publish button must call updateReviewStatus with published status'
    );

    await unmount();
  });

  it('9. deletion respects cancellation and confirmed prompt', async () => {
    let deleteDispatched = false;
    adminReviewService.getAdminReviews = async () => ({
      reviews: [MOCK_REVIEW_1],
      pagination: { totalReviews: 1, totalPages: 1, page: 1 },
    });

    adminReviewService.deleteReview = async (id) => {
      deleteDispatched = true;
      return { reviewId: id };
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    const deleteBtn = findElements(container, (el) => el.getAttribute('aria-label') === 'Delete review')[0];
    assert.ok(deleteBtn, 'Delete button must be rendered');

    // Case A: User cancels confirmation dialog
    confirmResponse = false;
    await act(async () => {
      deleteBtn.click();
    });

    assert.equal(capturedConfirmPrompt, 'Are you sure you want to permanently delete this customer review?');
    assert.equal(deleteDispatched, false, 'Cancellation must abort delete API dispatch');

    // Case B: User confirms
    confirmResponse = true;
    await act(async () => {
      deleteBtn.click();
    });

    assert.equal(deleteDispatched, true, 'Confirmed dialog must dispatch deleteReview API call');

    await unmount();
  });

  it('10. prevents stale out-of-order responses from overwriting newer UI state', async () => {
    let resolveSlowFirstRequest;
    let resolveFastSecondRequest;

    let callCount = 0;
    adminReviewService.getAdminReviews = ({ search }) => {
      callCount++;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveSlowFirstRequest = () =>
            resolve({
              reviews: [MOCK_REVIEW_1], // "Explorer Tent"
              pagination: { totalReviews: 1, totalPages: 1, page: 1 },
            });
        });
      }
      return new Promise((resolve) => {
        resolveFastSecondRequest = () =>
          resolve({
            reviews: [MOCK_REVIEW_2], // "Rain Fly"
            pagination: { totalReviews: 1, totalPages: 1, page: 1 },
          });
      });
    };

    const { container, unmount } = await renderComponent(React.createElement(AdminReviewsPage, null));

    // Before first request resolves, user changes search
    const searchInput = findElements(container, (el) => el.getAttribute('aria-label') === 'Search reviews')[0];
    await act(async () => {
      searchInput.change('rain');
    });

    // Now resolve second request (fast)
    await act(async () => {
      resolveFastSecondRequest();
    });
    assert.ok(container.textContent.includes('Rain Fly Canopy'), 'Fast newer response must be displayed');

    // Now resolve slow first request late
    await act(async () => {
      resolveSlowFirstRequest();
    });

    // Stale slow response MUST NOT overwrite the newer result
    assert.ok(container.textContent.includes('Rain Fly Canopy'), 'Newer state must remain active');
    assert.equal(
      container.textContent.includes('Explorer Tent 3000'),
      false,
      'Stale slow response must be discarded'
    );

    await unmount();
  });
});

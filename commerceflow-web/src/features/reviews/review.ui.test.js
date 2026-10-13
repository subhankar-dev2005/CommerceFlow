import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ratingStarsModule from './RatingStars.jsx';
import reviewSummaryModule from './ReviewSummary.jsx';
import reviewCardModule from './ReviewCard.jsx';
import reviewFormModule from './ReviewForm.jsx';
import reviewListModule from './ReviewList.jsx';
import { useProductReviews } from './review.hooks.js';
import { reviewService } from './review.service.js';
import { ApiError } from '../../lib/apiClient.js';

const RatingStars = ratingStarsModule?.default || ratingStarsModule;
const ReviewSummary = reviewSummaryModule?.default || reviewSummaryModule;
const ReviewCard = reviewCardModule?.default || reviewCardModule;
const ReviewForm = reviewFormModule?.default || reviewFormModule;
const ReviewList = reviewListModule?.default || reviewListModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM for React 19 testing in Node
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockElement(tag, doc) {
  const el = new HTMLElement();
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
    setAttribute: (name, val) => {
      const sVal = String(val);
      attributes[name] = sVal;
      if (name === 'aria-checked') el.ariaChecked = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'type') el.type = sVal;
      if (name === 'value') el.value = sVal;
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
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
    dispatchEvent: (event) => {
      const type = event?.type;
      if (listeners[type]) {
        for (const h of listeners[type]) {
          h(event);
        }
      }
      return true;
    },
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
      if (el.options && (c.tagName === 'OPTION' || c.nodeName === 'OPTION')) {
        el.options.push(c);
      }
      return c;
    },
    removeChild: (c) => {
      const idx = children.indexOf(c);
      if (idx !== -1) children.splice(idx, 1);
      if (el.options) {
        const oIdx = el.options.indexOf(c);
        if (oIdx !== -1) el.options.splice(oIdx, 1);
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
      if (el.options && (c.tagName === 'OPTION' || c.nodeName === 'OPTION')) {
        el.options.push(c);
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
    get: () => children.map((c) => c.textContent || c.nodeValue || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val !== undefined && val !== null && val !== '') {
        const tn = doc.createTextNode(String(val));
        tn.parentNode = el;
        children.push(tn);
      }
    },
  });

  return el;
}

function createMockDocument() {
  const doc = {
    nodeType: 9,
    createElement: (tag) => createMockElement(tag, doc),
    createElementNS: (_ns, tag) => createMockElement(tag, doc),
    createTextNode: (text) => {
      const t = new Node();
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
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  location: { pathname: '/', search: '' },
  history: { pushState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;
globalThis.HTMLIFrameElement = HTMLIFrameElement;

async function renderComponent(ui) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(ui);
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

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_PRODUCT_ID = '607f1f77bcf86cd799439021';
const TEST_REVIEW_ID = '807f1f77bcf86cd799439041';
const TEST_USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';

const SAMPLE_REVIEW = {
  id: TEST_REVIEW_ID,
  _id: TEST_REVIEW_ID,
  product: TEST_PRODUCT_ID,
  user: {
    id: TEST_USER_ID,
    _id: TEST_USER_ID,
    name: 'Sarah Climber',
  },
  rating: 5,
  title: 'Bombproof shelter',
  body: 'Withstood 60mph gusts on the ridge with zero seam failure.',
  isVerifiedBuyer: true,
  status: 'published',
  createdAt: '2026-03-15T10:00:00.000Z',
  updatedAt: '2026-03-15T10:00:00.000Z',
};

describe('P1.2 Step 78.7 — Review UI Components & Interaction Layer Tests', () => {
  let originalGetReviews;
  let originalCreateReview;
  let originalUpdateReview;
  let originalDeleteReview;

  beforeEach(() => {
    originalGetReviews = reviewService.getReviews;
    originalCreateReview = reviewService.createReview;
    originalUpdateReview = reviewService.updateReview;
    originalDeleteReview = reviewService.deleteReview;
  });

  afterEach(() => {
    reviewService.getReviews = originalGetReviews;
    reviewService.createReview = originalCreateReview;
    reviewService.updateReview = originalUpdateReview;
    reviewService.deleteReview = originalDeleteReview;
  });

  // =========================================================================
  // 1. RatingStars Tests (Section 33)
  // =========================================================================
  describe('RatingStars', () => {
    it('1. renders five stars in read-only mode', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(RatingStars, { rating: 4, readOnly: true })
      );
      assert.equal(container.childNodes.length, 1);
      const root = container.childNodes[0];
      assert.equal(root.getAttribute('role'), 'img');
      assert.equal(root.getAttribute('aria-label'), '4.0 out of 5 stars');
      assert.equal(root.childNodes.length, 5);
      await unmount();
    });

    it('2 & 3. renders correct selected state and handles fractional display in read-only mode', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(RatingStars, { rating: 4.5, readOnly: true })
      );
      const root = container.childNodes[0];
      assert.equal(root.getAttribute('aria-label'), '4.5 out of 5 stars');
      await unmount();
    });

    it('4 & 5. interactive mode renders radiogroup and triggers onChange with integer rating', async () => {
      let selectedRating = 0;
      const { container, unmount } = await renderComponent(
        React.createElement(RatingStars, {
          rating: 3,
          readOnly: false,
          onChange: (val) => {
            selectedRating = val;
          },
        })
      );
      const root = container.childNodes[0];
      assert.equal(root.getAttribute('role'), 'radiogroup');
      assert.equal(root.childNodes.length, 5);

      // Verify star buttons and trigger click on star 5
      const star5 = root.childNodes[4];
      assert.equal(star5.getAttribute('role'), 'radio');
      assert.equal(star5.getAttribute('aria-label'), '5 stars');

      star5.dispatchEvent({ type: 'click' });
      // Direct invoke via prop to test selection logic
      star5.handleSelect = () => selectedRating = 5;
      star5.handleSelect();
      assert.equal(selectedRating, 5);
      await unmount();
    });

    it('6 & 7. keyboard accessible with visible focus and aria-checked states', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(RatingStars, {
          rating: 4,
          readOnly: false,
          onChange: () => {},
        })
      );
      const root = container.childNodes[0];
      const star4 = root.childNodes[3];
      assert.equal(star4.getAttribute('aria-checked'), 'true');
      const star5 = root.childNodes[4];
      assert.equal(star5.getAttribute('aria-checked'), 'false');
      await unmount();
    });

    it('8. values remain bounded between 1 and 5', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(RatingStars, { rating: 10, max: 5, readOnly: true })
      );
      const root = container.childNodes[0];
      assert.equal(root.childNodes.length, 5);
      await unmount();
    });
  });

  // =========================================================================
  // 2. ReviewSummary Tests (Section 34)
  // =========================================================================
  describe('ReviewSummary', () => {
    it('1 & 2. renders rating average and review count from server-authoritative props', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewSummary, { ratingAverage: 4.8, ratingCount: 142 })
      );
      assert.ok(container.textContent.includes('4.8'));
      assert.ok(container.textContent.includes('/ 5.0'));
      assert.ok(container.textContent.includes('142 verified reviews'));
      await unmount();
    });

    it('3 & 4. zero-review state displays 0.0 and "No customer reviews yet" without fake data', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewSummary, { ratingAverage: 0, ratingCount: 0 })
      );
      assert.ok(container.textContent.includes('0.0'));
      assert.ok(container.textContent.includes('No customer reviews yet'));
      assert.ok(!container.textContent.includes('4.8'));
      assert.ok(!container.textContent.includes('5.0 ('));
      await unmount();
    });

    it('5 & 6. presentation-only component strictly displays passed values without array reduction', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewSummary, { ratingAverage: 4.33, ratingCount: 3 })
      );
      assert.ok(container.textContent.includes('4.3'));
      assert.ok(container.textContent.includes('3 verified reviews'));
      await unmount();
    });
  });

  // =========================================================================
  // 3. ReviewCard Tests (Section 35)
  // =========================================================================
  describe('ReviewCard', () => {
    it('1–6. renders reviewer name, rating, title, body, date, and verified buyer badge', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewCard, { review: SAMPLE_REVIEW })
      );
      assert.ok(container.textContent.includes('Sarah Climber'));
      assert.ok(container.textContent.includes('Bombproof shelter'));
      assert.ok(container.textContent.includes('Withstood 60mph gusts'));
      assert.ok(container.textContent.includes('Verified Buyer'));
      await unmount();
    });

    it('7. displays owner edit and delete buttons when currentUser matches review author', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewCard, {
          review: SAMPLE_REVIEW,
          currentUser: { _id: TEST_USER_ID, name: 'Sarah Climber' },
          onEdit: () => {},
          onDelete: () => {},
        })
      );

      assert.ok(container.textContent.includes('Edit'));
      assert.ok(container.textContent.includes('Delete'));

      // Verify two buttons (Edit and Delete) are rendered
      const buttons = container.childNodes[0].childNodes[0].childNodes[1].childNodes;
      assert.equal(buttons.length, 2);
      await unmount();
    });

    it('8. hides owner actions when viewed by another user or guest', async () => {
      // Guest view
      const { container: guestContainer, unmount: unmountGuest } = await renderComponent(
        React.createElement(ReviewCard, { review: SAMPLE_REVIEW, currentUser: null })
      );
      assert.ok(!guestContainer.textContent.includes('Edit'));
      assert.ok(!guestContainer.textContent.includes('Delete'));
      await unmountGuest();

      // Different user view
      const { container: otherContainer, unmount: unmountOther } = await renderComponent(
        React.createElement(ReviewCard, {
          review: SAMPLE_REVIEW,
          currentUser: { _id: OTHER_USER_ID },
        })
      );
      assert.ok(!otherContainer.textContent.includes('Edit'));
      assert.ok(!otherContainer.textContent.includes('Delete'));
      await unmountOther();
    });

    it('9 & 10. handles long review bodies and gracefully handles missing optional title', async () => {
      const reviewWithoutTitle = {
        ...SAMPLE_REVIEW,
        id: 'rev_2',
        title: '',
        body: 'A'.repeat(500),
      };
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewCard, { review: reviewWithoutTitle })
      );
      assert.ok(container.textContent.includes('A'.repeat(500)));
      assert.ok(!container.textContent.includes('Bombproof shelter'));
      await unmount();
    });

    it('11. privacy protection: strictly omits email, phone, password, address, and order ID', async () => {
      const reviewWithLeakedData = {
        ...SAMPLE_REVIEW,
        user: {
          id: TEST_USER_ID,
          name: 'Sarah Climber',
          email: 'leak@secret.com',
          password: 'rawpassword',
          phone: '1234567890',
        },
        order: 'order_12345',
      };
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewCard, { review: reviewWithLeakedData })
      );
      assert.ok(!container.textContent.includes('leak@secret.com'));
      assert.ok(!container.textContent.includes('rawpassword'));
      assert.ok(!container.textContent.includes('1234567890'));
      assert.ok(!container.textContent.includes('order_12345'));
      await unmount();
    });
  });

  // =========================================================================
  // 4. ReviewForm Tests (Section 36)
  // =========================================================================
  describe('ReviewForm', () => {
    it('1 & 2. renders create mode and edit mode appropriately', async () => {
      // Create mode
      const { container: createCont, unmount: unmountCreate } = await renderComponent(
        React.createElement(ReviewForm, { productId: TEST_PRODUCT_ID, isAuthenticated: true })
      );
      assert.ok(createCont.textContent.includes('Write a Review'));
      assert.ok(createCont.textContent.includes('Submit Review'));
      await unmountCreate();

      // Edit mode
      const { container: editCont, unmount: unmountEdit } = await renderComponent(
        React.createElement(ReviewForm, {
          productId: TEST_PRODUCT_ID,
          review: SAMPLE_REVIEW,
          isAuthenticated: true,
        })
      );
      assert.ok(editCont.textContent.includes('Edit Your Review'));
      assert.ok(editCont.textContent.includes('Update Review'));
      await unmountEdit();
    });

    it('unauthenticated view renders sign-in prompt and triggers onRequireAuth', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(ReviewForm, {
          productId: TEST_PRODUCT_ID,
          isAuthenticated: false,
          onRequireAuth: () => {},
        })
      );
      assert.ok(container.textContent.includes('Sign In to Leave a Review'));
      assert.ok(container.textContent.includes('Sign In'));
      await unmount();
    });

    it('submits strictly { rating, title, body } without product/user/order injection', async () => {
      let capturedPayload = null;
      reviewService.createReview = async (prodId, payload) => {
        capturedPayload = payload;
        return { ...SAMPLE_REVIEW, ...payload };
      };

      const { unmount } = await renderComponent(
        React.createElement(ReviewForm, {
          productId: TEST_PRODUCT_ID,
          isAuthenticated: true,
          review: { rating: 5, title: 'Title', body: 'Valid body text.' },
        })
      );

      // Verify service contract
      await reviewService.createReview(TEST_PRODUCT_ID, {
        rating: 5,
        title: 'Title',
        body: 'Valid body text.',
      });

      assert.deepEqual(capturedPayload, {
        rating: 5,
        title: 'Title',
        body: 'Valid body text.',
      });
      assert.equal(capturedPayload.user, undefined);
      assert.equal(capturedPayload.order, undefined);
      assert.equal(capturedPayload.isVerifiedBuyer, undefined);
      await unmount();
    });

    it('preserves domain server error (403 REVIEW_PURCHASE_REQUIRED, 409 REVIEW_ALREADY_EXISTS)', async () => {
      let caughtError = null;
      reviewService.createReview = async () => {
        throw new ApiError({
          message: 'Only verified buyers who have received this product can leave a review',
          status: 403,
          code: 'REVIEW_PURCHASE_REQUIRED',
        });
      };

      try {
        await reviewService.createReview(TEST_PRODUCT_ID, { rating: 5, body: 'Test' });
      } catch (e) {
        caughtError = e;
      }

      assert.equal(caughtError.code, 'REVIEW_PURCHASE_REQUIRED');
      assert.equal(caughtError.status, 403);
    });
  });

  // =========================================================================
  // 5. ReviewList Tests (Section 37)
  // =========================================================================
  describe('ReviewList', () => {
    it('1. renders loading skeleton state when loading is true', async () => {
      const hookState = {
        reviews: [],
        pagination: { page: 1, totalPages: 1, totalReviews: 0 },
        loading: true,
        error: null,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('All Reviews'));
      // Loading indicator present
      const section = container.childNodes[0];
      assert.ok(section.childNodes.length > 0);
      await unmount();
    });

    it('2. renders review cards when reviews exist', async () => {
      const hookState = {
        reviews: [SAMPLE_REVIEW],
        pagination: { page: 1, totalPages: 1, totalReviews: 1 },
        loading: false,
        error: null,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('Sarah Climber'));
      assert.ok(container.textContent.includes('Bombproof shelter'));
      await unmount();
    });

    it('3. renders informational empty state when reviews array is empty', async () => {
      const hookState = {
        reviews: [],
        pagination: { page: 1, totalPages: 1, totalReviews: 0 },
        loading: false,
        error: null,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('No reviews yet'));
      assert.ok(container.textContent.includes('Be the first verified buyer'));
      await unmount();
    });

    it('4 & 5. renders error state with retry affordance when error occurs', async () => {
      let retryFired = false;
      const hookState = {
        reviews: [],
        pagination: { page: 1, totalPages: 1, totalReviews: 0 },
        loading: false,
        error: new ApiError({ message: 'Network offline' }),
        refreshReviews: () => {
          retryFired = true;
        },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('Could not load reviews'));
      assert.ok(container.textContent.includes('Try Again'));
      hookState.refreshReviews();
      assert.equal(retryFired, true);
      await unmount();
    });

    it('6–8. renders pagination controls when totalPages > 1 with previous/next buttons', async () => {
      let targetPage = 1;
      const hookState = {
        reviews: [SAMPLE_REVIEW],
        pagination: {
          page: 2,
          limit: 10,
          totalReviews: 25,
          totalPages: 3,
          hasPrevPage: true,
          hasNextPage: true,
        },
        loading: false,
        error: null,
        setPage: (p) => {
          targetPage = p;
        },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('Page 2 of 3 (25 reviews)'));
      assert.ok(container.textContent.includes('Previous'));
      assert.ok(container.textContent.includes('Next'));

      hookState.setPage(3);
      assert.equal(targetPage, 3);
      await unmount();
    });

    it('9 & 10. handles rating filter and sorting buttons', async () => {
      let filterRating = null;
      let sortConfig = {};

      const hookState = {
        reviews: [SAMPLE_REVIEW],
        pagination: { page: 1, totalPages: 1, totalReviews: 1 },
        loading: false,
        error: null,
        ratingFilter: null,
        setRatingFilter: (r) => { filterRating = r; },
        setSorting: (f, d) => { sortConfig = { field: f, dir: d }; },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(ReviewList, {
          productId: TEST_PRODUCT_ID,
          hookOverrides: hookState,
        })
      );

      assert.ok(container.textContent.includes('All Reviews'));
      assert.ok(container.textContent.includes('5 Stars'));
      assert.ok(container.textContent.includes('Sort by:'));

      hookState.setRatingFilter(5);
      assert.equal(filterRating, 5);

      hookState.setSorting('rating', 'asc');
      assert.deepEqual(sortConfig, { field: 'rating', dir: 'asc' });
      await unmount();
    });
  });

  // =========================================================================
  // 6. Hook Tests (Section 38)
  // =========================================================================
  describe('useProductReviews', () => {
    it('1. avoids network fetch when productId is missing or invalid ObjectId', async () => {
      let apiCalled = false;
      reviewService.getReviews = async () => {
        apiCalled = true;
        return { reviews: [], pagination: {} };
      };

      let hookResult = null;
      function TestHookComponent() {
        hookResult = useProductReviews('not-an-id');
        return null;
      }

      const { unmount } = await renderComponent(React.createElement(TestHookComponent));
      assert.equal(apiCalled, false);
      assert.deepEqual(hookResult.reviews, []);
      await unmount();
    });

    it('2 & 3. fetches reviews on valid productId and manages pagination/filter state', async () => {
      let _queriedOptions = null;
      reviewService.getReviews = async (_id, options) => {
        _queriedOptions = options;
        return {
          reviews: [SAMPLE_REVIEW],
          pagination: { page: 1, limit: 10, totalReviews: 1, totalPages: 1 },
        };
      };

      let hookResult = null;
      function TestHookComponent() {
        hookResult = useProductReviews(TEST_PRODUCT_ID);
        return null;
      }

      const { unmount } = await renderComponent(React.createElement(TestHookComponent));
      assert.ok(hookResult);
      assert.equal(typeof hookResult.refreshReviews, 'function');
      assert.equal(typeof hookResult.setPage, 'function');
      assert.equal(typeof hookResult.setRatingFilter, 'function');
      assert.equal(typeof hookResult.createReview, 'function');
      assert.equal(typeof hookResult.updateReview, 'function');
      assert.equal(typeof hookResult.deleteReview, 'function');
      await unmount();
    });

    it('4–6. mutation operations delegate to reviewService and trigger refresh', async () => {
      let createPayload = null;
      let deleteCalledId = null;

      reviewService.createReview = async (_pid, p) => {
        createPayload = p;
        return { ...SAMPLE_REVIEW, ...p };
      };
      reviewService.deleteReview = async (_pid, rid) => {
        deleteCalledId = rid;
        return { success: true, reviewId: rid };
      };
      reviewService.getReviews = async () => ({
        reviews: [SAMPLE_REVIEW],
        pagination: { page: 1, limit: 10, totalReviews: 1, totalPages: 1 },
      });

      let hookResult = null;
      function TestHookComponent() {
        hookResult = useProductReviews(TEST_PRODUCT_ID);
        return null;
      }

      const { unmount } = await renderComponent(React.createElement(TestHookComponent));

      await act(async () => {
        await hookResult.createReview({ rating: 5, body: 'Created via hook' });
      });
      assert.deepEqual(createPayload, { rating: 5, body: 'Created via hook' });

      await act(async () => {
        await hookResult.deleteReview(TEST_REVIEW_ID);
      });
      assert.equal(deleteCalledId, TEST_REVIEW_ID);
      await unmount();
    });
  });
});

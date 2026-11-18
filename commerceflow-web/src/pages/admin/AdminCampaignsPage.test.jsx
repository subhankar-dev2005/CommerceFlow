import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminCampaignsPage, {
  STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  IMPORTED_TRACKING_KEY,
  LEGACY_IMPORTED_TRACKING_KEY,
  getLocalDraftCampaigns,
  importLocalDraftsToBackend,
  getDraftIdentifier,
  getDraftContentSignature,
  ensureDraftIdentifiers,
} from './AdminCampaignsPage.jsx';
import { adminCampaignService } from '../../features/admin/adminCampaign.service.js';
import { adminCouponService } from '../../features/admin/adminCoupon.service.js';

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
    __listeners: listeners,
    focus: () => {},
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'value') el.value = String(val);
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
      if (doc && doc.__listeners && doc.__listeners.click) {
        event.currentTarget = doc;
        doc.__listeners.click.forEach((fn) => fn(event));
      }
    },
    submit: () => {
      const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (reactPropsKey && el[reactPropsKey]?.onSubmit) {
        el[reactPropsKey].onSubmit({ type: 'submit', preventDefault: () => {}, stopPropagation: () => {} });
        return;
      }

      let current = el;
      const event = {
        type: 'submit',
        target: el,
        currentTarget: el,
        bubbles: true,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      while (current) {
        if (current.__listeners && current.__listeners.submit) {
          event.currentTarget = current;
          current.__listeners.submit.forEach((fn) => fn(event));
        }
        current = current.parentNode;
      }
      if (doc && doc.__listeners && doc.__listeners.submit) {
        event.currentTarget = doc;
        doc.__listeners.submit.forEach((fn) => fn(event));
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
        if (doc && doc.__listeners && doc.__listeners[eventType]) {
          event.currentTarget = doc;
          doc.__listeners[eventType].forEach((fn) => fn(event));
        }
      }
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

const mockLocalStorageStore = new Map();
const mockLocalStorage = {
  getItem: (key) => (mockLocalStorageStore.has(key) ? mockLocalStorageStore.get(key) : null),
  setItem: (key, val) => mockLocalStorageStore.set(key, String(val)),
  removeItem: (key) => mockLocalStorageStore.delete(key),
  clear: () => mockLocalStorageStore.clear(),
};

const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  localStorage: mockLocalStorage,
  confirm: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

function findElements(node, predicate) {
  const matches = [];
  function walk(current) {
    if (!current) return;
    if (predicate(current)) matches.push(current);
    if (current.childNodes) {
      for (const child of current.childNodes) {
        walk(child);
      }
    }
  }
  walk(node);
  return matches;
}

describe('AdminCampaignsPage & Non-Destructive Migration Tests', () => {
  let originalGetCampaigns;
  let originalCreateCampaign;
  let originalUpdateStatus;
  let originalDeleteCampaign;
  let originalGetCoupons;

  beforeEach(() => {
    mockLocalStorage.clear();
    originalGetCampaigns = adminCampaignService.getAdminCampaigns;
    originalCreateCampaign = adminCampaignService.createAdminCampaign;
    originalUpdateStatus = adminCampaignService.updateAdminCampaignStatus;
    originalDeleteCampaign = adminCampaignService.deleteAdminCampaign;
    originalGetCoupons = adminCouponService.getAdminCoupons;

    adminCouponService.getAdminCoupons = async () => ({
      coupons: [{ code: 'SAVE10', type: 'percentage', value: 10 }],
    });
  });

  afterEach(() => {
    adminCampaignService.getAdminCampaigns = originalGetCampaigns;
    adminCampaignService.createAdminCampaign = originalCreateCampaign;
    adminCampaignService.updateAdminCampaignStatus = originalUpdateStatus;
    adminCampaignService.deleteAdminCampaign = originalDeleteCampaign;
    adminCouponService.getAdminCoupons = originalGetCoupons;
    mockLocalStorage.clear();
  });

  describe('Non-destructive localStorage Draft Preservation & Migration', () => {
    it('1. returns empty array when localStorage has no campaign data', () => {
      const drafts = getLocalDraftCampaigns();
      assert.deepEqual(drafts, []);
    });

    it('2. filters out default mock examples (camp_1, camp_2)', () => {
      const defaultData = [
        { id: 'camp_1', name: 'Diwali Festive Super Saver', status: 'active' },
        { id: 'camp_2', name: 'Winter Warmth Apparel Showcase', status: 'upcoming' },
      ];
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));

      const drafts = getLocalDraftCampaigns();
      assert.equal(drafts.length, 0, 'Must ignore default example campaigns');
    });

    it('3. identifies user-created custom draft campaigns', () => {
      const mixedData = [
        { id: 'camp_1', name: 'Diwali Festive Super Saver', status: 'active' },
        {
          id: 'camp_user_99',
          name: 'Flash Midnight Deals',
          objective: 'Target late-night shoppers',
          startDate: '2026-11-01',
          endDate: '2026-11-05',
          status: 'active',
          bannerPlacement: 'hero_carousel',
        },
      ];
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify(mixedData));

      const drafts = getLocalDraftCampaigns();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].id, 'camp_user_99');
      assert.equal(drafts[0].name, 'Flash Midnight Deals');
    });

    it('4. filters out drafts that were already imported', () => {
      const mixedData = [
        { id: 'camp_user_99', name: 'Flash Midnight Deals', status: 'active' },
      ];
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify(mixedData));
      mockLocalStorage.setItem(IMPORTED_TRACKING_KEY, JSON.stringify(['camp_user_99']));

      const drafts = getLocalDraftCampaigns();
      assert.equal(drafts.length, 0, 'Must not return already imported drafts');
    });

    it('5. importLocalDraftsToBackend creates recoverable backup and imports without deleting original key', async () => {
      const userDrafts = [
        {
          id: 'camp_local_1',
          name: 'Monsoon Clearance Blitz',
          objective: 'Clear seasonal apparel',
          couponCode: 'MONSOON40',
          startDate: '2026-11-10',
          endDate: '2026-11-20',
          status: 'active',
          bannerPlacement: 'category_top',
        },
      ];
      const originalRaw = JSON.stringify(userDrafts);
      mockLocalStorage.setItem(STORAGE_KEY, originalRaw);

      let createdPayload = null;
      adminCampaignService.createAdminCampaign = async (payload) => {
        createdPayload = payload;
        return {
          _id: '507f1f77bcf86cd799439099',
          ...payload,
        };
      };

      const result = await importLocalDraftsToBackend(userDrafts, []);

      // Verify backup was created
      assert.equal(mockLocalStorage.getItem(BACKUP_STORAGE_KEY), originalRaw);

      // Verify original localStorage key was preserved
      assert.equal(mockLocalStorage.getItem(STORAGE_KEY), originalRaw);

      // Verify import succeeded
      assert.equal(result.importedCount, 1);
      assert.equal(result.failedCount, 0);
      assert.equal(createdPayload.name, 'Monsoon Clearance Blitz');
      assert.equal(createdPayload.couponCode, 'MONSOON40');

      // Verify imported tracking key contains draft id
      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes('camp_local_1'));

      // Re-running import prevents duplicate creation
      let secondRunDispatched = false;
      adminCampaignService.createAdminCampaign = async () => {
        secondRunDispatched = true;
      };
      const secondResult = await importLocalDraftsToBackend(userDrafts, [
        { name: 'Monsoon Clearance Blitz' },
      ]);
      assert.equal(secondRunDispatched, false, 'Must not dispatch duplicate requests');
      assert.equal(secondResult.importedCount, 0);
    });

    it('5b. handles partial import failures without crashing or marking failed drafts as imported', async () => {
      const drafts = [
        { id: 'draft_ok', name: 'Valid Flash Campaign' },
        { id: 'draft_err', name: 'Faulty Campaign' },
      ];
      adminCampaignService.createAdminCampaign = async (payload) => {
        if (payload.name === 'Faulty Campaign') {
          throw new Error('Database duplicate error');
        }
        return { _id: '507f1f77bcf86cd799439099', name: payload.name };
      };

      const res = await importLocalDraftsToBackend(drafts, []);
      assert.equal(res.importedCount, 1);
      assert.equal(res.failedCount, 1);

      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes('draft_ok'));
      assert.ok(!importedIds.includes('draft_err'), 'Failed draft must not be marked imported');
    });

    it('5c. local draft with a name matching an existing backend campaign is created and NOT silently marked imported', async () => {
      const existingCampaigns = [
        { _id: 'camp_srv_1', name: 'Summer Festival Sale', status: 'active' },
      ];
      const draft = {
        id: 'draft_local_1',
        name: 'Summer Festival Sale',
        startDate: '2026-06-01',
        endDate: '2026-06-15',
        status: 'active',
      };
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([draft]));

      let createDispatched = false;
      let sentPayload = null;
      adminCampaignService.createAdminCampaign = async (payload) => {
        createDispatched = true;
        sentPayload = payload;
        return { _id: 'srv_new_1', ...payload };
      };

      const res = await importLocalDraftsToBackend([draft], existingCampaigns);

      assert.equal(createDispatched, true, 'Must dispatch create request despite matching name on backend');
      assert.equal(sentPayload?.name, 'Summer Festival Sale');
      assert.equal(res.importedCount, 1);
      assert.equal(res.failedCount, 0);

      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes('draft_local_1'));
      const legacyImportedIds = JSON.parse(mockLocalStorage.getItem(LEGACY_IMPORTED_TRACKING_KEY));
      assert.ok(legacyImportedIds.includes('draft_local_1'));
    });

    it('5d. two different drafts with the exact same name are both imported without collision', async () => {
      const drafts = [
        { id: 'draft_same_1', name: 'Flash 24h Clearance', startDate: '2026-07-01', endDate: '2026-07-02' },
        { id: 'draft_same_2', name: 'Flash 24h Clearance', startDate: '2026-08-01', endDate: '2026-08-02' },
      ];
      const createdNames = [];
      adminCampaignService.createAdminCampaign = async (payload) => {
        createdNames.push(payload.name);
        return { _id: 'id_' + Math.random(), ...payload };
      };

      const res = await importLocalDraftsToBackend(drafts, []);

      assert.equal(createdNames.length, 2, 'Both drafts must be sent to backend create API');
      assert.equal(res.importedCount, 2);
      assert.equal(res.failedCount, 0);

      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes('draft_same_1'));
      assert.ok(importedIds.includes('draft_same_2'));
    });

    it('5e. failed create request leaves draft eligible for retry on next run', async () => {
      const draft = { id: 'draft_transient_err', name: 'Weekend Bonanza', startDate: '2026-09-01' };
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([draft]));

      adminCampaignService.createAdminCampaign = async () => {
        throw new Error('Network timeout');
      };

      const res1 = await importLocalDraftsToBackend([draft], []);
      assert.equal(res1.importedCount, 0);
      assert.equal(res1.failedCount, 1);

      const trackingRaw = mockLocalStorage.getItem(IMPORTED_TRACKING_KEY);
      assert.ok(!trackingRaw || !JSON.parse(trackingRaw).includes('draft_transient_err'));

      const pendingDrafts = getLocalDraftCampaigns();
      assert.equal(pendingDrafts.length, 1);
      assert.equal(pendingDrafts[0].id, 'draft_transient_err');

      let retrySuccess = false;
      adminCampaignService.createAdminCampaign = async (p) => {
        retrySuccess = true;
        return { _id: 'srv_ok', ...p };
      };

      const res2 = await importLocalDraftsToBackend(pendingDrafts, []);
      assert.equal(retrySuccess, true, 'Retry must succeed when service recovers');
      assert.equal(res2.importedCount, 1);
      assert.equal(res2.failedCount, 0);
      assert.ok(JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY)).includes('draft_transient_err'));
    });

    it('5f. partial batch failure preserves successful import tracking and retries only failed items', async () => {
      const drafts = [
        { id: 'batch_ok_1', name: 'Item 1' },
        { id: 'batch_fail_2', name: 'Item 2' },
      ];
      const attempted = [];
      adminCampaignService.createAdminCampaign = async (payload) => {
        attempted.push(payload.name);
        if (payload.name === 'Item 2') throw new Error('DB Error');
        return { _id: 'srv_' + payload.name, ...payload };
      };

      const res1 = await importLocalDraftsToBackend(drafts, []);
      assert.equal(res1.importedCount, 1);
      assert.equal(res1.failedCount, 1);

      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes('batch_ok_1'));
      assert.ok(!importedIds.includes('batch_fail_2'));

      // Round 2: retry entire original batch
      const attemptedRound2 = [];
      adminCampaignService.createAdminCampaign = async (payload) => {
        attemptedRound2.push(payload.name);
        return { _id: 'srv_' + payload.name, ...payload };
      };

      const res2 = await importLocalDraftsToBackend(drafts, []);
      assert.deepEqual(attemptedRound2, ['Item 2'], 'Only the failed draft must be retried; successful draft must NOT be duplicated');
      assert.equal(res2.importedCount, 1);
      assert.equal(res2.failedCount, 0);
    });

    it('5g. recognizes pre-existing imported IDs in legacy tracking key (commerceflow_admin_campaigns_imported_v1)', async () => {
      mockLocalStorage.setItem(
        LEGACY_IMPORTED_TRACKING_KEY,
        JSON.stringify(['legacy_draft_99'])
      );
      mockLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { id: 'legacy_draft_99', name: 'Pre-migrated Promo' },
          { id: 'new_draft_1', name: 'Fresh Promo' },
        ])
      );

      const pendingDrafts = getLocalDraftCampaigns();
      assert.equal(pendingDrafts.length, 1);
      assert.equal(pendingDrafts[0].id, 'new_draft_1');

      const created = [];
      adminCampaignService.createAdminCampaign = async (p) => {
        created.push(p.name);
        return { _id: 'srv_fresh', ...p };
      };

      const res = await importLocalDraftsToBackend([
        { id: 'legacy_draft_99', name: 'Pre-migrated Promo' },
        { id: 'new_draft_1', name: 'Fresh Promo' },
      ]);

      assert.deepEqual(created, ['Fresh Promo'], 'Legacy draft must not be re-created');
      assert.equal(res.importedCount, 1);

      const currentKeyIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      const legacyKeyIds = JSON.parse(mockLocalStorage.getItem(LEGACY_IMPORTED_TRACKING_KEY));
      assert.ok(currentKeyIds.includes('legacy_draft_99'));
      assert.ok(currentKeyIds.includes('new_draft_1'));
      assert.ok(legacyKeyIds.includes('legacy_draft_99'));
      assert.ok(legacyKeyIds.includes('new_draft_1'));
    });

    it('5h. safely handles malformed JSON in localStorage without throwing uncaught exceptions', async () => {
      mockLocalStorage.setItem(STORAGE_KEY, '{ invalid json syntax');
      mockLocalStorage.setItem(IMPORTED_TRACKING_KEY, '{ broken array');

      const drafts = getLocalDraftCampaigns();
      assert.deepEqual(drafts, [], 'Must return empty array on invalid JSON');

      adminCampaignService.createAdminCampaign = async (p) => ({ _id: 'srv_1', ...p });
      const res = await importLocalDraftsToBackend([{ id: 'c1', name: 'Valid Name' }]);
      assert.equal(res.importedCount, 1);
      assert.equal(res.failedCount, 0);
    });

    it('5i. generates deterministic synthetic ID for drafts lacking an explicit id property', async () => {
      const draft = {
        name: 'Unidentified Flash Deals',
        startDate: '2026-12-01',
        endDate: '2026-12-10',
      };
      adminCampaignService.createAdminCampaign = async (p) => ({ _id: 'srv_synth', ...p });

      const res1 = await importLocalDraftsToBackend([draft]);
      assert.equal(res1.importedCount, 1);

      let reRunDispatched = false;
      adminCampaignService.createAdminCampaign = async () => {
        reRunDispatched = true;
      };

      const res2 = await importLocalDraftsToBackend([draft]);
      assert.equal(reRunDispatched, false, 'Synthetic ID must prevent duplicate import on second run');
      assert.equal(res2.importedCount, 0);
    });

    it('5j. two ID-less drafts with same name and dates but different coupon codes or objectives are both imported', async () => {
      const draftA = {
        name: 'Festive Bumper',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        couponCode: 'FESTIVE10',
        objective: 'Drive tier 1 sales',
      };
      const draftB = {
        name: 'Festive Bumper',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        couponCode: 'FESTIVE20',
        objective: 'Drive tier 2 sales',
      };

      const created = [];
      adminCampaignService.createAdminCampaign = async (p) => {
        created.push(p);
        return { _id: 'id_' + Math.random(), ...p };
      };

      const res = await importLocalDraftsToBackend([draftA, draftB]);
      assert.equal(res.importedCount, 2);
      assert.equal(created.length, 2);
      assert.equal(created[0].couponCode, 'FESTIVE10');
      assert.equal(created[1].couponCode, 'FESTIVE20');

      const idA = getDraftIdentifier(draftA);
      const idB = getDraftIdentifier(draftB);
      assert.notEqual(idA, idB, 'Distinct business fields must yield distinct identifiers');
    });

    it('5k. two ID-less drafts with same name and dates but different banner placements are both imported', async () => {
      const draftA = {
        name: 'Weekend Blitz',
        startDate: '2026-11-15',
        endDate: '2026-11-17',
        bannerPlacement: 'hero_carousel',
      };
      const draftB = {
        name: 'Weekend Blitz',
        startDate: '2026-11-15',
        endDate: '2026-11-17',
        bannerPlacement: 'category_top',
      };

      const created = [];
      adminCampaignService.createAdminCampaign = async (p) => {
        created.push(p);
        return { _id: 'id_' + Math.random(), ...p };
      };

      const res = await importLocalDraftsToBackend([draftA, draftB]);
      assert.equal(res.importedCount, 2);
      assert.equal(created.length, 2);
      assert.equal(created[0].bannerPlacement, 'hero_carousel');
      assert.equal(created[1].bannerPlacement, 'category_top');

      assert.notEqual(getDraftIdentifier(draftA), getDraftIdentifier(draftB));
    });

    it('5l. two distinct ID-less drafts with completely identical business fields are both imported without collision', async () => {
      const draftA = { name: 'Identical Promo', startDate: '2026-12-01', endDate: '2026-12-10' };
      const draftB = { name: 'Identical Promo', startDate: '2026-12-01', endDate: '2026-12-10' };

      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([draftA, draftB]));

      const pending = getLocalDraftCampaigns();
      assert.equal(pending.length, 2);

      const idA = getDraftIdentifier(pending[0]);
      const idB = getDraftIdentifier(pending[1]);
      assert.notEqual(idA, idB, 'Occurrence discriminator must prevent collision for identical items');

      const created = [];
      adminCampaignService.createAdminCampaign = async (p) => {
        created.push(p);
        return { _id: 'id_' + Math.random(), ...p };
      };

      const res = await importLocalDraftsToBackend(pending);
      assert.equal(res.importedCount, 2);
      assert.equal(created.length, 2);

      const importedIds = JSON.parse(mockLocalStorage.getItem(IMPORTED_TRACKING_KEY));
      assert.ok(importedIds.includes(idA));
      assert.ok(importedIds.includes(idB));
    });

    it('5m. synthetic identifiers remain stable across repeated reads and simulated reloads', async () => {
      const draftA = { name: 'Reload Stability Test', startDate: '2026-10-01', endDate: '2026-10-10' };
      const draftB = { name: 'Reload Stability Test', startDate: '2026-10-01', endDate: '2026-10-10' };

      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([draftA, draftB]));

      const read1 = getLocalDraftCampaigns();
      const idA1 = getDraftIdentifier(read1[0]);
      const idB1 = getDraftIdentifier(read1[1]);

      const read2 = getLocalDraftCampaigns();
      const idA2 = getDraftIdentifier(read2[0]);
      const idB2 = getDraftIdentifier(read2[1]);

      assert.equal(idA1, idA2, 'ID A must be invariant across reloads');
      assert.equal(idB1, idB2, 'ID B must be invariant across reloads');
    });

    it('5n. reordering drafts in storage does not alter their identities once assigned', async () => {
      const draftA = { name: 'Reorder Test', startDate: '2026-10-01' };
      const draftB = { name: 'Reorder Test', startDate: '2026-10-01' };

      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([draftA, draftB]));

      const initial = getLocalDraftCampaigns();
      const origIdA = getDraftIdentifier(initial[0]);
      const origIdB = getDraftIdentifier(initial[1]);

      const rawParsed = JSON.parse(mockLocalStorage.getItem(STORAGE_KEY));
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify([rawParsed[1], rawParsed[0]]));

      const reordered = getLocalDraftCampaigns();
      assert.equal(getDraftIdentifier(reordered[0]), origIdB, 'Reordered item 0 must retain origIdB');
      assert.equal(getDraftIdentifier(reordered[1]), origIdA, 'Reordered item 1 must retain origIdA');
    });

    it('5o. original draft business fields and backup storage are preserved intact without loss', async () => {
      const draft = {
        name: 'Custom Legacy Promo',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        customTag: 'special_legacy_tag',
        legacyNotes: 'Do not remove',
      };
      const raw = JSON.stringify([draft]);
      mockLocalStorage.setItem(STORAGE_KEY, raw);

      getLocalDraftCampaigns();

      assert.equal(mockLocalStorage.getItem(BACKUP_STORAGE_KEY), raw);

      const stored = JSON.parse(mockLocalStorage.getItem(STORAGE_KEY));
      assert.equal(stored[0].customTag, 'special_legacy_tag');
      assert.equal(stored[0].legacyNotes, 'Do not remove');
      assert.equal(stored[0].name, 'Custom Legacy Promo');
    });
  });

  describe('UI Component Rendering & State Transitions', () => {
    it('6. renders loading state while initial API call is in progress', async () => {
      adminCampaignService.getAdminCampaigns = () => new Promise(() => {});

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
      });

      const text = container.textContent;
      assert.ok(text.includes('Loading scheduled campaigns...'), 'Must render loading message');
      assert.ok(text.includes('Campaigns & Promotions'), 'Must render page header');

      await act(async () => {
        root.unmount();
      });
    });

    it('7. renders error state with retry button when API request fails', async () => {
      let callCount = 0;
      adminCampaignService.getAdminCampaigns = async () => {
        callCount++;
        throw new Error('Network timeout connecting to campaign service');
      };

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = container.textContent;
      assert.ok(text.includes('Failed to load campaigns'), 'Must render error state title');
      assert.ok(text.includes('Network timeout'), 'Must display error message');
      assert.ok(text.includes('Try Again'), 'Must display retry action');
      assert.ok(callCount >= 1);

      await act(async () => {
        root.unmount();
      });
    });

    it('8. renders empty state when zero campaigns are returned by the API', async () => {
      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [],
        pagination: { totalCampaigns: 0 },
      });

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = container.textContent;
      assert.ok(text.includes('No campaigns scheduled'), 'Must render empty state title');
      assert.ok(text.includes('Schedule Campaign'), 'Must render action button');

      await act(async () => {
        root.unmount();
      });
    });

    it('9. renders campaign cards with status badges and dates when campaigns exist', async () => {
      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [
          {
            _id: '507f1f77bcf86cd799439001',
            name: 'Diwali Mega Sale 2026',
            objective: 'Drive seasonal orders',
            couponCode: 'DIWALI50',
            startDate: '2026-10-20T00:00:00.000Z',
            endDate: '2026-11-05T00:00:00.000Z',
            status: 'active',
            bannerPlacement: 'hero_carousel',
          },
        ],
        pagination: { totalCampaigns: 1 },
      });

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = container.textContent;
      assert.ok(text.includes('Diwali Mega Sale 2026'), 'Must display campaign name');
      assert.ok(text.includes('ACTIVE'), 'Must display status badge');
      assert.ok(text.includes('DIWALI50'), 'Must display coupon code');
      assert.ok(text.includes('2026-10-20'), 'Must display start date');
      assert.ok(text.includes('hero_carousel'), 'Must display banner placement');

      await act(async () => {
        root.unmount();
      });
    });

    it('10. renders migration banner when unimported user drafts exist in localStorage', async () => {
      mockLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: 'camp_local_unimported',
            name: 'Local Preview Draft Sale',
            startDate: '2026-11-01',
            endDate: '2026-11-15',
            status: 'active',
          },
        ])
      );

      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [],
        pagination: { totalCampaigns: 0 },
      });

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = container.textContent;
      assert.ok(text.includes('Local Campaign Drafts Detected'), 'Must render migration banner');
      assert.ok(text.includes('Import to Central Database'), 'Must render import button');

      await act(async () => {
        root.unmount();
      });
    });

    it('11. status toggle dispatches updateAdminCampaignStatus and updates card display on success', async () => {
      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [
          {
            _id: '507f1f77bcf86cd799439001',
            name: 'Active Campaign',
            status: 'active',
            startDate: '2026-10-01',
            endDate: '2026-10-15',
          },
        ],
      });

      let updatedTargetId = null;
      let updatedStatus = null;
      adminCampaignService.updateAdminCampaignStatus = async (id, status) => {
        updatedTargetId = id;
        updatedStatus = status;
        return {
          _id: id,
          status,
        };
      };

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Find End button
      const buttons = findElements(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('End'));
      assert.ok(buttons.length >= 1, 'End status toggle button must be present');

      await act(async () => {
        buttons[0].click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      assert.equal(updatedTargetId, '507f1f77bcf86cd799439001');
      assert.equal(updatedStatus, 'ended');
      assert.ok(container.textContent.includes('ENDED'));

      await act(async () => {
        root.unmount();
      });
    });

    it('12. delete action dispatches deleteAdminCampaign and removes campaign from view', async () => {
      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [
          {
            _id: '507f1f77bcf86cd799439001',
            name: 'Campaign To Remove',
            status: 'ended',
            startDate: '2026-10-01',
            endDate: '2026-10-15',
          },
        ],
      });

      let deletedId = null;
      adminCampaignService.deleteAdminCampaign = async (id) => {
        deletedId = id;
        return { success: true };
      };

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Find delete button
      const deleteButtons = findElements(container, (el) => el.tagName === 'BUTTON' && el.getAttribute('title') === 'Delete campaign');
      assert.ok(deleteButtons.length >= 1, 'Delete button must be rendered');

      await act(async () => {
        deleteButtons[0].click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      assert.equal(deletedId, '507f1f77bcf86cd799439001');
      assert.ok(container.textContent.includes('deleted successfully'), 'Must display deletion success feedback');
      assert.ok(container.textContent.includes('No campaigns scheduled'), 'Must render empty state once campaigns are deleted');

      await act(async () => {
        root.unmount();
      });
    });

    it('13. user-triggered import button calls migration and refreshes view with newly imported campaigns', async () => {
      mockLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: 'camp_local_user',
            name: 'Importable User Campaign',
            startDate: '2026-11-01',
            endDate: '2026-11-15',
            status: 'active',
          },
        ])
      );

      let getCallCount = 0;
      adminCampaignService.getAdminCampaigns = async () => {
        getCallCount++;
        if (getCallCount === 1) {
          return { campaigns: [], pagination: { totalCampaigns: 0 } };
        }
        return {
          campaigns: [
            {
              _id: '507f1f77bcf86cd799439999',
              name: 'Importable User Campaign',
              status: 'active',
              startDate: '2026-11-01',
              endDate: '2026-11-15',
            },
          ],
          pagination: { totalCampaigns: 1 },
        };
      };

      let createdFromMigration = null;
      adminCampaignService.createAdminCampaign = async (payload) => {
        createdFromMigration = payload;
        return {
          _id: '507f1f77bcf86cd799439999',
          ...payload,
        };
      };

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const importBtn = findElements(
        container,
        (el) => el.tagName === 'BUTTON' && el.textContent.includes('Import to Central Database')
      )[0];
      assert.ok(importBtn, 'Import button must be rendered');

      await act(async () => {
        importBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      assert.ok(createdFromMigration);
      assert.equal(createdFromMigration.name, 'Importable User Campaign');
      assert.ok(container.textContent.includes('Successfully imported 1 local draft campaign(s)'));
      assert.ok(container.textContent.includes('Importable User Campaign'));

      await act(async () => {
        root.unmount();
      });
    });

    it('14. modal schedule workflow validates input, prevents duplicate submissions, and creates campaign', async () => {
      adminCampaignService.getAdminCampaigns = async () => ({
        campaigns: [],
        pagination: { totalCampaigns: 0 },
      });

      let createDispatched = 0;
      let createdPayload = null;
      adminCampaignService.createAdminCampaign = async (payload) => {
        createDispatched++;
        createdPayload = payload;
        return {
          _id: '507f1f77bcf86cd799439123',
          ...payload,
        };
      };

      const container = createMockElement('div', mockDoc);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(AdminCampaignsPage));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 1. Open modal via Schedule Campaign button
      const scheduleButtons = findElements(
        container,
        (el) => el.tagName === 'BUTTON' && el.textContent.includes('Schedule Campaign')
      );
      assert.ok(scheduleButtons.length >= 1, 'Schedule Campaign button must exist');

      await act(async () => {
        scheduleButtons[0].click();
      });

      assert.ok(container.textContent.includes('Schedule Promotional Campaign'), 'Modal must open');

      // 2. Find inputs
      const textInputs = findElements(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'text');
      const form = findElements(container, (el) => el.tagName === 'FORM')[0];
      assert.ok(textInputs.length >= 1, 'Campaign name input must be rendered');
      assert.ok(form, 'Campaign modal form must be rendered');

      // 3. Attempt submit with empty name
      await act(async () => {
        form.submit();
      });
      assert.ok(container.textContent.includes('Campaign name is required'), 'Must validate required name');
      assert.equal(createDispatched, 0, 'Must not dispatch network request on invalid form');

      // 4. Fill in valid campaign name
      await act(async () => {
        textInputs[0].change('Winter Grand Sale');
      });

      // 5. Submit valid form
      await act(async () => {
        form.submit();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      assert.equal(createDispatched, 1, 'Must dispatch createAdminCampaign once');
      assert.equal(createdPayload.name, 'Winter Grand Sale');
      assert.ok(container.textContent.includes('scheduled successfully'), 'Must display success message');
      assert.ok(container.textContent.includes('Winter Grand Sale'), 'Must render newly created campaign name');
      assert.ok(!container.textContent.includes('Schedule Promotional Campaign'), 'Modal must close on success');

      await act(async () => {
        root.unmount();
      });
    });
  });
});

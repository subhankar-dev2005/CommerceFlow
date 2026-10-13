import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import TrustStrip from './TrustStrip.jsx';

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
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'class' || name === 'className') el.className = String(val);
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
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
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
    _listeners: listeners,
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
          set: (v) => { textNode.nodeValue = String(v); },
        });
        textNode.parentNode = el;
        children.push(textNode);
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
      const t = new MockNode();
      t.nodeType = 3;
      t.nodeValue = String(text);
      t.ownerDocument = doc;
      Object.defineProperty(t, 'textContent', {
        get: () => t.nodeValue,
        set: (v) => { t.nodeValue = String(v); },
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
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
};
mockDoc.defaultView = mockWin;

if (!globalThis.document) globalThis.document = mockDoc;
if (!globalThis.window) globalThis.window = mockWin;
if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = MockHTMLIFrameElement;
if (!globalThis.HTMLElement) globalThis.HTMLElement = MockHTMLElement;
if (!globalThis.Element) globalThis.Element = MockElement;
if (!globalThis.Node) globalThis.Node = MockNode;

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

describe('TrustStrip Service-Benefit Component Tests', () => {
  it('1. Renders all 4 service benefits with valid titles, descriptions, and SVGs', async () => {
    const { container, unmount } = await renderComponent(<TrustStrip compact={true} />);
    const section = container.children[0];
    const gridEl = section.children[0];
    assert.equal(gridEl.children.length, 4, 'Contains exactly 4 service-benefit items');

    const expected = [
      { title: 'Free Shipping', desc: 'On orders over $50' },
      { title: '30-Day Returns', desc: 'Hassle-free returns' },
      { title: 'Secure Payment', desc: '100% secure checkout' },
      { title: '24/7 Support', desc: "We're here to help" },
    ];

    expected.forEach((exp, idx) => {
      const itemEl = gridEl.children[idx];
      const iconWrapper = itemEl.children[0];
      const textWrapper = itemEl.children[1];
      const headingEl = textWrapper.children[0];
      const descEl = textWrapper.children[1];

      assert.equal(headingEl.textContent, exp.title);
      assert.equal(descEl.textContent, exp.desc);
      assert.ok(iconWrapper.children.length > 0, `Item ${idx} has SVG icon`);
      const svgEl = iconWrapper.children[0];
      assert.equal(svgEl.tagName, 'SVG', `Item ${idx} contains SVG element`);
    });

    await unmount();
  });

  it('2. Compact variant renders all four items in a clean 2-column grid and not a cramped 4-column grid', async () => {
    const { container, unmount } = await renderComponent(<TrustStrip compact={true} />);
    const text = container.textContent;

    // Verify all four titles and descriptions are present
    assert.ok(text.includes('Free Shipping'));
    assert.ok(text.includes('On orders over $50'));
    assert.ok(text.includes('30-Day Returns'));
    assert.ok(text.includes('Hassle-free returns'));
    assert.ok(text.includes('Secure Payment'));
    assert.ok(text.includes('100% secure checkout'));
    assert.ok(text.includes('24/7 Support'));
    assert.ok(text.includes("We're here to help"));

    // Find section and inner grid
    const section = container.children[0];
    assert.ok(section, 'Section element rendered');
    const sectionClass = section.getAttribute('class') || '';
    assert.ok(sectionClass.includes('bg-white'), 'Has white card surface');
    assert.ok(sectionClass.includes('rounded-2xl'), 'Has rounded corners');
    assert.ok(sectionClass.includes('border-[#E5E9E6]'), 'Has subtle border');
    assert.ok(sectionClass.includes('shadow-xs'), 'Has subtle shadow');

    // Grid container checks: 2 columns on tablet/desktop, 1 column on mobile, NOT 4 columns
    const gridEl = section.children[0];
    assert.ok(gridEl, 'Grid element exists');
    const gridClass = gridEl.getAttribute('class') || '';
    assert.ok(gridClass.includes('grid-cols-1'), 'Adapts to 1 column on mobile to prevent overflow');
    assert.ok(gridClass.includes('sm:grid-cols-2'), 'Adapts to 2 columns on tablet and desktop (2x2 grid)');
    assert.ok(!gridClass.includes('lg:grid-cols-4'), 'Does not force 4 columns in compact panel');

    await unmount();
  });

  it('3. Compact variant also responds to variant="compact" prop consistently', async () => {
    const { container, unmount } = await renderComponent(<TrustStrip variant="compact" />);
    const section = container.children[0];
    const gridEl = section.children[0];
    const gridClass = gridEl.getAttribute('class') || '';
    assert.ok(gridClass.includes('sm:grid-cols-2'));
    assert.ok(!gridClass.includes('lg:grid-cols-4'));
    assert.equal(gridEl.children.length, 4, 'Renders all 4 items');
    await unmount();
  });

  it('4. Each item in compact layout has fixed icon container, shrink-0 SVG, and flex-1 min-w-0 text area', async () => {
    const { container, unmount } = await renderComponent(<TrustStrip compact={true} />);
    const section = container.children[0];
    const gridEl = section.children[0];
    const items = gridEl.children;

    assert.equal(items.length, 4);

    for (let i = 0; i < items.length; i++) {
      const itemEl = items[i];
      const itemClass = itemEl.getAttribute('class') || '';
      assert.ok(itemClass.includes('flex items-center'), `Item ${i} is flex items-center`);

      // First child is icon wrapper
      const iconWrapper = itemEl.children[0];
      const iconClass = iconWrapper.getAttribute('class') || '';
      assert.ok(iconClass.includes('w-10 h-10'), `Icon wrapper ${i} has fixed w-10 h-10 size`);
      assert.ok(iconClass.includes('shrink-0'), `Icon wrapper ${i} has shrink-0 to prevent shrinking`);
      assert.ok(iconClass.includes('bg-[#EEF5F1]'), `Icon wrapper ${i} has pale green background`);
      assert.ok(iconClass.includes('text-[#123C32]'), `Icon wrapper ${i} has brand green icon color`);

      // Second child is text wrapper
      const textWrapper = itemEl.children[1];
      const textClass = textWrapper.getAttribute('class') || '';
      assert.ok(textClass.includes('min-w-0'), `Text wrapper ${i} has min-w-0 to allow natural wrap and avoid overflow`);
      assert.ok(textClass.includes('flex-1'), `Text wrapper ${i} expands to fill available column space`);

      // Heading and description checks
      const headingEl = textWrapper.children[0];
      const headingClass = headingEl.getAttribute('class') || '';
      assert.ok(headingClass.includes('font-bold'), `Heading ${i} is bold`);
      assert.ok(headingClass.includes('text-[#17201D]'), `Heading ${i} has primary text color`);
      assert.ok(headingClass.includes('leading-snug'), `Heading ${i} has leading-snug line height`);

      const descEl = textWrapper.children[1];
      const descClass = descEl.getAttribute('class') || '';
      assert.ok(descClass.includes('text-[#66736D]'), `Description ${i} has muted text color`);
      assert.ok(descClass.includes('leading-normal'), `Description ${i} has leading-normal line height`);
    }

    await unmount();
  });

  it('5. Full variant renders with 4 columns on desktop and min-w-0 text containers', async () => {
    const { container, unmount } = await renderComponent(<TrustStrip variant="full" />);
    const section = container.children[0];
    const containerDiv = section.children[0]; // Container component wrapper
    const gridEl = containerDiv.children[0];
    const gridClass = gridEl.getAttribute('class') || '';

    assert.ok(gridClass.includes('lg:grid-cols-4'), 'Full variant supports 4-column grid on desktop');
    assert.equal(gridEl.children.length, 4, 'Renders all 4 items');

    const firstItem = gridEl.children[0];
    const textWrapper = firstItem.children[1];
    const textClass = textWrapper.getAttribute('class') || '';
    assert.ok(textClass.includes('min-w-0 flex-1'), 'Full variant items also have min-w-0 flex-1 for responsiveness');

    await unmount();
  });
});

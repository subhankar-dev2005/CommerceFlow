import { useMemo } from 'react';
import { useCategories } from '../features/products/useCategories.js';
import { FOOTER_SECTIONS } from '../data/landingPage.data.js';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { categories } = useCategories();

  const dynamicCategories = useMemo(() => {
    const defaultCats = ['Camping', 'Hiking', 'Outdoors', 'Brands'];
    if (Array.isArray(categories) && categories.length > 0) {
      const active = categories.slice(0, 4).map((c) => ({
        label: typeof c === 'string' ? c : c?.name || 'Gear',
        href: `/shop?category=${encodeURIComponent(typeof c === 'string' ? c : c?.name || '')}`,
      }));
      return active;
    }
    return defaultCats.map((cat) => ({
      label: cat,
      href: cat === 'Brands' ? '/shop' : `/shop?category=${encodeURIComponent(cat)}`,
    }));
  }, [categories]);

  return (
    <footer className="bg-[#0E332B] text-[#d5e8dd] border-t border-[#123C32]" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      {/* ── Main Footer Grid ─────────────────────────────────────────── */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">

          {/* Column 1 & 2: Brand & Mission */}
          <div className="sm:col-span-2 lg:col-span-2 space-y-4">
            <a
              href="/"
              className="inline-flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg group"
              aria-label="CommerceFlow — Gear Up for Better Days"
            >
              <div className="h-10 w-10 rounded-xl bg-[#123C32] flex items-center justify-center shadow-xs group-hover:bg-[#17483B] transition-colors shrink-0">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M3 18l5-9 4 7 2-4 5 6H3z"
                  />
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-black text-white tracking-tight">CommerceFlow</span>
                <span className="text-[10px] font-semibold text-[#aed1bc] tracking-wide mt-0.5">
                  Gear Up for Better Days
                </span>
              </div>
            </a>

            <p className="text-sm text-[#aed1bc] leading-relaxed max-w-sm">
              Premium outdoor gear, reliable equipment, and everything you need for the outdoors. Engineered for trails, camps, and every journey in between.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-3 pt-2">
              {[
                { name: 'Facebook', letter: 'f' },
                { name: 'Instagram', letter: 'i' },
                { name: 'Twitter', letter: 'x' },
                { name: 'YouTube', letter: 'y' },
              ].map((social) => (
                <a
                  key={social.name}
                  href="#"
                  aria-label={`CommerceFlow on ${social.name}`}
                  className="w-8 h-8 rounded-lg bg-[#123C32] hover:bg-[#17483B] text-[#EEF5F1] hover:text-white flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
                >
                  <span className="text-xs font-bold uppercase">{social.letter}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Column 3: Quick Links */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2.5 text-sm" role="list">
              <li>
                <a href="/" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Home</a>
              </li>
              <li>
                <a href="/shop" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Shop</a>
              </li>
              <li>
                <a href="/#about" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">About</a>
              </li>
              <li>
                <a href="/#contact" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Contact</a>
              </li>
            </ul>
          </div>

          {/* Column 4: Categories */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Categories
            </h3>
            <ul className="space-y-2.5 text-sm" role="list">
              {dynamicCategories.map((cat) => (
                <li key={cat.label}>
                  <a href={cat.href} className="hover:text-white transition-colors focus:outline-none focus-visible:underline">
                    {cat.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 5: Customer Service & Stay Connected */}
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
                Customer Service
              </h3>
              <ul className="space-y-2.5 text-sm" role="list">
                <li>
                  <a href="/#help" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Help Center</a>
                </li>
                <li>
                  <a href="/#shipping" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Shipping Info</a>
                </li>
                <li>
                  <a href="/#returns" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Returns & Refunds</a>
                </li>
                <li>
                  <a href="/account/orders" className="hover:text-white transition-colors focus:outline-none focus-visible:underline">Track Order</a>
                </li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                Stay Connected
              </h3>
              <p className="text-xs text-[#aed1bc] mb-2.5">
                Join our newsletter for new gear arrivals.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  aria-label="Email address for newsletter updates"
                  disabled
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg bg-[#123C32] border border-[#17483B] text-[#d5e8dd] placeholder-[#7db49a] focus:outline-none cursor-not-allowed opacity-75"
                />
                <button
                  type="button"
                  disabled
                  aria-label="Subscribe to newsletter"
                  className="px-3 py-2 text-xs font-bold bg-[#F97316] text-white rounded-lg opacity-75 cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom Bar ───────────────────────────────────────────────── */}
      <div className="border-t border-[#123C32] bg-[#091f1a]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#7db49a] text-center sm:text-left">
            © {currentYear} CommerceFlow. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#7db49a]">
            <a href="/#privacy" className="hover:text-[#d5e8dd] transition-colors">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/#terms" className="hover:text-[#d5e8dd] transition-colors">Terms of Service</a>
            <span aria-hidden="true">·</span>
            <a href="/#sitemap" className="hover:text-[#d5e8dd] transition-colors">Sitemap</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

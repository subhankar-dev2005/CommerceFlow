import React from 'react';
import Container from './Container.jsx';
import { cn } from '../lib/utils.js';

const TRUST_ITEMS = [
  {
    id: 'shipping',
    title: 'Free Shipping',
    description: 'On orders over $50',
    icon: (
      <svg className="w-5 h-5 shrink-0 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V3.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75" />
      </svg>
    ),
  },
  {
    id: 'returns',
    title: '30-Day Returns',
    description: 'Hassle-free returns',
    icon: (
      <svg className="w-5 h-5 shrink-0 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    id: 'payment',
    title: 'Secure Payment',
    description: '100% secure checkout',
    icon: (
      <svg className="w-5 h-5 shrink-0 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    id: 'support',
    title: '24/7 Support',
    description: "We're here to help",
    icon: (
      <svg className="w-5 h-5 shrink-0 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
];

/**
 * CommerceFlow Reusable Trust Strip
 * Available in compact (for product details panel/constrained widths) and full (for home/cart/checkout full-width sections) variants.
 */
export default function TrustStrip({
  variant = 'full',
  compact = false,
  className = '',
}) {
  const isCompact = compact || variant === 'compact';

  if (isCompact) {
    return (
      <section
        aria-label="Customer service promises"
        className={cn(
          'w-full bg-white rounded-2xl border border-[#E5E9E6] shadow-xs p-3.5 sm:p-4',
          className
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-1.5 sm:p-2 rounded-xl min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-[#EEF5F1] text-[#123C32] flex items-center justify-center shrink-0 shadow-2xs">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-bold text-[#17201D] leading-snug">
                  {item.title}
                </h3>
                <p className="text-[11px] sm:text-xs text-[#66736D] leading-normal mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Customer service promises" className={cn('w-full', className)}>
      <Container>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6 bg-white rounded-2xl border border-[#E5E9E6] shadow-xs">
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3.5 p-2 rounded-xl min-w-0"
            >
              <div className="w-12 h-12 rounded-xl bg-[#EEF5F1] text-[#123C32] flex items-center justify-center shrink-0 shadow-2xs">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-[#17201D] leading-tight">
                  {item.title}
                </h3>
                <p className="text-xs text-[#66736D] mt-0.5 leading-normal">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

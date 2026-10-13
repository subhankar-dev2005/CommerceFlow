/**
 * CommerceFlow — Outdoor Brand Landing Page Data
 * All claims are factually consistent with the existing application.
 * No fake reviews, fake coupons, or invented policies.
 */

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Account', href: '/account' },
];

export const TRUST_ITEMS = [
  {
    id: 'trust-1',
    icon: 'truck',
    title: 'Free Shipping',
    description: 'On qualifying orders',
  },
  {
    id: 'trust-2',
    icon: 'shield',
    title: 'Secure Payment',
    description: '100% secure checkout',
  },
  {
    id: 'trust-3',
    icon: 'refresh',
    title: 'Easy Returns',
    description: 'Hassle-free process',
  },
  {
    id: 'trust-4',
    icon: 'support',
    title: 'Customer Support',
    description: 'We\'re here to help',
  },
];

export const PROMO_GRID_ITEMS = [
  {
    id: 'promo-1',
    eyebrow: 'Best Sellers',
    title: 'Premium Outdoor Gear Collection',
    description: 'Trusted by adventurers worldwide.',
    cta: 'Shop Best Sellers',
    href: '/shop',
    accent: 'bg-brand-800',
    size: 'large',
  },
  {
    id: 'promo-2',
    title: 'Tents & Shelters',
    description: 'Stay protected, stay comfortable.',
    cta: 'Shop Now',
    href: '/shop?category=Tents',
    size: 'small',
  },
  {
    id: 'promo-3',
    title: 'Sleeping Bags',
    description: 'Warmth for every adventure.',
    cta: 'Shop Now',
    href: '/shop?category=Sleeping+Bags',
    size: 'small',
  },
  {
    id: 'promo-4',
    title: 'Hiking Essentials',
    description: 'Gear up for the trail.',
    cta: 'Shop Now',
    href: '/shop?category=Hiking',
    size: 'small',
    accent: 'bg-brand-700',
  },
];

export const FOOTER_SECTIONS = [
  {
    title: 'Quick Links',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Shop', href: '/shop' },
      { label: 'My Account', href: '/account' },
      { label: 'My Wishlist', href: '/wishlist' },
      { label: 'Shopping Cart', href: '/cart' },
    ],
  },
  {
    title: 'Categories',
    links: [
      { label: 'All Products', href: '/shop' },
    ],
    dynamic: true, // footer will inject real categories here
  },
  {
    title: 'Customer Service',
    links: [
      { label: 'Track Order', href: '/account/orders' },
      { label: 'Order History', href: '/account/orders' },
      { label: 'Saved Addresses', href: '/account/addresses' },
      { label: 'Account Settings', href: '/account' },
    ],
  },
];

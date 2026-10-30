/* global queueMicrotask, window */
import { useState, useEffect, useRef, useCallback } from 'react';
import Container from './Container.jsx';
import { adminBannerService } from '../features/admin/adminBanner.service.js';

const FALLBACK_SLIDES = [
  {
    id: 'slide_default_1',
    eyebrow: 'OUTDOOR ESSENTIALS',
    headline: 'Gear Up for\nYour Next Adventure',
    subtext: 'Premium camping gear, reliable equipment, and everything you need for the outdoors.',
    ctaText: 'Shop Camping Gear',
    ctaHref: '/shop?category=Camping',
    badgeText: 'OUTDOOR\nESSENTIALS',
    desktopImage: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=80',
    mobileImage: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=800&q=80',
    altText: 'Outdoor camping gear and tent in scenic wilderness'
  },
  {
    id: 'slide_default_2',
    eyebrow: 'EXPLORE THE WILD',
    headline: 'Engineered for\nEvery Mountain Trail',
    subtext: 'Lightweight backpacks, durable tents, and weatherproof accessories built for resilience.',
    ctaText: 'Explore Hiking Gear',
    ctaHref: '/shop?category=Hiking',
    badgeText: 'PREMIUM\nQUALITY',
    desktopImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80',
    mobileImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    altText: 'Hikers navigating mountain trail with backpacks'
  }
];

export default function StorefrontHero() {
  const [slides, setSlides] = useState(FALLBACK_SLIDES);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      adminBannerService
        .getPublicBanners({ placement: 'hero_carousel', limit: 10 })
        .then((banners) => {
          if (!ignore && Array.isArray(banners) && banners.length > 0) {
            const mapped = banners.map((b, idx) => ({
              id: b._id || b.id || `banner_${idx}`,
              eyebrow: 'FEATURED SPOTLIGHT',
              headline: b.heading || b.title,
              subtext: b.subtitle || 'Discover curated essentials crafted for quality and resilience.',
              ctaText: b.buttonLabel || 'Explore Collection',
              ctaHref: b.destination || b.targetUrl || '/shop',
              badgeText: 'CURATED\nCOLLECTION',
              desktopImage: b.desktopImage || b.imageUrl,
              mobileImage: b.mobileImage || b.mobileImageUrl || b.desktopImage || b.imageUrl,
              altText: b.altText || b.title
            }));
            setSlides(mapped);
          }
        })
        .catch(() => {
          // Keep deliberate fallback slides on network error
        });
    });

    return () => {
      ignore = true;
    };
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  // Autoplay with pause on hover/focus and reduced motion compliance
  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 7000);

    return () => clearInterval(timer);
  }, [slides.length, isPaused]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  const activeIndex = currentSlide % slides.length;
  const slide = slides[activeIndex] || slides[0];

  return (
    <section
      ref={containerRef}
      aria-label="Promotional Carousel"
      className="w-full relative focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-[#0E332B] min-h-[460px] sm:min-h-[520px] lg:min-h-[560px] flex items-center shadow-lg">

          {/* Background Photography with responsive desktop/mobile picture */}
          <div className="absolute inset-0 z-0">
            <picture className="w-full h-full block">
              {slide.mobileImage && slide.mobileImage !== slide.desktopImage && (
                <source media="(max-width: 640px)" srcSet={slide.mobileImage} />
              )}
              <img
                src={slide.desktopImage}
                alt={slide.altText || ''}
                className="w-full h-full object-cover object-center transition-all duration-700 brightness-[0.82]"
                loading="eager"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </picture>
            {/* Cinematic Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0E332B]/95 via-[#0E332B]/75 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E332B]/80 via-transparent to-black/20 pointer-events-none" />
          </div>

          {/* Promotional Sticker Badge (top right) */}
          <div className="absolute top-6 right-6 sm:top-8 sm:right-10 z-20 pointer-events-none">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#123C32]/90 backdrop-blur-md border-2 border-dashed border-[#F97316] shadow-xl flex flex-col items-center justify-center text-center p-2 transform rotate-12">
                <span className="text-[10px] sm:text-xs font-black text-white leading-tight tracking-wider uppercase">
                  {slide.badgeText.split('\n')[0]}
                </span>
                <span className="text-[10px] sm:text-xs font-black text-[#F97316] leading-tight tracking-wider uppercase">
                  {slide.badgeText.split('\n')[1] || 'GEAR'}
                </span>
              </div>
            </div>
          </div>

          {/* Carousel Arrow Controls */}
          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous slide"
                className="absolute left-4 z-20 p-2 sm:p-2.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white hidden sm:flex items-center justify-center"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="Next slide"
                className="absolute right-4 z-20 p-2 sm:p-2.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white hidden sm:flex items-center justify-center"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </>
          )}

          {/* Hero Content */}
          <div className="relative z-10 p-6 sm:p-12 lg:p-16 max-w-2xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-4 sm:mb-6">
              <span className="w-2 h-2 rounded-full bg-[#F97316]" />
              <span className="text-[11px] sm:text-xs font-bold text-white tracking-widest uppercase">
                {slide.eyebrow}
              </span>
            </div>

            {/* Headline */}
            <h1
              id="hero-heading"
              className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.08] tracking-tight mb-4 whitespace-pre-line drop-shadow-sm"
            >
              {slide.headline}
            </h1>

            {/* Subtext */}
            <p className="text-sm sm:text-base lg:text-lg text-[#d5e8dd] leading-relaxed mb-6 sm:mb-8 max-w-lg">
              {slide.subtext}
            </p>

            {/* CTA Button */}
            <div className="flex items-center gap-4">
              <a
                href={slide.ctaHref}
                className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 bg-[#F97316] hover:bg-[#FF7A1A] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg hover:shadow-orange-500/25 transition-all duration-150 transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>{slide.ctaText}</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Slide Indicator Dots */}
          {slides.length > 1 && (
            <div
              role="tablist"
              aria-label="Slide indicators"
              className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2"
            >
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={currentSlide === idx}
                  aria-label={`Slide ${idx + 1}`}
                  onClick={() => setCurrentSlide(idx)}
                  className={`transition-all duration-200 rounded-full h-2 ${
                    currentSlide === idx ? 'w-7 bg-[#F97316]' : 'w-2 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}

        </div>
      </Container>
    </section>
  );
}

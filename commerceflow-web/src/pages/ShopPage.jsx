import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useProducts } from '../features/products/useProducts.js';
import { useCategories } from '../features/products/useCategories.js';
import Container from '../components/Container.jsx';
import ProductCard from '../components/ProductCard.jsx';
import SearchInput from '../components/SearchInput.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Button from '../components/Button.jsx';
import Badge from '../components/Badge.jsx';
import CategoryBanner from '../components/CategoryBanner.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { formatPrice } from '../lib/utils.js';

/**
 * Parse URL query parameters into standardized catalog state values.
 */
function parseCatalogUrl(searchString) {
  const queryStr =
    searchString !== undefined
      ? searchString
      : typeof window !== 'undefined'
      ? window.location.search
      : '';

  if (typeof window === 'undefined') {
    return {
      search: '',
      category: '',
      inStock: '',
      minPriceInput: '',
      maxPriceInput: '',
      minNum: undefined,
      maxNum: undefined,
      sortOption: 'createdAt-desc',
      page: 1,
    };
  }

  const sp = new window.URLSearchParams(queryStr);
  const searchVal = (sp.get('search') || '').trim();
  const categoryVal = sp.get('category') || '';
  const inStockVal = sp.get('inStock') || '';
  const minP = sp.get('minPrice');
  const maxP = sp.get('maxPrice');
  const pageNum = parseInt(sp.get('page'), 10);

  // Support both sortBy/sortOrder and legacy sort parameter
  let sortOptionVal = 'createdAt-desc';
  const sortBy = sp.get('sortBy');
  const sortOrder = sp.get('sortOrder');
  const sortParam = sp.get('sort');

  if (sortBy) {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    sortOptionVal = `${sortBy}-${order}`;
  } else if (sortParam) {
    sortOptionVal = sortParam;
  }

  const minNum = minP !== null && minP !== '' && !isNaN(Number(minP)) ? Number(minP) : undefined;
  const maxNum = maxP !== null && maxP !== '' && !isNaN(Number(maxP)) ? Number(maxP) : undefined;
  const pageVal = !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;

  return {
    search: searchVal,
    category: categoryVal,
    inStock: inStockVal === 'true' || inStockVal === 'false' ? inStockVal : '',
    minPrice: minNum,
    maxPrice: maxNum,
    minPriceInput: minP || '',
    maxPriceInput: maxP || '',
    minNum,
    maxNum,
    sortOption: sortOptionVal,
    page: pageVal,
  };
}

/**
 * Format catalog state into a readable, standardized URL query string.
 */
function createCatalogQueryString(state) {
  if (typeof window === 'undefined') return '';
  const sp = new window.URLSearchParams();
  const searchTrimmed = (state.search || '').trim();
  if (searchTrimmed) sp.set('search', searchTrimmed);

  const categoryTrimmed = (state.category || '').trim();
  if (categoryTrimmed) sp.set('category', categoryTrimmed);

  if (state.inStock === 'true' || state.inStock === 'false') {
    sp.set('inStock', state.inStock);
  }

  const minP = state.minPrice !== undefined ? state.minPrice : state.minNum;
  if (minP !== undefined && minP !== null && minP !== '') {
    sp.set('minPrice', String(minP));
  }

  const maxP = state.maxPrice !== undefined ? state.maxPrice : state.maxNum;
  if (maxP !== undefined && maxP !== null && maxP !== '') {
    sp.set('maxPrice', String(maxP));
  }

  if (state.sortOption && state.sortOption !== 'createdAt-desc') {
    const [sortBy, sortOrder] = state.sortOption.split('-');
    if (sortBy) sp.set('sortBy', sortBy);
    if (sortOrder) sp.set('sortOrder', sortOrder);
  }

  if (state.page && state.page > 1) {
    sp.set('page', String(state.page));
  }

  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Push new catalog state to browser history stack without creating duplicate entries.
 */
function pushCatalogState(nextState, lastSyncRef) {
  if (typeof window === 'undefined') return;
  const qs = createCatalogQueryString(nextState);
  const newUrl = window.location.pathname + qs;
  const currentUrl = window.location.pathname + (window.location.search || '');
  if (newUrl !== currentUrl) {
    if (lastSyncRef) {
      lastSyncRef.current = qs;
    }
    window.history.pushState(null, '', newUrl);
  }
}

export default function ShopPage({ search }) {
  // Initialize state once from initial URL search string
  const initial = useMemo(() => parseCatalogUrl(search), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter & Query States
  const [searchTerm, setSearchTerm] = useState(initial.search);
  const [activeSearch, setActiveSearch] = useState(initial.search);
  const [selectedCategory, setSelectedCategory] = useState(initial.category);
  const [inStockFilter, setInStockFilter] = useState(initial.inStock);
  const [minPriceInput, setMinPriceInput] = useState(initial.minPriceInput);
  const [maxPriceInput, setMaxPriceInput] = useState(initial.maxPriceInput);
  const [appliedPriceRange, setAppliedPriceRange] = useState({ min: initial.minNum, max: initial.maxNum });
  const [priceError, setPriceError] = useState('');
  const [sortOption, setSortOption] = useState(initial.sortOption);
  const [page, setPage] = useState(initial.page);

  // Mobile Drawer & Draft Filter State
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState(initial.category);
  const [draftInStock, setDraftInStock] = useState(initial.inStock);
  const [draftMinPriceInput, setDraftMinPriceInput] = useState(initial.minPriceInput);
  const [draftMaxPriceInput, setDraftMaxPriceInput] = useState(initial.maxPriceInput);
  const [draftPriceError, setDraftPriceError] = useState('');

  const debounceTimerRef = useRef(null);
  const lastSynchronizedSearchRef = useRef(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const filterTriggerBtnRef = useRef(null);
  const drawerCloseBtnRef = useRef(null);

  // Synchronize state when browser navigation (Back/Forward) or search prop changes
  const applyUrlToState = useCallback((searchString) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const parsed = parseCatalogUrl(searchString);
    setSearchTerm(parsed.search);
    setActiveSearch(parsed.search);
    setSelectedCategory(parsed.category);
    setInStockFilter(parsed.inStock);
    setMinPriceInput(parsed.minPriceInput);
    setMaxPriceInput(parsed.maxPriceInput);
    setAppliedPriceRange({ min: parsed.minNum, max: parsed.maxNum });
    setPriceError('');
    setSortOption(parsed.sortOption);
    setPage(parsed.page);
    lastSynchronizedSearchRef.current = searchString;
  }, []);

  // Open mobile drawer and synchronize draft values with currently committed state
  const handleOpenDrawer = () => {
    setDraftCategory(selectedCategory);
    setDraftInStock(inStockFilter);
    setDraftMinPriceInput(
      appliedPriceRange.min !== undefined ? String(appliedPriceRange.min) : minPriceInput
    );
    setDraftMaxPriceInput(
      appliedPriceRange.max !== undefined ? String(appliedPriceRange.max) : maxPriceInput
    );
    setDraftPriceError('');
    setMobileDrawerOpen(true);
  };

  // Close mobile drawer without applying changes
  const handleCloseDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
    setDraftPriceError('');
    setTimeout(() => {
      filterTriggerBtnRef.current?.focus();
    }, 50);
  }, []);

  // Handle body scroll lock, initial focus, and Escape key for mobile drawer
  useEffect(() => {
    if (!mobileDrawerOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    drawerCloseBtnRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCloseDrawer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileDrawerOpen, handleCloseDrawer]);

  // Apply draft filters from mobile drawer
  const handleApplyDrawer = (e) => {
    if (e) e.preventDefault();
    setDraftPriceError('');

    const minTrimmed = draftMinPriceInput.trim();
    const maxTrimmed = draftMaxPriceInput.trim();
    const minNum = minTrimmed !== '' ? Number(minTrimmed) : undefined;
    const maxNum = maxTrimmed !== '' ? Number(maxTrimmed) : undefined;

    if (minNum !== undefined && (isNaN(minNum) || minNum < 0)) {
      setDraftPriceError('Min price must be a positive number.');
      return;
    }
    if (maxNum !== undefined && (isNaN(maxNum) || maxNum < 0)) {
      setDraftPriceError('Max price must be a positive number.');
      return;
    }
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      setDraftPriceError('Min price cannot exceed Max price.');
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setSelectedCategory(draftCategory);
    setInStockFilter(draftInStock);
    setMinPriceInput(draftMinPriceInput);
    setMaxPriceInput(draftMaxPriceInput);
    setAppliedPriceRange({ min: minNum, max: maxNum });
    setPriceError('');
    setPage(1);

    pushCatalogState(
      {
        search: cleanSearch,
        category: draftCategory,
        inStock: draftInStock,
        minPrice: minNum,
        maxPrice: maxNum,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );

    setMobileDrawerOpen(false);
    setTimeout(() => {
      filterTriggerBtnRef.current?.focus();
    }, 50);
  };

  // Clear all filters from inside mobile drawer
  const handleDrawerClearAll = () => {
    setDraftCategory('');
    setDraftInStock('');
    setDraftMinPriceInput('');
    setDraftMaxPriceInput('');
    setDraftPriceError('');

    handleClearFilters();
    setMobileDrawerOpen(false);
    setTimeout(() => {
      filterTriggerBtnRef.current?.focus();
    }, 50);
  };

  // Listen for browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      applyUrlToState(window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyUrlToState]);

  // Synchronize if search prop changes from parent routing (e.g. anchor link click)
  useEffect(() => {
    if (search !== undefined && search !== lastSynchronizedSearchRef.current) {
      applyUrlToState(search);
    }
  }, [search, applyUrlToState]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Parse sort configuration
  const { sortBy, sortOrder } = useMemo(() => {
    const [field, order] = (sortOption || 'createdAt-desc').split('-');
    return { sortBy: field, sortOrder: order };
  }, [sortOption]);

  // Hook for categories
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();

  // Hook for products with stabilized queries
  const queryParams = useMemo(() => {
    return {
      page,
      limit: 12,
      search: activeSearch || undefined,
      category: selectedCategory || undefined,
      inStock: inStockFilter ? inStockFilter : undefined,
      minPrice: appliedPriceRange.min,
      maxPrice: appliedPriceRange.max,
      sortBy,
      sortOrder,
    };
  }, [page, activeSearch, selectedCategory, inStockFilter, appliedPriceRange, sortBy, sortOrder]);

  const { products, pagination, loading, error, refetch } = useProducts(queryParams);

  // Search input typing with 350ms debounce
  const handleSearchChange = (term) => {
    setSearchTerm(term);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Instant clear when input is emptied or whitespace-only
    if (term === '' || term.trim() === '') {
      if (activeSearch !== '') {
        setActiveSearch('');
        setPage(1);
        pushCatalogState(
          {
            search: '',
            category: selectedCategory,
            inStock: inStockFilter,
            minPrice: appliedPriceRange.min,
            maxPrice: appliedPriceRange.max,
            sortOption,
            page: 1,
          },
          lastSynchronizedSearchRef
        );
      }
      return;
    }

    // Debounce non-empty search (approx 350ms)
    debounceTimerRef.current = setTimeout(() => {
      const cleanTerm = term.trim();
      if (cleanTerm !== activeSearch) {
        setActiveSearch(cleanTerm);
        setPage(1);
        pushCatalogState(
          {
            search: cleanTerm,
            category: selectedCategory,
            inStock: inStockFilter,
            minPrice: appliedPriceRange.min,
            maxPrice: appliedPriceRange.max,
            sortOption,
            page: 1,
          },
          lastSynchronizedSearchRef
        );
      }
    }, 350);
  };

  // Immediate search submission on Enter
  const handleSearchSubmit = (term) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanTerm = (term !== undefined ? term : searchTerm).trim();
    if (cleanTerm !== activeSearch) {
      setActiveSearch(cleanTerm);
      setPage(1);
      pushCatalogState(
        {
          search: cleanTerm,
          category: selectedCategory,
          inStock: inStockFilter,
          minPrice: appliedPriceRange.min,
          maxPrice: appliedPriceRange.max,
          sortOption,
          page: 1,
        },
        lastSynchronizedSearchRef
      );
    }
  };

  // Category filter
  const handleCategorySelect = (cat) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setSelectedCategory(cat);
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: cat,
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  };

  // Stock filter
  const handleStockFilterSelect = (val) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setInStockFilter(val);
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: val,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  };

  // Apply price range
  const handleApplyPrice = (e) => {
    e.preventDefault();
    setPriceError('');

    const minNum = minPriceInput ? Number(minPriceInput) : undefined;
    const maxNum = maxPriceInput ? Number(maxPriceInput) : undefined;

    if (minNum !== undefined && (isNaN(minNum) || minNum < 0)) {
      setPriceError('Min price must be a positive number.');
      return;
    }
    if (maxNum !== undefined && (isNaN(maxNum) || maxNum < 0)) {
      setPriceError('Max price must be a positive number.');
      return;
    }
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      setPriceError('Min price cannot exceed Max price.');
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setAppliedPriceRange({ min: minNum, max: maxNum });
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: minNum,
        maxPrice: maxNum,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  };

  // Sort option change
  const handleSortChange = (newSortOption) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setSortOption(newSortOption);
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption: newSortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  };

  // Pagination change
  const handlePageChange = (newPage) => {
    setPage(newPage);
    pushCatalogState(
      {
        search: activeSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: newPage,
      },
      lastSynchronizedSearchRef
    );
  };

  // Individual filter clear handlers
  const handleClearSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchTerm('');
    setActiveSearch('');
    setPage(1);
    pushCatalogState(
      {
        search: '',
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [selectedCategory, inStockFilter, appliedPriceRange, sortOption]);

  const handleClearCategory = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setSelectedCategory('');
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: '',
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [searchTerm, inStockFilter, appliedPriceRange, sortOption]);

  const handleClearStock = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setInStockFilter('');
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: '',
        minPrice: appliedPriceRange.min,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [searchTerm, selectedCategory, appliedPriceRange, sortOption]);

  const handleClearMinPrice = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setMinPriceInput('');
    setAppliedPriceRange((prev) => ({ min: undefined, max: prev.max }));
    setPriceError('');
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: undefined,
        maxPrice: appliedPriceRange.max,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [searchTerm, selectedCategory, inStockFilter, appliedPriceRange.max, sortOption]);

  const handleClearMaxPrice = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setMaxPriceInput('');
    setAppliedPriceRange((prev) => ({ min: prev.min, max: undefined }));
    setPriceError('');
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: appliedPriceRange.min,
        maxPrice: undefined,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [searchTerm, selectedCategory, inStockFilter, appliedPriceRange.min, sortOption]);

  const handleClearPriceRange = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const cleanSearch = searchTerm.trim();
    setActiveSearch(cleanSearch);
    setMinPriceInput('');
    setMaxPriceInput('');
    setAppliedPriceRange({ min: undefined, max: undefined });
    setPriceError('');
    setPage(1);
    pushCatalogState(
      {
        search: cleanSearch,
        category: selectedCategory,
        inStock: inStockFilter,
        minPrice: undefined,
        maxPrice: undefined,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [searchTerm, selectedCategory, inStockFilter, sortOption]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchTerm('');
    setActiveSearch('');
    setSelectedCategory('');
    setInStockFilter('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setAppliedPriceRange({ min: undefined, max: undefined });
    setPriceError('');
    setPage(1);
    pushCatalogState(
      {
        search: '',
        category: '',
        inStock: '',
        minPrice: undefined,
        maxPrice: undefined,
        sortOption,
        page: 1,
      },
      lastSynchronizedSearchRef
    );
  }, [sortOption]);

  // Active filter count calculation
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeSearch) count += 1;
    if (selectedCategory) count += 1;
    if (inStockFilter === 'true' || inStockFilter === 'false') count += 1;
    if (appliedPriceRange.min !== undefined || appliedPriceRange.max !== undefined) count += 1;
    return count;
  }, [activeSearch, selectedCategory, inStockFilter, appliedPriceRange]);

  const hasActiveFilters = activeFilterCount > 0;

  // Active chips list for display and individual removal
  const activeChips = useMemo(() => {
    const chips = [];

    if (activeSearch) {
      chips.push({
        id: 'search',
        label: `Search: "${activeSearch}"`,
        ariaLabel: `Remove search filter: ${activeSearch}`,
      });
    }

    if (selectedCategory) {
      chips.push({
        id: 'category',
        label: `Category: ${selectedCategory}`,
        ariaLabel: `Remove category filter: ${selectedCategory}`,
      });
    }

    if (inStockFilter === 'true') {
      chips.push({
        id: 'stock',
        label: 'In stock',
        ariaLabel: 'Remove stock filter',
      });
    } else if (inStockFilter === 'false') {
      chips.push({
        id: 'stock',
        label: 'Out of stock',
        ariaLabel: 'Remove stock filter',
      });
    }

    const hasMin = appliedPriceRange.min !== undefined;
    const hasMax = appliedPriceRange.max !== undefined;

    if (hasMin && hasMax) {
      const minFormatted = formatPrice(appliedPriceRange.min);
      const maxFormatted = formatPrice(appliedPriceRange.max);
      chips.push({
        id: 'price',
        label: `Price: ${minFormatted} – ${maxFormatted}`,
        ariaLabel: `Remove price range filter: ${minFormatted} to ${maxFormatted}`,
      });
    } else if (hasMin) {
      const minFormatted = formatPrice(appliedPriceRange.min);
      chips.push({
        id: 'price-min',
        label: `Min: ${minFormatted}`,
        ariaLabel: `Remove minimum price filter: ${minFormatted}`,
      });
    } else if (hasMax) {
      const maxFormatted = formatPrice(appliedPriceRange.max);
      chips.push({
        id: 'price-max',
        label: `Max: ${maxFormatted}`,
        ariaLabel: `Remove maximum price filter: ${maxFormatted}`,
      });
    }

    return chips;
  }, [activeSearch, selectedCategory, inStockFilter, appliedPriceRange]);

  const handleRemoveChip = (chipId) => {
    if (chipId === 'search') {
      handleClearSearch();
    } else if (chipId === 'category') {
      handleClearCategory();
    } else if (chipId === 'stock') {
      handleClearStock();
    } else if (chipId === 'price') {
      handleClearPriceRange();
    } else if (chipId === 'price-min') {
      handleClearMinPrice();
    } else if (chipId === 'price-max') {
      handleClearMaxPrice();
    }
  };

  const bannerProps = useMemo(() => {
    if (activeSearch) {
      return {
        title: 'Search Results',
        subtitle: `Find gear for your next adventure matching "${activeSearch}".`,
        eyebrow: 'SEARCH RESULTS',
        compact: true,
      };
    }
    if (selectedCategory) {
      return {
        title: `${selectedCategory}`,
        subtitle: `Explore our ${selectedCategory.toLowerCase()} essentials engineered for comfort and resilience in the wild.`,
        eyebrow: 'OUTDOOR COLLECTION',
        compact: false,
      };
    }
    return {
      title: 'Shop Outdoor Gear',
      subtitle: 'Explore premium equipment, apparel, and trail essentials for your next adventure.',
      eyebrow: 'OUTDOOR ESSENTIALS',
      compact: false,
    };
  }, [activeSearch, selectedCategory]);

  const breadcrumbsList = useMemo(() => {
    const list = [{ label: 'Shop', href: '/shop' }];
    if (selectedCategory) {
      list.push({
        label: selectedCategory,
        href: activeSearch ? `/shop?category=${encodeURIComponent(selectedCategory)}` : undefined,
      });
    }
    if (activeSearch) {
      list.push({ label: `"${activeSearch}"` });
    }
    return list;
  }, [selectedCategory, activeSearch]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-16 sm:pb-24">
      {/* 2. Shop Hero Banner */}
      <div className="pt-4">
        <CategoryBanner
          title={bannerProps.title}
          subtitle={bannerProps.subtitle}
          eyebrow={bannerProps.eyebrow}
          compact={bannerProps.compact}
          ctaText={bannerProps.compact ? undefined : 'Explore Collection'}
          ctaHref={selectedCategory ? `/shop?category=${encodeURIComponent(selectedCategory)}` : '/shop'}
        />
      </div>

      <Container>
        {/* 3. Breadcrumbs & Header Controls */}
        <div className="mb-4 sm:mb-6 space-y-3">
          <Breadcrumbs items={breadcrumbsList} />

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#17201D]">
                {activeSearch ? 'Search Results' : selectedCategory ? `${selectedCategory} Equipment` : 'All Outdoor Gear'}
              </h1>
              <p className="text-xs sm:text-sm text-[#66736D]">
                {activeSearch && selectedCategory ? (
                  <span>
                    Showing results for <strong className="text-[#17201D] font-bold">&ldquo;{activeSearch}&rdquo;</strong> in <strong className="text-[#17201D] font-bold">{selectedCategory}</strong>
                  </span>
                ) : activeSearch ? (
                  <span>
                    Showing results for <strong className="text-[#17201D] font-bold">&ldquo;{activeSearch}&rdquo;</strong>
                  </span>
                ) : selectedCategory ? (
                  <span>
                    Explore reliable, weather-tested items in <strong className="text-[#17201D] font-bold">{selectedCategory}</strong>
                  </span>
                ) : (
                  'Discover authentic camping, hiking, and outdoor equipment built for performance.'
                )}
              </p>
            </div>

            {/* Mobile Filter Trigger Button */}
            <button
              ref={filterTriggerBtnRef}
              type="button"
              onClick={handleOpenDrawer}
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-filter-drawer"
              className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#EEF5F1] text-[#123C32] hover:bg-[#d5e8dd] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#123C32] text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Catalog Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Sidebar: Filter Controls (Desktop Only) */}
          <aside
            id="catalog-filters"
            className="hidden lg:block lg:col-span-3 space-y-6"
          >
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-6">

              <div className="flex items-center justify-between pb-3 border-b border-[#E5E9E6]">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider">Filters</h2>
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#123C32] text-white text-[10px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-bold text-[#123C32] hover:text-[#0E332B] hover:underline"
                  >
                    Reset all
                  </button>
                )}
              </div>

              {/* 1. Category Filter */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                  Category
                </label>

                {categoriesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                ) : categoriesError ? (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800 text-xs">
                    <p className="font-medium">Categories temporarily unavailable</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => handleCategorySelect('')}
                      aria-pressed={!selectedCategory}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                        !selectedCategory
                          ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                          : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategorySelect(cat)}
                        aria-pressed={selectedCategory === cat}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                          selectedCategory === cat
                            ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                            : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Stock Availability Filter */}
              <div className="space-y-3 pt-3 border-t border-[#E5E9E6]">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                  Availability
                </label>
                <div className="space-y-1">
                  {[
                    { label: 'All Items', value: '' },
                    { label: 'In Stock Only', value: 'true' },
                    { label: 'Out of Stock', value: 'false' },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleStockFilterSelect(opt.value)}
                      aria-pressed={inStockFilter === opt.value}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                        inStockFilter === opt.value
                          ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                          : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Price Filter (INR) */}
              <div className="space-y-3 pt-3 border-t border-[#E5E9E6]">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                  Price Range
                </label>

                <form onSubmit={handleApplyPrice} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={minPriceInput}
                      onChange={(e) => setMinPriceInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl text-[#17201D] placeholder-[#66736D] focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={maxPriceInput}
                      onChange={(e) => setMaxPriceInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl text-[#17201D] placeholder-[#66736D] focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                    />
                  </div>

                  {priceError && (
                    <p className="text-[11px] text-red-600 leading-tight">{priceError}</p>
                  )}

                  <Button type="submit" variant="secondary" size="sm" className="w-full py-2 text-xs font-bold">
                    Apply Price
                  </Button>
                </form>
              </div>

            </div>
          </aside>

          {/* Right Main Content: Toolbar + Chips + Product Grid */}
          <main className="lg:col-span-9 space-y-5">

            {/* Top Toolbar: Search + Sort + Count */}
            <div className="bg-white rounded-2xl border border-[#E5E9E6] p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="w-full md:max-w-xs">
                <SearchInput
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onSubmit={handleSearchSubmit}
                  size="sm"
                  placeholder="Filter by keyword..."
                  ariaLabel="Search catalog products"
                  variant="light"
                />
              </div>

              {/* Controls: Counter + Sort */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                <span className="text-[#66736D] font-medium whitespace-nowrap">
                  {loading ? (
                    activeSearch ? `Searching for "${activeSearch}"...` : 'Searching...'
                  ) : activeSearch ? (
                    <span>
                      <strong className="text-[#17201D] font-bold">{pagination.totalProducts}</strong>{' '}
                      {pagination.totalProducts === 1 ? 'result' : 'results'} for &ldquo;{activeSearch}&rdquo;
                      {selectedCategory && (
                        <span> in <strong className="text-[#17201D] font-bold">{selectedCategory}</strong></span>
                      )}
                    </span>
                  ) : selectedCategory ? (
                    <span>
                      <strong className="text-[#17201D] font-bold">{pagination.totalProducts}</strong>{' '}
                      {pagination.totalProducts === 1 ? 'product' : 'products'} in <strong className="text-[#17201D] font-bold">{selectedCategory}</strong>
                    </span>
                  ) : (
                    <span><strong className="text-[#17201D] font-bold">{pagination.totalProducts}</strong> products available</span>
                  )}
                </span>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5">
                  <label htmlFor="shop-sort" className="text-[#66736D] font-medium whitespace-nowrap">
                    Sort by:
                  </label>
                  <select
                    id="shop-sort"
                    value={sortOption}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#17201D] focus:outline-none focus:ring-1 focus:ring-[#123C32] cursor-pointer"
                  >
                    <option value="createdAt-desc">Newest Arrivals</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="name-asc">Name: A to Z</option>
                    <option value="name-desc">Name: Z to A</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {hasActiveFilters && (
              <div
                role="region"
                aria-label="Active filters"
                className="bg-[#F7F6F1] border border-[#E5E9E6] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2"
              >
                <span className="text-[11px] font-bold text-[#66736D] uppercase tracking-wider mr-1">
                  Active Filters:
                </span>

                {activeChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-xs font-bold bg-[#EEF5F1] text-[#123C32] border border-[#aed1bc] shadow-2xs"
                  >
                    <span>{chip.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChip(chip.id)}
                      aria-label={chip.ariaLabel}
                      className="p-0.5 rounded-full hover:bg-[#d5e8dd] text-[#123C32] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#123C32]"
                    >
                      <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}

                <button
                  type="button"
                  onClick={handleClearFilters}
                  aria-label="Clear all active filters"
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline transition-colors ml-auto sm:ml-2"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Error State */}
            {error && (
              <ErrorState
                title="Failed to load catalog products"
                description={error.message || 'Please check your connection and try again.'}
                onRetry={refetch}
              />
            )}

            {/* Loading Skeletons */}
            {loading && !error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-4">
                    <Skeleton className="w-full aspect-4/3" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex justify-between items-center pt-2">
                      <Skeleton className="h-5 w-1/3" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Enhanced Empty State */}
            {!loading && !error && products.length === 0 && (
              <EmptyState
                title={
                  activeSearch && selectedCategory
                    ? `No products found for "${activeSearch}" in ${selectedCategory}`
                    : activeSearch
                    ? `No products found for "${activeSearch}"`
                    : selectedCategory
                    ? `No products found in "${selectedCategory}"`
                    : 'No products match your criteria'
                }
                description={
                  activeSearch && selectedCategory
                    ? `We couldn't find any products matching "${activeSearch}" in the ${selectedCategory} category. Try clearing the search or exploring other categories.`
                    : activeSearch
                    ? hasActiveFilters && (inStockFilter || appliedPriceRange.min !== undefined || appliedPriceRange.max !== undefined)
                      ? `No items matched "${activeSearch}" within your current filter selections. Try clearing other filters or trying different keywords.`
                      : `We couldn't find any products matching "${activeSearch}". Please check your spelling or try more general keywords.`
                    : selectedCategory
                    ? hasActiveFilters && (inStockFilter || appliedPriceRange.min !== undefined || appliedPriceRange.max !== undefined)
                      ? `No items found in "${selectedCategory}" matching your additional filters. Try relaxing or clearing other filter options.`
                      : `There are currently no products listed under "${selectedCategory}". Try exploring other categories or clearing your filters.`
                    : hasActiveFilters
                    ? 'We couldn\'t find any items matching your current filters. Try relaxing or clearing some options below.'
                    : 'Our catalog currently has no products available.'
                }
                action={
                  hasActiveFilters ? (
                    <div className="flex flex-col items-center gap-3">
                      <Button variant="primary" size="sm" onClick={handleClearFilters}>
                        Clear All Filters
                      </Button>

                      {/* Quick Pill Actions */}
                      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                        {activeSearch && (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                          >
                            Clear &ldquo;{activeSearch}&rdquo;
                          </button>
                        )}
                        {selectedCategory && (
                          <button
                            type="button"
                            onClick={handleClearCategory}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                          >
                            Clear category &ldquo;{selectedCategory}&rdquo;
                          </button>
                        )}
                        {(appliedPriceRange.min !== undefined || appliedPriceRange.max !== undefined) && (
                          <button
                            type="button"
                            onClick={handleClearPriceRange}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                          >
                            Reset price range
                          </button>
                        )}
                        {inStockFilter && (
                          <button
                            type="button"
                            onClick={handleClearStock}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                          >
                            Show all stock
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null
                }
              />
            )}

            {/* Active Products Grid */}
            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={product}
                  />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && !error && pagination.totalPages > 1 && (
              <nav aria-label="Catalog pagination" className="pt-8 border-t border-[#E5E9E6] flex flex-wrap items-center justify-between gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(Math.max(page - 1, 1))}
                  className="px-4 py-2 font-bold"
                >
                  &larr; Previous
                </Button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <div key={p} className="flex items-center gap-1.5">
                          {showEllipsisBefore && (
                            <span className="text-xs text-[#66736D] px-1 select-none">...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePageChange(p)}
                            aria-current={p === page ? 'page' : undefined}
                            className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                              p === page
                                ? 'bg-[#123C32] text-white shadow-xs'
                                : 'bg-white border border-[#E5E9E6] text-[#17201D] hover:bg-[#F7F6F1]'
                            }`}
                          >
                            {p}
                          </button>
                        </div>
                      );
                    })}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => handlePageChange(Math.min(page + 1, pagination.totalPages))}
                  className="px-4 py-2 font-bold"
                >
                  Next &rarr;
                </Button>
              </nav>
            )}

          </main>
        </div>

      </Container>

      {/* 8. Reusable Bottom Promotional Banner */}
      <div className="mt-8 sm:mt-12">
        <WidePromoBanner
          title="Find Something You'll Love"
          subtitle="Explore our extended catalog of rugged camping, hiking, and outdoor trail equipment."
          ctaText="Explore Collection"
          ctaHref="/shop"
          badgeText="ALL ADVENTURES"
        />
      </div>

      {/* Mobile Filter Drawer / Sheet (Mobile Only) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#0E332B]/50 backdrop-blur-xs transition-opacity"
            onClick={handleCloseDrawer}
            aria-hidden="true"
          />

          {/* Drawer Slide-over Panel from Right */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div
              id="mobile-filter-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-filter-title"
              className="w-screen max-w-xs sm:max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            >
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-[#E5E9E6] flex items-center justify-between bg-[#F7F6F1]">
                <div className="flex items-center gap-2">
                  <h2 id="mobile-filter-title" className="text-base font-bold text-[#17201D]">
                    Filters
                  </h2>
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#123C32] text-white text-[10px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <button
                  ref={drawerCloseBtnRef}
                  type="button"
                  onClick={handleCloseDrawer}
                  aria-label="Close filters"
                  className="p-1.5 rounded-lg text-[#66736D] hover:text-[#17201D] hover:bg-[#E5E9E6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Body - Scrollable */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                {/* Category Filter */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                    Category
                  </label>
                  {categoriesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-4/5" />
                      <Skeleton className="h-6 w-3/4" />
                    </div>
                  ) : categoriesError ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800 text-xs">
                      <p className="font-medium">Categories temporarily unavailable</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setDraftCategory('')}
                        aria-pressed={!draftCategory}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                          !draftCategory
                            ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                            : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                        }`}
                      >
                        All Categories
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDraftCategory(cat)}
                          aria-pressed={draftCategory === cat}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                            draftCategory === cat
                              ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                              : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stock Availability */}
                <div className="space-y-3 pt-4 border-t border-[#E5E9E6]">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                    Availability
                  </label>
                  <div className="space-y-1">
                    {[
                      { label: 'All Items', value: '' },
                      { label: 'In Stock Only', value: 'true' },
                      { label: 'Out of Stock', value: 'false' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setDraftInStock(opt.value)}
                        aria-pressed={draftInStock === opt.value}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                          draftInStock === opt.value
                            ? 'bg-[#EEF5F1] text-[#123C32] font-bold'
                            : 'text-[#17201D] hover:bg-[#F7F6F1] font-medium'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Range */}
                <div className="space-y-3 pt-4 border-t border-[#E5E9E6]">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#17201D]">
                    Price Range
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="drawer-min-price" className="sr-only">Minimum price</label>
                      <input
                        id="drawer-min-price"
                        type="number"
                        min="0"
                        placeholder="Min"
                        value={draftMinPriceInput}
                        onChange={(e) => setDraftMinPriceInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl text-[#17201D] placeholder-[#66736D] focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                      />
                    </div>
                    <div>
                      <label htmlFor="drawer-max-price" className="sr-only">Maximum price</label>
                      <input
                        id="drawer-max-price"
                        type="number"
                        min="0"
                        placeholder="Max"
                        value={draftMaxPriceInput}
                        onChange={(e) => setDraftMaxPriceInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl text-[#17201D] placeholder-[#66736D] focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                      />
                    </div>
                  </div>
                  {draftPriceError && (
                    <p className="text-[11px] text-red-600 leading-tight">{draftPriceError}</p>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-5 py-4 border-t border-[#E5E9E6] bg-[#F7F6F1] flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleDrawerClearAll}
                  className="flex-1 text-xs font-bold"
                >
                  Clear All
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApplyDrawer}
                  className="flex-1 text-xs font-bold"
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

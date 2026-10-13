import { useState, useId } from 'react';
import { cn } from '../lib/utils.js';

/**
 * CommerceFlow search input — works on both dark (header) and light (page) backgrounds.
 */
export default function SearchInput({
  placeholder = 'Search for products, brands and more...',
  value: controlledValue,
  onChange,
  onSubmit,
  className = '',
  size = 'md',
  autoFocus = false,
  id: customId,
  ariaLabel,
  variant = 'light', // 'light' | 'dark'
}) {
  const [internalValue, setInternalValue] = useState('');
  const generatedId = useId();
  const inputId = customId || generatedId;

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (e) => {
    if (!isControlled) setInternalValue(e.target.value);
    onChange?.(e.target.value);
  };

  const handleClear = () => {
    if (!isControlled) setInternalValue('');
    onChange?.('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(value);
  };

  const sizeClasses = {
    sm: 'py-2 pl-9 pr-10 text-xs rounded-lg',
    md: 'py-2.5 pl-10 pr-12 text-sm rounded-xl',
    lg: 'py-3.5 pl-11 pr-14 text-base rounded-xl',
  };

  const accessibleLabel = ariaLabel || placeholder;

  const variantClasses = {
    light:
      'bg-[#F7F6F1] hover:bg-white focus:bg-white border border-[#E5E9E6] text-[#17201D] placeholder-[#66736D] focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]',
    dark:
      'bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40',
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label={accessibleLabel}
      className={cn('relative w-full', className)}
    >
      <label htmlFor={inputId} className="sr-only">
        {accessibleLabel}
      </label>

      {/* Left Search Icon */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none',
          variant === 'dark' ? 'text-white/70' : 'text-[#66736D]'
        )}
      >
        <svg
          className="w-4 h-4 stroke-[2]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <input
        id={inputId}
        type="search"
        value={value}
        onChange={handleChange}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={accessibleLabel}
        className={cn(
          'w-full transition-all [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          variantClasses[variant] || variantClasses.light,
          sizeClasses[size] || sizeClasses.md
        )}
      />

      {/* Right Controls (Clear & Submit) */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 gap-1">
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search query"
            className="p-1 rounded-md text-[#66736D] hover:text-[#17201D] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#123C32]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}

        <button
          type="submit"
          aria-label="Submit search"
          className="p-1.5 rounded-lg bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>
  );
}

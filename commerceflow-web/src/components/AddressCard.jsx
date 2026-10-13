import React, { useState } from 'react';
import Button from './Button.jsx';

/**
 * AddressCard Component
 * Displays user delivery address in CommerceFlow Master Design System.
 */
export default function AddressCard({
  address,
  onEdit,
  onSetDefault,
  onDelete,
  isMutating = false,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    _id,
    fullName,
    phone,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country = 'India',
    isDefault = false,
  } = address || {};

  const handleSetDefaultClick = () => {
    if (isDefault || isMutating) return;
    onSetDefault?.(_id);
  };

  const handleConfirmDeleteClick = () => {
    if (isMutating) return;
    onDelete?.(_id);
    setConfirmDelete(false);
  };

  return (
    <article
      className={`bg-white rounded-3xl border p-5 sm:p-6 transition-all duration-150 flex flex-col justify-between ${
        isDefault
          ? 'border-[#123C32] shadow-xs ring-1 ring-[#123C32]/20'
          : 'border-[#E5E9E6] shadow-2xs hover:border-[#123C32]/40'
      }`}
    >
      <div>
        {/* Card Header: Name & Default Badge */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E5E9E6] mb-3.5">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-[#17201D] truncate" title={fullName}>
              {fullName}
            </h3>
            <p className="text-xs font-medium text-[#66736D] mt-0.5">
              Phone: <span className="text-[#17201D] font-bold">{phone}</span>
            </p>
          </div>

          {isDefault && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/20 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
              Default Address
            </span>
          )}
        </div>

        {/* Address Lines */}
        <div className="text-xs sm:text-sm text-[#66736D] leading-relaxed space-y-0.5 mb-5">
          <p className="text-[#17201D] font-medium">{addressLine1}</p>
          {addressLine2 && <p>{addressLine2}</p>}
          <p>
            {city}, {state} &ndash; <span className="font-bold text-[#17201D]">{postalCode}</span>
          </p>
          <p className="text-xs text-[#66736D] font-medium pt-1">{country}</p>
        </div>
      </div>

      {/* Inline Delete Confirmation */}
      {confirmDelete ? (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 animate-fadeIn space-y-2.5">
          <p className="text-xs font-bold">
            Delete this address? This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={isMutating}
              className="py-1 px-3 text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDeleteClick}
              disabled={isMutating}
              className="py-1 px-3 text-xs bg-rose-600 hover:bg-rose-700 border-rose-600 rounded-xl"
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      ) : (
        /* Action Buttons */
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E5E9E6]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit?.(address)}
              disabled={isMutating}
              className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors focus:outline-none"
            >
              Edit
            </button>
            <span className="text-[#CDD5CF]">&bull;</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isMutating}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors focus:outline-none"
            >
              Delete
            </button>
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={handleSetDefaultClick}
              disabled={isMutating}
              className="text-xs font-bold text-[#66736D] hover:text-[#123C32] transition-colors focus:outline-none"
            >
              Set as Default
            </button>
          )}
        </div>
      )}
    </article>
  );
}

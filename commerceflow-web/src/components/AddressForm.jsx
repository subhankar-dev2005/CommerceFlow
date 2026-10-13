import { useState, useId } from 'react';
import Button from './Button.jsx';

/**
 * AddressForm Component
 * Supports both create and edit modes with responsive layout and client-side validation.
 */
export default function AddressForm({
  initialValues = {},
  mode = 'create',
  onSubmit,
  onCancel,
  isSubmitting = false,
}) {
  const isEditMode = mode === 'edit';

  const [formData, setFormData] = useState({
    fullName: initialValues.fullName || '',
    phone: initialValues.phone || '',
    addressLine1: initialValues.addressLine1 || '',
    addressLine2: initialValues.addressLine2 || '',
    city: initialValues.city || '',
    state: initialValues.state || '',
    postalCode: initialValues.postalCode || '',
    country: initialValues.country || 'India',
    isDefault: initialValues.isDefault || false,
  });

  const [fieldErrors, setFieldErrors] = useState({});

  const fullNameId = useId();
  const phoneId = useId();
  const addressLine1Id = useId();
  const addressLine2Id = useId();
  const cityId = useId();
  const stateId = useId();
  const postalCodeId = useId();
  const countryId = useId();
  const isDefaultId = useId();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const errors = {};

    const trimmedName = formData.fullName.trim();
    if (!trimmedName) {
      errors.fullName = 'Full name is required.';
    } else if (trimmedName.length < 2 || trimmedName.length > 100) {
      errors.fullName = 'Full name must be between 2 and 100 characters.';
    }

    const trimmedPhone = formData.phone.trim();
    if (!trimmedPhone) {
      errors.phone = 'Phone number is required.';
    } else if (trimmedPhone.length < 10 || trimmedPhone.length > 20) {
      errors.phone = 'Phone number must be between 10 and 20 digits.';
    }

    const trimmedLine1 = formData.addressLine1.trim();
    if (!trimmedLine1) {
      errors.addressLine1 = 'Address line 1 is required.';
    } else if (trimmedLine1.length > 200) {
      errors.addressLine1 = 'Address line 1 must not exceed 200 characters.';
    }

    const trimmedLine2 = formData.addressLine2.trim();
    if (trimmedLine2.length > 200) {
      errors.addressLine2 = 'Address line 2 must not exceed 200 characters.';
    }

    const trimmedCity = formData.city.trim();
    if (!trimmedCity) {
      errors.city = 'City is required.';
    } else if (trimmedCity.length > 100) {
      errors.city = 'City must not exceed 100 characters.';
    }

    const trimmedState = formData.state.trim();
    if (!trimmedState) {
      errors.state = 'State is required.';
    } else if (trimmedState.length > 100) {
      errors.state = 'State must not exceed 100 characters.';
    }

    const trimmedPostal = formData.postalCode.trim();
    if (!trimmedPostal) {
      errors.postalCode = 'Postal code is required.';
    } else if (trimmedPostal.length < 3 || trimmedPostal.length > 20) {
      errors.postalCode = 'Postal code must be between 3 and 20 characters.';
    }

    const trimmedCountry = formData.country.trim();
    if (!trimmedCountry) {
      errors.country = 'Country is required.';
    } else if (trimmedCountry.length > 100) {
      errors.country = 'Country must not exceed 100 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    const payload = {
      fullName: formData.fullName.trim(),
      phone: formData.phone.trim(),
      addressLine1: formData.addressLine1.trim(),
      addressLine2: formData.addressLine2.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      postalCode: formData.postalCode.trim(),
      country: formData.country.trim() || 'India',
      isDefault: Boolean(formData.isDefault),
    };

    await onSubmit?.(payload);
  };

  const inputClass = (fieldName) =>
    `w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
      fieldErrors[fieldName]
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
        : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
    }`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label htmlFor={fullNameId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id={fullNameId}
            name="fullName"
            type="text"
            value={formData.fullName}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={fieldErrors.fullName ? `${fullNameId}-error` : undefined}
            placeholder="e.g. Rahul Sharma"
            className={inputClass('fullName')}
          />
          {fieldErrors.fullName && (
            <p id={`${fullNameId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.fullName}
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor={phoneId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? `${phoneId}-error` : undefined}
            placeholder="10-digit mobile number"
            className={inputClass('phone')}
          />
          {fieldErrors.phone && (
            <p id={`${phoneId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.phone}
            </p>
          )}
        </div>
      </div>

      {/* Address Line 1 */}
      <div>
        <label htmlFor={addressLine1Id} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
          Flat, House No., Building, Street <span className="text-red-500">*</span>
        </label>
        <input
          id={addressLine1Id}
          name="addressLine1"
          type="text"
          value={formData.addressLine1}
          onChange={handleChange}
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.addressLine1)}
          aria-describedby={fieldErrors.addressLine1 ? `${addressLine1Id}-error` : undefined}
          placeholder="e.g. Flat 301, Sunshine Heights, MG Road"
          className={inputClass('addressLine1')}
        />
        {fieldErrors.addressLine1 && (
          <p id={`${addressLine1Id}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
            {fieldErrors.addressLine1}
          </p>
        )}
      </div>

      {/* Address Line 2 */}
      <div>
        <label htmlFor={addressLine2Id} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
          Area, Sector, Landmark <span className="text-slate-400 font-normal lowercase">(optional)</span>
        </label>
        <input
          id={addressLine2Id}
          name="addressLine2"
          type="text"
          value={formData.addressLine2}
          onChange={handleChange}
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.addressLine2)}
          aria-describedby={fieldErrors.addressLine2 ? `${addressLine2Id}-error` : undefined}
          placeholder="e.g. Near City Mall"
          className={inputClass('addressLine2')}
        />
        {fieldErrors.addressLine2 && (
          <p id={`${addressLine2Id}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
            {fieldErrors.addressLine2}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* City */}
        <div>
          <label htmlFor={cityId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
            City <span className="text-red-500">*</span>
          </label>
          <input
            id={cityId}
            name="city"
            type="text"
            value={formData.city}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.city)}
            aria-describedby={fieldErrors.city ? `${cityId}-error` : undefined}
            placeholder="e.g. Bengaluru"
            className={inputClass('city')}
          />
          {fieldErrors.city && (
            <p id={`${cityId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.city}
            </p>
          )}
        </div>

        {/* State */}
        <div>
          <label htmlFor={stateId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
            State <span className="text-red-500">*</span>
          </label>
          <input
            id={stateId}
            name="state"
            type="text"
            value={formData.state}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.state)}
            aria-describedby={fieldErrors.state ? `${stateId}-error` : undefined}
            placeholder="e.g. Karnataka"
            className={inputClass('state')}
          />
          {fieldErrors.state && (
            <p id={`${stateId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.state}
            </p>
          )}
        </div>

        {/* Postal Code */}
        <div>
          <label htmlFor={postalCodeId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
            PIN Code <span className="text-red-500">*</span>
          </label>
          <input
            id={postalCodeId}
            name="postalCode"
            type="text"
            value={formData.postalCode}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.postalCode)}
            aria-describedby={fieldErrors.postalCode ? `${postalCodeId}-error` : undefined}
            placeholder="6-digit PIN"
            className={inputClass('postalCode')}
          />
          {fieldErrors.postalCode && (
            <p id={`${postalCodeId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.postalCode}
            </p>
          )}
        </div>
      </div>

      {/* Country */}
      <div>
        <label htmlFor={countryId} className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
          Country <span className="text-red-500">*</span>
        </label>
        <input
          id={countryId}
          name="country"
          type="text"
          value={formData.country}
          onChange={handleChange}
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.country)}
          aria-describedby={fieldErrors.country ? `${countryId}-error` : undefined}
          className={inputClass('country')}
        />
        {fieldErrors.country && (
          <p id={`${countryId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
            {fieldErrors.country}
          </p>
        )}
      </div>

      {/* Set as Default Checkbox */}
      <div className="pt-2">
        <label htmlFor={isDefaultId} className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            id={isDefaultId}
            name="isDefault"
            type="checkbox"
            checked={formData.isDefault}
            onChange={handleChange}
            disabled={isSubmitting}
            className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500 focus:ring-2"
          />
          <span className="text-sm font-medium text-slate-700">
            Set as default delivery address
          </span>
        </label>
      </div>

      {/* Form Buttons */}
      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isEditMode ? 'Saving Changes...' : 'Saving Address...'}
            </span>
          ) : (
            isEditMode ? 'Update Address' : 'Save Address'
          )}
        </Button>
      </div>
    </form>
  );
}

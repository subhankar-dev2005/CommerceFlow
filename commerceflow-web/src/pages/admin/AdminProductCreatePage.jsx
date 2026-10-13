import { useState, useEffect, useId, useRef } from 'react';
import { adminProductService } from '../../features/admin/adminProduct.service.js';
import { getCategories, invalidateCategoriesCache } from '../../features/products/product.service.js';
import Button from '../../components/Button.jsx';
import VariantManager from '../../components/admin/VariantManager.jsx';

/**
 * Production Admin Product Creation Workflow
 * Route: /admin/products/new
 * Backend: POST /api/v1/products (admin role required)
 */
export default function AdminProductCreatePage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    image: '',
    sku: '',
  });

  const [productType, setProductType] = useState('simple'); // 'simple' | 'variant'
  const [variants, setVariants] = useState([]);
  const [switchTypeConfirmOpen, setSwitchTypeConfirmOpen] = useState(false);

  const [existingCategories, setExistingCategories] = useState([]);
  const [customCategory, setCustomCategory] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [specifications, setSpecifications] = useState([]);

  // Unsaved changes tracking
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty && !isSubmitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isSubmitting]);

  // Load existing categories
  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setExistingCategories(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'image') setImagePreviewError(false);
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    if (serverError) setServerError('');
  };

  const handleCategorySelectChange = (e) => {
    setIsDirty(true);
    const val = e.target.value;
    if (val === '__custom__') {
      setCustomCategory(true);
      setFormData((prev) => ({ ...prev, category: '' }));
    } else {
      setCustomCategory(false);
      setFormData((prev) => ({ ...prev, category: val }));
    }
    if (fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: '' }));
    }
  };

  const handleAddGalleryImage = () => {
    setIsDirty(true);
    setGalleryImages((prev) => [...prev, '']);
  };

  const handleGalleryImageChange = (index, value) => {
    setIsDirty(true);
    setGalleryImages((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (fieldErrors[`gallery_${index}`]) {
      setFieldErrors((prev) => ({ ...prev, [`gallery_${index}`]: '' }));
    }
  };

  const handleRemoveGalleryImage = (index) => {
    setIsDirty(true);
    setGalleryImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSpecification = () => {
    if (specifications.length >= 30) return;
    setIsDirty(true);
    setSpecifications((prev) => [...prev, { label: '', value: '' }]);
  };

  const handleSpecificationChange = (index, field, value) => {
    setIsDirty(true);
    setSpecifications((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveSpecification = (index) => {
    setIsDirty(true);
    setSpecifications((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductTypeToggle = (targetType) => {
    if (targetType === productType) return;
    if (targetType === 'simple' && variants.length > 0) {
      setSwitchTypeConfirmOpen(true);
    } else {
      setProductType(targetType);
      setIsDirty(true);
    }
  };

  const validate = () => {
    const errors = {};

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      errors.name = 'Product name is required.';
    } else if (trimmedName.length < 2) {
      errors.name = 'Product name must contain at least 2 characters.';
    } else if (trimmedName.length > 200) {
      errors.name = 'Product name cannot exceed 200 characters.';
    }

    const trimmedDesc = formData.description.trim();
    if (!trimmedDesc) {
      errors.description = 'Description is required.';
    } else if (trimmedDesc.length < 10) {
      errors.description = 'Description must contain at least 10 characters.';
    }

    if (formData.price === '' || formData.price === null || formData.price === undefined) {
      errors.price = 'Price is required.';
    } else {
      const p = Number(formData.price);
      if (isNaN(p) || p < 0) {
        errors.price = 'Price cannot be negative.';
      }
    }

    if (productType === 'simple') {
      if (formData.stock === '' || formData.stock === null || formData.stock === undefined) {
        errors.stock = 'Stock quantity is required for simple products.';
      } else {
        const s = Number(formData.stock);
        if (isNaN(s) || !Number.isInteger(s) || s < 0) {
          errors.stock = 'Stock must be a whole non-negative integer.';
        }
      }
    } else {
      // Variant product validation
      if (variants.length === 0) {
        errors.variants = 'Please add at least one variant or switch to Simple Product.';
      } else {
        const skuSet = new Set();
        variants.forEach((v, idx) => {
          if (!v.sku || !v.sku.trim()) {
            errors[`variant_${idx}_sku`] = 'Variant SKU is required.';
          } else {
            const cleanSku = v.sku.trim().toUpperCase();
            if (skuSet.has(cleanSku)) {
              errors[`variant_${idx}_sku`] = `Duplicate SKU '${cleanSku}' within product.`;
            }
            skuSet.add(cleanSku);
          }
          if (v.stock === '' || v.stock === null || isNaN(Number(v.stock)) || Number(v.stock) < 0) {
            errors[`variant_${idx}_stock`] = 'Valid stock is required.';
          }
        });
      }
    }

    const trimmedCategory = formData.category.trim();
    if (!trimmedCategory) {
      errors.category = 'Category is required.';
    } else if (trimmedCategory.length < 2) {
      errors.category = 'Category must contain at least 2 characters.';
    }

    const trimmedImage = formData.image.trim();
    if (trimmedImage && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmedImage)) {
      errors.image = 'Image must be a valid URL starting with http:// or https://';
    }

    galleryImages.forEach((img, idx) => {
      const trimmed = img.trim();
      if (trimmed && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
        errors[`gallery_${idx}`] = 'Each gallery image must be a valid URL.';
      }
    });

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      const firstErrorKey = Object.keys(validationErrors)[0];
      const element = document.getElementById(firstErrorKey);
      if (element) element.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      // Compute stock for payload
      const effectiveStock =
        productType === 'variant'
          ? variants
              .filter((v) => v.isActive !== false)
              .reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0)
          : parseInt(formData.stock, 10) || 0;

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        stock: effectiveStock,
        category: formData.category.trim(),
        image: formData.image.trim() || undefined,
        images: galleryImages.map((img) => img.trim()).filter(Boolean),
        specifications: specifications.filter((s) => s.label.trim() && s.value.trim()),
      };

      if (productType === 'variant' && variants.length > 0) {
        payload.variants = variants;
      }

      const created = await adminProductService.createProduct(payload);
      invalidateCategoriesCache();
      setIsDirty(false);

      // Navigate to created product details view
      window.location.href = `/admin/products/${created._id}`;
    } catch (err) {
      if (err?.status === 409 || err?.code === 'SKU_CONFLICT' || err?.message?.toLowerCase().includes('sku')) {
        setServerError('SKU already exists in the catalog. Please choose a different SKU.');
      } else {
        setServerError(err?.message || 'Failed to create product. Please check your inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedStock =
    productType === 'variant'
      ? variants
          .filter((v) => v.isActive !== false)
          .reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0)
      : parseInt(formData.stock, 10) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <a href="/admin" className="hover:text-blue-600 transition-colors">Admin</a>
            <span>&rsaquo;</span>
            <a href="/admin/products" className="hover:text-blue-600 transition-colors">Products</a>
            <span>&rsaquo;</span>
            <span className="text-slate-900 font-medium">New Product</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Create New Product
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Authoritative catalog creation with variant attributes, SKU registry constraints, and server validation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            as="a"
            href="/admin/products"
            variant="secondary"
            size="md"
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            className="min-h-[44px] font-semibold"
          >
            Save Product
          </Button>
        </div>
      </div>

      {/* Server Error Alert */}
      {serverError && (
        <div
          role="alert"
          className="p-4 rounded-xl text-xs sm:text-sm bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3"
        >
          <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="font-bold">Creation Error</h4>
            <p className="mt-0.5">{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: Product Information */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            1. Product Information
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="product-name" className="block text-xs font-semibold text-slate-800 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="product-name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Alpine 3-Season Expedition Tent"
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                  fieldErrors.name ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              {fieldErrors.name && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="product-description" className="block text-xs font-semibold text-slate-800 mb-1">
                Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="product-description"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                placeholder="Provide a comprehensive operational and storefront description..."
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                  fieldErrors.description ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              {fieldErrors.description && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="product-category" className="block text-xs font-semibold text-slate-800 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  id="product-category"
                  value={customCategory ? '__custom__' : formData.category}
                  onChange={handleCategorySelectChange}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-800"
                >
                  <option value="">Select an existing category...</option>
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__custom__">+ Enter custom category</option>
                </select>
                {customCategory && (
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="Enter new category name..."
                    className="mt-2 w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                )}
                {fieldErrors.category && (
                  <p className="text-xs text-rose-600 mt-1">{fieldErrors.category}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Pricing & Inventory */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            2. Pricing & Base Inventory
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-price" className="block text-xs font-semibold text-slate-800 mb-1">
                Base Price (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                id="product-price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={handleChange}
                placeholder="e.g. 14999"
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                  fieldErrors.price ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Acts as base storefront price and default fallback for variants without price overrides.
              </p>
              {fieldErrors.price && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.price}</p>
              )}
            </div>

            {productType === 'simple' ? (
              <div>
                <label htmlFor="product-stock" className="block text-xs font-semibold text-slate-800 mb-1">
                  Simple Product Stock <span className="text-rose-500">*</span>
                </label>
                <input
                  id="product-stock"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stock}
                  onChange={handleChange}
                  placeholder="e.g. 25"
                  className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                    fieldErrors.stock ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Authoritative inventory units available for immediate ordering.
                </p>
                {fieldErrors.stock && (
                  <p className="text-xs text-rose-600 mt-1">{fieldErrors.stock}</p>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Calculated Variant Inventory</span>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {calculatedStock} <span className="text-xs font-normal text-slate-500">units</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Aggregated automatically across all active variants.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Product Type & Variant Architecture */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                3. Product Type & Variants
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose between a standalone simple product or a multi-variant catalog structure.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleProductTypeToggle('simple')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  productType === 'simple'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simple Product
              </button>
              <button
                type="button"
                onClick={() => handleProductTypeToggle('variant')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  productType === 'variant'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Variant Product
              </button>
            </div>
          </div>

          {productType === 'variant' && (
            <div className="pt-2">
              <VariantManager
                variants={variants}
                onChange={(next) => {
                  setIsDirty(true);
                  setVariants(next);
                  if (fieldErrors.variants) {
                    setFieldErrors((prev) => ({ ...prev, variants: '' }));
                  }
                }}
                basePrice={Number(formData.price) || 0}
                baseSku={formData.sku || 'PROD'}
                disabled={isSubmitting}
              />
              {fieldErrors.variants && (
                <p className="text-xs text-rose-600 mt-2 font-medium">{fieldErrors.variants}</p>
              )}
            </div>
          )}
        </div>

        {/* SECTION 4: Media & Image Previews */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            4. Media & Gallery
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="product-primary-image" className="block text-xs font-semibold text-slate-800 mb-1">
                Primary Image URL
              </label>
              <input
                id="product-primary-image"
                name="image"
                type="url"
                value={formData.image}
                onChange={handleChange}
                placeholder="https://example.com/products/tent-main.jpg"
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                  fieldErrors.image ? 'border-rose-400' : 'border-slate-200'
                }`}
              />
              {fieldErrors.image && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.image}</p>
              )}

              {/* Primary Image Preview */}
              {formData.image && !imagePreviewError && (
                <div className="mt-2 w-32 h-32 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden p-1">
                  <img
                    src={formData.image}
                    alt="Preview"
                    onError={() => setImagePreviewError(true)}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>

            {/* Gallery Images */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Gallery Images</span>
                <button
                  type="button"
                  onClick={handleAddGalleryImage}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  + Add Gallery Image
                </button>
              </div>

              {galleryImages.map((img, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={img}
                    onChange={(e) => handleGalleryImageChange(idx, e.target.value)}
                    placeholder="https://example.com/gallery-photo.jpg"
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveGalleryImage(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                    title="Remove gallery image"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 5: Technical Specifications */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              5. Technical Specifications ({specifications.length}/30)
            </h2>
            <button
              type="button"
              onClick={handleAddSpecification}
              disabled={specifications.length >= 30}
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              + Add Specification
            </button>
          </div>

          {specifications.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No technical specifications added.</p>
          ) : (
            <div className="space-y-2">
              {specifications.map((spec, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={spec.label}
                    onChange={(e) => handleSpecificationChange(idx, 'label', e.target.value)}
                    placeholder="Label (e.g. Weight)"
                    className="w-1/3 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => handleSpecificationChange(idx, 'value', e.target.value)}
                    placeholder="Value (e.g. 2.4 kg)"
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveSpecification(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            as="a"
            href="/admin/products"
            variant="secondary"
            size="md"
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            disabled={isSubmitting}
            className="min-h-[44px] font-semibold"
          >
            Create Product
          </Button>
        </div>
      </form>

      {/* Confirmation Modal when switching from Variant to Simple */}
      {switchTypeConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Switch to Simple Product?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have <strong className="text-slate-900">{variants.length} variants</strong> entered. Switching to Simple Product will discard these variants.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="md" onClick={() => setSwitchTypeConfirmOpen(false)}>
                Keep Variants
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                onClick={() => {
                  setVariants([]);
                  setProductType('simple');
                  setSwitchTypeConfirmOpen(false);
                }}
              >
                Discard & Switch
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

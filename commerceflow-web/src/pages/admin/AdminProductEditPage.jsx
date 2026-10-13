import { useState, useEffect, useId, useCallback, useRef } from 'react';
import { adminProductService } from '../../features/admin/adminProduct.service.js';
import { getCategories, invalidateCategoriesCache } from '../../features/products/product.service.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import VariantManager from '../../components/admin/VariantManager.jsx';

/**
 * Production Admin Product Editing Workflow
 * Route: /admin/products/:id/edit
 * Backend: PATCH /api/v1/products/:id (admin role required)
 */
export default function AdminProductEditPage({ productId }) {
  const cleanId = (productId || '').trim();
  const isValidId = Boolean(cleanId && /^[0-9a-fA-F]{24}$/.test(cleanId));

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    image: '',
    isActive: true,
  });

  const [productType, setProductType] = useState('simple');
  const [variants, setVariants] = useState([]);
  const [switchTypeConfirmOpen, setSwitchTypeConfirmOpen] = useState(false);

  const [existingCategories, setExistingCategories] = useState([]);
  const [customCategory, setCustomCategory] = useState(false);
  const [loading, setLoading] = useState(isValidId);
  const [fetchError, setFetchError] = useState(!isValidId ? 'Invalid Product ID' : null);

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [specifications, setSpecifications] = useState([]);

  // Unsaved changes protection
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

  // Fetch product data
  const fetchProduct = useCallback(() => {
    if (!isValidId) return;
    setLoading(true);
    setFetchError(null);

    adminProductService
      .getProductById(cleanId)
      .then((product) => {
        if (!product) {
          setFetchError('Product not found in catalog.');
          return;
        }

        setFormData({
          name: product.name || '',
          description: product.description || '',
          price: product.price !== undefined ? String(product.price) : '',
          stock: product.stock !== undefined ? String(product.stock) : '0',
          category: product.category || '',
          image: product.image || '',
          isActive: product.isActive !== undefined ? product.isActive : true,
        });

        if (Array.isArray(product.images)) {
          setGalleryImages(product.images);
        }
        if (Array.isArray(product.specifications)) {
          setSpecifications(product.specifications);
        }

        if (Array.isArray(product.variants) && product.variants.length > 0) {
          setProductType('variant');
          setVariants(product.variants);
        } else {
          setProductType('simple');
          setVariants([]);
        }

        setIsDirty(false);
      })
      .catch((err) => {
        setFetchError(err?.message || 'Failed to retrieve product details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cleanId, isValidId]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        fetchProduct();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchProduct]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setIsDirty(true);
    const val = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
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
        errors.stock = 'Stock is required.';
      } else {
        const s = Number(formData.stock);
        if (isNaN(s) || !Number.isInteger(s) || s < 0) {
          errors.stock = 'Stock must be a whole non-negative integer.';
        }
      }
    } else {
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
        });
      }
    }

    const trimmedCategory = formData.category.trim();
    if (!trimmedCategory) {
      errors.category = 'Category is required.';
    }

    const trimmedImage = formData.image.trim();
    if (trimmedImage && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmedImage)) {
      errors.image = 'Image must be a valid URL starting with http:// or https://';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
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
        isActive: Boolean(formData.isActive),
      };

      if (productType === 'variant') {
        payload.variants = variants;
      }

      await adminProductService.updateProduct(cleanId, payload);
      invalidateCategoriesCache();
      setIsDirty(false);

      window.location.href = `/admin/products/${cleanId}`;
    } catch (err) {
      if (err?.status === 409 || err?.code === 'SKU_CONFLICT' || err?.message?.toLowerCase().includes('sku')) {
        setServerError('SKU already exists in the catalog. Please choose a different SKU.');
      } else {
        setServerError(err?.message || 'Failed to update product. Please check your inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label="Loading product editor">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <ErrorState
          title="Product Not Found"
          description={fetchError}
          onRetry={fetchProduct}
          action={
            <Button as="a" href="/admin/products" variant="secondary" size="md">
              &larr; Back to Catalog
            </Button>
          }
        />
      </div>
    );
  }

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
            <span className="text-slate-900 font-medium">Edit Product</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Edit Product
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1 select-all">
            ID: {cleanId}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            as="a"
            href={`/admin/products/${cleanId}`}
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
            Save Changes
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
            <h4 className="font-bold">Update Error</h4>
            <p className="mt-0.5">{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: Product Information */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              1. Product Information
            </h2>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <span>Catalog Active</span>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="edit-product-name" className="block text-xs font-semibold text-slate-800 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-product-name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
              {fieldErrors.name && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="edit-product-description" className="block text-xs font-semibold text-slate-800 mb-1">
                Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="edit-product-description"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
              {fieldErrors.description && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-product-category" className="block text-xs font-semibold text-slate-800 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  id="edit-product-category"
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
              <label htmlFor="edit-product-price" className="block text-xs font-semibold text-slate-800 mb-1">
                Base Price (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-product-price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
              {fieldErrors.price && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.price}</p>
              )}
            </div>

            {productType === 'simple' ? (
              <div>
                <label htmlFor="edit-product-stock" className="block text-xs font-semibold text-slate-800 mb-1">
                  Simple Product Stock <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-product-stock"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stock}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                />
                {fieldErrors.stock && (
                  <p className="text-xs text-rose-600 mt-1">{fieldErrors.stock}</p>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Calculated Variant Stock</span>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {calculatedStock} <span className="text-xs font-normal text-slate-500">units</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Product Type & Variants */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                3. Product Type & Variants
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage simple standalone configuration or variant matrix.
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
                baseSku="PROD"
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
              <label htmlFor="edit-product-primary-image" className="block text-xs font-semibold text-slate-800 mb-1">
                Primary Image URL
              </label>
              <input
                id="edit-product-primary-image"
                name="image"
                type="url"
                value={formData.image}
                onChange={handleChange}
                placeholder="https://example.com/products/tent-main.jpg"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />

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
                    placeholder="Label (e.g. Material)"
                    className="w-1/3 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => handleSpecificationChange(idx, 'value', e.target.value)}
                    placeholder="Value (e.g. Ripstop Nylon)"
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
            href={`/admin/products/${cleanId}`}
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
            Save Changes
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
              You have <strong className="text-slate-900">{variants.length} variants</strong> configured. Switching to Simple Product will remove variant associations on save.
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

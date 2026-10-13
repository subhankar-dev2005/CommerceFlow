import Brand from "./brand.model.js";
import AppError from "../../common/errors/app-error.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

/**
 * GET /api/v1/admin/brands
 * List brands with pagination, search, status filtering, and sorting.
 */
export async function getAdminBrands(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { search, status = "all", sortBy = "name", sortOrder = "asc" } = req.query;

    const filter = {};

    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    if (search && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: sanitized, $options: "i" } },
        { slug: { $regex: sanitized, $options: "i" } },
        { description: { $regex: sanitized, $options: "i" } }
      ];
    }

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sortOptions = { [sortBy]: sortDirection, _id: sortDirection };
    const skip = (page - 1) * limit;

    const [brands, totalBrands] = await Promise.all([
      Brand.find(filter).sort(sortOptions).skip(skip).limit(limit).lean(),
      Brand.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalBrands / limit) || 1;

    return res.status(200).json({
      success: true,
      message: "Admin brands retrieved successfully",
      data: {
        brands,
        pagination: {
          page,
          limit,
          totalBrands,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/brands/:id
 * Retrieve a single brand by ID.
 */
export async function getAdminBrandById(req, res, next) {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) {
      throw new AppError("Brand not found", 404, [], "BRAND_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      message: "Brand retrieved successfully",
      data: { brand },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/brands
 * Create a new brand record.
 */
export async function createAdminBrand(req, res, next) {
  try {
    const { name, slug: customSlug, description, website, logo, isActive } = req.body;

    const slug = customSlug ? customSlug.trim().toLowerCase() : generateSlug(name);

    // Uniqueness validation
    const existing = await Brand.findOne({
      $or: [
        { name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } },
        { slug }
      ]
    });

    if (existing) {
      if (existing.slug === slug) {
        throw new AppError(
          `Brand with slug '${slug}' already exists`,
          409,
          [],
          "BRAND_SLUG_CONFLICT"
        );
      }
      throw new AppError(
        `Brand with name '${name.trim()}' already exists`,
        409,
        [],
        "BRAND_NAME_CONFLICT"
      );
    }

    const brand = await Brand.create({
      name: name.trim(),
      slug,
      description: description?.trim() || "",
      website: website?.trim() || null,
      logo: logo?.trim() || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    // Audit event logging
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_CREATED,
        resourceType: "brand",
        resourceId: brand._id.toString(),
        metadata: {
          action: "BRAND_CREATED",
          brandName: brand.name,
          slug: brand.slug
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(201).json({
      success: true,
      message: `Brand '${brand.name}' created successfully`,
      data: { brand },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/brands/:id
 * Update an existing brand record.
 */
export async function updateAdminBrand(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug: customSlug, description, website, logo, isActive } = req.body;

    const brand = await Brand.findById(id);
    if (!brand) {
      throw new AppError("Brand not found", 404, [], "BRAND_NOT_FOUND");
    }

    // Check slug or name conflict with other brands
    if (name || customSlug) {
      const targetSlug = customSlug
        ? customSlug.trim().toLowerCase()
        : name
        ? generateSlug(name)
        : brand.slug;

      const conflict = await Brand.findOne({
        _id: { $ne: id },
        $or: [
          ...(name ? [{ name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } }] : []),
          { slug: targetSlug }
        ]
      });

      if (conflict) {
        throw new AppError(
          "Another brand with that name or slug already exists",
          409,
          [],
          "BRAND_CONFLICT"
        );
      }

      if (name) brand.name = name.trim();
      brand.slug = targetSlug;
    }

    if (description !== undefined) brand.description = description.trim();
    if (website !== undefined) brand.website = website ? website.trim() : null;
    if (logo !== undefined) brand.logo = logo ? logo.trim() : null;
    if (isActive !== undefined) brand.isActive = Boolean(isActive);

    await brand.save();

    // Audit log
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_UPDATED,
        resourceType: "brand",
        resourceId: brand._id.toString(),
        metadata: {
          action: "BRAND_UPDATED",
          brandName: brand.name,
          slug: brand.slug
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: `Brand '${brand.name}' updated successfully`,
      data: { brand },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/brands/:id
 * Delete or deactivate brand.
 */
export async function deleteAdminBrand(req, res, next) {
  try {
    const { id } = req.params;

    const brand = await Brand.findById(id);
    if (!brand) {
      throw new AppError("Brand not found", 404, [], "BRAND_NOT_FOUND");
    }

    await Brand.findByIdAndDelete(id);

    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_DELETED,
        resourceType: "brand",
        resourceId: id,
        metadata: {
          action: "BRAND_DELETED",
          brandName: brand.name
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: `Brand '${brand.name}' deleted successfully`,
      data: { id },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

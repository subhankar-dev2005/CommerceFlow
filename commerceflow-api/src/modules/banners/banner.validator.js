import { z } from "zod";
import {
  BANNER_PLACEMENTS,
  BANNER_STATUSES,
  BANNER_DESTINATION_TYPES,
  isValidBannerTargetUrl,
  isValidBannerImageUrl
} from "./banner.model.js";

export const bannerIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z
      .string({ required_error: "Banner ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid banner ID format")
  })
});

export const bannerFilenameParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    filename: z
      .string({ required_error: "Filename is required" })
      .regex(/^[a-zA-Z0-9_\-.]+\.(png|jpg|jpeg|webp)$/i, "Invalid banner image filename")
  })
});

export const getAdminBannersSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      search: z.string().trim().max(100).optional(),
      placement: z.enum([...BANNER_PLACEMENTS, "all"]).default("all"),
      status: z.enum([...BANNER_STATUSES, "all"]).default("all"),
      sortBy: z.enum(["displayOrder", "position", "createdAt", "updatedAt", "title"]).default("displayOrder"),
      sortOrder: z.enum(["asc", "desc"]).default("asc")
    })
    .default({})
});

export const getPublicBannersSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      placement: z.enum(BANNER_PLACEMENTS).default("hero_carousel"),
      limit: z.coerce.number().int().min(1).max(50).default(10)
    })
    .default({})
});

export const createBannerSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z
    .object({
      title: z
        .string({ required_error: "Banner title is required" })
        .trim()
        .min(2, "Banner title must contain at least 2 characters")
        .max(120, "Banner title cannot exceed 120 characters"),

      heading: z.string().trim().max(160).optional().default(""),
      subtitle: z.string().trim().max(255).optional().default(""),
      buttonLabel: z.string().trim().max(60).optional().default(""),

      placement: z.enum(BANNER_PLACEMENTS, {
        errorMap: () => ({ message: "Invalid banner placement" })
      }).default("hero_carousel"),

      imageUrl: z
        .string()
        .trim()
        .refine(isValidBannerImageUrl, "imageUrl must be a valid HTTP/HTTPS URL or safe relative storage path")
        .optional(),

      desktopImage: z
        .string()
        .trim()
        .refine(isValidBannerImageUrl, "desktopImage must be a valid HTTP/HTTPS URL or safe relative storage path")
        .optional(),

      mobileImageUrl: z
        .preprocess(
          (val) => (val === "" ? null : val),
          z.string().trim().refine(isValidBannerImageUrl, "mobileImageUrl must be a valid URL or path").optional().nullable()
        ),

      mobileImage: z
        .preprocess(
          (val) => (val === "" ? null : val),
          z.string().trim().refine(isValidBannerImageUrl, "mobileImage must be a valid URL or path").optional().nullable()
        ),

      altText: z
        .string({ required_error: "Alt text is required" })
        .trim()
        .min(3, "Alt text must contain at least 3 characters")
        .max(250, "Alt text cannot exceed 250 characters"),

      destinationType: z.enum(BANNER_DESTINATION_TYPES).default("custom_internal"),

      targetUrl: z
        .string()
        .trim()
        .refine(
          isValidBannerTargetUrl,
          "Target URL must be a valid relative path (e.g. /shop) or safe HTTP/HTTPS URL without credentials"
        )
        .optional(),

      destination: z
        .string()
        .trim()
        .refine(
          isValidBannerTargetUrl,
          "Destination must be a valid relative path (e.g. /shop) or safe HTTP/HTTPS URL without credentials"
        )
        .optional(),

      displayOrder: z.coerce.number().int().optional(),
      position: z.coerce.number().int().optional(),

      status: z.enum(BANNER_STATUSES).default("published"),

      startsAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime({ message: "startsAt must be a valid ISO datetime" }).optional().nullable()
        ),

      expiresAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime({ message: "expiresAt must be a valid ISO datetime" }).optional().nullable()
        ),

      endsAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime({ message: "endsAt must be a valid ISO datetime" }).optional().nullable()
        )
    })
    .refine(
      (data) => Boolean(data.imageUrl || data.desktopImage),
      {
        message: "Desktop banner image URL is required (provide imageUrl or desktopImage)",
        path: ["desktopImage"]
      }
    )
    .refine(
      (data) => Boolean(data.targetUrl || data.destination),
      {
        message: "Destination URL or route is required (provide targetUrl or destination)",
        path: ["destination"]
      }
    )
    .refine(
      (data) => {
        const effectiveEnd = data.endsAt || data.expiresAt;
        if (data.startsAt && effectiveEnd) {
          return new Date(data.startsAt) < new Date(effectiveEnd);
        }
        return true;
      },
      {
        message: "endsAt must be after startsAt",
        path: ["endsAt"]
      }
    )
});

export const updateBannerSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Banner ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid banner ID format")
  }),
  query: z.object({}).optional(),
  body: z
    .object({
      title: z.string().trim().min(2).max(120).optional(),
      heading: z.string().trim().max(160).optional(),
      subtitle: z.string().trim().max(255).optional(),
      buttonLabel: z.string().trim().max(60).optional(),
      placement: z.enum(BANNER_PLACEMENTS).optional(),
      imageUrl: z
        .string()
        .trim()
        .refine(isValidBannerImageUrl, "imageUrl must be a valid URL or path")
        .optional(),
      desktopImage: z
        .string()
        .trim()
        .refine(isValidBannerImageUrl, "desktopImage must be a valid URL or path")
        .optional(),
      mobileImageUrl: z
        .preprocess(
          (val) => (val === "" ? null : val),
          z.string().trim().refine(isValidBannerImageUrl, "mobileImageUrl must be a valid URL or path").optional().nullable()
        ),
      mobileImage: z
        .preprocess(
          (val) => (val === "" ? null : val),
          z.string().trim().refine(isValidBannerImageUrl, "mobileImage must be a valid URL or path").optional().nullable()
        ),
      altText: z.string().trim().min(3).max(250).optional(),
      destinationType: z.enum(BANNER_DESTINATION_TYPES).optional(),
      targetUrl: z
        .string()
        .trim()
        .refine(
          isValidBannerTargetUrl,
          "Target URL must be a valid relative path or safe HTTP/HTTPS URL without credentials"
        )
        .optional(),
      destination: z
        .string()
        .trim()
        .refine(
          isValidBannerTargetUrl,
          "Destination must be a valid relative path or safe HTTP/HTTPS URL without credentials"
        )
        .optional(),
      displayOrder: z.coerce.number().int().optional(),
      position: z.coerce.number().int().optional(),
      status: z.enum(BANNER_STATUSES).optional(),
      startsAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime().optional().nullable()
        ),
      expiresAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime().optional().nullable()
        ),
      endsAt: z
        .preprocess(
          (val) => (val === "" || val === undefined ? null : val),
          z.string().datetime().optional().nullable()
        )
    })
    .refine(
      (data) => {
        const effectiveEnd = data.endsAt || data.expiresAt;
        if (data.startsAt && effectiveEnd) {
          return new Date(data.startsAt) < new Date(effectiveEnd);
        }
        return true;
      },
      {
        message: "endsAt must be after startsAt",
        path: ["endsAt"]
      }
    )
});

export const updateBannerStatusSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Banner ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid banner ID format")
  }),
  query: z.object({}).optional(),
  body: z.object({
    status: z.enum(BANNER_STATUSES, {
      required_error: "Status is required"
    })
  })
});

export const uploadBannerImageSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Banner ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid banner ID format")
  }),
  query: z.object({}).optional(),
  body: z.object({
    image: z
      .string({ required_error: "Image payload is required" })
      .min(10, "Image payload must be a valid base64 data string")
  })
});

export const reorderBannersSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z.object({
    banners: z
      .array(
        z.object({
          id: z
            .string({ required_error: "Banner ID is required" })
            .regex(/^[0-9a-fA-F]{24}$/, "Invalid banner ID format"),
          position: z.coerce
            .number()
            .int()
            .min(1, "Position must be an integer >= 1")
        })
      )
      .min(1, "At least one banner item must be provided for reordering")
  })
});

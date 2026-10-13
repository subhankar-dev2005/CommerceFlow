# CommerceFlow API Documentation

Base URL: `/api/v1`

## Overview

CommerceFlow is a REST API for an e-commerce application. It provides user authentication, product management, cart management, order management, address management, and Razorpay payment integration.

## Authentication

Protected endpoints require a valid JWT access token.

Send the token in the request header:

``text
Authorization: Bearer <access-token>
``

The access token is returned by the login endpoint and currently expires after 20 minutes.

## Users

### Register User

**POST** `/users/register`

Creates a new customer account.

**Request body:**

``json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
``

**Success:** `201 Created`

### Login User

**POST** `/users/login`

Authenticates a user and returns a JWT access token.

**Request body:**

``json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
``

**Success:** `200 OK`

The returned access token must be sent as a Bearer token when calling protected endpoints.

## Cart

### Merge Cart

**POST** `/cart/merge`

Merges an unauthenticated guest cart into the authenticated customer's server cart after login or registration.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "items": [
    {
      "productId": "507f1f77bcf86cd799439011",
      "variantId": "var_shoe_42_black",
      "quantity": 2
    },
    {
      "productId": "507f1f77bcf86cd799439013",
      "quantity": 1
    }
  ]
}
```

**Validation constraints:**
* `items` (array, required): 1 to 30 items.
* `items[].productId` (string, required): 24-character hexadecimal MongoDB ObjectId.
* `items[].variantId` (string, optional, nullable): Optional variant identifier matching `/^var_[A-Za-z0-9_-]{1,59}$/`. Omit or set to `null` for simple products.
* `items[].quantity` (integer, required): min 1, max 99.
* Duplicate items sharing the same composite identity `(productId, variantId)` in the payload are rejected (`VALIDATION_ERROR`).
* Unsupported fields in items or top-level body are rejected.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Cart merged successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439011",
            "name": "Trail Running Shoes",
            "price": 3499,
            "stock": 20,
            "category": "Footwear",
            "image": "https://example.com/shoes.jpg",
            "isActive": true
          },
          "variantId": "var_shoe_42_black",
          "quantity": 2
        }
      ]
    },
    "totals": {
      "itemCount": 1,
      "totalQuantity": 2,
      "subtotal": 6998
    },
    "mergeReport": {
      "added": [
        {
          "productId": "507f1f77bcf86cd799439011",
          "quantity": 2
        }
      ],
      "updated": [],
      "clamped": [],
      "omitted": []
    }
  },
  "requestId": "req-123"
}
```

**Merge semantics:**
* **Composite line identity**: Items are uniquely identified by the compound tuple `(productId, variantId)`. Multiple distinct variants of the same product coexist as separate cart lines.
* **Additive quantities**: If the exact composite line already exists in the server cart, quantities are summed.
* **Stock clamping**: If the combined quantity exceeds current available inventory (`variant.stock` for variants or `product.stock` for simple products), it is clamped to available stock and reported in `mergeReport.clamped`.
* **Inactive / deleted / out-of-stock items**: Omitted from the cart and reported in `mergeReport.omitted` with reasons (`PRODUCT_INACTIVE`, `VARIANT_INACTIVE`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`, or `OUT_OF_STOCK`).
* **Server preservation**: Existing server-cart items not present in the guest cart are strictly preserved.

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (malformed payload, invalid ObjectId, invalid variantId format, non-integer quantity, duplicate composite items, or >30 items).
* `401 Unauthorized`: `AUTH_REQUIRED` (missing or invalid Bearer token).

---

### Add Item to Cart

**POST** `/cart/items`

Adds an item (simple product or variant) to the authenticated customer's cart. If an item with the identical composite identity `(productId, variantId)` already exists, its quantity is incremented.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "productId": "507f1f77bcf86cd799439011",
  "variantId": "var_tent_olive_4p",
  "quantity": 1
}
```

**Validation & Business Rules:**
* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId.
* `variantId` (string, optional, nullable): Required when the product offers variants (`VARIANT_REQUIRED`). Prohibited when the product has no variants (`PRODUCT_HAS_NO_VARIANTS`). Must match `/^var_[A-Za-z0-9_-]{1,59}$/`.
* `quantity` (integer, required): Minimum `1`.
* **Variant Resolution & Stock Guard**:
  * Product must exist and be active (`PRODUCT_NOT_FOUND`).
  * Variant must exist in product's variants array (`VARIANT_NOT_FOUND`).
  * Variant must not be deactivated (`VARIANT_INACTIVE`).
  * Requested quantity (including existing line quantity) cannot exceed available inventory (`INSUFFICIENT_STOCK`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Product added to cart successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": "507f1f77bcf86cd799439011",
          "variantId": "var_tent_olive_4p",
          "quantity": 1
        }
      ]
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR`, `VARIANT_REQUIRED`, `PRODUCT_HAS_NO_VARIANTS`, `VARIANT_INACTIVE`, `INSUFFICIENT_STOCK`.
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`.

---

### Update Cart Item Quantity

**PATCH** `/cart/items/:productId`

Updates the quantity of a specific item in the customer's cart, matching by composite identity `(productId, variantId)`.

**Authentication:** Required (`Bearer <access-token>`).

**Path parameters:**
* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId.

**Request body:**

```json
{
  "variantId": "var_tent_olive_4p",
  "quantity": 3
}
```

**Validation & Business Rules:**
* `quantity` (integer, required): Minimum `1`.
* `variantId` (string, optional, nullable): Target variant identifier. Must be provided when modifying a variant cart line.
* Stock check is performed against live inventory (`variant.stock` for variants or `product.stock` for simple products).
* Will never alter a different variant of the same product.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Cart item updated successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "items": [
        {
          "product": "507f1f77bcf86cd799439011",
          "variantId": "var_tent_olive_4p",
          "quantity": 3
        }
      ]
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR`, `VARIANT_INACTIVE`, `INSUFFICIENT_STOCK`.
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`.

---

### Remove Item from Cart

**DELETE** `/cart/items/:productId`

Removes a specific composite item from the customer's cart.

**Authentication:** Required (`Bearer <access-token>`).

**Path parameters:**
* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId.

**Query parameters:**
* `variantId` (string, optional): Target variant ID to remove (e.g. `?variantId=var_tent_olive_4p`). For simple products, omit this query parameter.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Product removed from cart successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "items": []
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`.

---

### Clear Cart

**DELETE** `/cart`

Removes all line items from the authenticated customer's cart.

**Authentication:** Required (`Bearer <access-token>`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Cart cleared successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "items": []
    }
  },
  "requestId": "req-123"
}
```

---

### Apply Coupon to Cart

**POST** `/cart/coupon`

Applies a promotional coupon to the authenticated customer's cart, evaluating eligibility hurdles, date windows, and restrictions, and returning a real-time server-calculated financial preview.

*Note: At this stage (Step 77.4), no coupon usage is consumed or reserved, and `Coupon.usedCount` is not incremented. Usage tracking is completed during order placement.*

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "couponCode": "SUMMER10"
}
```

**Validation constraints:**
* `couponCode` (string, required): 3 to 20 alphanumeric characters, hyphens, and underscores. Whitespace is trimmed and code is normalized to uppercase. (The alias `code` is also accepted).
* Strict payload: client-supplied `couponId`, `discount`, `total`, `usedCount`, or other unknown fields are rejected.

**Eligibility evaluation rules:**
1. **Coupon Existence**: Must match an existing coupon document in the database (`COUPON_NOT_FOUND`).
2. **Active State**: Coupon must be active (`isActive: true`). Inactive coupons are rejected (`COUPON_INACTIVE`).
3. **Promotion Schedule**: Rejects coupons before launch (`startsAt > now` -> `COUPON_NOT_STARTED`) or after expiry (`expiresAt < now` -> `COUPON_EXPIRED`).
4. **Global Usage Limit**: If configured, `usedCount < usageLimit` is verified (`COUPON_USAGE_LIMIT_REACHED`).
5. **Minimum Subtotal**: Cart subtotal must meet or exceed `minimumSubtotal` (`COUPON_MINIMUM_SUBTOTAL_NOT_MET`).
6. **Restrictions**:
   * If `applicableProducts` is configured, at least one eligible cart item must match (`COUPON_PRODUCT_NOT_APPLICABLE`).
   * If `applicableCategories` is configured, at least one eligible cart item must match (`COUPON_CATEGORY_NOT_APPLICABLE`).
   * When both dimensions are configured, OR semantics apply: matching either product or category satisfies eligibility.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon applied successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439011",
            "name": "Camping Tent",
            "price": 2000,
            "stock": 10,
            "category": "Camping",
            "image": "https://example.com/tent.jpg",
            "isActive": true
          },
          "variantId": "var_tent_olive_4p",
          "quantity": 1
        }
      ],
      "coupon": {
        "couponId": "507f1f77bcf86cd799439011",
        "code": "SUMMER10"
      }
    },
    "coupon": {
      "code": "SUMMER10",
      "couponId": "507f1f77bcf86cd799439011",
      "type": "percentage",
      "value": 10,
      "discountAmount": 200
    },
    "financials": {
      "subtotal": 2000,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 200,
      "total": 1800
    },
    "totals": {
      "itemCount": 1,
      "totalQuantity": 1,
      "subtotal": 2000,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 200,
      "total": 1800
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (malformed payload, invalid characters, code length, unknown fields).
* `400 Bad Request`: `CART_EMPTY` (cart contains no items or active products).
* `400 Bad Request`: `COUPON_INACTIVE` (coupon is deactivated).
* `400 Bad Request`: `COUPON_NOT_STARTED` (promotional window has not opened).
* `400 Bad Request`: `COUPON_EXPIRED` (promotional window has closed).
* `400 Bad Request`: `COUPON_USAGE_LIMIT_REACHED` (global redemption cap reached).
* `400 Bad Request`: `COUPON_MINIMUM_SUBTOTAL_NOT_MET` (subtotal below minimum requirement).
* `400 Bad Request`: `COUPON_PRODUCT_NOT_APPLICABLE` (no cart item matches product restriction).
* `400 Bad Request`: `COUPON_CATEGORY_NOT_APPLICABLE` (no cart item matches category restriction).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).
* `404 Not Found`: `COUPON_NOT_FOUND` (no coupon exists with the specified code).

---

### Remove Coupon from Cart

**DELETE** `/cart/coupon`

Removes any applied coupon reference from the authenticated customer's cart and restores baseline financial totals. This operation is safe and idempotent.

**Authentication:** Required (`Bearer <access-token>`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon removed successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [],
      "coupon": null
    },
    "coupon": null,
    "financials": {
      "subtotal": 2000,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 2000
    },
    "totals": {
      "itemCount": 1,
      "totalQuantity": 1,
      "subtotal": 2000,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 2000
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).

---

### Get Cart (with Pricing Preview & Stale Coupon Re-evaluation)

**GET** `/cart`

Retrieves the authenticated customer's cart, enriched line item views with live variant resolution, and server-authoritative financial breakdown.

**Enriched Line Item View:**
Each item in the returned `data.items` array is enriched with:
* `variantId`: string identifier or `null` for simple products.
* `_liveness`: `{ isLive: boolean, reason?: string }` (indicates whether product and variant remain active and available).
* `resolvedPrice`: server-authoritative unit price (using variant price override when set, otherwise base product price).
* `resolvedImages`: variant-specific image URLs when configured, falling back to base product images.

**Stale Coupon Policy:**
When a cart contains a stored coupon reference, the server automatically re-evaluates the coupon against the current database state and real-time active product prices. If an administrator deactivates, expires, or modifies the coupon such that cart eligibility is lost:
* The cart is returned with HTTP `200 OK`.
* The coupon is reported as invalid (`coupon.isValid: false` with the failure code and message).
* No discount is silently applied (`discountAmount: 0`, `total: subtotal`).
* The stored reference is preserved on the cart document so the customer is informed why the discount is not applying.

**Authentication:** Required (`Bearer <access-token>`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "cart": {
      "_id": "507f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439011",
            "name": "Basecamp 4-Person Tent",
            "price": 14999,
            "stock": 25,
            "category": "Camping",
            "image": "https://example.com/tent.jpg",
            "isActive": true
          },
          "variantId": "var_tent_olive_4p",
          "quantity": 1
        }
      ],
      "coupon": null
    },
    "items": [
      {
        "product": {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Basecamp 4-Person Tent",
          "price": 14999,
          "stock": 25,
          "category": "Camping",
          "image": "https://example.com/tent.jpg",
          "isActive": true
        },
        "variantId": "var_tent_olive_4p",
        "quantity": 1,
        "_liveness": {
          "isLive": true
        },
        "resolvedPrice": 16999,
        "resolvedImages": [
          "https://example.com/tent-olive.jpg"
        ]
      }
    ],
    "coupon": null,
    "financials": {
      "subtotal": 16999,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 16999
    },
    "totals": {
      "itemCount": 1,
      "totalQuantity": 1,
      "subtotal": 16999,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 16999
    }
  },
  "requestId": "req-123"
}
```

---

## Payments

### Create Payment Order

**POST** `/payments/orders/:orderId`

Creates a Razorpay payment order for an existing customer order. The payable amount is determined authoritatively by the backend using `order.total` (or `order.subtotal` for legacy orders). Client-provided amounts are never trusted or accepted.

**Authentication:** Required (`Bearer <access-token>`). The authenticated user must be the owner of the order.

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Success:** `201 Created` (when creating a new payment order) or `200 OK` (if payment order already exists)

**Response body:**

``json
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "razorpayOrderId": "order_EKwxwAgItLSgZm",
    "amount": 50000,
    "currency": "INR",
    "keyId": "YOUR_RAZORPAY_KEY_ID"
  },
  "requestId": "req-123"
}
``

**Common error codes:**
* `400 Bad Request`: `ORDER_CANCELLED`, `ORDER_ALREADY_PAID`, `INVALID_ID`
* `401 Unauthorized`: `UNAUTHORIZED`
* `404 Not Found`: `ORDER_NOT_FOUND`

### Verify Payment

**POST** `/payments/orders/:orderId/verify`

Verifies a captured payment via Razorpay signature verification and marks the order as paid. Payment verification strictly validates that `payment.amount` matches the authoritative backend order total (`order.total`, or `order.subtotal` for legacy orders).

**Authentication:** Required (`Bearer <access-token>`). The authenticated user must be the owner of the order.

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Request body:**

``json
{
  "razorpayPaymentId": "pay_29QQoUBcxrhErq",
  "razorpayOrderId": "order_EKwxwAgItLSgZm",
  "razorpaySignature": "9ef4b61642828b61e2f47c32b5e28a50f1..."
}
``

**Success:** `200 OK`

**Response body:**

``json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "orderId": "507f1f77bcf86cd799439011",
    "paymentStatus": "paid",
    "transactionId": "pay_29QQoUBcxrhErq",
    "orderStatus": "confirmed"
  },
  "requestId": "req-123"
}
``

**Common error codes:**
* `400 Bad Request`: `ORDER_CANCELLED`, `INVALID_RAZORPAY_ORDER`, `INVALID_PAYMENT_SIGNATURE`, `PAYMENT_ORDER_MISMATCH`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_NOT_CAPTURED`, `VALIDATION_ERROR`, `INVALID_ID`
* `401 Unauthorized`: `UNAUTHORIZED`
* `404 Not Found`: `ORDER_NOT_FOUND`

### Razorpay Webhook

**POST** `/payments/webhook`

Receives automated webhook event notifications directly from Razorpay (e.g. `payment.captured`).

**Authentication:** None (Public endpoint). Does NOT require user JWT authentication; authenticity is verified using HMAC-SHA256 signature verification against the configured webhook secret.

**Headers:**
* `x-razorpay-signature` (string, required): Hex digest of HMAC-SHA256 calculated over the raw request payload using the configured webhook secret.
* `Content-Type: application/json`

**Request body:**

Raw JSON event object sent by Razorpay containing `id`, `event`, and `payload.payment.entity`.

**Success:** `200 OK`

**Response body:**

``json
{
  "success": true,
  "message": "Webhook processed successfully"
}
``

*Note:* Duplicate webhook events return `200 OK` with `"message": "Webhook already processed"`. Events for non-existent orders return `200 OK` with `"message": "Webhook received"`.

**Common error codes:**
* `400 Bad Request`: `MISSING_WEBHOOK_SIGNATURE`, `MISSING_RAW_BODY`, `INVALID_WEBHOOK_SIGNATURE`, `INVALID_JSON_PAYLOAD`, `MISSING_WEBHOOK_EVENT_ID`, `ORDER_CANCELLED`, `PAYMENT_AMOUNT_MISMATCH`
* `429 Too Many Requests`: Webhook rate limit exceeded (`WEBHOOK_RATE_LIMIT` per 15-minute window)
* `500 Internal Server Error`: `WEBHOOK_SECRET_NOT_CONFIGURED`

## Admin

### List All Orders (Admin)

**GET** `/admin/orders`

Retrieves a paginated list of orders across all customers with operational filtering, exact identifier search, and deterministic sorting.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Query parameters:**
* `page` (integer, optional, default: 1): Page number (min: 1).
* `limit` (integer, optional, default: 10): Items per page (min: 1, max: 100).
* `status` (string, optional): Filter by order fulfillment status.
  * Valid values: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`.
* `paymentStatus` (string, optional): Filter by order payment status.
  * Valid values: `pending`, `paid`, `failed`, `refunded`.
* `search` (string, optional, max: 100 chars): Search by exact order identifiers:
  * 24-character hex MongoDB ObjectId (`_id`)
  * Razorpay Order ID (`payment.razorpayOrderId`, e.g. `order_...`)
  * Transaction ID (`payment.transactionId`, e.g. `pay_...`)
  * *Note:* Uncontrolled regex scans over large text fields are intentionally omitted for query performance.
* `sortBy` (string, optional, default: `createdAt`): Sort field.
  * Valid values: `createdAt`, `updatedAt`, `subtotal`, `totalQuantity`.
* `sortOrder` (string, optional, default: `desc`): Sort direction.
  * Valid values: `asc`, `desc`.
  * *Note:* A secondary tiebreaker on `_id` is always applied to guarantee deterministic pagination.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Admin orders retrieved successfully",
  "data": {
    "orders": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "user": {
          "_id": "507f1f77bcf86cd799439012",
          "name": "Jane Doe",
          "email": "jane@example.com"
        },
        "items": [
          {
            "product": "507f1f77bcf86cd799439013",
            "name": "Basecamp 4-Person Tent",
            "variantId": "var_tent_olive_4p",
            "variantName": "Olive / 4-Person",
            "sku": "TENT-OLV-4P",
            "price": 14999,
            "quantity": 1,
            "subtotal": 14999
          }
        ],
        "totalQuantity": 1,
        "subtotal": 14999,
        "shippingAmount": 0,
        "taxAmount": 0,
        "discountAmount": 0,
        "total": 14999,
        "payment": {
          "provider": "razorpay",
          "status": "paid",
          "transactionId": "pay_1234567890",
          "razorpayOrderId": "order_1234567890"
        },
        "shippingAddress": {
          "fullName": "Jane Doe",
          "phone": "+919876543210",
          "addressLine1": "123 Tech Park",
          "city": "Bengaluru",
          "state": "Karnataka",
          "postalCode": "560001",
          "country": "India"
        },
        "status": "confirmed",
        "cancellation": null,
        "createdAt": "2026-09-25T10:00:00.000Z",
        "updatedAt": "2026-09-25T10:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalOrders": 1,
      "totalPages": 1
    }
  },
  "requestId": "req-123"
}
```

**Order Item Serialization:**
Each order item exposed in the admin list includes public point-in-time snapshots:
* `product`: 24-character hexadecimal MongoDB ObjectId of parent product.
* `name`: Server-authoritative product name at time of order creation.
* `variantId`: Exact variant identifier string, or `null` for simple products.
* `variantName`: Derived variant attribute representation (e.g. `"Olive / 4-Person"`), or `null` for simple products.
* `sku`: Snapshot stock keeping unit (`SKU`) from the variant or product document, or `null` if unassigned.
* `price`: Authoritative unit purchase price (using variant price override when set, otherwise base product price).
* `quantity`: Quantity purchased.
* `subtotal`: `price * quantity`.

**Cancellation Metadata Schema:**
For any order returned in the list:
* If `status === "cancelled"`, `cancellation` contains:
  * `reason` (string, required): Standardized cancellation reason code (e.g. `customer_request`, `item_unavailable`, `fraud_suspected`, `system_checkout_failure`).
  * `reasonDetail` (string): Supplementary descriptive detail.
  * `cancelledBy` (string, required): Entity responsible for cancellation (`customer`, `admin`, or `system`).
  * `cancelledAt` (string, ISO 8601): Exact server timestamp when cancellation occurred.
* If the order is active (`pending`, `confirmed`, `processing`, `shipped`, `delivered`), `cancellation` is `null`.
* Legacy cancelled orders lacking cancellation subdocuments safely return `cancellation: null` without deserialization errors.
* Cancellation metadata is server-authoritative and read-only; client query/body parameters cannot override it.
* Internal checkout compensation tracking (`checkoutCompensation`, reservation tokens) is strictly suppressed and never exposed.

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (invalid status, paymentStatus, page, limit, or sort fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).
* `403 Forbidden`: `FORBIDDEN` (user role is `customer` instead of `admin`).

## Orders

### Order Financial Model

CommerceFlow orders maintain an authoritative, immutable financial snapshot calculated strictly on the backend:

* `subtotal` (number, required, min: 0): Sum of product line item subtotals (`price * quantity`).
* `shippingAmount` (number, required, min: 0, default: 0): Current business rule: `0`.
* `taxAmount` (number, required, min: 0, default: 0): Current business rule: `0`.
* `discountAmount` (number, required, min: 0, default: 0): Current business rule: `0`.
* `total` (number, required, min: 0, default: 0): Final authoritative payable amount (`total = subtotal + shippingAmount + taxAmount - discountAmount`). Under current business rules, `total === subtotal`.

**Key Architectural Guarantees:**
* **Server-side authority**: All financial values are calculated exclusively by the backend from database product records. Clients cannot provide authoritative totals, subtotals, or prices.
* **Price integrity**: Prices are fetched directly from MongoDB at order creation time; frontend-supplied prices and client cart prices are disregarded.
* **Tampering immunity**: Client attempts to inject `subtotal`, `shippingAmount`, `taxAmount`, `discountAmount`, or `total` in request payloads are completely ignored and stripped.
* **Payment synchronization**: Razorpay payment order creation, verification, and webhook handling strictly consume `order.total`.
* **Legacy order compatibility**: Existing historical orders created before itemized totals safely fall back to `order.subtotal` as the payable total. Missing `shippingAmount`, `taxAmount`, and `discountAmount` safely evaluate to `0`.

### Create Order

**POST** `/orders`

Creates a new customer order from active items in the authenticated customer's cart, optionally applying a promotional coupon, executing atomic inventory reservations, snapshotting point-in-time variant details, calculating server-authoritative financials, and clearing the customer's cart.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "addressId": "507f1f77bcf86cd799439011",
  "couponCode": "SUMMER10"
}
```

**Parameters & Constraints:**
* `addressId` (string, required): 24-character hexadecimal MongoDB ObjectId of a shipping address owned by the authenticated customer.
* `couponCode` (string, optional): Promotional coupon code (3 to 20 alphanumeric characters, hyphens, and underscores). Case-insensitive and trimmed.
* Strict validation: client-supplied financial amounts, subtotals, discounts, totals, prices, or line item fields are rejected or ignored.

**Variant Commerce Pipeline Guarantees (P1.6):**
1. **Live Variant Resolution**: Each line item in the customer's cart is re-verified against live catalog documents in MongoDB.
   * If a product has variants, a `variantId` must be present on the cart line (`VARIANT_REQUIRED`).
   * If a product has no variants, supplying a `variantId` is rejected (`PRODUCT_HAS_NO_VARIANTS`).
   * The variant subdocument is checked for existence (`VARIANT_NOT_FOUND`) and active status (`VARIANT_INACTIVE`).
2. **Server-Authoritative Pricing & Snapshots**:
   * Unit price is resolved as `variant.price` (when non-null and numeric) or base `product.price`.
   * The resulting order item permanently records an immutable historical snapshot:
     * `product`: parent product ObjectId
     * `name`: parent product name
     * `variantId`: exact variant identifier (or `null` for simple products)
     * `variantName`: derived attribute string (e.g. `"Olive / 4-Person"`) or `null`
     * `sku`: snapshot SKU from variant (or product)
     * `price`: server-authoritative unit price
     * `quantity`: line quantity
     * `subtotal`: `price * quantity`
3. **Atomic Inventory Reservation**:
   * For variant items: inventory is reserved by executing an atomic conditional decrement on the specific variant:
     ```javascript
     Product.findOneAndUpdate(
       {
         _id: item.product,
         isActive: true,
         variants: {
           $elemMatch: {
             variantId: item.variantId,
             isActive: { $ne: false },
             stock: { $gte: item.quantity }
           }
         }
       },
       { $inc: { "variants.$.stock": -item.quantity } },
       { returnDocument: "after" }
     )
     ```
   * For simple products: inventory is reserved on `product.stock` with `{ stock: { $gte: item.quantity } }`.
   * Multiple variants of the same product in a cart decrement their respective variant inventory pools independently.
   * Concurrency & overselling protection: MongoDB `$gte` conditional updates guarantee stock never drops below zero even under concurrent requests.
4. **Checkout Compensation & Failure Rollback**:
   * If any step during checkout fails (e.g., downstream coupon reservation failure or stock exhaustion on a subsequent line item), automated compensation rollbacks execute atomically:
     * Prior deducted variant items are restored to their exact `variants.$.stock`.
     * Prior deducted simple product items are restored to `product.stock`.
     * Unique idempotency keys (`restorationKey` in `restorationKeys` bounded array) prevent double-restoration.
     * Hard-deleted variants are safely reported and never erroneously increment root product stock.
5. **Internal Field Suppression**:
   * Internal checkout compensation tracking (`checkoutCompensation`, `restorationKeys`, `restoredItems`) is strictly internal (`select: false` and stripped via schema `toJSON`). It is never exposed in client API responses.
6. **Cart Clearing**:
   * Cart items and applied coupon references are cleared only after all reservation and order persistence operations succeed.

**Success:** `201 Created`

**Response body:**

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "_id": "607f1f77bcf86cd799439099",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": "507f1f77bcf86cd799439011",
          "name": "Basecamp 4-Person Tent",
          "variantId": "var_tent_olive_4p",
          "variantName": "Olive / 4-Person",
          "sku": "TENT-OLV-4P",
          "price": 14999,
          "quantity": 1,
          "subtotal": 14999
        }
      ],
      "totalQuantity": 1,
      "subtotal": 14999,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 1500,
      "total": 13499,
      "coupon": {
        "couponId": "507f1f77bcf86cd799439022",
        "code": "SUMMER10",
        "type": "percentage",
        "value": 10,
        "discountAmount": 1500
      },
      "payment": {
        "provider": "razorpay",
        "status": "pending",
        "transactionId": ""
      },
      "shippingAddress": {
        "fullName": "Jane Doe",
        "phone": "9876543210",
        "addressLine1": "123 Trailhead Road",
        "addressLine2": "Suite 4B",
        "city": "Bengaluru",
        "state": "Karnataka",
        "postalCode": "560001",
        "country": "India"
      },
      "status": "pending",
      "createdAt": "2026-10-01T10:00:00.000Z",
      "updatedAt": "2026-10-01T10:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (malformed payload, invalid ObjectId, invalid couponCode format, unknown fields).
* `400 Bad Request`: `CART_EMPTY` (customer cart has no items).
* `400 Bad Request`: `INSUFFICIENT_STOCK` (requested quantity exceeds variant stock or product stock).
* `400 Bad Request`: `VARIANT_REQUIRED` (cart line contains a variant-enabled product without a selected `variantId`).
* `400 Bad Request`: `PRODUCT_HAS_NO_VARIANTS` (cart line specified a `variantId` for a simple product).
* `400 Bad Request`: `VARIANT_INACTIVE` (selected product variant is deactivated).
* `400 Bad Request`: `COUPON_INACTIVE`, `COUPON_NOT_STARTED`, `COUPON_EXPIRED`, `COUPON_USAGE_LIMIT_REACHED`, `COUPON_USER_USAGE_LIMIT_REACHED`, `COUPON_MINIMUM_SUBTOTAL_NOT_MET`, `COUPON_PRODUCT_NOT_APPLICABLE`, `COUPON_CATEGORY_NOT_APPLICABLE`.
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).
* `404 Not Found`: `ADDRESS_NOT_FOUND` (shipping address does not exist or does not belong to user).
* `404 Not Found`: `PRODUCT_NOT_FOUND` (product no longer active or found in catalog).
* `404 Not Found`: `VARIANT_NOT_FOUND` (specified `variantId` does not exist on the product).
* `404 Not Found`: `COUPON_NOT_FOUND` (coupon code does not exist).

---

### List Orders (Customer)

**GET** `/orders`

Retrieves a paginated list of orders owned by the authenticated customer.

**Authentication:** Required (`Bearer <access-token>`).

**Query parameters:**
* `page` (integer, optional, default: 1): Page number (min: 1).
* `limit` (integer, optional, default: 10): Items per page (min: 1, max: 100).
* `status` (string, optional): Filter by status (`pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`).
* `sortOrder` (string, optional, default: `desc`): Sort direction by `createdAt` (`asc`, `desc`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": {
    "orders": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "user": "507f1f77bcf86cd799439012",
        "items": [
          {
            "product": "507f1f77bcf86cd799439013",
            "name": "Basecamp 4-Person Tent",
            "variantId": "var_tent_olive_4p",
            "variantName": "Olive / 4-Person",
            "sku": "TENT-OLV-4P",
            "price": 14999,
            "quantity": 1,
            "subtotal": 14999
          }
        ],
        "status": "confirmed",
        "cancellation": null,
        "totalQuantity": 1,
        "subtotal": 14999,
        "shippingAmount": 0,
        "taxAmount": 0,
        "discountAmount": 0,
        "total": 14999,
        "createdAt": "2026-10-01T10:00:00.000Z",
        "updatedAt": "2026-10-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalOrders": 1,
      "totalPages": 1
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).

---

### Get Order by ID (Customer / Admin)

**GET** `/orders/:orderId`

Retrieves detailed information for a single order by ID, including populated line-item product details and point-in-time variant snapshots. Customers may only access orders they own; administrators may inspect any order.

**Authentication:** Required (`Bearer <access-token>`).

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Success:** `200 OK`

**Response body (Cancelled Order Example):**

```json
{
  "success": true,
  "message": "Order retrieved successfully",
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439013",
            "name": "Basecamp 4-Person Tent",
            "price": 14999,
            "image": "https://example.com/tent.jpg",
            "category": "Camping"
          },
          "name": "Basecamp 4-Person Tent",
          "variantId": "var_tent_olive_4p",
          "variantName": "Olive / 4-Person",
          "sku": "TENT-OLV-4P",
          "price": 14999,
          "quantity": 1,
          "subtotal": 14999
        }
      ],
      "totalQuantity": 1,
      "subtotal": 14999,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 14999,
      "payment": {
        "provider": "razorpay",
        "status": "pending",
        "transactionId": "",
        "razorpayOrderId": ""
      },
      "shippingAddress": {
        "fullName": "Jane Doe",
        "phone": "+919876543210",
        "addressLine1": "123 Tech Park",
        "city": "Bengaluru",
        "state": "Karnataka",
        "postalCode": "560001",
        "country": "India"
      },
      "status": "cancelled",
      "cancellation": {
        "reason": "customer_request",
        "reasonDetail": "Delivery address needed to be updated",
        "cancelledBy": "customer",
        "cancelledAt": "2026-10-01T12:00:00.000Z"
      },
      "createdAt": "2026-10-01T10:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Cancellation Metadata Specifications:**
* **Active Orders**: When `status` is `pending`, `confirmed`, `processing`, `shipped`, or `delivered`, `cancellation` is `null`.
* **Cancelled Orders**: When `status` is `cancelled`, `cancellation` contains:
  * `reason` (string, required): Standardized cancellation reason code (e.g. `changed_mind`, `customer_request`, `item_unavailable`, `fraud_suspected`, `system_checkout_failure`).
  * `reasonDetail` (string): Detail message or empty string (max 500 characters).
  * `cancelledBy` (string, required): Entity initiating cancellation (`customer`, `admin`, or `system`).
  * `cancelledAt` (string, ISO 8601): Exact server timestamp when cancellation occurred.
* **Legacy Order Compatibility**: Cancelled orders created before cancellation metadata recording safely return `cancellation: null` without serialization errors.
* **Server Authority**: Cancellation metadata is strictly server-managed and read-only. Client query/body parameters cannot modify or fabricate cancellation state.
* **Internal Field Protection**: Internal checkout compensation data (`checkoutCompensation`, reservation tokens) and product restoration arrays (`restorationKeys`) are strictly suppressed and never exposed in customer or admin responses.

**Common error codes:**
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).
* `403 Forbidden`: `ORDER_ACCESS_DENIED` (customer attempts to access another user's order).
* `404 Not Found`: `ORDER_NOT_FOUND` (no order matches the provided `orderId`).

---

### Update Shipment Tracking (Admin)

**PUT** `/orders/:orderId/shipment`

Creates or updates shipment tracking information for an order.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Request body:**

```json
{
  "carrier": "Blue Dart",
  "trackingNumber": "BD123456789",
  "trackingUrl": "https://www.bluedart.com/tracking",
  "status": "in_transit",
  "estimatedDelivery": "2026-10-02T18:00:00.000Z"
}
```

**Validation constraints:**
* `carrier` (string, required): 2 to 60 characters, trimmed.
* `trackingNumber` (string, required): 3 to 100 characters, trimmed, letters/numbers and `_`, `-`, `.`, `/` only.
* `trackingUrl` (string, optional, default: `""`): Max 500 characters, trimmed, empty string allowed, must begin with `http://` or `https://` if supplied.
* `status` (string, optional, default: `in_transit`): Enum value of `label_created`, `in_transit`, `out_for_delivery`, `delivered`, or `exception`.
* `estimatedDelivery` (string, optional, nullable): Valid ISO datetime string or `null`.
* Rejects unknown body fields (clients cannot supply server-managed timestamps `shippedAt`, `deliveredAt`, `updatedAt`).
* Rejects mutation on cancelled orders: updating shipment on an order whose status is `cancelled` is strictly rejected (`ORDER_CANCELLED`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Shipment tracking updated successfully",
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "status": "processing",
      "totalQuantity": 2,
      "subtotal": 2500,
      "shippingAmount": 0,
      "taxAmount": 0,
      "discountAmount": 0,
      "total": 2500,
      "shipment": {
        "carrier": "Blue Dart",
        "trackingNumber": "BD123456789",
        "trackingUrl": "https://www.bluedart.com/tracking",
        "status": "in_transit",
        "shippedAt": "2026-09-27T12:00:00.000Z",
        "estimatedDelivery": "2026-10-02T18:00:00.000Z",
        "deliveredAt": null,
        "updatedAt": "2026-09-27T12:00:00.000Z"
      }
    }
  },
  "requestId": "req-123"
}
```

* `400 Bad Request`: `VALIDATION_ERROR` (invalid parameters, unknown fields, or client timestamps), `ORDER_CANCELLED` (order is cancelled).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED` (missing or invalid Bearer token).
* `403 Forbidden`: `ADMIN_ACCESS_REQUIRED` (user role is not `admin`).
* `404 Not Found`: `ORDER_NOT_FOUND` (no order found with specified `orderId`).

---

### Update Order Status (Admin)

**PATCH** `/orders/:orderId/status`

Transitions an order's operational fulfillment status according to the server-enforced state machine, or performs administrative order cancellation with atomic inventory restoration.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Request body (Operational Progression):**

```json
{
  "status": "processing"
}
```

**Request body (Administrative Cancellation):**

```json
{
  "status": "cancelled",
  "reason": "item_unavailable",
  "reasonDetail": "Supplier out of stock on requested item"
}
```

**Validation constraints:**
* `status` (string, required): One of `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`.
* `reason` (string, optional): One of the approved administrative cancellation reason codes:
  * `customer_request`, `item_unavailable`, `fraud_suspected`, `delivery_address_undeliverable`, `payment_dispute`, `duplicate_order`, `other`.
  * *Constraint:* `reason` can ONLY be provided when `status` is `cancelled`. Defaults to `other` if omitted during cancellation.
* `reasonDetail` (string, optional, max: 500 chars): Internal administrative note.
  * *Constraint:* `reasonDetail` can ONLY be provided when `status` is `cancelled`. Defaults to `""` if omitted during cancellation.
* Strict validation: unknown body fields are rejected. Client attempts to supply `cancelledBy` or `cancelledAt` are rejected.

**State Machine Rules:**
* `pending` &rarr; `["processing", "cancelled"]`
* `confirmed` &rarr; `["processing", "cancelled"]`
* `processing` &rarr; `["shipped", "cancelled"]`
* `shipped` &rarr; `["delivered"]`
* `delivered` &rarr; Terminal (no further transitions permitted)
* `cancelled` &rarr; Terminal (no further transitions permitted)
* Transitioning an order that is already in `shipped` or `delivered` to `cancelled` is rejected.

**Variant Inventory Restoration Guarantees (P1.6.4):**
* **Actor & Timestamp**: On transition to `cancelled`, the server unconditionally assigns `cancellation.cancelledBy = "admin"` and `cancellation.cancelledAt = new Date()`.
* **Exact Variant Stock Restoration**: For each line item with `variantId`, stock is restored directly to `variants.$.stock` via:
  ```javascript
  Product.findOneAndUpdate(
    {
      _id: item.product,
      variants: { $elemMatch: { variantId: item.variantId } }
    },
    { $inc: { "variants.$.stock": item.quantity } }
  )
  ```
* **Simple Product Restoration**: Items without `variantId` restore to root `product.stock`.
* **No Accidental Root Fallback**: If a variant subdocument was hard-deleted or is absent, restoration never erroneously increments root product stock.
* **Single-Winner Exactly-Once Concurrency**: Enforced atomically via `{ _id: orderId, status: { $in: CANCELLABLE_STATUSES } }`. Duplicate or concurrent attempts fail to match the query and are rejected with `INVALID_ORDER_STATUS_TRANSITION` without double-restoring inventory.
* **Terminal Immutability**: Once an order reaches `cancelled`, status and cancellation metadata cannot be modified or overridden.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": "507f1f77bcf86cd799439013",
          "name": "Basecamp 4-Person Tent",
          "variantId": "var_tent_olive_4p",
          "variantName": "Olive / 4-Person",
          "sku": "TENT-OLV-4P",
          "price": 14999,
          "quantity": 1,
          "subtotal": 14999
        }
      ],
      "status": "cancelled",
      "totalQuantity": 1,
      "subtotal": 14999,
      "cancellation": {
        "reason": "item_unavailable",
        "reasonDetail": "Supplier out of stock on requested item",
        "cancelledBy": "admin",
        "cancelledAt": "2026-10-06T12:00:00.000Z"
      },
      "updatedAt": "2026-10-06T12:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (invalid status, unexpected fields, reason supplied for non-cancelled status), `INVALID_ORDER_STATUS_TRANSITION` (attempted disallowed status jump), `ORDER_ALREADY_CANCELLED` (order already cancelled).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `ADMIN_ACCESS_REQUIRED`.
* `404 Not Found`: `ORDER_NOT_FOUND`.

---

### Cancel Order (Customer)

**PATCH** `/orders/:orderId/cancel`

Allows an authenticated customer to cancel their own order prior to dispatch (`pending`, `confirmed`, or `processing`), triggering atomic inventory restoration and recording customer cancellation metadata.

**Authentication:** Required (`Bearer <access-token>`). User must own the order.

**Path parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the order.

**Request body:**

```json
{
  "reason": "changed_mind",
  "reasonDetail": "Found another alternative item"
}
```

**Validation constraints:**
* `reason` (string, optional, default: `"other"`): One of the approved customer reason codes:
  * `changed_mind`, `ordered_by_mistake`, `found_better_price`, `delivery_too_slow`, `payment_issue`, `other`.
* `reasonDetail` (string, optional, default: `""`, max: 500 chars): Optional explanation.
* Strict validation: unknown body fields are rejected.

**Lifecycle Invariants & Variant Stock Restoration (P1.6.4):**
* **Eligibility**: Orders in `shipped` or `delivered` state cannot be cancelled (`ORDER_CANNOT_BE_CANCELLED`).
* **Actor & Timestamp**: The backend unconditionally records `cancelledBy: "customer"` and `cancelledAt: new Date()`.
* **Exact Variant Stock Restoration**: For each line item with `variantId`, stock is restored directly to `variants.$.stock`. For simple product lines, stock is restored to `product.stock`.
* **Exactly-Once Semantics**: Database conditional transition `{ _id: orderId, user: req.user._id, status: { $nin: ["delivered", "cancelled"] } }` guarantees that concurrent or duplicate requests return `ORDER_ALREADY_CANCELLED` without duplicate stock restorations.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "items": [
        {
          "product": "507f1f77bcf86cd799439013",
          "name": "Basecamp 4-Person Tent",
          "variantId": "var_tent_olive_4p",
          "variantName": "Olive / 4-Person",
          "sku": "TENT-OLV-4P",
          "price": 14999,
          "quantity": 1,
          "subtotal": 14999
        }
      ],
      "status": "cancelled",
      "cancellation": {
        "reason": "changed_mind",
        "reasonDetail": "Found another alternative item",
        "cancelledBy": "customer",
        "cancelledAt": "2026-10-06T12:00:00.000Z"
      }
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR`, `ORDER_CANNOT_BE_CANCELLED` (order already shipped or delivered), `ORDER_ALREADY_CANCELLED`.
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `ORDER_ACCESS_DENIED` (attempt to cancel another customer's order).
* `404 Not Found`: `ORDER_NOT_FOUND`.

## Wishlist

Customer wishlist. Authentication is required for every endpoint.

The wishlist stores product references only — no prices, stock, names, or financial data are persisted. Product data is always read live from the product catalogue on every GET request.

### Get Wishlist

**GET** `/wishlist`

Returns the authenticated user's wishlist with current product data.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:** None.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Wishlist retrieved successfully",
  "data": {
    "items": [
      {
        "addedAt": "2026-09-28T12:00:00.000Z",
        "product": {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Wireless Headphones",
          "price": 2999,
          "stock": 0,
          "category": "Electronics",
          "image": "https://example.com/product.jpg",
          "images": [],
          "isActive": true
        }
      }
    ],
    "totalItems": 1
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* Items are ordered newest-first by `addedAt`.
* Products where `isActive: false` are silently excluded from the response. The underlying `WishlistItem` record is retained and will reappear if the product is reactivated.
* Products that no longer exist in the database are silently excluded.
* Out-of-stock products (`stock: 0`) are included. The wishlist is a "save for later" feature; stock availability is informational.

**Common error codes:**

* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

### Add Wishlist Item

**POST** `/wishlist/items`

Adds an active product to the authenticated user's wishlist.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "productId": "507f1f77bcf86cd799439011"
}
```

**Field rules:**

* `productId` — required, must be a 24-character hexadecimal MongoDB ObjectId.
* No other fields are accepted (strict validation).
* No `userId`, `quantity`, `price`, or product metadata fields.

**Success:** `201 Created`

```json
{
  "success": true,
  "message": "Product added to wishlist",
  "data": {
    "item": {
      "product": "507f1f77bcf86cd799439011",
      "addedAt": "2026-09-28T12:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* Out-of-stock (`stock: 0`) products may be wishlisted. Stock is not required.
* If the product does not exist or is inactive (`isActive: false`), the request is rejected with `PRODUCT_NOT_FOUND`.
* If the product is already in the wishlist, the request is rejected with `WISHLIST_ITEM_EXISTS` (409). The frontend should treat this as a toggle signal.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed `productId`, unknown fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `PRODUCT_NOT_FOUND` (product does not exist or is inactive).
* `409 Conflict`: `WISHLIST_ITEM_EXISTS` (product is already in the wishlist).

---

### Remove Wishlist Item

**DELETE** `/wishlist/items/:productId`

Removes a specific product from the authenticated user's wishlist.

**Authentication:** Required (`Bearer <access-token>`).

**Route parameter:**

* `:productId` — 24-character hexadecimal MongoDB ObjectId of the product to remove.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Product removed from wishlist",
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Idempotent.** If the product is not in the wishlist, `200 OK` is still returned. This prevents unnecessary client-side retry logic.
* The product document does not need to exist. Removing the wishlist reference for a deleted or inactive product succeeds.
* A user can only remove items from their own wishlist. The user ID is always taken from the authenticated session — never from the request.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed `:productId` parameter).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

### Clear Wishlist

**DELETE** `/wishlist`

Removes all items from the authenticated user's wishlist.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:** None.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Wishlist cleared",
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Idempotent.** Clearing an already-empty wishlist returns `200 OK`.
* Only the authenticated user's items are deleted. Other users' wishlists are unaffected.

**Common error codes:**

* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

## Recently Viewed Products

Tracks customer browsing history across catalog products. Authentication is required for every endpoint.

Recently viewed records maintain a single authoritative reference per product per customer, deduplicated and updated atomically. Referenced product data is populated live on retrieval.

### Record Product View

**POST** `/recently-viewed`

Records a customer view for an active catalog product, or updates its viewing timestamp if previously viewed.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "productId": "507f1f77bcf86cd799439011"
}
```

**Field rules:**

* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId.
* Strict body validation: Unknown or client-supplied fields (such as `userId` or `viewedAt`) are rejected with `VALIDATION_ERROR`.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Product view recorded successfully",
  "data": {
    "productId": "507f1f77bcf86cd799439011",
    "viewedAt": "2026-10-12T10:00:00.000Z"
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Active Product Requirement:** The product must exist and be active (`isActive: true`). Inactive or non-existent products return `404 Not Found` (`PRODUCT_NOT_FOUND`).
* **Inventory State:** Out-of-stock active products (`stock: 0`) may be viewed and recorded.
* **Atomic Upsert & Deduplication:** The compound unique index on `{ user: 1, product: 1 }` guarantees atomic deduplication. Repeated views update `viewedAt` to the current timestamp.
* **Bounded History Storage:** Retains a maximum of 12 stored records per customer (`MAX_STORED_RECENTLY_VIEWED = 12`). Older surplus records are automatically pruned.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (missing or malformed `productId`, unsupported fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `PRODUCT_NOT_FOUND` (product does not exist or is inactive).

---

### Get Recently Viewed Products

**GET** `/recently-viewed`

Retrieves the authenticated user's recently viewed products with live catalog details.

**Authentication:** Required (`Bearer <access-token>`).

**Query parameters:**

* `limit` (integer, optional, default: 10): Maximum items to return (min: 1, max: 20).

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Recently viewed products retrieved successfully",
  "data": {
    "items": [
      {
        "viewedAt": "2026-10-12T10:00:00.000Z",
        "product": {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Basecamp 4-Person Tent",
          "price": 14999,
          "stock": 25,
          "category": "Camping",
          "image": "https://example.com/tent.jpg",
          "images": ["https://example.com/tent.jpg"],
          "isActive": true,
          "ratingAverage": 4.8,
          "ratingCount": 12
        }
      }
    ],
    "totalItems": 1
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **User Isolation:** Strictly scoped to the authenticated customer's session (`req.user._id`). Injected query parameters such as `userId` are ignored.
* **Ordering:** Items are returned newest-first sorted by `viewedAt` descending.
* **Side-Effect-Free Read:** Inactive (`isActive: false`) or deleted products are filtered out in memory from the response.
* **TTL Lifecycle:** Inactive viewing records automatically expire after 30 days via a MongoDB TTL index on `viewedAt`.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (invalid `limit`, e.g., `< 1` or `> 20`).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

### Clear Recently Viewed History

**DELETE** `/recently-viewed`

Clears all recently viewed history for the authenticated user.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:** None.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Recently viewed history cleared successfully",
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Idempotent:** Clearing an already-empty history returns `200 OK`.
* **Strict Ownership:** Deletion is strictly scoped to the authenticated user (`req.user._id`). Other customers' browsing histories are never affected.

**Common error codes:**

* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

### Merge Guest Recently Viewed History

**POST** `/recently-viewed/merge`

Synchronizes client-side guest browsing history into the customer's account upon login or registration.

**Authentication:** Required (`Bearer <access-token>`).

**Request body:**

```json
{
  "productIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012"
  ]
}
```

**Field rules:**

* `productIds` (array of strings, required): Array of 1 to 12 product IDs (`min: 1, max: 12`).
* `productIds[]`: Each element must be a 24-character hexadecimal MongoDB ObjectId.
* Strict body validation: Unsupported fields are rejected with `VALIDATION_ERROR`.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Recently viewed products merged successfully",
  "data": {
    "mergedCount": 2
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Preserves Browsing Order:** Guest product IDs are deduplicated preserving array order, assigning decreasing timestamps so the first element remains the most recent view.
* **Catalog Validation:** Verifies that referenced products exist and are active (`isActive: true`). Inactive or non-existent product IDs are filtered out.
* **Bounded Storage:** Enforces the 12-item ceiling (`MAX_STORED_RECENTLY_VIEWED = 12`), pruning surplus older records.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (empty `productIds`, exceeding 12 items, malformed IDs, unsupported fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.

---

## Admin Coupons

All endpoints under `/admin/coupons` are strictly restricted to authenticated users with the `admin` role.

### Create Coupon

**POST** `/admin/coupons`

Creates a new promotional discount coupon configuration.

**Authentication:** Required (`Bearer <access-token>`). Must have `admin` role.

**Request body:**

```json
{
  "code": "TRAIL20",
  "type": "percentage",
  "value": 20,
  "minimumSubtotal": 1000,
  "maximumDiscount": 500,
  "startsAt": "2026-10-01T00:00:00.000Z",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "usageLimit": 100,
  "perUserLimit": 1,
  "applicableProducts": ["507f1f77bcf86cd799439011"],
  "applicableCategories": ["Camping", "Hiking"],
  "isActive": true
}
```

**Validation constraints:**
* `code` (string, required): 3 to 20 alphanumeric characters, hyphens, and underscores (`/^[A-Za-z0-9_-]+$/`). Automatically normalized to uppercase.
* `type` (enum, required): `"percentage"` or `"fixed"`.
* `value` (number, required): Positive finite number. If `type` is `"percentage"`, must not exceed 100.
* `minimumSubtotal` (number, optional): Finite number >= 0. Defaults to `0`.
* `maximumDiscount` (number, optional, nullable): Positive finite number or `null`.
* `startsAt` (ISO datetime string or null, optional): Validity start timestamp.
* `expiresAt` (ISO datetime string or null, optional): Validity expiration timestamp. Must be >= `startsAt` if both are specified.
* `usageLimit` (integer, optional, nullable): Positive integer or `null`.
* `perUserLimit` (integer, optional, nullable): Positive integer or `null`. Defaults to `1`.
* `applicableProducts` (array of ObjectId strings, optional): Valid 24-character hexadecimal IDs without duplicates. Defaults to `[]`.
* `applicableCategories` (array of strings, optional): Non-empty strings without case-insensitive duplicates. Defaults to `[]`.
* `isActive` (boolean, optional): Defaults to `true`.
* **Mass assignment protection:** `usedCount`, `_id`, `createdAt`, `updatedAt`, and unknown fields are strictly rejected. `usedCount` is initialized by the server to `0`.

**Success:** `201 Created`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon created successfully",
  "data": {
    "coupon": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "TRAIL20",
      "normalizedCode": "TRAIL20",
      "type": "percentage",
      "value": 20,
      "minimumSubtotal": 1000,
      "maximumDiscount": 500,
      "startsAt": "2026-10-01T00:00:00.000Z",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usedCount": 0,
      "perUserLimit": 1,
      "applicableProducts": ["507f1f77bcf86cd799439011"],
      "applicableCategories": ["Camping", "Hiking"],
      "isActive": true,
      "createdAt": "2026-09-30T10:00:00.000Z",
      "updatedAt": "2026-09-30T10:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (invalid types, percentage > 100, invalid ObjectIds, unknown fields, startsAt > expiresAt).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`, `INVALID_AUTH_TOKEN`.
* `403 Forbidden`: `FORBIDDEN` (user is not an admin).
* `409 Conflict`: `COUPON_ALREADY_EXISTS` (coupon with the same normalized code already exists).

---

### List Coupons

**GET** `/admin/coupons`

Retrieves a paginated list of coupons with administrative filters, search, and sorting.

**Authentication:** Required (`Bearer <access-token>`). Must have `admin` role.

**Query parameters:**
* `page` (integer, optional): Page number (min 1). Defaults to `1`.
* `limit` (integer, optional): Items per page (min 1, max 100). Defaults to `10`.
* `search` (string, optional): Substring search matching `code` or `normalizedCode` (case-insensitive).
* `isActive` (string, optional): Filter by active status: `"true"` or `"false"`.
* `type` (string, optional): Filter by discount type: `"percentage"` or `"fixed"`.
* `sortBy` (string, optional): Field to sort by: `"createdAt"`, `"code"`, `"usedCount"`, `"value"`, or `"expiresAt"`. Defaults to `"createdAt"`.
* `sortOrder` (string, optional): `"asc"` or `"desc"`. Defaults to `"desc"`.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Admin coupons retrieved successfully",
  "data": {
    "coupons": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "TRAIL20",
        "normalizedCode": "TRAIL20",
        "type": "percentage",
        "value": 20,
        "minimumSubtotal": 1000,
        "maximumDiscount": 500,
        "startsAt": "2026-10-01T00:00:00.000Z",
        "expiresAt": "2026-12-31T23:59:59.000Z",
        "usageLimit": 100,
        "usedCount": 5,
        "perUserLimit": 1,
        "applicableProducts": ["507f1f77bcf86cd799439011"],
        "applicableCategories": ["Camping", "Hiking"],
        "isActive": true,
        "createdAt": "2026-09-30T10:00:00.000Z",
        "updatedAt": "2026-09-30T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalCoupons": 1,
      "totalPages": 1
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (invalid query parameter types, limit > 100, invalid filter enum).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `FORBIDDEN`.

---

### Get Coupon Details

**GET** `/admin/coupons/:couponId`

Retrieves the administrative configuration details of a specific coupon.

**Authentication:** Required (`Bearer <access-token>`). Must have `admin` role.

**Path parameters:**
* `couponId` (string, required): 24-character hexadecimal MongoDB ObjectId.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon details retrieved successfully",
  "data": {
    "coupon": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "TRAIL20",
      "normalizedCode": "TRAIL20",
      "type": "percentage",
      "value": 20,
      "minimumSubtotal": 1000,
      "maximumDiscount": 500,
      "startsAt": "2026-10-01T00:00:00.000Z",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usedCount": 5,
      "perUserLimit": 1,
      "applicableProducts": ["507f1f77bcf86cd799439011"],
      "applicableCategories": ["Camping", "Hiking"],
      "isActive": true,
      "createdAt": "2026-09-30T10:00:00.000Z",
      "updatedAt": "2026-09-30T10:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (malformed `couponId`).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `FORBIDDEN`.
* `404 Not Found`: `COUPON_NOT_FOUND`.

---

### Update Coupon

**PATCH** `/admin/coupons/:couponId`

Updates configuration fields of an existing coupon. Only whitelisted fields may be modified; runtime counters and internal fields cannot be updated.

**Authentication:** Required (`Bearer <access-token>`). Must have `admin` role.

**Path parameters:**
* `couponId` (string, required): 24-character hexadecimal MongoDB ObjectId.

**Request body:** (at least one field required)

```json
{
  "code": "TRAIL25",
  "value": 25,
  "maximumDiscount": 600,
  "isActive": true
}
```

**Editable fields:**
* `code` (string): 3 to 20 alphanumeric characters, hyphens, and underscores. Normalized and checked for duplicate conflict.
* `type` (enum): `"percentage"` or `"fixed"`.
* `value` (number): Positive finite number. Percentage must not exceed 100.
* `minimumSubtotal` (number): Finite number >= 0.
* `maximumDiscount` (number, nullable): Positive finite number or `null`.
* `startsAt` (ISO datetime string or null): Validity start timestamp.
* `expiresAt` (ISO datetime string or null): Validity expiration timestamp.
* `usageLimit` (integer, nullable): Positive integer or `null`.
* `perUserLimit` (integer, nullable): Positive integer or `null`.
* `applicableProducts` (array of ObjectId strings): Valid 24-character hexadecimal IDs without duplicates.
* `applicableCategories` (array of strings): Non-empty strings without duplicates.
* `isActive` (boolean).

**Non-editable / Protected fields:**
* `usedCount`, `_id`, `createdAt`, `updatedAt`, and unknown fields are strictly rejected.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon updated successfully",
  "data": {
    "coupon": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "TRAIL25",
      "normalizedCode": "TRAIL25",
      "type": "percentage",
      "value": 25,
      "minimumSubtotal": 1000,
      "maximumDiscount": 600,
      "startsAt": "2026-10-01T00:00:00.000Z",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usedCount": 5,
      "perUserLimit": 1,
      "applicableProducts": ["507f1f77bcf86cd799439011"],
      "applicableCategories": ["Camping", "Hiking"],
      "isActive": true,
      "createdAt": "2026-09-30T10:00:00.000Z",
      "updatedAt": "2026-09-30T10:30:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (empty body, malformed `couponId`, invalid values, unknown fields, `usedCount` injection).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `FORBIDDEN`.
* `404 Not Found`: `COUPON_NOT_FOUND`.
* `409 Conflict`: `COUPON_ALREADY_EXISTS` (new code conflicts with another coupon).

---

### Update Coupon Status

**PATCH** `/admin/coupons/:couponId/status`

Activates or deactivates a coupon. Only `isActive` is accepted in the request body.

**Authentication:** Required (`Bearer <access-token>`). Must have `admin` role.

**Path parameters:**
* `couponId` (string, required): 24-character hexadecimal MongoDB ObjectId.

**Request body:**

```json
{
  "isActive": false
}
```

**Validation constraints:**
* `isActive` (boolean, required).
* Strict payload: all other fields (e.g. `value`, `usageLimit`, `usedCount`) are rejected.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Coupon deactivated successfully",
  "data": {
    "coupon": {
      "_id": "507f1f77bcf86cd799439011",
      "code": "TRAIL20",
      "normalizedCode": "TRAIL20",
      "type": "percentage",
      "value": 20,
      "minimumSubtotal": 1000,
      "maximumDiscount": 500,
      "startsAt": "2026-10-01T00:00:00.000Z",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "usageLimit": 100,
      "usedCount": 5,
      "perUserLimit": 1,
      "applicableProducts": ["507f1f77bcf86cd799439011"],
      "applicableCategories": ["Camping", "Hiking"],
      "isActive": false,
      "createdAt": "2026-09-30T10:00:00.000Z",
      "updatedAt": "2026-09-30T10:35:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (malformed `couponId`, missing or non-boolean `isActive`, extra fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `FORBIDDEN`.
* `404 Not Found`: `COUPON_NOT_FOUND`.

---

## Product Catalog & Variants

CommerceFlow provides a hybrid embedded product variant architecture. Simple products manage inventory directly on `product.stock`, while variant products embed a list of variants with independent SKUs, attributes, inventory pools, and optional price overrides.

### Variant Model Structure & Guarantees

Each subdocument in a product's `variants` array contains:

* `variantId` (string, server-generated): Unique identifier matching `/^var_[A-Za-z0-9_-]{1,59}$/`, assigned automatically by the server upon creation.
* `sku` (string, required): 1 to 100 characters, uppercase alphanumeric with hyphens and underscores. Catalog-wide global uniqueness is authoritatively enforced by the dedicated `SkuRegistry` collection (`sku-registry.model.js`).
* `attributes` (object, required): Map of up to 5 key-value pairs (keys 1-30 chars lowercase, values 1-50 chars). Canonical variant signature checking prevents duplicate attribute combinations within the same product.
* `price` (number, optional, nullable): Non-negative number. When provided, acts as an authoritative variant price override. When omitted or `null`, the variant inherits the parent `product.price`.
* `stock` (integer, required): Non-negative integer tracking the variant's independent inventory pool.
* `images` (array of strings, optional): Array of valid HTTP/HTTPS image URLs specific to this variant.
* `isActive` (boolean, optional, default: `true`): Deactivated variants (`isActive: false`) are rejected at cart addition and checkout, but retain their historical references and inventory restoration capabilities.

---

### List Active Products (Storefront)

**GET** `/products`

Retrieves a paginated list of active catalog products for customer browsing, with filtering, text search, and sorting.

**Authentication:** None (Public).

**Query parameters:**
* `page` (integer, optional, default: 1): Page number (min: 1).
* `limit` (integer, optional, default: 10): Items per page (min: 1, max: 100).
* `search` (string, optional): Text search on product name and description.
* `category` (string, optional): Filter by exact category name.
* `minPrice` (number, optional): Minimum price filter.
* `maxPrice` (number, optional): Maximum price filter.
* `sort` (string, optional): Sorting preset (`price_asc`, `price_desc`, `newest`, `oldest`).
* `sortBy` (string, optional, default: `createdAt`): Sort field (`createdAt`, `price`, `ratingAverage`).
* `sortOrder` (string, optional, default: `desc`): Sort direction (`asc`, `desc`).

**Success:** `200 OK`

---

### Get Product by ID (Storefront)

**GET** `/products/:id`

Retrieves detailed information for an active product, including its embedded `variants` array and resolved specifications. Inactive products return `404 Not Found`.

**Authentication:** None (Public).

**Path parameters:**
* `id` (string, required): 24-character hexadecimal MongoDB ObjectId of the product.

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "product": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Basecamp 4-Person Tent",
      "description": "Spacious four-season camping tent.",
      "category": "Camping",
      "price": 14999,
      "stock": 25,
      "sku": "TENT-BASE",
      "images": ["https://example.com/tent.jpg"],
      "variants": [
        {
          "variantId": "var_tent_olive_4p",
          "sku": "TENT-OLV-4P",
          "attributes": {
            "color": "Olive",
            "capacity": "4-Person"
          },
          "price": 16999,
          "stock": 10,
          "images": ["https://example.com/tent-olive.jpg"],
          "isActive": true
        },
        {
          "variantId": "var_tent_blue_4p",
          "sku": "TENT-BLU-4P",
          "attributes": {
            "color": "Blue",
            "capacity": "4-Person"
          },
          "price": null,
          "stock": 15,
          "images": ["https://example.com/tent-blue.jpg"],
          "isActive": true
        }
      ],
      "isActive": true,
      "ratingAverage": 4.8,
      "ratingCount": 12,
      "createdAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-05T12:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Common error codes:**
* `400 Bad Request`: `VALIDATION_ERROR` (invalid ObjectId format).
* `404 Not Found`: `PRODUCT_NOT_FOUND` (product does not exist or is inactive).

---

### List Catalog Categories

**GET** `/products/categories`

Returns all distinct categories currently present in the active product catalog.

**Authentication:** None (Public).

**Success:** `200 OK`

---

## Product Reviews

Customer reviews and ratings for catalog products. Reviews are mounted under `/products/:productId/reviews`.

### Create Product Review

**POST** `/products/:productId/reviews`

Submits a verified-buyer review for an active catalog product and recalculates the product's aggregate rating metrics.

**Authentication:** Required (`Bearer <access-token>`).

**Path parameters:**

* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId of the target product.

**Request body:**

```json
{
  "rating": 5,
  "title": "Outstanding build quality",
  "body": "Held up exceptionally well during wet weather. Highly recommended."
}
```

**Field rules:**

* `rating` (integer, required): Whole integer from 1 to 5 (`min: 1, max: 5`).
* `title` (string, optional): Trimmed string, maximum 100 characters. Defaults to empty string `""`.
* `body` (string, required): Trimmed string, 5 to 2000 characters (`min: 5, max: 2000`).
* Strict body validation: Injected or unsupported fields (e.g., `user`, `order`, `isVerifiedBuyer`, `status`) are rejected with `VALIDATION_ERROR`.

**Success:** `201 Created`

```json
{
  "success": true,
  "message": "Review created successfully",
  "data": {
    "review": {
      "_id": "607f1f77bcf86cd799439041",
      "product": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439001",
      "rating": 5,
      "title": "Outstanding build quality",
      "body": "Held up exceptionally well during wet weather. Highly recommended.",
      "isVerifiedBuyer": true,
      "status": "published",
      "createdAt": "2026-10-12T10:00:00.000Z",
      "updatedAt": "2026-10-12T10:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Verified Buyer Enforcement:** A customer may only review a product if they have completed a qualifying order containing the product that is both `delivered` and `paid`. Unverified purchasers return `403 Forbidden` (`REVIEW_PURCHASE_REQUIRED`).
* **One Review Per Product:** Exactly one review per user per product is enforced by business logic and the `{ user: 1, product: 1 }` compound unique index. Duplicate submissions return `409 Conflict` (`REVIEW_ALREADY_EXISTS`).
* **Rating Recalculation:** Upon creation, the server automatically recalculates `ratingAverage` (rounded to 1 decimal place) and `ratingCount` across all `published` reviews for the product and updates the `Product` document.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed `productId`, rating out of range 1–5, body length invalid, extra fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `REVIEW_PURCHASE_REQUIRED` (customer has not completed a delivered purchase of this product).
* `404 Not Found`: `PRODUCT_NOT_FOUND` (target product does not exist).
* `409 Conflict`: `REVIEW_ALREADY_EXISTS` (customer already submitted a review for this product).

---

### List Product Reviews

**GET** `/products/:productId/reviews`

Retrieves a paginated list of published reviews for a product.

**Authentication:** Required (`Bearer <access-token>`).

**Path parameters:**

* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId of the product.

**Query parameters:**

* `page` (integer, optional, default: 1): Page number (min: 1).
* `limit` (integer, optional, default: 10): Items per page (min: 1, max: 50).
* `rating` (integer, optional): Filter by exact rating (min: 1, max: 5).
* `sortBy` (string, optional, default: `createdAt`): Sort field (`createdAt`, `rating`).
* `sortOrder` (string, optional, default: `desc`): Sort direction (`asc`, `desc`).

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Reviews retrieved successfully",
  "data": {
    "reviews": [
      {
        "_id": "607f1f77bcf86cd799439041",
        "product": "507f1f77bcf86cd799439011",
        "user": {
          "_id": "507f1f77bcf86cd799439001",
          "name": "Jane Doe"
        },
        "rating": 5,
        "title": "Outstanding build quality",
        "body": "Held up exceptionally well during wet weather. Highly recommended.",
        "isVerifiedBuyer": true,
        "status": "published",
        "createdAt": "2026-10-12T10:00:00.000Z",
        "updatedAt": "2026-10-12T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalReviews": 1,
      "totalPages": 1
    }
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Published Filter:** Only reviews with `status: "published"` are returned. Hidden or flagged reviews are excluded.
* **Data Projection:** Populates `user.name` only, omitting sensitive user details. The internal `order` reference is excluded.
* **Product Verification:** Verifies the product exists. Returns `404 Not Found` (`PRODUCT_NOT_FOUND`) if nonexistent.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed `productId`, invalid `page`, `limit > 50`, invalid `rating`, invalid `sortBy`/`sortOrder`).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `404 Not Found`: `PRODUCT_NOT_FOUND` (product does not exist).

---

### Update Product Review

**PATCH** `/products/:productId/reviews/:reviewId`

Updates an existing review authored by the authenticated customer.

**Authentication:** Required (`Bearer <access-token>`). Must be the review author.

**Path parameters:**

* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId of the product.
* `reviewId` (string, required): 24-character hexadecimal MongoDB ObjectId of the review.

**Request body:**

```json
{
  "rating": 4,
  "title": "Updated review title",
  "body": "Updated review content after six months of regular field use."
}
```

**Field rules:**

* At least one field (`rating`, `title`, or `body`) must be provided. Empty body returns `VALIDATION_ERROR`.
* `rating` (integer, optional): Whole integer from 1 to 5 (`min: 1, max: 5`).
* `title` (string, optional): Trimmed string, maximum 100 characters.
* `body` (string, optional): Trimmed string, 5 to 2000 characters (`min: 5, max: 2000`).
* Strict body validation: Immutable fields (`user`, `product`, `order`, `isVerifiedBuyer`, `status`) are rejected with `VALIDATION_ERROR`.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "review": {
      "_id": "607f1f77bcf86cd799439041",
      "product": "507f1f77bcf86cd799439011",
      "user": {
        "_id": "507f1f77bcf86cd799439001",
        "name": "Jane Doe"
      },
      "rating": 4,
      "title": "Updated review title",
      "body": "Updated review content after six months of regular field use.",
      "isVerifiedBuyer": true,
      "status": "published",
      "createdAt": "2026-10-12T10:00:00.000Z",
      "updatedAt": "2026-10-12T11:00:00.000Z"
    }
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Ownership Check:** The authenticated user must match the author of the review. Attempting to modify another customer's review returns `403 Forbidden` (`REVIEW_ACCESS_DENIED`).
* **Rating Recalculation:** Automatically recalculates `ratingAverage` and `ratingCount` on the parent `Product` document.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed IDs, empty body, invalid rating, invalid length, extra fields).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `REVIEW_ACCESS_DENIED` (attempt to update another customer's review).
* `404 Not Found`: `REVIEW_NOT_FOUND` (review does not exist for this product).

---

### Delete Product Review

**DELETE** `/products/:productId/reviews/:reviewId`

Permanently deletes a customer's own review.

**Authentication:** Required (`Bearer <access-token>`). Must be the review author.

**Path parameters:**

* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId of the product.
* `reviewId` (string, required): 24-character hexadecimal MongoDB ObjectId of the review.

**Request body:** None.

**Success:** `200 OK`

```json
{
  "success": true,
  "message": "Review deleted successfully",
  "data": {
    "reviewId": "607f1f77bcf86cd799439041"
  },
  "requestId": "req-123"
}
```

**Behavior notes:**

* **Ownership Check:** The authenticated user must be the review author. Deletion attempts by other customers return `403 Forbidden` (`REVIEW_ACCESS_DENIED`).
* **Rating Recalculation:** Automatically re-aggregates remaining published reviews for the product. If no reviews remain, `ratingCount` and `ratingAverage` reset to `0`.

**Common error codes:**

* `400 Bad Request`: `VALIDATION_ERROR` (malformed `productId` or `reviewId`).
* `401 Unauthorized`: `AUTH_TOKEN_REQUIRED`.
* `403 Forbidden`: `REVIEW_ACCESS_DENIED` (attempt to delete another user's review).
* `404 Not Found`: `REVIEW_NOT_FOUND` (review does not exist for this product).

---

## Admin Products

Administrative catalog operations require authentication with `role: "admin"`. These endpoints provide full catalog visibility (both active and inactive products), variant lifecycle management, inventory thresholds, and operational status management.

### List Products (Admin)

**GET** `/admin/products`

Retrieves a paginated list of catalog products across all active and inactive statuses with multi-field search and inventory filtering.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Query parameters:**
* `page` (integer, optional, default: 1): Page number (min: 1).
* `limit` (integer, optional, default: 10): Items per page (min: 1, max: 100).
* `search` (string, optional, max: 100 chars): Search across product name, description, root SKU, and variant SKUs.
* `category` (string, optional, max: 100 chars): Filter by category.
* `status` (string, optional, default: `all`): Filter by active catalog state (`all`, `active`, `inactive`).
* `stock` (string, optional, default: `all`): Filter by stock level (`all`, `inStock`, `outOfStock`, `lowStock` where stock <= 5).
* `hasVariants` (string, optional, default: `all`): Filter by variant presence (`all`, `true`, `false`).
* `sort` (string, optional): Sorting preset (`newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`, `stock_asc`, `stock_desc`).
* `sortBy` (string, optional, default: `createdAt`): Sort field (`createdAt`, `price`, `name`, `stock`).
* `sortOrder` (string, optional, default: `desc`): Sort direction (`asc`, `desc`).

**Success:** `200 OK`

**Response body:**

```json
{
  "success": true,
  "message": "Admin products retrieved successfully",
  "data": {
    "products": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Alpine Expedition Tent",
        "description": "Four-season mountain tent.",
        "category": "Camping",
        "price": 14999,
        "stock": 25,
        "sku": "TENT-ALP",
        "hasVariants": true,
        "variants": [
          {
            "variantId": "var_tent_alp_ol_3",
            "sku": "TENT-ALP-OL-3",
            "attributes": { "color": "Olive", "size": "3P" },
            "price": 14999,
            "stock": 15,
            "isActive": true
          }
        ],
        "isActive": true,
        "createdAt": "2026-03-01T10:00:00.000Z",
        "updatedAt": "2026-03-05T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalProducts": 1,
      "totalPages": 1
    }
  },
  "requestId": "req-123"
}
```

---

### Create Product (Admin)

**POST** `/admin/products`

Creates a new product document in the catalog, supporting either simple product inventory or embedded variants with globally validated SKUs.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Request body (Variant Product Example):**

```json
{
  "name": "Basecamp 4-Person Tent",
  "description": "Four-season all-weather camping tent.",
  "price": 14999,
  "category": "Camping",
  "sku": "TENT-BASE",
  "variants": [
    {
      "sku": "TENT-OLV-4P",
      "attributes": {
        "color": "Olive",
        "capacity": "4-Person"
      },
      "price": 16999,
      "stock": 10,
      "images": ["https://example.com/tent-olive.jpg"],
      "isActive": true
    },
    {
      "sku": "TENT-BLU-4P",
      "attributes": {
        "color": "Blue",
        "capacity": "4-Person"
      },
      "price": null,
      "stock": 15,
      "images": ["https://example.com/tent-blue.jpg"],
      "isActive": true
    }
  ],
  "isActive": true
}
```

**Validation & SKU Architecture:**
* `variants[].sku`: Validated for catalog-wide uniqueness via `SkuRegistry`. Duplicate SKUs across any product or variant return `409 Conflict` (`SKU_ALREADY_EXISTS`).
* `variants[].attributes`: Unique canonical attribute signatures enforced within the product.
* `variants[].variantId`: Server-assigned identifier; client-supplied `variantId` values are ignored.

**Success:** `201 Created`

---

### Get Product by ID (Admin)

**GET** `/admin/products/:id`

Retrieves complete product details for administrative inspection, without storefront active-only gating.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Success:** `200 OK`

---

### Update Product (Admin)

**PATCH** `/admin/products/:id`

Updates fields on an existing product, including base pricing, description, stock, and variant definitions.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Request body:**

```json
{
  "price": 15499,
  "variants": [
    {
      "variantId": "var_tent_olive_4p",
      "sku": "TENT-OLV-4P",
      "attributes": { "color": "Olive", "capacity": "4-Person" },
      "price": 17499,
      "stock": 12,
      "isActive": true
    }
  ]
}
```

**Success:** `200 OK`

---

### Update Product Status (Admin)

**PATCH** `/admin/products/:id/status`

Toggles the catalog active/inactive visibility of a product.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Request body:**

```json
{
  "isActive": false
}
```

**Success:** `200 OK`

---

### Delete Product (Admin)

**DELETE** `/admin/products/:id`

Soft-deletes a product by deactivating it in the catalog.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Success:** `200 OK`

---

## Admin Inventory Management

All inventory administration endpoints require authentication and `admin` authorization. Customer-facing users are rejected with `403 Forbidden` (`FORBIDDEN`).

### List Inventory Records (Admin)

**GET** `/admin/inventory`

Lists directory inventory records with aggregate and variant-level breakdown, server-side pagination, search, and stock level filtering.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Query Parameters:**
* `page` (integer, optional, default: 1): Page index (>= 1).
* `limit` (integer, optional, default: 10): Items per page (1 to 100).
* `search` (string, optional, max: 100): Case-insensitive search query matching product name, product SKU, or variant SKU.
* `stock` (string, optional, default: `all`): Filter by stock level:
  * `all`: All items.
  * `inStock`: Items with stock > 0.
  * `lowStock`: Items with stock <= 5 and > 0 (server-authoritative threshold = 5).
  * `outOfStock`: Depleted items with stock <= 0.
* `status` (string, optional, default: `all`): Storefront status filter (`all`, `active`, `inactive`).
* `type` (string, optional, default: `all`): Product architecture filter (`all`, `simple`, `variant`).
* `sortBy` (string, optional, default: `createdAt`): Sort field (`createdAt`, `name`, `stock`, `price`).
* `sortOrder` (string, optional, default: `desc`): Sort direction (`asc`, `desc`).

**Success:** `200 OK`

**Response body:**
```json
{
  "items": [
    {
      "id": "507f1f77bcf86cd799439011:simple",
      "productId": "507f1f77bcf86cd799439011",
      "productName": "Trailhead Hydration Flask",
      "category": "Accessories",
      "type": "simple",
      "sku": "FLASK-HYD-750",
      "variantId": null,
      "variantName": null,
      "stock": 25,
      "stockState": "inStock",
      "isActive": true,
      "productImage": "https://example.com/flask.jpg",
      "price": 1299
    },
    {
      "id": "507f1f77bcf86cd799439012:var_red_m",
      "productId": "507f1f77bcf86cd799439012",
      "productName": "Alpine Technical Jacket",
      "category": "Apparel",
      "type": "variant",
      "sku": "JCKT-RED-M",
      "variantId": "var_red_m",
      "variantName": "Red / M",
      "stock": 4,
      "stockState": "lowStock",
      "isActive": true,
      "productImage": "https://example.com/jacket.jpg",
      "price": 8999
    }
  ],
  "summary": {
    "totalProducts": 2,
    "totalStock": 29,
    "lowStockCount": 1,
    "outOfStockCount": 0,
    "lowStockThreshold": 5
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalProducts": 2,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

---

### Adjust Inventory Stock (Admin)

**POST** `/admin/inventory/adjust`

Executes a server-authoritative manual stock adjustment. For simple products, updates root `product.stock`. For variant products, atomically targets `variants.$.stock` using MongoDB `$inc`. Never silently updates root stock for variant adjustments. Stock cannot be reduced below zero.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Request body:**
```json
{
  "productId": "507f1f77bcf86cd799439012",
  "variantId": "var_red_m",
  "adjustment": 5,
  "reason": "receiving",
  "note": "PO-8812 inbound shipment inspection passed"
}
```

**Validation constraints:**
* `productId` (string, required): 24-character hexadecimal MongoDB ObjectId.
* `variantId` (string, optional): Required for variant products; must be omitted for simple products.
* `adjustment` (integer, required): Non-zero integer (positive to add stock, negative to reduce stock). Zero is rejected (`ZERO_ADJUSTMENT`).
* `reason` (string, required): One of:
  * `stock_correction`: Physical audit discrepancy correction.
  * `damaged_inventory`: Shrinkage due to handling or transit damage.
  * `returned_inventory`: Manual stock recovery from customer return.
  * `manual_count`: Routine cycle count adjustment.
  * `receiving`: New stock replenishment received.
  * `other`: Miscellaneous administrative adjustment.
* `note` (string, optional, max: 500 characters): Additional administrative context.

**Success:** `200 OK`

**Response body:**
```json
{
  "success": true,
  "message": "Stock adjusted successfully",
  "adjustment": {
    "id": "673f1f77bcf86cd799439099",
    "productId": "507f1f77bcf86cd799439012",
    "productName": "Alpine Technical Jacket",
    "variantId": "var_red_m",
    "variantName": "Red / M",
    "sku": "JCKT-RED-M",
    "previousStock": 4,
    "adjustment": 5,
    "resultingStock": 9,
    "reason": "receiving",
    "note": "PO-8812 inbound shipment inspection passed",
    "admin": {
      "id": "507f1f77bcf86cd799439000",
      "email": "admin@example.com"
    },
    "createdAt": "2026-10-07T12:00:00.000Z"
  }
}
```

**Common error responses:**
* `400 Bad Request` (`VALIDATION_ERROR`): Malformed inputs, missing reason, or invalid IDs.
* `400 Bad Request` (`INSUFFICIENT_STOCK`): Adjustment would result in negative stock.
* `400 Bad Request` (`VARIANT_ID_REQUIRED`): Attempted to adjust variant product without supplying `variantId`.
* `400 Bad Request` (`SIMPLE_PRODUCT_NO_VARIANT`): Client supplied `variantId` for a simple product.
* `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
* `403 Forbidden` (`FORBIDDEN`): Authenticated user is not an admin.
* `404 Not Found` (`PRODUCT_NOT_FOUND` / `VARIANT_NOT_FOUND`): Target product or variant does not exist.
* `409 Conflict` (`CONCURRENT_STOCK_CONFLICT`): Concurrent write conflict or inventory race condition during atomic update.

---

### Get Inventory Adjustment History (Admin)

**GET** `/admin/inventory/adjustments`

Retrieves durable audit records of administrative manual stock adjustments.

**Authentication:** Required (`Bearer <access-token>`). User role must be `admin`.

**Query Parameters:**
* `page` (integer, optional, default: 1): Page number (>= 1).
* `limit` (integer, optional, default: 20): Results per page (1 to 100).
* `productId` (string, optional): Filter adjustments for a specific product ObjectId.

**Success:** `200 OK`

**Response body:**
```json
{
  "adjustments": [
    {
      "id": "673f1f77bcf86cd799439099",
      "product": "507f1f77bcf86cd799439012",
      "productName": "Alpine Technical Jacket",
      "variantId": "var_red_m",
      "variantName": "Red / M",
      "sku": "JCKT-RED-M",
      "previousStock": 4,
      "adjustment": 5,
      "resultingStock": 9,
      "reason": "receiving",
      "note": "PO-8812 inbound shipment inspection passed",
      "adminId": "507f1f77bcf86cd799439000",
      "adminEmail": "admin@example.com",
      "createdAt": "2026-10-07T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Admin User Management

Endpoints under `/admin/users` provide secure administrative account management.

### Security & Provisioning Model

* **Public registration NEVER creates administrators.** Storefront registration (`POST /users/register`) strictly assigns `role = "customer"`.
* **Administrator creation requires an authenticated administrator** using `POST /admin/users` or the existing protected CLI bootstrap scripts (`scripts/create-admin.js` / `scripts/promote-admin.js`).
* **Authentication & Authorization:** All `/admin/users` endpoints require valid administrative session authentication (`authMiddleware` via HttpOnly cookie or Bearer token) and administrator role verification (`authorize("admin")`). The server derives the acting administrator identity strictly from `req.user`. Client-supplied actor identities or roles in the request body are ignored or rejected.
* **Sensitive Data Redaction:** Passwords, password hashes, and tokens are never serialized or returned in responses or application logs.
* **Persistent administrative audit logging remains a future milestone.** Current mutations emit structured logger events without sensitive secrets.

---

### List Users (Admin)

**GET** `/admin/users`

Returns paginated user accounts with administrative projection (`_id`, `name`, `email`, `role`, `isActive`, `createdAt`, `updatedAt`).

**Authentication:** Required. User role must be `admin`.

**Query Parameters:**
* `page` (integer, optional, default: 1): Page number (>= 1).
* `limit` (integer, optional, default: 10): Results per page (1 to 50).
* `search` (string, optional): Case-insensitive search on user `name` or `email` (up to 100 characters, special regex characters escaped).
* `role` (string, optional, enum: `admin`, `customer`): Filter by user role.
* `status` (string, optional, enum: `active`, `inactive`): Filter by active status.
* `sortBy` (string, optional, default: `createdAt`, enum: `createdAt`, `name`, `email`, `role`): Sort field.
* `sortOrder` (string, optional, default: `desc`, enum: `asc`, `desc`): Sort direction.

**Success:** `200 OK`

**Response body:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "_id": "507f1f77bcf86cd799439001",
        "name": "Store Admin",
        "email": "admin@example.com",
        "role": "admin",
        "isActive": true,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalUsers": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### Create Administrator (Admin)

**POST** `/admin/users`

Creates a new administrator account. The server forcibly sets `role = "admin"`. The client cannot select or supply arbitrary roles.

**Authentication:** Required. User role must be `admin`. Rate-limited via authentication abuse limiter.

**Request body:**
```json
{
  "name": "Security Administrator",
  "email": "secadmin@example.com",
  "password": "StrongPassword123!"
}
```

**Validation constraints:**
* `name` (string, required): 2 to 60 characters.
* `email` (string, required): Valid email format, normalized to lowercase. Must be unique in the database.
* `password` (string, required): 8 to 128 characters, containing at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character (`@$!%*?&#`).

**Success:** `201 Created`

**Response body:**
```json
{
  "success": true,
  "message": "Administrator account created successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439002",
      "name": "Security Administrator",
      "email": "secadmin@example.com",
      "role": "admin",
      "isActive": true,
      "createdAt": "2026-10-08T12:00:00.000Z",
      "updatedAt": "2026-10-08T12:00:00.000Z"
    }
  }
}
```

**Common Errors:**
* `400 Bad Request` (`VALIDATION_ERROR`): Invalid format, weak password, or extra unknown fields.
* `409 Conflict` (`EMAIL_ALREADY_EXISTS`): A user with this email address already exists.

---

### Update User Status (Admin)

**PATCH** `/admin/users/:userId/status`

Activates or deactivates a user account.

**Authentication:** Required. User role must be `admin`.

**Path Parameters:**
* `userId` (string, required): 24-character hexadecimal MongoDB ObjectId of target user.

**Request body:**
```json
{
  "isActive": false
}
```

**Safety & Last-Admin Protection:**
* **Self-Deactivation Protection:** An administrator cannot deactivate their own account (`400 Bad Request`, `CANNOT_DEACTIVATE_SELF`).
* **Last-Active-Admin Protection:** If the target user is an active administrator, the operation verifies that at least one other active administrator exists in the database. Deactivating the final active administrator is strictly blocked (`409 Conflict`, `CANNOT_DEACTIVATE_LAST_ADMIN`).

**Success:** `200 OK`

**Response body:**
```json
{
  "success": true,
  "message": "User status updated successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439002",
      "name": "Security Administrator",
      "email": "secadmin@example.com",
      "role": "admin",
      "isActive": false,
      "createdAt": "2026-10-08T12:00:00.000Z",
      "updatedAt": "2026-10-08T12:05:00.000Z"
    }
  }
}
```

**Common Errors:**
* `400 Bad Request` (`CANNOT_DEACTIVATE_SELF`): Acting admin attempted to deactivate themselves.
* `404 Not Found` (`USER_NOT_FOUND`): Target user does not exist.
* `409 Conflict` (`CANNOT_DEACTIVATE_LAST_ADMIN`): Operation would leave 0 active administrators.

---

### Update User Role (Admin)

**PATCH** `/admin/users/:userId/role`

Promotes a customer to administrator or demotes an administrator to customer.

**Authentication:** Required. User role must be `admin`.

**Path Parameters:**
* `userId` (string, required): 24-character hexadecimal MongoDB ObjectId of target user.

**Request body:**
```json
{
  "role": "customer"
}
```

**Safety & Last-Admin Protection:**
* **Supported Roles Only:** The only accepted roles are `"admin"` and `"customer"`. Arbitrary roles are rejected (`VALIDATION_ERROR`).
* **Self-Demotion Protection:** An administrator cannot demote their own account (`400 Bad Request`, `CANNOT_DEMOTE_SELF`).
* **Last-Active-Admin Protection:** Demoting an active administrator is strictly blocked if they are the only remaining active administrator (`409 Conflict`, `CANNOT_DEMOTE_LAST_ADMIN`).

**Success:** `200 OK`

**Response body:**
```json
{
  "success": true,
  "message": "User role updated successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439002",
      "name": "Security Administrator",
      "email": "secadmin@example.com",
      "role": "customer",
      "isActive": true,
      "createdAt": "2026-10-08T12:00:00.000Z",
      "updatedAt": "2026-10-08T12:05:00.000Z"
    }
  }
}
```

**Common Errors:**
* `400 Bad Request` (`CANNOT_DEMOTE_SELF`): Acting admin attempted to demote themselves.
* `404 Not Found` (`USER_NOT_FOUND`): Target user does not exist.
* `409 Conflict` (`CANNOT_DEMOTE_LAST_ADMIN`): Demoting this admin would leave 0 active administrators.

---

## Administrative Audit Logs

### List Administrative Audit Logs

**GET** `/admin/audit-logs`

Retrieves a paginated, chronologically deterministic stream of persistent administrative audit events.

**Authentication:** Required. User role must be `admin`.

**Query Parameters:**
* `page` (integer, optional, default: `1`): 1-based page number.
* `limit` (integer, optional, default: `10`, max: `50`): Number of audit records per page (bounded between 1 and 50).
* `eventType` (string, optional): Filter by standardized event type (e.g. `ADMIN_USER_CREATED`, `ADMIN_USER_STATUS_UPDATED`, `ADMIN_USER_ROLE_UPDATED`).
* `actorUserId` (string, optional): 24-character hexadecimal MongoDB ObjectId of acting administrator.
* `targetUserId` (string, optional): 24-character hexadecimal MongoDB ObjectId of target user.
* `startDate` (ISO 8601 string, optional): Filter records created on or after this timestamp.
* `endDate` (ISO 8601 string, optional): Filter records created on or before this timestamp.

**Event Taxonomy:**
* `ADMIN_USER_CREATED`: Emitted when an administrator creates a new administrator account.
* `ADMIN_USER_STATUS_UPDATED`: Emitted when an administrator changes a user's activation status (`isActive`).
* `ADMIN_USER_ROLE_UPDATED`: Emitted when an administrator updates a user's role (`admin` <-> `customer`).

**Security & Immutability:**
* **Server-Authoritative Actor:** Actor identity is strictly derived from `req.user`. Client-supplied actor IDs/roles are unconditionally ignored.
* **Strict Redaction:** Password plaintext, bcrypt password hashes, JWTs, auth cookies, reset tokens, and arbitrary request bodies are never stored or projected in responses.
* **Strict Immutability:** Audit records are write-once and cannot be updated, deleted, or cleared via HTTP endpoints (`POST`, `PUT`, `PATCH`, `DELETE` are rejected with `405 Method Not Allowed`).
* **Deterministic Sorting:** Results are deterministically sorted newest-first (`{ createdAt: -1, _id: -1 }`).

**Success:** `200 OK`

**Response body:**
```json
{
  "success": true,
  "message": "Admin audit logs retrieved successfully",
  "data": {
    "auditLogs": [
      {
        "id": "607f1f77bcf86cd799439001",
        "_id": "607f1f77bcf86cd799439001",
        "eventType": "ADMIN_USER_CREATED",
        "actorUserId": "507f1f77bcf86cd799439000",
        "actorEmail": "admin@example.com",
        "actorRole": "admin",
        "targetUserId": "507f1f77bcf86cd799439002",
        "targetEmail": "newadmin@example.com",
        "metadata": {
          "role": "admin",
          "isActive": true
        },
        "ipAddress": "127.0.0.1",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "createdAt": "2026-10-08T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalLogs": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  },
  "requestId": "9bd2f82e-08d4-477a-b76a-1fcce3384a07"
}
```

**Common Errors:**
* `400 Bad Request` (`VALIDATION_ERROR`): Invalid query parameters, unsupported operator, or limit exceeding 50.
* `401 Unauthorized` (`AUTH_TOKEN_REQUIRED`): Missing or invalid authentication token.
* `403 Forbidden` (`FORBIDDEN`): Authenticated user is not an administrator.
* `405 Method Not Allowed` (`METHOD_NOT_ALLOWED`): Mutation attempt (`POST`, `PUT`, `PATCH`, `DELETE`) on audit logs.

---

## 10. Order Returns & RMA Lifecycle

CommerceFlow implements a production-grade Return Merchandise Authorization (RMA) lifecycle for handling post-fulfillment customer product returns, item-level quantity inspection, variant inventory restocking, and financial refund tracking.

### Architecture & Security Invariants

* **Dedicated Collection**: Return records are persisted in a dedicated `returns` MongoDB collection rather than embedding an unbounded history inside orders.
* **Server-Authoritative Values**: Client-supplied item prices, SKU, product/variant names, total amounts, and actor IDs are unconditionally ignored. Authoritative values are resolved directly from persisted order and inventory state.
* **State Machine**: Returns transition through an explicit forward state machine:
  * `requested` -> `approved` | `rejected` | `cancelled`
  * `approved` -> `received`
  * `received` -> `completed`
  * Terminal states: `completed`, `rejected`, `cancelled`. Arbitrary PATCH or backward status jumps are strictly rejected.
* **Return Window Policy**: Customer return requests are accepted only for orders in `delivered` fulfillment status within the configurable return window (`RETURN_WINDOW_DAYS = 30`).
* **Concurrency Protection**: Atomic quantity validation and conditional document updates prevent over-claiming items across concurrent return requests.
* **Variant Inventory Restoration (P1.6)**: Inventory is restored **only** upon transition to `completed`. For variant products, stock is restored to `variants.$.stock`. For simple products, stock is restored to root `stock`. Under no circumstances will a variant return fall back to root stock. Durable `restorationKeys` guarantee idempotent restocking.
* **Refund Boundary**: Automated payment gateway refunds are **not** simulated or faked. Financial refund status remains explicitly `pending_manual` until manual reconciliation via accounting ledgers.

---

### Customer: Request Return (RMA)

**POST** `/orders/:orderId/returns`

Allows an authenticated customer to request a return for eligible line items on a delivered order.

**Authentication:** Required (`Bearer <token>` or `auth_token` cookie). Must own the order.

**Path Parameters:**
* `orderId` (string, required): 24-character hexadecimal MongoDB ObjectId of the delivered order.

**Request Body:**
```json
{
  "reason": "defective",
  "customerNote": "Item arrived with broken clasp",
  "items": [
    {
      "productId": "507f1f77bcf86cd799439013",
      "variantId": "var_tent_olive_4p",
      "quantity": 1
    }
  ]
}
```

**Validation Constraints:**
* `reason`: One of `damaged`, `defective`, `wrong_item`, `size_fit`, `not_as_described`, `changed_mind`, `other`.
* `items`: Non-empty array of objects with valid `productId`, optional `variantId`, and positive integer `quantity`.
* `customerNote`: Optional string (max 1000 characters).

**Success:** `201 Created`

---

### Customer: List Order Returns

**GET** `/orders/:orderId/returns`

Returns all return records associated with an order.

**Authentication:** Required. Customer must own the order or be an administrator.

**Success:** `200 OK`

---

### Customer & Admin: Inspect Return Record

**GET** `/returns/:returnId`

Fetches detailed return information including item snapshots, timeline timestamps, reason, and refund status.

**Authentication:** Required. Customer must own the return or be an administrator.

**Success:** `200 OK`

---

### Customer: Cancel Return Request

**POST** `/returns/:returnId/cancel`

Allows a customer to cancel their pending return request while in `requested` status.

**Authentication:** Required. Customer must own the return.

**Success:** `200 OK`

---

### Admin: List & Filter Returns

**GET** `/admin/returns`

Returns paginated list of returns with filtering by status, search query (order ID, return number, customer ID), and date range.

**Authentication:** Required (`role: "admin"`).

**Query Parameters:**
* `page` (number, optional, default: 1)
* `limit` (number, optional, default: 10, max: 100)
* `status` (string, optional): One of `requested`, `approved`, `rejected`, `received`, `completed`, `cancelled`.
* `search` (string, optional): Sanitized search string.
* `sortBy` (string, optional, default: `createdAt`)
* `sortOrder` (string, optional, default: `desc`)

**Success:** `200 OK`

---

### Admin: Approve Return (RMA)

**PATCH** `/admin/returns/:returnId/approve`

Transitions a return from `requested` to `approved`. Emits `RETURN_APPROVED` audit event.

**Authentication:** Required (`role: "admin"`).

**Request Body:**
```json
{
  "adminNote": "RMA approved. RMA packing slip authorized."
}
```

**Success:** `200 OK`

---

### Admin: Reject Return

**PATCH** `/admin/returns/:returnId/reject`

Transitions a return from `requested` to `rejected`. Emits `RETURN_REJECTED` audit event.

**Authentication:** Required (`role: "admin"`).

**Request Body:**
```json
{
  "rejectionReason": "Item return window exceeded policy limit",
  "adminNote": "Verified delivery date was 45 days prior"
}
```

**Success:** `200 OK`

---

### Admin: Mark Return Received

**PATCH** `/admin/returns/:returnId/receive`

Transitions a return from `approved` to `received`. Emits `RETURN_RECEIVED` audit event.

**Authentication:** Required (`role: "admin"`).

**Success:** `200 OK`

---

### Admin: Complete Return & Restock

**PATCH** `/admin/returns/:returnId/complete`

Transitions a return from `received` to `completed`. Atomically restocks product and variant inventory and emits `RETURN_COMPLETED` audit event. Idempotent on repeated calls.

**Authentication:** Required (`role: "admin"`).

**Success:** `200 OK`

---

## Payment Refunds & Financial Ledger

### Overview & Financial Invariants

The Payment Refunds & Financial Ledger subsystem provides server-authoritative, idempotent, and immutable financial accounting for payment reversals and RMA returns.

1. **Server-Authoritative Values:** Financial amounts and currencies are strictly calculated on the server from authoritative Return line items snapshots and Order totals. Client-supplied amounts, currencies, transaction IDs, and statuses are rejected.
2. **Immutable Financial Ledger:** All financial events (`PAYMENT_CAPTURED`, `PAYMENT_REFUND_REQUESTED`, `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_PENDING`) are written to an append-only, immutable `FinancialLedger` model. Records cannot be updated or deleted. Corrections are executed solely via compensating ledger entries.
3. **Money Representation:** Amounts are stored explicitly in INR (Rupees) with integer smallest-unit representation (`amountInPaise`, 1 INR = 100 paise) to eliminate floating-point arithmetic hazards.
4. **Deterministic Idempotency:** Financial operations enforce uniqueness at the database level using durable idempotency keys (`rma-refund:<returnId>`). Repeated requests return the authoritative existing result without issuing duplicate gateway calls.
5. **Separation of Concerns:** Physical inventory restoration and financial refund execution are distinct lifecycles. A completed return with restocked inventory may honestly exist in `refundStatus: "pending"` or `"failed"` without rolling back inventory.
6. **Reconciliation & Partial Failure:** If the payment gateway succeeds but local database processing encounters an exception, the system records the authoritative `gatewayRefundId` and enters a recoverable reconciliation state rather than re-dispatching duplicate refunds.

---

### Refund State Machine

```
requested ──> pending ──> succeeded (TERMINAL)
     │            │
     ▼            ├──[Definite Failure]──> failed
   failed <───────┤                          │
                  └──[Ambiguous / Timeout]─> reconciliation_required
                                                    │
                                            [POST /admin/refunds/:id/reconcile]
                                                    │
                                  ┌─────────────────┴─────────────────┐
                                  ▼                                   ▼
                              succeeded                             failed
                                                                      │
                                          [Retry via /admin/refunds/:id/retry]
                                                                      │
                                                                      ▼
                                                                   pending
```

* **requested:** Initial administrative creation before gateway dispatch.
* **pending:** Actively in execution or awaiting gateway response.
* **succeeded:** Authoritative gateway success verified and ledger debit recorded. Strictly terminal.
* **failed:** Conclusive gateway rejection (e.g. invalid state or insufficient balance). Eligible for server-authorized retry.
* **reconciliation_required:** Ambiguous outcome (e.g. network timeout `ETIMEDOUT`, socket drop, or post-gateway local database failure). Automatic retries are strictly blocked until an operator triggers reconciliation.

---

### Admin: List & Filter Refunds

**GET** `/admin/refunds`

Returns paginated list of financial refunds with bounded pagination, status filtering, and multi-field search. Search input escapes regex metacharacters to eliminate ReDoS hazards.

**Authentication:** Required (`role: "admin"`).

**Query Parameters:**
* `page` (number, optional, default: 1, min: 1)
* `limit` (number, optional, default: 10, max: 100)
* `status` (string, optional): One of `requested`, `pending`, `succeeded`, `failed`, `reconciliation_required`.
* `orderId` (string, optional): 24-character hex ObjectId.
* `returnId` (string, optional): 24-character hex ObjectId.
* `customerId` (string, optional): 24-character hex ObjectId.
* `gateway` (string, optional): One of `razorpay`, `manual`.
* `search` (string, optional): Search query matching `refundNumber`, `gatewayPaymentId`, or `gatewayRefundId`.
* `sortBy` (string, optional, default: `createdAt`): One of `createdAt`, `amount`, `status`, `refundNumber`.
* `sortOrder` (string, optional, default: `desc`): `asc` or `desc`.
* `dateFrom` (string, optional): ISO 8601 date string.
* `dateTo` (string, optional): ISO 8601 date string.

**Success:** `200 OK`

---

### Admin: Inspect Refund Details & Ledger History

**GET** `/admin/refunds/:refundId`

Returns detailed refund record with safe metadata and associated immutable financial ledger entries.

**Authentication:** Required (`role: "admin"`).

**Success:** `200 OK`

---

### Admin: Initiate RMA Return Refund

**POST** `/admin/refunds/returns/:returnId` (or `/admin/returns/:returnId/refund`)

Initiates authoritative payment gateway refund for an eligible, completed return.

**Pricing & Refund Allocation Rules:**
* Refund amounts are server-calculated from authoritative Order line item snapshots.
* Proportional discount allocation: If an order has coupon discounts (`order.discountAmount > 0`), the refundable amount per line item is reduced by the proportional discount factor `(order.subtotal - order.discountAmount) / order.subtotal`.
* Remaining balance protection: Committed and in-flight refunds are aggregated and reserved using optimistic concurrency control on the `Order` document, preventing concurrent refund requests from exceeding the order's remaining captured payment.

**Authentication:** Required (`role: "admin"`).

**Validation constraints:**
* `returnId` (params, required): 24-character hexadecimal ObjectId. Must be in `completed` status.
* `reasonDetail` (body, optional): String, max 500 characters.
* Client-supplied `amount`, `currency`, `status`, or `gatewayPaymentId` fields are strictly forbidden and rejected.

**Success:** `201 Created`

---

### Admin: Retry Failed Gateway Refund

**POST** `/admin/refunds/:refundId/retry`

Retries a previously failed gateway refund. Transitions status from `failed` to `pending`, increments `retryCount`, records `REFUND_RETRY_REQUESTED` audit event, and dispatches to the gateway.

**Authentication:** Required (`role: "admin"`).

**Invariants:**
* Succeeded refunds are terminal and reject retry attempts (`400 REFUND_ALREADY_SUCCEEDED`).
* Pending refunds reject concurrent retry attempts (`409 REFUND_IN_PROGRESS`).
* Reconciliation-required refunds reject retry attempts until authoritatively reconciled (`409 REFUND_RECONCILIATION_REQUIRED`).

**Success:** `200 OK`

---

### Admin: Reconcile Ambiguous or Post-Crash Refund

**POST** `/admin/refunds/:refundId/reconcile`

Authoritatively reconciles a refund with status `reconciliation_required` by querying Razorpay's refund history for deterministic references (`receipt: refund.refundNumber` or `notes.refundNumber`). If gateway success is discovered, transitions the refund to `succeeded` and creates the missing ledger entry without issuing a second payment call. If confirmed absent, transitions status to `failed` allowing safe operator retry.

**Authentication:** Required (`role: "admin"`).

**Success:** `200 OK`

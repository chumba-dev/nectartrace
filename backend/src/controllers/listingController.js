const prisma = require('../config/db');

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_HTTPS_IMAGE_URL_LENGTH = 2048;
const MAX_DATA_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_IMAGE_URL_LENGTH = Math.ceil(MAX_DATA_IMAGE_BYTES / 3) * 4 + 32;
const publicCooperativeSelect = {
  id: true,
  name: true,
  village: true,
  ward: true,
  county: true,
  walletAddress: true,
  registrationNumber: true,
  phone: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parsePositiveInteger(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validateDescription(value) {
  if (value === undefined || value === null) return { value: value ?? null };
  if (typeof value !== 'string') return { error: 'description must be text' };
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` };
  }
  return { value };
}

function validateImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'imageUrl is required and must be a non-empty string' };
  }

  const trimmed = value.trim();
  const dataImage = trimmed.match(/^data:image\/(jpeg|png|webp);base64,(.*)$/i);
  if (dataImage) {
    if (trimmed.length > MAX_DATA_IMAGE_URL_LENGTH) {
      return { error: 'imageUrl data image must not exceed 2 MiB when decoded' };
    }

    const payload = dataImage[2];
    if (
      !payload
      || payload.length % 4 === 1
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)
    ) {
      return { error: 'imageUrl must contain valid base64 image data' };
    }

    const decoded = Buffer.from(payload, 'base64');
    const normalizedPayload = payload.replace(/=+$/, '');
    const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
    if (!decoded.length || normalizedPayload !== normalizedDecoded) {
      return { error: 'imageUrl must contain valid base64 image data' };
    }
    if (decoded.length > MAX_DATA_IMAGE_BYTES) {
      return { error: 'imageUrl data image must not exceed 2 MiB when decoded' };
    }

    return { value: trimmed };
  }

  if (trimmed.length > MAX_HTTPS_IMAGE_URL_LENGTH) {
    return { error: `imageUrl HTTPS URLs must not exceed ${MAX_HTTPS_IMAGE_URL_LENGTH} characters` };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      return { error: 'imageUrl must be an HTTPS URL or a JPEG, PNG, or WebP data image' };
    }
  } catch (err) {
    return { error: 'imageUrl must be an HTTPS URL or a JPEG, PNG, or WebP data image' };
  }

  return { value: trimmed };
}

function canManageCooperative(req, cooperativeId) {
  return Boolean(req.cooperativeMembership?.isActive)
    && req.cooperativeMembership.cooperativeId === cooperativeId;
}

async function getAllocatedBatchQuantity(client, batchId, excludedListingId) {
  const listingWhere = { batchId };
  if (excludedListingId) listingWhere.id = { not: excludedListingId };

  const listingQuantity = await client.listing.aggregate({
    where: listingWhere,
    _sum: { quantityKg: true },
  });
  const orderedQuantity = await client.order.aggregate({
    where: {
      listing: { batchId },
      status: { not: 'CANCELLED' },
    },
    _sum: { quantityKg: true },
  });

  return (listingQuantity._sum.quantityKg || 0) + (orderedQuantity._sum.quantityKg || 0);
}

async function listListings(req, res, next) {
  try {
    const { cooperativeId, minPrice, maxPrice } = req.query;
    const where = { isAvailable: true };

    if (cooperativeId !== undefined) {
      const parsedCooperativeId = parsePositiveInteger(cooperativeId);
      if (!parsedCooperativeId) {
        return res.status(400).json({ success: false, message: 'cooperativeId must be a positive integer' });
      }
      where.cooperativeId = parsedCooperativeId;
    }

    let parsedMinPrice;
    let parsedMaxPrice;
    if (minPrice !== undefined) {
      parsedMinPrice = parsePositiveNumber(minPrice);
      if (!parsedMinPrice) {
        return res.status(400).json({ success: false, message: 'minPrice must be a positive finite number' });
      }
    }
    if (maxPrice !== undefined) {
      parsedMaxPrice = parsePositiveNumber(maxPrice);
      if (!parsedMaxPrice) {
        return res.status(400).json({ success: false, message: 'maxPrice must be a positive finite number' });
      }
    }
    if (parsedMinPrice && parsedMaxPrice && parsedMinPrice > parsedMaxPrice) {
      return res.status(400).json({ success: false, message: 'minPrice cannot exceed maxPrice' });
    }
    if (parsedMinPrice || parsedMaxPrice) {
      where.pricePerKg = {};
      if (parsedMinPrice) where.pricePerKg.gte = parsedMinPrice;
      if (parsedMaxPrice) where.pricePerKg.lte = parsedMaxPrice;
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        batch: { select: { batchId: true, village: true, moistureContent: true, harvestDate: true } },
        cooperative: { select: { id: true, name: true, village: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: listings, count: listings.length });
  } catch (err) { next(err); }
}

async function getListing(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Listing id must be a positive integer' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { batch: true, cooperative: { select: publicCooperativeSelect } },
    });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    res.json({ success: true, data: listing });
  } catch (err) { next(err); }
}

async function createListing(req, res, next) {
  try {
    const { batchId, quantityKg, pricePerKg, description, imageUrl } = req.body;
    const parsedBatchId = parsePositiveInteger(batchId);
    const parsedQuantityKg = parsePositiveNumber(quantityKg);
    const parsedPricePerKg = parsePositiveNumber(pricePerKg);

    if (!parsedBatchId) {
      return res.status(400).json({ success: false, message: 'batchId must be a positive integer' });
    }
    if (!parsedQuantityKg) {
      return res.status(400).json({ success: false, message: 'quantityKg must be a positive finite number' });
    }
    if (!parsedPricePerKg) {
      return res.status(400).json({ success: false, message: 'pricePerKg must be a positive finite number' });
    }

    const validatedDescription = validateDescription(description);
    if (validatedDescription.error) {
      return res.status(400).json({ success: false, message: validatedDescription.error });
    }
    const validatedImage = validateImageUrl(imageUrl);
    if (validatedImage.error) {
      return res.status(400).json({ success: false, message: validatedImage.error });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "HoneyBatch" WHERE "id" = ${parsedBatchId} FOR UPDATE`;
      const batch = await tx.honeyBatch.findUnique({ where: { id: parsedBatchId } });
      if (!batch) return { error: { status: 404, message: 'Batch not found' } };
      if (!canManageCooperative(req, batch.cooperativeId)) {
        return { error: { status: 403, message: 'You can only list honey from your cooperative' } };
      }
      if (batch.status !== 'AVAILABLE') {
        return { error: { status: 400, message: 'Only available batches can be listed' } };
      }

      const allocatedQuantity = await getAllocatedBatchQuantity(tx, batch.id);
      const availableQuantity = Math.max(0, batch.weightKg - allocatedQuantity);
      if (parsedQuantityKg > availableQuantity) {
        return {
          error: {
            status: 400,
            message: `quantityKg exceeds the batch's available capacity of ${availableQuantity} kg`,
          },
        };
      }

      const listing = await tx.listing.create({
        data: {
          batchId: batch.id,
          cooperativeId: batch.cooperativeId,
          quantityKg: parsedQuantityKg,
          pricePerKg: parsedPricePerKg,
          description: validatedDescription.value,
          imageUrl: validatedImage.value,
        },
        include: { batch: true, cooperative: true },
      });

      return { listing };
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.status(201).json({ success: true, data: result.listing });
  } catch (err) { next(err); }
}

async function updateListing(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Listing id must be a positive integer' });
    }

    const data = {};
    if (hasOwn(req.body, 'quantityKg')) {
      const quantityKg = parsePositiveNumber(req.body.quantityKg);
      if (!quantityKg) {
        return res.status(400).json({ success: false, message: 'quantityKg must be a positive finite number' });
      }
      data.quantityKg = quantityKg;
    }
    if (hasOwn(req.body, 'pricePerKg')) {
      const pricePerKg = parsePositiveNumber(req.body.pricePerKg);
      if (!pricePerKg) {
        return res.status(400).json({ success: false, message: 'pricePerKg must be a positive finite number' });
      }
      data.pricePerKg = pricePerKg;
    }
    if (hasOwn(req.body, 'description')) {
      const description = validateDescription(req.body.description);
      if (description.error) {
        return res.status(400).json({ success: false, message: description.error });
      }
      data.description = description.value;
    }
    if (hasOwn(req.body, 'imageUrl')) {
      const image = validateImageUrl(req.body.imageUrl);
      if (image.error) {
        return res.status(400).json({ success: false, message: image.error });
      }
      data.imageUrl = image.value;
    }
    if (hasOwn(req.body, 'isAvailable')) {
      if (typeof req.body.isAvailable !== 'boolean') {
        return res.status(400).json({ success: false, message: 'isAvailable must be a boolean' });
      }
      data.isAvailable = req.body.isAvailable;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one of quantityKg, pricePerKg, description, imageUrl, or isAvailable',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.listing.findUnique({ where: { id }, select: { batchId: true } });
      if (!existing) return { error: { status: 404, message: 'Listing not found' } };

      await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "HoneyBatch" WHERE "id" = ${existing.batchId} FOR UPDATE`;

      const listing = await tx.listing.findUnique({
        where: { id },
        include: { batch: true },
      });
      if (!listing) return { error: { status: 404, message: 'Listing not found' } };
      if (!canManageCooperative(req, listing.cooperativeId)) {
        return { error: { status: 403, message: 'You cannot update this listing' } };
      }
      if (listing.batch.status !== 'AVAILABLE') {
        return { error: { status: 400, message: 'Listings can only be updated while their batch is available' } };
      }

      const effectiveQuantity = data.quantityKg ?? listing.quantityKg;
      if (data.isAvailable === true && effectiveQuantity <= 0) {
        return { error: { status: 400, message: 'A listing with no quantity cannot be made available' } };
      }

      if (data.quantityKg !== undefined) {
        const allocatedQuantity = await getAllocatedBatchQuantity(tx, listing.batchId, listing.id);
        const availableQuantity = Math.max(0, listing.batch.weightKg - allocatedQuantity);
        if (data.quantityKg > availableQuantity) {
          return {
            error: {
              status: 400,
              message: `quantityKg exceeds the batch's available capacity of ${availableQuantity} kg`,
            },
          };
        }
      }

      const updated = await tx.listing.update({ where: { id }, data });
      return { listing: updated };
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.json({ success: true, data: result.listing });
  } catch (err) { next(err); }
}

module.exports = { listListings, getListing, createListing, updateListing };

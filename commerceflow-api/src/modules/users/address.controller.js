
import Address from "./address.model.js";
import AppError from "../../common/errors/app-error.js";

async function createAddress(req, res, next) {
  try {
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault
    } = req.body;

    if (isDefault) {
      await Address.updateMany(
        {
          user: req.user._id,
          isDefault: true
        },
        {
          $set: {
            isDefault: false
          }
        }
      );
    }

    const address = await Address.create({
      user: req.user._id,
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault
    });

    return res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: {
        address
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

async function getAddresses(req, res, next) {
  try {
    const addresses = await Address.find({
      user: req.user._id
    }).sort({
      isDefault: -1,
      createdAt: -1
    });

    return res.status(200).json({
      success: true,
      message: "Addresses retrieved successfully",
      data: {
        addresses
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user._id
    });

    if (!address) {
      throw new AppError(
        "Address not found",
        404,
        [],
        "ADDRESS_NOT_FOUND"
      );
    }

    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault
    } = req.body;

    if (isDefault === true) {
      await Address.updateMany(
        {
          user: req.user._id,
          _id: { $ne: address._id },
          isDefault: true
        },
        {
          $set: {
            isDefault: false
          }
        }
      );
    }

    if (fullName !== undefined) {
      address.fullName = fullName;
    }

    if (phone !== undefined) {
      address.phone = phone;
    }

    if (addressLine1 !== undefined) {
      address.addressLine1 = addressLine1;
    }

    if (addressLine2 !== undefined) {
      address.addressLine2 = addressLine2;
    }

    if (city !== undefined) {
      address.city = city;
    }

    if (state !== undefined) {
      address.state = state;
    }

    if (postalCode !== undefined) {
      address.postalCode = postalCode;
    }

    if (country !== undefined) {
      address.country = country;
    }

    if (isDefault !== undefined) {
      address.isDefault = isDefault;
    }

    await address.save();

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: {
        address
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user._id
    });

    if (!address) {
      throw new AppError(
        "Address not found",
        404,
        [],
        "ADDRESS_NOT_FOUND"
      );
    }

    await Address.updateMany(
      {
        user: req.user._id,
        _id: { $ne: address._id },
        isDefault: true
      },
      {
        $set: {
          isDefault: false
        }
      }
    );

    address.isDefault = true;

    await address.save();

    return res.status(200).json({
      success: true,
      message: "Default address updated successfully",
      data: {
        address
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user._id
    });

    if (!address) {
      throw new AppError(
        "Address not found",
        404,
        [],
        "ADDRESS_NOT_FOUND"
      );
    }

    const wasDefault = address.isDefault;

    await Address.deleteOne({
      _id: address._id
    });

    if (wasDefault) {
      const nextAddress = await Address.findOne({
        user: req.user._id
      }).sort({
        createdAt: -1
      });

      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
      data: {},
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export {
  createAddress,
  getAddresses,
  updateAddress,
  setDefaultAddress,
  deleteAddress
};


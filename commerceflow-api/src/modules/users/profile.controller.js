async function getProfile(
  req,
  res,
  next
) {
  try {
    return res
      .status(200)
      .json({
        success: true,

        message:
          "User profile retrieved successfully",

        data: {
          user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            createdAt: req.user.createdAt
          }
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default getProfile;
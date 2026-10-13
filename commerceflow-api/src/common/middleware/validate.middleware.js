import AppError from "../errors/app-error.js";

function validate(schema) {
return (req, res, next) => {
const result = schema.safeParse({
body: req.body,
query: req.query,
params: req.params
});

if (!result.success) {
  const errors = result.error.issues.map(
    (issue) => ({
      field: issue.path.join("."),
      message: issue.message
    })
  );

  return next(
    new AppError(
      "Validation failed",
      400,
      errors,
      "VALIDATION_ERROR"
    )
  );
}

if (result.data.body !== undefined) {
  req.body = result.data.body;
}

if (result.data.query !== undefined) {
  Object.assign(
    req.query,
    result.data.query
  );
}

if (result.data.params !== undefined) {
  req.params = result.data.params;
}

return next();

};
}

export default validate;

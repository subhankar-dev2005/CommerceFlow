function escapeRegex(string) {
  if (typeof string !== "string") {
    return "";
  }

  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default escapeRegex;
export { escapeRegex };

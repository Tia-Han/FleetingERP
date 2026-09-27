// Reject SQLite LIMIT -1 and malformed values instead of accidentally removing limits.
function validatePagination(req, res, next) {
  for (const field of ['page', 'limit']) {
    const value = req.query[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(Number(value)) || Number(value) > (field === 'limit' ? 500 : 1000000)) {
      return res.status(400).json({ success: false, message: field + '必须是正整数，page 最大1000000，limit 最大500' });
    }
  }
  // A caller supplying only limit still requests pagination.
  if (req.query.limit !== undefined && req.query.page === undefined) req.query.page = '1';
  next();
}
module.exports = { validatePagination };

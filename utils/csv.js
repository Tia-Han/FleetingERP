// Quote every field so embedded line breaks cannot corrupt record boundaries.
// Prefix untrusted formula-like text; preserve actual numeric values as numbers.
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^(?:[\t\r\n]|\s*[=+@-])/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
module.exports = { csvCell };

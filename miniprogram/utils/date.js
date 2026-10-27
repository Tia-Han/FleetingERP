// Calendar dates follow the device local timezone, not UTC.
function localDate(value = new Date()) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
module.exports = { localDate };

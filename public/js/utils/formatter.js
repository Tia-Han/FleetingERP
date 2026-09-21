const Formatter = {
  money(val) { return '¥' + Number(val || 0).toFixed(2); },
  escape(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  date(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  fullDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  movementTypeLabel(type) {
    const labels = { 'in': '入库', 'out': '出库', 'sale': '销售', 'split': '分装', 'transfer_in': '调入', 'transfer_out': '调出', 'loss': '损耗', 'check_in': '盘盈', 'check_out': '盘亏' };
    return labels[type] || type;
  }
};

window.esc = Formatter.escape;

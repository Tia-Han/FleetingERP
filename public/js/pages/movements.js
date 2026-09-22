const MovementsPage = {
  currentPage: 1,
  pageSize: 50,
  total: 0,

  async render() {
    this.currentPage = 1;
    const locId = App.currentLocation || '';
    const locRes = await API.getLocations();
    const locations = locRes.success ? locRes.data : [];
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>库存变动流水</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0"><label>开始日期</label><input type="date" id="mv-start" value="${weekAgo}"></div>
          <div class="form-group" style="margin:0"><label>结束日期</label><input type="date" id="mv-end" value="${today}"></div>
          <div class="form-group" style="margin:0"><label>类型</label><select id="mv-type"><option value="">全部</option><option value="in">入库</option><option value="out">出库</option><option value="sale">销售</option><option value="split">分装</option><option value="transfer_in">调入</option><option value="transfer_out">调出</option><option value="loss">损耗</option></select></div>
          <div class="form-group" style="margin:0"><label>场所</label><select id="mv-location"><option value="">全部</option>${locations.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        </div>
        <button class="btn btn-primary" onclick="MovementsPage.load(1)">查询</button>
      </div>
      <div id="mv-results">加载中...</div>`;
    this.load(1);
  },

  async load(page) {
    if (page) this.currentPage = page;
    const params = {};
    const start = document.getElementById('mv-start').value;
    const end = document.getElementById('mv-end').value;
    const type = document.getElementById('mv-type').value;
    const loc = document.getElementById('mv-location').value;
    if (start) params.start_date = start;
    if (end) params.end_date = end + ' 23:59:59';
    if (type) params.movement_type = type;
    if (loc) params.location_id = loc;
    params.page = this.currentPage;
    params.limit = this.pageSize;
    const div = document.getElementById('mv-results');
    div.innerHTML = '<p>加载中...</p>';
    const [mvRes, sumRes] = await Promise.all([API.getMovements(params), API.getSummary({ ...params, page: undefined, limit: undefined })]);
    if (!mvRes.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    if (mvRes.data.length === 0) { div.innerHTML = '<div class="card"><p>暂无变动记录</p></div>'; return; }
    this.total = mvRes.total || mvRes.data.length;
    const totalPages = Math.ceil(this.total / this.pageSize);
    let summaryHtml = '';
    if (sumRes.success && sumRes.data.length > 0) {
      summaryHtml = `<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:4px">
        ${sumRes.data.map(s => `<span style="margin-right:16px">${Formatter.movementTypeLabel(s.movement_type)}: ${s.count}次 / ${s.total_quantity}件 / ${Formatter.money(s.total_value)}</span>`).join('')}
      </div>`;
    }
    const startIdx = (this.currentPage - 1) * this.pageSize + 1;
    const endIdx = startIdx + mvRes.data.length - 1;
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <span style="font-size:13px;color:#7f8c8d">第 ${startIdx}-${endIdx} 条 / 共 ${this.total} 条</span>
        <div style="display:flex;gap:4px">
          ${this.currentPage > 1 ? `<button class="btn btn-sm" onclick="MovementsPage.load(${this.currentPage - 1})">上一页</button>` : ''}
          <span style="padding:4px 8px;font-size:13px">${this.currentPage} / ${totalPages}</span>
          ${this.currentPage < totalPages ? `<button class="btn btn-sm" onclick="MovementsPage.load(${this.currentPage + 1})">下一页</button>` : ''}
        </div>
      </div>`;
    }
    div.innerHTML = `<div class="card">
      ${summaryHtml}
      <div class="table-wrapper"><table><thead><tr><th>时间</th><th>场所</th><th>商品</th><th>规格</th><th>类型</th><th>数量</th><th>成本</th><th>操作人</th><th>供应商/备注</th></tr></thead><tbody>
        ${mvRes.data.map(m => `<tr>
          <td>${Formatter.date(m.created_at)}</td><td>${esc(m.location_name)}</td><td>${esc(m.product_name)}</td><td>${esc(m.volume)}</td>
          <td><span class="badge ${m.quantity > 0 ? 'badge-success' : 'badge-warning'}">${Formatter.movementTypeLabel(m.movement_type)}</span></td>
          <td style="color:${m.quantity > 0 ? '#27ae60' : '#e74c3c'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
          <td>${m.unit_cost ? Formatter.money(m.unit_cost) : '-'}</td><td>${esc(m.operator || '-')}</td>
          <td>${m.movement_type === 'in' ? [m.supplier, m.order_remark].filter(Boolean).join(' / ') || '-' : '-'}</td>
        </tr>`).join('')}
      </tbody></table></div>
      ${paginationHtml}
    </div>`;
  }
};

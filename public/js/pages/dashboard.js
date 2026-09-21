const DashboardPage = {
  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<p>加载中...</p>';
    const params = App.currentLocation ? { location_id: App.currentLocation } : {};
    const res = await API.getDashboard(params);
    if (!res.success) { content.innerHTML = '<p>数据加载失败</p>'; return; }
    const d = res.data;
    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="label">SKU 总数</div><div class="value">${d.sku_count}</div></div>
        <div class="stat-card"><div class="label">库存总价值</div><div class="value">${Formatter.money(d.stock_value)}</div></div>
        <div class="stat-card"><div class="label">今日销售额</div><div class="value">${Formatter.money(d.today_sales_amount)}</div></div>
      </div>
      <div class="card">
        <h2>库存预警 (${d.alerts.length})</h2>
        ${d.alerts.length === 0 ? '<p>暂无预警</p>' : `<table><thead><tr><th>商品</th><th>规格</th><th>当前库存</th><th>阈值</th><th>场所</th></tr></thead><tbody>
          ${d.alerts.map(a => `<tr><td>${esc(a.product_name)}</td><td>${esc(a.volume)}</td><td><span class="badge badge-warning">${a.quantity}</span></td><td>${a.low_stock_threshold}</td><td>${esc(a.location_name)}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
      <div class="card">
        <h2>今日操作</h2>
        ${d.today_movements.length === 0 ? '<p>今日暂无操作</p>' : `<table><thead><tr><th>操作类型</th><th>次数</th></tr></thead><tbody>
          ${d.today_movements.map(m => `<tr><td>${Formatter.movementTypeLabel(m.movement_type)}</td><td>${m.count}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
      <div class="card">
        <h2>快捷操作</h2>
        <div style="display:flex;gap:12px">
          <button class="btn btn-primary" onclick="App.navigate('stockIn')">入库</button>
          <button class="btn btn-primary" onclick="App.navigate('split')">分装</button>
          <button class="btn btn-primary" onclick="App.navigate('sales')">开单</button>
          <button class="btn btn-primary" onclick="App.navigate('transfer')">调拨</button>
        </div>
      </div>`;
  }
};

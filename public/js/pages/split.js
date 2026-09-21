const SplitPage = {
  sourceSku: null,
  targets: [],

  async render() {
    this.sourceSku = null;
    this.targets = [];
    const locId = App.currentLocation || 1;
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>分装操作</h2>
        <div class="form-group"><label>分装场所</label><select id="sp-location"></select></div>
        <div class="card" style="background:#f8f9fa">
          <h3>步骤 1：选择源商品</h3>
          <div style="display:flex;gap:8px">
            <input type="text" id="sp-search" placeholder="扫码或搜索整装产品（支持单字模糊）" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px">
            <button class="btn btn-success" onclick="Scanner.usbScan(code => SplitPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info" onclick="Scanner.cameraScan(code => SplitPage.onBarcodeScan(code))">相机扫码</button>
          </div>
          <div id="sp-source-info"></div>
        </div>
        <div id="sp-step2" style="display:none">
          <div class="card" style="background:#f8f9fa">
            <h3>步骤 2：指定消耗</h3>
            <div style="display:flex;gap:16px;align-items:center">
              <div><label>消耗瓶数: </label><input type="number" id="sp-quantity" value="1" min="1" style="width:60px" onchange="SplitPage.updateVolume()"></div>
              <div id="sp-available-volume" style="font-weight:bold;color:#3498db"></div>
            </div>
            <div style="margin-top:8px">
              <label><input type="radio" name="sp-mode" value="1" checked onchange="SplitPage.updateVolume()"> 整瓶分装（清空原瓶）</label>
              <label style="margin-left:16px"><input type="radio" name="sp-mode" value="0" onchange="SplitPage.updateVolume()"> 部分使用</label>
            </div>
          </div>
          <div class="card" style="background:#f8f9fa">
            <h3>步骤 3：分装目标</h3>
            <table><thead><tr><th>目标容量(ml)</th><th>数量</th><th>小计体积</th><th>操作</th></tr></thead><tbody id="sp-targets-body"></tbody></table>
            <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="SplitPage.addTarget()">+ 添加目标</button>
          </div>
          <div class="card" style="background:#f8f9fa">
            <h3>步骤 4：体积校验</h3>
            <div id="sp-volume-check"></div>
            <div class="form-group" style="margin-top:12px"><label>损耗体积(ml)（可选）</label><input type="number" id="sp-waste" step="0.1" min="0" style="width:100px" oninput="SplitPage.updateVolume()"></div>
            <button class="btn btn-success" style="margin-top:12px" onclick="SplitPage.submit()">确认分装</button>
          </div>
        </div>
      </div>`;
    const locRes = await API.getLocations();
    if (locRes.success) {
      document.getElementById('sp-location').innerHTML = locRes.data.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    }
    SearchSuggest.attach({
      inputId: 'sp-search', resultsId: 'sp-source-info', minLength: 1,
      searchFn: async (kw) => {
        const barcodeRes = await API.getSkuByBarcode(kw);
        if (barcodeRes.success && barcodeRes.data.spec_type === '整装') return [barcodeRes.data];
        const res = await API.getProducts();
        if (!res.success) return [];
        const items = [];
        for (const p of res.data) {
          if (SearchSuggest.fuzzyMatch(p.name, kw) || SearchSuggest.fuzzyMatch(p.brand_name, kw)) {
            for (const s of p.skus) {
              if (s.spec_type === '整装' && s.volume_ml > 0) {
                items.push({ id: s.id, product_name: p.name, volume: s.volume, volume_ml: s.volume_ml, sku_code: s.sku_code });
              }
            }
          }
        }
        return items;
      },
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${esc(s.product_name)} - ${esc(s.volume)} (${s.sku_code})</span><span style="color:#999">${s.volume_ml}ml</span></div>`,
      onSelect: (s) => this.setSource(s)
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.setSource(sku));
  },

  async searchSource() {
    const keyword = document.getElementById('sp-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (barcodeRes.success) { this.setSource(barcodeRes.data); return; }
    const res = await API.getProducts();
    if (res.success) {
      const matched = res.data.filter(p => p.name.includes(keyword));
      const results = document.getElementById('sp-source-info');
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配商品</p>'; return; }
      results.innerHTML = matched.flatMap(p =>
        p.skus.filter(s => s.spec_type === '整装' && s.volume_ml > 0).map(s => {
          const skuData = {id: s.id, product_name: p.name, volume: s.volume, volume_ml: s.volume_ml, sku_code: s.sku_code};
          return `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick='SplitPage.setSource(${JSON.stringify(skuData).replace(/'/g,"&#39;")})'>
            <span>${esc(p.name)} - ${esc(s.volume)} (${s.sku_code})</span><span>${s.volume_ml}ml</span></div>`;
        }).join('')
      ).join('');
    }
  },

  async setSource(sku) {
    const locEl = document.getElementById('sp-location');
    if (!locEl || !locEl.value) {
      const locRes = await API.getLocations();
      if (locRes.success) {
        const locId = App.currentLocation || 1;
        locEl.innerHTML = locRes.data.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
      }
      if (!locEl || !locEl.value) {
        App.toast('请先选择场所', 'error');
        return;
      }
    }
    const balRes = await API.getBalances({ location_id: locEl.value });
    let stock = 0;
    if (balRes.success) {
      const found = balRes.data.find(b => b.sku_code === sku.sku_code);
      if (found) stock = found.quantity;
    }
    this.sourceSku = { ...sku, stock };
    this.targets = [];
    document.getElementById('sp-source-info').innerHTML = `
      <div style="margin-top:12px;padding:12px;background:#d4edda;border-radius:4px">
        已选: <strong>${esc(sku.product_name)} - ${esc(sku.volume)}</strong> | 容量: <strong>${sku.volume_ml}ml</strong> | 当前库存: <strong>${stock} 瓶</strong>
      </div>`;
    document.getElementById('sp-step2').style.display = 'block';
    document.getElementById('sp-search').value = '';
    this.renderTargets();
    this.updateVolume();
  },

  addTarget() { this.targets.push({ unit_volume: 2, quantity: 1 }); this.renderTargets(); this.updateVolume(); },

  renderTargets() {
    const tbody = document.getElementById('sp-targets-body');
    if (!tbody) return;
    tbody.innerHTML = this.targets.map((t, idx) => `<tr>
      <td><input type="number" value="${t.unit_volume}" min="0.5" step="0.5" style="width:80px;padding:4px;border:1px solid #ddd;border-radius:4px" onchange="SplitPage.updateTarget(${idx}, 'unit_volume', this.value)"></td>
      <td><input type="number" value="${t.quantity}" min="1" style="width:60px;padding:4px;border:1px solid #ddd;border-radius:4px" onchange="SplitPage.updateTarget(${idx}, 'quantity', this.value)"></td>
      <td>${(t.unit_volume * t.quantity).toFixed(1)} ml</td>
      <td><button class="btn btn-danger btn-sm" onclick="SplitPage.removeTarget(${idx})">删除</button></td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#999">点击下方添加目标规格</td></tr>';
  },

  updateTarget(idx, field, val) { this.targets[idx][field] = parseFloat(val) || 0; this.renderTargets(); this.updateVolume(); },
  removeTarget(idx) { this.targets.splice(idx, 1); this.renderTargets(); this.updateVolume(); },

  updateVolume() {
    if (!this.sourceSku) return;
    const qtyEl = document.getElementById('sp-quantity');
    const qty = parseInt(qtyEl ? qtyEl.value : 1);
    const available = qty * this.sourceSku.volume_ml;
    const availEl = document.getElementById('sp-available-volume');
    if (availEl) availEl.textContent = `可分装总体积: ${available} ml`;
    const allocated = this.targets.reduce((sum, t) => sum + t.unit_volume * t.quantity, 0);
    const wasteEl = document.getElementById('sp-waste');
    const wasteInput = parseFloat(wasteEl ? wasteEl.value : 0);
    const modeEl = document.querySelector('input[name="sp-mode"]:checked');
    const mode = parseInt(modeEl ? modeEl.value : 1);
    let waste = wasteInput;
    let remaining = available - allocated - waste;
    if (mode === 1 && waste === 0 && allocated < available) { waste = available - allocated; remaining = 0; }
    if (wasteEl && waste !== wasteInput) { wasteEl.value = waste.toFixed(1); }
    const checkDiv = document.getElementById('sp-volume-check');
    if (!checkDiv) return;
    const pct = available > 0 ? Math.min(100, (allocated / available * 100)) : 0;
    const overAllocated = allocated > available;
    checkDiv.innerHTML = `
      <div class="progress-bar"><div class="fill" style="width: ${overAllocated ? 100 : pct}%; background: ${overAllocated ? '#e74c3c' : '#3498db'}">${pct.toFixed(0)}%</div></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px">
        <span>可用: <strong>${available} ml</strong></span>
        <span>已分配: <strong style="color:${overAllocated ? '#e74c3c' : '#3498db'}">${allocated.toFixed(1)} ml</strong></span>
        <span>损耗: <strong style="color:#f39c12">${waste.toFixed(1)} ml</strong></span>
        <span>剩余: <strong>${remaining.toFixed(1)} ml</strong></span>
      </div>
      ${overAllocated ? '<p style="color:#e74c3c;margin-top:8px">已分配体积超出可用总量，无法提交</p>' : remaining === 0 ? '<p style="color:#27ae60;margin-top:8px">体积校验通过，原瓶将清空</p>' : mode === 0 ? '<p style="color:#f39c12;margin-top:8px">部分使用模式，原瓶减1，剩余液体记为损耗</p>' : '<p style="color:#27ae60;margin-top:8px">校验通过</p>'}`;
  },

  async submit() {
    if (!this.sourceSku) return App.toast('请先选择源商品', 'error');
    if (this.targets.length === 0) return App.toast('请添加分装目标', 'error');
    const qty = parseInt(document.getElementById('sp-quantity').value);
    const available = qty * this.sourceSku.volume_ml;
    const allocated = this.targets.reduce((sum, t) => sum + t.unit_volume * t.quantity, 0);
    if (allocated > available) return App.toast('已分配体积超出可用总量', 'error');
    const mode = parseInt(document.querySelector('input[name="sp-mode"]:checked').value);
    const waste = parseFloat(document.getElementById('sp-waste').value) || 0;
    const data = {
      location_id: parseInt(document.getElementById('sp-location').value),
      source_sku_id: this.sourceSku.id,
      source_quantity: qty,
      bottle_consumed: mode === 1,
      waste_volume: waste,
      items: this.targets.map(t => ({ target_sku_id: null, quantity: t.quantity, unit_volume: t.unit_volume })),
      operator: App.currentUser.name
    };
    const res = await API.split(data);
    if (res.success) { App.toast('分装成功'); this.render(); } else App.toast(res.message, 'error');
  }
};

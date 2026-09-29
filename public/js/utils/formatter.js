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
  dateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  movementTypeLabel(type) {
    const labels = { 'in': '入库', 'out': '出库', 'sale': '销售', 'split': '分装', 'transfer_in': '调入', 'transfer_out': '调出', 'loss': '损耗', 'check_in': '盘盈', 'check_out': '盘亏' };
    return labels[type] || type;
  }
};

window.esc = Formatter.escape;

// Dynamic arguments are serialized as data, never executable event-handler text.
Formatter.actions = Object.create(null);
Formatter.action = (name, ...args) => `data-action="${Formatter.escape(name)}" data-args="${Formatter.escape(JSON.stringify(args))}"`;
Formatter.onAction = (name, handler) => { Formatter.actions[name] = handler; };
document.addEventListener('click', event => {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const handler = Formatter.actions[element.dataset.action];
  if (!handler) return;
  event.preventDefault();
  try {
    const args = JSON.parse(element.dataset.args);
    if(element._pendingAction) return;
    const result=handler(...args);
    Formatter.trackPending(element,result);
  } catch (error) { console.error(error); }
});


// Only registered functions may run. No eval, Function constructor or executable attributes.
Formatter.events = Object.create(null);
Formatter.event = (type, name, ...args) => `data-ui-${type}="${Formatter.escape(name)}" data-ui-${type}-args="${Formatter.escape(JSON.stringify(args))}"`;
Formatter.onEvent = (name, handler) => { Formatter.events[name] = handler; };
for (const type of ['click', 'change', 'input', 'keydown', 'error']) {
  document.addEventListener(type, event => {
    const attribute = `data-ui-${type}`;
    let element = event.target.closest?.(`[${attribute}]`);
    while (element) {
      const handler = Formatter.events[element.getAttribute(attribute)];
      if (handler) {
        try {
          const args = JSON.parse(element.getAttribute(`${attribute}-args`) || '[]');
          if (!Array.isArray(args)) throw new Error('Invalid event arguments');
          if(type==='click' && element._pendingAction) return;
          const result = handler.call(element, event, ...args);
          if (result === false) event.preventDefault();
          if(type==='click') Formatter.trackPending(element,result);
          else Promise.resolve(result).catch(error => console.error(error));
        } catch (error) { console.error(error); }
      }
      if (event.cancelBubble || type === 'error') break;
      element = element.parentElement?.closest(`[${attribute}]`);
    }
  }, type === 'error');
}

Formatter.trackPending=(element,result)=>{
  if(!result || typeof result.then!=='function') return;
  element._pendingAction=true;
  const disabled=element.disabled;
  if(element.tagName==='BUTTON') element.disabled=true;
  Promise.resolve(result).catch(error=>console.error(error)).finally(()=>{
    element._pendingAction=false;
    if(element.tagName==='BUTTON') element.disabled=disabled;
  });
};

// Async read results belong to a particular view/tab and latest request, not just an element ID.
Formatter.viewRequest=(owner,key)=>{
  const version=typeof App==='undefined'?0:App._viewVersion;
  const tab=owner.currentTab;
  owner._readRequests ||= Object.create(null);
  const request=owner._readRequests[key]=(owner._readRequests[key]||0)+1;
  return ()=>owner._readRequests[key]===request && owner.currentTab===tab && (typeof App==='undefined'||App._viewVersion===version);
};

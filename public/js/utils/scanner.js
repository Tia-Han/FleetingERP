const Scanner = {
  _active: false,
  _buffer: '',
  _lastTime: 0,
  _callback: null,
  _handler: null,
  _timeoutTimer: null,
  _cameraStream: null,
  _cameraInterval: null,
  _barcodeDetector: null,
  _cameraCallback: null,
  _scanCount: 0,
  _detectMode: null,
  _detectionStarted: false,
  _scanCompleted: false,
  _cameraStopLoop: null,

  usbScan(callback) {
    if (this._active) { this.stopUsbScan(); }
    this._callback = callback;
    this._active = true;
    this._buffer = '';
    this._lastTime = Date.now();

    const overlay = document.createElement('div');
    overlay.id = 'usb-scan-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center">' +
      '<h3 style="margin-bottom:16px">扫码枪模式</h3>' +
      '<p style="color:#666;margin-bottom:16px">请用 USB 扫码枪扫描商品条码</p>' +
      '<div style="border:2px dashed #3498db;border-radius:8px;padding:24px;margin-bottom:16px">' +
      '<p style="color:#999;margin:0">等待扫码中...</p></div>' +
      '<p style="color:#999;font-size:13px;margin-bottom:12px">没有扫码枪？可手动输入条码：</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input type="text" id="manual-barcode" placeholder="输入条码数字" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px">' +
      '<button id="usb-manual-btn" class="btn btn-primary" style="padding:10px 20px;white-space:nowrap">确认</button></div>' +
      '<button id="usb-cancel-btn" class="btn" style="width:100%">取消</button></div>';
    document.body.appendChild(overlay);

    const input = document.getElementById('manual-barcode');
    const self = this;

    document.getElementById('usb-manual-btn').addEventListener('click', function() { self.submitManual(); });
    document.getElementById('usb-cancel-btn').addEventListener('click', function() { self.stopUsbScan(); });
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (self._timeoutTimer) { clearTimeout(self._timeoutTimer); self._timeoutTimer = setTimeout(function() { if (self._active) self.stopUsbScan(); }, 120000); }
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          var code = input.value.trim();
          if (code.length >= 4 && self._active) {
            self._active = false;
            self.stopUsbScan();
            if (self._callback) self._callback(code);
          }
        }
      });
    }

    this._handler = function(e) {
      if (!self._active) return;
      var isInput = e.target && e.target.tagName === 'INPUT';
      var now = Date.now();
      if (now - self._lastTime > 80) self._buffer = '';
      self._lastTime = now;

      if (e.key === 'Enter') {
        if (isInput) {
          var inputVal = e.target.value.trim();
          if (inputVal.length >= 4 && self._active) {
            self._active = false;
            e.preventDefault(); e.stopPropagation();
            self.stopUsbScan();
            if (self._callback) self._callback(inputVal);
          }
          return;
        }
        if (self._buffer.length >= 4) {
          self._active = false;
          e.preventDefault(); e.stopPropagation();
          var code = self._buffer.trim();
          self.stopUsbScan();
          if (self._callback) self._callback(code);
        } else {
          self._buffer = '';
        }
        return;
      }
      if (e.key && e.key.length === 1) {
        if (isInput) {
          self._buffer = '';
          return;
        }
        self._buffer += e.key;
      }
    };
    document.addEventListener('keydown', this._handler, true);

    this._timeoutTimer = setTimeout(function() { if (self._active) self.stopUsbScan(); }, 60000);
  },

  submitManual() {
    if (!this._active) return;
    var input = document.getElementById('manual-barcode');
    if (!input) return;
    var code = input.value.trim();
    if (!code) return;
    this._active = false;
    this.stopUsbScan();
    if (this._callback) this._callback(code);
  },

  stopUsbScan() {
    this._active = false;
    if (this._handler) { document.removeEventListener('keydown', this._handler, true); this._handler = null; }
    if (this._timeoutTimer) { clearTimeout(this._timeoutTimer); this._timeoutTimer = null; }
    this._buffer = '';
    var overlay = document.getElementById('usb-scan-overlay');
    if (overlay) overlay.remove();
  },

  async cameraScan(callback) {
    if (this._cameraStream) { this.stopCamera(); }

    var isHttps = location.protocol === 'https:';
    var isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    this._cameraCallback = callback;
    this._scanCount = 0;
    this._detectionStarted = false;
    this._scanCompleted = false;

    var overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';

    var container = document.createElement('div');
    container.style.cssText = 'max-width:90%;width:400px;text-align:center';
    overlay.appendChild(container);

    var title = document.createElement('h3');
    title.textContent = '扫码';
    title.style.cssText = 'color:#fff;margin-bottom:16px';
    container.appendChild(title);

    var videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'position:relative;width:100%;max-width:350px;margin:0 auto 12px;border-radius:8px;overflow:hidden;background:#222;aspect-ratio:4/3';
    container.appendChild(videoWrap);

    var video = document.createElement('video');
    video.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    videoWrap.appendChild(video);

    var scanFrame = document.createElement('div');
    scanFrame.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85%;height:30%;border:2px solid #00ff00;border-radius:8px;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,0.4)';
    videoWrap.appendChild(scanFrame);

    var scanLine = document.createElement('div');
    scanLine.style.cssText = 'position:absolute;top:50%;left:8%;width:84%;height:2px;background:#00ff00;box-shadow:0 0 8px #00ff00;animation:scanline 1.5s ease-in-out infinite;pointer-events:none';
    videoWrap.appendChild(scanLine);

    var statusP = document.createElement('p');
    statusP.id = 'camera-status';
    statusP.textContent = '正在启动摄像头...';
    statusP.style.cssText = 'color:#fff;margin-top:8px;font-size:14px;min-height:20px';
    container.appendChild(statusP);

    var manualDiv = document.createElement('div');
    manualDiv.style.cssText = 'margin-top:16px;background:#fff;border-radius:8px;padding:16px';
    container.appendChild(manualDiv);

    var manualLabel = document.createElement('p');
    manualLabel.textContent = '手动输入条码';
    manualLabel.style.cssText = 'color:#333;font-size:14px;margin-bottom:8px;font-weight:bold';
    manualDiv.appendChild(manualLabel);

    var manualRow = document.createElement('div');
    manualRow.style.cssText = 'display:flex;gap:8px';
    manualDiv.appendChild(manualRow);

    var manualInput = document.createElement('input');
    manualInput.type = 'text';
    manualInput.id = 'camera-manual-barcode';
    manualInput.placeholder = '输入条码数字';
    manualInput.style.cssText = 'flex:1;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px';
    manualRow.appendChild(manualInput);

    var manualBtn = document.createElement('button');
    manualBtn.textContent = '确认';
    manualBtn.className = 'btn btn-primary';
    manualBtn.style.cssText = 'padding:10px 20px;white-space:nowrap';
    manualRow.appendChild(manualBtn);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.className = 'btn';
    closeBtn.style.cssText = 'margin-top:12px;width:100%';
    container.appendChild(closeBtn);

    document.body.appendChild(overlay);

    var self = this;
    manualBtn.addEventListener('click', function() { self.submitCameraManual(); });
    manualInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); self.submitCameraManual(); }
    });
    closeBtn.addEventListener('click', function() { self.stopCamera(); });

    this._cameraTimeout = setTimeout(function() { if (self._cameraStream) self.stopCamera(); }, 180000);
    var getUserMedia = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    } else if (typeof navigator.getUserMedia === 'function') {
      getUserMedia = function(constraints) {
        return new Promise(function(resolve, reject) { navigator.getUserMedia(constraints, resolve, reject); });
      };
    } else if (typeof navigator.webkitGetUserMedia === 'function') {
      getUserMedia = function(constraints) {
        return new Promise(function(resolve, reject) { navigator.webkitGetUserMedia(constraints, resolve, reject); });
      };
    }

    if (!getUserMedia) {
      statusP.textContent = '当前浏览器不支持摄像头，请手动输入条码';
      statusP.style.color = '#ff6b6b';
      manualInput.focus();
      return;
    }

    if (!isHttps && !isLocalhost) {
      statusP.textContent = '相机扫码需要 HTTPS 环境。当前为 HTTP，请使用扫码枪或手动输入条码。';
      statusP.style.color = '#ffcc00';
      manualInput.focus();
      return;
    }

    try {
      self._cameraStream = await getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      video.srcObject = self._cameraStream;
      try { await video.play(); } catch(e) {}

      var track = self._cameraStream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        var caps = track.getCapabilities();
        if (caps.focusMode) {
          try { track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch(e) {}
        }
      }
    } catch (err) {
      var msg = '摄像头访问失败';
      if (err.name === 'NotAllowedError') msg = '摄像头权限被拒绝，请在浏览器设置中允许。可手动输入条码。';
      else if (err.name === 'NotFoundError') msg = '未找到摄像头设备。可手动输入条码。';
      else if (err.name === 'NotReadableError') msg = '摄像头被其他应用占用。可手动输入条码。';
      else msg = (err.message || '摄像头访问失败') + '。可手动输入条码。';
      statusP.textContent = msg;
      statusP.style.color = '#ff6b6b';
      manualInput.focus();
      return;
    }

    video.addEventListener('playing', function() {
      if (!self._detectionStarted) {
        self._detectionStarted = true;
        self._initDetection(video, statusP);
      }
    });

    if (video.readyState >= 2 && !self._detectionStarted) {
      self._detectionStarted = true;
      self._initDetection(video, statusP);
    }
  },

  _initDetection(video, statusP) {
    var self = this;

    if (typeof window.BarcodeDetector !== 'undefined') {
      window.BarcodeDetector.getSupportedFormats().then(function(formats) {
        if (formats && formats.length > 0) {
          self._barcodeDetector = new window.BarcodeDetector({ formats: formats });
          self._detectMode = 'native';
          statusP.textContent = '将条码对准绿框，自动识别中...';
          statusP.style.color = '#00ff00';
          self._startAutoDetection(video);
        } else {
          self._detectMode = 'canvas';
          statusP.textContent = '将条码对准绿框，自动识别中...';
          statusP.style.color = '#00ff00';
          self._startAutoDetection(video);
        }
      }).catch(function() {
        self._detectMode = 'canvas';
        statusP.textContent = '将条码对准绿框，自动识别中...';
        statusP.style.color = '#00ff00';
        self._startAutoDetection(video);
      });
    } else {
      self._detectMode = 'canvas';
      statusP.textContent = '将条码对准绿框，自动识别中...';
      statusP.style.color = '#00ff00';
      self._startAutoDetection(video);
    }
  },

  _startAutoDetection(video) {
    var self = this;
    var lastCode = null;
    var lastCodeTime = 0;
    var confirmCount = 0;
    var running = true;

    this._cameraStopLoop = function() { running = false; };

    async function detectFrame() {
      if (!running || !self._cameraStream || self._scanCompleted) return;
      self._scanCount++;

      if (self._scanCount % 10 === 0) {
        var el = document.getElementById('camera-status');
        if (el && el.style.color !== 'rgb(255, 204, 0)' && el.style.color !== '#ffcc00' && el.style.color !== 'rgb(255, 107, 107)' && el.style.color !== '#ff6b6b') {
          el.textContent = '正在扫描... 请将条码对准绿框 (' + self._scanCount + ')';
        }
      }

      var code = null;

      if (self._detectMode === 'native' && self._barcodeDetector) {
        try {
          var barcodes = await self._barcodeDetector.detect(video);
          if (barcodes.length > 0) code = barcodes[0].rawValue;
        } catch (e) {}
      }

      if (!code && typeof BarcodeReader !== 'undefined' && BarcodeReader.decode) {
        code = BarcodeReader.decode(video);
      }

      var now = Date.now();

      if (code) {
        if (code === lastCode) {
          confirmCount++;
          if (confirmCount >= 2) {
            self._onScanSuccess(code);
            return;
          }
        } else {
          lastCode = code;
          lastCodeTime = now;
          confirmCount = 1;
          var el2 = document.getElementById('camera-status');
          if (el2) { el2.textContent = '识别中... 请保持稳定 (' + confirmCount + '/2)'; el2.style.color = '#ffcc00'; }
        }
      } else {
        if (lastCode && now - lastCodeTime < 1500) {
          // Grace period: keep waiting for confirmation within 1.5s
        } else {
          lastCode = null;
          confirmCount = 0;
          var el3 = document.getElementById('camera-status');
          if (el3 && el3.style.color === '#ffcc00') {
            el3.textContent = '将条码对准绿框，自动识别中...';
            el3.style.color = '#00ff00';
          }
        }
      }

      if (running && self._cameraStream && !self._scanCompleted) {
        setTimeout(detectFrame, 250);
      }
    }

    detectFrame();
  },

  _onScanSuccess(code) {
    if (this._scanCompleted) return;
    this._scanCompleted = true;

    var el = document.getElementById('camera-status');
    if (el) {
      el.textContent = '识别成功: ' + code;
      el.style.color = '#00ff00';
    }
    var cb = this._cameraCallback;
    this.stopCamera();
    if (cb) cb(code);
  },

  submitCameraManual() {
    if (this._scanCompleted) return;
    this._scanCompleted = true;
    var input = document.getElementById('camera-manual-barcode');
    if (!input) return;
    var code = input.value.trim();
    if (!code) { this._scanCompleted = false; return; }
    var cb = this._cameraCallback;
    this.stopCamera();
    if (cb) cb(code);
  },

  stopCamera() {
    if (this._cameraTimeout) { clearTimeout(this._cameraTimeout); this._cameraTimeout = null; }
    if (this._cameraStopLoop) { this._cameraStopLoop(); this._cameraStopLoop = null; }
    if (this._cameraInterval) { clearInterval(this._cameraInterval); this._cameraInterval = null; }
    this._barcodeDetector = null;
    this._detectMode = null;
    this._detectionStarted = false;

    var video = document.querySelector('#camera-overlay video');
    if (video) { try { video.srcObject = null; } catch(e) {} }

    if (this._cameraStream) {
      try { this._cameraStream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
      this._cameraStream = null;
    }
    var overlay = document.getElementById('camera-overlay');
    if (overlay) overlay.remove();
  }
};

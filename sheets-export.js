(function () {
  const STORAGE_KEY = 'house-plan-sheets-url';
  const STATUS_CLASSES = ['status-pending', 'status-success', 'status-error'];

  function safeLocalStorage(fn) {
    try {
      return fn();
    } catch (error) {
      console.warn('Local storage access skipped:', error);
      return null;
    }
  }

  class SheetsExporter {
    constructor(options) {
      const {
        urlInput,
        triggerButton,
        statusElement,
        getMetrics,
        defaultUrl,
        onBeforeSend,
        onAfterSend,
        onSuccess,
        onError,
      } = options || {};
      this.urlInput = urlInput || null;
      this.triggerButton = triggerButton || null;
      this.statusElement = statusElement || null;
      this.getMetrics = typeof getMetrics === 'function' ? getMetrics : null;

      this.latestMetrics = null;
      this.isSending = false;
      this.defaultUrl = typeof defaultUrl === 'string' ? defaultUrl.trim() : '';
      this.onBeforeSend = typeof onBeforeSend === 'function' ? onBeforeSend : null;
      this.onAfterSend = typeof onAfterSend === 'function' ? onAfterSend : null;
      this.onSuccess = typeof onSuccess === 'function' ? onSuccess : null;
      this.onError = typeof onError === 'function' ? onError : null;

      this.handleSend = this.handleSend.bind(this);
      this.handleUrlInput = this.handleUrlInput.bind(this);

      this.init();
    }

    init() {
      this.restoreUrl();
      if (this.urlInput) {
        this.urlInput.addEventListener('input', this.handleUrlInput);
        this.urlInput.addEventListener('change', this.handleUrlInput);
      }
      if (this.triggerButton) {
        this.triggerButton.addEventListener('click', this.handleSend);
      }
      this.updateButtonState();
      this.showStatus('', 'idle');
    }

    restoreUrl() {
      if (!this.urlInput) return;
      const saved = safeLocalStorage(() => window.localStorage.getItem(STORAGE_KEY));
      if (typeof saved === 'string' && saved.length > 0) {
        this.urlInput.value = saved;
        return;
      }
      if (this.defaultUrl) {
        this.urlInput.value = this.defaultUrl;
      }
    }

    handleUrlInput() {
      if (!this.urlInput) return;
      const value = this.urlInput.value.trim();
      safeLocalStorage(() => {
        if (value) {
          window.localStorage.setItem(STORAGE_KEY, value);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      });
      this.updateButtonState();
    }

    updateButtonState() {
      if (!this.triggerButton) return;
      if (this.isSending) {
        this.triggerButton.disabled = true;
        return;
      }
      const hasUrl = this.getResolvedUrl().length > 0;
      this.triggerButton.disabled = !hasUrl;
    }

    setLatestMetrics(metrics) {
      this.latestMetrics = metrics;
    }

    getResolvedUrl() {
      const inputValue = this.urlInput ? this.urlInput.value.trim() : '';
      if (inputValue.length > 0) {
        return inputValue;
      }
      return this.defaultUrl || '';
    }

    showStatus(message, state) {
      if (!this.statusElement) return;
      this.statusElement.textContent = message;
      this.statusElement.classList.remove(...STATUS_CLASSES);
      if (state && state !== 'idle') {
        this.statusElement.classList.add(`status-${state}`);
      }
    }

    async handleSend(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      const url = this.getResolvedUrl();
      if (this.urlInput && !this.urlInput.value && url) {
        this.urlInput.value = url;
      }
      if (!url) {
        this.showStatus('Enter the engineer handoff link before sending.', 'error');
        this.updateButtonState();
        return;
      }

      const payload = this.getMetrics ? this.getMetrics(this.latestMetrics) : null;
      if (!payload || typeof payload !== 'object') {
        this.showStatus('We need some plan details before sending.', 'error');
        return;
      }

      try {
        this.isSending = true;
        this.updateButtonState();
        this.showStatus('Sending to our engineers…', 'pending');
        if (this.onBeforeSend) {
          this.onBeforeSend();
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text().catch(() => '');
        let responseJson = null;
        if (responseText) {
          try {
            responseJson = JSON.parse(responseText);
          } catch (parseError) {
            // Ignore JSON parse errors and fall back to raw text messaging.
          }
        }

        if (!response.ok || (responseJson && responseJson.success === false)) {
          const message =
            (responseJson && responseJson.message) ||
            responseText ||
            `Request failed with status ${response.status}`;
          throw new Error(message);
        }

        const successMessage = (responseJson && responseJson.message) || 'Sent to our engineers.';
        this.showStatus(successMessage, 'success');
        if (this.onSuccess) {
          this.onSuccess({ responseJson, payload, url });
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'Unknown error while sending data.';
        this.showStatus(`We couldn't reach our engineers: ${message}`, 'error');
        if (this.onError) {
          this.onError(error);
        }
      } finally {
        this.isSending = false;
        this.updateButtonState();
        if (this.onAfterSend) {
          this.onAfterSend();
        }
      }
    }

    send() {
      return this.handleSend();
    }
  }

  window.setupSheetsExport = function setupSheetsExport(options) {
    return new SheetsExporter(options);
  };
})();

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.initCatalog(document, root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MAX_QUANTITY = 30;
  const PHONE = '573125148470';
  const SERVICES = Object.freeze({
    local: 'Consumo en el restaurante',
    domicilio: 'Domicilio',
    recoger: 'Para recoger',
  });

  function isValidQuantity(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return false;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= MAX_QUANTITY;
  }

  function createCatalogState(products) {
    const catalog = new Map();
    products.forEach((product) => {
      if (!product || typeof product.id !== 'string' || !/^[a-z0-9-]+$/.test(product.id)
        || typeof product.name !== 'string' || !product.name.trim()) {
        throw new TypeError('Producto inválido.');
      }
      if (catalog.has(product.id)) throw new TypeError('Identificador de producto repetido.');
      catalog.set(product.id, Object.freeze({ ...product }));
    });
    const selected = new Map();
    return {
      add(id) {
        if (!catalog.has(id)) return { changed: false, reason: 'unknown' };
        const quantity = selected.get(id) || 0;
        if (quantity >= MAX_QUANTITY) return { changed: false, reason: 'limit', quantity };
        selected.set(id, quantity + 1);
        return { changed: true, quantity: quantity + 1 };
      },
      setQuantity(id, value) {
        if (!selected.has(id) || !isValidQuantity(value)) return false;
        selected.set(id, Number(value));
        return true;
      },
      quantity(id) { return selected.get(id) || 0; },
      remove(id) { return selected.delete(id); },
      clear() { selected.clear(); },
      entries() {
        return [...selected].map(([id, quantity]) => ({ ...catalog.get(id), quantity }));
      },
      totalUnits() { return [...selected.values()].reduce((sum, quantity) => sum + quantity, 0); },
    };
  }

  function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function filterCatalog(products, category = 'all', query = '') {
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      const matchesCategory = category === 'all' || product.category === category;
      const searchable = normalizeSearch(`${product.name} ${product.description || ''}`);
      return matchesCategory && words.every((word) => searchable.includes(word));
    });
  }

  function buildQuoteMessage(entries, options = {}) {
    if (!Array.isArray(entries) || !entries.length) throw new RangeError('Selecciona al menos un producto.');
    if (entries.some((entry) => !entry || typeof entry.name !== 'string' || !entry.name.trim()
      || !isValidQuantity(entry.quantity))) throw new RangeError('Revisa las cantidades de la cotización.');
    const name = String(options.nombre || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
    const notes = String(options.notas || '').trim().slice(0, 600);
    const service = Object.hasOwn(SERVICES, options.servicio) ? options.servicio : 'local';
    return [
      'Solicitud de cotización · Tango Parrilla Argentina',
      '',
      `Hola, Tango.${name ? ` Soy ${name}.` : ''} Quisiera cotizar los siguientes productos:`,
      '',
      ...entries.map((entry) => `• ${Number(entry.quantity)} × ${entry.name.replace(/[\r\n]+/g, ' ').trim()}`),
      '',
      `Modalidad: ${SERVICES[service]}.`,
      notes ? `Notas: ${notes}` : '',
      '',
      '¿Me confirman el precio de cada producto, el valor total y la disponibilidad?',
      service === 'domicilio' ? 'Por favor, incluyan la cobertura, el costo del domicilio y el tiempo estimado de entrega.' : '',
      'Quedo pendiente de su cotización. Gracias.',
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  function buildWhatsAppURL(entries, options) {
    return `https://wa.me/${PHONE}?text=${encodeURIComponent(buildQuoteMessage(entries, options))}`;
  }

  function initCatalog(doc, browser) {
    const dataElement = doc.querySelector('#catalog-data');
    const form = doc.querySelector('#quote-form');
    const list = doc.querySelector('#quote-items');
    if (!dataElement || !form || !list) return;
    const status = doc.querySelector('#quote-status');
    let products;
    let state;
    try {
      products = JSON.parse(dataElement.textContent);
      if (!Array.isArray(products)) throw new TypeError('El catálogo no es una lista.');
      state = createCatalogState(products);
    } catch (_) {
      if (status) status.textContent = 'No pudimos cargar el catálogo. Puedes consultar directamente por WhatsApp.';
      return;
    }

    const registry = new Map(products.map((product) => [product.id, product]));
    const rows = new Map();
    const empty = doc.querySelector('#quote-empty');
    const total = doc.querySelector('#quote-total-units');
    const clearButton = doc.querySelector('#quote-clear');
    const submitButton = doc.querySelector('#quote-submit');
    const shortcut = doc.querySelector('#quote-shortcut');
    const messagePreview = doc.querySelector('#quote-message');
    const nameField = form.elements.namedItem('nombre');
    const serviceField = form.elements.namedItem('servicio');
    const notesField = form.elements.namedItem('notas');
    const addButtons = [...doc.querySelectorAll('[data-add-product]')];
    const viewButtons = [...doc.querySelectorAll('[data-view-product]')];
    if (!nameField || !serviceField || !notesField || !submitButton) return;

    function announce(message) {
      if (status) status.textContent = message;
    }

    function focusCatalogControl() {
      const visibleAdd = addButtons.find((button) => !button.disabled && !button.closest('.dish-card')?.hidden);
      (visibleAdd || doc.querySelector('#catalog-search'))?.focus();
    }

    function currentOptions() {
      return { nombre: nameField.value, servicio: serviceField.value, notas: notesField.value };
    }

    function updatePreview() {
      if (messagePreview) {
        messagePreview.textContent = state.entries().length
          ? buildQuoteMessage(state.entries(), currentOptions())
          : 'Elige productos del catálogo para preparar tu solicitud de cotización.';
      }
    }

    function makeButton(text, className, label) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      button.setAttribute('aria-label', label);
      return button;
    }

    function createRow(product) {
      const row = doc.createElement('li');
      row.className = 'quote-item';
      row.dataset.productId = product.id;
      const photo = doc.createElement('div');
      photo.className = 'quote-item-photo';
      const image = doc.createElement('img');
      image.className = `quote-item-image ${product.imageClass || ''}`.trim();
      image.src = product.image;
      image.alt = product.imageAlt || product.name;
      image.width = 72;
      image.height = 72;
      image.loading = 'lazy';
      const body = doc.createElement('div');
      body.className = 'quote-item-info';
      const name = doc.createElement('h4');
      name.className = 'quote-item-name';
      name.textContent = product.name;
      const controls = doc.createElement('div');
      controls.className = 'quote-item-controls';
      const label = doc.createElement('label');
      label.className = 'quote-quantity-label';
      label.htmlFor = `quote-quantity-${product.id}`;
      label.textContent = `Cantidad de ${product.name}`;
      const stepper = doc.createElement('div');
      stepper.className = 'quote-quantity-controls';
      const decrease = makeButton('−', 'quantity-minus', `Reducir cantidad de ${product.name}`);
      const input = doc.createElement('input');
      input.id = label.htmlFor;
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '1';
      input.max = String(MAX_QUANTITY);
      input.step = '1';
      input.required = true;
      input.value = String(product.quantity);
      input.className = 'quote-quantity';
      const increase = makeButton('+', 'quantity-plus', `Aumentar cantidad de ${product.name}`);
      const remove = makeButton('Quitar', 'quote-remove', `Quitar ${product.name} de la cotización`);
      stepper.append(decrease, input, increase);
      controls.append(label, stepper, remove);
      body.append(name, controls);
      photo.append(image);
      row.append(photo, body);

      input.addEventListener('input', () => {
        const valid = isValidQuantity(input.value);
        input.setCustomValidity(valid ? '' : `Escribe una cantidad entera entre 1 y ${MAX_QUANTITY}.`);
        if (valid) {
          state.setQuantity(product.id, input.value);
          renderQuote();
          announce(`Cantidad actualizada: ${Number(input.value)} de ${product.name}.`);
        } else {
          announce(`Revisa la cantidad de ${product.name}: debe estar entre 1 y ${MAX_QUANTITY}.`);
        }
      });
      input.addEventListener('change', () => {
        if (isValidQuantity(input.value)) input.value = String(Number(input.value));
      });
      function changeQuantity(delta) {
        const next = state.quantity(product.id) + delta;
        if (!state.setQuantity(product.id, next)) return;
        input.setCustomValidity('');
        input.value = String(next);
        renderQuote();
        announce(`Cantidad actualizada: ${next} de ${product.name}.`);
        if ((delta < 0 && decrease.disabled) || (delta > 0 && increase.disabled)) input.focus();
      }
      decrease.addEventListener('click', () => changeQuantity(-1));
      increase.addEventListener('click', () => changeQuantity(1));
      remove.addEventListener('click', () => {
        const before = state.entries();
        const index = before.findIndex((entry) => entry.id === product.id);
        const nextId = before[index + 1]?.id || before[index - 1]?.id;
        state.remove(product.id);
        renderQuote();
        announce(`${product.name} se quitó de la cotización.`);
        if (nextId) rows.get(nextId)?.remove.focus();
        else focusCatalogControl();
      });
      return { row, input, increase, decrease, remove };
    }

    function renderQuote() {
      const entries = state.entries();
      const ids = new Set(entries.map((entry) => entry.id));
      for (const [id, refs] of rows) {
        if (!ids.has(id)) {
          refs.row.remove();
          rows.delete(id);
        }
      }
      entries.forEach((entry) => {
        if (!rows.has(entry.id)) {
          const refs = createRow(entry);
          rows.set(entry.id, refs);
          list.append(refs.row);
        }
        const refs = rows.get(entry.id);
        if (doc.activeElement !== refs.input && isValidQuantity(refs.input.value)) {
          refs.input.value = String(entry.quantity);
        }
        refs.decrease.disabled = entry.quantity <= 1;
        refs.increase.disabled = entry.quantity >= MAX_QUANTITY;
      });
      const isEmpty = entries.length === 0;
      list.hidden = isEmpty;
      if (empty) empty.hidden = !isEmpty;
      if (shortcut) shortcut.hidden = isEmpty;
      if (clearButton) clearButton.disabled = isEmpty;
      submitButton.disabled = isEmpty;
      if (total) total.textContent = `${state.totalUnits()} ${state.totalUnits() === 1 ? 'unidad' : 'unidades'}`;
      doc.querySelectorAll('[data-quote-count]').forEach((element) => {
        element.textContent = String(state.totalUnits());
      });
      updatePreview();
    }

    function addProduct(id) {
      const product = registry.get(id);
      if (!product) return '';
      const result = state.add(id);
      const selectedRow = rows.get(id);
      if (selectedRow) {
        selectedRow.input.value = String(state.quantity(id));
        selectedRow.input.setCustomValidity('');
      }
      renderQuote();
      const message = result.changed
        ? `${product.name} añadido. ${result.quantity} ${result.quantity === 1 ? 'unidad seleccionada' : 'unidades seleccionadas'}.`
        : `Puedes cotizar hasta ${MAX_QUANTITY} unidades de ${product.name}. Indica cantidades mayores en las notas.`;
      announce(message);
      return message;
    }

    addButtons.forEach((button) => {
      if (!registry.has(button.dataset.addProduct)) return;
      button.addEventListener('click', () => addProduct(button.dataset.addProduct));
      button.disabled = false;
    });
    clearButton?.addEventListener('click', () => {
      state.clear();
      renderQuote();
      announce('La selección de productos está vacía. Puedes empezar otra cotización.');
      focusCatalogControl();
    });

    const filters = [...doc.querySelectorAll('[data-filter]')];
    const cards = [...doc.querySelectorAll('.dish-card[data-product-id]')];
    const search = doc.querySelector('#catalog-search');
    const count = doc.querySelector('#catalog-count');
    const noResults = doc.querySelector('#catalog-no-results');
    let activeCategory = 'all';
    function renderCatalog() {
      const visible = new Set(filterCatalog(products, activeCategory, search?.value).map((product) => product.id));
      cards.forEach((card) => { card.hidden = !visible.has(card.dataset.productId); });
      filters.forEach((button) => {
        const selected = button.dataset.filter === activeCategory;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-active', selected);
      });
      if (count) count.textContent = `${visible.size} ${visible.size === 1 ? 'producto' : 'productos'} en el catálogo`;
      if (noResults) noResults.hidden = visible.size !== 0;
    }
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        activeCategory = button.dataset.filter;
        renderCatalog();
      });
    });
    search?.addEventListener('input', renderCatalog);
    doc.querySelector('#catalog-reset')?.addEventListener('click', () => {
      activeCategory = 'all';
      if (search) search.value = '';
      renderCatalog();
      search?.focus();
    });

    [nameField, serviceField, notesField].forEach((field) => {
      field.addEventListener('input', () => {
        field.setCustomValidity('');
        updatePreview();
      });
      field.addEventListener('change', updatePreview);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!state.entries().length) {
        announce('Añade al menos un producto para solicitar una cotización.');
        return;
      }
      rows.forEach((refs, id) => {
        const valid = isValidQuantity(refs.input.value);
        refs.input.setCustomValidity(valid ? '' : `Escribe una cantidad entera entre 1 y ${MAX_QUANTITY}.`);
        if (valid) state.setQuantity(id, refs.input.value);
      });
      nameField.setCustomValidity(nameField.value.trim().length <= 80 ? '' : 'Escribe un nombre de hasta 80 caracteres.');
      notesField.setCustomValidity(notesField.value.length <= 600 ? '' : 'Las notas pueden tener hasta 600 caracteres.');
      serviceField.setCustomValidity(Object.hasOwn(SERVICES, serviceField.value) ? '' : 'Selecciona una modalidad de la lista.');
      if (!form.reportValidity()) {
        announce('Revisa los datos indicados antes de continuar.');
        return;
      }
      renderQuote();
      announce('Tu solicitud está lista. Completa el envío en WhatsApp; Tango responderá con los precios y la disponibilidad.');
      browser.location.href = buildWhatsAppURL(state.entries(), currentOptions());
    });

    const dialog = doc.querySelector('#product-dialog');
    const dialogImage = doc.querySelector('#product-dialog-image');
    const dialogTitle = doc.querySelector('#product-dialog-title');
    const dialogDescription = doc.querySelector('#product-dialog-description');
    const dialogSource = doc.querySelector('#product-dialog-source');
    const dialogAdd = doc.querySelector('#product-dialog-add');
    const dialogClose = doc.querySelector('#product-dialog-close');
    let activeProduct = null;
    let dialogTrigger = null;
    if (dialog && dialogImage && dialogTitle && dialogDescription && dialogSource && dialogAdd && dialogClose) {
      const dialogStatus = doc.createElement('p');
      dialogStatus.className = 'product-dialog-feedback';
      dialogStatus.setAttribute('role', 'status');
      dialogStatus.setAttribute('aria-live', 'polite');
      dialogAdd.insertAdjacentElement('afterend', dialogStatus);
      const restoreDialogFocus = () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); };
      dialog.addEventListener('close', restoreDialogFocus);
      dialogClose.addEventListener('click', () => {
        if (typeof dialog.close === 'function') dialog.close();
        else {
          dialog.removeAttribute('open');
          restoreDialogFocus();
        }
      });
      viewButtons.forEach((button) => {
        const product = registry.get(button.dataset.viewProduct);
        if (!product) return;
        button.addEventListener('click', () => {
          activeProduct = product;
          dialogTrigger = button;
          dialogImage.src = product.image;
          dialogImage.alt = product.imageAlt || product.name;
          dialogImage.className = product.imageClass || '';
          dialogTitle.textContent = product.name;
          dialogDescription.textContent = product.description || '';
          dialogSource.textContent = product.sourceNote || '';
          dialogStatus.textContent = '';
          dialogAdd.disabled = false;
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
        });
        button.disabled = false;
      });
      dialogAdd.addEventListener('click', () => {
        if (activeProduct) dialogStatus.textContent = addProduct(activeProduct.id);
      });
    }
    renderCatalog();
    renderQuote();
  }

  return { MAX_QUANTITY, PHONE, isValidQuantity, createCatalogState, filterCatalog, buildQuoteMessage, buildWhatsAppURL, initCatalog };
});

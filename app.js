(() => {
  'use strict';

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  function todayInColombia() {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type) => parts.find((item) => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  const menuToggle = $('#menu-toggle');
  const mobileMenu = $('#mobile-menu');

  function setMenuOpen(open, restoreFocus = false) {
    if (!menuToggle || !mobileMenu) return;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    mobileMenu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    if (restoreFocus) menuToggle.focus();
  }

  menuToggle?.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  mobileMenu?.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false, true);
    }
  });

  const desktopLayout = window.matchMedia('(min-width: 821px)');
  desktopLayout.addEventListener?.('change', (event) => {
    if (event.matches) setMenuOpen(false);
  });
  if (desktopLayout.matches) setMenuOpen(false);

  const navLinks = $$('.nav-link[href^="#"]');
  const navSections = [...new Set(navLinks.map((link) => {
    return document.getElementById(link.getAttribute('href').slice(1));
  }).filter(Boolean))];

  function markActiveSection(id) {
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length) {
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        markActiveSection(visible[0].target.id);
      }
    }, { rootMargin: '-10% 0px -65% 0px', threshold: 0 });
    navSections.forEach((section) => navObserver.observe(section));
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', () => markActiveSection(link.getAttribute('href').slice(1)));
  });

  const revealElements = $$('.reveal');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    revealElements.forEach((element) => {
      element.classList.add('reveal-ready');
      revealObserver.observe(element);
    });
    reducedMotion.addEventListener?.('change', (event) => {
      if (event.matches) {
        revealElements.forEach((element) => element.classList.add('is-visible'));
        revealObserver.disconnect();
      }
    });
  } else {
    revealElements.forEach((element) => element.classList.add('is-visible'));
  }

  const form = $('#visit-form');
  const feedback = $('#form-feedback');
  const dateField = form?.elements.namedItem('fecha');
  const nameField = form?.elements.namedItem('nombre');
  const peopleField = form?.elements.namedItem('personas');
  if (dateField) dateField.min = todayInColombia();

  [dateField, nameField, peopleField].filter(Boolean).forEach((field) => {
    field.addEventListener('input', () => field.setCustomValidity(''));
  });

  $$('[data-fill-motivo]').forEach((button) => {
    button.addEventListener('click', () => {
      const reason = form?.elements.namedItem('motivo');
      if (reason && ['mesa', 'domicilio', 'carta'].includes(button.dataset.fillMotivo)) {
        reason.value = button.dataset.fillMotivo;
      }
    });
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (feedback) feedback.textContent = '';
    if (nameField) {
      nameField.setCustomValidity(nameField.value.trim() ? '' : 'Escribe tu nombre para preparar la consulta.');
    }
    if (dateField) {
      const today = todayInColombia();
      dateField.min = today;
      dateField.setCustomValidity(dateField.value && dateField.value < today
        ? 'Selecciona la fecha de hoy o una fecha posterior.' : '');
    }
    if (peopleField) {
      const number = Number(peopleField.value);
      peopleField.setCustomValidity(Number.isInteger(number) && number >= 1 && number <= 30
        ? '' : 'Indica entre 1 y 30 personas.');
    }
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const name = String(values.get('nombre') || '').trim();
    const date = String(values.get('fecha') || '');
    const people = String(values.get('personas') || '');
    const extra = String(values.get('mensaje') || '').trim();
    const reasons = {
      mesa: 'Quisiera consultar disponibilidad de una mesa.',
      domicilio: 'Quisiera consultar el servicio a domicilio y su cobertura.',
      carta: 'Quisiera conocer la carta actual y los precios.',
    };
    const message = [
      `Hola, Tango Parrilla Argentina. Soy ${name}.`,
      reasons[String(values.get('motivo'))] || 'Quisiera hacer una consulta.',
      date ? `Fecha: ${date.split('-').reverse().join('/')}.` : '',
      people ? `Personas: ${people}.` : '',
      extra,
      '¿Me pueden confirmar disponibilidad? Gracias.',
    ].filter(Boolean).join('\n');

    if (feedback) {
      feedback.textContent = 'Tu consulta está lista. Completa el envío en WhatsApp; el restaurante confirmará disponibilidad.';
    }
    window.location.href = `https://wa.me/573125148470?text=${encodeURIComponent(message)}`;
  });

  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = false;

  const privacyDialog = $('#privacy-dialog');
  const privacyOpen = $('#privacy-open');
  privacyOpen?.addEventListener('click', () => {
    if (!privacyDialog) return;
    if (typeof privacyDialog.showModal === 'function') privacyDialog.showModal();
    else privacyDialog.setAttribute('open', '');
  });
  $('#privacy-close')?.addEventListener('click', () => {
    if (typeof privacyDialog?.close === 'function') privacyDialog.close();
    else privacyDialog?.removeAttribute('open');
    privacyOpen?.focus();
  });
  privacyDialog?.addEventListener('click', (event) => {
    if (event.target !== privacyDialog) return;
    const bounds = privacyDialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside && typeof privacyDialog.close === 'function') privacyDialog.close();
  });

  const year = $('#current-year');
  if (year) year.textContent = todayInColombia().slice(0, 4);
})();

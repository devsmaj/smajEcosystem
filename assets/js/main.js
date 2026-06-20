/**
 * SMAJ Ecosystem - Main JavaScript
 * Startup Technology Company / Venture Builder
 */

document.addEventListener('DOMContentLoaded', function () {
    initPreloader();
    initScrollAnimations();
    initSmoothScroll();
    initProjectCarousel();
    initCounters();
    initScrollTop();
    initNewsletterForms();
    initFormPersistence();
    initCookieConsent();
    setActiveMenuItem();
});

/**
 * Preloader
 */
function initPreloader() {
    const preloader = document.querySelector('.preloader');

    if (!preloader) return;

    window.addEventListener('load', function () {
        setTimeout(function () {
            preloader.classList.add('hidden');
        }, 900);
    });
}

/**
 * Scroll Animations
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    if (!animatedElements.length) return;

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.12
    });

    animatedElements.forEach(function (element) {
        observer.observe(element);
    });
}

/**
 * Smooth Scroll
 */
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(function (link) {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            if (!href || href === '#') return;

            const target = document.querySelector(href);

            if (target) {
                e.preventDefault();

                const headerHeight = document.querySelector('.header')?.offsetHeight || 80;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Project / Venture Carousel
 */
function initProjectCarousel() {
    const carousel = document.querySelector('.projects-carousel');

    if (!carousel) return;

    const slides = carousel.querySelectorAll('.project-card');
    const prevBtn = carousel.querySelector('.carousel-prev');
    const nextBtn = carousel.querySelector('.carousel-next');

    if (!slides.length) return;

    let currentSlide = 0;
    const totalSlides = slides.length;

    function showSlide(index) {
        slides.forEach(function (slide, i) {
            slide.style.display = i === index ? 'block' : 'none';
        });
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        showSlide(currentSlide);
    }

    function prevSlide() {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        showSlide(currentSlide);
    }

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    setInterval(nextSlide, 5000);
    showSlide(currentSlide);
}

/**
 * Counter Animation
 */
function initCounters() {
    const counters = document.querySelectorAll('.stat-number');

    if (!counters.length) return;

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.getAttribute('data-target'), 10);

                if (isNaN(target)) return;

                const duration = 1800;
                const increment = target / (duration / 16);
                let current = 0;

                function updateCounter() {
                    current += increment;

                    if (current < target) {
                        counter.textContent = Math.floor(current);
                        requestAnimationFrame(updateCounter);
                    } else {
                        counter.textContent = target;
                    }
                }

                updateCounter();
                observer.unobserve(counter);
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    });

    counters.forEach(function (counter) {
        observer.observe(counter);
    });
}

/**
 * Scroll To Top
 */
function initScrollTop() {
    const scrollTopBtn = document.querySelector('.scroll-top');

    if (!scrollTopBtn) return;

    window.addEventListener('scroll', function () {
        if (window.scrollY > 300) {
            scrollTopBtn.classList.add('visible');
        } else {
            scrollTopBtn.classList.remove('visible');
        }
    });

    scrollTopBtn.addEventListener('click', function () {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/**
 * Form Validation
 */
function validateForm(formId) {
    const form = document.getElementById(formId);

    if (!form) return false;

    const inputs = form.querySelectorAll('input[required], textarea[required]');
    let isValid = true;

    inputs.forEach(function (input) {
        if (!input.value.trim()) {
            input.classList.add('error');
            isValid = false;
        } else {
            input.classList.remove('error');
        }
    });

    return isValid;
}

/**
 * Newsletter Forms
 */
function initNewsletterForms() {
    const forms = document.querySelectorAll('[data-newsletter-form]');

    forms.forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            submitNewsletterForm(form);
        });
    });
}

async function submitNewsletterForm(form) {
    const emailField = form.querySelector('input[type="email"]');
    const submitButton = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-newsletter-status]');
    const endpoint = form.getAttribute('action');

    if (!emailField || !isValidEmail(emailField.value.trim())) {
        setNewsletterStatus(status, 'Please enter a valid email address.', 'error');
        emailField?.focus();
        return;
    }

    if (!endpoint) {
        setNewsletterStatus(status, 'Subscription service is not configured yet.', 'error');
        return;
    }

    setNewsletterStatus(status, 'Subscribing...', 'info');
    setNewsletterButtonLoading(submitButton, true);

    try {
        const formData = new FormData(form);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData.entries()))
        });

        if (!response.ok) {
            throw new Error('Subscription failed.');
        }

        form.reset();
        clearSmajPersistedForm(form);
        setNewsletterStatus(status, 'Subscribed successfully. Thank you for following SMAJ Ecosystem.', 'success');
    } catch (error) {
        console.error(error);
        setNewsletterStatus(status, 'Could not subscribe right now. Please try again in a moment.', 'error');
    } finally {
        setNewsletterButtonLoading(submitButton, false);
    }
}

function setNewsletterStatus(status, message, type) {
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
}

function setNewsletterButtonLoading(button, isLoading) {
    if (!button) return;

    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? 'Subscribing...' : button.dataset.defaultText;
}

/**
 * Form Draft Persistence
 */
function initFormPersistence() {
    const forms = document.querySelectorAll('[data-persist-form]');

    if (!forms.length || !supportsLocalStorage()) return;

    forms.forEach(function (form) {
        restorePersistedForm(form);

        ['input', 'change'].forEach(function (eventName) {
            form.addEventListener(eventName, function (event) {
                if (shouldPersistField(event.target)) {
                    savePersistedForm(form);
                }
            });
        });
    });
}

function savePersistedForm(form) {
    const storageKey = getPersistedFormKey(form);
    const data = {};
    const fields = form.querySelectorAll('input, textarea, select');

    fields.forEach(function (field) {
        if (!shouldPersistField(field) || !field.name) return;

        if (field.type === 'checkbox') {
            data[field.name] = field.checked;
            return;
        }

        if (field.type === 'radio') {
            if (field.checked) data[field.name] = field.value;
            return;
        }

        data[field.name] = field.value;
    });

    localStorage.setItem(storageKey, JSON.stringify(data));
}

function restorePersistedForm(form) {
    const storageKey = getPersistedFormKey(form);
    let data = {};

    try {
        data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (error) {
        localStorage.removeItem(storageKey);
        return;
    }

    Object.keys(data).forEach(function (name) {
        const fields = Array.from(form.elements).filter(function (field) {
            return field.name === name && shouldPersistField(field);
        });

        fields.forEach(function (field) {
            if (field.type === 'checkbox') {
                field.checked = Boolean(data[name]);
                return;
            }

            if (field.type === 'radio') {
                field.checked = field.value === data[name];
                return;
            }

            field.value = data[name];
        });
    });
}

function clearSmajPersistedForm(form) {
    if (!form || !supportsLocalStorage()) return;
    localStorage.removeItem(getPersistedFormKey(form));
}

function getPersistedFormKey(form) {
    return `smaj:${form.dataset.persistForm || form.id || 'form'}`;
}

function shouldPersistField(field) {
    if (!field || !field.matches || !field.matches('input, textarea, select')) return false;

    const blockedTypes = ['file', 'password', 'submit', 'button', 'reset', 'hidden'];
    return !blockedTypes.includes((field.type || '').toLowerCase());
}

function supportsLocalStorage() {
    try {
        const testKey = 'smaj:storage-test';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return true;
    } catch (error) {
        return false;
    }
}

window.clearSmajPersistedForm = clearSmajPersistedForm;

/**
 * Cookie Consent
 */
function initCookieConsent() {
    if (!supportsLocalStorage()) return;
    if (localStorage.getItem('smajCookieConsent')) return;

    const banner = document.createElement('div');
    banner.className = 'cookie-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = `
        <div class="cookie-consent-text">
            <p>We use cookies to improve your experience, analyze traffic, and support website functionality.</p>
            <a href="/privacy-policy/">Privacy Policy</a>
        </div>
        <div class="cookie-consent-actions">
            <button type="button" class="btn cookie-btn cookie-btn-decline" data-cookie-choice="declined">Decline</button>
            <button type="button" class="btn cookie-btn cookie-btn-accept" data-cookie-choice="accepted">Accept</button>
        </div>
    `;

    document.body.appendChild(banner);

    banner.querySelectorAll('[data-cookie-choice]').forEach(function (button) {
        button.addEventListener('click', function () {
            localStorage.setItem('smajCookieConsent', button.dataset.cookieChoice);
            banner.classList.add('cookie-consent-hidden');

            window.setTimeout(function () {
                banner.remove();
            }, 220);
        });
    });
}

/**
 * Email Validation
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Active Menu Item
 */
function setActiveMenuItem() {
    const currentPath = normalizeMenuPath(window.location.pathname);

    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

    navLinks.forEach(function (link) {
        const href = normalizeMenuPath(link.getAttribute('href'));

        link.classList.remove('active');

        if (href === currentPath) {
            link.classList.add('active');
        }
    });
}

function normalizeMenuPath(path) {
    if (!path || path === 'index.html') return '/';

    const legacyMap = {
        'about.html': '/about/',
        'ventures.html': '/ventures/',
        'projects.html': '/ventures/',
        'partnerships.html': '/partnerships/',
        'insights.html': '/insights/',
        'contact.html': '/contact/'
    };

    if (legacyMap[path]) return legacyMap[path];

    if (/^https?:\/\//.test(path)) {
        try {
            path = new URL(path).pathname;
        } catch (error) {
            return path;
        }
    }

    if (!path.startsWith('/')) path = `/${path}`;
    if (path.endsWith('/index.html')) path = path.replace(/index\.html$/, '');
    if (path.endsWith('.html')) path = legacyMap[path.slice(1)] || path;
    if (!path.endsWith('/')) path = `${path}/`;

    return path;
}

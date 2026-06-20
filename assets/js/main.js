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

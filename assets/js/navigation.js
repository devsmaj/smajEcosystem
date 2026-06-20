/**
 * SMAJ Ecosystem - Navigation JavaScript
 * Mobile menu + header scroll + active navigation
 */

document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    initHeaderScroll();
    initActiveNavigation();
});

/**
 * Mobile Menu Handler
 */
function initMobileMenu() {
    const menuToggle = document.querySelector('.btn-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    const header = document.querySelector('.header');
    const body = document.body;

    let isAnimating = false;
    const animationDuration = 300;

    if (!menuToggle || !mobileMenu || !mobileOverlay) return;

    function closeMenu() {
        if (isAnimating) return;
        isAnimating = true;

        menuToggle.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');

        mobileMenu.classList.remove('active');
        mobileOverlay.classList.remove('active');

        if (header) {
            header.classList.remove('menu-open');
        }

        body.classList.remove('no-scroll');

        setTimeout(function () {
            isAnimating = false;
        }, animationDuration);
    }

    function openMenu() {
        if (isAnimating) return;
        isAnimating = true;

        menuToggle.classList.add('active');
        menuToggle.setAttribute('aria-expanded', 'true');

        mobileMenu.classList.add('active');
        mobileOverlay.classList.add('active');

        if (header) {
            header.classList.add('menu-open');
        }

        body.classList.add('no-scroll');

        setTimeout(function () {
            isAnimating = false;
        }, animationDuration);
    }

    menuToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (window.innerWidth > 992) return;

        if (mobileMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    mobileOverlay.addEventListener('click', function () {
        closeMenu();
    });

    mobileLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            setTimeout(closeMenu, 100);
        });
    });

    mobileMenu.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 992 && mobileMenu.classList.contains('active')) {
            closeMenu();
        }
    });
}

/**
 * Header Scroll Effects
 */
function initHeaderScroll() {
    const header = document.querySelector('.header');

    if (!header) return;

    function updateHeader() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    updateHeader();

    window.addEventListener('scroll', updateHeader);
}

/**
 * Active Navigation Link Indicator
 */
function initActiveNavigation() {
    const currentPath = normalizeNavigationPath(window.location.pathname);

    const allLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

    allLinks.forEach(function (link) {
        const href = normalizeNavigationPath(link.getAttribute('href'));

        link.classList.remove('active');

        if (href === currentPath) {
            link.classList.add('active');
        }
    });
}

function normalizeNavigationPath(path) {
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

/**
 * SMAJ Ecosystem - Ventures Filter Script
 */

document.addEventListener('DOMContentLoaded', function () {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    if (!filterBtns.length || !projectCards.length) return;

    const ventureCategories = {
        'All Ventures': 'all',
        'All': 'all',
        'SMAJ Labs': ['Labs', 'Innovation'],
        'SMAJ Products': ['AI Product', 'Identity Product', 'Platform', 'Product'],
        'SMAJ Partners': ['Partners', 'Partner Venture'],
        'Future Companies': ['Future Companies', 'Future Venture', 'Venture']
    };

    filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            filterBtns.forEach(function (button) {
                button.classList.remove('active');
            });

            this.classList.add('active');

            const filterValue = this.textContent.trim();
            const categories = ventureCategories[filterValue] || 'all';

            projectCards.forEach(function (card) {
                const categorySpan = card.querySelector('.project-category');
                const projectCategory = categorySpan ? categorySpan.textContent.trim() : '';

                let shouldShow = false;

                if (categories === 'all') {
                    shouldShow = true;
                } else if (Array.isArray(categories)) {
                    shouldShow = categories.includes(projectCategory);
                }

                if (shouldShow) {
                    card.style.display = 'flex';

                    setTimeout(function () {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, 10);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(20px)';

                    setTimeout(function () {
                        card.style.display = 'none';
                    }, 300);
                }
            });
        });
    });
});

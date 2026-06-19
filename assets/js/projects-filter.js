/**
 * SMAJ Ecosystem - Ventures Filter Script
 */

document.addEventListener('DOMContentLoaded', function () {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const cards = document.querySelectorAll('.project-card, .insight-card');

    if (!filterBtns.length || !cards.length) return;

    const ventureCategories = {
        'All Ventures': 'all',
        'All': 'all',
        'SMAJ Labs': ['Labs', 'Innovation'],
        'SMAJ Products': ['AI Product', 'Identity Product', 'Platform', 'Product'],
        'SMAJ Partners': ['Partners', 'Partner Venture'],
        'Future Companies': ['Future Companies', 'Future Venture', 'Venture'],
        'SMAJ Updates': ['SMAJ Updates'],
        'AI': ['AI'],
        'Venture Building': ['Venture Building'],
        'Innovation': ['Innovation']
    };

    filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            filterBtns.forEach(function (button) {
                button.classList.remove('active');
            });

            this.classList.add('active');

            const filterValue = this.textContent.trim();
            const categories = ventureCategories[filterValue] || 'all';

            cards.forEach(function (card) {
                const categorySpan = card.querySelector('.project-category, .insight-category');
                const cardCategory = categorySpan ? categorySpan.textContent.trim() : '';

                let shouldShow = false;

                if (categories === 'all') {
                    shouldShow = true;
                } else if (Array.isArray(categories)) {
                    shouldShow = categories.includes(cardCategory);
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

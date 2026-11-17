(function () {
    const FEED_URL = 'https://letterboxd.com/mayayami/rss/';
    const PROXIES = [
        'https://api.codetabs.com/v1/proxy?quest=' + FEED_URL,
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(FEED_URL)
    ];
    const container = document.getElementById('film-diary');

    function ratingToStars(rating) {
        if (!rating) return '';
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5;
        return '\u2605'.repeat(full) + (half ? '\u00BD' : '');
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function extractReview(descHtml) {
        if (!descHtml) return { poster: '', text: '' };
        const doc = new DOMParser().parseFromString(descHtml, 'text/html');
        const img = doc.querySelector('img');
        const poster = img ? img.src : '';
        // Remove the image paragraph, keep remaining text
        const paragraphs = doc.querySelectorAll('p');
        const textParts = [];
        paragraphs.forEach(function (p) {
            if (!p.querySelector('img')) {
                const t = p.textContent.trim();
                if (t && !t.startsWith('Watched on')) textParts.push(t);
            }
        });
        return { poster: poster, text: textParts.join(' ') };
    }

    function getTagText(item, tagName) {
        var el = item.getElementsByTagName(tagName)[0];
        if (!el) {
            // try with namespace prefix
            el = item.querySelector(tagName);
        }
        return el ? el.textContent.trim() : '';
    }

    function renderItems(items) {
        container.innerHTML = '';
        var reviewCount = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var title = getTagText(item, 'title');
            var link = getTagText(item, 'link');

            // Skip list items (they don't have filmTitle)
            var filmTitle = getTagText(item, 'letterboxd\\:filmTitle') || getTagText(item, 'filmTitle');
            if (!filmTitle) continue;

            // Only show film reviews, limit to 20
            if (reviewCount >= 20) break;
            reviewCount++;

            var filmYear = getTagText(item, 'letterboxd\\:filmYear') || getTagText(item, 'filmYear');
            var ratingStr = getTagText(item, 'letterboxd\\:memberRating') || getTagText(item, 'memberRating');
            var rating = ratingStr ? parseFloat(ratingStr) : 0;
            var watchedDate = getTagText(item, 'letterboxd\\:watchedDate') || getTagText(item, 'watchedDate');
            var descHtml = getTagText(item, 'description');
            var extracted = extractReview(descHtml);

            var entry = document.createElement('div');
            entry.className = 'film-entry';

            var posterHtml = '';
            if (extracted.poster) {
                posterHtml = '<a href="' + link + '" target="_blank" rel="noopener">' +
                    '<img src="' + extracted.poster + '" alt="' + filmTitle + ' poster" loading="lazy">' +
                    '</a>';
            }

            var ratingHtml = rating ? '<div class="film-rating">' + ratingToStars(rating) + '</div>' : '';
            var reviewHtml = extracted.text ? '<p class="film-review">' + extracted.text + '</p>' : '';
            var dateHtml = watchedDate ? '<span class="film-date">' + formatDate(watchedDate) + '</span>' : '';

            entry.innerHTML = posterHtml +
                '<div class="film-info">' +
                '<h3><a href="' + link + '" target="_blank" rel="noopener">' + filmTitle + '</a> <span class="film-year">' + filmYear + '</span></h3>' +
                ratingHtml +
                dateHtml +
                reviewHtml +
                '</div>';

            container.appendChild(entry);
        }

        if (reviewCount === 0) {
            container.innerHTML = '<p>No reviews found.</p>';
        }
    }

    function tryFetch(proxyIndex) {
        if (proxyIndex >= PROXIES.length) {
            container.innerHTML = '<p>Could not load reviews. Visit <a href="https://letterboxd.com/mayayami/" target="_blank">my Letterboxd</a> directly.</p>';
            return;
        }
        fetch(PROXIES[proxyIndex])
            .then(function (res) {
                if (!res.ok) throw new Error('Proxy returned ' + res.status);
                return res.text();
            })
            .then(function (xml) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(xml, 'application/xml');
                var items = doc.querySelectorAll('item');
                if (!items.length) throw new Error('No items parsed');
                renderItems(items);
            })
            .catch(function (err) {
                console.warn('Proxy ' + proxyIndex + ' failed:', err);
                tryFetch(proxyIndex + 1);
            });
    }

    tryFetch(0);
})();

/* Pencil landing page — client-side search + category filtering over static JSON. */
(function () {
    'use strict';

    var DATA_URL = 'data/apps.json';
    var SCOOP_BROWSE = 'https://scoop.sh/#/apps?q=%22https://github.com/prantosmss/Pencil%22&o=false';

    var el = {
        search: document.getElementById('search'),
        starsOnly: document.getElementById('stars-only'),
        filters: document.getElementById('filters'),
        grid: document.getElementById('grid'),
        results: document.getElementById('results'),
        empty: document.getElementById('empty'),
        reset: document.getElementById('reset'),
        statApps: document.getElementById('stat-apps'),
        statCategories: document.getElementById('stat-categories'),
        statStars: document.getElementById('stat-stars'),
        lastUpdated: document.getElementById('last-updated'),
        copyButtons: document.querySelectorAll('[data-copy]')
    };

    var state = {
        apps: [],
        categories: [],
        labelById: {},
        category: 'all',
        query: '',
        starsOnly: false
    };

    function escapeText(value) {
        return value == null ? '' : String(value);
    }

    function makeCard(app) {
        var card = document.createElement('article');
        card.className = 'card';

        var top = document.createElement('div');
        top.className = 'card__top';

        var name = document.createElement('h3');
        name.className = 'card__name';
        name.textContent = escapeText(app.name);
        top.appendChild(name);

        if (app.star) {
            var star = document.createElement('span');
            star.className = 'card__star';
            star.textContent = '★';
            star.title = 'Headline pick';
            star.setAttribute('aria-label', 'Headline pick');
            top.appendChild(star);
        }
        card.appendChild(top);

        if (app.purpose) {
            var purpose = document.createElement('p');
            purpose.className = 'card__purpose';
            purpose.textContent = escapeText(app.purpose);
            card.appendChild(purpose);
        }

        if (app.note) {
            var details = document.createElement('details');
            var summary = document.createElement('summary');
            summary.textContent = 'Note';
            details.appendChild(summary);
            var note = document.createElement('p');
            note.className = 'card__note';
            note.textContent = escapeText(app.note);
            details.appendChild(note);
            card.appendChild(details);
        }

        var foot = document.createElement('div');
        foot.className = 'card__foot';

        var cat = document.createElement('span');
        cat.className = 'card__cat';
        var category = state.labelById[app.category];
        cat.textContent = category ? category.label : escapeText(app.category);
        foot.appendChild(cat);

        var actions = document.createElement('span');
        actions.className = 'card__actions';

        if (app.version) {
            var version = document.createElement('span');
            version.className = 'card__version';
            version.textContent = 'v' + escapeText(app.version);
            actions.appendChild(version);
        }

        if (app.homepage) {
            var home = document.createElement('a');
            home.className = 'card__link';
            home.href = app.homepage;
            home.rel = 'noopener';
            home.target = '_blank';
            home.textContent = 'Home';
            actions.appendChild(home);
        }

        if (app.manifest) {
            var manifest = document.createElement('a');
            manifest.className = 'card__link';
            manifest.href = app.manifest;
            manifest.rel = 'noopener';
            manifest.target = '_blank';
            manifest.textContent = 'Manifest';
            actions.appendChild(manifest);
        }

        foot.appendChild(actions);
        card.appendChild(foot);

        return card;
    }

    function matches(app) {
        if (state.starsOnly && !app.star) {
            return false;
        }
        if (state.category !== 'all' && app.category !== state.category) {
            return false;
        }
        if (!state.query) {
            return true;
        }
        var category = state.labelById[app.category];
        var haystack = [
            app.name,
            app.id,
            app.purpose,
            app.note,
            app.version,
            category ? category.label : app.category
        ].join(' ').toLowerCase();
        return state.query
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .every(function (token) {
                return haystack.indexOf(token) !== -1;
            });
    }

    function render() {
        var visible = state.apps.filter(matches);
        var fragment = document.createDocumentFragment();
        visible.forEach(function (app) {
            fragment.appendChild(makeCard(app));
        });
        el.grid.textContent = '';
        el.grid.appendChild(fragment);

        var total = state.apps.length;
        if (visible.length === 0) {
            el.results.textContent = 'No apps match your search.';
        } else if (visible.length === total && state.category === 'all' && !state.query && !state.starsOnly) {
            el.results.textContent = 'Showing all ' + total + ' apps.';
        } else {
            el.results.textContent = 'Showing ' + visible.length + ' of ' + total + ' apps.';
        }

        el.empty.hidden = visible.length !== 0;
        el.grid.hidden = visible.length === 0;
    }

    function setActiveChip() {
        var chips = el.filters.querySelectorAll('.chip');
        Array.prototype.forEach.call(chips, function (chip) {
            chip.classList.toggle('is-active', chip.dataset.category === state.category);
            chip.setAttribute('aria-pressed', chip.dataset.category === state.category ? 'true' : 'false');
        });
    }

    function syncUrl() {
        if (!window.history || !window.history.replaceState) {
            return;
        }
        var params = new URLSearchParams();
        if (state.category !== 'all') {
            params.set('category', state.category);
        }
        if (state.query) {
            params.set('q', state.query);
        }
        if (state.starsOnly) {
            params.set('stars', '1');
        }
        var query = params.toString();
        window.history.replaceState(null, '', query ? '?' + query : window.location.pathname);
    }

    function applyFilters(options) {
        render();
        setActiveChip();
        if (!options || options.sync !== false) {
            syncUrl();
        }
    }

    function buildFilters(counts) {
        var fragment = document.createDocumentFragment();

        var all = buildChip('all', 'All apps', '🎒', counts.total);
        fragment.appendChild(all);

        state.categories.forEach(function (category) {
            var count = counts.byCategory[category.id] || 0;
            if (count === 0) {
                return;
            }
            fragment.appendChild(buildChip(category.id, category.label, category.emoji, count));
        });

        el.filters.textContent = '';
        el.filters.appendChild(fragment);
    }

    function buildChip(id, label, emoji, count) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.category = id;
        chip.setAttribute('aria-pressed', 'false');
        if (emoji) {
            var icon = document.createElement('span');
            icon.textContent = emoji;
            icon.setAttribute('aria-hidden', 'true');
            chip.appendChild(icon);
        }
        chip.appendChild(document.createTextNode(label));
        var badge = document.createElement('span');
        badge.className = 'chip__count';
        badge.textContent = String(count);
        chip.appendChild(badge);
        chip.addEventListener('click', function () {
            state.category = id;
            applyFilters();
        });
        return chip;
    }

    function readUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            if (params.has('category')) {
                state.category = params.get('category');
            }
            if (params.has('q')) {
                state.query = params.get('q');
            }
            if (params.get('stars') === '1') {
                state.starsOnly = true;
            }
        } catch (error) {
            /* URL parsing is best-effort only. */
        }
    }

    function wireEvents() {
        var debounce;
        el.search.addEventListener('input', function () {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(function () {
                state.query = el.search.value.trim();
                applyFilters();
            }, 120);
        });

        el.starsOnly.addEventListener('change', function () {
            state.starsOnly = el.starsOnly.checked;
            applyFilters();
        });

        el.reset.addEventListener('click', function () {
            state.category = 'all';
            state.query = '';
            state.starsOnly = false;
            el.search.value = '';
            el.starsOnly.checked = false;
            applyFilters();
        });

        Array.prototype.forEach.call(el.copyButtons, function (button) {
            button.addEventListener('click', function () {
                var value = button.getAttribute('data-copy');
                copyText(value).then(function () {
                    var original = button.textContent;
                    button.textContent = 'Copied!';
                    button.classList.add('is-copied');
                    window.setTimeout(function () {
                        button.textContent = original;
                        button.classList.remove('is-copied');
                    }, 1600);
                });
            });
        });
    }

    function copyText(value) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value).catch(function () {
                fallbackCopy(value);
            });
        }
        fallbackCopy(value);
        return Promise.resolve();
    }

    function fallbackCopy(value) {
        var area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
        } catch (error) {
            /* Clipboard access is best-effort only. */
        }
        document.body.removeChild(area);
    }

    function setStats(apps, categories) {
        var stars = apps.filter(function (app) {
            return app.star;
        }).length;
        el.statApps.textContent = String(apps.length);
        el.statCategories.textContent = String(categories.length);
        el.statStars.textContent = String(stars);
    }

    function fail(message) {
        el.results.innerHTML = '';
        var text = document.createElement('span');
        text.textContent = message + ' ';
        el.results.appendChild(text);
        var link = document.createElement('a');
        link.href = SCOOP_BROWSE;
        link.rel = 'noopener';
        link.textContent = 'Browse the full list on scoop.sh.';
        el.results.appendChild(link);
        el.grid.hidden = true;
        el.empty.hidden = true;
    }

    function init() {
        wireEvents();
        readUrl();
        el.search.value = state.query;
        el.starsOnly.checked = state.starsOnly;

        fetch(DATA_URL, { cache: 'no-cache' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                state.apps = Array.isArray(data.apps) ? data.apps : [];
                state.categories = Array.isArray(data.categories) ? data.categories : [];
                state.labelById = {};
                state.categories.forEach(function (category) {
                    state.labelById[category.id] = category;
                });

                if (state.category !== 'all' && !state.labelById[state.category]) {
                    state.category = 'all';
                }

                var counts = { total: state.apps.length, byCategory: {} };
                state.apps.forEach(function (app) {
                    counts.byCategory[app.category] = (counts.byCategory[app.category] || 0) + 1;
                });

                setStats(state.apps, state.categories);
                buildFilters(counts);
                applyFilters({ sync: false });

                if (data.generated) {
                    var when = new Date(data.generated);
                    if (!isNaN(when.getTime())) {
                        el.lastUpdated.textContent = 'Catalogue last updated ' + when.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }) + '.';
                    }
                }
            })
            .catch(function () {
                fail('Could not load the app catalogue.');
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

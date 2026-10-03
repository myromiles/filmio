const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 7000;
const BASE_URL = 'https://filmo.to';

// Hilfreiche Headers für Anfragen an filmo.to
const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': `${BASE_URL}/`
    }
};

// CORS für Stremio aktivieren
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

// 1. MANIFEST (Verbindung zu Stremio)
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({
        id: 'org.filmoaddon',
        version: '1.0.0',
        name: 'Filmo.to Addon',
        description: 'Stremio Addon für Filmo.to',
        types: ['movie', 'series'],
        catalogs: [
            {
                type: 'movie',
                id: 'filmo_movies',
                name: 'Filmo Filme'
            }
        ],
        resources: ['catalog', 'meta', 'stream']
    });
});

// 2. KATALOG (Holt die Filme von filmo.to)
app.get('/catalog/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const response = await axios.get(`${BASE_URL}/movies`, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
        const metas = [];

        // Wir suchen nach allen Links, die auf /movie/ verweisen
        $('a[href*="/movie/"]').each((_, el) => {
            const $el =$(el);
            const link = $el.attr('href');

            if (link) {
                // Titel extrahieren
                let title = $el.attr('title');
                if (!title) {
                    title = $el.find('.title, h2, h3, .name').text().trim();
                }
                if (!title) {
                    title = $el.text().trim();
                }

                // Poster im Link selbst oder im übergeordneten Container suchen
                let poster = $el.find('img').attr('src') \vert{}\vert{}$el.find('img').attr('data-src');
                if (!poster) {
                    const $card =$el.closest('article, .movie-card, .item, div');
                    poster = $card.find('img').attr('src') \vert{}\vert{}$card.find('img').attr('data-src');
                }

                if (title && title.length > 1) {
                    const segments = link.split('/').filter(Boolean);
                    const rawId = segments.pop();

                    if (rawId && !metas.some(m => m.id === `filmo:${rawId}`)) {
                        let finalPoster = 'https://via.placeholder.com/300x450?text=Filmo';
                        if (poster) {
                            finalPoster = poster.startsWith('http') ? poster : `${BASE_URL}${poster}`;
                        }

                        metas.push({
                            id: `filmo:${rawId}`,
                            type: 'movie',
                            name: title.replace(/[\n\r]+/g, ' ').trim(),
                            poster: finalPoster
                        });
                    }
                }
            }
        });

        if (metas.length === 0) {
            console.log('WARNUNG: Keine Filme gefunden.');
            metas.push({
                id: 'filmo:test-movie',
                type: 'movie',
                name: 'Filmo: Keine Filme gefunden',
                poster: 'https://via.placeholder.com/300x450?text=Keine+Filme'
            });
        }

        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
        res.json({ metas });
    } catch (err) {
        console.error('Katalog-Fehler:', err.message);
        res.json({
            metas: [
                {
                    id: 'filmo:test-movie',
                    type: 'movie',
                    name: 'Filmo Server online (Fehler beim Laden)',
                    poster: 'https://via.placeholder.com/300x450?text=Fehler'
                }
            ]
        });
    }
});

// 3. META (Details zu einem Film)
app.get('/meta/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { id } = req.params;
    const cleanId = id.replace('filmo:', '');

    try {
        const response = await axios.get(`${BASE_URL}/movie/${cleanId}`, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);

        const title = $('h1').first().text().trim() || 'Unbekannter Titel';
        const description = $('.description, .synopsis, p').first().text().trim() || 'Keine Beschreibung verfügbar.';
        const poster = $('img.poster, .movie-poster img').attr('src');

        let finalPoster = 'https://via.placeholder.com/300x450?text=Filmo';
        if (poster) {
            finalPoster = poster.startsWith('http') ? poster : `${BASE_URL}${poster}`;
        }

        res.json({
            meta: {
                id: id,
                type: 'movie',
                name: title,
                poster: finalPoster,
                description: description
            }
        });
    } catch (err) {
        console.error('Meta-Fehler:', err.message);
        res.json({
            meta: {
                id: id,
                type: 'movie',
                name: 'Film Details',
                description: 'Fehler beim Laden der Details.'
            }
        });
    }
});

// 4. STREAM (Streaming-Links abgreifen)
app.get('/stream/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { id } = req.params;
    const cleanId = id.replace('filmo:', '');

    try {
        const response = await axios.get(`${BASE_URL}/movie/${cleanId}`, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
        const streams = [];

        // Beispielhafte Suche nach Video-Links / Iframes auf der Detailseite
        $('iframe, video source').each((_, el) => {
            const src = $(el).attr('src') \vert{}\vert{}$(el).attr('data-src');
            if (src) {
                streams.push({
                    title: 'Filmo Stream',
                    url: src.startsWith('http') ? src : `${BASE_URL}${src}`
                });
            }
        });

        res.json({ streams });
    } catch (err) {
        console.error('Stream-Fehler:', err.message);
        res.json({ streams: [] });
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`Stremio Addon läuft auf Port ${PORT}`);
});
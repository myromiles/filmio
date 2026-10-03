const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://filmo.to';

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    timeout: 10000
};

// 1. MANIFEST
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json({
        id: 'org.filmov2.addon',
        version: '2.0.0',
        name: 'Filmo V2 Addon',
        description: 'Filmo.to Stream-Quellen für Stremio',
        resources: ['catalog', 'stream'],
        types: ['movie', 'series'],
        idPrefixes: ['filmo:'],
        catalogs: [
            {
                type: 'movie',
                id: 'filmo_movies',
                name: 'Filmo Filme'
            }
        ]
    });
});

// 2. KATALOG
app.get('/catalog/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const { data } = await axios.get(`${BASE_URL}/movies`, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        const metas = [];

        $('.movie-card, .poster-item, article, a[href*="/movie/"]').each((_, el) => {
            const $el =$(el);
            
            // Vollkommen fehlerfreie Zuweisung ohne Sonderzeichen
            let title = $el.find('.title, h2, h3').text().trim();
            if (!title) {
                title = $el.attr('title') ?$el.attr('title').trim() : '';
            }
            if (!title) {
                title = $el.text().trim();
            }

            let link = $el.attr('href');
            if (!link) {
                link = $el.find('a').attr('href');
            }

            let poster = $el.find('img').attr('src');
            if (!poster) {
                poster = $el.find('img').attr('data-src');
            }

            if (link && title) {
                const rawId = link.split('/').filter(Boolean).pop();
                if (rawId && !metas.some(m => m.id === `filmo:${rawId}`)) {
                    metas.push({
                        id: `filmo:${rawId}`,
                        type: 'movie',
                        name: title,
                        poster: poster ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) : 'https://via.placeholder.com/300x450?text=Kein+Poster'
                    });
                }
            }
        });

        if (metas.length === 0) {
            metas.push({
                id: 'filmo:test-movie',
                type: 'movie',
                name: 'Filmo Test Film (Verbindung aktiv)',
                poster: 'https://via.placeholder.com/300x450?text=Filmo+Test'
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

// 3. STREAMS
app.get('/stream/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const rawId = req.params.id.replace('filmo:', '');
    try {
        const targetUrl = `${BASE_URL}/movie/${rawId}`;
        const { data } = await axios.get(targetUrl, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        const streams = [];

        $('.provider-chip').each((_, el) => {
            const $chip =$(el);

            const hosterName = $chip.find('.provider-chip__name').text().trim();
            const tags = $chip.find('.provider-chip__metadata-tag')
                              .map((_, tag) => $(tag).text().trim())
                              .get()
                              .join(' ');

            const linkId = $chip.attr('data-movie-link-id');
            const payload = $chip.attr('data-p');

            if (hosterName && linkId) {
                const streamUrl = `${BASE_URL}/out/${linkId}?p=${encodeURIComponent(payload || '')}`;

                streams.push({
                    name: 'Filmo.to',
                    title: `${hosterName} ${tags ? `[${tags}]` : ''}`,
                    url: streamUrl
                });
            }
        });

        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
        res.json({ streams });
    } catch (err) {
        console.error('Stream-Fehler:', err.message);
        res.json({ streams: [] });
    }
});

app.get('/', (req, res) => {
    res.send('<h1>Filmo V2 Stremio Addon läuft!</h1><p>Manifest-URL: <a href="/manifest.json">/manifest.json</a></p>');
});

app.listen(PORT, () => {
    console.log(`Filmo Addon läuft auf Port ${PORT}`);
});

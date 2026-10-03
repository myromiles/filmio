const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://filmo.to'; // Deine Ziel-Domain

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
    }
};

// 1. MANIFEST (Stremio Konfiguration)
app.get('/manifest.json', (req, res) => {
    res.json({
        id: 'org.filmov2.addon',
        version: '2.0.0',
        name: 'Filmo V2 Addon',
        description: 'Filmo.to Stream-Quellen für Stremio',
        resources: ['catalog', 'stream'],
        types: ['movie', 'series'],
        catalogs: [
            {
                type: 'movie',
                id: 'filmo_movies',
                name: 'Filmo Filme'
            }
        ]
    });
});

// 2. KATALOG (/catalog/movie/filmo_movies.json)
app.get('/catalog/:type/:id.json', async (req, res) => {
    try {
        const { data } = await axios.get(`${BASE_URL}/movies`, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        const metas = [];

        $('.movie-card, .poster-item, article').each((_, el) => {
            const title = $(el).find('.title, h2, h3').text().trim();
            const link = $(el).find('a').attr('href');
            const poster = $(el).find('img').attr('src');
            const id = link ? link.split('/').pop() : null;

            if (id && title) {
                metas.push({
                    id: `filmo:${id}`,
                    type: 'movie',
                    name: title,
                    poster: poster ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) : ''
                });
            }
        });

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        res.json({ metas });
    } catch (err) {
        res.status(500).json({ error: 'Katalog konnte nicht geladen werden.' });
    }
});

// 3. STREAMS (/stream/:type/:id.json)
app.get('/stream/:type/:id.json', async (req, res) => {
    const rawId = req.params.id.replace('filmo:', '');
    try {
        const targetUrl = `${BASE_URL}/movie/${rawId}`;
        const { data } = await axios.get(targetUrl, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        const streams = [];

        // Hoster-Chips auslesen (.provider-chip)
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
                // Generiere den Ausgabe-Link/Endpoint
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
        res.status(500).json({ streams: [], error: 'Fehler beim Abrufen der Streams: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Filmo Addon läuft auf http://localhost:${PORT}`);
});
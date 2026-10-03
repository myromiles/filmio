const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://filmo.to';

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': BASE_URL + '/'
    }
};

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

// 1. MANIFEST
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

// 2. KATALOG
app.get('/catalog/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const response = await axios.get(BASE_URL + '/movies', AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
        const metas = [];

        $('a[href*="/movie/"]').each((_, el) => {
            const $el = $(el);
            const link = $el.attr('href');

            if (link) {
                let title = $el.attr('title');
                if (!title) {
                    title = $el.find('.title, h2, h3, .name').text().trim();
                }
                if (!title) {
                    title = $el.text().trim();
                }

                let poster = $el.find('img').attr('src');
                if (!poster) {
                    poster = $el.find('img').attr('data-src');
                }
                if (!poster) {
                    const $card = $el.closest('article, .movie-card, .item, div');
                    poster = $card.find('img').attr('src');
                    if (!poster) {
                        poster = $card.find('img').attr('data-src');
                    }
                }

                if (title) {
                    if (title.length > 1) {
                        const segments = link.split('/').filter(Boolean);
                        const rawId = segments.pop();

                        if (rawId) {
                            let alreadyExists = false;
                            for (let i = 0; i < metas.length; i++) {
                                if (metas[i].id === 'filmo:' + rawId) {
                                    alreadyExists = true;
                                    break;
                                }
                            }

                            if (!alreadyExists) {
                                let finalPoster = 'https://via.placeholder.com/300x450?text=Filmo';
                                if (poster) {
                                    if (poster.startsWith('http')) {
                                        finalPoster = poster;
                                    } else {
                                        finalPoster = BASE_URL + poster;
                                    }
                                }

                                metas.push({
                                    id: 'filmo:' + rawId,
                                    type: 'movie',
                                    name: title.replace(/[\n\r]+/g, ' ').trim(),
                                    poster: finalPoster
                                });
                            }
                        }
                    }
                }
            }
        });

        if (metas.length === 0) {
            metas.push({
                id: 'filmo:test-movie',
                type: 'movie',
                name: 'Filmo: Keine Filme gefunden',
                poster: 'https://via.placeholder.com/300x450?text=Keine+Filme'
            });
        }

        res.json({ metas });
    } catch (err) {
        res.json({
            metas: [
                {
                    id: 'filmo:test-movie',
                    type: 'movie',
                    name: 'Filmo Server online (Fehler)',
                    poster: 'https://via.placeholder.com/300x450?text=Fehler'
                }
            ]
        });
    }
});

// 3. META
app.get('/meta/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const id = req.params.id;
    const cleanId = id.replace('filmo:', '');

    try {
        const response = await axios.get(BASE_URL + '/movie/' + cleanId, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);

        let title = $('h1').first().text().trim();
        if (!title) { title = 'Unbekannter Titel'; }

        let description = $('.description, .synopsis, p').first().text().trim();
        if (!description) { description = 'Keine Beschreibung verfügbar.'; }

        let poster = $('img.poster, .movie-poster img').attr('src');

        let finalPoster = 'https://via.placeholder.com/300x450?text=Filmo';
        if (poster) {
            if (poster.startsWith('http')) {
                finalPoster = poster;
            } else {
                finalPoster = BASE_URL + poster;
            }
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
        res.json({
            meta: {
                id: id,
                type: 'movie',
                name: 'Film Details',
                description: 'Fehler beim Laden.'
            }
        });
    }
});

// 4. STREAM
app.get('/stream/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const id = req.params.id;
    const cleanId = id.replace('filmo:', '');

    try {
        const response = await axios.get(BASE_URL + '/movie/' + cleanId, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
        const streams = [];

        $('iframe, video source').each((_, el) => {
            let src = $(el).attr('src');
            if (!src) {
                src = $(el).attr('data-src');
            }
            if (src) {
                let streamUrl = src;
                if (!src.startsWith('http')) {
                    streamUrl = BASE_URL + src;
                }
                streams.push({
                    title: 'Filmo Stream',
                    url: streamUrl
                });
            }
        });

        res.json({ streams });
    } catch (err) {
        res.json({ streams: [] });
    }
});

app.get('/', (req, res) => {
    res.send('<h1>Filmo Addon läuft!</h1>');
});

app.listen(PORT, () => {
    console.log('Server läuft auf Port ' + PORT);
});
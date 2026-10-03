const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

let PORT = 3000;
if (process.env.PORT) {
    PORT = process.env.PORT;
}

const BASE_URL = 'https://filmo.to';

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://filmo.to/'
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
        const response = await axios.get(`${BASE_URL}/movies`, AXIOS_CONFIG);
        const data = response.data;
        const $ = cheerio.load(data);
        const metas = [];

        $('a').each((_, el) => {
            const $el =$(el);
            const link = $el.attr('href');
            
            if (link) {
                if (link.includes('/movie/') || link.includes('/film/') || link.includes('/watch/')) {
                    let title = $el.attr('title');
                    if (!title) {
                        title = $el.find('.title, h2, h3, span').text().trim();
                    }
                    if (!title) {
                        title = $el.text().trim();
                    }

                    let poster = $el.find('img').attr('src');
                    if (!poster) {
                        poster = $el.find('img').attr('data-src');
                    }
                    if (!poster) {
                        const parentCard = $el.closest('.movie-card, .item, article');
                        if (parentCard.length > 0) {
                            poster = parentCard.find('img').attr('src');
                        }
                    }

                    if (title) {
                        if (title.length > 2) {
                            const lowerTitle = title.toLowerCase();
                            if (!lowerTitle.includes('login') && !lowerTitle.includes('register')) {
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
                }
            }
        });

        if (metas.length === 0) {
            console.log('WARNUNG: Keine Filme gefunden! HTML-Auszug:', String(data).substring(0, 300));
            metas.push({
                id: 'filmo:test-movie',
                type: 'movie',
                name: 'Filmo: Keine Filme gefunden (Prüfe Render-Logs)',
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

// 3. STREAMS
app.get('/stream/:type/:id.json', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const rawId = req.params.id.replace('filmo:', '');
    try {
        const targetUrl = BASE_URL + '/movie/' + rawId;
        const response = await axios.get(targetUrl, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
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

            if (hosterName) {
                if (linkId) {
                    let encodedPayload = '';
                    if (payload) {
                        encodedPayload = encodeURIComponent(payload);
                    }
                    const streamUrl = BASE_URL + '/out/' + linkId + '?p=' + encodedPayload;

                    let titleText = hosterName;
                    if (tags) {
                        titleText = titleText + ' [' + tags + ']';
                    }

                    streams.push({
                        name: 'Filmo.to',
                        title: titleText,
                        url: streamUrl
                    });
                }
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
    console.log('Filmo Addon läuft auf Port ' + PORT);
});
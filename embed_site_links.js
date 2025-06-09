/*
Script: embed_site_links.js

Purpose:
  Mirror live-site link functionality in your local index.html files—no design changes.

Usage:
  1. Place here at repo root.
  2. Ensure package.json includes axios, cheerio, glob (or run `npm install axios cheerio glob`).
  3. Called automatically via GitHub Action (see workflow).

*/

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const glob = require('glob');

const SITE_ROOT = 'https://brandolk.webflow.io';
const visited = new Set();
const linkMap = {}; // text -> absolute path

async function crawl(url) {
  if (visited.has(url) || !url.startsWith(SITE_ROOT)) return;
  visited.add(url);
  let res;
  try { res = await axios.get(url); }
  catch (e) { console.error('✖ crawl failed:', url, e.message); return; }

  const $ = cheerio.load(res.data);
  // capture links
  $('a[href^="/"]').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (text && href) linkMap[text] = href;
  });
  // recurse into same‐site links
  const links = Array.from(new Set($('a[href^="/"]').map((_,a)=> $(a).attr('href')).get()));
  for (const href of links) {
    await crawl(new URL(href, SITE_ROOT).toString());
  }
}

async function patchFiles() {
  await crawl(SITE_ROOT);
  const files = glob.sync('**/index.html', { ignore: 'node_modules/**' });
  for (const file of files) {
    const full = path.resolve(file);
    const $ = cheerio.load(fs.readFileSync(full, 'utf8'));

    // patch anchors
    $('a').each((_, el) => {
      const t = $(el).text().trim();
      if (linkMap[t]) {
        const rel = path.relative(path.dirname(full), linkMap[t].slice(1)).replace(/\\/g, '/') || './';
        $(el).attr('href', rel);
      }
    });
    // patch buttons
    $('button').each((_, el) => {
      const t = $(el).text().trim();
      if (linkMap[t]) {
        const rel = path.relative(path.dirname(full), linkMap[t].slice(1)).replace(/\\/g, '/') || './';
        $(el).attr('onclick', `window.location.href='${rel}'`);
      }
    });

    fs.writeFileSync(full, $.html(), 'utf8');
    console.log('Patched:', file);
  }
}

patchFiles().catch(e => console.error(e));

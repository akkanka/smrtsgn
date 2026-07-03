# smrtsgn

TV-skärm som visar Asterns dagens-lunch, skrapad live från astern.se/mat/lunch/.
Byggd som en **Cloudflare Worker med statiska assets** (inte klassiska Pages Functions).

## Struktur

```
smrtsgn/
├── wrangler.jsonc            Worker-config: pekar ut public/ som statiska assets
├── public/
│   ├── index.html            TV-sidan, pollar /api/menu.json var 5:e minut
│   └── assets/                Bakgrundsbild + logga
└── src/
    ├── index.js               Worker-entrypoint: routar /api/menu.json, allt annat -> statiska filer
    └── menu.js                 Scraper-logik (HTMLRewriter), edge-cachead 30 min
```

## Hur det funkar

1. `src/index.js` är Workerns huvudfunktion. Alla requests går genom den.
   - `/api/menu.json` → körs mot `src/menu.js`
   - allt annat → serveras direkt från `public/` via `env.ASSETS`
2. `menu.js` hämtar `https://www.astern.se/mat/lunch/`, letar upp dagens
   `article.menu-day` (matchat mot svensk veckodag) och plockar ut rätterna för
   **Kött**, **Fisk** och **Vegetariskt**. Övriga block (sallader, rabatt-info) filtreras bort.
3. Svaret cache:as på edge i 30 minuter (Cache API), så astern.se belastas inte i onödan
   även om TV-sidan pollar oftare.
4. `public/index.html` hämtar `/api/menu.json` direkt vid load och sedan var 5:e minut,
   och ritar om innehållet utan att sidan behöver laddas om manuellt.
5. Om dagens meny saknas (t.ex. sommarstängt eller helg) visas texten från
   `menu-day__info` istället (typ "Vi har stängt för sommaren...").

## Deploy (Cloudflare Workers, git-kopplat)

Projektet är redan kopplat till GitHub-repot och Cloudflare Workers Builds.
Varje push till `main` triggar en ny deploy automatiskt.

Manuell deploy från datorn (om du vill testa utan att pusha):
```bash
npx wrangler deploy
```

Lokal utveckling:
```bash
npx wrangler dev
```

## Att göra / justera

- **Bakgrundsbild**: `public/assets/astrnbg.png`. Byt ut filen om du vill använda en annan bild —
  CSS:en (`background-size: cover`) skalar automatiskt.
- **Helger**: visar just nu "Ingen lunchmeny hittades för idag" om det inte finns en
  matchande veckodag (dvs lör/sön). Säg till om du vill att den ska visa fredagens meny
  eller ett annat helg-meddelande istället.
- **Cache-tid**: 30 min är hårdkodat i `src/menu.js` (`CACHE_SECONDS`). Ändra vid behov.

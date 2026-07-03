# astrndgns

TV-skärm som visar Asterns dagens-lunch, skrapad live från astern.se/mat/lunch/.
Byggd för Cloudflare Pages (statisk sida + en Pages Function som scraper).

## Struktur

```
astrndgns/
├── index.html              TV-sidan (1440x1080), pollar /api/menu.json var 5:e minut
├── assets/astrnbg.png       Bakgrundsbild
└── functions/api/menu.js    Pages Function: hämtar astern.se, cache:ar 30 min, returnerar JSON
```

## Hur det funkar

1. `functions/api/menu.js` körs på Cloudflares edge när `/api/menu.json` anropas.
2. Den hämtar `https://www.astern.se/mat/lunch/`, letar upp dagens `article.menu-day`
   (matchat mot svensk veckodag) och plockar ut rätterna för **Kött**, **Fisk** och
   **Vegetariskt**. Övriga block (sallader, rabatt-info) filtreras bort.
3. Svaret cache:as på edge i 30 minuter (Cache API), så astern.se belastas inte i onödan
   även om TV-sidan pollar oftare.
4. `index.html` hämtar `/api/menu.json` direkt vid load och sedan var 5:e minut, och
   ritar om innehållet utan att sidan behöver laddas om manuellt.
5. Om dagens meny saknas (t.ex. sommarstängt eller helg) visas texten från
   `menu-day__info` istället (typ "Vi har stängt för sommaren...").

## Deploy (Cloudflare Pages)

1. Skapa repo `astrndgns` på GitHub, pusha upp innehållet i denna mapp.
2. I Cloudflare dashboard → Pages → "Create a project" → koppla repot.
3. Build settings: inget build-steg behövs (statisk mapp), lämna build command tomt
   och sätt output directory till `/` (root).
4. Deploy. `functions/api/menu.js` plockas upp automatiskt av Pages Functions.
5. Peka TV-skärmens webbläsare på `https://<projekt>.pages.dev` (eller egen domän).

## Att göra / justera

- **Logga**: just nu en textbaserad platshållare ("astern" i kursiv skript-font).
  Byt ut `.logo`-diven i `index.html` mot en `<img>` när du har den riktiga loggan (SVG/PNG).
- **Font**: `.logo` försöker använda en lokal skript-font (Snell Roundhand / Brush Script MT)
  som fallback. Vill du ha exakt samma typsnitt som i skissen, säg vilket typsnitt det är
  så laddar vi in det som webbfont istället.
- **Bakgrundsbild**: `assets/astrnbg.png` är den du skickade (2880×2160, redan mörklagd).
  Byt ut filen om du vill använda en annan bild — CSS:en skalar automatiskt.
- **Helger**: visar just nu "Ingen lunchmeny hittades för idag" om det inte finns en
  matchande veckodag (dvs lör/sön). Säg till om du vill att den ska visa fredagens meny
  eller ett annat helg-meddelande istället.
- **Cache-tid**: 30 min är hårdkodat i `menu.js` (`CACHE_SECONDS`). Ändra vid behov.

// Scrapes https://www.astern.se/mat/lunch/ and returns today's lunch menu as JSON.
// Edge-cached via the Cache API for 30 minutes so we don't hammer astern.se.

const SOURCE_URL = "https://www.astern.se/mat/lunch/";
const CACHE_SECONDS = 30 * 60; // 30 min

// Swedish weekday names as used in menu-day__title (case-insensitive match)
const CATEGORY_MAP = [
  { match: /dagens\s*kött/i, label: "Kött" },
  { match: /dagens\s*fisk/i, label: "Fisk" },
  { match: /dagens\s*veget/i, label: "Vegetariskt" },
];

function todayWeekday() {
  // Europe/Stockholm local weekday name
  const fmt = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" });
  const name = fmt.format(new Date());
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// HTMLRewriter doesn't decode HTML entities in text nodes, so numeric refs
// like &#xE9; (é) or &#xF6; (ö) come through literally. Decode the common ones.
function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalize(str) {
  return decodeEntities(str).trim().replace(/\s+/g, " ");
}

async function scrapeMenu() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "smrtsgn-lunch-tv/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Kunde inte hämta astern.se (status ${res.status})`);
  }

  const slides = [];
  let current = null;
  let currentMeal = null;

  const rewriter = new HTMLRewriter()
    .on("article.menu-day", {
      element() {
        current = { title: "", info: "", meals: [] };
        slides.push(current);
      },
    })
    .on("article.menu-day h3.menu-day__title", {
      text(t) {
        if (current) current.title += t.text;
      },
    })
    .on("article.menu-day p.menu-day__info", {
      text(t) {
        if (current) current.info += t.text;
      },
    })
    .on("article.menu-day div.menu-day__meal", {
      element() {
        currentMeal = { title: "", desc: "" };
        if (current) current.meals.push(currentMeal);
      },
    })
    .on("article.menu-day div.menu-day__meal h4.menu-day__meal__title", {
      text(t) {
        if (currentMeal) currentMeal.title += t.text;
      },
    })
    .on("article.menu-day div.menu-day__meal p.menu-day__meal__desc", {
      text(t) {
        if (currentMeal) currentMeal.desc += t.text;
      },
    });

  const transformed = rewriter.transform(res);
  await transformed.arrayBuffer(); // drain the stream to run all handlers

  // Normalize whitespace and decode HTML entities
  for (const slide of slides) {
    slide.title = normalize(slide.title);
    slide.info = normalize(slide.info);
    for (const meal of slide.meals) {
      meal.title = normalize(meal.title);
      meal.desc = normalize(meal.desc);
    }
  }

  return slides;
}

function pickTodaySlide(slides) {
  const wanted = todayWeekday();
  return slides.find((s) => s.title.toLowerCase() === wanted.toLowerCase()) || null;
}

function buildResponsePayload(slide) {
  const now = new Date().toISOString();

  if (!slide) {
    return {
      day: todayWeekday(),
      open: false,
      info: "Ingen lunchmeny hittades för idag.",
      meals: [],
      updated: now,
    };
  }

  const meals = [];
  for (const { match, label } of CATEGORY_MAP) {
    const found = slide.meals.find((m) => match.test(m.title));
    if (found && found.desc) {
      meals.push({ category: label, dish: found.desc });
    }
  }

  return {
    day: slide.title,
    open: meals.length > 0,
    info: slide.info,
    meals,
    updated: now,
  };
}

export async function getMenu(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let payload;
  try {
    const slides = await scrapeMenu();
    const slide = pickTodaySlide(slides);
    payload = buildResponsePayload(slide);
  } catch (err) {
    payload = {
      day: todayWeekday(),
      open: false,
      info: "Kunde inte hämta lunchmenyn just nu.",
      meals: [],
      error: String(err && err.message ? err.message : err),
      updated: new Date().toISOString(),
    };
  }

  const response = new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// GET /api/menu.json
// Scrapes https://www.astern.se/mat/lunch/ and returns today's lunch menu as JSON.
// Edge-cached via the Cache API for 30 minutes so we don't hammer astern.se.

const SOURCE_URL = "https://www.astern.se/mat/lunch/";
const CACHE_SECONDS = 30 * 60; // 30 min

// Swedish weekday names as used in menu-day__title (case-insensitive match)
const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];

// Only these meal categories are shown on the TV. Everything else
// (salads, discount card promo, etc.) is filtered out.
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

async function scrapeMenu() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "astrndgns-lunch-tv/1.0" },
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

  // Normalize whitespace
  for (const slide of slides) {
    slide.title = slide.title.trim().replace(/\s+/g, " ");
    slide.info = slide.info.trim().replace(/\s+/g, " ");
    for (const meal of slide.meals) {
      meal.title = meal.title.trim().replace(/\s+/g, " ");
      meal.desc = meal.desc.trim().replace(/\s+/g, " ");
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

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, context.request);

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

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

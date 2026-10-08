// DhakaFlix server list. Cloudstream-er BdixDhakaFlix14/9/7 Provider theke neya.
//
// path    : server-er bhitorer folder (Cloudstream-er mainPage-er moto). {year} thakle `years` list-er protiti year-e kora hoy.
// kind    : "movies"  -> folder-er bhitor video file = movie
//           "series"  -> folder-er bhitor season folder / episode file
//           "anime"   -> series-er moto, shudhu Anime catalog-e dekhay
module.exports = {
  // node scraper.js          (full crawl)   -> ei shob year
  years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
  // node scraper.js update   (notun item)   -> shudhu ei year gulo
  updateYears: [2026, 2025],
  concurrency: 4,

  servers: [
    {
      id: "14", name: "DhakaFlix 14", base: "http://172.16.50.14", dir: "DHAKA-FLIX-14",
      sections: [
        { path: "Animation Movies (1080p)/", kind: "movies" },
        { path: "English Movies (1080p)/({year}) 1080p/", kind: "movies" },
        { path: "Hindi Movies/({year})/", kind: "movies" },
        { path: "SOUTH INDIAN MOVIES/Hindi Dubbed/({year})/", kind: "movies" },
        { path: "KOREAN TV %26 WEB Series/", kind: "series" },
        { path: "Anime %26 Cartoon TV Series/", kind: "anime" }
      ]
    },
    {
      // 9-er shob section Cloudstream-e TvSeries (tvSeriesKeyword), Anime ta anime.
      id: "9", name: "DhakaFlix 9", base: "http://172.16.50.9", dir: "DHAKA-FLIX-9",
      sections: [
        { path: "Anime %26 Cartoon TV Series/Anime-TV Series ♥%20 A%20 —%20 F/", kind: "anime" },
        { path: "KOREAN TV %26 WEB Series/", kind: "series" },
        { path: "Documentary/", kind: "series" },
        { path: "Awards %26 TV Shows/%23 TV SPECIAL %26 SHOWS/", kind: "series" },
        { path: "Awards %26 TV Shows/%23 AWARDS/", kind: "series" },
        { path: "WWE %26 AEW Wrestling/WWE Wrestling/%282025%29%20PPV/", kind: "series" },
        { path: "WWE %26 AEW Wrestling/WWE Wrestling/", kind: "series" }
      ]
    },
    {
      id: "7", name: "DhakaFlix 7", base: "http://172.16.50.7", dir: "DHAKA-FLIX-7",
      sections: [
        { path: "English Movies/({year})/", kind: "movies" },
        { path: "English Movies (1080p)/({year}) 1080p/", kind: "movies" },
        { path: "Foreign Language Movies/Japanese Language/", kind: "movies" },
        { path: "Foreign Language Movies/Korean Language/", kind: "movies" },
        { path: "Foreign Language Movies/Bangla Dubbing Movies/", kind: "movies" },
        { path: "Foreign Language Movies/Pakistani Movie/", kind: "movies" },
        { path: "Kolkata Bangla Movies/(2022)/", kind: "movies" },
        { path: "Foreign Language Movies/Chinese Language/", kind: "movies" }
      ]
    }
    // DhakaFlix 12: BdixDhakaFlix12Provider.kt file ta paile ekhane boshabo.
  ]
};

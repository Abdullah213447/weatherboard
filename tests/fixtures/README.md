# Fixtures

Every file here is a response body recorded from the real API. Nothing is hand-written and no field is invented. Bodies are stored whole; "trimmed" means the request itself asked for a small page (`limit=6`).

## GeoDB Cities (recorded 14 Nov 2026, Basic plan)

All city searches use `GET /v1/geo/cities?namePrefix={prefix}&limit=10&sort=-population&languageCode=en`.

| File                                      | Prefix                                | Status | Why it is here                                                                            |
| ----------------------------------------- | ------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `geodb/cities-laho.json`                  | `Laho`                                | 200    | Lahore exists only as "Lahore Division" and "Lahore District"; Laholm appears three times |
| `geodb/cities-lond.json`                  | `Lond`                                | 200    | "Greater London" outranks London; Londrina appears twice                                  |
| `geodb/cities-kara.json`                  | `Kara`                                | 200    | "Karaj County" and Karaj are the same place                                               |
| `geodb/cities-no-results.json`            | `Zzqxv`                               | 200    | An empty result is a 200 with `data: []`                                                  |
| `geodb/cities-prefix-laho-type-city.json` | `Laho`, with `limit=6&types=CITY`     | 200    | Kept as evidence: with the city filter Lahore is absent                                   |
| `geodb/rate-limited-429.json`             | Second of three simultaneous requests | 429    | The per-second limit's body                                                               |

## Open-Meteo geocoding (recorded 14 Nov 2026)

`GET https://geocoding-api.open-meteo.com/v1/search?name={name}&count=10&language=en&format=json`

| File                                          | Name    | Status | Why it is here                                     |
| --------------------------------------------- | ------- | ------ | -------------------------------------------------- |
| `open-meteo-geocoding/search-laho.json`       | `Laho`  | 200    | The backup search; fuzzy matching, Lahore first    |
| `open-meteo-geocoding/search-no-results.json` | `Zzqxv` | 200    | No matches: the `results` key is absent, not empty |

## Weather (recorded 13 Nov 2026, 20:40 UTC)

Three cities recorded within seconds of each other, chosen so that the same instant falls on different local dates and at different points in the day:

| City     | Coordinates        | Offset | Local time when recorded |
| -------- | ------------------ | ------ | ------------------------ |
| Karachi  | 24.8607, 67.0011   | UTC+5  | 14 Nov, 01:38            |
| Tokyo    | 35.6762, 139.6503  | UTC+9  | 14 Nov, 05:40            |
| Honolulu | 21.3069, -157.8583 | UTC-10 | 13 Nov, 10:37            |

`{city}` below is `karachi`, `tokyo` or `honolulu`. API keys are written as `<key>`; no fixture contains one.

### OpenWeatherMap

| File                                                | Request                                                               | Status |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| `openweathermap/current-{city}.json`                | `GET /data/2.5/weather?lat={lat}&lon={lon}&units=metric&appid=<key>`  | 200    |
| `openweathermap/forecast-{city}.json`               | `GET /data/2.5/forecast?lat={lat}&lon={lon}&units=metric&appid=<key>` | 200    |
| `openweathermap/error-401-invalid-key.json`         | `GET /data/2.5/weather?lat=24.8607&lon=67.0011&appid=<32 zeros>`      | 401    |
| `openweathermap/error-404-city-not-found.json`      | `GET /data/2.5/weather?q=zzzzqxj-no-such-city&appid=<key>`            | 404    |
| `openweathermap/error-400-invalid-coordinates.json` | `GET /data/2.5/weather?lat=999&lon=67&appid=<key>`                    | 400    |

Forecast bodies are kept whole (40 three-hour readings): the day-grouping tests need every reading.

### Open-Meteo

| File                                         | Request                                                                     | Status |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| `open-meteo/forecast-{city}.json`            | `GET /v1/forecast?latitude={lat}&longitude={lon}` plus the parameters below | 200    |
| `open-meteo/error-400-invalid-latitude.json` | `GET /v1/forecast?latitude=999&longitude=67&current=temperature_2m`         | 400    |

Parameters: `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day`, `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=auto`, `forecast_days=5`, `wind_speed_unit=ms`, `timeformat=unixtime`.

### Not recorded

A 429 from OpenWeatherMap or Open-Meteo. Getting one means deliberately exceeding the quota, which is not worth doing to a free service. The rate-limit path is tested with the real 429 body from GeoDB and by status code.

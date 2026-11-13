# Fixtures

Every file here is a response body recorded from the real API. Nothing is hand-written and no field is invented. Bodies are stored whole; "trimmed" means the request itself asked for a small page (`limit=6`).

## GeoDB Cities (recorded 14 Nov 2026, Basic plan)

| File                                      | Request                                                                  | Status |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------ |
| `geodb/cities-prefix-laho.json`           | `GET /v1/geo/cities?namePrefix=Laho&limit=6&sort=-population`            | 200    |
| `geodb/cities-prefix-laho-type-city.json` | `GET /v1/geo/cities?namePrefix=Laho&limit=6&sort=-population&types=CITY` | 200    |
| `geodb/rate-limited-429.json`             | Second of three simultaneous requests                                    | 429    |

The two `Laho` files differ on purpose: with `types=CITY` Lahore does not appear at all, because GeoDB holds it as an `ADM2` record.

# TripSync

TripSync is a travel planning platform that makes organizing trips easier. Users plan their trips, build a day-by-day itinerary, track their budget, find places to visit at their destination, and keep everything in one place.

**Group name:** FAKNAAN DEVS
**Subject:** Integrative Programming

**Group members**
- Sean Marco D. Barcenilla
- Jaden Charles A. Dacanay
- Joseff Vin Leo P. Paclibar
- Enrique Ray Rodriguez

## Features

| Page | What it does |
|---|---|
| Login / Sign up | Supabase accounts, smooth login/sign-up switch, dark mode, photo carousel, forgot and reset password |
| Overview | Search a destination, Surprise me (Tripadvisor 2026 Top 10), next trip with map, weather and country info, timeline and checklist |
| My trips | Create, edit and delete trips (soft delete), filters for Happening now, Upcoming and Past, no overlapping trip dates |
| Itinerary | Day-by-day plans with start and end times, places, a Now marker and overlap warnings |
| Budget | Expenses per trip by category, spent vs budget, daily allowance, paying in local currency |
| Where to go | Places near your hotel, your location or the city center, with directions, ♡ save and ＋ Itinerary |
| Saved | Saved destinations and spots, plan a trip from a saved destination |

## Tech stack

- HTML, CSS and JavaScript (no framework)
- Supabase: authentication, PostgreSQL database with row level security, Edge Functions
- Leaflet + OpenFreeMap for maps

## APIs used

| API | Used for | Key needed |
|---|---|---|
| Google Gemini (through a Supabase Edge Function) | Trip name and tagline suggestions | Yes, stored as a Supabase secret |
| Open-Meteo | Finding places on the map, weather forecast | No |
| Wikipedia | Cover photos, descriptions, nearby places | No |
| Countries GraphQL | Flag, capital, currency, languages | No |
| Frankfurter | Exchange rates | No |
| Nager.Date | Public holidays during a trip | No |
| OpenStreetMap Nominatim | Searching for your hotel | No |
| OpenFreeMap | Map tiles with English labels | No |

## Setup

1. In Supabase, open **SQL Editor** and run `supabase/schema.sql`.
2. Put your Supabase project URL and publishable key in `supabase/supabase-config.js`. Never put a service role or secret key in browser code.
3. In **Authentication → URL Configuration**, add `http://127.0.0.1:5500/**` to **Redirect URLs** so the reset password link works.
4. Deploy the Edge Function in `supabase/functions/suggest-trip-name` and add the secret `GEMINI_API_KEY` under **Edge Functions → Secrets**.
5. Open `index/index.html` with the VS Code Live Server extension.

## Folder structure

```
index/                  login, sign up and reset password
dashboard/              overview page, shared API and AI helpers
  trips/                my trips
  itinerary/            day-by-day plans
  budget/               expenses and budget
  nearby/               where to go
  saved/                saved places
supabase/
  schema.sql            tables, columns and security policies
  supabase-config.js    Supabase connection
  functions/            Gemini Edge Function
```
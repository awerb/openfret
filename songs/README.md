# Starter packs

This folder contains curated, importable song collections you can load into your library with one tap from inside the app: **Library → Browse Starter Packs**.

Every song in every pack is verifiably public domain in the United States. Each entry includes a `license` field with the source attribution.

## Included packs

- **`campfire-classics.json`** — 8 traditional campfire songs everyone knows. Three-chord-friendly.
- **`blues-101.json`** — 6 foundational blues and early jazz numbers. Perfect for learning the 12-bar form and dominant 7th voicings.
- **`holiday-classics.json`** — 6 traditional Christmas carols. Great for group singing in December.

## Format

Each file is an OpenFret library export. Same shape as the file you'd get from **Library → Export to file**:

```json
{
  "app": "OpenFret",
  "version": 1,
  "name": "Pack name",
  "description": "What's in this pack.",
  "songs": [
    {
      "id": "unique-id",
      "title": "Song Title",
      "artist": "Artist or Traditional",
      "genre": "folk | blues | jazz | rock | country | pop | other",
      "chords": "G C D Em",
      "lyrics": "[G]Lyrics with [D]chord brackets",
      "youtube": "https://www.youtube.com/results?search_query=...",
      "license": "Public Domain (...)",
      "sample": false
    }
  ]
}
```

## Contributing a pack

PRs welcome. Three rules:

1. Every song must be verifiably public domain in the US (composed pre-1929 or traditional with no known author).
2. Each song must include a `license` field explaining why.
3. Include a `name` and `description` at the top of the JSON.

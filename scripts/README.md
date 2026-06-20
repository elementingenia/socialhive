# Scripts

## DVD Library Import

Converts the `DVD_Library_Master` Google Sheet into SQL for Supabase.

### Steps

1. Open the [DVD_Library_Master sheet](https://docs.google.com/spreadsheets/d/1sobWN3EstF-ZL98cEi-WdUjI5CyMEWHdIlusV287dKk)
2. **File → Download → Comma Separated Values (.csv)**
3. Save the file as `scripts/dvd_library_input.csv`
4. Run:
   ```bash
   python3 scripts/import_dvd_library.py
   ```
5. Copy the contents of `scripts/dvd_library_output.sql` into **Supabase SQL Editor** and run.

### What it does

- Inserts all rows into `movies` table with `we_own = true`
- Films: title as-is, year stored, genre as-is
- TV Series: title becomes "Show (Season X)", genre prefixed with "TV Series,"
- Music & Concert: genre prefixed with "Music,"
- Ratings stripped from "7.6/10" → "7.6"
- Re-running is **safe** — `ON CONFLICT (title) DO NOTHING` skips existing rows

### CSV column format (must match sheet)

```
Index, Title, Category, Year, Genre, Rating, Notes, IMDB_ID
```

### Prerequisite — unique constraint on movies.title

The ON CONFLICT clause requires a unique index. If not already present, run this
once in Supabase SQL Editor before the first import:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS movies_title_unique ON movies (title);
```

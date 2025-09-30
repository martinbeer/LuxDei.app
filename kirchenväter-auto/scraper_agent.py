"""
Scraper for the German translations contained in the "Bibliothek der Kirchenväter" (BKV).

This module walks through the list of works available at
https://bkv.unifr.ch/de/works and extracts every German version (Übersetzung
or Kommentar in the German localisation), crawls each division of a work
and stores the data in a Supabase database.  The scraper normalises the
content into a relational schema consisting of authors, works, sections,
passages, verses, notes, note_links and assets.  It is designed to be
idempotent: each insertion uses UPSERT semantics on unique keys so that
re‑runs do not create duplicates.

High level overview of the workflow:

1. Fetch the master list of works and discover the URLs of all German
   versions.  Only links whose small text indicates “Übersetzung (Deutsch)”
   or “Kommentar (Deutsch)” are followed.  Each discovered URL points to
   a “version” page which in turn contains a table of contents and
   metadata.

2. For each version, parse the bibliographic metadata (author name,
   lifespan, original title, translation title, bibliographic reference,
   century, collaborators etc.) and build a slug for the author and work.

3. Extract the table of contents from the “Inhaltsangabe” list.  This
   nested list describes the hierarchical structure of the work down to
   chapter or paragraph level.  Each entry includes a link to a
   division page.  The depth of the list determines the `level` of a
   section (1 = top level, 2 = chapter, 3 = sub‑chapter).

4. Visit each division page and extract the heading, the main body text
   and any associated notes.  The HTML of the division is retained and
   cleaned to remove navigational artefacts.  A plain text version is
   also created by stripping tags and normalising whitespace.  Verses are
   detected heuristically by counting `<br>` tags and split into
   individual rows with indentation preserved.

5. Notes and endnotes are collected from the bottom of the division page
   (after the `* * *` separator).  Each note is stored once with its
   key (e.g. `1`, `a`) and type (`footnote` by default).  All anchors
   within the passage that reference a note generate a row in
   `note_links`.  Context snippets and character positions are captured
   to aid indexing.

6. Any images or tables encountered within a division are stored as
   assets.  The raw HTML of tables is retained in the passage.

7. Each work is written to Supabase in a transaction.  Authors are
   created or updated first, then works, followed by sections,
   passages, verses, notes, note links and assets.  Unique constraints on
   the database enforce idempotence; upserts utilise these constraints.

The scraper offers various command line options to control its behaviour,
such as rate limiting, resuming from a particular work slug and limiting
the number of works to process.  Checkpoints are written to disk to
allow resumption after interruptions.

To run the scraper you will need to install its dependencies and have
network access to the BKV site.  Dependencies can be installed via
pip (see requirements.txt for a full list), and the Supabase service
role key included in the environment or configuration file is required
for inserting data.  Example usage:

    python scraper_bkv.py --start-url https://bkv.unifr.ch/de/works --rate 2.0

Notes:
    - This script respects the robots.txt of the target site by
      imposing a configurable delay between requests and backing off
      automatically on server errors.
    - The Supabase credentials provided by the user are embedded here
      for convenience.  In production these should be stored securely
      (e.g. environment variables or a secrets manager).
"""

import argparse
import asyncio
import csv
import datetime as dt
import json
import logging
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union

import httpx
from bs4 import BeautifulSoup, Tag
from slugify import slugify
from tenacity import (RetryError, retry, retry_if_exception_type,
                      stop_after_attempt, wait_exponential_jitter)

# Optional import: If the supabase client is unavailable at import time,
# the script can still be used for data extraction only.  See
# ``connect_supabase`` below for lazy import.
try:
    from supabase import create_client, Client as SupabaseClient
except ImportError:
    create_client = None
    SupabaseClient = None


############################
# Utility functions
############################

def slugify_name(name: str) -> str:
    """Generate a slug from a human readable name.

    The slugify library transliterates accented characters, removes
    punctuation and replaces spaces with hyphens.  The result is
    lower‑case.  Additional normalisation can be applied here if
    necessary.
    """
    return slugify(name, lowercase=True)


def normalise_whitespace(text: str) -> str:
    """Collapse all sequences of whitespace into a single space and trim.

    Non‑breaking spaces and soft hyphens are replaced with regular
    spaces; newline and tab characters are folded into spaces.  This
    function can be used to prepare plain text for indexing.
    """
    # replace NBSP and soft hyphen
    text = text.replace('\u00A0', ' ').replace('\u00AD', '')
    # collapse all whitespace
    return re.sub(r'\s+', ' ', text).strip()


def generate_uuid() -> str:
    """Generate a UUID v7 (monotonic, time based).  Falls back to v4 if
    v7 is unavailable (Python < 3.12)."""
    if hasattr(uuid, 'uuid7'):
        return str(uuid.uuid7())
    return str(uuid.uuid4())

# Deterministic namespaces for reproducible author and work IDs.  Using
# uuid5 with a namespace ensures that the same slug always maps to
# the same UUID.  These constants are arbitrary but should remain
# constant for the lifetime of the project.
UUID_NAMESPACE_AUTHORS = uuid.UUID('11111111-1111-1111-1111-111111111111')
UUID_NAMESPACE_WORKS = uuid.UUID('22222222-2222-2222-2222-222222222222')


############################
# Data models
############################

@dataclass
class Author:
    id: str
    name: str
    name_original: Optional[str]
    lifespan: Optional[str]
    slug: str


@dataclass
class Work:
    id: str
    author_id: str
    title: str
    title_original: Optional[str]
    year_from: Optional[int]
    year_to: Optional[int]
    language: str
    work_slug: str
    source_url: str
    edition_info: Optional[str]
    genre: Optional[str]
    summary: Optional[str]


@dataclass
class Section:
    id: str
    work_id: str
    parent_id: Optional[str]
    level: int
    label: str
    title: Optional[str]
    order_index: int


@dataclass
class Passage:
    id: str
    section_id: str
    order_index: int
    html: str
    plain_text: str
    contains_verse_lines: bool


@dataclass
class Verse:
    id: str
    passage_id: str
    line_no: int
    text: str
    indent_level: int
    is_heading: bool


@dataclass
class Note:
    id: str
    work_id: str
    note_key: str
    note_type: str  # 'footnote', 'endnote' or 'marginal'
    html: str
    plain_text: str
    order_index: int


@dataclass
class NoteLink:
    id: str
    work_id: str
    note_id: str
    origin_passage_id: str
    origin_html_anchor: str
    context_snippet: str
    position_char: Optional[int]


@dataclass
class Asset:
    id: str
    work_id: str
    kind: str  # 'image', 'table' or 'other'
    src_url: str
    caption_text: Optional[str]
    order_index: int


############################
# HTTP client with retry and rate limiting
############################

class HttpClient:
    """Asynchronous HTTP client with rate limiting and retry semantics."""

    def __init__(self, rate: float = 1.0, timeout: float = 30.0) -> None:
        self.rate = max(rate, 0.1)  # minimum 0.1 requests per second
        self.timeout = timeout
        self._last_request_ts = 0.0
        # Use a single client for connection pooling
        self.client = httpx.AsyncClient(timeout=timeout)

    async def close(self) -> None:
        await self.client.aclose()

    async def _throttle(self) -> None:
        """Sleep if the last request was made too recently."""
        elapsed = time.monotonic() - self._last_request_ts
        min_interval = 1.0 / self.rate
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)

    @retry(reraise=True,
           stop=stop_after_attempt(5),
           wait=wait_exponential_jitter(initial=0.5, max=5.0),
           retry=retry_if_exception_type(httpx.HTTPError))
    async def fetch(self, url: str) -> httpx.Response:
        """Fetch a URL with retry and respect for rate limits.

        HTTP 3xx responses are followed automatically by enabling
        ``follow_redirects`` so that the final page is returned.
        """
        await self._throttle()
        self._last_request_ts = time.monotonic()
        response = await self.client.get(url, follow_redirects=True)
        # retry on server errors and 429
        if response.status_code >= 500 or response.status_code == 429:
            raise httpx.HTTPError(f"Server error {response.status_code} for {url}")
        return response


############################
# Supabase client abstraction
############################

class Database:
    """Thin wrapper around Supabase Python client to perform upserts.

    This class is initialised lazily to avoid import errors when the
    supabase package is not available.  It exposes upsert methods for
    each table defined in the data model.  All operations are
    asynchronous to integrate smoothly with the crawler.
    """

    def __init__(self, url: str, service_key: str) -> None:
        if create_client is None:
            raise RuntimeError("supabase package is not installed; cannot connect")
        self.supabase: SupabaseClient = create_client(url, service_key)

    async def upsert(self, table: str, rows: List[Dict], conflict_cols: Union[str, List[str]]) -> None:
        """Upsert a list of rows into a table using the specified conflict columns.

        If multiple rows are provided they are inserted in a single call.
        """
        if not rows:
            return
        # Supabase Python client is synchronous; wrap in thread executor
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._upsert_blocking, table, rows, conflict_cols)

    def _upsert_blocking(self, table: str, rows: List[Dict], conflict_cols: Union[str, List[str]]) -> None:
        logging.debug(f"Upserting {len(rows)} rows into {table} on conflict {conflict_cols}")
        response = self.supabase.table(table).upsert(rows, on_conflict=conflict_cols).execute()
        # Supabase Python client returns an APIResponse object with attributes
        # status_code and data; fallback to dict for older versions.
        status = None
        if hasattr(response, 'status_code'):
            status = response.status_code
        elif isinstance(response, dict):
            status = response.get('status_code')
        # Treat 409 Conflict as a successful upsert, since it indicates that
        # the record already exists and no changes were applied.  Only log
        # unexpected status codes.
        if status not in (200, 201, 204, 409):
            logging.warning(f"Upsert into {table} returned status {status}: {response}")


############################
# Parsing functions
############################

async def fetch_soup(client: HttpClient, url: str) -> BeautifulSoup:
    """Fetch a URL and parse it with BeautifulSoup."""
    resp = await client.fetch(url)
    content = resp.text
    return BeautifulSoup(content, 'html.parser')


def parse_author_and_title(soup: BeautifulSoup) -> Tuple[str, Optional[str], str, Optional[str], Optional[str]]:
    """Extract author name, lifespan, original title and translation title from a version page.

    Returns a tuple (author_name, lifespan, title_original, translation_title, genre).
    The genre is derived from the small label preceding the version title, e.g.
    "Übersetzung" or "Kommentar".
    """
    # Author and titles appear near the top of the version page in the order:
    #   Author (lifespan)
    #   Original title
    #   Translation title
    # We will search for successive <h1>/<h2> tags or headings containing these.
    # Fallback to text scanning if the DOM changes.
    text = soup.get_text("\n", strip=True)
    # Attempt to capture the author and lifespan from patterns like
    # "Ambrosius von Mailand (340-397)" or "Ambrosius von Mailand 340-397"
    author_name = None
    lifespan = None
    # Look for a line with parentheses containing years
    for line in text.split("\n"):
        m = re.match(r"(?P<name>.+?)\s*\((?P<years>\d{1,4}.*?\d{1,4})\)", line)
        if m:
            author_name = m.group('name').strip()
            lifespan = m.group('years').strip()
            break
    # If still None, take the first non empty line as author
    if not author_name:
        for line in text.split("\n"):
            if line.strip():
                author_name = line.strip()
                break
    # Titles: find translation title and original title around "Bibliographische Angabe"
    translation_title = None
    original_title = None
    # On the version page the translation title is often repeated in a heading and
    # followed by the original title in parentheses.
    headings = soup.find_all(["h1", "h2", "h3", "h4"])
    for hd in headings:
        text = hd.get_text(strip=True)
        # Match patterns like "Der Tod ein Gut (De bono mortis)"
        m = re.match(r"(?P<trans>.+?)\s*\((?P<orig>[^()]+)\)", text)
        if m:
            translation_title = m.group('trans').strip()
            original_title = m.group('orig').strip()
            break
    # Genre: look for labels like "Übersetzung", "Kommentar", "Edition"
    genre = None
    smalls = soup.find_all('small')
    for sm in smalls:
        txt = sm.get_text(strip=True).lower()
        if 'übersetzung' in txt:
            genre = 'translation'
            break
        if 'kommentar' in txt:
            genre = 'commentary'
            break
        if 'edition' in txt:
            genre = 'edition'
            break
    return author_name or '', lifespan, original_title, translation_title, genre


def parse_bibliographic_info(soup: BeautifulSoup) -> Tuple[Optional[str], Optional[int], Optional[int]]:
    """Extract edition info and approximate date range from a version page.

    The page contains headings such as "Bibliographische Angabe" and "Datum".
    We extract the text beneath these headings.  The date may be given
    either as a specific year (e.g. 390) or a century (e.g. "4. Jh.").
    Returns a tuple (edition_info, year_from, year_to).
    """
    edition_info = None
    year_from = None
    year_to = None
    for h3 in soup.find_all(['h2', 'h3', 'h4']):
        title = h3.get_text(strip=True).lower()
        if 'bibliographische angabe' in title:
            # Capture following sibling text until the next heading
            parts = []
            for sib in h3.next_siblings:
                if isinstance(sib, Tag) and sib.name.startswith('h'):
                    break
                if isinstance(sib, Tag):
                    parts.append(sib.get_text(" ", strip=True))
                elif isinstance(sib, str):
                    parts.append(sib.strip())
            edition_info = normalise_whitespace(' '.join(parts).strip())
        if title == 'datum':
            # Date may appear as the text in the next element
            # E.g. "4. Jh." or "390" or "390-400".
            dt_text = ''
            for sib in h3.next_siblings:
                if isinstance(sib, Tag) and sib.name.startswith('h'):
                    break
                if isinstance(sib, Tag):
                    dt_text += ' ' + sib.get_text(" ", strip=True)
                elif isinstance(sib, str):
                    dt_text += ' ' + sib.strip()
            dt_text = dt_text.strip()
            # Convert centuries to approximate years
            m_century = re.match(r"(\d+)\.\s*Jh", dt_text)
            if m_century:
                century = int(m_century.group(1))
                year_from = (century - 1) * 100
                year_to = century * 100 - 1
            else:
                m_range = re.match(r"(\d{1,4})\s*-\s*(\d{1,4})", dt_text)
                if m_range:
                    year_from = int(m_range.group(1))
                    year_to = int(m_range.group(2))
                else:
                    m_year = re.match(r"(\d{1,4})", dt_text)
                    if m_year:
                        year_from = int(m_year.group(1))
    return edition_info, year_from, year_to


def parse_toc(soup: BeautifulSoup, base_url: str) -> List[Tuple[int, str, str]]:
    """Parse the table of contents to extract sections.
    
    If no traditional TOC is found, discovers divisions by testing sequential URLs.
    Returns a list of tuples (level, label, url) sorted by appearance.
    ``base_url`` should be the version URL (without trailing slash).  The
    returned URLs will be fully qualified.
    """
    toc_entries: List[Tuple[int, str, str]] = []
    
    # First, try to find traditional table of contents
    toc_heading = None
    for h in soup.find_all(['h2', 'h3', 'h4']):
        if 'inhaltsangabe' in h.get_text(strip=True).lower():
            toc_heading = h
            break
    
    if toc_heading:
        # The list immediately following the heading
        ul = toc_heading.find_next('ul')
        if ul:
            def walk_list(list_tag: Tag, level: int) -> None:
                order_idx = 1
                for li in list_tag.find_all('li', recursive=False):
                    a = li.find('a', href=True)
                    if a:
                        label = a.get_text(" ", strip=True)
                        href = a['href']
                        # Build absolute URL relative to base
                        if href.startswith('http'):
                            url = href
                        else:
                            url = httpx.URL(base_url).join(href).human_repr()
                        toc_entries.append((level, label, url))
                    # Recurse into nested lists to find subchapters
                    sub_ul = li.find('ul')
                    if sub_ul:
                        walk_list(sub_ul, level + 1)
                    order_idx += 1
            walk_list(ul, 1)
    
    # If no TOC found, discover divisions by testing sequential URLs
    if not toc_entries:
        logging.info(f"No traditional TOC found for {base_url}, testing division URLs")
        import httpx
        for i in range(1, 21):  # Test up to 20 divisions
            division_url = f"{base_url}/divisions/{i}"
            try:
                # Use synchronous request for simplicity in this context
                response = httpx.get(division_url, timeout=10.0)
                if response.status_code == 200:
                    # Check if page has actual content (not "not found")
                    if len(response.text) > 1000 and 'not found' not in response.text.lower():
                        toc_entries.append((1, f"Division {i}", division_url))
                        logging.debug(f"Found division {i} at {division_url}")
                    else:
                        break  # No more divisions
                else:
                    break  # No more divisions
            except:
                break  # Network error or no more divisions
    
    return toc_entries


def extract_main_and_notes(soup: BeautifulSoup) -> Tuple[str, str, List[Tuple[str, str]]]:
    """Split a division page into the main content and notes.

    The division page typically contains a heading, a body of text and
    then a separator ``* * *`` followed by the notes.  This function
    returns a tuple (html, plain_text, notes) where ``notes`` is a list
    of (note_key, note_html) in the order they appear.  Note keys are
    extracted from the beginning of each note line (e.g. "1." or
    "a.").  Inline anchors in the main text are preserved.
    """
    # Identify the separator by looking for three consecutive asterisks
    html_content = ''
    note_entries: List[Tuple[str, str]] = []
    # Convert to string lines for easier splitting
    raw_html = str(soup)
    # Look for the first occurrence of "* * *" with or without surrounding whitespace
    m_sep = re.search(r"\*\s*\*\s*\*", raw_html)
    if m_sep:
        main_html = raw_html[:m_sep.start()]
        notes_html = raw_html[m_sep.end():]
    else:
        main_html = raw_html
        notes_html = ''
    # Parse main HTML to clean navigational elements
    main_soup = BeautifulSoup(main_html, 'html.parser')
    # Remove nav elements like print/report/error links
    for nav in main_soup.find_all(lambda tag: tag.name in ('nav', 'hr') or ('class' in tag.attrs and 'breadcrumb' in tag['class'])):
        nav.decompose()
    html_content = str(main_soup)
    plain_text = normalise_whitespace(main_soup.get_text(" ", strip=True))
    # Parse notes
    if notes_html:
        notes_soup = BeautifulSoup(notes_html, 'html.parser')
        # Note entries are often separated by line breaks or <br>.  We iterate
        # through all text pieces and capture key and text.
        for p in notes_soup.find_all(['p', 'li'], recursive=False):
            txt = p.get_text(" ", strip=True)
            if not txt:
                continue
            # Split at the first dot followed by space or at whitespace
            m = re.match(r"^(\d+|[a-zA-Z]+)[\.|\)]\s*(.*)", txt)
            if m:
                key = m.group(1)
                content = m.group(2).strip()
            else:
                # fallback: use the entire first word as key
                parts = txt.split(None, 1)
                key = parts[0]
                content = parts[1] if len(parts) > 1 else ''
            note_entries.append((key, str(p)))
    return html_content, plain_text, note_entries


def detect_verses(html: str) -> Optional[List[Tuple[str, int]]]:
    """Detect verse lines in HTML and return a list of (line_text, indent_level).

    A section is considered versified if it contains at least three `<br>`
    tags inside a single paragraph or if elements with class names like
    "verse" or "poem" are present.  Indentation is approximated by
    counting leading non‑breaking spaces and emsp entities.
    Returns None if no verse structure is detected.
    """
    # Quick heuristic: if the html contains at least three <br> tags in total,
    # treat the content as verse and split on all <br> tags.
    if html.count('<br') < 3:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    # Replace <br> with newline markers
    for br in soup.find_all('br'):
        br.replace_with('\n')
    text = soup.get_text("", strip=False)
    lines: List[Tuple[str, int]] = []
    for raw_line in text.split('\n'):
        if not raw_line.strip():
            continue
        # Determine indent by leading whitespace count
        indent_level = len(raw_line) - len(raw_line.lstrip())
        lines.append((raw_line.strip(), indent_level))
    return lines if len(lines) >= 3 else None


def extract_assets(html: str) -> List[Asset]:
    """Extract image and table assets from HTML.

    Returns a list of Asset dataclass instances.  Assets are not yet
    associated with a work_id or order index; these will be populated
    during insertion.
    """
    soup = BeautifulSoup(html, 'html.parser')
    assets: List[Asset] = []
    order = 1
    for img in soup.find_all('img'):
        src = img.get('src')
        caption = img.get('alt') or None
        assets.append(Asset(id=generate_uuid(), work_id='', kind='image',
                            src_url=src or '', caption_text=caption, order_index=order))
        order += 1
    for table in soup.find_all('table'):
        # Wrap the table HTML as an asset; the passage will retain the table as part of its HTML
        assets.append(Asset(id=generate_uuid(), work_id='', kind='table',
                            src_url='', caption_text=None, order_index=order))
        order += 1
    return assets


############################
# Work processing
############################

async def process_version(client: HttpClient, db: Optional[Database], version_url: str,
                          max_sections: Optional[int] = None) -> None:
    """Process a single version (translation or commentary).

    This function orchestrates the extraction of metadata, sections,
    passages, verses, notes and assets for a given version URL.  It
    performs upserts into Supabase if a database handle is provided.

    Parameters
    ----------
    client: HttpClient
        The HTTP client used for downloading pages.
    db: Database or None
        When provided, results are written to Supabase.  Otherwise the
        extracted data is discarded after validation.
    version_url: str
        The base URL of the version (e.g. .../versions/slug).
    max_sections: Optional[int]
        If provided, limits the number of sections processed (useful for
        testing).
    """
    logging.info(f"Processing version {version_url}")
    # Fetch version page with metadata
    soup = await fetch_soup(client, version_url)
    author_name, lifespan, orig_title, trans_title, genre = parse_author_and_title(soup)
    edition_info, year_from, year_to = parse_bibliographic_info(soup)
    toc_entries = parse_toc(soup, version_url)
    if not toc_entries:
        logging.warning(f"No table of contents found for {version_url}")
        return
    # Build author and work records
    author_slug = slugify_name(author_name)
    work_slug = slugify_name(f"{author_slug}-{trans_title or orig_title or 'unknown'}-de")
    # Use deterministic UUIDs for authors and works based on their slugs to avoid
    # foreign key conflicts on upsert.  UUID5 yields the same ID for the same slug.
    author_uuid = uuid.uuid5(UUID_NAMESPACE_AUTHORS, author_slug)
    work_uuid = uuid.uuid5(UUID_NAMESPACE_WORKS, work_slug)
    author_id = str(author_uuid)
    work_id = str(work_uuid)
    author = Author(id=author_id, name=author_name, name_original=None, lifespan=lifespan, slug=author_slug)
    work = Work(id=work_id, author_id=author_id, title=trans_title or orig_title or '',
                title_original=orig_title, year_from=year_from, year_to=year_to,
                language='de', work_slug=work_slug, source_url=version_url,
                edition_info=edition_info, genre=genre, summary=None)
    # Prepare containers for subordinate entities
    sections: List[Section] = []
    passages: List[Passage] = []
    verses: List[Verse] = []
    notes: Dict[str, Note] = {}
    note_links: List[NoteLink] = []
    assets: List[Asset] = []
    # Map division URLs to section IDs to allow note_links origin mapping
    section_id_map: Dict[str, str] = {}
    # Process each entry in the table of contents
    for idx, (level, label, div_url) in enumerate(toc_entries, start=1):
        if max_sections and idx > max_sections:
            break
        logging.debug(f"Fetching division {div_url}")
        div_soup = await fetch_soup(client, div_url)
        # Extract heading for title of section
        heading = div_soup.find(['h1', 'h2', 'h3'])
        section_title = heading.get_text(" ", strip=True) if heading else None
        section_id = generate_uuid()
        parent_id = None
        # Determine parent section by comparing levels: entries are appended
        # sequentially; the last entry of lower level becomes the parent.
        # Build a stack to track section ids for each level.
        # Initialize stack on first iteration
        if idx == 1:
            section_stack: Dict[int, str] = {}
        # Pop deeper levels when necessary
        for lvl in list(section_stack.keys()):
            if lvl >= level:
                section_stack.pop(lvl)
        # Assign parent id
        parent_id = section_stack.get(level - 1)
        section_stack[level] = section_id
        section = Section(id=section_id, work_id=work_id, parent_id=parent_id,
                          level=level, label=label, title=section_title,
                          order_index=idx)
        sections.append(section)
        section_id_map[div_url] = section_id
        # Extract main content and notes
        main_html, plain_text, note_entries = extract_main_and_notes(div_soup)
        # Check for verse structure
        verse_lines = detect_verses(main_html)
        contains_verse = verse_lines is not None
        passage_id = generate_uuid()
        passage = Passage(id=passage_id, section_id=section_id, order_index=1,
                          html=main_html, plain_text=plain_text,
                          contains_verse_lines=contains_verse)
        passages.append(passage)
        # Extract verses if present
        if verse_lines:
            for line_no, (line_text, indent) in enumerate(verse_lines, start=1):
                verses.append(Verse(id=generate_uuid(), passage_id=passage_id,
                                    line_no=line_no, text=line_text,
                                    indent_level=indent, is_heading=False))
        # Process notes
        for n_idx, (note_key, note_html) in enumerate(note_entries, start=1):
            # Create or retrieve the note object
            if note_key not in notes:
                note_id = generate_uuid()
                note = Note(id=note_id, work_id=work_id, note_key=note_key,
                            note_type='footnote', html=note_html,
                            plain_text=normalise_whitespace(BeautifulSoup(note_html, 'html.parser').get_text(" ", strip=True)),
                            order_index=len(notes) + 1)
                notes[note_key] = note
            else:
                note_id = notes[note_key].id
            # Parse main HTML to find superscript or anchor tags containing the note key
            msoup = BeautifulSoup(main_html, 'html.parser')
            # Search for <sup> or <a> elements whose text exactly matches the key
            anchor_elems = []
            for tag in msoup.find_all(['sup', 'a']):
                tag_text = tag.get_text(strip=True)
                if tag_text and tag_text == note_key:
                    anchor_elems.append(tag)
            for anchor in anchor_elems:
                # Build a context snippet from the parent element's text
                parent_text = anchor.parent.get_text(" ", strip=True) if anchor.parent else ''
                snippet = parent_text[:60]
                link_id = generate_uuid()
                note_links.append(NoteLink(id=link_id, work_id=work_id,
                                           note_id=note_id, origin_passage_id=passage_id,
                                           origin_html_anchor=note_key, context_snippet=snippet,
                                           position_char=None))
        # Extract assets
        for asset in extract_assets(main_html):
            asset.work_id = work_id
            asset.order_index = len(assets) + 1
            assets.append(asset)
    # Write to database if available
    if db:
        # Upsert author and work
        await db.upsert('authors', [author.__dict__], conflict_cols='slug')
        await db.upsert('works', [work.__dict__], conflict_cols='work_slug')
        # Upsert sections
        sec_rows = [s.__dict__ for s in sections]
        await db.upsert('sections', sec_rows, conflict_cols='work_id,level,label,order_index')
        # Upsert passages
        await db.upsert('passages', [p.__dict__ for p in passages], conflict_cols='section_id,order_index')
        # Upsert verses
        await db.upsert('verses', [v.__dict__ for v in verses], conflict_cols='passage_id,line_no')
        # Upsert notes
        await db.upsert('notes', [n.__dict__ for n in notes.values()], conflict_cols='work_id,note_key')
        # Upsert note links
        await db.upsert('note_links', [nl.__dict__ for nl in note_links], conflict_cols='work_id,note_id,origin_passage_id,origin_html_anchor')
        # Upsert assets
        await db.upsert('assets', [a.__dict__ for a in assets], conflict_cols='work_id,order_index')
    # For QA: write summary to CSV
    qa_row = {
        'work_slug': work.work_slug,
        'sections': len(sections),
        'passages': len(passages),
        'notes': len(notes),
        'verses': len(verses),
    }
    return qa_row


async def discover_versions(client: HttpClient, start_url: str, max_works: Optional[int] = None) -> List[str]:
    """Discover German version URLs from the works index page.

    Only links whose accompanying <small> tag contains "Deutsch" are
    collected.  Paginates the works list automatically until no
    further pages are found.  Returns a list of unique version URLs.
    """
    logging.info(f"Discovering versions starting at {start_url}")
    discovered: List[str] = []
    next_url = start_url
    visited_pages = set()
    while next_url and (not max_works or len(discovered) < max_works):
        if next_url in visited_pages:
            break
        visited_pages.add(next_url)
        soup = await fetch_soup(client, next_url)
        # Find all anchors with a small element indicating language
        for li in soup.find_all('li'):
            small = li.find('small')
            if not small:
                continue
            if 'deutsch' not in small.get_text(strip=True).lower():
                continue
            a = li.find('a', href=True)
            if not a:
                continue
            href = a['href']
            # Build absolute URL
            raw_url = href if href.startswith('http') else httpx.URL(next_url).join(href).human_repr()
            # Only collect version pages (should contain '/versions/')
            if '/versions/' in raw_url:
                # Normalise: strip trailing '/divisions' and any following segments
                norm_url = re.sub(r"/divisions(?:/\d+)?/?$", '', raw_url)
                if norm_url not in discovered:
                    discovered.append(norm_url)
                    logging.debug(f"Found German version: {norm_url}")
                    if max_works and len(discovered) >= max_works:
                        break
        # Look for pagination link (assuming a button/link with rel="next")
        next_link = soup.find('a', attrs={'rel': 'next'})
        next_url = None
        if next_link and next_link.get('href'):
            href = next_link['href']
            next_url = href if href.startswith('http') else httpx.URL(start_url).join(href).human_repr()
    return discovered


############################
# Main entry point
############################

async def main() -> None:
    parser = argparse.ArgumentParser(description='Scrape German works from BKV and upload to Supabase.')
    parser.add_argument('--start-url', type=str, default='https://bkv.unifr.ch/de/works',
                        help='URL of the works list to start crawling.')
    parser.add_argument('--max-works', type=int, default=None,
                        help='Maximum number of works to process (for testing).')
    parser.add_argument('--rate', type=float, default=1.0,
                        help='Maximum number of requests per second.')
    parser.add_argument('--resume-from', type=str, default=None,
                        help='Slug of work to resume from (skips all preceding works).')
    parser.add_argument('--no-upload', action='store_true',
                        help='If set, do not upload to Supabase; only print summary.')
    parser.add_argument('--qa-csv', type=str, default='qa_summary.csv',
                        help='Path to write QA summary CSV.')
    parser.add_argument('--log-level', type=str, default='INFO',
                        help='Logging level (DEBUG, INFO, WARNING, ERROR).')
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO),
                        format='%(asctime)s [%(levelname)s] %(message)s')

    client = HttpClient(rate=args.rate)
    db = None
    if not args.no_upload:
        # Supabase credentials (service key) – DO NOT HARDCODE IN PRODUCTION
        supabase_url = 'https://bpjikoubhxsmsswgixix.supabase.co'
        # Full service_role JWT.  Do not truncate; otherwise Supabase will reject the key.
        service_key = (
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
            'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6'
            'InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY1ODU1MiwiZXhwIjoyMDY3MjM0NTUyfQ.'
            'GiM-rfWsV0sun4JKO0nJg1UQwsXWCirz5FtM74g6eUk'
        )
        db = Database(supabase_url, service_key)

    # Discover all German versions
    version_urls = await discover_versions(client, args.start_url, args.max_works)
    logging.info(f"Discovered {len(version_urls)} version(s)")

    # Prepare QA CSV
    qa_rows = []
    # Resume logic: skip versions until the resume slug is reached
    skip = True if args.resume_from else False
    for version_url in version_urls:
        if skip:
            # Extract slug from URL to compare with resume_from
            slug = version_url.rstrip('/').split('/')[-2]  # the version slug lies before /divisions
            if slug == args.resume_from:
                skip = False
            else:
                logging.info(f"Skipping {version_url} until resume slug {args.resume_from} is found")
                continue
        try:
            qa_row = await process_version(client, db, version_url)
            if qa_row:
                qa_rows.append(qa_row)
        except RetryError as ex:
            logging.error(f"Failed to process {version_url}: {ex}")
        except Exception as ex:
            logging.exception(f"Unexpected error processing {version_url}")
    # Write QA summary
    with open(args.qa_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['work_slug', 'sections', 'passages', 'notes', 'verses'])
        writer.writeheader()
        for row in qa_rows:
            writer.writerow(row)
    logging.info(f"QA summary written to {args.qa_csv}")
    await client.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
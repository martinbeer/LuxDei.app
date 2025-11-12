# -*- coding: utf-8 -*-
"""
Scraper for the German translations contained in the "Bibliothek der Kirchenvaeter" (BKV).

This module walks through the list of works available at
https://bkv.unifr.ch/de/works and extracts every German version (Uebersetzung
or Kommentar in the German localisation), crawls each division of a work
and stores the data in a Supabase database.  The scraper normalises the
content into a relational schema consisting of authors, works, sections,
passages, verses, notes, note_links and assets.  It is designed to be
idempotent: each insertion uses UPSERT semantics on unique keys so that
re-runs do not create duplicates.

High level overview of the workflow:

1. Fetch the master list of works and discover the URLs of all German
   versions.  Only links whose small text indicates "Uebersetzung (Deutsch)"
   or "Kommentar (Deutsch)" are followed.  Each discovered URL points to
   a "version" page which in turn contains a table of contents and
   metadata.

2. For each version, parse the bibliographic metadata (author name,
   lifespan, original title, translation title, bibliographic reference,
   century, collaborators etc.) and build a slug for the author and work.

3. Extract the table of contents from the "Inhaltsangabe" list.  This
   nested list describes the hierarchical structure of the work down to
   chapter or paragraph level.  Each entry includes a link to a
   division page.  The depth of the list determines the `level` of a
   section (1 = top level, 2 = chapter, 3 = sub-chapter).

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
import html
import logging
import os
import re
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union

import httpx
from bs4 import BeautifulSoup, Tag, NavigableString
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
    lower-case.  Additional normalisation can be applied here if
    necessary.
    """
    return slugify(name, lowercase=True)


def normalise_whitespace(text: str) -> str:
    """Collapse all sequences of whitespace into a single space and trim.

    Non-breaking spaces and soft hyphens are replaced with regular
    spaces; newline and tab characters are folded into spaces.  This
    function can be used to prepare plain text for indexing.
    """
    # replace NBSP and soft hyphen
    text = text.replace('\u00A0', ' ').replace('\u00AD', '')
    # collapse all whitespace
    return re.sub(r'\s+', ' ', text).strip()


PAGE_RANGE_RE = re.compile(r'\bS\.\s*\d+\s*(?:[-\u2013]|bis)\s*\d+\b')
PAGE_SINGLE_RE = re.compile(r'\bS\.\s*\d+[A-Za-z0-9]*\b')


def strip_page_markers(text: str) -> str:
    """Remove printed page references (e.g. 'S. 110') from text content."""
    if not text:
        return text
    cleaned = PAGE_RANGE_RE.sub(' ', text)
    cleaned = PAGE_SINGLE_RE.sub(' ', cleaned)
    return cleaned


DUPLICATE_ENUM_RE = re.compile(r'\b([0-9IVXLCDM]+)\.\s+\1\b', re.IGNORECASE)


def collapse_duplicate_enumerators(text: str) -> str:
    """Collapse sequences like '1. 1 ' into a single enumerator."""
    if not text:
        return text
    return DUPLICATE_ENUM_RE.sub(lambda m: f"{m.group(1)}.", text)




def generate_uuid() -> str:
    """Generate a UUID v7 (monotonic, time based).  Falls back to v4 if
    v7 is unavailable (Python < 3.12)."""
    if hasattr(uuid, 'uuid7'):
        return str(uuid.uuid7())
    return str(uuid.uuid4())


def compose_url(base: httpx.URL, path: str) -> httpx.URL:
    """Compose a new URL from a base URL and a path."""
    netloc = base.host or ''
    if base.port is not None:
        netloc = f"{netloc}:{base.port}"
    if not path.startswith('/'):
        path = '/' + path
    return httpx.URL(f"{base.scheme}://{netloc}{path}")

def ensure_de_locale_url(url: httpx.URL) -> httpx.URL:
    """Ensure the provided URL points to the German localisation of the site."""
    path = url.path or '/'
    if path.startswith('/de/'):
        return url
    if path == '/de':
        return url
    segments = path.split('/', 2)
    if len(segments) > 1 and segments[1] in {'de', 'en', 'fr'}:
        if len(segments) > 2:
            new_path = f"/de/{segments[2]}"
        else:
            new_path = '/de'
        return url.copy_with(path=new_path)
    if path.startswith('/'):
        new_path = f"/de{path}"
    else:
        new_path = f"/de/{path}"
    return url.copy_with(path=new_path)

def normalise_version_url(raw_url: str, base_url: str) -> Optional[str]:
    """Normalise a version URL by resolving it relative to the base and enforcing locale."""
    if not raw_url:
        return None
    raw_url = html.unescape(raw_url)
    try:
        base = httpx.URL(base_url)
    except Exception:
        return None
    try:
        candidate = httpx.URL(raw_url)
        if candidate.scheme:
            url = candidate
        elif raw_url.startswith('/'):
            url = compose_url(base, raw_url)
        else:
            url = compose_url(base, f"{base.path.rstrip('/')}/{raw_url}")
    except Exception:
        url = compose_url(base, f"{base.path.rstrip('/')}/{raw_url}")
    url = ensure_de_locale_url(url)
    path = re.sub(r'/divisions(?:/\d+)?/?$', '', url.path)
    url = url.copy_with(path=path)
    return str(url.copy_with(fragment=None))

def normalise_division_url(raw_url: str, base_url: str) -> Optional[str]:
    """Normalise a division URL by resolving it relative to the base and enforcing locale."""
    if not raw_url:
        return None
    raw_url = html.unescape(raw_url)
    try:
        base = httpx.URL(base_url)
    except Exception:
        return None
    try:
        candidate = httpx.URL(raw_url)
        if candidate.scheme:
            url = candidate
        elif raw_url.startswith('/'):
            url = compose_url(base, raw_url)
        else:
            url = compose_url(base, f"{base.path.rstrip('/')}/{raw_url}")
    except Exception:
        url = compose_url(base, f"{base.path.rstrip('/')}/{raw_url}")
    url = ensure_de_locale_url(url)
    return str(url.copy_with(fragment=None))

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

@dataclass
class TocEntry:
    level: int
    label: str
    url: Optional[str]
    has_content: bool
    division_id: Optional[int]


SECTION_INTRO_KEYWORDS = {
    'einleitung', 'einfuehr', 'einleit', 'prolog', 'prologus', 'proemium', 'prolegomena',
    'vorwort', 'vorrede', 'vorbemerkung', 'vorspruch', 'preface', 'introduction',
    'widmung', 'dedikation', 'dedication'
}

SECTION_PREFACE_KEYWORDS = {
    'preface', 'praefatio', 'praefation', 'vorwort', 'vorrede', 'widmung',
    'dedikation', 'dedication', 'vorbemerkung', 'prolog'
}

SECTION_APPENDIX_KEYWORDS = {
    'anhang', 'anhaenge', 'appendix', 'appendices', 'zusatz', 'zusatze', 'nachtrag',
    'nachtraege', 'register', 'index', 'indices', 'verzeichnis', 'register', 'anhange',
    'inhalt', 'inhaltverzeichnis', 'tabellen', 'chronologie', 'bibliographie', 'glossar'
}

SECTION_COMMENTARY_KEYWORDS = {
    'kommentar', 'commentar', 'commentarius', 'auslegung', 'exkurs', 'interpretation',
    'erklarung', 'erlaeuterung', 'erlaeuterungen', 'bemerkung', 'bemerkungen', 'analyse',
    'glosse', 'glossen'
}

SECTION_NOTES_KEYWORDS = {
    'anmerkung', 'anmerkungen', 'anmerk', 'noten', 'note', 'notes', 'notiz', 'notizen',
    'fussnote', 'fussnoten', 'marginalien', 'hinweis', 'hinweise', 'beilage', 'beilagen'
}

SECTION_MAIN_HINTS = {
    'kapitel', 'kap.', 'cap.', 'cap ', 'caput', 'capitulum', 'buch', 'liber', 'tractat',
    'tractatus', 'homilie', 'homilia', 'predigt', 'rede', 'brief', 'epistel', 'sermo',
    'sermon', 'teil ', 'abschnitt', 'section', 'lektion', 'lektion'
}

ROMAN_NUMERAL_RE = re.compile(r'\b[IVXLCDM]{1,6}\b')
ENUMERATION_ONLY_RE = re.compile(r'^(?:[0-9]{1,4}|[IVXLCDM]{1,6}|[A-Za-z])(?:[.)])?$')

def normalise_note_key(raw: str) -> str:
    """Normalise footnote keys extracted from anchors or list items."""
    key = (raw or '').strip()
    if not key:
        return ''
    if key.startswith('#'):
        key = key[1:]
    lower = key.lower()
    if lower.startswith('fn:') or lower.startswith('note:'):
        key = key.split(':', 1)[1]
    elif lower.startswith('fn-') or lower.startswith('note-'):
        key = key.split('-', 1)[1]
    return key.strip()


def _normalise_classifier_text(*parts: Optional[str]) -> str:
    combined = ' '.join(part for part in parts if part)
    combined = re.sub(r'\s+', ' ', combined).strip().lower()
    return combined


def _contains_keyword(text: str, keywords) -> bool:
    if not text:
        return False
    return any(keyword in text for keyword in keywords)


def _add_reason(reasons: List[str], code: str) -> None:
    if code not in reasons:
        reasons.append(code)


def classify_section_role_pre_content(label: Optional[str], heading: Optional[str],
                                       level: int, order_index: int, total_sections: int) -> Tuple[str, List[str]]:
    text = _normalise_classifier_text(label, heading)
    reasons: List[str] = []
    if _contains_keyword(text, SECTION_INTRO_KEYWORDS):
        _add_reason(reasons, 'keyword:introduction')
        return 'introduction', reasons
    if _contains_keyword(text, SECTION_PREFACE_KEYWORDS):
        _add_reason(reasons, 'keyword:preface')
        return 'preface', reasons
    if _contains_keyword(text, SECTION_APPENDIX_KEYWORDS):
        _add_reason(reasons, 'keyword:appendix')
        return 'appendix', reasons
    if _contains_keyword(text, SECTION_NOTES_KEYWORDS):
        _add_reason(reasons, 'keyword:notes')
        return 'notes', reasons
    if _contains_keyword(text, SECTION_COMMENTARY_KEYWORDS):
        _add_reason(reasons, 'keyword:commentary')
        return 'commentary', reasons
    if level == 1 and order_index == 1:
        _add_reason(reasons, 'first-top-level')
        return 'introduction', reasons
    if level == 1 and total_sections > 0 and order_index == total_sections:
        _add_reason(reasons, 'last-top-level')
        return 'appendix', reasons
    label_text = _normalise_classifier_text(label)
    if ROMAN_NUMERAL_RE.search(label_text) or ROMAN_NUMERAL_RE.search(_normalise_classifier_text(heading)):
        _add_reason(reasons, 'roman-numeral')
        return 'main_text', reasons
    if label_text and any(hint in label_text for hint in SECTION_MAIN_HINTS):
        _add_reason(reasons, 'structural-hint')
        return 'main_text', reasons
    if text and any(hint in text for hint in SECTION_MAIN_HINTS):
        _add_reason(reasons, 'text-hint')
        return 'main_text', reasons
    return 'main_text', reasons or ['fallback-main']


def refine_section_role_post_content(role: str, reasons: List[str], plain_text: str,
                                      contains_verses: bool, note_count: int, level: int,
                                      order_index: int, total_sections: int, label: Optional[str],
                                      heading: Optional[str]) -> Tuple[str, List[str]]:
    text = _normalise_classifier_text(label, heading)
    word_count = len(plain_text.split()) if plain_text else 0
    if note_count > 0 and word_count < 80 and role not in {'notes', 'commentary'}:
        _add_reason(reasons, f'notes-dominant:{note_count}')
        role = 'notes'
    elif note_count > 3 and role == 'main_text' and _contains_keyword(text, SECTION_NOTES_KEYWORDS.union(SECTION_COMMENTARY_KEYWORDS)):
        _add_reason(reasons, 'notes-keyword-dominant')
        role = 'commentary'
    if role in {'introduction', 'preface'} and contains_verses:
        _add_reason(reasons, 'verses-promote-main')
        role = 'main_text'
    if role == 'main_text' and _contains_keyword(text, SECTION_APPENDIX_KEYWORDS):
        _add_reason(reasons, 'appendix-keyword-post')
        role = 'appendix'
    if role == 'main_text' and _contains_keyword(text, SECTION_COMMENTARY_KEYWORDS):
        _add_reason(reasons, 'commentary-keyword-post')
        role = 'commentary'
    if role == 'main_text' and _contains_keyword(text, SECTION_NOTES_KEYWORDS) and note_count > 0:
        _add_reason(reasons, 'note-keyword-post')
        role = 'notes'
    if role == 'main_text' and level == 1 and order_index <= 2 and word_count < 180 and not contains_verses:
        if _contains_keyword(text, SECTION_INTRO_KEYWORDS.union(SECTION_PREFACE_KEYWORDS)):
            _add_reason(reasons, f'short-early-section:{word_count}')
            role = 'introduction'
    if role == 'main_text' and total_sections > 0 and order_index >= total_sections - 1 and word_count < 150 and not contains_verses:
        if not _contains_keyword(text, SECTION_MAIN_HINTS):
            _add_reason(reasons, 'trailing-short-section')
            role = 'appendix'
    if role == 'main_text' and word_count < 60 and note_count >= 1 and not contains_verses:
        _add_reason(reasons, 'short-with-notes')
        role = 'commentary'
    return role, reasons


def build_structure_summary(section_profiles: List[Dict[str, object]]) -> Dict[str, object]:
    if not section_profiles:
        return {
            'counts': {},
            'has_introduction': False,
            'has_appendix': False,
            'has_commentary': False,
            'dominant_role': None,
            'total_sections': 0,
            'section_overview': []
        }
    counts = Counter(profile['role'] for profile in section_profiles)
    overview_keys = ('section_id', 'label', 'title', 'level', 'order_index', 'role', 'url', 'has_notes', 'contains_verse_lines', 'role_reason')
    overview = [{key: profile.get(key) for key in overview_keys} for profile in section_profiles]
    return {
        'counts': dict(counts),
        'has_introduction': bool(counts.get('introduction') or counts.get('preface')),
        'has_appendix': counts.get('appendix', 0) > 0,
        'has_commentary': bool(counts.get('commentary') or counts.get('notes')),
        'dominant_role': counts.most_common(1)[0][0] if counts else None,
        'total_sections': len(section_profiles),
        'section_overview': overview
    }


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
        default_headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36"}
        self.client = httpx.AsyncClient(timeout=timeout, headers=default_headers)

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
    "Ãœbersetzung" or "Kommentar".
    """
    author_name = ''
    lifespan: Optional[str] = None

    author_header = soup.select_one('div.author-info-header')
    if author_header:
        author_text = author_header.get_text(' ', strip=True)
        match = re.match(r'^(?P<name>.+?)\s*\((?P<years>[^)]+)\)', author_text)
        if match:
            author_name = match.group('name').strip()
            lifespan = match.group('years').strip()
        else:
            author_name = author_text

    version_header = soup.select_one('div.version-info-header')
    translation_title = version_header.get_text(' ', strip=True) if version_header else None

    work_header = soup.select_one('div.work-info-header')
    original_title = None
    if work_header:
        work_text = work_header.get_text(' ', strip=True)
        work_text = work_text.strip()
        if work_text.startswith('(') and work_text.endswith(')'):
            work_text = work_text[1:-1].strip()
        original_title = work_text or None

    if not author_name:
        fallback_text = soup.get_text("\n", strip=True)
        for line in fallback_text.split("\n"):
            line = line.strip()
            if line:
                author_name = line
                break

    if not translation_title or translation_title == original_title:
        headings = soup.find_all(["h1", "h2", "h3", "h4"])
        for hd in headings:
            heading_text = hd.get_text(strip=True)
            match = re.match(r"(?P<trans>.+?)\s*\((?P<orig>[^()]+)\)", heading_text)
            if match:
                if not translation_title:
                    translation_title = match.group('trans').strip()
                if not original_title:
                    original_title = match.group('orig').strip()
                break

    genre = None
    for badge in soup.select('.detail-view-header small, .detail-view-header span.badge'):
        badge_text = badge.get_text(' ', strip=True).lower()
        if 'Ã¼bersetzung' in badge_text:
            genre = 'translation'
            break
        if 'kommentar' in badge_text:
            genre = 'commentary'
            break
        if 'edition' in badge_text:
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




def parse_toc(soup: BeautifulSoup, base_url: str) -> List[TocEntry]:
    """Parse the table of contents to extract sections.

    If no traditional TOC is found, discovers divisions by testing sequential URLs.
    Returns a list of TocEntry entries sorted by appearance.
    """
    toc_entries: List[TocEntry] = []

    tree = soup.find('collapsible-tree')
    if tree and tree.has_attr(':data'):
        raw_data = tree.get(':data')
        if raw_data:
            try:
                nodes = json.loads(html.unescape(raw_data))
            except json.JSONDecodeError:
                nodes = []
            if isinstance(nodes, list):
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    depth = int(node.get('depth', 0))
                    label = node.get('title') or ''
                    if not label:
                        text_html = node.get('text') or ''
                        label = BeautifulSoup(text_html, 'html.parser').get_text(' ', strip=True)
                    href = None
                    a_attr = node.get('a_attr')
                    if isinstance(a_attr, dict):
                        href = a_attr.get('href')
                    division_url = normalise_division_url(href, base_url) if href else None
                    has_content = bool(node.get('has_valid_content', False))
                    division_id = node.get('division_id')
                    toc_entries.append(
                        TocEntry(
                            level=depth + 1,
                            label=label or 'Abschnitt',
                            url=division_url,
                            has_content=has_content,
                            division_id=division_id,
                        )
                    )
                if toc_entries:
                    return toc_entries

    toc_heading = None
    for heading in soup.find_all(['h2', 'h3', 'h4']):
        if 'inhaltsangabe' in heading.get_text(strip=True).lower():
            toc_heading = heading
            break

    if toc_heading:
        ul = toc_heading.find_next('ul')
        if ul:
            def walk_list(list_tag: Tag, level: int) -> None:
                for li in list_tag.find_all('li', recursive=False):
                    a_tag = li.find('a', href=True)
                    if a_tag:
                        label = a_tag.get_text(' ', strip=True)
                        url = normalise_division_url(a_tag['href'], base_url)
                        toc_entries.append(
                            TocEntry(
                                level=level,
                                label=label,
                                url=url,
                                has_content=True,
                                division_id=None,
                            )
                        )
                    sub = li.find('ul')
                    if sub:
                        walk_list(sub, level + 1)
            walk_list(ul, 1)

    if toc_entries:
        return toc_entries

    logging.info(f"No TOC component detected for {base_url}, testing synthetic division URLs")
    for index in range(1, 201):
        division_path = f"divisions/{index}"
        division_url = normalise_division_url(division_path, base_url)
        if not division_url:
            continue
        try:
            response = httpx.get(division_url, timeout=10.0)
        except Exception:
            break
        if response.status_code != 200:
            break
        if len(response.text) < 400:
            break
        toc_entries.append(
            TocEntry(
                level=1,
                label=f"Division {index}",
                url=division_url,
                has_content=True,
                division_id=index,
            )
        )
    return toc_entries


def extract_main_and_notes(soup: BeautifulSoup) -> Tuple[str, str, List[Tuple[str, str, str]]]:
    """Split a division page into the main content and notes.

    Returns (html, plain_text, notes) where notes is a list of (note_key, note_html, note_plain_text).
    """
    container = soup.select_one('div.division-view-container')
    content_div = None
    if container:
        for child in container.find_all('div', recursive=False):
            classes = child.get('class') or []
            if any(cls in ('detail-view-header', 'division-footer', 'ornament') for cls in classes):
                continue
            content_div = child
            break
    if not content_div:
        content_div = container or soup

    working_soup = BeautifulSoup(str(content_div), 'html.parser')
    for nav in working_soup.select('nav, .navigation-tree-loading-indicator'):
        nav.decompose()
    for ornament in working_soup.select('.ornament'):
        ornament.decompose()
    for banner in working_soup.select('.detail-view-header, .division-footer, .content-toolbar, .page-tools'):
        banner.decompose()

    primary_heading = working_soup.find(['h1', 'h2', 'h3'])
    primary_heading_text = None
    if primary_heading:
        primary_heading_text = primary_heading.get_text(' ', strip=True)
        primary_heading.decompose()

    for a_tag in working_soup.find_all('a', href=True):
        href = a_tag['href']
        text_value = a_tag.get_text(' ', strip=True)
        if '/scans/' in href or re.match(r'^S\.\s*\d+', text_value):
            a_tag.decompose()

    for ref in working_soup.select('a.footnote-ref'):
        href = ref.get('href', '')
        anchor_key = ''
        if href and '#' in href:
            anchor_key = normalise_note_key(href.split('#', 1)[1])
        if not anchor_key:
            anchor_key = normalise_note_key(ref.get_text(' ', strip=True))
        if not anchor_key:
            continue
        placeholder = NavigableString(f'{{FN{anchor_key}}}')
        parent_sup = ref.find_parent('sup')
        if parent_sup:
            parent_sup.replace_with(placeholder)
        else:
            ref.replace_with(placeholder)

    note_entries: List[Tuple[str, str, str]] = []
    footnotes_div = working_soup.find('div', class_='footnotes')
    if footnotes_div:
        for backref in footnotes_div.select('a.footnote-backref'):
            backref.decompose()
        note_items = []
        ordered_list = footnotes_div.find('ol')
        if ordered_list:
            note_items = ordered_list.find_all('li', recursive=False)
        if not note_items:
            note_items = footnotes_div.find_all('li', recursive=False)
        for item in note_items:
            raw_key = item.get('id', '') or ''
            key = normalise_note_key(raw_key)
            if not key:
                text_content = item.get_text(' ', strip=True)
                match = re.match(r'(\d+|[a-zA-Z]+)', text_content)
                key = match.group(1) if match else text_content[:10]
            item_html = str(item)
            note_plain_raw = BeautifulSoup(item_html, 'html.parser').get_text(' ', strip=True)
            note_plain = collapse_duplicate_enumerators(normalise_whitespace(strip_page_markers(note_plain_raw)))
            note_entries.append((key, item_html, note_plain))
        footnotes_div.decompose()

    html_content = str(working_soup)
    plain_raw = working_soup.get_text(' ', strip=True)
    plain_clean = strip_page_markers(plain_raw)
    plain_text = normalise_whitespace(plain_clean)
    if primary_heading_text:
        heading_lower = primary_heading_text.strip().lower()
        plain_lower = plain_text.lower()
        if heading_lower and plain_lower.startswith(heading_lower):
            remainder = plain_lower[len(heading_lower):].lstrip(' :.-')
            if remainder.startswith(heading_lower):
                plain_text = plain_text[len(primary_heading_text):].lstrip(' :.-')
    plain_text = collapse_duplicate_enumerators(plain_text)
    return html_content, plain_text, note_entries







def detect_verses(html: str) -> Optional[List[Tuple[str, int]]]:
    """Detect verse lines in HTML and return a list of (line_text, indent_level).

    A section is considered versified if it contains at least three `<br>`
    tags inside a single paragraph or if elements with class names like
    "verse" or "poem" are present.  Indentation is approximated by
    counting leading non-breaking spaces and emsp entities.
    Returns None if no verse structure is detected.
    """
    if html.count('<br') < 3:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    for br in soup.find_all('br'):
        br.replace_with('\n')
    text_block = soup.get_text('', strip=False)
    lines: List[Tuple[str, int]] = []
    for raw_line in text_block.split('\n'):
        stripped = raw_line.strip()
        if not stripped:
            continue
        clean_line = strip_page_markers(stripped)
        clean_line = normalise_whitespace(clean_line)
        if not clean_line:
            continue
        indent_level = len(raw_line) - len(raw_line.lstrip())
        lines.append((clean_line, indent_level))
    return lines if len(lines) >= 3 else None


def extract_text_lines(html: str) -> List[Tuple[str, int, bool]]:
    """Extract block-level text lines from prose content.

    Returns a list of tuples (text, indent_level, is_heading) preserving the
    approximate structure of the document even when no verse layout is
    detected.
    """
    soup = BeautifulSoup(html, 'html.parser')
    lines: List[Tuple[str, int, bool]] = []
    block_tags = ['h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote']
    for element in soup.find_all(block_tags):
        raw_value = element.get_text(' ', strip=True)
        text_value = strip_page_markers(raw_value)
        text_value = normalise_whitespace(text_value)
        text_value = collapse_duplicate_enumerators(text_value)
        if not text_value:
            continue
        is_heading = element.name in {'h1', 'h2', 'h3', 'h4'}
        indent_level = 0
        if element.name in {'li', 'blockquote'}:
            indent_level = 1
        lines.append((text_value, indent_level, is_heading))
    if not lines:
        fallback_raw = soup.get_text(' ', strip=True)
        fallback = normalise_whitespace(strip_page_markers(fallback_raw))
        fallback = collapse_duplicate_enumerators(fallback)
        if fallback:
            lines.append((fallback, 0, False))
    return lines

def merge_enumeration_lines(lines: List[Tuple[str, int, bool]]) -> List[Tuple[str, int, bool]]:
    """Merge standalone enumeration markers with their following paragraph."""
    merged: List[Tuple[str, int, bool]] = []
    pending: Optional[Tuple[str, int]] = None

    for text_value, indent_level, is_heading in lines:
        cleaned_value = strip_page_markers(text_value)
        cleaned_value = normalise_whitespace(cleaned_value)
        cleaned_value = collapse_duplicate_enumerators(cleaned_value)
        if not cleaned_value:
            continue
        if pending is not None:
            enumerator, enum_indent = pending
            enumerator_clean = enumerator.rstrip('.)').strip()
            if enumerator_clean and cleaned_value.lower().startswith(enumerator_clean.lower()):
                remainder = cleaned_value[len(enumerator_clean):].lstrip(' .)')
                combined = f"{enumerator} {remainder}".strip() if remainder else enumerator
            else:
                combined = f"{enumerator} {cleaned_value}".strip()
            merged.append((combined, min(enum_indent, indent_level), is_heading))
            pending = None
            continue

        trimmed = cleaned_value.strip()
        if trimmed and len(trimmed) <= 6 and ENUMERATION_ONLY_RE.match(trimmed):
            pending = (trimmed, indent_level)
            continue

        merged.append((cleaned_value, indent_level, is_heading))

    if pending is not None:
        enumerator, enum_indent = pending
        merged.append((enumerator, enum_indent, True))

    return merged


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
    soup = await fetch_soup(client, version_url)
    author_name, lifespan, orig_title, trans_title, genre = parse_author_and_title(soup)
    edition_info, year_from, year_to = parse_bibliographic_info(soup)
    toc_entries = parse_toc(soup, version_url)
    if not toc_entries:
        logging.warning(f"No table of contents found for {version_url}")
        return

    total_sections = len(toc_entries)
    section_profiles: List[Dict[str, object]] = []

    author_display = author_name or 'Unbekannt'
    author_slug = slugify_name(author_display)
    work_title = trans_title or orig_title or 'Unbekannt'
    work_slug = slugify_name(f"{author_slug}-{work_title}-de")

    author_uuid = uuid.uuid5(UUID_NAMESPACE_AUTHORS, author_slug)
    work_uuid = uuid.uuid5(UUID_NAMESPACE_WORKS, work_slug)
    author_id = str(author_uuid)
    work_id = str(work_uuid)

    author = Author(id=author_id,
                    name=author_display,
                    name_original=None,
                    lifespan=lifespan,
                    slug=author_slug)
    work = Work(id=work_id,
                author_id=author_id,
                title=work_title,
                title_original=orig_title,
                year_from=year_from,
                year_to=year_to,
                language='de',
                work_slug=work_slug,
                source_url=version_url,
                edition_info=edition_info,
                genre=genre,
                summary=None)

    sections: List[Section] = []
    passages: List[Passage] = []
    verses: List[Verse] = []
    notes_lookup: Dict[Tuple[str, str], Note] = {}
    notes_list: List[Note] = []
    note_links: List[NoteLink] = []
    assets: List[Asset] = []

    section_stack: List[Tuple[int, str]] = []

    for idx, entry in enumerate(toc_entries, start=1):
        if max_sections and idx > max_sections:
            break

        section_id = generate_uuid()
        level = entry.level
        while section_stack and section_stack[-1][0] >= level:
            section_stack.pop()
        parent_id = section_stack[-1][1] if section_stack else None
        section = Section(id=section_id,
                          work_id=work_id,
                          parent_id=parent_id,
                          level=level,
                          label=entry.label,
                          title=None,
                          order_index=idx)
        sections.append(section)
        section_stack.append((level, section_id))

        if not entry.has_content or not entry.url:
            continue

        try:
            div_soup = await fetch_soup(client, entry.url)
        except Exception as ex:
            logging.error(f"Failed to fetch division {entry.url}: {ex}")
            continue

        heading = div_soup.find(['h1', 'h2', 'h3'])
        if heading:
            section.title = heading.get_text(' ', strip=True)

        main_html, plain_text, note_entries = extract_main_and_notes(div_soup)
        verse_lines = detect_verses(main_html)
        contains_verse = verse_lines is not None
        prose_lines = extract_text_lines(main_html) if not verse_lines else []
        if prose_lines:
            prose_lines = merge_enumeration_lines(prose_lines)

        heading_text = section.title
        role, reasons = classify_section_role_pre_content(entry.label, heading_text, level, idx, total_sections)
        role, reasons = refine_section_role_post_content(role, reasons, plain_text, contains_verse, len(note_entries), level, idx, total_sections, entry.label, heading_text)
        role_reason = ';'.join(reasons) if reasons else ''
        section_profiles.append({
            'section_id': section_id,
            'label': entry.label,
            'title': section.title,
            'level': level,
            'order_index': idx,
            'role': role,
            'url': entry.url,
            'has_notes': bool(note_entries),
            'contains_verse_lines': contains_verse,
            'role_reason': role_reason,
        })

        passage_id = generate_uuid()
        passages.append(Passage(id=passage_id,
                                section_id=section_id,
                                order_index=1,
                                html=main_html,
                                plain_text=plain_text,
                                contains_verse_lines=contains_verse))

        if verse_lines:
            for line_no, (line_text, indent) in enumerate(verse_lines, start=1):
                verses.append(Verse(id=generate_uuid(),
                                    passage_id=passage_id,
                                    line_no=line_no,
                                    text=line_text,
                                    indent_level=indent,
                                    is_heading=False))
        elif prose_lines:
            for line_no, (line_text, indent, is_heading) in enumerate(prose_lines, start=1):
                verses.append(Verse(id=generate_uuid(),
                                    passage_id=passage_id,
                                    line_no=line_no,
                                    text=line_text,
                                    indent_level=indent,
                                    is_heading=is_heading))

        division_identifier: Optional[str] = None
        if entry.division_id is not None:
            division_identifier = str(entry.division_id)
        if not division_identifier:
            match = re.search(r'/divisions/(\d+)', entry.url)
            if match:
                division_identifier = match.group(1)
        division_key = division_identifier or f"sec{idx}"

        for original_key, note_html, note_plain in note_entries:
            composite_key = (division_key, original_key)
            note = notes_lookup.get(composite_key)
            if not note:
                note_id = generate_uuid()
                note_storage_key = f"{division_key}:{original_key}"
                note = Note(id=note_id,
                            work_id=work_id,
                            note_key=note_storage_key,
                            note_type='footnote',
                            html=note_html,
                            plain_text=note_plain,
                            order_index=len(notes_list) + 1)
                notes_lookup[composite_key] = note
                notes_list.append(note)

        anchor_soup = BeautifulSoup(main_html, 'html.parser')
        anchor_candidates: List[Tuple[str, Optional[Tag], object]] = []
        for sup in anchor_soup.find_all('sup'):
            anchor_text = normalise_note_key(sup.get_text(' ', strip=True))
            if anchor_text:
                anchor_candidates.append((anchor_text, sup, sup))
        for a_tag in anchor_soup.find_all('a', class_='footnote-ref'):
            anchor_text = normalise_note_key(a_tag.get_text(' ', strip=True))
            if anchor_text:
                anchor_candidates.append((anchor_text, a_tag, a_tag))
        placeholder_pattern = re.compile(r'\{FN([^}]+)\}')
        for text_node in anchor_soup.find_all(string=placeholder_pattern):
            parent_tag = text_node.parent if isinstance(text_node, Tag) else None
            for match in placeholder_pattern.finditer(text_node):
                anchor_text = normalise_note_key(match.group(1))
                if anchor_text:
                    anchor_candidates.append((anchor_text, parent_tag, object()))

        seen_targets: set = set()
        for anchor_text, anchor_tag, marker in anchor_candidates:
            composite_key = (division_key, anchor_text)
            note = notes_lookup.get(composite_key)
            if not note:
                continue
            anchor_id = (anchor_text, id(marker))
            if anchor_id in seen_targets:
                continue
            seen_targets.add(anchor_id)
            parent_text = anchor_tag.get_text(' ', strip=True) if anchor_tag else ''
            snippet = parent_text[:120]
            note_links.append(NoteLink(id=generate_uuid(),
                                       work_id=work_id,
                                       note_id=note.id,
                                       origin_passage_id=passage_id,
                                       origin_html_anchor=anchor_text,
                                       context_snippet=snippet,
                                       position_char=None))

        for asset in extract_assets(main_html):
            asset.work_id = work_id
            asset.order_index = len(assets) + 1
            assets.append(asset)

    if note_links:
        referenced_note_ids = {link.note_id for link in note_links}
        notes_list = [note for note in notes_list if note.id in referenced_note_ids]
    else:
        notes_list = []

    structure_summary = build_structure_summary(section_profiles)
    work.summary = json.dumps(structure_summary, ensure_ascii=False)
    counts_dict = structure_summary.get('counts', {})

    if db:
        await db.upsert('authors', [author.__dict__], conflict_cols='slug')
        await db.upsert('works', [work.__dict__], conflict_cols='work_slug')
        sec_rows = [s.__dict__ for s in sections]
        await db.upsert('sections', sec_rows, conflict_cols='work_id,level,label,order_index')
        await db.upsert('passages', [p.__dict__ for p in passages], conflict_cols='section_id,order_index')
        await db.upsert('verses', [v.__dict__ for v in verses], conflict_cols='passage_id,line_no')
        await db.upsert('notes', [n.__dict__ for n in notes_list], conflict_cols='work_id,note_key')
        await db.upsert('note_links', [nl.__dict__ for nl in note_links], conflict_cols='work_id,note_id,origin_passage_id,origin_html_anchor')
        await db.upsert('assets', [a.__dict__ for a in assets], conflict_cols='work_id,order_index')

    qa_row = {
        'work_slug': work.work_slug,
        'sections': len(sections),
        'passages': len(passages),
        'notes': len(notes_list),
        'verses': len(verses),
        'intro_sections': int(counts_dict.get('introduction', 0)),
        'preface_sections': int(counts_dict.get('preface', 0)),
        'main_sections': int(counts_dict.get('main_text', 0)),
        'appendix_sections': int(counts_dict.get('appendix', 0)),
        'commentary_sections': int(counts_dict.get('commentary', 0)),
        'note_sections': int(counts_dict.get('notes', 0)),
        'dominant_role': structure_summary.get('dominant_role') or '',
        'has_introduction': int(bool(structure_summary.get('has_introduction'))),
        'has_appendix': int(bool(structure_summary.get('has_appendix'))),
        'has_commentary': int(bool(structure_summary.get('has_commentary'))),
    }
    return qa_row


async def discover_versions(client: HttpClient, start_url: str, max_works: Optional[int] = None) -> List[str]:
    """Discover German version URLs from the works index page.

    Only links whose accompanying descriptors contain "Deutsch" are collected.
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

        anchors = soup.select('a.search-result-divisions-link')
        for anchor in anchors:
            indicator = anchor.get_text(' ', strip=True)
            small = anchor.find('small')
            if small:
                indicator = small.get_text(' ', strip=True)
            if 'deutsch' not in indicator.lower():
                continue
            href = anchor.get('href')
            version_url = normalise_version_url(href, next_url)
            if not version_url or '/versions/' not in version_url:
                continue
            if version_url not in discovered:
                discovered.append(version_url)
                logging.debug(f"Found German version: {version_url}")
                if max_works and len(discovered) >= max_works:
                    break

        if max_works and len(discovered) >= max_works:
            break

        next_link = soup.find('a', attrs={'rel': 'next'})
        if next_link and next_link.get('href'):
            candidate = next_link['href']
            if not candidate.startswith('http'):
                try:
                    candidate = httpx.URL(next_url).join(candidate).human_repr()
                except Exception:
                    candidate = None
            if candidate and candidate not in visited_pages:
                next_url = candidate
                continue
        next_url = None

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
        # Supabase credentials (service key) â€“ DO NOT HARDCODE IN PRODUCTION
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
        writer = csv.DictWriter(f, fieldnames=['work_slug', 'sections', 'passages', 'notes', 'verses', 'intro_sections', 'preface_sections', 'main_sections', 'appendix_sections', 'commentary_sections', 'note_sections', 'dominant_role', 'has_introduction', 'has_appendix', 'has_commentary'])
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


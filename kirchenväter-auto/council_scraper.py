"""Scrapes German council documents and stores them in Supabase tables."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import os
import textwrap
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional
from urllib.parse import urljoin, urlparse, parse_qs

import requests
import urllib3
from bs4 import BeautifulSoup, NavigableString, Tag
from slugify import slugify
from tenacity import retry, stop_after_attempt, wait_exponential

LOGGER = logging.getLogger("council_scraper")
DEFAULT_SUPABASE_URL = os.getenv("SUPABASE_URL", "https://bpjikoubhxsmsswgixix.supabase.co")
DEFAULT_SUPABASE_SERVICE_KEY = os.getenv(
    "SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY1ODU1MiwiZXhwIjoyMDY3MjM0NTUyfQ.GiM-rfWsV0sun4JKO0nJg1UQwsXWCirz5FtM74g6eUk",
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

HEADERS = {
    "User-Agent": "LuxDei-Concilium-Scraper/1.0 (+https://www.stjosef.at)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


@dataclass
class CouncilConfig:
    slug: str
    title: str
    ordinal: int
    start_year: Optional[int]
    end_year: Optional[int]
    location: Optional[str]
    convened_by: Optional[str]
    sources: List[Dict[str, str]]
    metadata: Dict[str, str] = field(default_factory=dict)


@dataclass
class CouncilDocument:
    council_slug: str
    doc_slug: str
    title: str
    doc_type: Optional[str]
    promulgation_date: Optional[str]
    source_url: str
    source_license: Optional[str]
    language: str
    content_html: str
    content_text: str
    metadata: Dict[str, str]
    sections: List[Dict[str, str]] = field(default_factory=list)

    def content_hash(self) -> str:
        digest = hashlib.sha256()
        digest.update(self.content_html.encode("utf-8"))
        digest.update(self.content_text.encode("utf-8"))
        digest.update(json.dumps(self.metadata, sort_keys=True).encode("utf-8"))
        return digest.hexdigest()


class SupabaseCouncilClient:
    def __init__(self, url: str, service_key: str, dry_run: bool = False) -> None:
        self.url = url.rstrip("/")
        self.service_key = service_key
        self.dry_run = dry_run
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
            }
        )
        self.schema_ready = False

    def ensure_schema(self) -> None:
        try:
            resp = self.session.get(f"{self.url}/rest/v1/council?select=slug&limit=1")
            if resp.status_code in (200, 206):
                LOGGER.debug("Supabase council tables detected")
                self.schema_ready = True
                return
            LOGGER.warning("Council tables missing (status %s). Attempting to create schema.", resp.status_code)
        except requests.RequestException as exc:
            LOGGER.warning("Failed to probe council table: %s", exc)

        schema_sql = textwrap.dedent(
            """
            create extension if not exists "pgcrypto";

            create table if not exists council (
                slug text primary key,
                title text not null,
                ordinal smallint,
                start_year smallint,
                end_year smallint,
                location text,
                convened_by text,
                metadata jsonb,
                created_at timestamptz default now(),
                updated_at timestamptz default now()
            );

            create table if not exists council_document (
                id uuid primary key default gen_random_uuid(),
                council_slug text not null references council(slug) on delete cascade,
                doc_slug text not null,
                title text not null,
                doc_type text,
                promulgation_date date,
                source_url text not null,
                source_license text,
                language text not null default 'de',
                content_html text not null,
                content_text text not null,
                content_hash text not null,
                metadata jsonb,
                created_at timestamptz default now(),
                updated_at timestamptz default now(),
                unique (council_slug, doc_slug)
            );

            create table if not exists council_document_section (
                id uuid primary key default gen_random_uuid(),
                document_id uuid not null references council_document(id) on delete cascade,
                section_slug text not null,
                heading text,
                order_index int not null,
                content_html text not null,
                content_text text not null,
                unique (document_id, section_slug)
            );

            alter table council enable row level security;
            alter table council_document enable row level security;
            alter table council_document_section enable row level security;

            create policy if not exists council_service_role on council for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
            create policy if not exists council_document_service_role on council_document for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
            create policy if not exists council_document_section_service_role on council_document_section for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
            """
        ).strip()

        db_url = os.getenv("SUPABASE_DB_URL")
        if not db_url:
            self.schema_ready = False
            raise RuntimeError(
                "Supabase council schema is missing. Either set SUPABASE_DB_URL for automatic creation or run docs/SUPABASE_COUNCIL_SCHEMA.sql in the Supabase SQL editor."
            )

        try:
            import psycopg

            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(schema_sql)
                conn.commit()
            LOGGER.info("Supabase council schema ensured via direct connection")
            self.schema_ready = True
        except Exception as exc:  # noqa: BLE001
            self.schema_ready = False
            raise RuntimeError(f"Failed to initialise schema via SUPABASE_DB_URL: {exc}") from exc

    def _assert_schema_ready(self) -> None:
        if not self.dry_run and not self.schema_ready:
            raise RuntimeError("Supabase council schema is not ready. Run docs/SUPABASE_COUNCIL_SCHEMA.sql or provide SUPABASE_DB_URL for automatic setup.")

    def upsert_council(self, config: CouncilConfig) -> None:
        self._assert_schema_ready()
        payload = {
            "slug": config.slug,
            "title": config.title,
            "ordinal": config.ordinal,
            "start_year": config.start_year,
            "end_year": config.end_year,
            "location": config.location,
            "convened_by": config.convened_by,
            "metadata": config.metadata,
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        if self.dry_run:
            LOGGER.info("[dry-run] Would upsert council %s", config.slug)
            return

        resp = self.session.post(
            f"{self.url}/rest/v1/council?on_conflict=slug",
            json=payload,
            headers={"Prefer": "resolution=merge-duplicates"},
            timeout=30,
        )
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Failed to upsert council {config.slug}: {resp.status_code} {resp.text}")
        LOGGER.debug("Council %s upserted", config.slug)

    def get_document_record(self, council_slug: str, doc_slug: str) -> Optional[Dict[str, str]]:
        self._assert_schema_ready()
        resp = self.session.get(
            f"{self.url}/rest/v1/council_document",
            params={
                "council_slug": f"eq.{council_slug}",
                "doc_slug": f"eq.{doc_slug}",
                "select": "id,content_hash",
                "limit": "1",
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to check existing document {doc_slug}: {resp.status_code} {resp.text}")
        rows = resp.json()
        return rows[0] if rows else None

    def upsert_document(self, document: CouncilDocument) -> Optional[str]:
        self._assert_schema_ready()
        payload = {
            "council_slug": document.council_slug,
            "doc_slug": document.doc_slug,
            "title": document.title,
            "doc_type": document.doc_type,
            "promulgation_date": document.promulgation_date,
            "source_url": document.source_url,
            "source_license": document.source_license,
            "language": document.language,
            "content_html": document.content_html,
            "content_text": document.content_text,
            "content_hash": document.content_hash(),
            "metadata": document.metadata,
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }

        if self.dry_run:
            LOGGER.info("[dry-run] Would upsert document %s/%s", document.council_slug, document.doc_slug)
            return None

        existing = self.get_document_record(document.council_slug, document.doc_slug)
        if existing and existing.get("content_hash") == payload["content_hash"]:
            LOGGER.info("Document %s unchanged; skipping upload", document.doc_slug)
            return existing.get("id")

        resp = self.session.post(
            f"{self.url}/rest/v1/council_document?on_conflict=council_slug,doc_slug",
            json=payload,
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            timeout=60,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Failed to upsert document {document.doc_slug}: {resp.status_code} {resp.text}")
        data = resp.json()
        document_id = data[0]["id"] if data else None
        LOGGER.info("Uploaded document %s (%s)", document.doc_slug, document_id)
        return document_id

    def replace_sections(self, document_id: str, sections: List[Dict[str, str]]) -> None:
        self._assert_schema_ready()
        if self.dry_run:
            LOGGER.info("[dry-run] Would replace %s sections for doc %s", len(sections), document_id)
            return

        delete_resp = self.session.delete(
            f"{self.url}/rest/v1/council_document_section",
            params={"document_id": f"eq.{document_id}"},
            headers={"Prefer": "return=minimal"},
            timeout=30,
        )
        if delete_resp.status_code not in (200, 204):
            raise RuntimeError(f"Failed to delete old sections: {delete_resp.status_code} {delete_resp.text}")

        if not sections:
            LOGGER.info("No sections to upload for %s", document_id)
            return

        rows = []
        for section in sections:
            row = {
                "document_id": document_id,
                "section_slug": section["section_slug"],
                "heading": section.get("heading"),
                "order_index": section["order_index"],
                "content_html": section["content_html"],
                "content_text": section["content_text"],
            }
            rows.append(row)

        resp = self.session.post(
            f"{self.url}/rest/v1/council_document_section",
            json=rows,
            headers={"Prefer": "return=minimal"},
            timeout=60,
        )
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Failed to insert sections: {resp.status_code} {resp.text}")
        LOGGER.info("Uploaded %s sections", len(rows))


class BaseSource:
    def fetch_documents(self, council: CouncilConfig, source_config: Dict[str, str]) -> Iterable[CouncilDocument]:
        raise NotImplementedError


class StJosefSource(BaseSource):
    BASE_URL = "https://www.stjosef.at/konzil/konzil.php"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        resp = self.session.request(method, url, timeout=30, **kwargs)
        resp.raise_for_status()
        return resp

    def discover_documents(self, author_id: str) -> List[Dict[str, str]]:
        LOGGER.info("Discovering documents for author id %s on stjosef.at", author_id)
        resp = self._request("POST", self.BASE_URL, data={"author": author_id})
        soup = BeautifulSoup(resp.text, "lxml")
        cards = soup.select("div.content div")
        documents: List[Dict[str, str]] = []
        for card in cards:
            link = card.find("a", href=True)
            if not link:
                continue
            href: str = link["href"]
            url = href if href.lower().startswith(("http://", "https://")) else urljoin(self.BASE_URL, href)
            date_div = card.find("div")
            date_text = date_div.get_text(strip=True) if date_div else None
            full_title = link.get_text(strip=True) or url
            doc_slug = self._derive_doc_slug(url, full_title)
            documents.append(
                {
                    "url": url,
                    "doc_slug": doc_slug,
                    "title": full_title,
                    "date": date_text,
                }
            )
        LOGGER.info("Found %s documents for author id %s", len(documents), author_id)
        return documents

    def _derive_doc_slug(self, href: str, fallback_title: Optional[str] = None) -> str:
        parsed = urlparse(href)
        params = parse_qs(parsed.query)
        doc_param = params.get("doc")
        candidate = doc_param[0] if doc_param else (fallback_title or href)
        return slugify(candidate)

    def _parse_sections(self, content: Tag) -> List[Dict[str, str]]:
        sections: List[Dict[str, str]] = []
        buffer_html: List[str] = []
        buffer_text: List[str] = []
        current_heading: Optional[str] = None
        section_index = 0

        def flush() -> None:
            nonlocal buffer_html, buffer_text, current_heading, section_index
            if not buffer_html and not buffer_text:
                return
            section_slug = slugify(current_heading) if current_heading else f"abschnitt-{section_index:03d}"
            sections.append(
                {
                    "section_slug": section_slug or f"abschnitt-{section_index:03d}",
                    "heading": current_heading,
                    "order_index": section_index,
                    "content_html": "\n".join(buffer_html).strip(),
                    "content_text": "\n".join(buffer_text).strip(),
                }
            )
            buffer_html = []
            buffer_text = []
            current_heading = None

        for child in content.children:
            if isinstance(child, NavigableString):
                text = child.strip()
                if text:
                    buffer_html.append(str(child))
                    buffer_text.append(text)
                continue

            if not isinstance(child, Tag):
                continue
            if child.name in {"script", "style", "nav", "form"}:
                continue
            if child.name in {"h1"}:
                continue
            if child.name in {"h2", "h3", "h4"}:
                flush()
                section_index += 1
                current_heading = child.get_text(strip=True)
                continue
            html_fragment = str(child)
            text_fragment = child.get_text(" ", strip=True)
            if text_fragment:
                buffer_html.append(html_fragment)
                buffer_text.append(text_fragment)

        flush()
        return sections

    def fetch_documents(self, council: CouncilConfig, source_config: Dict[str, str]) -> Iterable[CouncilDocument]:
        author_id = source_config["author_id"]
        documents = self.discover_documents(author_id)
        for doc in documents:
            try:
                document = self._fetch_single_document(council, doc)
                if document:
                    yield document
            except Exception as exc:  # noqa: BLE001
                LOGGER.error("Failed to fetch document %s: %s", doc.get("doc_slug"), exc)

    def _fetch_single_document(self, council: CouncilConfig, doc_info: Dict[str, str]) -> Optional[CouncilDocument]:
        url = doc_info["url"]
        parsed = urlparse(url)
        metadata = {
            "source_site": parsed.netloc or "stjosef.at",
            "raw_list_title": doc_info["title"],
            "discovered_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        if doc_info.get("date"):
            metadata["list_date"] = doc_info["date"]
        promulgation = _parse_german_date(doc_info.get("date")) if doc_info.get("date") else None
        if parsed.netloc.endswith("stjosef.at") or parsed.netloc.endswith("www.stjosef.at"):
            resp = self._request("GET", url)
            soup = BeautifulSoup(resp.text, "lxml")
            content = soup.select_one("div.content") or soup.body
            if not content:
                raise RuntimeError("Unable to locate content div on stjosef page")
            title_node = content.find("h1")
            title = title_node.get_text(strip=True) if title_node else doc_info["title"]
            doc_type = _infer_doc_type(title)
            sections = self._parse_sections(content)
            text_content = content.get_text("\n", strip=True)
            return CouncilDocument(
                council_slug=council.slug,
                doc_slug=doc_info["doc_slug"],
                title=title,
                doc_type=doc_type,
                promulgation_date=promulgation,
                source_url=url,
                source_license="Gemeinschaft vom hl. Josef (stjosef.at) - frei zugaenglich",
                language="de",
                content_html=str(content),
                content_text=text_content,
                metadata=metadata,
                sections=sections,
            )
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60, verify=False)
        except requests.RequestException as exc:
            raise RuntimeError(f"Failed to fetch external document: {exc}") from exc
        content_type = resp.headers.get("Content-Type", "").lower()
        title = doc_info["title"]
        doc_type = _infer_doc_type(title)
        if "pdf" in content_type or url.lower().endswith((".pdf", ".djvu")):
            html_message = f"<p>Dokument als Download verfuegbar: <a href='{url}'>{title}</a></p>"
            text_content = f"PDF-Dokument: {url}"
            metadata["download_only"] = True
            return CouncilDocument(
                council_slug=council.slug,
                doc_slug=doc_info["doc_slug"],
                title=title,
                doc_type=doc_type,
                promulgation_date=promulgation,
                source_url=url,
                source_license=metadata.get("source_site"),
                language="de",
                content_html=html_message,
                content_text=text_content,
                metadata=metadata,
                sections=[],
            )
        soup = BeautifulSoup(resp.text, "lxml")
        body: Optional[Tag] = None
        if parsed.netloc.endswith("kathpedia.com") or parsed.netloc.endswith("kathpedia.de"):
            body = soup.find("div", id="mw-content-text")
            if body:
                body = body.find("div", class_="mw-parser-output") or body
        if not body:
            body = soup.find("article") or soup.body or soup
        for selector in [
            "script",
            "style",
            "nav",
            "form",
            "table.infobox",
            "div.printfooter",
            "div.noprint",
            "span.mw-editsection",
        ]:
            for unwanted in body.select(selector):
                unwanted.decompose()
        content_html = str(body)
        text_content = body.get_text("\n", strip=True)
        sections = self._parse_sections(body)
        return CouncilDocument(
            council_slug=council.slug,
            doc_slug=doc_info["doc_slug"],
            title=title,
            doc_type=doc_type,
            promulgation_date=promulgation,
            source_url=url,
            source_license=metadata.get("source_site"),
            language="de",
            content_html=content_html,
            content_text=text_content,
            metadata=metadata,
            sections=sections,
        )




class BkvSource(BaseSource):
    BASE_URL = "https://bkv.unifr.ch"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def fetch_documents(self, council: CouncilConfig, source_config: Dict[str, str]) -> Iterable[CouncilDocument]:
        documents = source_config.get("documents", [])
        for doc_cfg in documents:
            try:
                document = self._fetch_document(council, doc_cfg)
                if document:
                    yield document
            except Exception as exc:  # noqa: BLE001
                LOGGER.error(
                    "Failed to fetch BKV document %s for %s: %s",
                    doc_cfg.get("doc_slug"),
                    council.slug,
                    exc,
                )

    def _fetch_document(self, council: CouncilConfig, doc_cfg: Dict[str, str]) -> Optional[CouncilDocument]:
        work_slug = doc_cfg["work_slug"]
        version_slug = doc_cfg["version_slug"]
        base_url = f"{self.BASE_URL}/de/works/{work_slug}/versions/{version_slug}"
        export_url = f"{base_url}?do=export_xhtml"
        response = self.session.get(export_url, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")
        main = soup.find("main")
        content = None
        if main:
            content = main.find("div", class_="container mt-4 mb-5")
        if content is None:
            content = main or soup
        for unwanted in content.select(
            ".content-toolbar, .mikio-article-toolbar, .mikio-page-fill, .footnotes-backref, nav, aside"
        ):
            unwanted.decompose()
        content_html = "".join(str(child) for child in content.contents).strip()
        content_text = content.get_text("\n", strip=True)
        sections = self._extract_sections(content)
        metadata = dict(doc_cfg.get("metadata", {}))
        metadata.setdefault("source_site", "bkv.unifr.ch")
        metadata.setdefault("work_slug", work_slug)
        metadata["retrieved_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        doc_slug = doc_cfg.get("doc_slug") or slugify(version_slug)
        doc_type = doc_cfg.get("doc_type")
        promulgation_date = doc_cfg.get("promulgation_date")
        language = doc_cfg.get("language", "de")
        source_license = doc_cfg.get(
            "source_license",
            "Bibliothek der Kirchenväter (Public Domain)",
        )
        return CouncilDocument(
            council_slug=council.slug,
            doc_slug=doc_slug,
            title=doc_cfg["title"],
            doc_type=doc_type,
            promulgation_date=promulgation_date,
            source_url=base_url,
            source_license=source_license,
            language=language,
            content_html=content_html,
            content_text=content_text,
            metadata=metadata,
            sections=sections,
        )

    def _extract_sections(self, content: Tag) -> List[Dict[str, str]]:
        sections: List[Dict[str, str]] = []
        buffer_html: List[str] = []
        buffer_text: List[str] = []
        current_heading: Optional[str] = None
        section_index = 0

        def flush() -> None:
            nonlocal buffer_html, buffer_text, current_heading, section_index
            if not buffer_html and not buffer_text:
                return
            section_slug = slugify(current_heading) if current_heading else f"abschnitt-{section_index:03d}"
            sections.append(
                {
                    "section_slug": section_slug or f"abschnitt-{section_index:03d}",
                    "heading": current_heading,
                    "order_index": section_index,
                    "content_html": "".join(buffer_html).strip(),
                    "content_text": "\n".join(buffer_text).strip(),
                }
            )
            buffer_html = []
            buffer_text = []
            current_heading = None

        for child in content.contents:
            if isinstance(child, NavigableString):
                text = child.strip()
                if text:
                    buffer_html.append(str(child))
                    buffer_text.append(text)
                continue
            if not isinstance(child, Tag):
                continue
            if child.name in {"script", "style", "nav", "aside"}:
                continue
            if child.name in {"h1"}:
                continue
            if child.name in {"h2", "h3"}:
                flush()
                section_index += 1
                current_heading = child.get_text(strip=True)
                continue
            html_fragment = str(child)
            text_fragment = child.get_text(" ", strip=True)
            if text_fragment:
                buffer_html.append(html_fragment)
                buffer_text.append(text_fragment)
        flush()
        return sections


class StaticSource(BaseSource):
    def fetch_documents(self, council: CouncilConfig, source_config: Dict[str, str]) -> Iterable[CouncilDocument]:
        for doc_cfg in source_config.get("documents", []):
            metadata = dict(doc_cfg.get("metadata", {}))
            metadata.setdefault("source_site", "manual")
            metadata["retrieved_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
            content_html = doc_cfg.get("content_html") or doc_cfg.get("content_text", "")
            if doc_cfg.get("content_html") is None and content_html:
                content_html = (
                    "<p>" + content_html.replace("\n\n", "</p><p>").replace("\n", "<br />") + "</p>"
                )
            if doc_cfg.get("content_text"):
                content_text = doc_cfg["content_text"]
            else:
                content_text = BeautifulSoup(content_html, "lxml").get_text("\n", strip=True)
            doc_slug = doc_cfg.get("doc_slug") or slugify(doc_cfg["title"])
            sections = doc_cfg.get("sections") or []
            yield CouncilDocument(
                council_slug=council.slug,
                doc_slug=doc_slug,
                title=doc_cfg["title"],
                doc_type=doc_cfg.get("doc_type"),
                promulgation_date=doc_cfg.get("promulgation_date"),
                source_url=doc_cfg.get("source_url", ""),
                source_license=doc_cfg.get("source_license"),
                language=doc_cfg.get("language", "de"),
                content_html=content_html,
                content_text=content_text,
                metadata=metadata,
                sections=sections,
            )


SOURCE_REGISTRY = {
    "stjosef": StJosefSource,
    "bkv": BkvSource,
    "static": StaticSource,
}

COUNCIL_CATALOG: List[CouncilConfig] = [
    CouncilConfig(
        slug="nicaea-i",
        title="Erstes Konzil von Nicäa",
        ordinal=1,
        start_year=325,
        end_year=325,
        location="Nicäa",
        convened_by="Kaiser Konstantin I.",
        sources=[
            {
                "type": "bkv",
                "documents": [
                    {
                        "doc_slug": "athanasius-ueber-die-beschluesse",
                        "title": "Über die Beschlüsse der Synode von Nizäa",
                        "doc_type": "Kommentar",
                        "work_slug": "cpg-2120",
                        "version_slug": "uber-die-beschlusse-der-synode-von-nizaa-bkv",
                        "language": "de",
                        "source_license": "Bibliothek der Kirchenväter (Public Domain)",
                        "metadata": {
                            "author": "Athanasius von Alexandrien",
                            "reference": "BKV, 2. Auflage, Bd. 1 (1915)",
                        },
                    }
                ],
            },
            {
                "type": "static",
                "documents": [
                    {
                        "doc_slug": "nicenisches-glaubensbekenntnis",
                        "title": "Das nicänische Glaubensbekenntnis",
                        "doc_type": "Glaubensbekenntnis",
                        "language": "de",
                        "source_license": "August Hahn, Bibliothek der Symbole (Leipzig 1897) - Gemeinfrei",
                        "source_url": "https://archive.org/details/bibliothekdersym00hahn",
                        "content_text": "Wir glauben an den einen Gott, den allmächtigen Vater, Schöpfer Himmels und der Erde und alles Sichtbaren und Unsichtbaren.\nUnd an den einen Herrn Jesus Christus, den Sohn Gottes, den Ein-geborenen, aus dem Vater geboren vor allen Zeiten, Licht vom Licht, wahrer Gott vom wahren Gott, gezeugt, nicht geschaffen, eines Wesens mit dem Vater; durch den alles geworden ist.\nEr ist für uns Menschen und zu unserem Heil vom Himmel herabgekommen und hat Fleisch angenommen durch den Heiligen Geist aus Maria der Jungfrau und ist Mensch geworden.\nEr wurde auch für uns unter Pontius Pilatus gekreuzigt, hat gelitten und ist begraben worden. Und ist am dritten Tage auferstanden nach der Schrift und ist aufgefahren in den Himmel; er sitzt zur Rechten des Vaters. Und wird wiederkommen in Herrlichkeit, zu richten die Lebenden und die Toten; seines Reiches wird kein Ende sein.\nUnd an den Heiligen Geist, den Herrn und Lebensspender, der vom Vater ausgeht, der mit dem Vater und dem Sohn zugleich angebetet und verherrlicht wird, der gesprochen hat durch die Propheten.\nUnd an die eine, heilige, katholische und apostolische Kirche.\nWir bekennen die eine Taufe zur Vergebung der Sünden.\nWir erwarten die Auferstehung der Toten und das Leben der kommenden Welt. Amen.",
                        "metadata": {
                            "reference": "August Hahn (Hg.), Bibliothek der Symbole und Glaubensregeln der alten Kirche, 3. Auflage Leipzig 1897",
                        },
                    }
                ],
            },
        ],
        metadata={"notes": "Zusammenstellung öffentlicher-domain-Texte für Nicäa I (325)."},
    ),
    CouncilConfig(
        slug="vaticanum-ii",
        title="Zweites Vatikanisches Konzil",
        ordinal=21,
        start_year=1962,
        end_year=1965,
        location="Vatikanstadt",
        convened_by="Johannes XXIII. / Paul VI.",
        sources=[{"type": "stjosef", "author_id": "35"}],
        metadata={"notes": "Datenquelle stjosef.at; enthaelt vollstaendige deutsche Uebersetzungen."},
    ),
    CouncilConfig(
        slug="vaticanum-i",
        title="Erstes Vatikanisches Konzil",
        ordinal=20,
        start_year=1869,
        end_year=1870,
        location="Vatikanstadt",
        convened_by="Pius IX.",
        sources=[{"type": "stjosef", "author_id": "36"}],
        metadata={"notes": "Dokumentlink verweist auf Kathpedia; Scraper-Unterstuetzung folgt."},
    ),
]


def _infer_doc_type(title: str) -> Optional[str]:
    lowered = title.lower()
    if "konstitution" in lowered:
        return "Konstitution"
    if "dekret" in lowered:
        return "Dekret"
    if "erklaerung" in lowered or "erklaerung" in lowered:
        return "Erklaerung"
    if "botschaft" in lowered:
        return "Botschaft"
    return None


GERMAN_MONTHS = {
    "januar": 1,
    "februar": 2,
    "maerz": 3,
    "maerz": 3,
    "april": 4,
    "mai": 5,
    "juni": 6,
    "juli": 7,
    "august": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "dezember": 12,
}


def _parse_german_date(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    cleaned = raw.strip().strip("()").replace("\xa0", " ")
    parts = cleaned.replace(".", "").split()
    if len(parts) < 3:
        return None
    try:
        day = int(parts[0])
        month = GERMAN_MONTHS.get(parts[1].lower())
        year = int(parts[2])
        if not month:
            return None
        return dt.date(year, month, day).isoformat()
    except ValueError:
        return None


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape German council documents and upload to Supabase.")
    parser.add_argument(
        "--supabase-url",
        default=DEFAULT_SUPABASE_URL,
        help="Supabase project URL (defaults to env SUPABASE_URL)",
    )
    parser.add_argument(
        "--supabase-key",
        default=DEFAULT_SUPABASE_SERVICE_KEY,
        help="Supabase service role key (defaults to env SUPABASE_SERVICE_KEY)",
    )
    parser.add_argument(
        "--council",
        action="append",
        help="Slug(s) of councils to scrape (default: all configured)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Process without uploading to Supabase")
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip automatic schema check / creation",
    )
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = build_arg_parser()
    args = parser.parse_args()

    supabase_client = SupabaseCouncilClient(args.supabase_url, args.supabase_key, dry_run=args.dry_run)
    if args.dry_run:
        LOGGER.info("Dry-run mode: skipping Supabase schema check")
    elif args.skip_schema:
        supabase_client.schema_ready = True
    else:
        try:
            supabase_client.ensure_schema()
        except RuntimeError as exc:  # noqa: BLE001
            LOGGER.error(str(exc))
            return

    selected_slugs = set(args.council) if args.council else None
    source_instances = {key: cls() for key, cls in SOURCE_REGISTRY.items()}

    for council in COUNCIL_CATALOG:
        if selected_slugs and council.slug not in selected_slugs:
            continue
        LOGGER.info("Processing council %s", council.slug)
        try:
            supabase_client.upsert_council(council)
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("Failed to upsert council %s: %s", council.slug, exc)
            continue

        for source_cfg in council.sources:
            source_type = source_cfg.get("type")
            source = source_instances.get(source_type)
            if not source:
                LOGGER.warning("Source type %s not implemented for council %s", source_type, council.slug)
                continue
            try:
                for document in source.fetch_documents(council, source_cfg):
                    document_id = supabase_client.upsert_document(document)
                    if document_id and document.sections:
                        supabase_client.replace_sections(document_id, document.sections)
            except Exception as exc:  # noqa: BLE001
                LOGGER.error("Upload failed for %s via %s: %s", council.slug, source_type, exc)


if __name__ == "__main__":
    main()

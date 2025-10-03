from pathlib import Path
import re
import textwrap

path = Path('kirchenväter-auto/corrected_bkv_scraper.py')
text = path.read_text(encoding='utf-8')

if 'NavigableString' not in text:
    text = text.replace('from bs4 import BeautifulSoup', 'from bs4 import BeautifulSoup, NavigableString')

if 'import unicodedata' not in text:
    text = text.replace('import re\n', 'import re\nimport unicodedata\n')

if 'from collections import Counter' not in text:
    text = text.replace('import time\n', 'import time\nfrom collections import Counter\n')

constants_block = textwrap.dedent('''
SECTION_KEYWORDS = {
    'intro': [
        'einleitung',
        'vorwort',
        'vorrede',
        'widmung',
        'prolog',
        'brief des herausgebers',
        'lebensbeschreibung',
        'biographie',
        'inhalt',
        'leben'
    ],
    'appendix': [
        'anhang',
        'anhaenge',
        'nachtrag',
        'erganzung',
        'appendix'
    ],
    'notes': [
        'anmerkung',
        'anmerkungen',
        'notiz',
        'notizen',
        'hinweis',
        'erklarung',
        'kommentar',
        'bemerkung'
    ]
}

HEADING_TAGS = ('h1', 'h2', 'h3', 'h4')
PARAGRAPH_TAGS = ('p', 'blockquote', 'pre')
LIST_TAGS = ('ul', 'ol')
TABLE_TAGS = ('table',)
FOOTNOTE_CLASS_HINTS = ('footnote', 'fussnote', 'notes')
WRAPPER_SKIP_CLASSES = (
    'detail-view-header',
    'division-footer',
    'ornament',
    'breadcrumb',
    'breadcrumbs',
    'sidebar',
    'content-navigation',
    'related-links',
    'edition-information',
    'meta',
    'metadata',
    'division-meta'
)
INTRO_PARAGRAPH_PREFIXES = (
    'einleitung',
    'vorwort',
    'vorrede',
    'widmung',
    'prolog',
    'brief des herausgebers'
)


def normalize_for_match(text):
    if not text:
        return ''
    normalized = unicodedata.normalize('NFKD', text)
    ascii_text = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return ascii_text.lower()
''')

if 'SECTION_KEYWORDS' not in text:
    marker = 'from urllib.parse import urljoin, urlparse\n\n'
    if marker in text:
        text = text.replace(marker, marker + constants_block + '\n')
    else:
        text = constants_block + '\n' + text

new_block = textwrap.dedent('''
def _compute_depth(self, element, root):
    depth = 0
    current = element
    while current and current is not root:
        current = getattr(current, 'parent', None)
        depth += 1
    return depth


def _locate_text_block(self, soup):
    main_element = soup.find('main')
    if not main_element:
        return None, None

    error_container = main_element.find(class_=lambda value: value and 'error-message' in ' '.join(value).lower())
    if error_container:
        return None, None

    for tag in main_element.find_all(['nav', 'header', 'footer']):
        tag.decompose()

    best_candidate = None
    best_score = -1.0

    for candidate in main_element.find_all(['div', 'section', 'article'], recursive=True):
        if not getattr(candidate, 'name', None):
            continue

        class_tokens = normalize_for_match(' '.join(candidate.get('class') or []))
        if any(skip in class_tokens for skip in WRAPPER_SKIP_CLASSES):
            continue
        if 'footnote' in class_tokens:
            continue

        parent_classes = ''
        if getattr(candidate, 'parent', None):
            parent_classes = normalize_for_match(' '.join(candidate.parent.get('class') or []))
        if 'footnote' in parent_classes:
            continue

        paragraphs = [p for p in candidate.find_all('p', recursive=False) if p.get_text(strip=True)]
        paragraph_count = len(paragraphs)
        heading_count = len(candidate.find_all(list(HEADING_TAGS), recursive=False))
        text_length = len(candidate.get_text(' ', strip=True))

        if paragraph_count == 0 and heading_count == 0 and text_length < 200:
            continue

        depth = self._compute_depth(candidate, main_element)
        score = (paragraph_count * 6) + (heading_count * 3) + (text_length / 400.0) - (depth * 0.5)

        if score > best_score:
            best_candidate = candidate
            best_score = score

    if not best_candidate:
        best_candidate = main_element

    return main_element, best_candidate


def _new_section(self, section_type, title):
    return {
        'title': title,
        'type': section_type,
        'paragraphs': [],
        'html': []
    }


def _classify_heading(self, heading_text):
    normalized = normalize_for_match(heading_text)
    for keyword in SECTION_KEYWORDS['intro']:
        if keyword in normalized:
            return 'intro'
    for keyword in SECTION_KEYWORDS['appendix']:
        if keyword in normalized:
            return 'appendix'
    for keyword in SECTION_KEYWORDS['notes']:
        if keyword in normalized:
            return 'notes'
    return 'main'


def _looks_like_intro(self, paragraph_text):
    normalized = normalize_for_match(paragraph_text)
    snippet = normalized[:80]
    return any(snippet.startswith(prefix) for prefix in INTRO_PARAGRAPH_PREFIXES)


def _block_kind(self, element):
    if not getattr(element, 'name', None):
        return 'skip'
    name = element.name.lower()
    class_tokens = normalize_for_match(' '.join(element.get('class') or []))
    element_id = normalize_for_match(element.get('id', ''))

    if any(hint in class_tokens for hint in FOOTNOTE_CLASS_HINTS) or 'footnote' in element_id or name == 'aside':
        return 'footnotes'
    if name in HEADING_TAGS:
        return 'heading'
    if name in PARAGRAPH_TAGS:
        return 'paragraph'
    if name in LIST_TAGS:
        if 'footnote' in class_tokens:
            return 'footnotes'
        return 'list'
    if name in TABLE_TAGS:
        return 'table'
    if name == 'hr':
        return 'skip'
    if name in {'div', 'section', 'article'}:
        if any(skip in class_tokens for skip in WRAPPER_SKIP_CLASSES):
            return 'skip'
        return 'container'
    return 'container'


def _extract_blocks(self, node):
    blocks = []
    for child in node.find_all(recursive=False):
        if isinstance(child, NavigableString):
            continue
        kind = self._block_kind(child)
        if kind == 'skip':
            continue
        if kind == 'container':
            inner_blocks = self._extract_blocks(child)
            if inner_blocks:
                blocks.extend(inner_blocks)
            else:
                blocks.append(('paragraph', child))
        else:
            blocks.append((kind, child))
    return blocks


def _finalize_section(self, section, order):
    if not section:
        return None
    text = '\n\n'.join(section['paragraphs']).strip()
    if not text and not section['title']:
        return None
    return {
        'order': order,
        'type': section['type'],
        'title': section['title'],
        'text': text,
        'paragraph_count': len(section['paragraphs']),
        'html_blocks': list(section['html'])
    }


def _extract_footnote_number(self, element, fallback_index):
    explicit = element.get('data-footnote-number')
    if explicit:
        return explicit.strip()
    element_id = element.get('id')
    if element_id:
        candidate = element_id.split(':')[-1].strip()
        if candidate:
            return candidate
    label = element.find(attrs={'class': re.compile('footnote-number', re.I)})
    if label and label.get_text(strip=True):
        return label.get_text(strip=True)
    anchor = element.find('a', attrs={'href': re.compile('#fnref', re.I)})
    if anchor and anchor.get_text(strip=True):
        return anchor.get_text(strip=True)
    return str(fallback_index)


def _extract_footnote_entries(self, footnote_root):
    entries = []
    if footnote_root.name in ('ol', 'ul'):
        containers = [footnote_root]
    else:
        containers = footnote_root.find_all(['ol', 'ul'], recursive=False) or [footnote_root]
    index = 1
    seen_items = set()
    for container in containers:
        items = container.find_all('li', recursive=False)
        if not items:
            items = container.find_all('p', recursive=False)
        for item in items:
            if id(item) in seen_items:
                continue
            seen_items.add(id(item))
            text = item.get_text('\\n', strip=True)
            if not text:
                continue
            number = self._extract_footnote_number(item, index)
            entries.append({
                'number': number,
                'text': text,
                'html': str(item)
            })
            index += 1
    return entries


def _split_division_sections(self, content_root):
    blocks = self._extract_blocks(content_root)
    sections = []
    footnotes = []
    current = self._new_section('intro', None)
    heading_encountered = False
    order = 1

    for kind, element in blocks:
        if kind == 'heading':
            finalized = self._finalize_section(current, order)
            if finalized:
                sections.append(finalized)
                order += 1
            heading_text = element.get_text(' ', strip=True)
            current = self._new_section(self._classify_heading(heading_text), heading_text)
            heading_encountered = True
        elif kind in ('paragraph', 'list', 'table'):
            text = element.get_text('\\n', strip=True)
            if not text:
                continue
            if current is None:
                current = self._new_section('main' if heading_encountered else 'intro', None)
            if not heading_encountered and self._looks_like_intro(text):
                current['type'] = 'intro'
            current['paragraphs'].append(text)
            current['html'].append(str(element))
        elif kind == 'footnotes':
            finalized = self._finalize_section(current, order)
            if finalized:
                sections.append(finalized)
                order += 1
            current = None
            footnotes.extend(self._extract_footnote_entries(element))

    finalized = self._finalize_section(current, order)
    if finalized:
        sections.append(finalized)

    if sections and not heading_encountered:
        for section in sections:
            if section['type'] == 'intro':
                section['type'] = 'main'

    section_counts = Counter(section['type'] for section in sections)
    return sections, footnotes, section_counts


def _process_division(self, division_url, division_number):
    """Extrahiert Text, strukturiert die Abschnitte und erkennt Fussnoten"""
    try:
        response = self.session.get(division_url)
        soup = BeautifulSoup(response.content, 'html.parser')

        main_element, text_block = self._locate_text_block(soup)
        if not main_element or not text_block:
            return None

        sections, footnotes, section_counts = self._split_division_sections(text_block)
        if not sections and not footnotes:
            return None

        main_text_parts = [
            section['text'] for section in sections
            if section['type'] in ('main', 'appendix', 'notes') and section['text']
        ]
        intro_text_parts = [
            section['text'] for section in sections
            if section['type'] == 'intro' and section['text']
        ]
        appendix_text_parts = [
            section['text'] for section in sections
            if section['type'] == 'appendix' and section['text']
        ]

        main_text = '\\n\\n'.join(main_text_parts).strip()
        intro_text = '\\n\\n'.join(intro_text_parts).strip()
        appendix_text = '\\n\\n'.join(appendix_text_parts).strip()
        primary_text = main_text or intro_text

        if not primary_text and not footnotes:
            return None

        paragraph_count = sum(section['paragraph_count'] for section in sections)
        structure_summary = {key: section_counts[key] for key in section_counts}

        structure_log = ', '.join(f"{structure_summary[key]}x {key}" for key in structure_summary) if structure_summary else 'keine Abschnitte'
        self.log(f"    Struktur: {structure_log}")
        self.log(f"    Extrahiert: {len(primary_text)} Zeichen, {len(footnotes)} Fussnoten")

        division_data = {
            'division_number': division_number,
            'url': division_url,
            'main_text': primary_text,
            'introduction_text': intro_text,
            'appendix_text': appendix_text,
            'sections': sections,
            'main_html': str(text_block),
            'footnotes': footnotes,
            'footnote_count': len(footnotes),
            'char_count': len(primary_text),
            'paragraph_count': paragraph_count,
            'structure_summary': structure_summary
        }

        return division_data

    except Exception as e:
        self.log(f"Fehler bei Division {division_url}: {e}")
        return None
''')

new_block = textwrap.indent(new_block, '    ')
pattern = re.compile(r"\n    def _process_division\(self, division_url, division_number\):\r?\n(?:    .*\r?\n)+?(?=    def _supabase_request)", re.DOTALL)
if not pattern.search(text):
    raise RuntimeError('Could not locate existing _process_division method')
text = pattern.sub('\n' + new_block + '\n    def _supabase_request', text)

path.write_text(text, encoding='utf-8')

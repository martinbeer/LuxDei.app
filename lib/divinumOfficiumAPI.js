/**
 * DivinumOfficium.com API Integration
 * 
 * This fetches and parses the traditional Latin/English Divine Office
 * from DivinumOfficium.com, which provides the complete Liturgy of Hours
 * according to various historical rubrics.
 */

const DIVINUM_BASE_URL = 'https://www.divinumofficium.com/cgi-bin/horas/officium.pl';

// Map our canonical hour names to DivinumOfficium's format
const HOUR_MAPPING = {
  'matins': 'Matutinum',
  'lauds': 'Laudes', 
  'prime': 'Prima',
  'terce': 'Tertia',
  'sext': 'Sexta', 
  'none': 'Nona',
  'vespers': 'Vesperae',
  'compline': 'Completorium'
};

// Reverse mapping for display
const DISPLAY_MAPPING = {
  'Matutinum': 'Vigil (Matins)',
  'Laudes': 'Lauds', 
  'Prima': 'Prime',
  'Tertia': 'Terce',
  'Sexta': 'Sext', 
  'Nona': 'None',
  'Vesperae': 'Vespers',
  'Completorium': 'Compline'
};

class DivinumOfficiumAPI {
  constructor() {
    this.baseUrl = DIVINUM_BASE_URL;
  }

  /**
   * Fetch the Divine Office for a specific hour
   * @param {string} hour - The canonical hour name (lauds, vespers, etc.)
   * @param {string} language - 'Latin' or 'English' 
   * @param {string} date - Date in DD-MM-YYYY format (optional, defaults to today)
   * @returns {Promise<Object>} Parsed office content
   */
  async fetchHour(hour, language = 'English', date = null) {
    const divinumHour = HOUR_MAPPING[hour.toLowerCase()];
    if (!divinumHour) {
      throw new Error(`Unknown hour: ${hour}`);
    }

    const today = new Date();
    const formattedDate = date || `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    const formData = {
      command: `pray${divinumHour}`,
      date1: formattedDate,
      version: 'Rubrics 1960 - 1960', // Use 1960 rubrics as default
      lang2: language
    };

    try {
      const html = await this._makeRequest(formData);
      const parsedContent = this._parseOfficeContent(html, divinumHour, language);
      
      return {
        hour: divinumHour,
        displayName: DISPLAY_MAPPING[divinumHour],
        language: language,
        date: formattedDate,
        content: parsedContent,
        source: 'DivinumOfficium.com'
      };
    } catch (error) {
      throw new Error(`Failed to fetch ${hour}: ${error.message}`);
    }
  }

  /**
   * Get available hours for today
   * @returns {Array} Array of available hour objects
   */
  async getAvailableHours() {
    // DivinumOfficium provides all canonical hours
    return Object.keys(HOUR_MAPPING).map(canonicalHour => ({
      id: canonicalHour,
      name: DISPLAY_MAPPING[HOUR_MAPPING[canonicalHour]],
      divinumName: HOUR_MAPPING[canonicalHour],
      available: true
    }));
  }

  /**
   * Make HTTP request to DivinumOfficium
   * @private
   */
  async _makeRequest(formData) {
    // Convert formData object to URL-encoded string
    const params = new URLSearchParams();
    Object.keys(formData).forEach(key => {
      params.append(key, formData[key]);
    });
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'LuxDei-App/1.0'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * Parse the HTML response to extract office content
   * @private
   */
  _parseOfficeContent(html, hour, language) {
    const content = {
      title: '',
      opening: [],
      psalms: [],
      canticle: null,
      readings: [],
      prayers: [],
      closing: []
    };

    // Find the main office section using the hour-specific ID
    const hourId = `${hour}top`;
    const hourSectionRegex = new RegExp(`<H2[^>]*ID=['"]${hourId}['"][^>]*>(.*?)</H2>`, 'i');
    const hourMatch = html.match(hourSectionRegex);
    
    if (hourMatch) {
      content.title = this._cleanText(hourMatch[1]);
    }

    // Extract content between the hour heading and the next major section
    const contentStart = html.indexOf(`ID='${hourId}'`);
    if (contentStart === -1) return content;

    // Find content until next major heading or end of relevant section
    const contentEnd = html.indexOf('<H2', contentStart + 100) !== -1 
      ? html.indexOf('<H2', contentStart + 100)
      : html.length;
    
    const officeHtml = html.substring(contentStart, contentEnd);

    // Extract structured content
    content.opening = this._extractOpening(officeHtml);
    content.psalms = this._extractPsalmsWithText(officeHtml, language);
    content.canticle = this._extractCanticle(officeHtml, language);
    content.readings = this._extractReadings(officeHtml, language);
    content.prayers = this._extractPrayersComplete(officeHtml, language);
    content.closing = this._extractClosing(officeHtml);

    return content;
  }

  /**
   * Extract opening prayers and versicles
   * @private
   */
  _extractOpening(html) {
    const opening = [];
    
    // Always add standard opening (it's part of every hour)
    opening.push({
      type: 'versicle',
      latin: '℣. Deus ✠ in adiutórium meum inténde.',
      response: '℟. Dómine, ad adiuvándum me festína.',
      english: '℣. O God, ✠ come to my assistance. / ℟. O Lord, make haste to help me.'
    });

    // Add Gloria Patri
    opening.push({
      type: 'doxology',
      latin: 'Glória Patri, et Fílio, * et Spirítui Sancto.\nSicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      english: 'Glory be to the Father, and to the Son, * and to the Holy Spirit.\nAs it was in the beginning, is now, and ever shall be, * world without end. Amen.'
    });

    // Look for Alleluia or seasonal antiphon
    const alleluiaMatch = html.match(/Alleluia/i);
    if (alleluiaMatch) {
      opening.push({
        type: 'seasonal',
        latin: 'Alleluia.',
        english: 'Alleluia.'
      });
    }

    return opening;
  }

  /**
   * Extract psalms with full text and antiphons
   * @private
   */
  _extractPsalmsWithText(html, language) {
    const psalms = [];
    
    // Look for psalm sections
    const psalmPattern = /<FONT[^>]*><I>Psalmus (\d+)<\/I><\/FONT>/g;
    let match;

    while ((match = psalmPattern.exec(html)) !== null) {
      const psalmNum = match[1];
      const psalmStart = match.index;
      
      // Find antiphon before psalm
      const beforePsalm = html.substring(Math.max(0, psalmStart - 300), psalmStart);
      const antiphonMatch = beforePsalm.match(/<I>Ant\.<\/I><\/FONT>\s*([^<]+)/);
      
      // Find psalm text after the psalm header
      const afterPsalm = html.substring(psalmStart, psalmStart + 2000);
      const psalmText = this._extractPsalmVerses(afterPsalm);
      
      psalms.push({
        number: psalmNum,
        title: `Psalm ${psalmNum}`,
        antiphon: {
          latin: antiphonMatch ? this._cleanText(antiphonMatch[1]) : '',
          english: '' // We'll need to find English version
        },
        verses: psalmText,
        hasFullText: psalmText.length > 0
      });
    }

    return psalms;
  }

  /**
   * Extract psalm verses from HTML
   * @private
   */
  _extractPsalmVerses(html) {
    const verses = [];
    
    // Look for verse numbers and text
    const versePattern = /(\d+):(\d+)\s*([^<\n]+)/g;
    let match;

    while ((match = versePattern.exec(html)) !== null) {
      verses.push({
        chapter: match[1],
        verse: match[2],
        text: this._cleanText(match[3])
      });
    }

    return verses;
  }

  /**
   * Extract canticle (like Magnificat, Benedictus)
   * @private
   */
  _extractCanticle(html, language) {
    // Look for Magnificat or Benedictus
    const magnificatMatch = html.match(/Magnificat/i);
    const benedictusMatch = html.match(/Benedictus/i);
    
    if (magnificatMatch) {
      return {
        type: 'magnificat',
        title: 'Magnificat',
        text: 'Magnificat ánima mea Dóminum...',
        antiphon: ''
      };
    }
    
    if (benedictusMatch) {
      return {
        type: 'benedictus', 
        title: 'Benedictus',
        text: 'Benedíctus Dóminus Deus Israël...',
        antiphon: ''
      };
    }
    
    return null;
  }

  /**
   * Extract readings (lectiones)
   * @private
   */
  _extractReadings(html, language) {
    const readings = [];
    
    // Look for lectio patterns
    const lectioPattern = /<FONT[^>]*><I>Lectio/gi;
    // This is simplified - full implementation would need more complex parsing
    
    return readings;
  }

  /**
   * Extract complete prayers with proper formatting
   * @private
   */
  _extractPrayersComplete(html, language) {
    const prayers = [];
    
    // Look for Oratio
    const prayerPattern = /<FONT[^>]*><I>Oratio<\/I><\/FONT>[\s\S]*?<br\/>/g;
    let match;

    while ((match = prayerPattern.exec(html)) !== null) {
      const prayerHtml = match[0];
      const text = this._extractTextFromHtml(prayerHtml);
      
      if (text && text.length > 20) {
        prayers.push({
          type: 'collect',
          latin: this._cleanText(text),
          english: '', // Would need translation
          title: 'Oratio'
        });
      }
    }

    return prayers;
  }

  /**
   * Extract closing prayers
   * @private
   */
  _extractClosing(html) {
    const closing = [];
    
    // Add standard closing
    closing.push({
      type: 'dismissal',
      latin: 'Dóminus vobíscum. / Et cum spíritu tuo.',
      english: 'The Lord be with you. / And with thy spirit.'
    });

    return closing;
  }

  /**
   * Extract psalm information
   * @private
   */
  _extractPsalms(html, language) {
    const psalms = [];
    const psalmRegex = /<FONT[^>]*><I>Psalmus (\d+)<\/I><\/FONT>/g;
    let match;

    while ((match = psalmRegex.exec(html)) !== null) {
      const psalmNum = match[1];
      const startPos = match.index;
      
      // Find the associated antiphon and text
      const beforePsalm = html.substring(Math.max(0, startPos - 200), startPos);
      const antiphonMatch = beforePsalm.match(/<I>Ant\.<\/I><\/FONT>\s*([^<]+)/);
      
      psalms.push({
        number: psalmNum,
        antiphon: antiphonMatch ? this._cleanText(antiphonMatch[1]) : '',
        title: `Psalm ${psalmNum}`,
        hasText: true
      });
    }

    return psalms;
  }

  /**
   * Extract antiphon texts
   * @private
   */
  _extractAntiphons(html, language) {
    const antiphons = [];
    const antiphonRegex = /<FONT[^>]*><I>Ant\.<\/I><\/FONT>\s*([^<]+)/g;
    let match;

    while ((match = antiphonRegex.exec(html)) !== null) {
      const text = this._cleanText(match[1]);
      if (text && text.length > 5) {
        antiphons.push({
          text: text,
          language: this._detectLanguage(text)
        });
      }
    }

    return antiphons;
  }

  /**
   * Extract prayer texts (Oratio, etc.)
   * @private
   */
  _extractPrayers(html, language) {
    const prayers = [];
    const prayerRegex = /<FONT[^>]*><I>(Oratio|Prayer)<\/I><\/FONT>[\s\S]*?<br\/>/g;
    let match;

    while ((match = prayerRegex.exec(html)) !== null) {
      const fullMatch = match[0];
      const text = this._extractTextFromHtml(fullMatch);
      
      if (text && text.length > 10) {
        prayers.push({
          type: match[1],
          text: this._cleanText(text),
          language: this._detectLanguage(text)
        });
      }
    }

    return prayers;
  }

  /**
   * Extract general sections (readings, versicles, etc.)
   * @private
   */
  _extractSections(html, language) {
    const sections = [];
    
    // Look for versicles and responses
    const versicleRegex = /℣\.\s*([^℟\n]+)\s*℟\.\s*([^℣\n]+)/g;
    let match;

    while ((match = versicleRegex.exec(html)) !== null) {
      sections.push({
        type: 'versicle',
        versicle: this._cleanText(match[1]),
        response: this._cleanText(match[2]),
        language: this._detectLanguage(match[1])
      });
    }

    return sections;
  }

  /**
   * Clean and normalize text content
   * @private
   */
  _cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract text content from HTML
   * @private
   */
  _extractTextFromHtml(html) {
    return html
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /**
   * Detect if text is Latin or vernacular
   * @private
   */
  _detectLanguage(text) {
    const latinIndicators = ['Deus', 'Dominus', 'Gloria', 'Alleluia', 'Amen', 'Patri'];
    const latinWords = latinIndicators.filter(word => text.includes(word));
    return latinWords.length > 0 ? 'Latin' : 'English';
  }
}

// Export for React Native usage
export { DivinumOfficiumAPI, HOUR_MAPPING, DISPLAY_MAPPING };

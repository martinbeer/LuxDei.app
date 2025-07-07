import { supabase } from '../lib/supabase';

class SupabaseImageManager {
  constructor() {
    this.images = [];
    this.isLoaded = false;
    this.stats = {
      total: 0,
      loaded: 0,
      errors: 0
    };
  }

  async loadAllImages() {
    // Wenn bereits geladen, gib die gecachten Bilder zurück
    if (this.isLoaded && this.images.length > 0) {
      console.log('📚 Bilder bereits geladen, verwende Cache');
      return this.images;
    }

    try {
      console.log('🔍 Lade Bilder aus Supabase Storage...');
      
      // Da bucket listing nicht funktioniert (RLS policy issue), verwende bekannte Dateinamen
      const knownImages = [
        'Ikone_Athanasius_von_Alexandria.jpg',
        'Basil_of_Caesarea.jpg',
        '500px-Clemens_I.jpg',
        'Cyprian_von_Karthago2.jpg',
        'augustinus-alexandria.jpg',
        'Cyril_of_Alexandria.jpg',
        'ephraem-der-syrer3778906.jpg',
        'Eusebius_von_Caesarea.jpg',
        '250px-Fulgentius_von_Ruspe_17Jh.jpg',
        '300px-Hl._Hilarius_von_Poitiers.png',
        '300px-Hl._Martin_von_Tours.jpg',
        'hiernoymus.jpg',
        'hippolyt.jpg',
        'ignatius_von_antiochien.jpg',
        'johannes chysostomus.jpg',
        'justin.jpg',
        'maximus.jpg',
        'origenes.jpg',
        'heilige-palladius-van-helenopolis-62b05f-200.jpg',
        'paulinus von nola.jpg',
        'rufinus.jpg',
        'tertullian_3.jpg',
        'Theodoret_von_Kyrrhos.jpg'
      ];

      console.log(`📁 Versuche ${knownImages.length} bekannte Bilder zu laden`);

      // Generiere URLs für alle bekannten Bilder
      const imagePromises = knownImages.map(async (filename, index) => {
        try {
          // Generiere öffentliche URL direkt für den Dateinamen
          const { data } = supabase.storage
            .from('bilder')
            .getPublicUrl(filename);

          if (data?.publicUrl) {
            const name = this.extractNameFromFilename(filename);
            const description = this.generateDescription(name);
            
            this.stats.loaded++;
            
            console.log(`✅ Bild geladen: ${name} -> ${data.publicUrl}`);
            
            return {
              id: index + 1,
              name: name,
              url: data.publicUrl,
              filename: filename,
              description: description,
              isSupabaseImage: true
            };
          } else {
            this.stats.errors++;
            console.warn(`⚠️ Keine URL für Datei: ${filename}`);
            return null;
          }
        } catch (error) {
          this.stats.errors++;
          console.error(`❌ Fehler bei Datei ${filename}:`, error);
          return null;
        }
      });

      // Warte auf alle Promises und filtere null-Werte
      const results = await Promise.all(imagePromises);
      this.images = results.filter(img => img !== null);
      
      this.stats.total = knownImages.length;
      this.isLoaded = true;

      console.log(`✅ ${this.images.length} Bilder erfolgreich geladen`);
      console.log('📊 Stats:', this.stats);

      return this.images;

    } catch (error) {
      console.error('❌ Allgemeiner Fehler beim Laden der Bilder:', error);
      this.stats.errors++;
      return [];
    }
  }

  // Hilfsfunktion: Prüfe ob Datei ein Bild ist
  isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const lowerFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowerFilename.endsWith(ext));
  }

  // Hilfsfunktion: Extrahiere Namen aus Dateiname
  extractNameFromFilename(filename) {
    // Entferne Dateiendung
    let name = filename.replace(/\.[^/.]+$/, '');
    
    // Behandle spezielle Formate
    name = name
      .replace(/^Ikone_/, '') // Entferne "Ikone_" Präfix
      .replace(/^Hl\._/, '') // Entferne "Hl._" Präfix
      .replace(/^\d+px-/, '') // Entferne Pixelangaben wie "300px-"
      .replace(/_/g, ' ') // Ersetze Unterstriche mit Leerzeichen
      .replace(/-\w+-\d+$/, '') // Entferne Endungen wie "-62b05f-200"
      .replace(/\d+$/, '') // Entferne Zahlen am Ende
      .trim();

    // Spezielle Korrekturen für bekannte Namen
    const nameCorrections = {
      'Athanasius von Alexandria': 'Athanasius von Alexandria',
      'Basil of Caesarea': 'Basilius von Cäsarea',
      'Clemens I': 'Clemens von Rom',
      'Cyprian von Karthago': 'Cyprian von Karthago',
      'augustinus-alexandria': 'Augustinus von Hippo',
      'Cyril of Alexandria': 'Cyrill von Alexandria',
      'ephraem-der-syrer': 'Ephraem der Syrer',
      'Eusebius von Caesarea': 'Eusebius von Caesarea',
      'Fulgentius von Ruspe Jh': 'Fulgentius von Ruspe',
      'Hilarius von Poitiers': 'Hilarius von Poitiers',
      'Martin von Tours': 'Martin von Tours',
      'hiernoymus': 'Hieronymus',
      'hippolyt': 'Hippolyt von Rom',
      'ignatius von antiochien': 'Ignatius von Antiochien',
      'johannes chysostomus': 'Johannes Chrysostomus',
      'justin': 'Justin der Märtyrer',
      'maximus': 'Maximus Confessor',
      'origenes': 'Origenes',
      'heilige-palladius-van-helenopolis': 'Palladius von Helenopolis',
      'paulinus von nola': 'Paulinus von Nola',
      'rufinus': 'Rufinus von Aquileia',
      'tertullian': 'Tertullian',
      'Theodoret von Kyrrhos': 'Theodoret von Cyrus'
    };

    // Fallback: Kapitalisiere jeden Wortanfang wenn kein Mapping gefunden
    const correctedName = nameCorrections[name];
    if (correctedName) {
      return correctedName;
    }
    
    // Automatische Kapitalisierung falls nicht in der Map
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Hilfsfunktion: Generiere Beschreibung basierend auf Name
  generateDescription(name) {
    const descriptions = {
      'Athanasius von Alexandria': 'Verteidiger der Orthodoxie',
      'Basilius von Cäsarea': 'Großer Kappadozier',
      'Clemens von Rom': 'Früher Bischof von Rom',
      'Cyprian von Karthago': 'Märtyrer und Kirchenvater',
      'Augustinus von Hippo': 'Kirchenvater und Theologe',
      'Cyrill von Alexandria': 'Theologe und Kirchenlehrer',
      'Ephraem der Syrer': 'Syrischer Kirchenvater',
      'Eusebius von Caesarea': 'Kirchenhistoriker',
      'Fulgentius von Ruspe': 'Nordafrikanischer Theologe',
      'Hilarius von Poitiers': 'Athanasius des Westens',
      'Martin von Tours': 'Heiliger und Bischof',
      'Hieronymus': 'Bibelübersetzer',
      'Hippolyt von Rom': 'Früher Kirchenvater',
      'Ignatius von Antiochien': 'Apostolischer Vater',
      'Johannes Chrysostomus': 'Goldmund-Prediger',
      'Justin der Märtyrer': 'Frühchristlicher Apologet',
      'Gregor von Nazianz': 'Der Theologe',
      'Gregor von Nyssa': 'Mystischer Theologe',
      'Irenäus von Lyon': 'Kämpfer gegen Häresien',
      'Johannes von Damaskus': 'Letzter Kirchenvater',
      'Leo der Große': 'Großer Papst',
      'Maximus Confessor': 'Byzantinischer Theologe',
      'Origenes': 'Alexandrinischer Gelehrter',
      'Palladius': 'Mönchshistoriker',
      'Paulinus von Nola': 'Dichter und Bischof',
      'Pelagius': 'Umstrittener Theologe',
      'Rufinus von Aquileia': 'Übersetzer und Historiker',
      'Tertullian': 'Lateinischer Kirchenvater',
      'Theodoret von Cyrus': 'Exeget und Historiker'
    };

    return descriptions[name] || 'Kirchenvater';
  }

  // Hole Statistiken über geladene Bilder
  getStats() {
    return {
      ...this.stats,
      success: this.stats.loaded > 0,
      successRate: this.stats.total > 0 ? (this.stats.loaded / this.stats.total * 100).toFixed(1) : 0
    };
  }

  // Hole ein spezifisches Bild nach Name
  getImageByName(name) {
    return this.images.find(img => img.name === name);
  }

  // Prüfe ob Bilder geladen sind
  isImagesLoaded() {
    return this.isLoaded && this.images.length > 0;
  }

  // Resetze den Manager (für Tests oder Neuladen)
  reset() {
    this.images = [];
    this.isLoaded = false;
    this.stats = {
      total: 0,
      loaded: 0,
      errors: 0
    };
  }
}

// Exportiere eine Singleton-Instanz
const supabaseImageManager = new SupabaseImageManager();
export default supabaseImageManager;

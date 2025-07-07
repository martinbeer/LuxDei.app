/**
 * Supabase Storage Setup und Bild-Upload Script
 * 
 * Dieser Code zeigt, wie Sie Ihre lokalen Bilder zu Supabase Storage hochladen können.
 * 
 * SETUP-SCHRITTE:
 * 
 * 1. Supabase Dashboard öffnen (https://supabase.com)
 * 2. Ihr Projekt auswählen
 * 3. Storage -> Buckets
 * 4. Neuen Bucket erstellen: "kirchenvaeter-images"
 * 5. Bucket-Einstellungen:
 *    - Public: true (damit Bilder öffentlich zugänglich sind)
 *    - File size limit: 10MB
 *    - Allowed MIME types: image/*
 * 
 * 6. RLS (Row Level Security) Policies:
 *    - Policy für SELECT: Alle können lesen
 *    - Policy für INSERT: Nur authentifizierte Benutzer (optional)
 * 
 * UPLOAD-PROZESS:
 * 
 * Option 1: Manuell über Supabase Dashboard
 * - Gehen Sie zu Storage -> kirchenvaeter-images
 * - Drag & Drop alle Bilder aus dem assets/ Ordner
 * 
 * Option 2: Programmatisch (siehe Code unten)
 * 
 */

import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system';

// Mapping der lokalen Dateien zu Upload-Namen
const imageFiles = [
  { local: '../assets/Ikone_Athanasius_von_Alexandria.jpg', upload: 'Ikone_Athanasius_von_Alexandria.jpg' },
  { local: '../assets/Basil_of_Caesarea.jpg', upload: 'Basil_of_Caesarea.jpg' },
  { local: '../assets/500px-Clemens_I.jpg', upload: '500px-Clemens_I.jpg' },
  { local: '../assets/Cyprian_von_Karthago2.jpg', upload: 'Cyprian_von_Karthago2.jpg' },
  { local: '../assets/augustinus-alexandria.jpg', upload: 'augustinus-alexandria.jpg' },
  { local: '../assets/Cyril_of_Alexandria.jpg', upload: 'Cyril_of_Alexandria.jpg' },
  { local: '../assets/ephraem-der-syrer3778906.jpg', upload: 'ephraem-der-syrer3778906.jpg' },
  { local: '../assets/Eusebius_von_Caesarea.jpg', upload: 'Eusebius_von_Caesarea.jpg' },
  { local: '../assets/250px-Fulgentius_von_Ruspe_17Jh.jpg', upload: '250px-Fulgentius_von_Ruspe_17Jh.jpg' },
  { local: '../assets/300px-Hl._Hilarius_von_Poitiers.png', upload: '300px-Hl._Hilarius_von_Poitiers.png' },
  { local: '../assets/300px-Hl._Martin_von_Tours.jpg', upload: '300px-Hl._Martin_von_Tours.jpg' },
  { local: '../assets/hiernoymus.jpg', upload: 'hiernoymus.jpg' },
  { local: '../assets/hippolyt.jpg', upload: 'hippolyt.jpg' },
  { local: '../assets/ignatius_von_antiochien.jpg', upload: 'ignatius_von_antiochien.jpg' },
  { local: '../assets/johannes chysostomus.jpg', upload: 'johannes chysostomus.jpg' },
  { local: '../assets/justin.jpg', upload: 'justin.jpg' },
  { local: '../assets/maximus.jpg', upload: 'maximus.jpg' },
  { local: '../assets/origenes.jpg', upload: 'origenes.jpg' },
  { local: '../assets/heilige-palladius-van-helenopolis-62b05f-200.jpg', upload: 'heilige-palladius-van-helenopolis-62b05f-200.jpg' },
  { local: '../assets/paulinus von nola.jpg', upload: 'paulinus von nola.jpg' },
  { local: '../assets/rufinus.jpg', upload: 'rufinus.jpg' },
  { local: '../assets/tertullian_3.jpg', upload: 'tertullian_3.jpg' },
  { local: '../assets/Theodoret_von_Kyrrhos.jpg', upload: 'Theodoret_von_Kyrrhos.jpg' },
];

/**
 * WICHTIG: Dieser Code funktioniert NUR auf dem Web/Node.js
 * Für React Native müssen die Bilder manuell hochgeladen werden!
 */

// Funktion zum Upload der Bilder (nur für Web/Node.js)
const uploadImagesToSupabase = async () => {
  console.log('📤 Starte Upload der Kirchenväter-Bilder...');
  
  for (const file of imageFiles) {
    try {
      console.log(`📁 Uploade ${file.upload}...`);
      
      // Lese Datei (nur auf Node.js/Web möglich)
      // const fileData = await FileSystem.readAsStringAsync(file.local, {
      //   encoding: FileSystem.EncodingType.Base64
      // });
      
      // Upload zu Supabase
      // const { data, error } = await supabase.storage
      //   .from('kirchenvaeter-images')
      //   .upload(file.upload, decode(fileData), {
      //     contentType: file.upload.endsWith('.png') ? 'image/png' : 'image/jpeg',
      //     cacheControl: '3600',
      //     upsert: true
      //   });
      
      // if (error) {
      //   console.error(`❌ Fehler bei ${file.upload}:`, error);
      // } else {
      //   console.log(`✅ ${file.upload} erfolgreich hochgeladen`);
      // }
      
    } catch (error) {
      console.error(`❌ Fehler bei ${file.upload}:`, error);
    }
  }
};

/**
 * EMPFOHLENER UPLOAD-PROZESS:
 * 
 * 1. Gehen Sie zu https://supabase.com/dashboard
 * 2. Öffnen Sie Ihr Projekt
 * 3. Storage -> kirchenvaeter-images Bucket
 * 4. Ziehen Sie alle Bilder aus c:\Coding\LuxDei\assets\ in den Browser
 * 5. Warten Sie bis alle Uploads abgeschlossen sind
 * 
 * BUCKET POLICIES (SQL):
 * 
 * -- Alle können Bilder lesen
 * CREATE POLICY "Public Access" ON storage.objects
 * FOR SELECT USING (bucket_id = 'kirchenvaeter-images');
 * 
 * -- Authentifizierte Benutzer können uploaden (optional)
 * CREATE POLICY "Authenticated Upload" ON storage.objects
 * FOR INSERT WITH CHECK (bucket_id = 'kirchenvaeter-images' AND auth.role() = 'authenticated');
 * 
 * BUCKET EINSTELLUNGEN:
 * - Public: ✅ An
 * - File size limit: 10 MB
 * - Allowed MIME types: image/jpeg, image/png, image/jpg
 */

export { uploadImagesToSupabase, imageFiles };

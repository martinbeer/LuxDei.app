import { Image } from 'react-native';

// Alle Kirchenväter-Bilder zum Preloading
const kirchenväterImages = [
  require('../assets/Ikone_Athanasius_von_Alexandria.jpg'),
  require('../assets/Basil_of_Caesarea.jpg'),
  require('../assets/500px-Clemens_I.jpg'),
  require('../assets/Cyprian_von_Karthago2.jpg'),
  require('../assets/augustinus-alexandria.jpg'),
  require('../assets/Cyril_of_Alexandria.jpg'),
  require('../assets/ephraem-der-syrer3778906.jpg'),
  require('../assets/Eusebius_von_Caesarea.jpg'),
  require('../assets/250px-Fulgentius_von_Ruspe_17Jh.jpg'),
  require('../assets/300px-Hl._Hilarius_von_Poitiers.png'),
  require('../assets/300px-Hl._Martin_von_Tours.jpg'),
  require('../assets/hiernoymus.jpg'),
  require('../assets/hippolyt.jpg'),
  require('../assets/ignatius_von_antiochien.jpg'),
  require('../assets/johannes chysostomus.jpg'),
  require('../assets/justin.jpg'),
  require('../assets/maximus.jpg'),
  require('../assets/origenes.jpg'),
  require('../assets/heilige-palladius-van-helenopolis-62b05f-200.jpg'),
  require('../assets/paulinus von nola.jpg'),
  require('../assets/rufinus.jpg'),
  require('../assets/tertullian_3.jpg'),
  require('../assets/Theodoret_von_Kyrrhos.jpg'),
];

// Funktion zum Preloading aller Bilder
export const preloadKirchenväterImages = async () => {
  try {
    console.log('🖼️ Beginne Preloading der Kirchenväter-Bilder...');
    
    const preloadPromises = kirchenväterImages.map((imageSource) => {
      return new Promise((resolve, reject) => {
        Image.prefetch(Image.resolveAssetSource(imageSource).uri)
          .then(() => {
            resolve();
          })
          .catch((error) => {
            console.warn('Fehler beim Laden eines Bildes:', error);
            resolve(); // Resolve trotzdem, um nicht das gesamte Preloading zu blockieren
          });
      });
    });

    await Promise.all(preloadPromises);
    console.log('✅ Alle Kirchenväter-Bilder erfolgreich vorgeladen!');
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Preloading der Bilder:', error);
    return false;
  }
};

// Alternative Methode für React Native Image.prefetch - einfacher und schneller
export const preloadImagesWithCache = () => {
  console.log('🚀 Starte vereinfachtes Image-Caching...');
  
  // Lade nur die ersten 10 Bilder vor, um den App-Start nicht zu blockieren
  const priorityImages = kirchenväterImages.slice(0, 10);
  
  priorityImages.forEach((imageSource, index) => {
    try {
      const uri = Image.resolveAssetSource(imageSource).uri;
      Image.prefetch(uri)
        .then(() => {
          console.log(`✅ Bild ${index + 1}/10 gecacht`);
        })
        .catch((error) => {
          console.warn(`⚠️ Fehler beim Cachen von Bild ${index + 1}:`, error);
        });
    } catch (error) {
      console.warn(`⚠️ Fehler beim Verarbeiten von Bild ${index + 1}:`, error);
    }
  });
  
  // Lade die restlichen Bilder im Hintergrund
  setTimeout(() => {
    const remainingImages = kirchenväterImages.slice(10);
    remainingImages.forEach((imageSource, index) => {
      try {
        const uri = Image.resolveAssetSource(imageSource).uri;
        Image.prefetch(uri).catch(() => {}); // Ignoriere Fehler
      } catch (error) {
        // Ignoriere Fehler
      }
    });
  }, 2000); // Warte 2 Sekunden
};

export default { preloadKirchenväterImages, preloadImagesWithCache };

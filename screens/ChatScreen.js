import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getOpenAIKey, OPENAI_BASE_URL } from '../config/openai';
import { getDatabaseBookName } from '../utils/bookMapping';
import { findBibleRefs } from '../utils/bibleRef';

const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;
const normalize = (size) => Math.round(size * scale);

const ChatScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: 'Pax Christi! Ich bin LuxAI, Ihr katholischer Assistent. Womit darf ich dienen?',
      isBot: true,
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);
  const flatListRef = useRef(null);
  const realInputRef = useRef(null);

  const sendMessageToOpenAI = async (userMessage) => {
    const apiKey = getOpenAIKey();
    
    if (!apiKey) {
      Alert.alert('Fehler', 'OpenAI API Key nicht gefunden. Bitte konfigurieren Sie die App.');
      return null;
    }

    try {
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'Du bist LuxAI, der traditionell-katholische Assistent der App LuxDei. Antworte ausschließlich aus römisch-katholischer Perspektive, im Einklang mit der überlieferten Lehre und Praxis (Heilige Schrift, Kirchenväter, ökumenische Konzilien, Catechismus der Katholischen Kirche, tridentinische Lehre, klassische Moraltheologie, überlieferte Liturgie). Bevorzuge die überlieferte Theologie und Liturgie (vorkonziliar), lies die Dokumente des II. Vatikanischen Konzils in Hermeneutik der Kontinuität mit dem vorhergehenden Lehramt. Keine religiöse Relativierung oder synkretistische Formulierungen; erkläre andere Positionen respektvoll, ohne die katholische Wahrheit zu relativieren. Vermeide heterodoxe Aussagen und spekulative Neuerungen. In JEDER Antwort: (1) führe 2–5 konkrete Bibelstellen mit genauer Stellenangabe im deutschen Zitierstil an (z. B. Joh 3,16; Mt 5,3–12; Röm 8,28); (2) füge 1–3 kurze Stimmen der Kirchenväter hinzu (Name und Werk oder ungefähre Fundstelle); (3) wo passend, ergänze KKK-Nummern und ggf. Denzinger-Hinweise (DH) mit "vgl." wenn unsicher. Erfinde keine exakten Zitate/Fundstellen – bei Unsicherheit formuliere allgemein. Biete bei seelsorglichen Anfragen kurze Gebetsvorschläge oder Segensworte an (optional auch kurz auf Latein mit deutscher Übersetzung). Lehne Handlungsanleitungen ab, die objektiv dem katholischen Glauben oder der Moral widersprechen, und weise respektvoll auf die Beichte/Seelsorge hin.'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        throw new Error(`API Fehler: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';
      
    } catch (error) {
      console.error('Fehler beim Senden an OpenAI:', error);
      return 'Entschuldigung, es gab ein Problem beim Verarbeiten Ihrer Anfrage. Bitte versuchen Sie es später erneut.';
    }
  };

  const sendMessage = async (messageToSend) => {
    // Wenn messageToSend übergeben wurde, nutze das; sonst nutze inputText
    const textToSend = messageToSend ? messageToSend.text : inputText.trim();
    
    if (!textToSend || isLoading) return;

    const userMessage = {
      id: messageToSend?.id || (Date.now().toString() + '_user'),
      text: textToSend,
      isBot: false,
      timestamp: messageToSend?.timestamp || new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!messageToSend) {
      setInputText('');
    }
    setIsLoading(true);

    // Bot-Antwort von OpenAI holen
    const botResponse = await sendMessageToOpenAI(userMessage.text);
    
    if (botResponse) {
      const botMessage = {
        id: Date.now().toString() + '_bot',
        text: botResponse,
        isBot: true,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, botMessage]);
    }
    
    setIsLoading(false);
  };

  // Split text by various German/ASCII quote delimiters and mark quoted segments
  const splitByQuotes = (str) => {
    if (!str) return [];
    const patterns = [
      /„([^“]+)“/g, // German low-high quotes
      /«([^»]+)»/g, // French quotes
      /»([^«]+)«/g, // Reversed french quotes
      /“([^”]+)”/g, // Curly double quotes
      /‚([^’]+)’/g, // Single curly quotes
      /"([^\"]+)"/g, // ASCII double quotes
      /'([^']+)'/g, // ASCII single quotes
    ];
    // We'll iteratively find the earliest next match among all patterns
    const segments = [];
    let cursor = 0;
    while (cursor < str.length) {
      let nearest = null;
      let nearestPattern = null;
      for (const p of patterns) {
        p.lastIndex = cursor;
        const m = p.exec(str);
        if (m && (nearest === null || m.index < nearest.index)) {
          nearest = m;
          nearestPattern = p;
        }
      }
      if (!nearest) {
        segments.push({ text: str.slice(cursor), isQuote: false });
        break;
      }
      // push pre-text
      if (nearest.index > cursor) {
        segments.push({ text: str.slice(cursor, nearest.index), isQuote: false });
      }
      // push quoted content (group 1)
      segments.push({ text: nearest[1], isQuote: true });
      cursor = nearest.index + nearest[0].length;
    }
    return segments;
  };

  const renderTextWithQuotes = (text, baseColor) => {
    const segs = splitByQuotes(text);
    if (!segs.length) return <Text style={[styles.messageText, { color: baseColor }]}>{text}</Text>;
    return (
      <Text>
        {segs.map((s, i) => (
          <Text
            key={`q-${i}`}
            style={s.isQuote ? [styles.messageText, styles.quoteText, { color: baseColor }] : [styles.messageText, { color: baseColor }]}
          >
            {s.text}
          </Text>
        ))}
      </Text>
    );
  };

  const renderWithClickableRefs = (text, isBot) => {
    const refs = isBot ? findBibleRefs(text) : [];
    if (!refs.length) return renderTextWithQuotes(text, isBot ? colors.text : colors.white);

    const parts = [];
    let lastIndex = 0;
    refs.forEach((r, idx) => {
      if (r.index > lastIndex) {
        parts.push(
          <Text key={`t-${idx}-pre`}>
            {renderTextWithQuotes(text.slice(lastIndex, r.index), isBot ? colors.text : colors.white)}
          </Text>
        );
      }
      const onPress = () => {
        const dbName = getDatabaseBookName(r.displayName, 'bibelverse') || r.displayName;
        navigation.navigate('Schriften', {
          screen: 'BibelContent',
          params: {
            bookName: dbName,
            displayName: r.displayName,
            initialChapter: r.chapter,
            highlightVerse: r.startVerse,
            translationTable: 'bibelverse',
          },
        });
      };
      parts.push(
        <Text key={`t-${idx}-ref`} style={[styles.messageText, styles.bibleRef, { color: isBot ? colors.primary : colors.white, borderBottomColor: isBot ? colors.primary : colors.white }]} onPress={onPress}>
          {r.label}
        </Text>
      );
      lastIndex = r.index + r.length;
    });
    if (lastIndex < text.length) {
      parts.push(
        <Text key={`t-tail`}>
          {renderTextWithQuotes(text.slice(lastIndex), isBot ? colors.text : colors.white)}
        </Text>
      );
    }
    return <Text>{parts}</Text>;
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageContainer,
      item.isBot ? styles.botMessage : styles.userMessage
    ]}>
      <View style={[
        styles.messageBubble,
        { backgroundColor: item.isBot ? colors.cardBackground : colors.primary }
      ]}>
        {renderWithClickableRefs(item.text, item.isBot)}
        <Text style={[
          styles.timestamp,
          { color: item.isBot ? colors.textSecondary : colors.white }
        ]}>
          {new Date(item.timestamp).toLocaleTimeString('de-DE', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
      </View>
    </View>
  );

  // Handle initial message from Bible screen
  useEffect(() => {
    if (route.params?.initialMessage) {
      const initialMessage = route.params.initialMessage;
      const autoSend = route.params?.autoSend;
      
      console.log('[ChatScreen] Initial message from Bible screen:', initialMessage);
      console.log('[ChatScreen] AutoSend:', autoSend);
      
      // Wenn autoSend=true, sende direkt ohne inputText zu setzen
      if (autoSend) {
        // Warte kurz damit die UI bereit ist, dann sende automatisch
        setTimeout(() => {
          console.log('[ChatScreen] Auto-sending message:', initialMessage);
          // Sende die Nachricht direkt
          sendMessage({ 
            id: Date.now().toString() + '_auto',
            text: initialMessage,
            isBot: false,
            timestamp: new Date().toISOString()
          });
          // Inputtext bleibt leer
          setInputText('');
        }, 100);
      } else {
        // Nur wenn nicht autoSend: setze Text und fokussiere
        setInputText(initialMessage);
        setTimeout(() => {
          if (realInputRef.current) {
            realInputRef.current.focus();
          }
        }, 300);
      }
    }
  }, [route.params?.initialMessage, route.params?.autoSend]);

  useEffect(() => {
    // Scroll nach unten bei neuen Nachrichten
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with rounded background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>
              LuxAI
            </Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      {/* Chat Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Antwort wird generiert...
          </Text>
        </View>
      )}

      {/* Fake Input - Always visible at bottom */}
      {!isInputFocused && (
    <View style={[
          styles.fakeInputContainer, 
          { 
            backgroundColor: colors.background,
      paddingBottom: Math.max(insets.bottom, 20) + 60
          }
        ]}>
          <TouchableOpacity
            style={[
              styles.inputWrapper, 
              { 
                backgroundColor: colors.primary + '30',
                borderColor: colors.primary + '60'
              }
            ]}
            onPress={() => {
              setIsInputFocused(true);
              setTimeout(() => realInputRef.current?.focus(), 100);
            }}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.fakeInputText, 
              { 
                color: inputText ? colors.primary : colors.primary + '70'
              }
            ]}>
              {inputText || 'Ihre Frage an LuxAI...'}
            </Text>
            <View style={[
              styles.sendButton,
              { 
                backgroundColor: inputText.trim() ? colors.primary : colors.primary + '40',
                opacity: isLoading ? 0.5 : 1
              }
            ]}>
              <Ionicons 
                name="send" 
                size={normalize(16)} 
                color={inputText.trim() ? colors.white : colors.primary}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Real Input - Above keyboard when focused */}
      {isInputFocused && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={[
            styles.realInputContainer, 
            { 
              backgroundColor: colors.background,
              paddingBottom: Platform.OS === 'ios' ? 20 : 10
            }
          ]}>
            <View style={[
              styles.inputWrapper, 
              { 
                backgroundColor: colors.primary + '30',
                borderColor: colors.primary + '60'
              }
            ]}>
              <TextInput
                ref={realInputRef}
                style={[
                  styles.textInput,
                  { 
                    color: colors.primary,
                    height: Math.max(40, Math.min(120, inputHeight))
                  }
                ]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ihre Frage an LuxAI..."
                placeholderTextColor={colors.primary + '70'}
                multiline={true}
                onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                onBlur={() => setIsInputFocused(false)}
                blurOnSubmit={false}
                autoFocus={true}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { 
                    backgroundColor: inputText.trim() ? colors.primary : colors.primary + '40',
                    opacity: isLoading ? 0.5 : 1
                  }
                ]}
                onPress={sendMessage}
                disabled={isLoading || inputText.trim() === ''}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name="send" 
                  size={normalize(16)} 
                  color={inputText.trim() ? colors.white : colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBackground: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: normalize(22),
    fontFamily: 'Montserrat_700Bold',
    fontWeight: '700',
    textAlign: 'center',
  },
  chatList: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '85%',
  },
  botMessage: {
    alignSelf: 'flex-start',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  messageText: {
  fontSize: normalize(14.5),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(21),
  },
  quoteText: {
    fontFamily: 'Montserrat_700Bold',
  },
  bibleRef: {
    textDecorationLine: 'underline',
    borderBottomWidth: 0.5,
  },
  timestamp: {
    fontSize: normalize(11),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 4,
    alignSelf: 'flex-end',
    opacity: 0.7,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
  },
  fakeInputContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  realInputContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30, // Noch rundere Pillen-Form
    borderWidth: 1,
  paddingLeft: 18,
  paddingRight: 10, // weniger rechts, damit Button näher am Rand ist
    paddingVertical: 12, // Mehr Padding
  minHeight: 56, // wächst mit Inhalt
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    paddingVertical: 6, // Mehr Padding
    height: 40, // Noch größere Höhe
  },
  fakeInputText: {
    flex: 1,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    paddingVertical: 6,
    height: 40, // Gleiche Höhe wie echtes Input
    textAlignVertical: 'center',
  },
  sendButton: {
  width: normalize(40),
  height: normalize(40),
    borderRadius: normalize(20), // Proportional größer
    justifyContent: 'center',
    alignItems: 'center',
  marginLeft: 8, // näher zum rechten Rand
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

export default ChatScreen;

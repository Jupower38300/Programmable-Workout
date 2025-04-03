import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Animated,
  PanResponder,
  View,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CountdownCircleTimer } from "react-native-countdown-circle-timer";
import { Audio } from "expo-av";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

interface SequenceStep {
  type: "step";
  time: number;
  label?: string;
  id: string;
}

interface SequenceLoop {
  type: "loop";
  id: string;
  repetitions: number;
  children: LoopItem[];
  label?: string;
}

interface DraggablePanelProps {
  children: React.ReactNode;
}

type LoopItem = SequenceStep | SequenceLoop;

interface Sequence {
  id: string;
  name: string;
  description?: string;
  items: LoopItem[];
  createdAt: number;
}

// Panneau draggable pour la section "Programmation"
const DraggablePanel: React.FC<DraggablePanelProps> = ({ children }) => {
  const screenHeight = Dimensions.get("window").height;
  const COLLAPSED_HEIGHT = 40;
  const EXPANDED_HEIGHT = screenHeight * 0.7;
  const panelHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const [expanded, setExpanded] = useState(false);

  const togglePanel = () => {
    Animated.timing(panelHeight, {
      toValue: expanded ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      setExpanded(!expanded);
    });
  };

  return (
    <Animated.View style={[styles.draggablePanel, { height: panelHeight }]}>
      <TouchableOpacity onPress={togglePanel}>
        <View style={styles.dragHandle} />
      </TouchableOpacity>
      {expanded && children}
    </Animated.View>
  );
};

export default function HomeScreen() {
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [isTimerPlaying, setIsTimerPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [sequenceName, setSequenceName] = useState("");
  const [sequenceDescription, setSequenceDescription] = useState("");
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [items, setItems] = useState<LoopItem[]>([]);
  const [flattenedSequence, setFlattenedSequence] = useState<SequenceStep[]>(
    []
  );
  const [isLoopModalVisible, setIsLoopModalVisible] = useState(false);
  const [loopRepetitions, setLoopRepetitions] = useState("1");
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const textColor = useThemeColor({}, "text");
  const backgroundColor = useThemeColor({}, "background");
  const navigation = useNavigation();

  // Chargement du son
  const loadSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync(
        require("@/assets/sounds/beep.mp3"),
        { shouldPlay: false, volume: 1 }
      );
      soundRef.current = sound;
    } catch (error) {
      console.error("Erreur lors du chargement du son", error);
    }
  }, []);

  // Lecture du son
  const playBeep = useCallback(async () => {
    try {
      if (!soundRef.current) {
        await loadSound();
      }
      await soundRef.current?.setPositionAsync(0);
      await soundRef.current?.playAsync();
    } catch (error) {
      console.error("Erreur lors de la lecture du son", error);
    }
  }, [loadSound]);

  // Initialisation de l'audio
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        await loadSound();
      } catch (error) {
        console.error("Erreur lors de l'initialisation de l'audio", error);
      }
    };
    setupAudio();
    return () => {
      const cleanup = async () => {
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
      };
      cleanup();
    };
  }, [loadSound]);

  const resetTimer = useCallback(() => {
    setCurrentStepIndex(0);
    setIsTimerPlaying(false);
    setResetKey((prev) => prev + 1);
  }, []);

  const flattenSequence = useCallback((items: LoopItem[]): SequenceStep[] => {
    const result: SequenceStep[] = [];
    const processItems = (items: LoopItem[], repetitions: number = 1) => {
      for (let i = 0; i < repetitions; i++) {
        items.forEach((item) => {
          if (item.type === "step") {
            result.push(item);
          } else if (item.type === "loop") {
            processItems(item.children, item.repetitions);
          }
        });
      }
    };
    processItems(items);
    return result;
  }, []);

  useEffect(() => {
    setFlattenedSequence(flattenSequence(items));
  }, [items, flattenSequence]);

  const parentExists = useCallback(
    (items: LoopItem[], parentId: string): boolean => {
      for (const item of items) {
        if (item.id === parentId) return true;
        if (item.type === "loop" && parentExists(item.children, parentId))
          return true;
      }
      return false;
    },
    []
  );

  const addLoop = (repetitions: number) => {
    const newLoop: SequenceLoop = {
      type: "loop",
      id: Date.now().toString(),
      repetitions,
      children: [],
    };
    if (currentParentId && !parentExists(items, currentParentId)) {
      setItems((prev) => [...prev, newLoop]);
    } else {
      addStepToParent(currentParentId, newLoop);
    }
    setIsLoopModalVisible(false);
    setLoopRepetitions("1");
  };

  const addStepToParent = (parentId: string | null, item: LoopItem) => {
    if (!parentId) {
      setItems((prev) => [...prev, item]);
      return;
    }
    const updateItems = (items: LoopItem[]): LoopItem[] => {
      return items.map((i) => {
        if (i.id === parentId && i.type === "loop") {
          return { ...i, children: [...i.children, item] };
        }
        if (i.type === "loop") {
          return { ...i, children: updateItems(i.children) };
        }
        return i;
      });
    };
    setItems((prev) => updateItems(prev));
  };

  const addStep = () => {
    const mins = parseInt(minutes) || 0;
    const secs = parseInt(seconds) || 0;
    const totalTime = mins * 60 + secs;
    if (totalTime > 0) {
      const newStep: SequenceStep = {
        type: "step",
        time: totalTime,
        id: Date.now().toString(),
      };
      if (currentParentId && !parentExists(items, currentParentId)) {
        setItems((prev) => [...prev, newStep]);
      } else {
        addStepToParent(currentParentId, newStep);
      }
      setMinutes("");
      setSeconds("");
    }
  };

  const removeItem = (id: string) => {
    const removeFromItems = (items: LoopItem[]): LoopItem[] => {
      return items
        .filter((item) => item.id !== id)
        .map((item) => {
          if (item.type === "loop") {
            return { ...item, children: removeFromItems(item.children) };
          }
          return item;
        });
    };
    const newItems = removeFromItems(items);
    setItems(newItems);
    if (
      currentParentId === id ||
      (currentParentId && !parentExists(newItems, currentParentId))
    ) {
      setCurrentParentId(null);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  useFocusEffect(
    useCallback(() => {
      const loadSequence = async () => {
        try {
          const jsonValue = await AsyncStorage.getItem("@current_sequence");
          if (jsonValue) {
            const parsed = JSON.parse(jsonValue);
            if (Array.isArray(parsed.items)) {
              setItems(parsed.items);
            } else {
              setItems(
                parsed.map((step: any) => ({
                  type: "step",
                  ...step,
                }))
              );
            }
          }
        } catch (e) {
          Alert.alert("Erreur", "Impossible de charger la séquence");
        }
      };
      loadSequence();
    }, [])
  );

  const saveCurrentSequence = async () => {
    try {
      const sequenceToSave: Sequence = {
        id: Date.now().toString(),
        name: "Current Sequence",
        items,
        createdAt: Date.now(),
      };
      await AsyncStorage.setItem(
        "@current_sequence",
        JSON.stringify(sequenceToSave)
      );
    } catch (e) {
      console.error("Failed to save current sequence", e);
    }
  };

  const showSaveModal = () => {
    if (items.length === 0) {
      Alert.alert("Erreur", "Impossible de sauvegarder une séquence vide");
      return;
    }
    setIsSaveModalVisible(true);
  };

  const saveSequenceToLibrary = async () => {
    try {
      const existingData = await AsyncStorage.getItem("savedSequences");
      let savedSequences: Sequence[] = existingData
        ? JSON.parse(existingData)
        : [];
      const newSequence: Sequence = {
        id: Date.now().toString(),
        name: sequenceName || `Séquence ${savedSequences.length + 1}`,
        description: sequenceDescription,
        items,
        createdAt: Date.now(),
      };
      savedSequences.push(newSequence);
      await AsyncStorage.setItem(
        "savedSequences",
        JSON.stringify(savedSequences)
      );
      await saveCurrentSequence();
      Alert.alert("Succès", "Séquence sauvegardée dans la bibliothèque !");
      setIsSaveModalVisible(false);
      setSequenceName("");
      setSequenceDescription("");
    } catch (e) {
      Alert.alert("Erreur", "Échec de la sauvegarde");
    }
  };

  const startSequence = async () => {
    if (flattenedSequence.length === 0) return;
    setCurrentStepIndex(0);
    setIsTimerPlaying(true);
    await playBeep();
  };

  const handleComplete = (totalElapsedTime: number) => {
    if (currentStepIndex < flattenedSequence.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      playBeep();
      return { shouldRepeat: true, delay: 0 };
    }
    resetTimer();
    return { shouldRepeat: false };
  };

  const navigateToSavedSequences = () => {
    navigation.navigate("explore" as never);
  };

  const openLoopModal = () => {
    if (currentParentId && !parentExists(items, currentParentId)) {
      setCurrentParentId(null);
    }
    setIsLoopModalVisible(true);
  };

  const RenderLoopItem = ({
    item,
    level = 0,
  }: {
    item: LoopItem;
    level?: number;
  }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    return (
      <ThemedView style={[styles.loopItem, { marginLeft: level * 20 }]}>
        {item.type === "loop" ? (
          <>
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={styles.loopHeader}
            >
              <ThemedText type="defaultSemiBold">
                {isExpanded ? "▼" : "▶"} Boucle ×{item.repetitions}
              </ThemedText>
              <TouchableOpacity onPress={() => removeItem(item.id)}>
                <ThemedText style={styles.deleteText}>×</ThemedText>
              </TouchableOpacity>
            </TouchableOpacity>
            {isExpanded && (
              <ThemedView style={styles.loopChildren}>
                {item.children.map((child) => (
                  <RenderLoopItem
                    key={child.id}
                    item={child}
                    level={level + 1}
                  />
                ))}
                <TouchableOpacity
                  style={[styles.addToLoopButton, { borderColor: textColor }]}
                  onPress={() => setCurrentParentId(item.id)}
                >
                  <ThemedText>+ Ajouter à cette boucle</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </>
        ) : (
          <ThemedView style={styles.stepItem}>
            <ThemedText>Étape: {formatTime(item.time)}</ThemedText>
            <TouchableOpacity onPress={() => removeItem(item.id)}>
              <ThemedText style={styles.deleteText}>×</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )}
      </ThemedView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {/* Contenu principal avec le timer */}
      <View style={styles.mainContainer}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Timer */}
          <View style={styles.timerWrapper}>
            <CountdownCircleTimer
              key={`${resetKey}-${currentStepIndex}`}
              isPlaying={isTimerPlaying}
              duration={flattenedSequence[currentStepIndex]?.time || 10}
              colors={["#c74a4a", "#1E88E5", "#00C853"]} // Dégradé violet -> bleu -> vert
              trailColor="#404040"
              colorsTime={[0, 0.5, 1]}
              onComplete={handleComplete}
              size={320}
              strokeWidth={15}
              strokeLinecap="round" // Ajout d'un arrondi aux extrémités
            >
              {({ remainingTime }) => (
                <View style={styles.timerTextContainer}>
                  <ThemedText
                    style={[styles.timerText, { color: textColor }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    {flattenedSequence.length > 0
                      ? formatTime(remainingTime)
                      : "--:--"}
                  </ThemedText>
                </View>
              )}
            </CountdownCircleTimer>
          </View>
          {/* Boutons de contrôle */}
          <ThemedView style={styles.buttonGroup}>
            <View style={styles.topButtons}>
              <TouchableOpacity
                style={[
                  styles.button,
                  (!flattenedSequence.length || isTimerPlaying) &&
                    styles.disabledButton,
                ]}
                onPress={startSequence}
                disabled={!flattenedSequence.length || isTimerPlaying}
              >
                <ThemedText type="defaultSemiBold">Démarrer</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  (!flattenedSequence.length || !isTimerPlaying) &&
                    styles.disabledButton,
                ]}
                onPress={() => setIsTimerPlaying(false)}
                disabled={!flattenedSequence.length || !isTimerPlaying}
              >
                <ThemedText type="defaultSemiBold">Pause</ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                styles.resetButton,
                !flattenedSequence.length && styles.disabledButton,
              ]}
              onPress={resetTimer}
              disabled={!flattenedSequence.length}
            >
              <ThemedText type="defaultSemiBold">Reset</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ScrollView>
      </View>
      {/* Panneau draggable contenant la section "Programmation" */}
      <DraggablePanel>
        <ScrollView style={styles.sequenceEditorContainer}>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Programmation
            </ThemedText>
            <TouchableOpacity
              style={styles.libraryButton}
              onPress={navigateToSavedSequences}
            >
              <ThemedText
                type="defaultSemiBold"
                style={styles.libraryButtonText}
              >
                Mes séquences
              </ThemedText>
            </TouchableOpacity>
          </View>
          <View style={styles.inputContainer}>
            <View style={styles.timeInputContainer}>
              <TextInput
                style={[
                  styles.timeInput,
                  { color: textColor, borderColor: textColor },
                ]}
                placeholder="Min"
                placeholderTextColor={textColor}
                keyboardType="number-pad"
                value={minutes}
                onChangeText={(text) => setMinutes(text.replace(/[^0-9]/g, ""))}
                maxLength={2}
              />
              <ThemedText type="defaultSemiBold">:</ThemedText>
              <TextInput
                style={[
                  styles.timeInput,
                  { color: textColor, borderColor: textColor },
                ]}
                placeholder="Sec"
                placeholderTextColor={textColor}
                keyboardType="number-pad"
                value={seconds}
                onChangeText={(text) => setSeconds(text.replace(/[^0-9]/g, ""))}
                maxLength={2}
              />
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: textColor }]}
              onPress={addStep}
            >
              <ThemedText
                type="defaultSemiBold"
                style={{ color: backgroundColor }}
              >
                Ajouter
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: textColor }]}
              onPress={showSaveModal}
              disabled={items.length === 0}
            >
              <ThemedText
                type="defaultSemiBold"
                style={{ color: backgroundColor }}
              >
                Sauvegarder
              </ThemedText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.addLoopButton, { borderColor: textColor }]}
            onPress={openLoopModal}
          >
            <ThemedText>+ Ajouter une boucle</ThemedText>
          </TouchableOpacity>
          <ScrollView
            style={styles.stepsList}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled={true}
          >
            {items.map((item) => (
              <RenderLoopItem key={item.id} item={item} />
            ))}
            {items.length === 0 && (
              <ThemedText style={styles.emptyMessage}>
                Ajoutez des étapes ou des boucles pour créer votre séquence
              </ThemedText>
            )}
          </ScrollView>
        </ScrollView>
      </DraggablePanel>

      {/* Modal de sauvegarde de la séquence */}
      <Modal
        visible={isSaveModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsSaveModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor }]}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Sauvegarder la séquence
            </ThemedText>
            <TextInput
              style={[
                styles.modalInput,
                { color: textColor, borderColor: textColor },
              ]}
              placeholder="Nom de la séquence"
              placeholderTextColor={textColor}
              value={sequenceName}
              onChangeText={setSequenceName}
            />
            <TextInput
              style={[
                styles.modalInput,
                { color: textColor, borderColor: textColor },
              ]}
              placeholder="Description (optionnel)"
              placeholderTextColor={textColor}
              value={sequenceDescription}
              onChangeText={setSequenceDescription}
              multiline={true}
              numberOfLines={3}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsSaveModalVisible(false)}
              >
                <ThemedText type="defaultSemiBold">Annuler</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveModalButton,
                  { backgroundColor: textColor },
                ]}
                onPress={saveSequenceToLibrary}
              >
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: backgroundColor }}
                >
                  Sauvegarder
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Modal pour le nombre de répétitions de boucle */}
      <Modal
        visible={isLoopModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsLoopModalVisible(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor }]}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Nombre de répétitions
            </ThemedText>
            <TextInput
              style={[
                styles.modalInput,
                { color: textColor, borderColor: textColor },
              ]}
              placeholder="Nombre de répétitions"
              placeholderTextColor={textColor}
              keyboardType="number-pad"
              value={loopRepetitions}
              onChangeText={(text) =>
                setLoopRepetitions(text.replace(/[^0-9]/g, ""))
              }
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsLoopModalVisible(false)}
              >
                <ThemedText type="defaultSemiBold">Annuler</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveModalButton,
                  { backgroundColor: textColor },
                ]}
                onPress={() => addLoop(parseInt(loopRepetitions) || 1)}
              >
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: backgroundColor }}
                >
                  Créer
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    justifyContent: "center",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  timerWrapper: {
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  timerTextContainer: {
    width: 250, // Largeur fixe
    height: 100, // Hauteur ajustée
    justifyContent: "center",
    alignItems: "center",
  },
  timerText: {
    fontSize: 54, // Taille réduite
    lineHeight: 54, // Évite l'espace vertical
    includeFontPadding: false,
    textAlignVertical: "center",
    fontWeight: "bold",
  },
  buttonGroup: {
    marginTop: 30,
    alignItems: "center",
    width: "100%",
  },
  topButtons: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 15,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 35,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    minWidth: 120,
    alignItems: "center",
  },
  resetButton: {
    width: "60%",
    backgroundColor: "rgba(151, 34, 34, 0.82)",
  },
  disabledButton: {
    opacity: 0.5,
  },
  draggablePanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
    backgroundColor: "#000",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  dragHandle: {
    width: 50,
    height: 5,
    backgroundColor: "#ccc",
    borderRadius: 2.5,
    alignSelf: "center",
    marginVertical: 8,
  },
  scrollContent: {
    paddingBottom: 50,
    minHeight: "100%",
  },
  timerContainer: {
    alignItems: "center",
    marginVertical: 20,
    paddingTop: 50,
  },
  sequenceEditorContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  stepsList: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
  },
  libraryButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#635dc7",
    marginRight: 10,
  },
  libraryButtonText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  timeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInput: {
    width: 60,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    textAlign: "center",
  },
  addButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addLoopButton: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  addToLoopButton: {
    padding: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
    alignItems: "center",
  },
  loopItem: {
    marginBottom: 8,
  },
  loopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: "#ffa742",
  },
  loopChildren: {
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#ffa742",
  },
  stepItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: "#4baaad",
  },
  deleteText: {
    fontSize: 24,
  },
  saveButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  emptyMessage: {
    textAlign: "center",
    padding: 16,
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "80%",
    padding: 20,
    borderRadius: 12,
    gap: 16,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    width: "100%",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#E0E0E0",
  },
  saveModalButton: {
    backgroundColor: "#A1CEDC",
  },
});

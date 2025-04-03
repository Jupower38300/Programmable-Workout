import {
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
  FlatList,
} from "react-native";
import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { LinearGradient } from "expo-linear-gradient";

type NavigationProps = {
  navigate: (screen: string) => void;
};

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

type LoopItem = SequenceStep | SequenceLoop;

interface Sequence {
  id: string;
  name: string;
  description?: string;
  items: LoopItem[];
  createdAt: number;
}

export default function TabTwoScreen() {
  const [savedSequences, setSavedSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigation = useNavigation<NavigationProps>();

  const loadSavedSequences = useCallback(async () => {
    try {
      setIsLoading(true);
      const sequencesData = await AsyncStorage.getItem("savedSequences");
      if (sequencesData) {
        const parsed = JSON.parse(sequencesData);
        const migrated = parsed.map((seq: any) => {
          if (seq.steps && !seq.items) {
            return {
              ...seq,
              items: seq.steps.map((step: any) => ({
                type: "step",
                time: step.time,
                label: step.label,
                id: step.id || Date.now().toString(),
              })),
              steps: undefined,
            };
          }
          return seq;
        });
        setSavedSequences(migrated);
      } else {
        setSavedSequences([]);
      }
    } catch (error) {
      console.error("Failed to load saved sequences:", error);
      Alert.alert("Erreur", "Échec du chargement des séquences sauvegardées");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedSequences();
    }, [loadSavedSequences])
  );

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  };

  const calculateTotalTime = (items: LoopItem[]): number => {
    return items.reduce((total, item) => {
      if (item.type === "step") {
        return total + (item as SequenceStep).time;
      } else if (item.type === "loop") {
        const loop = item as SequenceLoop;
        return total + calculateTotalTime(loop.children) * loop.repetitions;
      }
      return total;
    }, 0);
  };

  const handleDeleteSequence = async (id: string) => {
    try {
      Alert.alert(
        "Confirmer la suppression",
        "Voulez-vous vraiment supprimer cette séquence ?",
        [
          {
            text: "Annuler",
            style: "cancel",
          },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              const updatedSequences = savedSequences.filter(
                (sequence) => sequence.id !== id
              );
              setSavedSequences(updatedSequences);
              await AsyncStorage.setItem(
                "savedSequences",
                JSON.stringify(updatedSequences)
              );
            },
          },
        ]
      );
    } catch (error) {
      console.error("Failed to delete sequence:", error);
      Alert.alert("Erreur", "Échec de la suppression de la séquence");
    }
  };

  const handleLoadSequence = async (sequence: Sequence) => {
    try {
      await AsyncStorage.setItem("@current_sequence", JSON.stringify(sequence));
      navigation.navigate("index");
    } catch (error) {
      console.error("Failed to load sequence:", error);
      Alert.alert("Erreur", "Échec du chargement de la séquence");
    }
  };

  const renderSequenceItem = ({ item }: { item: Sequence }) => (
    <ThemedView style={styles.sequenceCard}>
      <View style={styles.cardHeader}>
        <ThemedText type="defaultSemiBold" style={styles.sequenceName}>
          {item.name || `Séquence ${item.id.slice(0, 4)}`}
        </ThemedText>
        <ThemedText style={styles.sequenceTime}>
          {formatTime(calculateTotalTime(item.items))}
        </ThemedText>
      </View>

      {item.description && (
        <ThemedText style={styles.sequenceDescription}>
          {item.description}
        </ThemedText>
      )}

      <ThemedText style={styles.sequenceDate}>
        Créée le: {new Date(item.createdAt).toLocaleDateString()}
      </ThemedText>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleLoadSequence(item)}
        >
          <LinearGradient
            colors={["#4c669f", "#3b5998", "#192f6a"]}
            style={styles.gradientButton}
          >
            <IconSymbol name="play.fill" size={16} color="white" />
            <ThemedText style={styles.actionButtonText}>Charger</ThemedText>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteSequence(item.id)}
        >
          <IconSymbol name="trash" size={16} color="white" />
          <ThemedText style={styles.deleteButtonText}>Supprimer</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#242424", "#333333"]} style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          Mes Séquences
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          {savedSequences.length} séquence
          {savedSequences.length !== 1 ? "s" : ""} sauvegardée
          {savedSequences.length !== 1 ? "s" : ""}
        </ThemedText>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>
            Chargement en cours...
          </ThemedText>
        </View>
      ) : savedSequences.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="bookmark.slash" size={48} color="#888" />
          <ThemedText style={styles.emptyText}>
            Aucune séquence sauvegardée
          </ThemedText>
          <ThemedText style={styles.emptySubtext}>
            Créez des séquences depuis l'écran d'accueil
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={savedSequences}
          renderItem={renderSequenceItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  header: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  headerTitle: {
    fontSize: 28,
    marginBottom: 4,
    color: "white",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "white",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#4a5568",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: "#4a5568",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sequenceCard: {
    backgroundColor: "#000000",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sequenceName: {
    fontSize: 22,
    color: "white",
    flex: 1,
  },
  sequenceTime: {
    fontSize: 16,
    color: "#fff9",
    fontWeight: "600",
  },
  sequenceDescription: {
    fontSize: 14,
    color: "#fff7",
    marginBottom: 8,
    fontStyle: "italic",
  },
  sequenceDate: {
    fontSize: 12,
    color: "#fff4",
    marginBottom: 12,
    marginTop: -10,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },

  actionButton: {},
  actionButtonText: {
    color: "white",
    fontWeight: "500",
    marginRight: 4,
    marginTop: -2,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(151, 34, 34, 0.82)",
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "500",
    marginRight: 4,
    marginTop: -2,
  },
});

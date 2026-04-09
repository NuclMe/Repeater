import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreenWeb() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Repeater is mobile-only</Text>
        <Text style={styles.body}>
          This screen uses native microphone and Rive runtime. Run on Android/iOS to test the Talking
          Tom behavior.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#0C0F14',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#141A22',
  },
  title: {
    color: '#F4F6F9',
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    marginTop: 12,
    color: '#B7C2D0',
    fontSize: 15,
    lineHeight: 22,
  },
});

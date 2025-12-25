import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { rf, rp } from '@/utils/responsive';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.text}>This screen doesn&#39;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rp(20),
  },
  text: {
    fontSize: rf(20),
    fontWeight: 600,
  },
  link: {
    marginTop: rp(15),
    paddingVertical: rp(15),
  },
});

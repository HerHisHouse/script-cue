import { Stack } from 'expo-router';

export default function MemoryLayout() {
    return (
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="active" />
            <Stack.Screen name="ghost" />
            <Stack.Screen name="echo" />
            <Stack.Screen name="call-repeat" />
            <Stack.Screen name="quiz" />
            <Stack.Screen name="reinforcement" />
        </Stack>
    );
}

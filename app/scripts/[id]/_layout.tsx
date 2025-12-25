import { Stack } from 'expo-router';

export default function ScriptLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
            }}
        />
    );
}

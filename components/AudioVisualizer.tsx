import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing, cancelAnimation } from 'react-native-reanimated';

interface AudioVisualizerProps {
    isPlaying: boolean;
    barCount?: number;
    color?: string;
    height?: number;
}

const Bar = ({ isPlaying, index, total, color, height }: { isPlaying: boolean; index: number; total: number; color: string; height: number }) => {
    const animatedHeight = useSharedValue(10);

    useEffect(() => {
        if (isPlaying) {
            // Randomize animation for each bar to create a visualizer effect
            const duration = 300 + Math.random() * 400;
            const targetHeight = 15 + Math.random() * (height - 15);

            animatedHeight.value = withRepeat(
                withSequence(
                    withTiming(targetHeight, { duration, easing: Easing.linear }),
                    withTiming(10, { duration, easing: Easing.linear })
                ),
                -1,
                true
            );
        } else {
            cancelAnimation(animatedHeight);
            animatedHeight.value = withTiming(5, { duration: 300 });
        }
    }, [isPlaying, height]);

    const style = useAnimatedStyle(() => ({
        height: animatedHeight.value,
        backgroundColor: color,
        flex: 1,
        borderRadius: 2,
        marginHorizontal: 1,
        opacity: 0.8,
    }));

    return <Animated.View style={style} />;
};

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    isPlaying,
    barCount = 20,
    color = '#3B82F6',
    height = 60
}) => {
    return (
        <View style={[styles.container, { height }]}>
            {Array.from({ length: barCount }).map((_, i) => (
                <Bar
                    key={i}
                    isPlaying={isPlaying}
                    index={i}
                    total={barCount}
                    color={color}
                    height={height}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        width: '100%',
    },
});

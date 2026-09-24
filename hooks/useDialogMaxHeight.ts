import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rp } from '@/utils/responsive';

/**
 * Altura máxima para un diálogo/alerta centrado: la pantalla menos el área segura y el margen
 * del overlay. Se aplica como `maxHeight` a la caja del diálogo y su contenido va dentro de un
 * ScrollView (`flexGrow: 0, flexShrink: 1`): si cabe no cambia nada, y si no cabe (sobre todo en
 * horizontal) se puede hacer scroll para llegar a los botones. Se recalcula al girar la pantalla.
 */
export function useDialogMaxHeight(verticalMargin: number = rp(20)): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return Math.max(0, height - insets.top - insets.bottom - verticalMargin * 2);
}

/** Estilo del ScrollView que envuelve el contenido del diálogo (ver useDialogMaxHeight). */
export const dialogScrollStyle = { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' } as const;

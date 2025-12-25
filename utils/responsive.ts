import { widthPercentageToDP as wp, heightPercentageToDP as hp, widthPercentageToDP } from 'react-native-responsive-screen';
import { Dimensions } from 'react-native';

// Obtener dimensiones de pantalla
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Base de diseño (iPhone X/11/12/13)
const BASE_WIDTH = 375;

/**
 * Factor de escala basado en el ancho de pantalla
 * Para pantallas más pequeñas (como Android), escala más agresivamente
 */
const getScaleFactor = () => {
  // Si la pantalla es más pequeña que la base, escalar más
  if (SCREEN_WIDTH < BASE_WIDTH) {
    return SCREEN_WIDTH / BASE_WIDTH;
  }
  // Si es más grande, escalar normalmente
  return 1;
};

const SCALE_FACTOR = getScaleFactor();

/**
 * Responsive Width
 * Convierte píxeles a porcentaje del ancho de pantalla
 * Base: 375px (iPhone X/11/12/13 estándar)
 * 
 * @param pixels - Valor en píxeles basado en diseño de 375px de ancho
 * @returns Porcentaje del ancho de pantalla
 * 
 * @example
 * rw(16) // En iPhone SE = ~4.3%, en Samsung Galaxy A5 = más pequeño
 */
export const rw = (pixels: number): number => {
  return wp((pixels / BASE_WIDTH) * 100);
};

/**
 * Responsive Height
 * Convierte píxeles a porcentaje del alto de pantalla
 * Base: 812px (iPhone X/11/12/13 estándar)
 * 
 * @param pixels - Valor en píxeles basado en diseño de 812px de alto
 * @returns Porcentaje del alto de pantalla
 * 
 * @example
 * rh(20) // En iPhone SE = ~3%, en Samsung Galaxy A5 = ajustado
 */
export const rh = (pixels: number): number => {
  return hp((pixels / 812) * 100);
};

/**
 * Responsive Font Size
 * Tamaño de fuente responsive basado en ancho de pantalla
 * Escala más agresivamente en pantallas pequeñas
 * 
 * @param pixels - Tamaño de fuente en píxeles
 * @returns Tamaño de fuente escalado
 * 
 * @example
 * rf(16) // En Samsung Galaxy A5 será más pequeño que en iPhone
 */
export const rf = (pixels: number): number => {
  const scaledSize = pixels * SCALE_FACTOR;
  return Math.round(scaledSize * 10) / 10; // Redondear a 1 decimal
};

/**
 * Responsive Padding/Margin
 * Padding o margin responsive basado en ancho de pantalla
 * Escala más agresivamente en pantallas pequeñas
 * 
 * @param pixels - Valor de padding/margin en píxeles
 * @returns Padding/margin escalado
 * 
 * @example
 * rp(16) // En Samsung Galaxy A5 será más pequeño que en iPhone
 */
export const rp = (pixels: number): number => {
  const scaledSize = pixels * SCALE_FACTOR;
  return Math.round(scaledSize * 10) / 10; // Redondear a 1 decimal
};

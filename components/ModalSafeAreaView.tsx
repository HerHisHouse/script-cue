import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, Edge } from 'react-native-safe-area-context';

/**
 * Zona segura para el contenido de un <Modal> a pantalla completa.
 *
 * Un <SafeAreaView> dentro de un Modal mide sus márgenes en nativo y, en iOS, la primera vez
 * que se abre el Modal a veces mide 0 arriba (aún no está en la ventana): el contenido subía
 * hasta la barra de estado y solo se colocaba bien al cerrarlo y abrirlo otra vez. El margen
 * superior de una pantalla completa es el mismo que el de la app, así que se toma del
 * proveedor (useSafeAreaInsets) en vez de medirlo. Los demás bordes se siguen midiendo en
 * nativo, como pide CLAUDE.md para el inferior en Android.
 */
export function ModalSafeAreaView({
  edges = ['top', 'right', 'bottom', 'left'],
  style,
  children,
}: {
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const otherEdges = edges.filter((edge) => edge !== 'top');
  return (
    <View style={[{ flex: 1 }, style, { paddingTop: edges.includes('top') ? insets.top : 0 }]}>
      <SafeAreaView edges={otherEdges} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </View>
  );
}

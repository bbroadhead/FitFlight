import React from 'react';
import { View, type ViewProps } from 'react-native';

export function PageContainer({
  children,
  maxWidth = 1180,
  style,
  ...props
}: ViewProps & { maxWidth?: number }) {
  return (
    <View
      {...props}
      style={[
        {
          width: '100%',
          maxWidth,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

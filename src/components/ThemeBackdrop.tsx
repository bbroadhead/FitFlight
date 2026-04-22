import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

const STAR_POINTS = [
  { top: '8%', left: '10%', size: 2.5, opacity: 0.9 },
  { top: '12%', left: '26%', size: 1.5, opacity: 0.55 },
  { top: '18%', left: '76%', size: 2, opacity: 0.82 },
  { top: '24%', left: '58%', size: 1.25, opacity: 0.48 },
  { top: '31%', left: '14%', size: 1.5, opacity: 0.7 },
  { top: '36%', left: '90%', size: 2.25, opacity: 0.74 },
  { top: '44%', left: '33%', size: 1.25, opacity: 0.52 },
  { top: '49%', left: '70%', size: 1.75, opacity: 0.68 },
  { top: '57%', left: '20%', size: 2.2, opacity: 0.88 },
  { top: '63%', left: '84%', size: 1.5, opacity: 0.6 },
  { top: '68%', left: '48%', size: 1.2, opacity: 0.46 },
  { top: '76%', left: '8%', size: 1.8, opacity: 0.8 },
  { top: '82%', left: '61%', size: 1.4, opacity: 0.58 },
  { top: '88%', left: '40%', size: 2, opacity: 0.76 },
  { top: '91%', left: '93%', size: 1.2, opacity: 0.5 },
];

export function ThemeBackdrop() {
  const theme = useAppTheme();

  if (theme.id !== 'space' && theme.id !== 'flowery' && theme.id !== 'cyber' && theme.id !== 'pixel') {
    return null;
  }

  if (theme.id === 'pixel') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View
            key={`pixel-row-${row}`}
            style={{
              position: 'absolute',
              top: `${row * 18}%`,
              left: 0,
              right: 0,
              height: '16%',
              backgroundColor: row % 2 === 0 ? 'rgba(16,21,28,0.22)' : 'rgba(48,53,64,0.16)',
            }}
          />
        ))}
        {[
          { top: '9%', left: '10%' },
          { top: '22%', left: '72%' },
          { top: '36%', left: '18%' },
          { top: '57%', left: '82%' },
          { top: '74%', left: '44%' },
        ].map((spark, index) => (
          <View
            key={`pixel-spark-${index}`}
            style={{
              position: 'absolute',
              top: spark.top as `${number}%`,
              left: spark.left as `${number}%`,
              width: 24,
              height: 24,
              opacity: 0.22,
            }}
          >
            <View style={{ position: 'absolute', left: 10, top: 0, width: 4, height: 24, backgroundColor: 'rgba(119,230,225,0.58)' }} />
            <View style={{ position: 'absolute', left: 0, top: 10, width: 24, height: 4, backgroundColor: 'rgba(119,230,225,0.58)' }} />
          </View>
        ))}
        {[
          { top: '10%', left: '5%', width: 136, height: 112 },
          { top: '14%', right: '8%', width: 92, height: 92 },
          { bottom: '18%', left: '12%', width: 168, height: 106 },
          { bottom: '12%', right: '10%', width: 126, height: 114 },
        ].map((ruin, index) => (
          <View
            key={`pixel-ruin-${index}`}
            style={{
              position: 'absolute',
              top: ruin.top as `${number}%` | undefined,
              left: ruin.left as `${number}%` | undefined,
              right: ruin.right as `${number}%` | undefined,
              bottom: ruin.bottom as `${number}%` | undefined,
              width: ruin.width,
              height: ruin.height,
              borderWidth: 2,
              borderColor: 'rgba(120,130,143,0.24)',
              backgroundColor: 'rgba(42,46,57,0.18)',
            }}
          >
            <View style={{ position: 'absolute', inset: 6, borderWidth: 1, borderColor: 'rgba(160,174,188,0.10)' }} />
            <View style={{ position: 'absolute', top: 16, left: 14, width: 22, height: 2, backgroundColor: 'rgba(180,191,203,0.10)' }} />
            <View style={{ position: 'absolute', top: 30, right: 18, width: 16, height: 2, backgroundColor: 'rgba(180,191,203,0.08)' }} />
          </View>
        ))}
        {[
          { top: '18%', left: '24%' },
          { top: '30%', left: '52%' },
          { top: '46%', left: '80%' },
          { top: '68%', left: '30%' },
          { top: '79%', left: '66%' },
          { top: '83%', left: '10%' },
        ].map((flame, index) => (
          <View
            key={`pixel-flame-${index}`}
            style={{
              position: 'absolute',
              top: flame.top as `${number}%`,
              left: flame.left as `${number}%`,
              width: 12,
              height: 12,
              backgroundColor: 'rgba(119,230,225,0.26)',
              borderWidth: 1,
              borderColor: 'rgba(119,230,225,0.40)',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: -12,
                left: 0,
                width: 10,
                height: 18,
                backgroundColor: 'rgba(119,230,225,0.14)',
              }}
            />
          </View>
        ))}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '27%',
            opacity: 0.38,
          }}
        >
          {Array.from({ length: 12 }).map((_, index) => (
            <View
              key={`pixel-floor-${index}`}
              style={{
                position: 'absolute',
                bottom: index % 2 === 0 ? 8 : 0,
                left: `${index * 8.4}%`,
                width: 78,
                height: index % 2 === 0 ? 54 : 48,
                backgroundColor: index % 2 === 0 ? 'rgba(92,99,112,0.22)' : 'rgba(70,76,89,0.18)',
                borderTopWidth: 2,
                borderColor: 'rgba(170,182,193,0.14)',
              }}
            >
              <View style={{ position: 'absolute', top: 10, left: 10, width: 14, height: 2, backgroundColor: 'rgba(198,208,219,0.10)' }} />
              <View style={{ position: 'absolute', top: 20, right: 12, width: 12, height: 2, backgroundColor: 'rgba(198,208,219,0.08)' }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (theme.id === 'cyber') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        {[12, 28, 44, 60, 76].map((top, index) => (
          <View
            key={`cyber-h-${index}`}
            style={{
              position: 'absolute',
              top: `${top}%`,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: index % 2 === 0 ? 'rgba(34,211,238,0.08)' : 'rgba(52,211,153,0.05)',
            }}
          />
        ))}
        {[10, 26, 42, 58, 74, 90].map((left, index) => (
          <View
            key={`cyber-v-${index}`}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: index % 2 === 0 ? 'rgba(34,211,238,0.06)' : 'rgba(52,211,153,0.04)',
            }}
          />
        ))}

        {[
          { top: '14%', left: '12%', width: 108, height: 52 },
          { top: '22%', right: '8%', width: 132, height: 64 },
          { top: '58%', left: '18%', width: 124, height: 58 },
          { bottom: '12%', right: '14%', width: 116, height: 54 },
        ].map((panel, index) => (
          <View
            key={`cyber-panel-${index}`}
            style={{
              position: 'absolute',
              top: panel.top as `${number}%` | undefined,
              left: panel.left as `${number}%` | undefined,
              right: panel.right as `${number}%` | undefined,
              bottom: panel.bottom as `${number}%` | undefined,
              width: panel.width,
              height: panel.height,
              borderWidth: 1,
              borderColor: 'rgba(34,211,238,0.14)',
              backgroundColor: 'rgba(34,211,238,0.03)',
            }}
          >
            <View style={{ position: 'absolute', left: -1, top: 10, width: 14, height: 1, backgroundColor: 'rgba(34,211,238,0.28)' }} />
            <View style={{ position: 'absolute', right: -1, bottom: 12, width: 18, height: 1, backgroundColor: 'rgba(52,211,153,0.22)' }} />
            <View style={{ position: 'absolute', left: 18, top: -1, width: 1, height: 14, backgroundColor: 'rgba(34,211,238,0.28)' }} />
            <View style={{ position: 'absolute', right: 16, bottom: -1, width: 1, height: 14, backgroundColor: 'rgba(52,211,153,0.22)' }} />
          </View>
        ))}

        {[
          { top: '16%', left: '12%', width: 64 },
          { top: '24%', right: '20%', width: 92 },
          { top: '61%', left: '28%', width: 74 },
          { bottom: '18%', right: '18%', width: 86 },
        ].map((trace, index) => (
          <View
            key={`cyber-trace-${index}`}
            style={{
              position: 'absolute',
              top: trace.top as `${number}%` | undefined,
              left: trace.left as `${number}%` | undefined,
              right: trace.right as `${number}%` | undefined,
              bottom: trace.bottom as `${number}%` | undefined,
              width: trace.width,
              height: 1,
              backgroundColor: 'rgba(34,211,238,0.22)',
            }}
          />
        ))}

        {[
          { top: '18%', left: '22%' },
          { top: '35%', left: '68%' },
          { top: '62%', left: '33%' },
          { top: '78%', left: '80%' },
        ].map((node, index) => (
          <View
            key={`cyber-node-${index}`}
            style={{
              position: 'absolute',
              top: node.top as `${number}%`,
              left: node.left as `${number}%`,
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: index % 2 === 0 ? 'rgba(34,211,238,0.78)' : 'rgba(52,211,153,0.72)',
              shadowColor: index % 2 === 0 ? '#22D3EE' : '#34D399',
              shadowOpacity: 0.55,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        ))}
      </View>
    );
  }

  if (theme.id === 'flowery') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        {[
          { top: '10%', left: '8%', size: 72, color: 'rgba(244,114,182,0.10)' },
          { top: '22%', right: '10%', size: 58, color: 'rgba(249,168,212,0.11)' },
          { top: '56%', left: '14%', size: 64, color: 'rgba(253,186,116,0.10)' },
          { bottom: '12%', right: '12%', size: 84, color: 'rgba(244,114,182,0.12)' },
        ].map((bloom, index) => (
          <View
            key={`bloom-${index}`}
            style={{
              position: 'absolute',
              top: bloom.top as `${number}%` | undefined,
              left: bloom.left as `${number}%` | undefined,
              right: bloom.right as `${number}%` | undefined,
              bottom: bloom.bottom as `${number}%` | undefined,
              width: bloom.size,
              height: bloom.size,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {[0, 60, 120, 180, 240, 300].map((rotation) => (
              <View
                key={`petal-${index}-${rotation}`}
                style={{
                  position: 'absolute',
                  width: bloom.size * 0.34,
                  height: bloom.size * 0.54,
                  borderRadius: 999,
                  backgroundColor: bloom.color,
                  transform: [{ rotate: `${rotation}deg` }, { translateY: -bloom.size * 0.18 }],
                }}
              />
            ))}
            <View
              style={{
                width: bloom.size * 0.18,
                height: bloom.size * 0.18,
                borderRadius: 999,
                backgroundColor: 'rgba(255,245,200,0.16)',
              }}
            />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {STAR_POINTS.map((star, index) => (
        <View
          key={`star-${index}`}
          style={{
            position: 'absolute',
            top: star.top as `${number}%`,
            left: star.left as `${number}%`,
            width: star.size,
            height: star.size,
            borderRadius: 999,
            backgroundColor: '#F8FAFF',
            opacity: star.opacity,
            shadowColor: '#FFFFFF',
            shadowOpacity: 0.55,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          top: '16%',
          right: '-12%',
          width: 220,
          height: 220,
          borderRadius: 999,
          backgroundColor: 'rgba(125,211,252,0.07)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: '-8%',
          left: '-6%',
          width: 260,
          height: 260,
          borderRadius: 999,
          backgroundColor: 'rgba(167,139,250,0.08)',
        }}
      />
    </View>
  );
}
